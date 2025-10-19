from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field, EmailStr
import os


ENV_FILE_PATH = Path(__file__).resolve().parents[2] / ".env"


def _load_env_file() -> None:
    if not ENV_FILE_PATH.exists():
        return

    for line in ENV_FILE_PATH.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value


def _persist_env_var(key: str, value: str) -> None:
    lines: list[str]
    if ENV_FILE_PATH.exists():
        lines = ENV_FILE_PATH.read_text().splitlines()
    else:
        ENV_FILE_PATH.touch()
        lines = []

    updated = False
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            new_lines.append(line)
            continue

        current_key, _, _ = line.partition("=")
        if current_key.strip() == key and not updated:
            new_lines.append(f"{key}={value}")
            updated = True
        else:
            new_lines.append(line)

    if not updated:
        if new_lines and new_lines[-1].strip() != "":
            new_lines.append("")
        new_lines.append(f"{key}={value}")

    ENV_FILE_PATH.write_text("\n".join(new_lines) + "\n")


_load_env_file()


class EmailSettings(BaseModel):
    provider: str = Field(default="smtp", description="Email provider identifier")
    smtp_host: str | None = Field(default=None, description="SMTP server host")
    smtp_port: int = Field(default=587, description="SMTP server port")
    smtp_username: str | None = None
    smtp_password: str | None = None
    sendgrid_api_key: str | None = Field(default=None, description="SendGrid API key")
    default_sender: EmailStr | None = None

    def missing_fields(self) -> list[str]:
        if self.provider.lower() != "smtp":
            return []

        missing: list[str] = []
        if not self.smtp_host:
            missing.append("smtp_host")
        if not self.smtp_username:
            missing.append("smtp_username")
        if not self.smtp_password:
            missing.append("smtp_password")
        if not self.default_sender:
            missing.append("default_sender")
        if not self.smtp_port:
            missing.append("smtp_port")
        return missing

    @property
    def is_configured(self) -> bool:
        return len(self.missing_fields()) == 0


class AppSettings(BaseModel):
    target_email: EmailStr | None = Field(default=None, description="Default report recipient")
    app_base_url: str = Field(default="http://localhost:5173", description="Base URL for report links")
    store_transcripts: bool = Field(default=True, description="Whether to persist transcripts in memory")
    secret_token: str = Field(default="dev-secret", description="Simple bearer token for auth")
    report_language: str = Field(default="en", description="Report language code")
    email: EmailSettings = Field(default_factory=EmailSettings)
    gpt5_api_key: str | None = Field(default=None, description="API key for GPT-5 evaluation")
    gpt5_api_base_url: str = Field(default="https://api.openai.com/v1", description="Base URL for GPT-5 compatible APIs")
    gpt5_model: str = Field(default="gpt-5", description="Model identifier to request for GPT-5 evaluations")
    gpt5_temperature: float | None = Field(
        default=None,
        description="Optional sampling temperature for GPT-5 evaluations; omit to use API default.",
    )

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
            gpt5_api_key=os.getenv("GPT5_API_KEY"),
            gpt5_api_base_url=os.getenv("GPT5_API_BASE_URL", "https://api.openai.com/v1"),
            gpt5_model=os.getenv("GPT5_MODEL", "gpt-5"),
            gpt5_temperature=_load_temperature(),
        )


def _load_temperature() -> float | None:
    raw = os.getenv("GPT5_TEMPERATURE")
    if raw is None or raw.strip() == "":
        return None

    try:
        return float(raw)
    except ValueError as exc:  # pragma: no cover - config error surfaced during startup
        raise ValueError("GPT5_TEMPERATURE must be a numeric value") from exc


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings.from_env()


def set_gpt5_api_key(api_key: str) -> AppSettings:
    os.environ["GPT5_API_KEY"] = api_key
    _persist_env_var("GPT5_API_KEY", api_key)
    get_settings.cache_clear()
    return get_settings()


def set_email_settings(**kwargs: str | int | None) -> AppSettings:
    env_mapping = {
        "provider": "EMAIL_PROVIDER",
        "smtp_host": "SMTP_HOST",
        "smtp_port": "SMTP_PORT",
        "smtp_username": "SMTP_USERNAME",
        "smtp_password": "SMTP_PASSWORD",
        "default_sender": "EMAIL_DEFAULT_SENDER",
        "target_email": "TARGET_EMAIL",
    }

    updated = False
    for key, value in kwargs.items():
        if key not in env_mapping or value in (None, ""):
            continue
        env_key = env_mapping[key]
        os.environ[env_key] = str(value)
        _persist_env_var(env_key, str(value))
        updated = True

    if updated:
        get_settings.cache_clear()

    return get_settings()
