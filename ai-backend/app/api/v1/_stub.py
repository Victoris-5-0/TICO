"""Marker for stubbed endpoints.

Every stub sets `X-TICO-Stub: 1` on its response. The client can assert on it to know
whether it is talking to real logic yet, and it disappears the moment a milestone lands
without changing the response body at all.
"""

from fastapi import Response

STUB_HEADER = "X-TICO-Stub"


def mark(response: Response) -> None:
    response.headers[STUB_HEADER] = "1"
