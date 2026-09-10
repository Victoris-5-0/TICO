"""Unit tests for code error classification chain (app.ai.chains.classify_error)."""

from unittest.mock import MagicMock, patch
import pytest

from app.ai.chains.classify_error import (
    ErrorClassificationRaw,
    classify_error,
    normalize_tag,
    _deterministic_fallback,
    _check_in_scaffolded_region,
)
from app.ai.router import AICapability
from app.schemas.common import ErrorFamily
from app.schemas.submissions import AnalyzeResponse


def test_normalize_tag_utility():
    """Verify normalize_tag cleans up arbitrary strings into compliant snake_case."""
    assert normalize_tag("assignment_vs_comparison") == "assignment_vs_comparison"
    assert normalize_tag("Assignment Vs Comparison") == "assignment_vs_comparison"
    assert normalize_tag("missing-colon!!") == "missing_colon"
    assert normalize_tag("123_invalid_start") == "tag_123_invalid_start"
    assert normalize_tag("") == "unknown_error"
    # Max length truncation
    long_tag = "a" * 80
    assert len(normalize_tag(long_tag)) == 60


def test_classify_error_normal_flow():
    """Primary model classifies error with high confidence without escalation."""
    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = ErrorClassificationRaw(
        family=ErrorFamily.LOGIC,
        tag="assignment_vs_comparison",
        misconception="Student confused assignment operator (=) with comparison (==).",
        confidence=0.92,
    )

    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.classify_error.get_model", return_value=mock_model) as mock_get_model:
        response = classify_error(
            code="if waiting = 30:\n    gate.open()",
            error_text="SyntaxError: invalid syntax",
        )

        mock_get_model.assert_called_once_with(AICapability.CLASSIFY)
        assert isinstance(response, AnalyzeResponse)
        assert response.error_family == ErrorFamily.LOGIC
        assert response.error_tag == "assignment_vs_comparison"
        assert response.confidence == 0.92
        assert response.is_new_tag is False  # known tag
        assert response.escalated is False
        assert response.in_scaffolded_region is False


def test_classify_error_escalation_on_low_confidence():
    """When confidence is below 0.6, chain escalates to review model."""
    mock_primary_runnable = MagicMock()
    mock_primary_runnable.invoke.return_value = ErrorClassificationRaw(
        family=ErrorFamily.LOGIC,
        tag="uncertain_mistake",
        misconception="Not sure what happened.",
        confidence=0.45,  # below 0.6 threshold
    )

    mock_review_runnable = MagicMock()
    mock_review_runnable.invoke.return_value = ErrorClassificationRaw(
        family=ErrorFamily.TYPE,
        tag="type_mismatch_int_str",
        misconception="Student attempted to concatenate a string with an integer.",
        confidence=0.88,
    )

    mock_primary_model = MagicMock()
    mock_primary_model.with_structured_output.return_value = mock_primary_runnable

    mock_review_model = MagicMock()
    mock_review_model.with_structured_output.return_value = mock_review_runnable

    def model_resolver(capability):
        if capability == AICapability.CLASSIFY:
            return mock_primary_model
        if capability == AICapability.REVIEW:
            return mock_review_model
        raise ValueError(f"Unexpected capability {capability}")

    with patch("app.ai.chains.classify_error.get_model", side_effect=model_resolver):
        response = classify_error(
            code="age = '25'\nnext_year = age + 1",
            error_text="TypeError: can only concatenate str (not 'int') to str",
        )

        assert response.error_family == ErrorFamily.TYPE
        assert response.error_tag == "type_mismatch_int_str"
        assert response.confidence == 0.88
        assert response.escalated is True


def test_classify_error_coined_new_tag():
    """When model coins a tag not in known vocabulary, is_new_tag is True."""
    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = ErrorClassificationRaw(
        family=ErrorFamily.LOGIC,
        tag="unseen_exotic_pattern",
        misconception="Novel mistake pattern.",
        confidence=0.85,
    )
    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.classify_error.get_model", return_value=mock_model):
        response = classify_error(
            code="x = 10",
        )
        assert response.error_tag == "unseen_exotic_pattern"
        assert response.is_new_tag is True


def test_classify_error_detects_scaffold_tampering():
    """When scaffolded lines are modified or deleted, in_scaffolded_region is True."""
    scaffold = "# --- SCAFFOLD ---\ngate = StationGate()\n# --- END SCAFFOLD ---"
    student_code = "my_gate = None\ngate.open()"

    assert _check_in_scaffolded_region(student_code, scaffold) is True

    # Intact scaffold:
    student_code_intact = "# --- SCAFFOLD ---\ngate = StationGate()\n# --- END SCAFFOLD ---\ngate.open()"
    assert _check_in_scaffolded_region(student_code_intact, scaffold) is False


