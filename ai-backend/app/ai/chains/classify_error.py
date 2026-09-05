"""Code error classification chain (M3 — P1).

Classifies code execution failures into:
  1. Closed ErrorFamily enum (syntax, name, type, logic, incomplete, runtime, unknown)
  2. Open snake_case tag (reused from vocabulary if available, or coined)
  3. One-sentence misconception describing the student's mental model gap

Data flow:
  code + runner error evidence -> PII scrub -> gemini-3.5-flash-lite (structured output)
  -> if confidence < 0.6 or unknown -> escalate to gemini-3.5-flash
  -> tag normalization -> AnalyzeResponse
"""

from __future__ import annotations

import ast
import logging
import re
from typing import Any, Final

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.ai.chains.tico_hint import strip_pii_from_text
from app.ai.prompts.error_analysis import (
    ERROR_ANALYSIS_PROMPT_VERSION,
    get_error_analysis_system_prompt,
)
from app.ai.router import AICapability, get_model, get_model_name
from app.schemas.common import ErrorFamily
from app.schemas.submissions import AnalyzeResponse

logger = logging.getLogger(__name__)

STANDARD_KNOWN_TAGS: Final[set[str]] = {
    "assignment_vs_comparison",
    "missing_colon",
    "indentation_error",
    "undefined_variable",
    "undefined_function",
    "type_mismatch_int_str",
    "type_mismatch",
    "off_by_one",
    "infinite_loop",
    "index_out_of_range",
    "missing_return",
    "unquoted_string",
    "reversed_condition",
    "output_mismatch",
    "incomplete_code",
    "syntax_error",
    "division_by_zero",
}

ESCALATION_CONFIDENCE_THRESHOLD: Final[float] = 0.6


class ErrorClassificationRaw(BaseModel):
    """Pydantic model for LLM structured output."""

    family: ErrorFamily = Field(
        description="One of: syntax, name, type, logic, incomplete, runtime, unknown"
    )
    tag: str = Field(
        description="Snake_case tag, e.g. assignment_vs_comparison, missing_colon"
    )
    misconception: str = Field(
        description="One concise sentence diagnosing the student's mental model error"
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Certainty score between 0.0 and 1.0"
    )


def normalize_tag(tag: str) -> str:
    """Normalize any string into a valid snake_case tag meeting ^[a-z][a-z0-9_]*$."""
    cleaned = re.sub(r"[^a-z0-9_]+", "_", tag.lower().strip()).strip("_")
    if not cleaned:
        return "unknown_error"
    if not cleaned[0].isalpha():
        cleaned = f"tag_{cleaned}"
    return cleaned[:60]


def _check_in_scaffolded_region(code: str, scaffold_code: str | None) -> bool:
    """Determine if student edited or broke code in a scaffolded region."""
    if not scaffold_code or not scaffold_code.strip():
        return False

    scaffold_lines = [line.strip() for line in scaffold_code.splitlines() if line.strip()]
    code_lines = [line.strip() for line in code.splitlines() if line.strip()]

    # If scaffold lines were altered or removed
    for s_line in scaffold_lines:
        if s_line not in code_lines:
            return True

    return False


def _deterministic_fallback(
    code: str,
    error_text: str | None,
    expected_output: str | None,
    actual_output: str | None,
) -> tuple[ErrorFamily, str, str, float]:
    """Pure deterministic heuristic fallback when model calls fail or rate-limit."""
    # 1. AST syntax parsing check
    try:
        ast.parse(code)
    except SyntaxError as exc:
        msg = str(exc).lower()
        if "indent" in msg:
            return (
                ErrorFamily.SYNTAX,
                "indentation_error",
                "The code has inconsistent or invalid indentation levels.",
                0.95,
            )
        return (
            ErrorFamily.SYNTAX,
            "syntax_error",
            "The code contains a syntax error that prevents Python from parsing it.",
            0.9,
        )

    # 2. Incomplete / empty code check
    stripped = code.strip()
    if not stripped or (stripped.startswith("#") and len(stripped.splitlines()) <= 2):
        return (
            ErrorFamily.INCOMPLETE,
            "incomplete_code",
            "The submission is empty or starter template is untouched.",
            0.95,
        )

    # 3. Traceback / error_text keyword inspection
    if error_text:
        err_lower = error_text.lower()
        if "nameerror" in err_lower:
            return (
                ErrorFamily.NAME,
                "undefined_variable",
                "A variable or function is referenced before being assigned or defined.",
                0.9,
            )
        if "typeerror" in err_lower:
            return (
                ErrorFamily.TYPE,
                "type_mismatch",
                "An operation or function was passed incompatible data types.",
                0.9,
            )
        if "indexerror" in err_lower:
            return (
                ErrorFamily.RUNTIME,
                "index_out_of_range",
                "The code attempted to access an item at an invalid index position.",
                0.9,
            )
        if "zerodivisionerror" in err_lower:
            return (
                ErrorFamily.RUNTIME,
                "division_by_zero",
                "The code attempted a division or modulo operation by zero.",
                0.9,
            )
        if "recursionerror" in err_lower or "timeout" in err_lower:
            return (
                ErrorFamily.RUNTIME,
                "infinite_loop",
                "The code entered an uncontrolled infinite loop or deep recursion.",
                0.85,
            )

    # 4. Common logic heuristics
    if "if " in code and "=" in code and "==" not in code:
        return (
            ErrorFamily.LOGIC,
            "assignment_vs_comparison",
            "Used single equals assignment (=) instead of comparison (==) inside condition.",
            0.85,
        )

    # 5. Output mismatch
    if expected_output is not None and actual_output is not None and expected_output != actual_output:
        return (
            ErrorFamily.LOGIC,
            "output_mismatch",
            "The code ran without crashing but did not produce the expected output.",
            0.75,
        )

    return (
        ErrorFamily.UNKNOWN,
        "unknown_error",
        "The specific mistake could not be determined automatically.",
        0.3,
    )


