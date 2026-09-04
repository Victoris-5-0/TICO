"""v1 router assembly.

Routers only — HTTP in, HTTP out, no logic. Endpoints are added here as each milestone
lands: hints (M2), submissions (M3), students (M4), missions (M5), tico + challenges (M6).
"""

from fastapi import APIRouter

from app.api.v1 import health

api_router = APIRouter()
api_router.include_router(health.router)
