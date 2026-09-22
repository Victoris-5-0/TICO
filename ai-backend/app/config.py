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
    #: The debrief writes one or two sentences, but the budget also has to cover whatever
    #: reasoning the model emits before them. At 400 — borrowed from the hint budget — the
    #: reasoning consumed it and the sentence arrived truncated mid-word, once with the
    #: model's own notes about error tags in place of the sentence.
    max_tokens_debrief: int = 1200
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

    #: May this service call Gemini to compose a mission at all?
    #:
    #: **False is the default, and it is a hard gate rather than a preference.** Every
    #: path that would reach `ai/chains/mission_gen` refuses instead — `/v1/missions/next`,
    #: `/v1/missions/by-lesson`, `/v1/missions/generate` and `/v1/challenges/next`.
    #: Missions come from the prepared set and the validated pool, or the caller gets a
    #: 503. `forceRegenerate` on a request does **not** lift it: a gate a client can talk
    #: its way past is not a gate.
    #:
    #: It defaults off, and stays off when nobody sets it, because the failure is silent
    #: and expensive in exactly the place it is least wanted. An unset variable is the
    #: normal state of a fresh production deploy, `validate_production_keys` guarantees
    #: there is a usable `GOOGLE_API_KEY` sitting next to it, and the cost of defaulting
    #: the other way is a 25-second wait and a Gemini bill on somebody's first click.
    #: Off, the worst case is a 503 the client already has a fallback for.
    #:
    #: True sends mission requests through the real pipeline: Gemini writes a scenario,
    #: the Python validator runs its code, and the student plays something that did not
    #: exist a minute ago. Twenty to thirty seconds each.
    #:
    #: **Mission generation only.** Hints, TICO chat, the debrief and error
    #: classification still call the model — they are short, cached, and sit inside the
    #: student's own loop. `daily_model_call_cap` is what bounds those.
    live_mission_generation: bool = False
    # Isharet Cairo has reviewed scene mechanics and two local fallback missions.
    # Its authored progression may call the model even while other worlds stay gated.
    traffic_live_mission_generation: bool = True

    allow_demo_auth: bool = False
    log_level: str = "INFO"
    daily_model_call_cap: int = 200
    cors_origins: str = "http://localhost:3000"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

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
