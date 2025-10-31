from fastapi.testclient import TestClient

import base64
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.config import get_settings


def get_auth_headers():
    token = get_settings().secret_token
    return {"Authorization": f"Bearer {token}"}


def test_session_lifecycle():
    client = TestClient(app)
    start_resp = client.post(
        "/api/session/start",
        json={
            "mode": "voice",
            "duration_minutes": 5,
            "user_name": "Ada Lovelace",
            "user_email": "ada@example.com",
            "consent": {"granted": True},
        },
        headers=get_auth_headers(),
    )
    assert start_resp.status_code == 200
    start_body = start_resp.json()
    assert start_body["mode"] == "voice"
    session_id = start_body["session_id"]

    chat_resp = client.post(
        "/api/chat",
        json={"session_id": session_id, "user_message": "I enjoy working with teams."},
        headers=get_auth_headers(),
    )
    assert chat_resp.status_code == 200
    assert chat_resp.json()["mode"] == "voice"

    finish_resp = client.post(
        "/api/session/finish", json={"session_id": session_id}, headers=get_auth_headers()
    )
    assert finish_resp.status_code == 200

    audio_payload = {
        "session_id": session_id,
        "audio_base64": base64.b64encode(b"fake-mp3-data").decode("ascii"),
        "mime_type": "audio/mpeg",
        "report_date": "2024-05-18T10:00:00Z",
    }
    audio_resp = client.post("/api/session/audio", json=audio_payload, headers=get_auth_headers())
    assert audio_resp.status_code == 200
    audio_body = audio_resp.json()
    assert audio_body["filename"].endswith(".mp3")
    stored_path = Path(audio_body["stored_path"])
    assert stored_path.exists()

    eval_resp = client.post(
        "/api/evaluate", json={"session_id": session_id}, headers=get_auth_headers()
    )
    assert eval_resp.status_code == 200
    body = eval_resp.json()
    assert body["session_id"] == session_id
    assert body["cefr_level"] in {"A1", "B1", "B2", "C1", "C2"}

    report_resp = client.post(
        "/api/report", json={"evaluation": body, "session_metadata": finish_resp.json()}, headers=get_auth_headers()
    )
    assert report_resp.status_code == 200
    report_body = report_resp.json()
    assert report_body["html"].startswith("\n    <html")

    email_resp = client.post(
        "/api/email",
        json={
            "to": "test@example.com",
            "subject": "Report",
            "body": "See attached.",
            "session_id": session_id,
        },
        headers=get_auth_headers(),
    )
    assert email_resp.status_code == 503
    assert "Email service is not configured" in email_resp.json()["detail"]

    stored_path.unlink(missing_ok=True)


def test_session_requires_consent():
    client = TestClient(app)
    start_resp = client.post(
        "/api/session/start",
        json={"mode": "text", "duration_minutes": 5, "consent": {"granted": False}},
        headers=get_auth_headers(),
    )
    assert start_resp.status_code == 403
    assert start_resp.json()["detail"] == "Participant consent is required to start a session"


def test_email_with_unknown_session_id():
    client = TestClient(app)
    email_resp = client.post(
        "/api/email",
        json={
            "to": "test@example.com",
            "subject": "Report",
            "body": "Missing session.",
            "session_id": "unknown",
        },
        headers=get_auth_headers(),
    )
    assert email_resp.status_code == 404
    assert email_resp.json()["detail"] == "Session not found"
