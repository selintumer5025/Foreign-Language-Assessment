from functools import lru_cache
from pydantic import BaseModel, Field, EmailStr
import os


class EmailSettings(BaseModel):
    provider: str = Field(default="smtp", description="Email provider identifier")
    smtp_host: str | None = Field(default=None, description="SMTP server host")
    smtp_port: int = Field(default=587, description="SMTP server port")
    smtp_username: str | None = None
    smtp_password: str | None = None
    sendgrid_api_key: str | None = Field(default=None, description="SendGrid API key")
    default_sender: EmailStr | None = None


class AppSettings(BaseModel):
    target_email: EmailStr | None = Field(default=None, description="Default report recipient")
    app_base_url: str = Field(default="http://localhost:5173", description="Base URL for report links")
    store_transcripts: bool = Field(default=True, description="Whether to persist transcripts in memory")
    secret_token: str = Field(default="dev-secret", description="Simple bearer token for auth")
    report_language: str = Field(default="en", description="Report language code")
    email: EmailSettings = Field(default_factory=EmailSettings)

    @staticmethod
    def from_env() -> "AppSettings":
        return AppSettings(
            target_email=os.getenv("TARGET_EMAIL"),
            app_base_url=os.getenv("APP_BASE_URL", "http://localhost:5173"),
            store_transcripts=os.getenv("STORE_TRANSCRIPTS", "true").lower() == "true",
            secret_token=os.getenv("APP_SECRET_TOKEN", "dev-secret"),
            report_language=os.getenv("REPORT_LANGUAGE", "en"),
            email=EmailSettings(
                provider=os.getenv("EMAIL_PROVIDER", "smtp"),
                smtp_host=os.getenv("SMTP_HOST"),
                smtp_port=int(os.getenv("SMTP_PORT", "587")),
                smtp_username=os.getenv("SMTP_USERNAME"),
                smtp_password=os.getenv("SMTP_PASSWORD"),
                sendgrid_api_key=os.getenv("SENDGRID_API_KEY"),
                default_sender=os.getenv("EMAIL_DEFAULT_SENDER", os.getenv("TARGET_EMAIL")),
            ),
        )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings.from_env()
