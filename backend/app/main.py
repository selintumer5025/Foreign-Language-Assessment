from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import get_current_token
from .config import get_settings
from .models import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    EmailRequest,
    EmailResponse,
    EvaluationRequest,
    EvaluationResponse,
    ReportRequest,
    ReportResponse,
    SessionFinishRequest,
    SessionFinishResponse,
    SessionStartRequest,
    SessionStartResponse,
)
from .services.conversation import next_prompt
from .services.evaluation import evaluate_transcript
from .services.emailer import send_email
from .services.reporting import persist_report
from .services.session_store import get_store

app = FastAPI(title="Foreign Language Assessment API", version="0.1.0")
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health_check() -> dict:
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/session/start", response_model=SessionStartResponse, tags=["session"])
def start_session(payload: SessionStartRequest, _: str = Depends(get_current_token)) -> SessionStartResponse:
    store = get_store()
    session = store.create_session(mode=payload.mode, duration_minutes=payload.duration_minutes, user_name=payload.user_name)
    greeting = next_prompt([])
    session.add_message(ChatMessage(role="assistant", content=greeting))
    return SessionStartResponse(session_id=session.session_id, started_at=session.started_at, assistant_greeting=greeting)


@app.post("/api/chat", response_model=ChatResponse, tags=["chat"])
def chat(payload: ChatRequest, _: str = Depends(get_current_token)) -> ChatResponse:
    store = get_store()
    try:
        session = store.get(payload.session_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    user_message = ChatMessage(role="user", content=payload.user_message)
    session.add_message(user_message)
    assistant_reply = next_prompt(session.messages)
    session.add_message(ChatMessage(role="assistant", content=assistant_reply))
    turn_count = store.increment_turn(session.session_id)
    return ChatResponse(assistant_message=assistant_reply, turns_completed=turn_count)


@app.post("/api/session/finish", response_model=SessionFinishResponse, tags=["session"])
def finish_session(payload: SessionFinishRequest, _: str = Depends(get_current_token)) -> SessionFinishResponse:
    store = get_store()
    try:
        session = store.get(payload.session_id)
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    summary = "Conversation completed. Awaiting evaluation."
    response = SessionFinishResponse(
        session_id=session.session_id,
        summary=summary,
        word_count=session.word_count,
        duration_seconds=session.duration_seconds,
    )
    return response


@app.post("/api/evaluate", response_model=EvaluationResponse, tags=["evaluation"])
def evaluate(payload: EvaluationRequest, _: str = Depends(get_current_token)) -> EvaluationResponse:
    store = get_store()
    transcript: List[ChatMessage] = []

    if payload.session_id:
        try:
            session = store.get(payload.session_id)
        except KeyError:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        transcript = session.messages
    elif payload.transcript:
        transcript = payload.transcript
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide session_id or transcript")

    evaluation = evaluate_transcript(transcript, session_id=payload.session_id)
    return evaluation


@app.post("/api/report", response_model=ReportResponse, tags=["report"])
def generate_report(payload: ReportRequest, _: str = Depends(get_current_token)) -> ReportResponse:
    html, url = persist_report(payload.evaluation, session_metadata=payload.session_metadata)
    return ReportResponse(report_url=url, pdf_url=None, html=html)


@app.post("/api/email", response_model=EmailResponse, tags=["email"])
def send_report_email(payload: EmailRequest, _: str = Depends(get_current_token)) -> EmailResponse:
    return send_email(payload)


@app.on_event("startup")
def startup_event() -> None:
    # Preload settings to ensure env validation occurs early
    _ = settings
