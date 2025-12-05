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
FIXED_QUESTIONS_COUNT = 2  # First 2 questions are always asked
RANDOM_QUESTIONS_COUNT = 3  # Remaining 3 questions selected randomly
DEFAULT_STANDARD = os.getenv("DEFAULT_INTERVIEW_STANDARD", "toefl")
CONFIG_ROOT = Path(__file__).resolve().parents[3] / "configs"
QUESTIONS_FILE = Path(__file__).resolve().parents[3] / "questions.md"
CUSTOM_QUESTION_DIRS = (
    Path(__file__).resolve().parents[3] / "sorular",
    Path(__file__).resolve().parents[3] / "soru",
)
CLOSING_MESSAGE = (
    "Konuşma pratiğini tamamladığınız için teşekkürler. "
    "Ekranın sağ üstünde yer alan \"Oturumu Sonlandır\" tuşuna basabilir ve  raporunuzun paylaşılmasını sağlayabilirsiniz."
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


def _load_questions_from_file() -> List[str]:
    """Load all questions from questions.md file.

    Returns:
        List of questions with first 2 being fixed questions, rest being the random pool.
    """
    questions: List[str] = []

    if not QUESTIONS_FILE.exists():
        return FALLBACK_QUESTIONS

    try:
        text = QUESTIONS_FILE.read_text(encoding="utf-8")
    except Exception:
        return FALLBACK_QUESTIONS

    for raw_line in text.splitlines():
        line = raw_line.strip()
        # Skip empty lines and comments
        if not line or line.startswith("#") or line.startswith("---"):
            continue
        # Remove markdown list prefixes and numbering
        line = re.sub(r"^[-*+]\s+", "", line)
        line = re.sub(r"^\d+[.)]\s+", "", line)
        normalized = line.strip()
        if normalized:
            questions.append(normalized)

    # If we don't have enough questions, use fallback
    if len(questions) < QUESTIONS_PER_SESSION:
        return FALLBACK_QUESTIONS

    return questions


@lru_cache(maxsize=1)
def _load_question_pool(standard_id: str) -> List[str]:
    """Load question pool from questions.md file.

    Returns all questions from the file (first 2 are fixed, rest are random pool).
    """
    return _load_questions_from_file()


def _select_questions(question_pool: List[str]) -> List[str]:
    """Select questions: first 2 are fixed, next 3 are randomly selected.

    Args:
        question_pool: List of all available questions.
                      First 2 questions are fixed, rest form the random pool.

    Returns:
        List of 5 questions: [fixed1, fixed2, random1, random2, random3]
    """
    # If pool is too small, return what we have
    if len(question_pool) <= QUESTIONS_PER_SESSION:
        return question_pool[:QUESTIONS_PER_SESSION]

    # First 2 questions are always selected (fixed)
    fixed_questions = question_pool[:FIXED_QUESTIONS_COUNT]

    # Random pool starts from index 2 onwards
    random_pool = question_pool[FIXED_QUESTIONS_COUNT:]

    # Select 3 random questions from the pool
    if len(random_pool) >= RANDOM_QUESTIONS_COUNT:
        random_questions = random.sample(random_pool, RANDOM_QUESTIONS_COUNT)
    else:
        # If not enough questions in random pool, take what's available
        random_questions = random_pool[:RANDOM_QUESTIONS_COUNT]

    # Combine: 2 fixed + 3 random = 5 total
    return fixed_questions + random_questions


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
