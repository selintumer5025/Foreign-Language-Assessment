from __future__ import annotations

import base64
import binascii
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import make_msgid

from fastapi import HTTPException, status
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Attachment as SendGridAttachment
from sendgrid.helpers.mail import Disposition as SendGridDisposition
from sendgrid.helpers.mail import FileContent as SendGridFileContent
from sendgrid.helpers.mail import FileName as SendGridFileName
from sendgrid.helpers.mail import FileType as SendGridFileType
from sendgrid.helpers.mail import Mail

from ..config import get_settings
from ..models import EmailRequest, EmailResponse

logger = logging.getLogger(__name__)


def _build_html_body(payload: EmailRequest) -> str:
    html_body = f"<p>{payload.body}</p>"
    if payload.links:
        links_html = "".join(f'<li><a href="{link}">{link}</a></li>' for link in payload.links)
        if links_html:
            html_body += f"<ul>{links_html}</ul>"
    return html_body


def _process_attachments(payload: EmailRequest) -> list[dict[str, object]]:
    processed: list[dict[str, object]] = []
    if not payload.attachments:
        return processed

    print(f"\n[EMAILER] Building email with {len(payload.attachments)} attachment(s)")
    logger.info("Building email with %d attachment(s)", len(payload.attachments))

    for idx, attachment in enumerate(payload.attachments):
        try:
            print(f"[EMAILER] Processing attachment {idx+1}/{len(payload.attachments)}: {attachment.filename}")
            print(f"[EMAILER]   Type: {attachment.content_type}, Encoded size: {len(attachment.data)} bytes")
            logger.debug(
                "Processing attachment %d/%d: %s (type: %s, encoded size: %d bytes)",
                idx + 1,
                len(payload.attachments),
                attachment.filename,
                attachment.content_type,
                len(attachment.data),
            )
            file_bytes = base64.b64decode(attachment.data, validate=True)
            print(f"[EMAILER] Attachment {attachment.filename} decoded successfully, size: {len(file_bytes)} bytes")
            logger.debug(
                "Attachment %s decoded successfully, size: %d bytes",
                attachment.filename,
                len(file_bytes),
            )
        except (binascii.Error, ValueError) as exc:
            logger.error(
                "Failed to decode email attachment %s (type: %s, encoded size: %d): %s",
                attachment.filename,
                attachment.content_type,
                len(attachment.data) if attachment.data else 0,
                exc,
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid attachment provided: {attachment.filename}",
            ) from exc

        maintype, subtype = "application", "octet-stream"
        if "/" in attachment.content_type:
            parts = attachment.content_type.split("/", 1)
            maintype, subtype = parts[0], parts[1]

        processed.append(
            {
                "filename": attachment.filename,
                "maintype": maintype,
                "subtype": subtype,
                "file_bytes": file_bytes,
                "encoded": base64.b64encode(file_bytes).decode(),
            }
        )

        print(
            f"[EMAILER] ✅ Attachment {attachment.filename} added successfully ({maintype}/{subtype}, {len(file_bytes)} bytes)"
        )
        logger.info(
            "Attachment %s added successfully (%s/%s, %d bytes)",
            attachment.filename,
            maintype,
            subtype,
            len(file_bytes),
        )

    return processed


def _build_email_message(payload: EmailRequest, sender: str, attachments: list[dict[str, object]]) -> EmailMessage:
    message = EmailMessage()
    message["Subject"] = payload.subject
    message["From"] = sender
    message["To"] = payload.to

    plain_body = payload.body
    message.set_content(plain_body)

    html_body = _build_html_body(payload)
    if payload.links:
        message.add_alternative(html_body, subtype="html")

    if attachments:
        for attachment in attachments:
            message.add_attachment(
                attachment["file_bytes"],
                maintype=str(attachment["maintype"]),
                subtype=str(attachment["subtype"]),
                filename=str(attachment["filename"]),
            )

    return message