def test_deterministic_fallback_scenarios():
    """Test heuristic fallback for various common error cases when model is unavailable."""
    # Syntax error
    fam, tag, misc, conf = _deterministic_fallback("def foo(:", None, None, None)
    assert fam == ErrorFamily.SYNTAX
    assert tag == "syntax_error"

    # Indentation error
    fam, tag, misc, conf = _deterministic_fallback("def foo():\npass", None, None, None)
    assert fam == ErrorFamily.SYNTAX
    assert tag == "indentation_error"

    # Incomplete starter
    fam, tag, misc, conf = _deterministic_fallback("# write your code here", None, None, None)
    assert fam == ErrorFamily.INCOMPLETE
    assert tag == "incomplete_code"

    # NameError
    fam, tag, misc, conf = _deterministic_fallback("print(y)", "NameError: name 'y' is not defined", None, None)
    assert fam == ErrorFamily.NAME
    assert tag == "undefined_variable"

    # TypeError
    fam, tag, misc, conf = _deterministic_fallback("1 + '1'", "TypeError: unsupported operand", None, None)
    assert fam == ErrorFamily.TYPE
    assert tag == "type_mismatch"

    # IndexError
    fam, tag, misc, conf = _deterministic_fallback("a[10]", "IndexError: list index out of range", None, None)
    assert fam == ErrorFamily.RUNTIME
    assert tag == "index_out_of_range"

    # ZeroDivisionError
    fam, tag, misc, conf = _deterministic_fallback("10 / 0", "ZeroDivisionError: division by zero", None, None)
    assert fam == ErrorFamily.RUNTIME
    assert tag == "division_by_zero"

    # Logic: = instead of ==
    fam, tag, misc, conf = _deterministic_fallback("if x = 5:\n    pass", None, None, None)
    assert fam == ErrorFamily.LOGIC
    assert tag == "assignment_vs_comparison"
    assert misc == "Used a single equals sign (=) for assignment where a double equals (==) comparison was intended."
    assert conf == 0.95


def test_deterministic_fallback_assignment_vs_comparison_false_positive_avoided():
    """Syntactically valid code with assignment inside body must not trigger assignment_vs_comparison."""
    fam, tag, misc, conf = _deterministic_fallback("if waiting > 30:\n    x = 1", None, None, None)
    assert tag != "assignment_vs_comparison"
    assert fam == ErrorFamily.UNKNOWN


def test_classify_error_existing_tags_normalized_for_novelty():
    """Verify non-normalized existing_tags are normalized so matching tags are not marked new.

    Uses a tag NOT in STANDARD_KNOWN_TAGS so the test only passes if existing_tags
    normalization actually works. Also asserts the inverse control case (tag is marked
    new when not in existing_tags).
    """
    mock_runnable = MagicMock()
    mock_runnable.invoke.return_value = ErrorClassificationRaw(
        family=ErrorFamily.LOGIC,
        tag="custom_legacy_tag",
        misconception="A team-specific historical pattern.",
        confidence=0.9,
    )
    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_runnable

    with patch("app.ai.chains.classify_error.get_model", return_value=mock_model):
        # Case 1: Unnormalized existing tag matches normalized output -> NOT new
        response_with_tags = classify_error(
            code="x = 1",
            existing_tags=["Custom Legacy Tag"],  # deliberately unnormalized
        )
        assert response_with_tags.error_tag == "custom_legacy_tag"
        assert response_with_tags.is_new_tag is False

        # Case 2 (Inverse control): Without existing_tags, custom tag is recognized as NEW
        response_without_tags = classify_error(
            code="x = 1",
            existing_tags=None,
        )
        assert response_without_tags.error_tag == "custom_legacy_tag"
        assert response_without_tags.is_new_tag is True


def test_classify_error_model_failure_triggers_safe_fallback():
    """When model invocation fails completely, classify_error safely falls back without raising."""
    with patch("app.ai.chains.classify_error.get_model", side_effect=RuntimeError("Provider offline")):
        response = classify_error(
            code="print(undefined_val)",
            error_text="NameError: name 'undefined_val' is not defined",
        )

        assert isinstance(response, AnalyzeResponse)
        assert response.error_family == ErrorFamily.NAME
        assert response.error_tag == "undefined_variable"
        assert response.confidence >= 0.8
        assert response.escalated is False


# ----------------------------------------------------- the enum-case silent outage


def test_the_model_may_answer_in_any_case():
    """A lower-case family must not throw the whole classification away.

    This shipped broken. The field description listed the values in lower case while
    `ErrorFamily` is upper case, so the model answered `"syntax"`, validation rejected it,
    and every live call fell through to the deterministic fallback logging a warning
    nobody read. The model path had never once succeeded in production.
    """
    from app.ai.chains.classify_error import ErrorClassificationRaw

    for written in ("syntax", "SYNTAX", "Syntax", "sYnTaX"):
        parsed = ErrorClassificationRaw(
            family=written, tag="assignment_vs_comparison",
            misconception="Thinks `=` compares.", confidence=0.9,
        )
        assert parsed.family is ErrorFamily.SYNTAX, f"{written!r} should parse"


def test_the_prompt_asks_for_the_case_the_enum_accepts():
    """Belt and braces: the validator forgives, but the description should not need it."""
    from app.ai.chains.classify_error import ErrorClassificationRaw

    described = ErrorClassificationRaw.model_fields["family"].description or ""
    for member in ErrorFamily:
        assert member.value in described, f"{member.value} missing from the description"


def test_a_family_outside_the_enum_is_still_rejected():
    """Forgiving case is not the same as forgiving invention."""
    import pytest as _pytest
    from pydantic import ValidationError

    from app.ai.chains.classify_error import ErrorClassificationRaw

    with _pytest.raises(ValidationError):
        ErrorClassificationRaw(
            family="off_by_one", tag="t", misconception="m", confidence=0.5
        )
