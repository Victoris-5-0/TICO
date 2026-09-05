"""Error analysis prompt template for code classification (M3 — P1).

Classifies student code failure into:
  1. A closed ErrorFamily enum (syntax, name, type, logic, incomplete, runtime, unknown).
  2. An open snake_case error tag (reused from vocabulary if appropriate, or coined).
  3. A concise one-sentence misconception explaining the mental model gap.
"""

from __future__ import annotations

from typing import Final

ERROR_ANALYSIS_PROMPT_VERSION: Final[str] = "1.0.0"

_SYSTEM_TEMPLATE = """\
You are an expert Python programming education diagnostic assistant.
Your job is to analyze a student's Python code submission and runner failure evidence to diagnose the root conceptual error.

Classification Rules:
1. Error Family (closed enum - choose exactly ONE):
   - syntax: Code fails to parse (IndentationError, SyntaxError, missing colons, unbalanced parens/brackets/quotes).
   - name: Variable or function used before definition, or misspelled identifier (NameError).
   - type: Incompatible types combined or passed (e.g. adding int to str, calling non-callable, TypeError).
   - logic: Code runs without runtime error but produces incorrect results, fails assertions, or has faulty boolean/arithmetic logic (e.g. assignment `=` inside condition instead of `==`, inverted inequality `<` vs `>`, off-by-one).
   - incomplete: Unfinished code, missing return statement, empty required function/loop body, untouched starter template.
   - runtime: Code parses and starts running, but crashes during execution (IndexError, KeyError, ZeroDivisionError, infinite loop, RecursionError).
   - unknown: Truly ambiguous failure that cannot be reliably diagnosed from the provided evidence.

2. Error Tag (open snake_case tag):
   - Format: Must match ^[a-z][a-z0-9_]*$ and be at most 60 characters.
   - If one of the known tags accurately describes the student's specific error, REUSE it:
{known_tags_list}
   - If none of the known tags fits, coin a specific, descriptive snake_case tag (e.g. 'assignment_vs_comparison', 'unquoted_string_literal', 'missing_step_increment').

3. Misconception:
   - Exactly ONE concise sentence explaining what fundamental concept the student misunderstands or confused.
   - Focus on the mental model misconception rather than just reciting the error message.

4. Confidence:
   - Float between 0.0 and 1.0 indicating your certainty in this classification.
"""


def get_error_analysis_system_prompt(existing_tags: list[str] | None = None) -> str:
    """Generate the system prompt for error classification.

    Args:
        existing_tags: Optional list of known error tags to bias towards reuse.

    Returns:
        The complete system prompt.
    """
    if existing_tags:
        tags_formatted = "\n".join(f"     * {tag}" for tag in existing_tags[:30])
    else:
        tags_formatted = (
            "     * assignment_vs_comparison\n"
            "     * missing_colon\n"
            "     * indentation_error\n"
            "     * undefined_variable\n"
            "     * undefined_function\n"
            "     * type_mismatch_int_str\n"
            "     * off_by_one\n"
            "     * infinite_loop\n"
            "     * index_out_of_range\n"
            "     * missing_return\n"
            "     * unquoted_string\n"
            "     * reversed_condition"
        )

    return _SYSTEM_TEMPLATE.format(known_tags_list=tags_formatted)
