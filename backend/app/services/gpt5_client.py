from __future__ import annotations

import json
from functools import lru_cache
from textwrap import dedent
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
        return dedent(
            '''
            You are an expert English Speaking Assessment Rater with official training in both TOEFL iBT Speaking and IELTS Speaking examination systems, and you are also familiar with CEFR level descriptors.

            Your task is to analyze the full transcript of a spoken English interview between a candidate and an interviewer.

            Follow these instructions carefully:

            1. Evaluation Standards
               - Evaluate the candidate’s performance using BOTH the TOEFL and IELTS frameworks.
               - Each framework must have its own section.
               - Use the official or equivalent rubrics described below:
                 • TOEFL (0–4 scale): Delivery, Language Use, Topic Development, Task Fulfillment.
                 • IELTS (0–9 scale): Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation.
               - For each criterion, assign a numeric score and provide a brief justification (1–2 sentences).

            2. Linguistic Depth
               - Pay attention to:
                 • Fluency and speech rate (hesitations, self-corrections, pauses)
                 • Vocabulary range and precision
                 • Grammatical accuracy and complexity
                 • Coherence, organization, logical sequencing
                 • Pronunciation, rhythm, stress, and intonation
               - Detect idiomatic and natural use of English.

            3. Error and Strength Analysis
               - Identify up to 5 recurrent language errors (grammar, vocabulary, pronunciation, or discourse).
               - For each, provide:
                   issue: short description
                   example: a representative phrase (if possible)
                   suggested_fix: a correction or learning tip
               - Highlight 3 major strengths (fluency, cohesion, lexical richness, etc.).

            4. Recommendations
               - Give 5 personalized study recommendations (each 1 line), based on the weaknesses detected.
               - Example: “Practice linking words to improve fluency” or “Focus on sentence stress for clearer pronunciation.”

            5. CEFR Mapping
               - Convert both results to CEFR levels (use logical approximation).
               - Example: TOEFL 3.1 ≈ B2, IELTS 6.5 ≈ B2.
               - If they differ, explain briefly why and suggest a consensus CEFR level.

            6. Output Format (JSON)
               Return a single valid JSON object exactly in this format:

               {
                 "toefl": {
                   "overall": 3.2,
                   "cefr": "B2",
                   "criteria": {
                     "delivery": {"score": 3.0, "comment": "..."},
                     "language_use": {"score": 3.4, "comment": "..."},
                     "topic_dev": {"score": 3.1, "comment": "..."},
                     "task": {"score": 3.2, "comment": "..."}
                   }
                 },
                 "ielts": {
                   "overall": 6.5,
                   "cefr": "B2",
                   "criteria": {
                     "fluency_coherence": {"score": 6.5, "comment": "..."},
                     "lexical": {"score": 6.0, "comment": "..."},
                     "grammar": {"score": 6.5, "comment": "..."},
                     "pron": {"score": 6.5, "comment": "..."}
                   }
                 },
                 "strengths": ["...", "...", "..."],
                 "common_errors": [
                   {"issue": "...", "example": "...", "suggested_fix": "..."}
                 ],
                 "recommendations": ["...", "...", "...", "...", "..."],
                 "crosswalk": {
                   "consensus_cefr": "B2",
                   "notes": "IELTS slightly higher; both align at B2 upper range."
                 }
               }

            Ensure the JSON is valid, uses double quotes for keys and strings, and replace ellipses with your actual evaluations.
            '''
        ).strip()


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
