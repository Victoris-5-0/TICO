"""Unit tests for the deterministic hint ladder domain rule."""

import ast
import inspect
import pytest

from app.rules.hint_ladder import (
    MAX_RUNG,
    MIN_RUNG,
    NEXT_STEP_PRACTICE,
    evaluate_ladder,
    get_authored_fallback,
    is_final_rung,
    next_rung,
    next_step_for_rung,
)
from app.schemas.common import HintRung


def test_next_rung_escalation_sequence():
    """Verify strictly deterministic progression 1 -> 2 -> 3 -> 4 and clamping at 4."""
    assert next_rung(0) == HintRung.ORIENT
    assert next_rung(1) == HintRung.QUESTION
    assert next_rung(2) == HintRung.NAME_IT
    assert next_rung(3) == HintRung.WALK
    assert next_rung(4) == HintRung.WALK
    assert next_rung(10) == HintRung.WALK


def test_next_rung_negative_count_raises():
    with pytest.raises(ValueError, match="prior_count must be non-negative"):
        next_rung(-1)


def test_is_final_rung():
    assert is_final_rung(HintRung.ORIENT) is False
    assert is_final_rung(HintRung.QUESTION) is False
    assert is_final_rung(HintRung.NAME_IT) is False
    assert is_final_rung(HintRung.WALK) is True
    assert is_final_rung(1) is False
    assert is_final_rung(4) is True
    assert is_final_rung(5) is True


def test_next_step_for_rung():
    assert next_step_for_rung(HintRung.ORIENT) is None
    assert next_step_for_rung(HintRung.QUESTION) is None
    assert next_step_for_rung(HintRung.NAME_IT) is None
    assert next_step_for_rung(HintRung.WALK) == NEXT_STEP_PRACTICE
    assert next_step_for_rung(4) == "mini_practice"


def test_evaluate_ladder_full_lifecycle():
    decision_0 = evaluate_ladder(0)
    assert decision_0.rung == HintRung.ORIENT
    assert decision_0.is_final is False
    assert decision_0.next_step is None

    decision_3 = evaluate_ladder(3)
    assert decision_3.rung == HintRung.WALK
    assert decision_3.is_final is True
    assert decision_3.next_step == "mini_practice"
    assert "never" in decision_3.forbidden.lower() or "not" in decision_3.forbidden.lower()


def test_generic_authored_fallback_has_no_concept_bias():
    """Generic fallbacks must NOT contain hardcoded assumptions (e.g. comparison/المقارنة)."""
    biased_terms = ["comparison", "المقارنة", "تساوي", "equals", "=="]

    for loc in ("ar_EG", "en"):
        for rung in range(MIN_RUNG, MAX_RUNG + 1):
            text = get_authored_fallback(rung, locale=loc, concept_hint=None)
            assert isinstance(text, str) and len(text) > 10
            for term in biased_terms:
                assert term not in text, f"Biased term '{term}' found in generic rung {rung} ({loc}): {text}"


def test_templated_authored_fallback_injects_concept():
    """When concept_hint is provided, only rungs 3 and 4 may interpolate it.

    Rungs 1 and 2 must preserve progressive disclosure and remain identical
    regardless of whether concept_hint was provided.
    """
    for loc in ("ar_EG", "en"):
        for rung in (1, 2):
            # Rungs 1 and 2 must be identical with or without concept_hint
            with_concept = get_authored_fallback(rung, locale=loc, concept_hint="while_loops")
            without_concept = get_authored_fallback(rung, locale=loc, concept_hint=None)
            assert with_concept == without_concept
            assert "while_loops" not in with_concept

        for rung in (3, 4):
            # Rungs 3 and 4 explicitly name/interpolate the concept
            text = get_authored_fallback(rung, locale=loc, concept_hint="while_loops")
            assert "while_loops" in text


def test_authored_fallback_invalid_rung():
    with pytest.raises(ValueError, match="Invalid rung"):
        get_authored_fallback(0)
    with pytest.raises(ValueError, match="Invalid rung"):
        get_authored_fallback(5)


def test_pure_python_zero_io():
    """Verify rules/hint_ladder does not import LangChain, SQLAlchemy, DB drivers, or networking."""
    import app.rules.hint_ladder as hl

    # Approach (b): AST parsing of the module source.
    # Justification: AST parsing uses Python's own grammar parser to extract only
    # genuine ast.Import and ast.ImportFrom statement nodes. This avoids false
    # positives from docstrings, comments, or variable names mentioning library names,
    # and eliminates the fragility of custom regex patterns.
    source = inspect.getsource(hl)
    tree = ast.parse(source)

    forbidden_prefixes = (
        "langchain",
        "sqlalchemy",
        "httpx",
        "requests",
        "psycopg",
        "urllib",
        "aiohttp",
        "fastapi",
    )

    imported_modules: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imported_modules.append(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imported_modules.append(node.module)

    for mod in imported_modules:
        for prefix in forbidden_prefixes:
            assert not mod.startswith(prefix), f"Forbidden import detected in hint_ladder: {mod}"

    # Secondary checks for ORM/engine leakages on module scope
    assert not hasattr(hl, "engine")
    assert not hasattr(hl, "SessionLocal")
