"""v1 router assembly.

Routers only — HTTP in, HTTP out, no logic.

All seven endpoints exist from day one as stubs: **the shapes are final, the behaviour
is fake.** Each is replaced by real logic as its milestone lands, and the client never
has to change a call signature.

    /v1/health                      always real
    /v1/sessions                    M1
    /v1/hints                       M2   <- first demo-able
    /v1/submissions/analyze         M3
    /v1/students/{id}/refresh       M4
    /v1/students/{id}/plan          M4
    /v1/missions/next               M5   <- MVP complete
    /v1/tico/messages               M6   (SSE)
    /v1/challenges/next             M6

A stubbed response carries `X-TICO-Stub: 1`. When that header disappears from an
endpoint, its real implementation has landed.
"""

from fastapi import APIRouter

from app.api.v1 import health, hints, missions, sessions, students, submissions, tico

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(sessions.router)
api_router.include_router(hints.router)
api_router.include_router(submissions.router)
api_router.include_router(students.router)
api_router.include_router(missions.router)
api_router.include_router(tico.router)
