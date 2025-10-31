from __future__ import annotations

import base64
import logging
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .auth import get_current_token
from .config import get_settings, set_gpt5_api_key, set_email_settings
from .models import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    DualEvaluationResponse,
    EmailAttachment,
    EmailConfigStatus,
    EmailConfigUpdateRequest,
    EmailRequest,
    EmailResponse,
    EmailSettingsPublic,
    EvaluationRequest,
    GPT5KeyRequest,
    GPT5KeyStatus,
    ReportRequest,
    ReportResponse,
    SessionAudioUploadRequest,
    SessionAudioUploadResponse,
    SessionFinishRequest,
    SessionFinishResponse,
    SessionStartRequest,
    SessionStartResponse,
    TranscriptMetadata,
)
from .services.conversation import next_prompt
from .services.evaluation import evaluate_transcript
from .services.gpt5_client import clear_gpt5_client_cache
from .services.emailer import send_email
from .services.reporting import persist_report, resolve_report_token
from .services.audio import store_session_audio
from .services.session_store import get_store

app = FastAPI(title="Foreign Language Assessment API", version="0.1.0")
settings = get_settings()
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _resolve_frontend_dist() -> Path | None:
    """Return the path to the built frontend assets if they exist."""

    root_dir = Path(__file__).resolve().parent.parent.parent
    dist_dir = root_dir / "frontend" / "dist"
    return dist_dir if dist_dir.exists() else None




@app.get("/health", tags=["health"])
def health_check() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/session/start", response_model=SessionStartResponse, tags=["session"])
def start_session(payload: SessionStartRequest, _: str = Depends(get_current_token)) -> SessionStartResponse:
    store = get_store()
    if not payload.consent.granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Participant consent is required to start a session",
        )
    consent_timestamp = payload.consent.granted_at or datetime.utcnow()
    session = store.create_session(
        mode=payload.mode,
        duration_minutes=payload.duration_minutes,
        user_name=payload.user_name,
        user_email=payload.user_email,
        consent_granted=True,
        consent_granted_at=consent_timestamp,
    )
    greeting = next_prompt([], session=session)
    session.add_message(ChatMessage(role="assistant", content=greeting))
    return SessionStartResponse(
        session_id=session.session_id,
        started_at=session.started_at,
        assistant_greeting=greeting,
        mode=session.mode,
    )


@app.post("/api/chat", response_model=ChatResponse, tags=["chat"])
def chat(payload: ChatRequest, _: str = Depends(get_current_token)) -> ChatResponse:
    store = get_store()
    try:
        session = store.get(payload.session_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if not session.consent_granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Participant consent is required for this session",
        )

    user_message = ChatMessage(role="user", content=payload.user_message)
    session.add_message(user_message)
    assistant_reply = next_prompt(session.messages, session=session)
    session.add_message(ChatMessage(role="assistant", content=assistant_reply))
    turn_count = store.increment_turn(session.session_id)
    return ChatResponse(assistant_message=assistant_reply, turns_completed=turn_count, mode=session.mode)


@app.post("/api/session/audio", response_model=SessionAudioUploadResponse, tags=["session"])
def upload_session_audio(payload: SessionAudioUploadRequest, _: str = Depends(get_current_token)) -> SessionAudioUploadResponse:
    filename, stored_path = store_session_audio(payload)
    return SessionAudioUploadResponse(
        filename=filename,
        stored_path=str(stored_path),
        content_type="audio/mpeg",
    )


@app.post("/api/session/finish", response_model=SessionFinishResponse, tags=["session"])
def finish_session(payload: SessionFinishRequest, _: str = Depends(get_current_token)) -> SessionFinishResponse:
    store = get_store()
    try:
        session = store.get(payload.session_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if not session.consent_granted:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Participant consent is required for this session",
        )

    summary = "Conversation completed. Awaiting evaluation."
    response = SessionFinishResponse(
        session_id=session.session_id,
        summary=summary,
        word_count=session.word_count,
        duration_seconds=session.duration_seconds,
    )
    return response


@app.post("/api/evaluate", response_model=DualEvaluationResponse, tags=["evaluation"])
def evaluate(payload: EvaluationRequest, _: str = Depends(get_current_token)) -> DualEvaluationResponse:
    store = get_store()
    transcript: List[ChatMessage] = []
    metadata = payload.metadata or TranscriptMetadata()

    if payload.session_id:
        try:
            session = store.get(payload.session_id)
        except KeyError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        if not session.consent_granted:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Participant consent is required for this session",
            )
        transcript = session.messages
        metadata = metadata.model_copy(update={
            "started_at": metadata.started_at or session.started_at,
            "duration_sec": metadata.duration_sec or session.duration_seconds,
            "word_count": metadata.word_count or session.word_count,
            "turns": metadata.turns or len([m for m in session.messages if m.role == "user"]),
        })
    elif payload.transcript:
        transcript = payload.transcript
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide session_id or transcript")

    evaluation = evaluate_transcript(transcript, session_id=payload.session_id, metadata=metadata)
    return evaluation


