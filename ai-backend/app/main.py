"""FastAPI application entry point.

    uvicorn app.main:app --reload
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings
from app.core.envelope import EnvelopeMiddleware

logging.basicConfig(level=settings.log_level.upper())

app = FastAPI(
    title="TICO AI Backend",
    description=(
        "AI capabilities for TICO / Code Egypt. Returns JSON decisions only — it never "
        "renders game state and never executes student code.\n\n"
        "### Wire contract\n"
        "Field names are **camelCase** on the wire (`sessionId`, `codeExcerpt`); the "
        "Python source is snake_case. Generate the client's types from `/openapi.json` "
        "rather than hand-writing them — see `client/AGENTS.md`.\n\n"
        "Every success body is wrapped as `{ data, meta }` and every error is "
        "`{ error: { code, message, request_id, retryable, details } }`, per "
        "`docs/06-data-model-and-contracts.md`. **The schemas below describe the `data` "
        "half**, which is what the client's `fetchAi<T>` unwraps to. The one exception is "
        "`POST /v1/tico/messages`, which streams SSE and is never wrapped."
    ),
    version="0.1.0",
    # Docs are ON in production, deliberately. Decided 6 September 2026.
    #
    # They were off, but only half off: `/docs` 404'd while `/openapi.json` still served
    # the whole 39 KB schema, and `/docs` is nothing more than a renderer for that file.
    # Anyone could paste the URL into a Swagger viewer and get the same UI back, so the
    # protection looked real and was not.
    #
    # Given the choice between closing both and opening both, we opened both: the client
    # team gets browsable docs, and there is nothing here worth hiding. The schema
    # describes shapes, not secrets — no keys, no prompts, no solutions.
    #
    # What this does NOT expose: every endpoint still requires a valid Supabase JWT, so
    # "Try it out" returns 401 without one. Reading the contract is not the same as
    # calling it.
    #
    # Revisit if this ever serves real students: the field descriptions explain how the
    # hint ladder withholds answers, which is a readable guide to gaming it.
    docs_url="/docs",
    redoc_url="/redoc",
)

# Outermost, so it also wraps errors raised inside CORS or auth.
app.add_middleware(EnvelopeMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/v1")
