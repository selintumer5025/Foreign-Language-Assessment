from __future__ import annotations

from typing import List

from ..models import ChatMessage

WARMUP_PROMPTS = [
    "Hello! I'm your English interview coach. Could you briefly introduce yourself?",
    "Great to meet you. What motivated you to practice your speaking skills today?",
]

BEHAVIORAL_PROMPTS = [
    "Tell me about a time when you had to solve a challenging problem at work.",
    "Describe a situation where you collaborated with a team to achieve a goal.",
    "Can you share an example of when you had to learn something quickly?",
]

TECH_PROMPTS = [
    "Imagine you must explain a complex concept from your field to a new colleague. How would you approach it?",
    "What tools or technologies are essential in your day-to-day work?",
]

FOLLOW_UPS = [
    "What was the outcome and what did you learn?",
    "How did your colleagues respond?",
    "If you had another chance, what would you do differently?",
]

CLOSING_PROMPTS = [
    "Thanks for sharing those insights. Do you have any questions for me before we wrap up?",
    "It was great speaking with you today. Ready for your feedback?",
]


def next_prompt(history: List[ChatMessage]) -> str:
    user_turns = [m for m in history if m.role == "user"]
    assistant_turns = [m for m in history if m.role == "assistant"]

    if not assistant_turns:
        return WARMUP_PROMPTS[0]

    if len(user_turns) <= 1 and len(assistant_turns) < len(WARMUP_PROMPTS):
        return WARMUP_PROMPTS[len(assistant_turns)]

    if len(user_turns) <= 3:
        index = (len(assistant_turns) - len(WARMUP_PROMPTS)) % len(BEHAVIORAL_PROMPTS)
        return BEHAVIORAL_PROMPTS[index]

    if len(user_turns) == 4:
        return TECH_PROMPTS[0]

    if len(user_turns) >= 5 and len(user_turns) < 7:
        return FOLLOW_UPS[(len(user_turns) - 5) % len(FOLLOW_UPS)]

    return CLOSING_PROMPTS[(len(assistant_turns) - len(user_turns)) % len(CLOSING_PROMPTS)]
