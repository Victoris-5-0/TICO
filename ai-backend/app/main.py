"""FastAPI application entry point.

    uvicorn app.main:app --reload
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import settings

logging.basicConfig(level=settings.log_level.upper())

app = FastAPI(
    title="TICO AI Backend",
    description=(
        "AI capabilities for TICO / Code Egypt. Returns JSON decisions only — it never "
        "renders game state and never executes student code."
    ),
    version="0.1.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/v1")
