"""Unit tests for pure validation logic in app.ai.guards."""

import ast
import inspect
import pytest

import app.ai.guards as guards
from app.ai.guards import (
    contains_any_term,
    contains_fenced_code_block,
    contains_runnable_python_line,
    validate_hint_output,
)
from app.schemas.common import HintRung


def test_contains_fenced_code_block():
    assert contains_fenced_code_block("Here is some code:\n```python\nx = 1\n```") is True
    assert contains_fenced_code_block("Unclosed block ```python\nx = 1") is True
    assert contains_fenced_code_block("Inline `x = 1` is not fenced") is False
    assert contains_fenced_code_block("No code here at all") is False


def test_contains_any_term_word_boundaries():
    terms = ["gate", "open", "x"]
    assert contains_any_term("Please check gate now", terms) is True
    assert contains_any_term("Look at OPEN carefully", terms) is True  # Case-insensitive
    assert contains_any_term("Check x value", terms) is True

    # Word boundary prevents substring false positives
    assert contains_any_term("Read the next text", ["x"]) is False
    assert contains_any_term("Investigation underway", ["gate"]) is False
    assert contains_any_term("Clean text", []) is False


def test_contains_runnable_python_line():
    # Valid runnable lines (statements, function calls, compound headers)
    assert contains_runnable_python_line("x = 5") is True
    assert contains_runnable_python_line("gate.open()") is True
    assert contains_runnable_python_line("- waiting = station.passengers") is True
    assert contains_runnable_python_line("`x += 1`") is True
    assert contains_runnable_python_line("غيّر الكود كده:\ngate.open()") is True
    assert contains_runnable_python_line("if waiting > 30:") is True

    # Non-runnable / natural prose / bare identifiers & literals
    assert contains_runnable_python_line("بص على المتغير `waiting` والقيمة `30`") is False
    assert contains_runnable_python_line("Your condition should compare, not store.") is False
    assert contains_runnable_python_line("Change = to == on that line.") is False
    assert contains_runnable_python_line("`x`") is False
    assert contains_runnable_python_line("123") is False
    assert contains_runnable_python_line("# Just a comment") is False


def test_validate_hint_output_rejects_empty_or_short_text():
    """Verify that empty, blank, or trivially short texts (< 10 chars) fail across all rungs."""
    for rung in (1, 2, 3, 4):
        res_empty = validate_hint_output(rung, "")
        assert res_empty.passed is False
        assert res_empty.violations == ["hint text is empty or too short to be useful"]

        res_spaces = validate_hint_output(rung, "   \n\t  ")
        assert res_spaces.passed is False

        res_short = validate_hint_output(rung, "Look.")
        assert res_short.passed is False

        # Length 10 or greater is not rejected by length check
        res_valid_length = validate_hint_output(rung, "Check line 2 now")
        assert not any("too short" in v for v in res_valid_length.violations)


def test_validate_hint_output_rung_1_clean_and_violating():
    # Clean examples: no fenced code blocks, no solution identifiers
    res_1 = validate_hint_output(
        HintRung.ORIENT,
        "بص كويس على السطور الأولى من الكود",
        solution_identifiers=["gate", "open"],
    )
    assert res_1.passed is True
    assert len(res_1.violations) == 0

    # Violating: fenced code block on rung 1
    res_fence = validate_hint_output(
        HintRung.ORIENT,
        "```python\nx = 1\n```",
        solution_identifiers=["gate"],
    )
    assert res_fence.passed is False
    assert any("fenced code block" in v for v in res_fence.violations)

    # Violating: solution identifier leak on rung 1
    res_ident = validate_hint_output(
        HintRung.ORIENT,
        "راجع استخدام دالة gate في الكود",
        solution_identifiers=["gate", "open"],
    )
    assert res_ident.passed is False
    assert any("solution identifiers" in v for v in res_ident.violations)


