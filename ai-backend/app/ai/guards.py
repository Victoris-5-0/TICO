"""Pure validation logic for TICO hint leak detection (M2 — P0).

Strictly zero I/O: no model calls, no database access, no network, and no
imports of ChatGoogleGenerativeAI or LangChain model classes.

Rung Leak Rules (AGENTS.md, hint_ladder.py, docs/08):
    Universal:         forbidden = empty or trivially short hint text (< 10 chars).
    Rung 1 (ORIENT):   forbidden = any solution identifier, any fenced code block.
    Rung 2 (QUESTION): forbidden = any solution identifier, any fenced code block, any solution values.
    Rung 3 (NAME_IT):   forbidden = student's actual mission identifiers AND target values
                       (a foreign/different example's own code/values are explicitly allowed;
                       do not flag fenced code blocks at rung 3).
    Rung 4 (WALK):      forbidden = a complete runnable line of Python code.
                       (Natural language prose describing the change is allowed; executable code is not).
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from typing import Final

from app.schemas.common import HintRung

MIN_RUNG: Final[int] = 1
MAX_RUNG: Final[int] = 4
MIN_HINT_LENGTH: Final[int] = 10

FENCED_CODE_BLOCK_PATTERN: Final[re.Pattern[str]] = re.compile(r"```", re.DOTALL)


@dataclass(frozen=True, slots=True)
class GuardResult:
    """Result of hint output validation."""

    passed: bool
    violations: list[str]


def contains_fenced_code_block(text: str) -> bool:
    """Detect markdown-style triple-backtick fenced code blocks (```)."""
    return bool(FENCED_CODE_BLOCK_PATTERN.search(text))


def contains_any_term(text: str, terms: list[str]) -> bool:
    """Case-insensitive word-boundary check against a list of forbidden terms.

    Uses word boundaries (\\b) where practical to avoid false positives like
    matching 'x' inside 'next' or 'text'.
    """
    if not terms:
        return False

    for term in terms:
        term = term.strip()
        if not term:
            continue
        prefix = r"\b" if re.match(r"^\w", term) else r"(?:^|\W)"
        suffix = r"\b" if re.search(r"\w$", term) else r"(?:$|\W)"
        pattern = re.compile(rf"{prefix}{re.escape(term)}{suffix}", re.IGNORECASE)
        if pattern.search(text):
            return True

    return False


def _is_non_trivial_statement(stmt: ast.stmt) -> bool:
    """Determine whether an AST statement is non-trivial executable code.

    Excludes:
      - Bare identifiers (e.g. `x`, `condition`)
      - Bare literals / constants (e.g. `12`, `"open"`, `True`)
      - Unary operations on constants (e.g. `-1`)
      - Bare tuples/lists of literals or identifiers
    """
    if isinstance(stmt, ast.Expr):
        val = stmt.value
        if isinstance(val, (ast.Name, ast.Constant)):
            return False
        if isinstance(val, ast.UnaryOp) and isinstance(val.operand, ast.Constant):
            return False
        if isinstance(val, (ast.Tuple, ast.List)):
            if all(isinstance(elt, (ast.Name, ast.Constant)) for elt in val.elts):
                return False
        return True
    return True


def _is_runnable_line(line: str) -> bool:
    """Attempt to parse a single line as an executable Python statement."""
    line = line.strip()
    if not line or line.startswith("#"):
        return False

    try:
        tree = ast.parse(line)
        if tree.body and any(_is_non_trivial_statement(s) for s in tree.body):
            return True
    except SyntaxError:
        # Check if it is a compound statement header (e.g. `if waiting > 30:`)
        if line.endswith(":"):
            try:
                tree = ast.parse(line + " pass")
                if tree.body and any(_is_non_trivial_statement(s) for s in tree.body):
                    return True
            except SyntaxError:
                pass

    return False


def contains_runnable_python_line(text: str) -> bool:
    """Check whether text contains any complete runnable lines of Python code.

    HEURISTIC IMPLEMENTATION:
        Splits text into lines, strips markdown fencing/backticks and leading
        bullet/comment markers (*, -, 1.), and attempts ast.parse() on each
        remaining non-empty line individually, excluding bare identifiers,
        bare literals, and bare comments. Also inspects inline backticked snippets.

    KNOWN LIMITATIONS:
        - False negatives: Multi-line statements broken across multiple lines
          evade single-line AST parsing.
        - False positives: Rare short natural-language sentences that happen to be
          syntactically valid Python (e.g. 'check x' or 'del x').
        This is why this heuristic serves as a defense-in-depth *guard*, not the
        sole defense — the versioned prompt instructions from tico_persona.py
        are the primary prevention layer.
    """
    for raw_line in text.splitlines():
        line = raw_line.strip()
        # Strip markdown bullets, blockquotes, numbered list prefixes
        line = re.sub(r"^[>\s*\-+0-9.)]+", "", line).strip()
        # Strip enclosing backticks
        line = line.strip("`").strip()

        if _is_runnable_line(line):
            return True

        # Check if line has a natural-language label before a colon (e.g. "اكتب السطر ده: gate.open()")
        if ":" in line:
            suffix = line.split(":", 1)[1].strip()
            if suffix and _is_runnable_line(suffix):
                return True

        # Also inspect inline code segments inside backticks
        for snippet in re.findall(r"`([^`]+)`", raw_line):
            if _is_runnable_line(snippet):
                return True

    return False


def validate_hint_output(
    rung: HintRung | int,
    hint_text: str,
    *,
    solution_identifiers: list[str] | None = None,
    target_values: list[str] | None = None,
) -> GuardResult:
    """Validate model-generated hint prose against rung-specific pedagogical constraints.

    Args:
        rung: Hint rung (1 to 4).
        hint_text: The prose generated by the model.
        solution_identifiers: Optional identifiers from the mission solution (e.g.
                              ['gate', 'open', 'waiting']). When None, this specific
                              check is skipped (leak coverage is partial until services/
                              wires mission metadata).
        target_values: Optional concrete literal targets from the mission (e.g.
                       ['30', 'open']). When None, this specific check is skipped.

    Returns:
        GuardResult with boolean passed status and list of human-readable violation reasons.

    Raises:
        ValueError: If rung is not between 1 and 4.
    """
    rung_int = int(rung)
    if rung_int < MIN_RUNG or rung_int > MAX_RUNG:
        raise ValueError(f"Invalid rung: {rung}. Expected an integer in {MIN_RUNG}..{MAX_RUNG}.")

    # FIX B: Universal check for empty or trivially short hint text
    stripped = hint_text.strip()
    if len(stripped) < MIN_HINT_LENGTH:
        return GuardResult(
            passed=False,
            violations=["hint text is empty or too short to be useful"],
        )

    violations: list[str] = []

    if rung_int == 1:
        if contains_fenced_code_block(hint_text):
            violations.append("rung 1: contains a fenced code block")
        if solution_identifiers and contains_any_term(hint_text, solution_identifiers):
            violations.append("rung 1: contains solution identifiers")

    elif rung_int == 2:
        # FIX A: Rung 2 forbids fenced code, solution identifiers, AND solution values
        if contains_fenced_code_block(hint_text):
            violations.append("rung 2: contains a fenced code block")
        if solution_identifiers and contains_any_term(hint_text, solution_identifiers):
            violations.append("rung 2: contains solution identifiers")
        if target_values and contains_any_term(hint_text, target_values):
            violations.append("rung 2: contains solution values")

    elif rung_int == 3:
        if target_values and contains_any_term(hint_text, target_values):
            violations.append("rung 3: contains student target values")
        if solution_identifiers and contains_any_term(hint_text, solution_identifiers):
            violations.append("rung 3: contains student's mission identifiers")

    elif rung_int == 4:
        if contains_runnable_python_line(hint_text):
            violations.append("rung 4: contains a complete runnable line of Python code")

    return GuardResult(passed=len(violations) == 0, violations=violations)
