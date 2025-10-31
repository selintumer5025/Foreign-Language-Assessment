from __future__ import annotations

import json
import os
import random
import re
from functools import lru_cache
from pathlib import Path
from typing import List

from ..models import ChatMessage

QUESTIONS_PER_SESSION = 5
DEFAULT_STANDARD = os.getenv("DEFAULT_INTERVIEW_STANDARD", "toefl")
CONFIG_ROOT = Path(__file__).resolve().parents[3] / "configs"
CUSTOM_QUESTION_DIRS = (
    Path(__file__).resolve().parents[3] / "sorular",
    Path(__file__).resolve().parents[3] / "soru",
)
CLOSING_MESSAGE = (
    "TOEFL iBT Speaking konuşma pratiğini tamamladığınız için teşekkürler. "
    "Oturumu Sonlandır tuşuna basabilir, raporunuzun paylaşılmasını sağlayabilirsiniz."
)
FALLBACK_QUESTIONS = [
    "Please introduce yourself in English.",
    "What are your current study or career goals?",
    "Tell me about a time you solved a challenge at work or school.",
    "How do you prepare for important presentations or exams?",
    "What skills are you focused on improving this year?",
]


def _load_standard_config(standard_id: str) -> dict:
    config_path = CONFIG_ROOT / standard_id / "v1.json"
    if not config_path.exists():
        raise FileNotFoundError(f"Config for standard '{standard_id}' not found at {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def _load_custom_question_bank() -> List[str]:
    questions: List[str] = []
    for directory in CUSTOM_QUESTION_DIRS:
        if not directory.exists() or not directory.is_dir():
            continue
        for file in sorted(directory.glob("*.md")):
            try:
                text = file.read_text(encoding="utf-8")
            except Exception:
                continue
            for raw_line in text.splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#"):
                    continue
                line = re.sub(r"^[-*+]\s+", "", line)
                line = re.sub(r"^\d+[.)]\s+", "", line)
                normalized = line.strip()
                if normalized:
                    questions.append(normalized)
    return questions


@lru_cache(maxsize=4)
def _load_question_pool(standard_id: str) -> List[str]:
    try:
        config = _load_standard_config(standard_id)
    except Exception:
        config = None

    questions: List[str] = []

    custom_questions = _load_custom_question_bank()
    if custom_questions:
        questions.extend(custom_questions)

    if config:
        for task in config.get("tasks", []):
            for example in task.get("examples", []) or []:
                normalized = (example or "").strip()
                if normalized:
                    questions.append(normalized)

    deduped_questions: List[str] = []
    seen = set()
    for prompt in questions:
        if prompt not in seen:
            seen.add(prompt)
            deduped_questions.append(prompt)

    if len(deduped_questions) < QUESTIONS_PER_SESSION:
        for prompt in FALLBACK_QUESTIONS:
            if prompt not in seen:
                deduped_questions.append(prompt)
                seen.add(prompt)
            if len(deduped_questions) >= QUESTIONS_PER_SESSION:
                break

    return deduped_questions


def _select_questions(question_pool: List[str]) -> List[str]:
    if len(question_pool) <= QUESTIONS_PER_SESSION:
        return question_pool[:QUESTIONS_PER_SESSION]
    return random.sample(question_pool, QUESTIONS_PER_SESSION)


def _closing_message(standard_id: str, config: dict | None) -> str:
    return CLOSING_MESSAGE


def next_prompt(
    history: List[ChatMessage],
    standard_id: str | None = None,
    session: "SessionData | None" = None,
) -> str:
    from .session_store import SessionData  # local import to avoid circular dependency

    session_obj: SessionData | None = session if isinstance(session, SessionData) else None

    standard = (standard_id or getattr(session_obj, "standard_id", None) or DEFAULT_STANDARD).lower()
    if session_obj is not None and getattr(session_obj, "standard_id", None) is None:
        session_obj.standard_id = standard

    question_pool = _load_question_pool(standard)
    if session_obj is not None:
        if not getattr(session_obj, "question_plan", []):
            session_obj.question_plan = _select_questions(question_pool)
        questions = session_obj.question_plan
    else:
        questions = _select_questions(question_pool)
    try:
        config = _load_standard_config(standard)
    except Exception:
        config = None

    assistant_turns = [m for m in history if m.role == "assistant"]
    if len(assistant_turns) < QUESTIONS_PER_SESSION:
        return questions[len(assistant_turns)]

    # Once the five core questions are complete, provide a closing message.
    closing_message = _closing_message(standard, config)
    if not assistant_turns or assistant_turns[-1].content != closing_message:
        return closing_message

    return closing_message
