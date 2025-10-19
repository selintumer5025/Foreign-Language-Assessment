from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from statistics import mean
from typing import Dict, Iterable, List, Sequence

from ..models import (
    ChatMessage,
    CommonError,
    CriterionAssessment,
    CrosswalkSummary,
    DualEvaluationResponse,
    SessionInfo,
    StandardEvaluation,
    TranscriptMetadata,
)

CONFIG_ROOT = Path(__file__).resolve().parents[3] / "configs"
SUPPORTED_STANDARDS: Sequence[str] = ("toefl", "ielts")
DEFAULT_VERSION = "v1"


@dataclass(frozen=True)
class TranscriptMetrics:
    total_words: int
    unique_words: int
    avg_sentence_length: float
    turns: int
    user_messages: List[str]


class ConfigNotFoundError(RuntimeError):
    pass


def _load_standard_config(standard_id: str, version: str = DEFAULT_VERSION) -> dict:
    config_path = CONFIG_ROOT / standard_id / f"{version}.json"
    if not config_path.exists():
        raise ConfigNotFoundError(f"Config for standard '{standard_id}' not found at {config_path}")
    return json.loads(config_path.read_text(encoding="utf-8"))


def _compute_metrics(transcript: List[ChatMessage]) -> TranscriptMetrics:
    user_messages = [m.content for m in transcript if m.role == "user"]
    total_words = sum(len(message.split()) for message in user_messages)
    unique_words = len({word.lower().strip(",.?!") for message in user_messages for word in message.split()})
    avg_sentence_length = total_words / max(len(user_messages), 1)
    return TranscriptMetrics(
        total_words=total_words,
        unique_words=unique_words,
        avg_sentence_length=avg_sentence_length,
        turns=len(user_messages),
        user_messages=user_messages,
    )


def _score_toefl_dimension(dimension_id: str, metrics: TranscriptMetrics) -> float:
    base = min(4.0, (metrics.total_words / 120) * 4)
    diversity = min(1.0, metrics.unique_words / 80) * 4
    fluency = min(1.0, metrics.avg_sentence_length / 25) * 4

    if dimension_id == "delivery":
        score = 0.55 * base + 0.45 * fluency
    elif dimension_id == "language_use":
        score = 0.5 * base + 0.5 * diversity
    elif dimension_id == "topic_dev":
        score = 0.6 * base + 0.4 * fluency
    else:  # task
        score = 0.7 * base

    return max(0.0, min(4.0, score))


def _score_ielts_dimension(dimension_id: str, metrics: TranscriptMetrics) -> float:
    base = min(1.0, metrics.total_words / 180)
    diversity = min(1.0, metrics.unique_words / 110)
    structure = min(1.0, metrics.avg_sentence_length / 20)

    if dimension_id == "fluency_coherence":
        normalized = 0.5 * base + 0.5 * structure
    elif dimension_id == "lexical":
        normalized = 0.4 * base + 0.6 * diversity
    elif dimension_id == "grammar":
        normalized = 0.45 * base + 0.55 * structure
    else:  # pron
        normalized = 0.6 * base + 0.4 * structure

    band = 4.0 + normalized * 5.0
    # Snap to nearest 0.5 band as per IELTS scoring practice
    return max(0.0, min(9.0, round(band * 2) / 2))


def _comment_for_score(score: float, standard_id: str) -> str:
    if standard_id == "toefl":
        if score >= 3.5:
            return "Highly fluent with precise control and natural delivery."
        if score >= 3.0:
            return "Solid control with minor lapses; polish transitions."
        if score >= 2.5:
            return "Generally clear; add detail and smooth hesitations."
        if score >= 1.5:
            return "Develop longer turns with clearer structure."
        return "Significant gaps—focus on intelligibility and completeness."

    if score >= 7.5:
        return "Confident, natural performance with advanced range."
    if score >= 6.5:
        return "Competent delivery; refine precision for higher bands."
    if score >= 5.5:
        return "Understandable but uneven; expand range and accuracy."
    if score >= 4.5:
        return "Frequent hesitation—build automaticity and accuracy."
    return "Severe breakdowns—establish core control of grammar and lexis."


def _map_score_to_cefr(score: float, mapping: List[dict]) -> str:
    for band in mapping:
        min_score = band.get("min", float("-inf"))
        max_score = band.get("max", float("inf"))
        if min_score <= score <= max_score:
            return band.get("cefr", "Undetermined")
    return "Undetermined"


