from backend.app.models import ChatMessage
from backend.app.services.evaluation import evaluate_transcript


def test_evaluation_returns_scores():
    transcript = [
        ChatMessage(role="assistant", content="Hello"),
        ChatMessage(role="user", content="I am agree with the statement because it helps me grow."),
        ChatMessage(role="assistant", content="Tell me more."),
        ChatMessage(role="user", content="I solved a big problem at work by talking with my team."),
    ]

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
