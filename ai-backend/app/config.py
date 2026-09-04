"""Settings. The only place in this service that reads environment variables.

Everything else imports `settings` from here. `os.environ` anywhere else is a bug.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- database -----------------------------------------------------------
    # The same Postgres the Next.js client uses. Prisma owns the schema; this
    # service only reads and writes. Use the session pooler connection string.
    database_url: str

    # --- auth ---------------------------------------------------------------
    # We verify tokens, we never issue them. Supabase Auth owns login.
    #
    # Two signing modes, both supported:
    #   A. JWT Signing Keys (asymmetric ES256) — the current Supabase default.
    #      Set supabase_url; the public keys are fetched from its JWKS endpoint.
    #   B. Legacy shared secret (HS256) — older projects. Set jwt_secret.
    #
    # Verification tries JWKS first, then the shared secret. With neither set
    # and outside production, the service runs in dev mode.
    supabase_url: str = ""
    jwt_secret: str = ""
    jwt_audience: str = "authenticated"
    jwt_algorithms: str = "HS256"
    supabase_service_role_key: str = ""

    # --- Google Gemini ------------------------------------------------------
    google_api_key: str = ""

    # Capability -> model. Read from settings so the map changes without a deploy.
    # Stable ids only: no -preview (gemini-3-pro-preview is already shut down) and
    # no gemini-2.5-* (retires 2026-10-20).
    model_hint: str = "gemini-3.5-flash-lite"
    model_npc: str = "gemini-3.5-flash-lite"
    model_classify: str = "gemini-3.5-flash-lite"
    model_review: str = "gemini-3.5-flash"
    model_generate: str = "gemini-3.5-flash"
    model_chat: str = "gemini-3.5-flash"

    # --- app ----------------------------------------------------------------
    environment: str = "development"
    log_level: str = "INFO"
    daily_model_call_cap: int = 200
    cors_origins: str = "http://localhost:3000"

    @property
    def jwks_url(self) -> str:
        """Supabase publishes the public keys here. Empty when not configured."""
        if not self.supabase_url:
            return ""
        return self.supabase_url.rstrip("/") + "/auth/v1/jwks"

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url or self.jwt_secret)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def jwt_algorithm_list(self) -> list[str]:
        return [a.strip() for a in self.jwt_algorithms.split(",") if a.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


_MISSING_ENV_HELP = """
tico-ai could not start: required settings are missing.

  {problems}

Most likely you have no .env file yet. From ai-backend/:

    cp .env.example .env

then open it and fill in the blanks. DATABASE_URL is the only one needed to boot -
the others can stay empty until you wire up auth and Gemini. /health will report
"unreachable" until the database is real, which is the correct answer, not a bug.
"""


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        problems = "\n  ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()
        )
        raise SystemExit(_MISSING_ENV_HELP.format(problems=problems)) from None


settings = get_settings()
