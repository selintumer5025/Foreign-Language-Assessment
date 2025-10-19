from __future__ import annotations

import json
from functools import lru_cache
from typing import Iterable, Mapping

import httpx

from ..config import get_settings
from ..models import ChatMessage, TranscriptMetadata


class GPT5APIError(RuntimeError):
    """Raised when GPT-5 evaluation could not be obtained."""


class GPT5Client:
    """Lightweight HTTP client to call a GPT-5 compatible chat completion API."""

    def __init__(self, api_key: str, base_url: str, model: str, timeout: float = 30.0) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    def generate_evaluation(
        self,
        transcript: Iterable[ChatMessage],
        metadata: TranscriptMetadata,
        metrics: Mapping[str, object],
    ) -> dict:
        """Request an evaluation from GPT-5 and parse the JSON response."""

        messages_payload = [
            {"role": "system", "content": self._system_prompt()},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "transcript": [m.model_dump() for m in transcript],
                        "metadata": metadata.model_dump(),
                        "metrics": metrics,
                    },
                    ensure_ascii=False,
                ),
            },
        ]

        request_payload = {
            "model": self._model,
            "messages": messages_payload,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = httpx.post(url, headers=headers, json=request_payload, timeout=self._timeout)
        except httpx.HTTPError as exc:  # pragma: no cover - network failures
            raise GPT5APIError(f"Failed to contact GPT-5 API: {exc}") from exc

        if response.status_code >= 400:
            raise GPT5APIError(
                f"GPT-5 API returned HTTP {response.status_code}: {response.text.strip() or 'Unknown error'}"
            )

        try:
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
        except (ValueError, KeyError, IndexError) as exc:
            raise GPT5APIError("Unexpected GPT-5 API payload format") from exc

        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise GPT5APIError("GPT-5 response was not valid JSON") from exc

        if not isinstance(parsed, dict):
            raise GPT5APIError("GPT-5 response must be a JSON object")

        return parsed

    @staticmethod
    def _system_prompt() -> str:
        return (
            "You are GPT-5, an expert English speaking assessor. "
            "Score transcripts for TOEFL iBT and IELTS speaking rubrics. "
            "Provide evidence-aligned feedback, common errors, and actionable recommendations. "
            "Respond strictly with JSON including keys 'standards', 'crosswalk', and optional 'warnings'. "
            "Each standard must include scores for its criteria, an overall score, CEFR inference, "
            "common_errors (issue/fix), recommendations, and two evidence_quotes drawn from the transcript."
        )


@lru_cache(maxsize=1)
def get_gpt5_client() -> GPT5Client:
    settings = get_settings()
    if not settings.gpt5_api_key:
        raise GPT5APIError("GPT-5 API key is not configured")
    return GPT5Client(
        api_key=settings.gpt5_api_key,
        base_url=settings.gpt5_api_base_url,
        model=settings.gpt5_model,
    )


def clear_gpt5_client_cache() -> None:
    get_gpt5_client.cache_clear()
