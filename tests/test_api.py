from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.config import get_settings


def get_auth_headers():
    token = get_settings().secret_token
    return {"Authorization": f"Bearer {token}"}


def test_session_lifecycle():
    client = TestClient(app)
    start_resp = client.post("/api/session/start", json={"mode": "text", "duration_minutes": 5}, headers=get_auth_headers())
    assert start_resp.status_code == 200
    start_body = start_resp.json()
    assert start_body["mode"] == "text"
    session_id = start_body["session_id"]

    chat_resp = client.post(
        "/api/chat",
        json={"session_id": session_id, "user_message": "I enjoy working with teams."},
        headers=get_auth_headers(),
    )
    assert chat_resp.status_code == 200
    assert chat_resp.json()["mode"] == "text"

    finish_resp = client.post(
        "/api/session/finish", json={"session_id": session_id}, headers=get_auth_headers()
    )
    assert finish_resp.status_code == 200

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
        json={"to": "test@example.com", "subject": "Report", "body": "See attached."},
        headers=get_auth_headers(),
    )
    assert email_resp.status_code == 503
    assert "Email service is not configured" in email_resp.json()["detail"]
