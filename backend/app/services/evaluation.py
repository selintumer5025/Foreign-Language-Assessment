from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

from ..models import ChatMessage, EvaluationDimensionScore, EvaluationResponse


@dataclass(frozen=True)
class RubricDimension:
    name: str
    weight: float


RUBRIC: Sequence[RubricDimension] = (
    RubricDimension("Delivery", 0.25),
    RubricDimension("Language Use", 0.35),
    RubricDimension("Topic Development", 0.25),
    RubricDimension("Task Fulfillment", 0.15),
)


def _score_dimension(dimension: RubricDimension, transcript: List[ChatMessage]) -> EvaluationDimensionScore:
    user_messages = [m for m in transcript if m.role == "user"]
    if not user_messages:
        score = 0.0
        feedback = "No learner responses captured."
        return EvaluationDimensionScore(name=dimension.name, score=score, weight=dimension.weight, feedback=feedback)

    total_words = sum(len(m.content.split()) for m in user_messages)
    unique_words = len({word.lower().strip(",.?!") for m in user_messages for word in m.content.split()})
    avg_sentence_length = total_words / max(len(user_messages), 1)

    base_score = min(4.0, (total_words / 120) * 4)
    diversity_bonus = min(1.0, unique_words / 80)
    fluency_bonus = min(1.0, avg_sentence_length / 25)

    if dimension.name == "Delivery":
        score = min(4.0, base_score * 0.6 + fluency_bonus * 2.0)
        feedback = "Maintain steady pacing and clear pronunciation."
    elif dimension.name == "Language Use":
        score = min(4.0, base_score * 0.5 + diversity_bonus * 2.5)
        feedback = "Incorporate a wider range of grammatical structures."
    elif dimension.name == "Topic Development":
        score = min(4.0, base_score * 0.7 + fluency_bonus * 1.2)
        feedback = "Support ideas with concrete examples."
    else:
        score = min(4.0, base_score * 0.8)
        feedback = "Ensure responses fully address the prompt."

    if score > 3.2:
        feedback = "Strong performance with nuanced expression."
    elif score > 2.4:
        feedback = "Good control overall; refine clarity for top marks."
    elif score > 1.5:
        feedback = "Develop more structure and precise vocabulary."
    else:
        feedback = "Focus on building longer, clearer responses."

    return EvaluationDimensionScore(name=dimension.name, score=round(score, 2), weight=dimension.weight, feedback=feedback)


def _infer_errors(transcript: List[ChatMessage]) -> List[str]:
    errors: List[str] = []
    for message in transcript:
        if message.role != "user":
            continue
        content_lower = message.content.lower()
        if "i am agree" in content_lower:
            errors.append("Use 'I agree' instead of 'I am agree'.")
        if "he go" in content_lower:
            errors.append("Use third-person singular 'he goes'.")
        if "a information" in content_lower:
            errors.append("'Information' is uncountable; say 'some information'.")
        if content_lower.strip().endswith("?") is False and len(message.content.split()) < 4:
            errors.append("Provide fuller answers with supporting details.")
        if len(errors) >= 5:
            break
    return errors or ["Expand answers with clear structure and varied vocabulary."]


def _action_plan(level: str) -> List[str]:
    plans = {
        "A1": [
            "Practice daily introductions using common phrases.",
            "Listen to slow English podcasts for 10 minutes each day.",
            "Shadow simple sentences to improve pronunciation.",
            "Learn five new vocabulary items focused on daily routines.",
            "Record yourself speaking and compare with the transcript.",
        ],
        "A2": [
            "Build themed vocabulary lists (travel, work, study).",
            "Use language exchange apps for short conversations weekly.",
            "Summarize short news stories aloud to improve coherence.",
            "Review basic grammar tenses focusing on past narratives.",
            "Practice answering STAR-format questions with a timer.",
        ],
        "B1": [
            "Join an online speaking club twice per week.",
            "Write outlines before speaking to structure responses.",
            "Record and analyze answers to behavioral interview prompts.",
            "Incorporate linking phrases (however, moreover, therefore).",
            "Focus on pronunciation of multi-syllable words using IPA guides.",
        ],
        "B2": [
            "Simulate interviews with peers and request targeted feedback.",
            "Refine storytelling using Situation-Task-Action-Result format.",
            "Increase lexical range with topic-specific collocations.",
            "Practice spontaneous follow-up questions to extend dialogue.",
            "Review grammar accuracy focusing on conditionals and modals.",
        ],
        "C1": [
            "Engage with advanced podcasts and note key arguments.",
            "Practice persuasive answers using rhetoric techniques.",
            "Analyze native transcripts to emulate intonation patterns.",
            "Experiment with idiomatic expressions in mock interviews.",
            "Lead practice sessions critiquing others to solidify insights.",
        ],
        "C2": [
            "Deliver mock presentations with complex data storytelling.",
            "Mentor other learners to reinforce high-level structures.",
            "Study nuanced discourse markers and apply in responses.",
            "Challenge yourself with impromptu debate topics weekly.",
            "Refine pronunciation with phonetic drills on weak forms.",
        ],
    }
    return plans.get(level, plans["B1"])


def _map_score_to_cefr(score: float) -> str:
    if score <= 1.0:
        return "A1"
    if score <= 2.0:
        return "B1"
    if score <= 3.0:
        return "B2"
    if score <= 3.5:
        return "C1"
    return "C2"


def evaluate_transcript(transcript: List[ChatMessage], session_id: str | None = None) -> EvaluationResponse:
    dimension_scores = [_score_dimension(dimension, transcript) for dimension in RUBRIC]
    overall = sum(d.weight * d.score for d in dimension_scores)
    cefr = _map_score_to_cefr(overall)
    summary = "Overall solid performance with room to expand answers." if overall >= 2.5 else "Build longer, clearer responses to improve scores."
    errors = _infer_errors(transcript)
    action_plan = _action_plan(cefr)
    return EvaluationResponse(
        session_id=session_id,
        overall_score=round(overall, 2),
        cefr_level=cefr,
        summary=summary,
        dimensions=dimension_scores,
        errors=errors,
        action_plan=action_plan,
    )
