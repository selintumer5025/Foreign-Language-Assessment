from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

from ..models import ChatMessage, InteractionMode


class SessionData:
    def __init__(
        self,
        mode: InteractionMode,
        duration_minutes: int,
        user_name: str | None = None,
        user_email: str | None = None,
        consent_granted: bool = False,
        consent_granted_at: Optional[datetime] = None,
    ):
        self.session_id = str(uuid.uuid4())
        self.mode = mode
        self.duration_minutes = duration_minutes
        self.user_name = user_name
        self.user_email = user_email
        self.started_at = datetime.utcnow()
        self.messages: List[ChatMessage] = []
        self.standard_id: str | None = None
        self.question_plan: List[str] = []
        self.consent_granted = consent_granted
        self.consent_granted_at = consent_granted_at or (datetime.utcnow() if consent_granted else None)

    @property
    def duration_seconds(self) -> int:
        return int((datetime.utcnow() - self.started_at).total_seconds())

    @property
    def word_count(self) -> int:
        return sum(len(m.content.split()) for m in self.messages if m.role == "user")

    def add_message(self, message: ChatMessage) -> None:
        self.messages.append(message)


class InMemorySessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, SessionData] = {}
        self._turn_counts: Dict[str, int] = defaultdict(int)

    def create_session(
        self,
        mode: InteractionMode,
        duration_minutes: int,
        user_name: str | None = None,
        user_email: str | None = None,
        consent_granted: bool = False,
        consent_granted_at: Optional[datetime] = None,
    ) -> SessionData:
        session = SessionData(
            mode=mode,
            duration_minutes=duration_minutes,
            user_name=user_name,
            user_email=user_email,
            consent_granted=consent_granted,
            consent_granted_at=consent_granted_at,
        )
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> SessionData:
        if session_id not in self._sessions:
            raise KeyError(f"Session {session_id} not found")
        return self._sessions[session_id]

    def increment_turn(self, session_id: str) -> int:
        self._turn_counts[session_id] += 1
        return self._turn_counts[session_id]

    def delete(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)
        self._turn_counts.pop(session_id, None)


def get_store() -> InMemorySessionStore:
    # Singleton pattern through function attribute
    if not hasattr(get_store, "_instance"):
        get_store._instance = InMemorySessionStore()  # type: ignore[attr-defined]
    return get_store._instance  # type: ignore[attr-defined]
