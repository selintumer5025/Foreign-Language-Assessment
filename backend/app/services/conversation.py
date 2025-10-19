from __future__ import annotations

from typing import List

from ..models import ChatMessage

WARMUP_PROMPTS = [
    "Hello! I'm your English interview coach. Please answer in English. Could you briefly introduce yourself?",
    "Great to meet you. To stay in English mode, tell me what motivated you to practice your speaking skills today.",
]

BEHAVIORAL_PROMPTS = [
    "Tell me about a time when you had to solve a challenging problem at work. Keep your full answer in English, please.",
    "Describe a situation where you collaborated with a team to achieve a goal, using clear English storytelling.",
    "Can you share an example of when you had to learn something quickly? Explain it fully in English.",
]

TECH_PROMPTS = [
    "Imagine you must explain a complex concept from your field to a new colleague. How would you approach it in English?",
    "What tools or technologies are essential in your day-to-day work? Describe them in English.",
]

FOLLOW_UPS = [
    "What was the outcome and what did you learn? Answer in English with detail.",
    "How did your colleagues respond? Share the story in English.",
    "If you had another chance, what would you do differently? Explain in English.",
]

CLOSING_PROMPTS = [
    "Thanks for sharing those insights. Do you have any questions for me before we wrap up? Feel free to ask in English.",
    "It was great speaking with you today. Ready for your feedback in English?",
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