def _send_via_sendgrid(
    payload: EmailRequest, html_body: str, attachments: list[dict[str, object]]
) -> EmailResponse:
    settings = get_settings()
    if not settings.email.sendgrid_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SendGrid API key is not configured",
        )

    print("[EMAILER] Using SendGrid fallback for email delivery")
    print(f"[EMAILER] SendGrid API key: {'SET' if settings.email.sendgrid_api_key else 'NOT SET'}")
    print(f"[EMAILER] SendGrid API key length: {len(settings.email.sendgrid_api_key) if settings.email.sendgrid_api_key else 0}")
    print(f"[EMAILER] SendGrid sender: {settings.email.default_sender}")
    logger.info("Using SendGrid fallback for email delivery")

    if not settings.email.default_sender:
        error_msg = "SendGrid requires a verified sender email (EMAIL_DEFAULT_SENDER or TARGET_EMAIL)"
        print(f"[EMAILER] ❌ {error_msg}")
        logger.error(error_msg)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=error_msg,
        )

    message = Mail(
        from_email=settings.email.default_sender,
        to_emails=payload.to,
        subject=payload.subject,
        html_content=html_body,
        plain_text_content=payload.body,
    )

    for attachment in attachments:
        sg_attachment = SendGridAttachment(
            file_content=SendGridFileContent(str(attachment["encoded"])),
            file_type=SendGridFileType(f"{attachment['maintype']}/{attachment['subtype']}"),
            file_name=SendGridFileName(str(attachment["filename"])),
            disposition=SendGridDisposition("attachment"),
        )
        message.add_attachment(sg_attachment)

    try:
        print(f"\n{'='*80}")
        print(f"[SENDGRID] Attempting to send email via SendGrid...")
        print(f"[SENDGRID] From: {settings.email.default_sender}")
        print(f"[SENDGRID] To: {payload.to}")
        print(f"[SENDGRID] Subject: {payload.subject}")
        print(f"[SENDGRID] Attachments: {len(attachments)}")
        print(f"[SENDGRID] API Key length: {len(settings.email.sendgrid_api_key)}")
        print(f"{'='*80}\n")
        
        sg = SendGridAPIClient(settings.email.sendgrid_api_key)
        print(f"[SENDGRID] SendGrid client created successfully")
        
        response = sg.send(message)
        print(f"\n[SENDGRID] Response received from SendGrid:")
        print(f"[SENDGRID]   Status Code: {response.status_code}")
        print(f"[SENDGRID]   Headers: {dict(response.headers)}")
        print(f"[SENDGRID]   Body: {response.body}")
        
        message_id = (
            response.headers.get("X-Message-Id")
            or response.headers.get("X-Message-ID")
            or make_msgid(domain="sendgrid.net")
        )
        print(f"\n[SENDGRID] ✅ EMAIL SENT SUCCESSFULLY!")
        print(f"[SENDGRID] Message ID: {message_id}")
        print(f"[SENDGRID] Status: {response.status_code}")
        print(f"{'='*80}\n")
        
        logger.info("Email sent successfully via SendGrid with message_id %s (status: %d)", message_id, response.status_code)
        return EmailResponse(status="sent", message_id=message_id)
    except Exception as exc:  # pragma: no cover - network interaction
        print(f"\n{'='*80}")
        print(f"[SENDGRID] ❌ FAILED TO SEND EMAIL VIA SENDGRID!")
        print(f"[SENDGRID] Error type: {type(exc).__name__}")
        print(f"[SENDGRID] Error message: {str(exc)}")
        print(f"[SENDGRID] Full error details: {repr(exc)}")
        if hasattr(exc, 'body'):
            print(f"[SENDGRID] Error body: {exc.body}")
        if hasattr(exc, 'status_code'):
            print(f"[SENDGRID] Status code: {exc.status_code}")
        print(f"{'='*80}\n")

        # Provide more specific error messages for common issues
        error_detail = str(exc)
        if "403" in str(exc) or "Forbidden" in str(exc):
            print("[EMAILER] 📋 SendGrid 403 Error - Common causes:")
            print("[EMAILER]   1. Invalid API key - Check SENDGRID_API_KEY is correct")
            print("[EMAILER]   2. Unverified sender - Verify sender email in SendGrid dashboard")
            print("[EMAILER]   3. API key lacks send permissions - Check API key scope")
            print(f"[EMAILER]   Current sender: {settings.email.default_sender}")
            error_detail = (
                f"SendGrid authentication failed (403 Forbidden). "
                f"Please verify: (1) SENDGRID_API_KEY is valid, "
                f"(2) sender email '{settings.email.default_sender}' is verified in SendGrid, "
                f"(3) API key has 'Mail Send' permissions. "
                f"Original error: {str(exc)}"
            )
        elif "401" in str(exc) or "Unauthorized" in str(exc):
            error_detail = f"SendGrid API key is invalid or expired. Please check SENDGRID_API_KEY. Original error: {str(exc)}"

        logger.exception("Failed to send email via SendGrid: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=error_detail,
        ) from exc


