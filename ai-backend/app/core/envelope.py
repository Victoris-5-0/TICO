"""The `{ data, meta }` success envelope and the `{ error }` failure shape.

`docs/06-data-model-and-contracts.md` is the cross-service contract authority, and it
mandates both, plus an `X-Request-ID` on every `/v1` request. This module is the single
place that implements them.

**Why a middleware rather than `response_model=Envelope[T]` on eleven routes.**
The client's `fetchAi<T>` unwraps with `data.data || data` and returns `T` — the *inner*
model. If the routes declared the envelope, `openapi.json` would describe the wrapper and
the generated TypeScript would be a level deeper than the code that consumes it. Wrapping
at the transport layer keeps the schema describing exactly what `fetchAi<T>` hands back,
which is what makes generated types correct instead of merely present.

The envelope itself is documented in the OpenAPI description and in
`docs/contracts.md`, so it is not invisible just because it is not per-route.
"""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

log = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
STUB_HEADER = "X-TICO-Stub"

#: Wrapping is for the JSON API only. SSE must stay a raw token stream — an envelope
#: around it would defeat the point of streaming — and the docs/schema routes are not
#: part of the contract.
_UNWRAPPED_PREFIXES = ("/docs", "/openapi.json", "/redoc")


def error_body(
    *,
    code: str,
    message: str,
    request_id: str,
    retryable: bool = False,
    details: dict | None = None,
) -> dict:
    """Build the docs/06 error object. Field names stay snake_case, as specified there."""
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "retryable": retryable,
            "details": details or {},
        }
    }


class EnvelopeMiddleware(BaseHTTPMiddleware):
    """Assigns a request id, then wraps JSON `/v1` responses in `{ data, meta }`.

    A response is left alone if it is already enveloped, is an error (errors have their
    own shape), or is not JSON. That last case is what keeps
    `POST /v1/tico/messages` streaming.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id

        path = request.url.path
        if any(path.startswith(p) for p in _UNWRAPPED_PREFIXES):
            return response
        if not response.headers.get("content-type", "").startswith("application/json"):
            return response

        body = b"".join([chunk async for chunk in response.body_iterator])
        try:
            payload = json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Not something we can safely rewrite; pass it through untouched.
            return _rebuild(response, body)

        if isinstance(payload, dict) and ("error" in payload or "data" in payload):
            return _rebuild(response, body)  # already in a contract shape

        if response.status_code >= 400:
            payload = _as_error(payload, request_id, response.status_code)
        else:
            payload = {
                "data": payload,
                "meta": {
                    "request_id": request_id,
                    "stub": response.headers.get(STUB_HEADER) == "1",
                    "cached": bool(isinstance(payload, dict) and payload.get("cached")),
                },
            }

        return _rebuild(response, json.dumps(payload).encode())


def _as_error(payload, request_id: str, status: int) -> dict:
    """Normalise FastAPI's `{"detail": ...}` into the docs/06 error object.

    Validation failures (422) carry a list of field errors. Those are developer-facing
    and safe to pass through in `details` — they name fields, never values.
    """
    detail = payload.get("detail") if isinstance(payload, dict) else payload

    if isinstance(detail, list):
        return error_body(
            code="validation_error",
            message="The request body did not match the contract.",
            request_id=request_id,
            retryable=False,
            details={"fields": detail},
        )

    return error_body(
        code=_CODE_BY_STATUS.get(status, "internal_error"),
        message=str(detail) if detail else "Something went wrong.",
        request_id=request_id,
        # 429 and 5xx are worth retrying; a 4xx the client caused is not.
        retryable=status == 429 or status >= 500,
    )


_CODE_BY_STATUS = {
    400: "bad_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    503: "service_unavailable",
}


def _rebuild(response, body: bytes) -> JSONResponse:
    """Reassemble a streamed response as a plain one, with a corrected length."""
    headers = dict(response.headers)
    headers.pop("content-length", None)
    return JSONResponse(
        content=json.loads(body) if body else None,
        status_code=response.status_code,
        headers=headers,
    )