def test_validate_hint_output_rung_2_forbids_target_values():
    """Verify rung 2 forbids target values in addition to solution identifiers and fenced code."""
    # Violating: mentions target value '30'
    res_val = validate_hint_output(
        HintRung.QUESTION,
        "What happens when the count reaches 30?",
        target_values=["30"],
    )
    assert res_val.passed is False
    assert any("solution values" in v for v in res_val.violations)

    # Violating: solution identifier leak on rung 2
    res_ident = validate_hint_output(
        HintRung.QUESTION,
        "Why did you call gate in that line?",
        solution_identifiers=["gate", "open"],
    )
    assert res_ident.passed is False
    assert any("solution identifiers" in v for v in res_ident.violations)

    # Violating: fenced code block on rung 2
    res_fence = validate_hint_output(
        HintRung.QUESTION,
        "```python\nif x == 1:\n    pass\n```",
    )
    assert res_fence.passed is False
    assert any("fenced code block" in v for v in res_fence.violations)

    # Clean: guiding question without target values or identifiers
    res_clean = validate_hint_output(
        HintRung.QUESTION,
        "Why is your condition comparing instead of assigning?",
        solution_identifiers=["gate", "open"],
        target_values=["30"],
    )
    assert res_clean.passed is True

    # Confirmation: Rung 1 does NOT check target values
    res_rung1_val = validate_hint_output(
        HintRung.ORIENT,
        "بص على السطور اللي فيها 30 يا بطل",
        target_values=["30"],
    )
    assert res_rung1_val.passed is True


def test_validate_hint_output_rung_3_allows_foreign_code_forbids_target_values_and_identifiers():
    # Clean: foreign code example with unrelated variable is explicitly allowed
    res_foreign = validate_hint_output(
        HintRung.NAME_IT,
        "المقارنة بتتعمل كده: `if score == 100:`",
        solution_identifiers=["gate", "open", "waiting"],
        target_values=["30", "open"],
    )
    assert res_foreign.passed is True

    # Violating: leaks student's actual mission target value '30' (no identifiers leaked)
    res_leak_target = validate_hint_output(
        HintRung.NAME_IT,
        "جرّب تقارن مع 30 بالشكل ده: `if speed == 30:`",
        solution_identifiers=["gate", "open"],
        target_values=["30"],
    )
    assert res_leak_target.passed is False
    assert any("student target values" in v for v in res_leak_target.violations)

    # Violating: leaks student's mission identifier 'gate' (no target values leaked)
    res_leak_identifier = validate_hint_output(
        HintRung.NAME_IT,
        "المفهوم هنا هو الشروط، زي لما تفحص gate لمعرفة حالتها",
        solution_identifiers=["gate", "open"],
        target_values=["30"],
    )
    assert res_leak_identifier.passed is False
    assert any("mission identifiers" in v for v in res_leak_identifier.violations)

    # Violating: leaks BOTH target value and mission identifier
    res_leak_both = validate_hint_output(
        HintRung.NAME_IT,
        "افحص gate لما توصل 30",
        solution_identifiers=["gate"],
        target_values=["30"],
    )
    assert res_leak_both.passed is False
    assert len(res_leak_both.violations) == 2


def test_validate_hint_output_rung_4_forbids_runnable_lines():
    # Clean: natural language prose describing the edit
    res_clean = validate_hint_output(
        HintRung.WALK,
        "الشرط لازم يقارن مش يخزّن. غيّر الـ = الواحدة لـ ==.",
    )
    assert res_clean.passed is True

    # Violating: emits a complete runnable line
    res_leak = validate_hint_output(
        HintRung.WALK,
        "اكتب السطر ده في الكود عندك:\ngate.open()",
    )
    assert res_leak.passed is False
    assert any("runnable line" in v for v in res_leak.violations)


def test_validate_hint_output_handles_none_parameters():
    # When optional context is omitted, only the core structural checks run
    res = validate_hint_output(
        HintRung.ORIENT,
        "بص على الكود في المنطقة دي",
        solution_identifiers=None,
        target_values=None,
    )
    assert res.passed is True


def test_validate_hint_output_invalid_rung_raises():
    with pytest.raises(ValueError, match="Invalid rung"):
        validate_hint_output(0, "text that is long enough")
    with pytest.raises(ValueError, match="Invalid rung"):
        validate_hint_output(5, "text that is long enough")


def test_guards_pure_python_zero_io():
    """Verify app.ai.guards contains zero I/O and no framework imports."""
    source = inspect.getsource(guards)
    tree = ast.parse(source)

    forbidden = (
        "langchain",
        "sqlalchemy",
        "httpx",
        "requests",
        "psycopg",
        "urllib",
        "aiohttp",
        "fastapi",
    )
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                for f in forbidden:
                    assert not alias.name.startswith(f), f"Forbidden import: {alias.name}"
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                for f in forbidden:
                    assert not node.module.startswith(f), f"Forbidden import: {node.module}"
