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

    assert result.session_id == "test-session"
    assert 0 <= result.overall_score <= 4
    assert len(result.dimensions) == 4
    assert result.errors, "Expected at least one detected error"
    assert len(result.action_plan) == 5