def _send_via_smtp(
    payload: EmailRequest, message: EmailMessage, attachments: list[dict[str, object]]
) -> EmailResponse:
    settings = get_settings()
    context = ssl.create_default_context()

    try:
        print(f"[EMAILER] Connecting to SMTP server {settings.email.smtp_host}:{settings.email.smtp_port}")
        logger.debug("Connecting to SMTP server %s:%d", settings.email.smtp_host, settings.email.smtp_port)
        if settings.email.smtp_port == 465:
            print(f"[EMAILER] Using SMTP_SSL (port 465)")
            with smtplib.SMTP_SSL(settings.email.smtp_host, settings.email.smtp_port, context=context) as server:
                print(f"[EMAILER] Connected successfully, logging in as {settings.email.smtp_username}")
                logger.debug("Logging in to SMTP server as %s", settings.email.smtp_username)
                server.login(settings.email.smtp_username, settings.email.smtp_password)
                print(f"[EMAILER] Login successful, sending email message")
                logger.debug("Sending email message")
                server.send_message(message)
                print(f"[EMAILER] ✅ Email sent successfully via SMTP_SSL")
        else:
            print(f"[EMAILER] Using SMTP with STARTTLS (port {settings.email.smtp_port})")
            with smtplib.SMTP(settings.email.smtp_host, settings.email.smtp_port) as server:
                print(f"[EMAILER] Connected, starting TLS")
                logger.debug("Starting TLS")
                server.starttls(context=context)
                print(f"[EMAILER] TLS started, logging in as {settings.email.smtp_username}")
                logger.debug("Logging in to SMTP server as %s", settings.email.smtp_username)
                server.login(settings.email.smtp_username, settings.email.smtp_password)
                print(f"[EMAILER] Login successful, sending email message")
                logger.debug("Sending email message")
                server.send_message(message)
                print(f"[EMAILER] ✅ Email sent successfully via SMTP+STARTTLS")
    except Exception as exc:  # pragma: no cover - network interaction
        print(f"[EMAILER] ❌ FAILED to send email!")
        print(f"[EMAILER] Error type: {type(exc).__name__}")
        print(f"[EMAILER] Error message: {str(exc)}")

        # Provide specific guidance for common SMTP errors
        error_detail = str(exc)
        if "Network is unreachable" in str(exc) or "Connection refused" in str(exc):
            print("[EMAILER] 📋 Network Error - SMTP connection blocked")
            print("[EMAILER]   This usually happens when cloud platforms block outbound SMTP ports")
            print("[EMAILER]   Render.com blocks ports 25, 465, and 587 to prevent spam")
            print("[EMAILER]   Solution: Configure SendGrid (SENDGRID_API_KEY) for email delivery")
            error_detail = (
                f"SMTP connection failed - outbound SMTP ports may be blocked by hosting platform. "
                f"Configure SendGrid (SENDGRID_API_KEY) for reliable email delivery. "
                f"Original error: {str(exc)}"
            )
        elif "Authentication failed" in str(exc) or "Username and Password not accepted" in str(exc):
            error_detail = f"SMTP authentication failed. Check SMTP_USERNAME and SMTP_PASSWORD. Original error: {str(exc)}"

        logger.exception(
            "Failed to send email to %s via %s:%d - Error: %s",
            payload.to,
            settings.email.smtp_host,
            settings.email.smtp_port,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=error_detail,
        ) from exc

    message_id = make_msgid(domain=settings.email.smtp_host)
    print(f"[EMAILER] Message ID: {message_id}")
    logger.info("Email sent successfully to %s with message_id %s", payload.to, message_id)
    print(f"[EMAILER] ✅✅✅ EMAIL SEND COMPLETE ✅✅✅\n")
    return EmailResponse(status="sent", message_id=message_id)


def send_email(payload: EmailRequest) -> EmailResponse:
    print(f"\n[EMAILER] send_email called")
    print(f"[EMAILER] Recipient: {payload.to}")
    print(f"[EMAILER] Subject: {payload.subject}")
    print(f"[EMAILER] Body length: {len(payload.body)} chars")
    print(f"[EMAILER] Attachments: {len(payload.attachments) if payload.attachments else 0}")

    settings = get_settings()
    print(f"[EMAILER] SMTP Host: {settings.email.smtp_host}")
    print(f"[EMAILER] SMTP Port: {settings.email.smtp_port}")
    print(f"[EMAILER] SMTP Username: {settings.email.smtp_username}")
    print(f"[EMAILER] Default Sender: {settings.email.default_sender}")

    missing = settings.email.missing_fields()
    if missing:
        print(f"[EMAILER] ❌ ERROR: Missing email configuration fields: {', '.join(missing)}")
        logger.warning("Email configuration missing fields: %s", ", ".join(missing))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Email service is not configured: missing {', '.join(missing)}",
        )

    print(f"[EMAILER] ✅ Email configuration is complete")
    logger.info(
        "Sending email to %s with subject '%s' and %d attachment(s)",
        payload.to,
        payload.subject,
        len(payload.attachments) if payload.attachments else 0,
    )

    attachments = _process_attachments(payload)
    html_body = _build_html_body(payload)
    try:
        message = _build_email_message(payload, sender=str(settings.email.default_sender), attachments=attachments)
    except Exception as exc:
        logger.exception("Failed to build email message: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to build email message: {str(exc)}",
        ) from exc

    if settings.email.is_smtp_configured:
        try:
            return _send_via_smtp(payload, message, attachments)
        except HTTPException as exc:
            if settings.email.sendgrid_api_key:
                print("[EMAILER] Falling back to SendGrid after SMTP failure")
                logger.info("Falling back to SendGrid after SMTP failure")
                return _send_via_sendgrid(payload, html_body, attachments)
            raise exc

    if settings.email.sendgrid_api_key:
        print("[EMAILER] SMTP not configured; using SendGrid")
        logger.info("SMTP not configured; using SendGrid")
        return _send_via_sendgrid(payload, html_body, attachments)

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Email service is not configured for SMTP or SendGrid",
    )