def _detect_common_errors(messages: Iterable[str]) -> List[CommonError]:
    detections: List[CommonError] = []
    for message in messages:
        lower = message.lower()
        if "i am agree" in lower:
            detections.append(CommonError(issue="Agreement phrase", fix="Use 'I agree' instead of 'I am agree'."))
        if "a information" in lower:
            detections.append(CommonError(issue="Article use", fix="'Information' is uncountable; say 'some information'."))
        if "he go" in lower or "she go" in lower:
            detections.append(CommonError(issue="Third-person verb", fix="Use third-person singular forms like 'he goes'."))
        if len(message.split()) < 6:
            detections.append(CommonError(issue="Short responses", fix="Extend answers with supporting details and examples."))
        if lower.endswith("?"):
            detections.append(CommonError(issue="Rising intonation", fix="Finish statements confidently without question intonation."))
        if len(detections) >= 5:
            break

    if not detections:
        detections.append(
            CommonError(
                issue="Limited elaboration",
                fix="Add reasons, examples, and conclusions to each response.",
            )
        )

    unique_errors: Dict[str, CommonError] = {}
    for error in detections:
        unique_errors.setdefault(error.issue, error)
        if len(unique_errors) >= 5:
            break

    defaults = [
        CommonError(issue="Linking phrases", fix="Use connectors such as 'however', 'moreover', and 'as a result'."),
        CommonError(issue="Complex sentences", fix="Combine ideas with relative clauses and subordinating conjunctions."),
        CommonError(issue="Pronunciation clarity", fix="Articulate final consonants and stress key words for emphasis."),
    ]

    for default in defaults:
        if len(unique_errors) >= 3:
            break
        unique_errors.setdefault(default.issue, default)

    return list(unique_errors.values())[:5]


ACTION_PLAN: Dict[str, List[str]] = {
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


def _recommendations_for_cefr(cefr: str) -> List[str]:
    if not cefr:
        return ACTION_PLAN["B1"]
    for level in ("C2", "C1", "B2", "B1", "A2", "A1"):
        if level in cefr:
            return ACTION_PLAN[level]
    return ACTION_PLAN["B1"]


def _evidence_quotes(messages: List[str]) -> List[str]:
    quotes = [m for m in messages if len(m.split()) >= 4]
    if not quotes:
        quotes = messages
    if len(quotes) >= 2:
        return quotes[:2]
    if len(quotes) == 1:
        return [quotes[0], quotes[0]]
    return ["No substantive learner responses captured.", "Provide longer answers for evidence."]


def _validate_output(output: dict, schema: dict) -> None:
    if schema.get("type") != "object":
        return
    required = schema.get("required", [])
    for key in required:
        if key not in output:
            raise ValueError(f"Missing required field '{key}' in evaluator output")

    properties = schema.get("properties", {})
    for key, subschema in properties.items():
        if key not in output:
            continue
        value = output[key]
        expected_type = subschema.get("type")
        if expected_type == "object" and isinstance(value, dict):
            _validate_output(value, subschema)
        elif expected_type == "array" and isinstance(value, list):
            min_items = subschema.get("minItems")
            max_items = subschema.get("maxItems")
            if min_items is not None and len(value) < min_items:
                raise ValueError(f"Array '{key}' shorter than required minimum {min_items}")
            if max_items is not None and len(value) > max_items:
                raise ValueError(f"Array '{key}' longer than allowed maximum {max_items}")


def _build_standard_result(standard_id: str, config: dict, metrics: TranscriptMetrics) -> StandardEvaluation:
    rubric = {item["id"]: item for item in config["rubric"]["criteria"]}
    weights: Dict[str, float] = config["rubric"]["weights"]

    criteria: Dict[str, CriterionAssessment] = {}
    criterion_labels: Dict[str, str] = {}

    if standard_id == "toefl":
        scorer = _score_toefl_dimension
        scale_max = 4.0
    else:
        scorer = _score_ielts_dimension
        scale_max = 9.0

    for criterion_id in weights:
        score = scorer(criterion_id, metrics)
        comment = _comment_for_score(score, standard_id)
        criteria[criterion_id] = CriterionAssessment(score=round(score, 2), comment=comment)
        criterion_labels[criterion_id] = rubric.get(criterion_id, {}).get("label", criterion_id.title())

    overall = sum(weights[cid] * criteria[cid].score for cid in weights)
    round_to = config.get("scoring", {}).get("round_to", 2 if standard_id == "toefl" else 1)
    overall = round(overall, round_to)
    cefr = _map_score_to_cefr(overall, config.get("mapping", {}).get("to_cefr", []))

    evaluator_output = {
        "criteria": {cid: {"score": crit.score, "comment": crit.comment} for cid, crit in criteria.items()},
        "overall": overall,
        "cefr": cefr,
        "common_errors": [error.model_dump() for error in _detect_common_errors(metrics.user_messages)],
        "recommendations": _recommendations_for_cefr(cefr),
        "evidence_quotes": _evidence_quotes(metrics.user_messages),
    }

    _validate_output(evaluator_output, config.get("evaluator_output_schema", {}))

    return StandardEvaluation(
        standard_id=standard_id,
        label=config["meta"]["label"],
        overall=overall,
        cefr=cefr,
        criteria=criteria,
        criterion_labels=criterion_labels,
        common_errors=[CommonError(**error) for error in evaluator_output["common_errors"]],
        recommendations=evaluator_output["recommendations"],
        evidence_quotes=evaluator_output["evidence_quotes"],
        status="ok",
    )


def _failed_standard(standard_id: str, config: dict | None, error: Exception) -> StandardEvaluation:
    label = config.get("meta", {}).get("label", standard_id.upper()) if config else standard_id.upper()
    return StandardEvaluation(
        standard_id=standard_id,
        label=label,
        status="failed",
        error=str(error),
    )


CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]


