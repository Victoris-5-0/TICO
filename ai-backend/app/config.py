"""Settings. The only place in this service that reads environment variables.

Everything else imports `settings` from here. `os.environ` anywhere else is a bug.
"""

from __future__ import annotations

from functools import lru_cache
from typing import ClassVar

from pydantic import ValidationError, model_validator
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

    # --- output budgets: gemini-3.5-flash is a THINKING model ----------------
    #
    # This is not tuning, it is a correctness floor. `gemini-3.5-flash` spends output
    # tokens on internal reasoning BEFORE emitting a single visible character, and that
    # reasoning is charged against `max_output_tokens`. Measured on 2026-09-06:
    #
    #   flash-lite, budget 400 -> out=77   reasoning=0    visible=77   finish=STOP
    #   flash,      budget 400 -> out=396  reasoning=384  visible=12   finish=MAX_TOKENS
    #   flash,      budget 1500 -> out=740 reasoning=662  visible=78   finish=STOP
    #
    # So flash burns roughly 300-700 tokens before saying anything. Give it a small
    # budget and it truncates mid-word with finish_reason MAX_TOKENS — and for
    # generation, mid-JSON. That failure reads as "the model is bad at JSON" and is
    # actually this. Never set a flash budget below ~1200.
    #
    # flash-lite has no reasoning overhead at all, which is the real reason the hint
    # ladder uses it: 1.1s and every token is visible output.
    max_tokens_hint: int = 400
    max_tokens_npc: int = 400
    max_tokens_classify: int = 600
    max_tokens_review: int = 2000
    max_tokens_generate: int = 8000  # a whole mission: brief, starter code, tests
    max_tokens_chat: int = 2000

    #: Below this, a thinking model can consume the entire budget on reasoning and
    #: return an empty or truncated string. `ai/router.py` should refuse to build a
    #: thinking-model client under it rather than fail at request time.
    THINKING_MODEL_MIN_TOKENS: ClassVar[int] = 1200

    # --- app ----------------------------------------------------------------
    environment: str = "development"
    log_level: str = "INFO"
    daily_model_call_cap: int = 200
    cors_origins: str = "http://localhost:3000"

    @property
    def jwks_url(self) -> str:
        """Supabase publishes the public keys here. Empty when not configured.

        The path is the RFC 8615 well-known one. `/auth/v1/jwks` looks plausible and is
        what this returned at first, but it 404s — which is silent, because a failed
        fetch just falls through to the HS256 branch and every request then 401s with no
        clue why. Verified against a live project before changing.
        """
        if not self.supabase_url:
            return ""
        return self.supabase_url.rstrip("/") + "/auth/v1/.well-known/jwks.json"

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

    @model_validator(mode="after")
    def validate_production_keys(self) -> Settings:
        if self.is_production and not self.google_api_key.strip():
            raise ValueError(
                "Missing required environment variable: GOOGLE_API_KEY is required in production."
            )
        return self


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
        if any("production" in str(e).lower() or "google_api_key" in str(e).lower() for e in exc.errors()):
            raise ValueError(f"Missing required environment variable: GOOGLE_API_KEY.\n{problems}") from exc
        raise SystemExit(_MISSING_ENV_HELP.format(problems=problems)) from None


settings = get_settings()
