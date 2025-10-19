from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, EmailStr


class InteractionMode(str, Enum):
    TEXT = "text"
    VOICE = "voice"


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SessionStartRequest(BaseModel):
    mode: InteractionMode = InteractionMode.TEXT
    duration_minutes: int = Field(default=10, ge=1, le=60)
    user_name: Optional[str] = Field(default=None, description="Optional user display name")


class SessionStartResponse(BaseModel):
    session_id: str
    started_at: datetime
    assistant_greeting: str
    mode: InteractionMode


class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    audio_meta: Optional[dict] = Field(default=None, description="Optional metadata about audio input")


class ChatResponse(BaseModel):
    assistant_message: str
    mode: InteractionMode = InteractionMode.TEXT
    tts_url: Optional[str] = None
    turns_completed: int


class SessionFinishRequest(BaseModel):
    session_id: str


class SessionFinishResponse(BaseModel):
    session_id: str
    summary: str
    word_count: int
    duration_seconds: int


class EvaluationDimensionScore(BaseModel):
    name: str
    score: float
    weight: float
    feedback: str


class EvaluationRequest(BaseModel):
    session_id: Optional[str] = None
    transcript: Optional[List[ChatMessage]] = None


class EvaluationResponse(BaseModel):
    session_id: Optional[str] = None
    overall_score: float
    cefr_level: str
    summary: str
    dimensions: List[EvaluationDimensionScore]
    errors: List[str]
    action_plan: List[str]
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class ReportRequest(BaseModel):
    evaluation: EvaluationResponse
    session_metadata: Optional[dict] = None


class ReportResponse(BaseModel):
    report_url: str
    pdf_url: Optional[str] = None
    html: str


class EmailRequest(BaseModel):
    to: EmailStr
    subject: str
    body: str
    attachments: Optional[List[dict]] = None
    links: Optional[List[str]] = None


class EmailResponse(BaseModel):
    status: str
    message_id: str


class ErrorResponse(BaseModel):
    detail: str
