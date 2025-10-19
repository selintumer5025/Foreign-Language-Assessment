from unittest.mock import MagicMock, patch

from backend.app.models import ChatMessage
from backend.app.services.evaluation import evaluate_transcript


def test_evaluation_returns_scores():
    transcript = [
        ChatMessage(role="assistant", content="Hello"),
        ChatMessage(role="user", content="I am agree with the statement because it helps me grow."),
        ChatMessage(role="assistant", content="Tell me more."),
        ChatMessage(role="user", content="I solved a big problem at work by talking with my team."),
    ]

    gpt_response = {
        "standards": [
            {
                "standard_id": "toefl",
                "label": "TOEFL iBT Speaking",
                "overall": 3.2,
                "cefr": "B2",
                "criteria": {
                    "delivery": {"score": 3.1, "comment": "Good pacing."},
                    "language_use": {"score": 3.0, "comment": "Varied vocabulary."},
                    "topic_dev": {"score": 3.3, "comment": "Clear structure."},
                    "task": {"score": 3.4, "comment": "Addressed prompt."},
                },
                "common_errors": [
                    {"issue": "Agreement phrase", "fix": "Say 'I agree'."}
                ],
                "recommendations": [
                    "Add more supporting details.",
                    "Practice extended answers.",
                    "Use varied connectors.",
                    "Record and review responses.",
                    "Strengthen stress patterns.",
                ],
                "evidence_quotes": [
                    "I am agree with the statement because it helps me grow.",
                    "I solved a big problem at work by talking with my team.",
                ],
            },
            {
                "standard_id": "ielts",
                "label": "IELTS Speaking",
                "overall": 6.5,
                "cefr": "B2",
                "criteria": {
                    "fluency_coherence": {"score": 6.5, "comment": "Mostly fluent."},
                    "lexical": {"score": 6.0, "comment": "Adequate range."},
                    "grammar": {"score": 6.5, "comment": "Generally accurate."},
                    "pron": {"score": 6.5, "comment": "Understandable pronunciation."},
                },
                "common_errors": [
                    {"issue": "Agreement phrase", "fix": "Use 'I agree'."}
                ],
                "recommendations": [
                    "Sustain responses for longer turns.",
                    "Increase lexical variety.",
                    "Target intonation control.",
                    "Refine grammatical accuracy.",
                    "Practice natural fillers.",
                ],
                "evidence_quotes": [
                    "I am agree with the statement because it helps me grow.",
                    "I solved a big problem at work by talking with my team.",
                ],
            },
        ],
        "crosswalk": {
            "consensus_cefr": "B2",
            "notes": "IELTS and TOEFL align at B2.",
            "strengths": ["Delivery", "Topic Development"],
            "focus": ["Grammar range", "Detail"],
        },
        "warnings": ["Synthetic GPT response used for testing."],
    }

    with patch("backend.app.services.evaluation.get_gpt5_client") as mock_factory:
        mock_client = MagicMock()
        mock_client.generate_evaluation.return_value = gpt_response
        mock_factory.return_value = mock_client

        result = evaluate_transcript(transcript, session_id="test-session")

    assert result.session.id == "test-session"
    assert len(result.standards) == 2
    toefl = next(std for std in result.standards if std.standard_id == "toefl")
    ielts = next(std for std in result.standards if std.standard_id == "ielts")

    assert toefl.overall is not None and 0 <= toefl.overall <= 4
    assert ielts.overall is not None and 0 <= ielts.overall <= 9
    assert toefl.common_errors, "Expected TOEFL evaluation to surface common errors"
    assert len(toefl.recommendations) >= 5
    assert result.crosswalk.consensus_cefr in {"A1", "A2", "B1", "B2", "C1", "C2", "Undetermined"}