def classify_error(
    *,
    code: str,
    error_text: str | None = None,
    expected_output: str | None = None,
    actual_output: str | None = None,
    existing_tags: list[str] | None = None,
    scaffold_code: str | None = None,
) -> AnalyzeResponse:
    """Classify student code failure into a family, tag, and misconception.

    Args:
        code: Student's submitted Python code.
        error_text: Optional runner traceback or assertion error.
        expected_output: Optional expected runner stdout/return.
        actual_output: Optional actual runner stdout/return.
        existing_tags: Optional list of error tags currently in use.
        scaffold_code: Optional starter/scaffold code to detect scaffold mutations.

    Returns:
        AnalyzeResponse conforming to the public API schema.
    """
    # 1. PII Stripping per docs/08
    sanitized_code = strip_pii_from_text(code)
    sanitized_error = strip_pii_from_text(error_text) if error_text else None
    sanitized_expected = strip_pii_from_text(expected_output) if expected_output else None
    sanitized_actual = strip_pii_from_text(actual_output) if actual_output else None

    # Known tags vocabulary for prompt and novelty check
    known_tags = set(STANDARD_KNOWN_TAGS)
    if existing_tags:
        known_tags.update(existing_tags)

    # 2. Build system and user messages
    system_prompt = get_error_analysis_system_prompt(existing_tags=existing_tags)

    user_lines = [
        "Student Code:",
        "```python",
        sanitized_code,
        "```",
    ]
    if sanitized_error:
        user_lines.extend(["", "Runner Error / Traceback:", sanitized_error])
    if sanitized_expected:
        user_lines.extend(["", f"Expected Output: {sanitized_expected}"])
    if sanitized_actual:
        user_lines.extend(["", f"Actual Output: {sanitized_actual}"])

    user_prompt = "\n".join(user_lines)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]

    escalated = False

    # 3. Model call with structured output
    try:
        model = get_model(AICapability.CLASSIFY)
        runnable = model.with_structured_output(ErrorClassificationRaw)
        raw_result: Any = runnable.invoke(messages)

        if isinstance(raw_result, ErrorClassificationRaw):
            classification = raw_result
        elif isinstance(raw_result, dict):
            classification = ErrorClassificationRaw(**raw_result)
        else:
            raise ValueError(f"Unexpected output type from model: {type(raw_result)}")

        # 4. Escalation check: if confidence < 0.6 or family == UNKNOWN, escalate to gemini-3.5-flash
        if (
            classification.confidence < ESCALATION_CONFIDENCE_THRESHOLD
            or classification.family == ErrorFamily.UNKNOWN
        ):
            logger.info(
                "Classify error confidence low (%s) or UNKNOWN. Escalating to review model.",
                classification.confidence,
            )
            try:
                review_model = get_model(AICapability.REVIEW)
                review_runnable = review_model.with_structured_output(ErrorClassificationRaw)
                review_result: Any = review_runnable.invoke(messages)
                if isinstance(review_result, ErrorClassificationRaw):
                    classification = review_result
                    escalated = True
                elif isinstance(review_result, dict):
                    classification = ErrorClassificationRaw(**review_result)
                    escalated = True
            except Exception as esc_err:
                logger.warning("Escalation model review failed: %s. Using primary result.", esc_err)

    except Exception as exc:
        logger.warning("Error classification model call failed: %s. Using deterministic fallback.", exc)
        fam, tag_str, misc, conf = _deterministic_fallback(
            code=sanitized_code,
            error_text=sanitized_error,
            expected_output=sanitized_expected,
            actual_output=sanitized_actual,
        )
        classification = ErrorClassificationRaw(
            family=fam,
            tag=tag_str,
            misconception=misc,
            confidence=conf,
        )

    # 5. Tag normalization and novelty check
    norm_tag = normalize_tag(classification.tag)
    is_new = norm_tag not in known_tags

    # 6. Scaffold mutation detection
    in_scaffold = _check_in_scaffolded_region(code, scaffold_code)

    return AnalyzeResponse(
        family=classification.family,
        tag=norm_tag,
        misconception=classification.misconception,
        confidence=classification.confidence,
        is_new_tag=is_new,
        escalated=escalated,
        in_scaffolded_region=in_scaffold,
    )
