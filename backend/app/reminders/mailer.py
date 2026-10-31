"""Sends email over SMTP with the standard library. No credentials ever leave the server."""

import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr

from app.config import Settings

SEND_TIMEOUT_SECONDS = 20


class MailError(RuntimeError):
    """The SMTP server refused or couldn't be reached. The message is safe to show the user."""


def configured(settings: Settings) -> bool:
    return bool(settings.smtp_host)


def sender(settings: Settings) -> str:
    raw = settings.smtp_from or settings.smtp_username or "reminders@penny.local"
    name, address = parseaddr(raw)
    return formataddr((name or "Penny", address or raw))


def build_message(settings: Settings, to: str, subject: str, text: str, body: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = sender(settings)
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain="penny.local")
    message.set_content(text)
    message.add_alternative(body, subtype="html")
    return message


def _send(settings: Settings, message: EmailMessage) -> None:
    host = settings.smtp_host or ""
    password = settings.smtp_password.get_secret_value() if settings.smtp_password else None
    context = ssl.create_default_context()
    try:
        if settings.smtp_security == "ssl":
            client: smtplib.SMTP = smtplib.SMTP_SSL(
                host, settings.smtp_port, timeout=SEND_TIMEOUT_SECONDS, context=context
            )
        else:
            client = smtplib.SMTP(host, settings.smtp_port, timeout=SEND_TIMEOUT_SECONDS)
        with client:
            if settings.smtp_security == "starttls":
                client.starttls(context=context)
            if settings.smtp_username and password:
                client.login(settings.smtp_username, password)
            client.send_message(message)
    except smtplib.SMTPAuthenticationError as error:
        raise MailError("The email server rejected Penny’s username or password.") from error
    except (smtplib.SMTPException, OSError) as error:
        raise MailError(f"The email couldn’t be sent ({type(error).__name__}).") from error


async def send(settings: Settings, message: EmailMessage) -> None:
    """Sends without blocking the event loop."""
    await asyncio.to_thread(_send, settings, message)