def _cefr_rank(label: str | None) -> float | None:
    if not label:
        return None
    for level in reversed(CEFR_ORDER):
        if level in label:
            return CEFR_ORDER.index(level) + 1
    return None


def _rank_to_cefr(rank: float) -> str:
    if rank <= 1.5:
        return "A1"
    if rank <= 2.5:
        return "B1"
    if rank <= 3.5:
        return "B2"
    if rank <= 4.5:
        return "C1"
    return "C2"


def _summarise_crosswalk(standards: List[StandardEvaluation]) -> CrosswalkSummary:
    valid = [s for s in standards if s.status == "ok" and s.cefr]
    if valid:
        ranks = [r for r in (_cefr_rank(s.cefr) for s in valid) if r is not None]
    else:
        ranks = []

    if ranks:
        consensus_cefr = _rank_to_cefr(mean(ranks))
    else:
        consensus_cefr = "Undetermined"

    notes_parts: List[str] = []
    for standard in standards:
        if standard.status != "ok" or standard.overall is None or not standard.cefr:
            notes_parts.append(f"{standard.label} unavailable")
            continue
        if standard.standard_id == "ielts":
            notes_parts.append(f"IELTS {standard.overall:.1f}≈{standard.cefr}")
        else:
            notes_parts.append(f"TOEFL {standard.overall:.2f}≈{standard.cefr}")

    if len({s.cefr for s in valid}) <= 1 and valid:
        notes_suffix = "; consistent."
    elif len(valid) >= 2:
        notes_suffix = "; slight variance across standards."
    else:
        notes_suffix = ""

    notes = ", ".join(notes_parts) + notes_suffix if notes_parts else "No evaluations completed."

    strengths: List[str] = []
    for standard in valid:
        scale_max = 4.0 if standard.standard_id == "toefl" else 9.0
        sorted_criteria = sorted(
            standard.criteria.items(),
            key=lambda item: item[1].score / scale_max if scale_max else 0,
            reverse=True,
        )
        for criterion_id, _ in sorted_criteria:
            label = standard.criterion_labels.get(criterion_id, criterion_id.replace("_", " ").title())
            if label not in strengths:
                strengths.append(label)
            if len(strengths) >= 2:
                break
        if len(strengths) >= 2:
            break

    focus: List[str] = []
    for standard in standards:
        for error in standard.common_errors:
            if error.issue not in focus:
                focus.append(error.issue)
            if len(focus) >= 2:
                break
        if len(focus) >= 2:
            break

    if not strengths:
        strengths = ["Fluency", "Coherence"]
    if not focus:
        focus = ["Develop longer answers", "Grammar range"]

    return CrosswalkSummary(
        consensus_cefr=consensus_cefr,
        notes=notes,
        strengths=strengths[:2],
        focus=focus[:2],
    )


def _build_session_info(
    session_id: str,
    transcript: List[ChatMessage],
    metadata: TranscriptMetadata,
) -> SessionInfo:
    started_at = metadata.started_at or (transcript[0].timestamp if transcript else datetime.utcnow())
    if metadata.ended_at:
        ended_at = metadata.ended_at
    elif transcript:
        ended_at = transcript[-1].timestamp
    elif metadata.duration_sec:
        ended_at = started_at + timedelta(seconds=metadata.duration_sec)
    else:
        ended_at = started_at

    duration_sec = metadata.duration_sec
    if duration_sec is None:
        duration_sec = int(max((ended_at - started_at).total_seconds(), 0))

    turns = metadata.turns if metadata.turns is not None else len([m for m in transcript if m.role == "user"])

    return SessionInfo(
        id=session_id,
        started_at=started_at,
        ended_at=ended_at,
        duration_sec=duration_sec,
        turns=turns,
    )


def evaluate_transcript(
    transcript: List[ChatMessage],
    session_id: str | None = None,
    metadata: TranscriptMetadata | None = None,
) -> DualEvaluationResponse:
    if not session_id:
        session_id = "adhoc"

    metadata = metadata or TranscriptMetadata()
    metrics = _compute_metrics(transcript)

    standards: List[StandardEvaluation] = []
    for standard_id in SUPPORTED_STANDARDS:
        config = None
        try:
            config = _load_standard_config(standard_id)
            standard_result = _build_standard_result(standard_id, config, metrics)
        except Exception as exc:  # noqa: BLE001 - ensure we always capture failures
            standard_result = _failed_standard(standard_id, config, exc)
        standards.append(standard_result)

    crosswalk = _summarise_crosswalk(standards)

    warnings: List[str] = []
    if metadata.duration_sec is not None and metadata.duration_sec < 120:
        warnings.append("Low evidence; scores may be unstable (short duration).")
    if metrics.total_words < 150:
        warnings.append("Low evidence; limited transcript length may affect reliability.")

    session_info = _build_session_info(session_id, transcript, metadata)

    return DualEvaluationResponse(
        session=session_info,
        standards=standards,
        crosswalk=crosswalk,
        warnings=warnings or None,
        session_id=session_info.id,
        cefr_level=crosswalk.consensus_cefr,
    )
