from __future__ import annotations

import base64
import logging
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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
from .services.reporting import get_latest_report_for_session, persist_report, resolve_report_token
from .services.audio import store_session_audio
from .services.session_store import get_store

app = FastAPI(title="Foreign Language Assessment API", version="0.1.0")
settings = get_settings()
logger = logging.getLogger(__name__)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.trusted_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
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
    
    # Get the question plan for the session
    from .services.conversation import _load_question_pool, _select_questions, DEFAULT_STANDARD
    question_pool = _load_question_pool(session.standard_id or DEFAULT_STANDARD)
    questions = _select_questions(question_pool) if not session.question_plan else session.question_plan
    
    print(f"\n{'='*80}")
    print(f"[SESSION START] Session ID: {session.session_id}")
    print(f"[SESSION START] Questions loaded: {len(questions)}")
    for i, q in enumerate(questions, 1):
        print(f"  {i}. {q[:60]}...")
    print(f"{'='*80}\n")
    
    return SessionStartResponse(
        session_id=session.session_id,
        started_at=session.started_at,
        assistant_greeting=greeting,
        mode=session.mode,
        questions=questions,
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
    print(f"\n{'='*80}")
    print(f"[AUDIO UPLOAD] Uploading audio for session {payload.session_id}")
    print(f"[AUDIO UPLOAD] Audio MIME type: {payload.mime_type}")
    print(f"[AUDIO UPLOAD] Audio base64 length: {len(payload.audio_base64)} characters")
    print(f"{'='*80}")
    logger.info("Uploading audio for session %s", payload.session_id)
    filename, stored_path = store_session_audio(payload)
    print(f"[AUDIO UPLOAD] ✅ Audio successfully uploaded and stored!")
    print(f"[AUDIO UPLOAD] Filename: {filename}")
    print(f"[AUDIO UPLOAD] Path: {stored_path}")
    print(f"{'='*80}\n")
    logger.info("Audio successfully uploaded and stored at %s for session %s", stored_path, payload.session_id)
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

    print(f"\n{'='*80}")
    print(f"[EMAIL ENDPOINT] Preparing report email for {payload.to} (session_id={payload.session_id or 'n/a'})")
    print(f"{'='*80}")
    logger.info(
        "Preparing report email for %s (session_id=%s)",
        payload.to,
        payload.session_id or "n/a",
    )

    if payload.session_id:
        store = get_store()
        try:
            session = store.get(payload.session_id)
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found") from exc

        audio_path = getattr(session, "audio_recording_path", None)
        print(f"[EMAIL ATTACHMENT] Checking audio_recording_path: {audio_path}")
        if audio_path:
            print(f"[EMAIL ATTACHMENT] Audio recording path found for session {session.session_id}: {audio_path}")
            logger.info("Audio recording path found for session %s: %s", session.session_id, audio_path)
            if Path(audio_path).exists():
                print(f"[EMAIL ATTACHMENT] Audio file EXISTS at path: {audio_path}")
                file_size = Path(audio_path).stat().st_size
                print(f"[EMAIL ATTACHMENT] Audio file size: {file_size} bytes")
                already_attached = {attachment.filename for attachment in attachments}
                audio_filename = Path(audio_path).name
                print(f"[EMAIL ATTACHMENT] Audio filename: {audio_filename}")
                print(f"[EMAIL ATTACHMENT] Already attached files: {already_attached}")
                if audio_filename in already_attached:
                    print(f"[EMAIL ATTACHMENT] ⚠️ Audio recording {audio_filename} ALREADY ATTACHED")
                    logger.info(
                        "Audio recording %s already attached for session %s",
                        audio_filename,
                        session.session_id,
                    )
                else:
                    try:
                        print(f"[EMAIL ATTACHMENT] Reading audio file from disk...")
                        audio_bytes = Path(audio_path).read_bytes()
                        print(f"[EMAIL ATTACHMENT] Audio file read successfully: {len(audio_bytes)} bytes")
                        encoded = base64.b64encode(audio_bytes).decode("ascii")
                        print(f"[EMAIL ATTACHMENT] Audio encoded to base64: {len(encoded)} characters")
                        attachments.append(
                            EmailAttachment(
                                filename=audio_filename,
                                content_type="audio/mpeg",
                                data=encoded,
                            )
                        )
                        print(f"[EMAIL ATTACHMENT] ✅ SUCCESS! Audio recording {audio_filename} ATTACHED ({len(audio_bytes)} bytes)")
                        logger.info(
                            "Attached audio recording %s for session %s",
                            audio_filename,
                            session.session_id,
                        )
                    except OSError as exc:  # pragma: no cover - filesystem error
                        print(f"[EMAIL ATTACHMENT] ❌ ERROR! Unable to attach audio recording: {exc}")
                        logger.warning("Unable to attach audio recording for session %s: %s", session.session_id, exc)
            else:
                print(f"[EMAIL ATTACHMENT] ❌ ERROR! Audio recording path DOES NOT EXIST: {audio_path}")
                logger.warning(
                    "Audio recording path does not exist for session %s: %s",
                    session.session_id,
                    audio_path,
                )
        else:
            print(f"[EMAIL ATTACHMENT] ⚠️ No audio_recording_path found for session {session.session_id}")
            logger.info("No audio recording path found for session %s", session.session_id)

        report_record = get_latest_report_for_session(payload.session_id)
        if report_record and report_record.path.exists():
            already_attached = {attachment.filename for attachment in attachments}
            if report_record.filename in already_attached:
                logger.info(
                    "HTML report %s already attached for session %s",
                    report_record.filename,
                    payload.session_id,
                )
            else:
                try:
                    report_bytes = report_record.path.read_bytes()
                    encoded_report = base64.b64encode(report_bytes).decode("ascii")
                    attachments.append(
                        EmailAttachment(
                            filename=report_record.filename,
                            content_type="text/html",
                            data=encoded_report,
                        )
                    )
                    logger.info(
                        "Attached HTML report %s for session %s",
                        report_record.filename,
                        payload.session_id,
                    )
                except OSError as exc:  # pragma: no cover - filesystem error
                    logger.warning(
                        "Unable to attach HTML report for session %s: %s",
                        payload.session_id,
                        exc,
                    )
        else:
            logger.info(
                "No persisted report found to attach for session %s",
                payload.session_id,
            )

    updated_payload = payload.model_copy(update={"attachments": attachments})
    print(f"\n[EMAIL SEND] Total attachments to send: {len(attachments)}")
    for idx, att in enumerate(attachments):
        print(f"[EMAIL SEND]   Attachment {idx+1}: {att.filename} ({att.content_type}, {len(att.data)} chars base64)")
    print(f"[EMAIL SEND] Sending email to: {payload.to}")
    print(f"[EMAIL SEND] Subject: {payload.subject}")
    print(f"{'='*80}\n")
    logger.info("Sending report email with %d attachment(s)", len(attachments))
    return send_email(updated_payload)


@app.get("/api/config/email", response_model=EmailConfigStatus, tags=["config"])
def email_status(_: str = Depends(get_current_token)) -> EmailConfigStatus:
    settings_snapshot = get_settings()
    print(f"\n[EMAIL CONFIG] Current TARGET_EMAIL: {settings_snapshot.target_email}")
    print(f"[EMAIL CONFIG] Email configured: {settings_snapshot.email.is_configured}")
    logger.info(f"[Email Config] Current TARGET_EMAIL: {settings_snapshot.target_email}")
    logger.info(f"[Email Config] Email configured: {settings_snapshot.email.is_configured}")
    missing = settings_snapshot.email.missing_fields()

    # Check what's actually configured
    smtp_configured = settings_snapshot.email.is_smtp_configured
    sendgrid_configured = bool(settings_snapshot.email.sendgrid_api_key)

    # Generate diagnostic message
    diagnosis = []
    if not smtp_configured and not sendgrid_configured:
        diagnosis.append("⚠️ No email provider configured. Set up SMTP or SendGrid.")
    elif smtp_configured and not sendgrid_configured:
        diagnosis.append("⚠️ SMTP configured but cloud platforms often block SMTP ports. Configure SendGrid as fallback.")
    elif sendgrid_configured and not smtp_configured:
        diagnosis.append("✅ SendGrid configured. Emails will be sent via SendGrid.")
    else:
        diagnosis.append("✅ Both SMTP and SendGrid configured. SMTP will be tried first, SendGrid as fallback.")

    if sendgrid_configured and not settings_snapshot.email.default_sender:
        diagnosis.append("⚠️ SendGrid requires EMAIL_DEFAULT_SENDER to be set and verified in SendGrid.")

    public_settings = EmailSettingsPublic(
        provider=settings_snapshot.email.provider,
        smtp_host=settings_snapshot.email.smtp_host,
        smtp_port=settings_snapshot.email.smtp_port,
        smtp_username=settings_snapshot.email.smtp_username,
        default_sender=settings_snapshot.email.default_sender,
        sendgrid_configured=sendgrid_configured,
        smtp_configured=smtp_configured,
    )
    return EmailConfigStatus(
        configured=settings_snapshot.email.is_configured,
        missing_fields=missing,
        settings=public_settings,
        target_email=settings_snapshot.target_email,
        diagnosis=" ".join(diagnosis) if diagnosis else None,
    )


@app.post("/api/config/email", response_model=EmailConfigStatus, tags=["config"])
def configure_email(payload: EmailConfigUpdateRequest, _: str = Depends(get_current_token)) -> EmailConfigStatus:
    payload_data = payload.model_dump(exclude_unset=True)
    if not payload_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email settings provided")

    set_email_settings(**payload_data)
    settings_snapshot = get_settings()
    missing = settings_snapshot.email.missing_fields()

    # Check what's actually configured
    smtp_configured = settings_snapshot.email.is_smtp_configured
    sendgrid_configured = bool(settings_snapshot.email.sendgrid_api_key)

    # Generate diagnostic message
    diagnosis = []
    if not smtp_configured and not sendgrid_configured:
        diagnosis.append("⚠️ No email provider configured. Set up SMTP or SendGrid.")
    elif smtp_configured and not sendgrid_configured:
        diagnosis.append("⚠️ SMTP configured but cloud platforms often block SMTP ports. Configure SendGrid as fallback.")
    elif sendgrid_configured and not smtp_configured:
        diagnosis.append("✅ SendGrid configured. Emails will be sent via SendGrid.")
    else:
        diagnosis.append("✅ Both SMTP and SendGrid configured. SMTP will be tried first, SendGrid as fallback.")

    if sendgrid_configured and not settings_snapshot.email.default_sender:
        diagnosis.append("⚠️ SendGrid requires EMAIL_DEFAULT_SENDER to be set and verified in SendGrid.")

    public_settings = EmailSettingsPublic(
        provider=settings_snapshot.email.provider,
        smtp_host=settings_snapshot.email.smtp_host,
        smtp_port=settings_snapshot.email.smtp_port,
        smtp_username=settings_snapshot.email.smtp_username,
        default_sender=settings_snapshot.email.default_sender,
        sendgrid_configured=sendgrid_configured,
        smtp_configured=smtp_configured,
    )
    return EmailConfigStatus(
        configured=settings_snapshot.email.is_configured,
        missing_fields=missing,
        settings=public_settings,
        target_email=settings_snapshot.target_email,
        diagnosis=" ".join(diagnosis) if diagnosis else None,
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
