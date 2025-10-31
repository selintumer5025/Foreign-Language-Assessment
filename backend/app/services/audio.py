from __future__ import annotations

import base64
import binascii
import logging
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, status

import imageio_ffmpeg

from ..models import SessionAudioUploadRequest
from .session_store import get_store

logger = logging.getLogger(__name__)

AUDIO_DIR = Path("backend/protected_audio")
AUDIO_DIR.mkdir(parents=True, exist_ok=True)


def _decode_audio_payload(encoded: str) -> bytes:
    try:
        return base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:  # pragma: no cover - defensive
        logger.warning("Invalid audio payload received: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid audio payload") from exc


def _parse_report_date(raw: Optional[str]) -> datetime:
    if not raw:
        return datetime.utcnow()
    value = raw.strip()
    if not value:
        return datetime.utcnow()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        logger.warning("Invalid report date provided for audio upload: %s", raw)
        return datetime.utcnow()


def _sanitize_participant_name(name: Optional[str], fallback: str) -> str:
    if not name:
        return fallback
    normalized = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("- ")
    return normalized or fallback


def _extension_from_mime(mime_type: Optional[str]) -> str:
    if not mime_type:
        return ".bin"
    mime = mime_type.lower()
    if "webm" in mime:
        return ".webm"
    if "ogg" in mime:
        return ".ogg"
    if "wav" in mime:
        return ".wav"
    if "m4a" in mime or "mp4" in mime:
        return ".m4a"
    return ".bin"


def _ensure_mp3(audio_bytes: bytes, mime_type: Optional[str]) -> bytes:
    if mime_type and any(keyword in mime_type.lower() for keyword in ("mpeg", "mp3")):
        return audio_bytes

    try:
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover - network download/availability
        logger.error("Failed to obtain ffmpeg executable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Audio conversion service is unavailable",
        ) from exc

    suffix = _extension_from_mime(mime_type)
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as src_file:
        src_file.write(audio_bytes)
        src_file.flush()
        src_path = Path(src_file.name)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as dest_file:
        dest_path = Path(dest_file.name)

    try:
        command = [
            ffmpeg_path,
            "-y",
            "-i",
            str(src_path),
            "-vn",
            "-ar",
            "44100",
            "-ac",
            "1",
            "-b:a",
            "128k",
            str(dest_path),
        ]
        process = subprocess.run(command, capture_output=True, check=False)
        if process.returncode != 0:
            stderr = process.stderr.decode("utf-8", "ignore")
            logger.error("ffmpeg conversion failed: %s", stderr)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Failed to convert audio to mp3",
            )
        return dest_path.read_bytes()
    finally:
        try:
            src_path.unlink()
        except OSError:
            pass
        try:
            dest_path.unlink()
        except OSError:
            pass


def _build_filename(participant: Optional[str], session_id: str, report_date: datetime) -> str:
    base = _sanitize_participant_name(participant, fallback=session_id[:8])
    date_fragment = report_date.strftime("%Y%m%d")
    return f"{base}-{date_fragment}.mp3"


def store_session_audio(payload: SessionAudioUploadRequest) -> tuple[str, Path]:
    store = get_store()
    try:
        session = store.get(payload.session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found") from exc

    if not session.consent_granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Participant consent is required for this session",
        )

    raw_audio = _decode_audio_payload(payload.audio_base64)
    mp3_audio = _ensure_mp3(raw_audio, payload.mime_type)
    report_date = _parse_report_date(payload.report_date)
    filename = _build_filename(session.user_name, session.session_id, report_date)

    target_path = AUDIO_DIR / filename
    counter = 1
    while target_path.exists():
        target_path = AUDIO_DIR / f"{target_path.stem}-{counter}.mp3"
        counter += 1

    target_path.write_bytes(mp3_audio)
    session.audio_recording_path = target_path
    session.audio_recorded_at = report_date

    logger.info("Stored audio recording for session %s at %s", session.session_id, target_path)
    return filename, target_path
