"""Run a snippet of Python and report what each expression evaluated to.

Used by generation to do two things that make the difference between a mission that works
and one that merely looks right:

1. **Derive the expected outputs.** Rather than asking a model what
   `calculate_loaves(4, 12)` returns, run the reference solution and record it. A test
   written this way cannot disagree with its own solution.
2. **Prove the starter code fails.** A mission whose starter already passes has nothing
   in it to do, and that is a surprisingly easy mistake to ship.

## What this is not

**Not a sandbox for student code.** Students run their own code in Pyodide, in their own
browser, where it cannot reach anything of ours. This runs code *we* generated from *our*
authored templates with parameters we bounded — the threat model is a template bug or a
runaway loop, not an attacker.

Even so it runs out-of-process with a hard timeout, because the realistic failure is a
generated `while` that never ends, and that must cost one worker a few seconds rather
than hang the service.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

#: Generated missions are small. Anything slower than this is a loop that will not stop.
DEFAULT_TIMEOUT_SECONDS = 5


@dataclass(frozen=True)
class CallResult:
    """One evaluated expression."""

    expression: str
    ok: bool
    #: `repr()` of the value, which is what a test compares against.
    value: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class RunResult:
    ok: bool
    results: list[CallResult]
    error: str | None = None

    def values(self) -> list[str | None]:
        return [r.value for r in self.results]

    @property
    def all_ok(self) -> bool:
        return self.ok and all(r.ok for r in self.results)


#: The harness written alongside the code under test. Evaluates each expression
#: separately so one failure does not hide the rest, and reports `repr()` because that is
#: what a test literal compares against — `"open"` not `open`.
_HARNESS = '''
import json, sys, traceback

_RESULTS = []
for _expr in _CALLS:
    try:
        _value = eval(_expr, globals())
        _RESULTS.append({"expression": _expr, "ok": True, "value": repr(_value)})
    except Exception as _exc:
        _RESULTS.append({
            "expression": _expr,
            "ok": False,
            "error": f"{type(_exc).__name__}: {_exc}",
        })

sys.stdout.write("<<<TICO_RESULTS>>>" + json.dumps(_RESULTS, ensure_ascii=False))
'''


def run(code: str, calls: list[str], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> RunResult:
    """Execute `code`, then evaluate each expression in `calls` against it.

    Never raises. A syntax error, a crash and a timeout all come back as
    `RunResult(ok=False, error=...)`, because every one of them is an ordinary outcome
    when the input was generated rather than written.
    """
    if not calls:
        return RunResult(ok=True, results=[])

    program = (
        f"{code}\n\n"
        f"_CALLS = {json.dumps(calls, ensure_ascii=False)}\n"
        f"{_HARNESS}"
    )

    with tempfile.TemporaryDirectory() as tmp:
        script = Path(tmp) / "mission.py"
        script.write_text(program, encoding="utf-8")

        try:
            proc = subprocess.run(
                # -I isolates (which also ignores PYTHONIOENCODING), -S skips site, and
                # -X utf8 is therefore the only way to get UTF-8 stdout on Windows.
                # Without it the Arabic in every mission comes back as mojibake.
                [sys.executable, "-I", "-S", "-X", "utf8", str(script)],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                cwd=tmp,  # a bare directory, so a stray open() finds nothing of ours
            )
        except subprocess.TimeoutExpired:
            return RunResult(
                ok=False,
                results=[],
                error=f"timed out after {timeout}s — the generated code probably loops forever",
            )
        except Exception as exc:  # noqa: BLE001
            return RunResult(ok=False, results=[], error=f"{type(exc).__name__}: {exc}")

    marker = "<<<TICO_RESULTS>>>"
    if marker not in proc.stdout:
        # The module itself failed — a syntax error, or an exception at import time.
        detail = (proc.stderr or proc.stdout or "no output").strip().splitlines()
        return RunResult(
            ok=False,
            results=[],
            error=detail[-1] if detail else "the code did not run",
        )

    payload = proc.stdout.split(marker, 1)[1]
    try:
        rows = json.loads(payload)
    except json.JSONDecodeError:
        return RunResult(ok=False, results=[], error="could not read the harness output")

    return RunResult(
        ok=True,
        results=[
            CallResult(
                expression=r["expression"],
                ok=r["ok"],
                value=r.get("value"),
                error=r.get("error"),
            )
            for r in rows
        ],
    )


def passes(code: str, expectations: list[tuple[str, str]], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> tuple[bool, list[str]]:
    """Does `code` satisfy every (expression, expected-repr) pair?

    Returns `(passed, failures)`, where each failure reads the way a person would want to
    see it: what was called, what came back, what was wanted.
    """
    result = run(code, [expr for expr, _ in expectations], timeout)
    if not result.ok:
        return False, [result.error or "the code did not run"]

    failures: list[str] = []
    for (expr, expected), actual in zip(expectations, result.results):
        if not actual.ok:
            failures.append(f"{expr} raised {actual.error}")
        elif _normalise(actual.value) != _normalise(expected):
            failures.append(f"{expr} returned {actual.value}, expected {expected}")

    return not failures, failures


def _normalise(literal: str | None) -> str:
    """Compare values without tripping over quote style.

    `repr()` gives `'open'` while a manifest naturally writes `"open"`. Both mean the
    same string, and a mission should not fail validation over a quote mark.
    """
    if literal is None:
        return ""
    text = literal.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    return text
