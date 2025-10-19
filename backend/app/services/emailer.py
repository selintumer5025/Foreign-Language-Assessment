from __future__ import annotations

import uuid
import logging

from ..config import get_settings
from ..models import EmailRequest, EmailResponse

logger = logging.getLogger(__name__)


def send_email(payload: EmailRequest) -> EmailResponse:
    settings = get_settings()
    logger.info(
        "Sending email via %s to %s with subject %s", settings.email.provider, payload.to, payload.subject
    )
    # In a production implementation we would integrate with SMTP or SendGrid here.
    # For now we simulate delivery and return a deterministic message id.
    message_id = f"mock-{uuid.uuid4()}"
    return EmailResponse(status="queued", message_id=message_id)
