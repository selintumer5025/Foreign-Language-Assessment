from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import List

from ..models import ChatMessage

QUESTIONS_PER_SESSION = 5
DEFAULT_STANDARD = os.getenv("DEFAULT_INTERVIEW_STANDARD", "toefl")
CONFIG_ROOT = Path(__file__).resolve().parents[3] / "configs"


def _load_standard_config(standard_id: str) -> dict:
    config_path = CONFIG_ROOT / standard_id / "v1.json"
    if not config_path.exists():
        raise FileNotFoundError(f"Config for standard '{standard_id}' not found at {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


@lru_cache(maxsize=4)
def _build_question_bank(standard_id: str) -> List[str]:
    try:
        config = _load_standard_config(standard_id)
    except Exception:
        config = None

    questions: List[str] = []
    if config:
        for task in config.get("tasks", []):
            for example in task.get("examples", []) or []:
                normalized = (example or "").strip()
                if normalized:
                    questions.append(normalized)

    if len(questions) < QUESTIONS_PER_SESSION:
        fallbacks = [
            "Please introduce yourself in English.",
            "What are your current study or career goals?",
            "Tell me about a time you solved a challenge at work or school.",
            "How do you prepare for important presentations or exams?",
            "What skills are you focused on improving this year?",
        ]
        for prompt in fallbacks:
            if len(questions) >= QUESTIONS_PER_SESSION:
                break
            if prompt not in questions:
                questions.append(prompt)

    return questions[:QUESTIONS_PER_SESSION]


def _closing_message(standard_id: str, config: dict | None) -> str:
    label = standard_id.upper()
    if config:
        label = config.get("meta", {}).get("label", label)
    return (
        f"Thanks for completing the {label} practice. When you're ready, we can review your performance together."
    )


def next_prompt(history: List[ChatMessage], standard_id: str | None = None) -> str:
    standard = (standard_id or DEFAULT_STANDARD).lower()
    questions = _build_question_bank(standard)
    try:
        config = _load_standard_config(standard)
    except Exception:
        config = None

    assistant_turns = [m for m in history if m.role == "assistant"]
    user_turns = [m for m in history if m.role == "user"]

    if len(assistant_turns) < QUESTIONS_PER_SESSION:
        return questions[len(assistant_turns)]

    # Once the five core questions are complete, provide a closing message.
    if not assistant_turns or assistant_turns[-1].content != _closing_message(standard, config):
        return _closing_message(standard, config)

    # If the user continues after the closing, gently remind them.
    if user_turns and len(user_turns) >= QUESTIONS_PER_SESSION:
        return "Feel free to request your evaluation whenever you're ready."

    return questions[-1]
