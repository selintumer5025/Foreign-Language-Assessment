from __future__ import annotations

import base64
import binascii
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid

from fastapi import HTTPException, status

from ..config import get_settings
from ..models import EmailRequest, EmailResponse

logger = logging.getLogger(__name__)


def _build_email_message(payload: EmailRequest, sender: str) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = payload.subject
    message["From"] = sender
    message["To"] = payload.to

    plain_body = payload.body
    message.set_content(plain_body)

    if payload.links:
        links_html = "".join(f'<li><a href="{link}">{link}</a></li>' for link in payload.links)
        html_body = f"<p>{payload.body}</p>"
        if links_html:
            html_body += f"<ul>{links_html}</ul>"
        message.add_alternative(html_body, subtype="html")

    if payload.attachments:
        for attachment in payload.attachments:
            try:
                file_bytes = base64.b64decode(attachment.data, validate=True)
            except (binascii.Error, ValueError) as exc:
                logger.warning("Failed to decode email attachment %s: %s", attachment.filename, exc)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid attachment provided: {attachment.filename}",
                ) from exc

            maintype, subtype = "application", "octet-stream"
            if "/" in attachment.content_type:
                parts = attachment.content_type.split("/", 1)
                maintype, subtype = parts[0], parts[1]

            message.add_attachment(
                file_bytes,
                maintype=maintype,
                subtype=subtype,
                filename=attachment.filename,
            )

    return message


def send_email(payload: EmailRequest) -> EmailResponse:
    settings = get_settings()
    missing = settings.email.missing_fields()
    if missing:
        logger.warning("Email configuration missing fields: %s", ", ".join(missing))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Email service is not configured: missing {', '.join(missing)}",
        )

    message = _build_email_message(payload, sender=str(settings.email.default_sender))
    context = ssl.create_default_context()

    try:
        if settings.email.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.email.smtp_host, settings.email.smtp_port, context=context) as server:
                server.login(settings.email.smtp_username, settings.email.smtp_password)
                server.send_message(message)
        else:
            with smtplib.SMTP(settings.email.smtp_host, settings.email.smtp_port) as server:
                server.starttls(context=context)
                server.login(settings.email.smtp_username, settings.email.smtp_password)
                server.send_message(message)
    except Exception as exc:  # pragma: no cover - network interaction
        logger.exception("Failed to send email: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to send email") from exc

    message_id = make_msgid(domain=settings.email.smtp_host)
    logger.info("Email sent successfully to %s", payload.to)
    return EmailResponse(status="sent", message_id=message_id)
