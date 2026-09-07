"""Primary-key generation.

**Prisma's `@default(cuid())` is not a database default.** Checked against the live
schema: of 38 primary-key columns, *zero* have `column_default` set. Prisma generates the
id inside its own client, which means a row inserted by this service gets no id at all
unless we supply one — `NotNullViolation` on the primary key, on every insert.

Same shape of trap as the timestamps: it looks like the database will handle it, and it
will not.

The fix belongs on the model rather than at each call site. A `default=new_id` on the
column means `db.add(HintEvent(...))` simply works, and there is no way to forget it.

## Format

`cuid()` in Prisma 6 produces a 25-character v1 cuid: `c` then a timestamp, counter,
fingerprint and random block, all base36. These ids are opaque `TEXT` on both sides and
nothing parses them, so exact format compatibility is not required — but both services
write to the same tables (`hint_events` in particular, which the Next.js layer also
creates rows in), and ids that look wildly different in one table invite the question of
whether something is broken.

So: same alphabet, same leading `c`, same length. Monotonic timestamp prefix, so ids sort
roughly by creation time, which makes eyeballing a table in Supabase far easier.
"""

from __future__ import annotations

import os
import secrets
import threading
import time

_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"
_BLOCK = 4

_counter = secrets.randbelow(36**_BLOCK)
_counter_lock = threading.Lock()

#: Distinguishes ids made by different workers within the same millisecond. Gunicorn runs
#: four of them, so the pid alone is worth having in here.
_FINGERPRINT = None


def _base36(n: int, width: int) -> str:
    out = []
    for _ in range(width):
        n, rem = divmod(n, 36)
        out.append(_ALPHABET[rem])
    return "".join(reversed(out))


def _fingerprint() -> str:
    global _FINGERPRINT
    if _FINGERPRINT is None:
        host = sum(os.uname().nodename.encode()) if hasattr(os, "uname") else 0
        _FINGERPRINT = _base36((os.getpid() + host) % (36**_BLOCK), _BLOCK)
    return _FINGERPRINT


def _next_counter() -> int:
    global _counter
    with _counter_lock:
        _counter = (_counter + 1) % (36**_BLOCK)
        return _counter


def new_id() -> str:
    """A 25-character, time-sortable, collision-resistant id.

    Passed as `default=new_id` (the function, uncalled) so SQLAlchemy invokes it per row.
    Passing `new_id()` would freeze one id at import time and every insert would collide.
    """
    return (
        "c"
        + _base36(int(time.time() * 1000), 8)
        + _base36(_next_counter(), _BLOCK)
        + _fingerprint()
        + _base36(secrets.randbits(40), 8)
    )
