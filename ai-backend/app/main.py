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
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
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
