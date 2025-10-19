import httpx
import pytest

from backend.app.models import ChatMessage, TranscriptMetadata
from backend.app.services.gpt5_client import GPT5APIError, GPT5Client


def test_timeout_exception_is_reported_with_actionable_message(monkeypatch):
    client = GPT5Client(
        api_key="test-key",
        base_url="https://example.invalid",
        model="gpt-5",
        timeout=12.5,
    )

    def fake_post(*args, **kwargs):  # noqa: ANN001 - helper for monkeypatch
        raise httpx.ReadTimeout("The read operation timed out")

    monkeypatch.setattr("backend.app.services.gpt5_client.httpx.post", fake_post)

    with pytest.raises(GPT5APIError) as excinfo:
        client.generate_evaluation(
            transcript=[ChatMessage(role="user", content="Hello")],
            metadata=TranscriptMetadata(),
            metrics={"total_words": 1},
        )

    assert (
        str(excinfo.value)
        == "GPT-5 API request timed out after 12.5 seconds. Check your GPT-5 API base URL or network connectivity."
    )
