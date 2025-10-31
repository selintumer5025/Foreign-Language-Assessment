from __future__ import annotations

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, EmailStr


class InteractionMode(str, Enum):
    TEXT = "text"
    VOICE = "voice"


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SessionConsent(BaseModel):
    granted: bool = Field(default=False, description="Whether the participant has granted consent")
    granted_at: Optional[datetime] = Field(default=None, description="Timestamp when consent was granted")


class SessionStartRequest(BaseModel):
    mode: InteractionMode = InteractionMode.TEXT
    duration_minutes: int = Field(default=10, ge=1, le=60)
    user_name: Optional[str] = Field(default=None, description="Optional user display name")
    user_email: Optional[EmailStr] = Field(default=None, description="Optional user email address")
    consent: SessionConsent = Field(..., description="Participant consent metadata")


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


class EvaluationRequest(BaseModel):
    session_id: Optional[str] = None
    transcript: Optional[List[ChatMessage]] = None
    metadata: Optional["TranscriptMetadata"] = None


class TranscriptMetadata(BaseModel):
    lang: Optional[str] = None
    duration_sec: Optional[int] = None
    turns: Optional[int] = None
    word_count: Optional[int] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None


class SessionInfo(BaseModel):
    id: str
    started_at: datetime
    ended_at: datetime
    duration_sec: int
    turns: int


class CriterionAssessment(BaseModel):
    score: float
    comment: str


class CommonError(BaseModel):
    issue: str
    fix: str


class StandardEvaluation(BaseModel):
    standard_id: str
    label: str
    overall: Optional[float] = None
    cefr: Optional[str] = None
    criteria: Dict[str, CriterionAssessment] = Field(default_factory=dict)
    criterion_labels: Dict[str, str] = Field(default_factory=dict)
    common_errors: List[CommonError] = Field(default_factory=list)
    recommendations: List[str] = Field(default_factory=list)
    evidence_quotes: List[str] = Field(default_factory=list)
    status: str = Field(default="ok", pattern="^(ok|failed)$")
    error: Optional[str] = None


class CrosswalkSummary(BaseModel):
    consensus_cefr: str
    notes: str
    strengths: List[str]
    focus: List[str]


class DualEvaluationResponse(BaseModel):
    session: SessionInfo
    standards: List[StandardEvaluation]
    crosswalk: CrosswalkSummary
    warnings: Optional[List[str]] = None
    session_id: str
    cefr_level: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class ReportRequest(BaseModel):
    evaluation: DualEvaluationResponse
    session_metadata: Optional[dict] = None


class ReportResponse(BaseModel):
    report_url: str
    pdf_url: Optional[str] = None
    html: str


class EmailAttachment(BaseModel):
    filename: str
    content_type: str
    data: str


class EmailRequest(BaseModel):
    to: EmailStr
    subject: str
    body: str
    attachments: Optional[List[EmailAttachment]] = None
    links: Optional[List[str]] = None
    session_id: Optional[str] = None


class EmailResponse(BaseModel):
    status: str
    message_id: str


class SessionAudioUploadRequest(BaseModel):
    session_id: str
    audio_base64: str
    mime_type: Optional[str] = None
    report_date: Optional[str] = None


class SessionAudioUploadResponse(BaseModel):
    filename: str
    stored_path: str
    content_type: str


class ErrorResponse(BaseModel):
    detail: str


class GPT5KeyRequest(BaseModel):
    api_key: str = Field(..., min_length=1)


class GPT5KeyStatus(BaseModel):
    configured: bool


class EmailSettingsPublic(BaseModel):
    provider: str
    smtp_host: Optional[str] = None
    smtp_port: int
    smtp_username: Optional[str] = None
    default_sender: Optional[EmailStr] = None


class EmailConfigStatus(BaseModel):
    configured: bool
    missing_fields: List[str] = Field(default_factory=list)
    settings: EmailSettingsPublic
    target_email: Optional[EmailStr] = None


class EmailConfigUpdateRequest(BaseModel):
    provider: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    default_sender: Optional[EmailStr] = None
    target_email: Optional[EmailStr] = None
