"""Marker for stubbed endpoints.

A stub sets `X-TICO-Stub: 1` on its response and the envelope turns that into
`meta.stub`, so the client can tell whether it is talking to real logic.

**Nothing sets it today.** All thirteen endpoints are real, and `meta.stub` is false
everywhere — which is the answer the field exists to give. It stays for the next endpoint
that ships shape-first with fake behaviour, which is a pattern worth keeping: the client
team can integrate against a final shape weeks before the logic exists, and find out from
the header rather than from a demo when it stops being fake.
"""

from fastapi import Response

STUB_HEADER = "X-TICO-Stub"


def mark(response: Response) -> None:
    """Declare this response fake. No caller today; see the module docstring."""
    response.headers[STUB_HEADER] = "1"