@app.post("/api/report", response_model=ReportResponse, tags=["report"])
def generate_report(payload: ReportRequest, _: str = Depends(get_current_token)) -> ReportResponse:
    html, url = persist_report(payload.evaluation, session_metadata=payload.session_metadata)
    return ReportResponse(report_url=url, pdf_url=None, html=html)


@app.get("/api/reports/{token}", tags=["report"])
def download_report(token: str) -> FileResponse:
    try:
        record = resolve_report_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    if not record.path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return FileResponse(path=record.path, media_type="text/html", filename=record.filename)


@app.post("/api/email", response_model=EmailResponse, tags=["email"])
def send_report_email(payload: EmailRequest, _: str = Depends(get_current_token)) -> EmailResponse:
    attachments: List[EmailAttachment] = list(payload.attachments or [])

    if payload.session_id:
        store = get_store()
        try:
            session = store.get(payload.session_id)
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found") from exc

        audio_path = getattr(session, "audio_recording_path", None)
        if audio_path and Path(audio_path).exists():
            already_attached = {attachment.filename for attachment in attachments}
            if audio_path.name not in already_attached:
                try:
                    audio_bytes = Path(audio_path).read_bytes()
                    encoded = base64.b64encode(audio_bytes).decode("ascii")
                    attachments.append(
                        EmailAttachment(
                            filename=audio_path.name,
                            content_type="audio/mpeg",
                            data=encoded,
                        )
                    )
                except OSError as exc:  # pragma: no cover - filesystem error
                    logger.warning("Unable to attach audio recording for session %s: %s", session.session_id, exc)

    updated_payload = payload.model_copy(update={"attachments": attachments})
    return send_email(updated_payload)


@app.get("/api/config/email", response_model=EmailConfigStatus, tags=["config"])
def email_status(_: str = Depends(get_current_token)) -> EmailConfigStatus:
    settings_snapshot = get_settings()
    missing = settings_snapshot.email.missing_fields()
    public_settings = EmailSettingsPublic(
        provider=settings_snapshot.email.provider,
        smtp_host=settings_snapshot.email.smtp_host,
        smtp_port=settings_snapshot.email.smtp_port,
        smtp_username=settings_snapshot.email.smtp_username,
        default_sender=settings_snapshot.email.default_sender,
    )
    return EmailConfigStatus(
        configured=settings_snapshot.email.is_configured,
        missing_fields=missing,
        settings=public_settings,
        target_email=settings_snapshot.target_email,
    )


@app.post("/api/config/email", response_model=EmailConfigStatus, tags=["config"])
def configure_email(payload: EmailConfigUpdateRequest, _: str = Depends(get_current_token)) -> EmailConfigStatus:
    payload_data = payload.model_dump(exclude_unset=True)
    if not payload_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email settings provided")

    set_email_settings(**payload_data)
    settings_snapshot = get_settings()
    missing = settings_snapshot.email.missing_fields()
    public_settings = EmailSettingsPublic(
        provider=settings_snapshot.email.provider,
        smtp_host=settings_snapshot.email.smtp_host,
        smtp_port=settings_snapshot.email.smtp_port,
        smtp_username=settings_snapshot.email.smtp_username,
        default_sender=settings_snapshot.email.default_sender,
    )
    return EmailConfigStatus(
        configured=settings_snapshot.email.is_configured,
        missing_fields=missing,
        settings=public_settings,
        target_email=settings_snapshot.target_email,
    )


@app.get("/api/config/gpt5", response_model=GPT5KeyStatus, tags=["config"])
def gpt5_status(_: str = Depends(get_current_token)) -> GPT5KeyStatus:
    settings_snapshot = get_settings()
    return GPT5KeyStatus(configured=bool(settings_snapshot.gpt5_api_key))


@app.post("/api/config/gpt5", response_model=GPT5KeyStatus, tags=["config"])
def configure_gpt5(payload: GPT5KeyRequest, _: str = Depends(get_current_token)) -> GPT5KeyStatus:
    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="API key cannot be blank")
    set_gpt5_api_key(api_key)
    clear_gpt5_client_cache()
    settings_snapshot = get_settings()
    return GPT5KeyStatus(configured=bool(settings_snapshot.gpt5_api_key))


@app.on_event("startup")
def startup_event() -> None:
    # Preload settings to ensure env validation occurs early
    _ = settings


_frontend_dist = _resolve_frontend_dist()
if _frontend_dist:
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")
