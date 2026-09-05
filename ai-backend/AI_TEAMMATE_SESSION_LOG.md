# AI Teammate Session Log

This log tracks autonomous session tasks in `ai-backend/` following the pre-approved task queue, reference priority rules, and definition of done.

---

### Task 1: `ai/guards.py` — validate model output, retry once, authored fallback (M2, P0)

- **CSV Notes verbatim**: `validate model output, retry once, authored fallback. Plug into the TODO left in app/ai/chains/tico_hint.py`
- **Status**: DONE
- **Files touched**:
  - `ai-backend/app/ai/guards.py`
  - `ai-backend/app/ai/chains/tico_hint.py`
  - `ai-backend/tests/test_guards.py`
  - `ai-backend/tests/test_tico_hint.py`
- **Test count**: 69 -> 80 passed (+11 tests)
- **Plain-language summary**:
  Implemented pure Python output validation logic enforcing the pedagogical hint ladder leak boundary rules across all 4 rungs without any external framework or I/O imports. Wired validation into `app.ai.chains.tico_hint.generate_tico_hint` with single-attempt retry sending specific violation feedback messages, followed by graceful fallback to reviewed authored hints if leakage persists.
- **Assumptions made**:
  - Model retry prompt includes targeted feedback stating the exact violations rather than repeating the identical prompt.
  - Guard logic remains pure Python (ast/re) with zero database or model I/O.
- **Open questions for review**: None.

---

### Task 2: HINT LEAK TEST in CI (M2, P0)

- **CSV Notes verbatim**: `graded by rung per AGENTS.md: rungs 1-2 no solution identifier, rung 3 none of the student's target values, rung 4 no complete runnable line. This depends on guards.py existing — build it right after, using guards.py's real validation functions, not a reimplementation.`
- **Status**: DONE
- **Files touched**:
  - `ai-backend/tests/test_hint_leak.py`
  - `ai-backend/app/ai/guards.py`
- **Test count**: 80 -> 135 passed (+55 tests)
- **Plain-language summary**:
  Created a dedicated CI hint leak test suite verifying disclosure limits graded strictly by rung across benchmark mission scenarios (Cairo Metro, El Forn Bakery, Cairo Traffic). Certified that all generic and templated authored fallbacks in both Arabic and English pass their respective rung leak checks without exception. Tested adversarial model attempts across all rungs, verifying that `tico_hint` traps leaks, retries with violation feedback, falls back to authored hints, and never leaks solutions. Enhanced `guards.py` runnable line detection to catch natural-language colon prefixes preceding runnable Python code.
- **Assumptions made**:
  - Benchmark scenarios define solution identifiers and target values reflecting real curriculum lessons.
  - Suffix after colon (e.g., `اكتب ده: gate.open()`) should be inspected for runnable code to prevent natural-language label bypasses.
- **Open questions for review**: None.

---

### Task 3: Authored fallback hints for all 4 rungs (M2, P1)

- **CSV Notes verbatim**: `NOTE: this may already be substantially satisfied by app/rules/hint_ladder.py's GENERIC_FALLBACK_HINTS / TEMPLATED_FALLBACK_PATTERNS built earlier. Before doing new work, check whether this task's intent is already met. If gaps remain (e.g. more locales, more variety), extend rather than duplicate. Log your conclusion either way.`
- **Status**: DONE
- **Files touched**:
  - `ai-backend/app/rules/hint_ladder.py`
  - `ai-backend/tests/test_hint_ladder.py`
- **Test count**: 135 -> 137 passed (+2 tests)
- **Plain-language summary**:
  Evaluated the authored fallback hints in `app.rules.hint_ladder`. Concluded that the core intent was already substantially satisfied by `GENERIC_FALLBACK_HINTS` and `TEMPLATED_FALLBACK_PATTERNS` across all 4 rungs for both `ar_EG` and `en` without violating progressive disclosure. Extended the module rather than duplicating it by adding `CONCEPT_FOREIGN_EXAMPLES` and canonical `CONCEPT_ALIASES` for the launch curriculum's core concepts (`variables`, `conditionals`, `loops`, `functions`, `lists`, `dictionaries`). On Rung 3 (NAME_IT), recognized concepts are now enriched with curated foreign syntax illustrations using non-mission variables, fulfilling AGENTS.md's rule to "show the pattern on a *different* example".
- **Assumptions made**:
  - Foreign examples on Rung 3 must strictly avoid identifiers or target values from any launch mission.
  - Rungs 1 and 2 must remain purely concept-agnostic to protect progressive disclosure.
- **Open questions for review**: None.

---

### Task 4: `ai/chains/classify_error.py` — family + tag (M3, P1)

- **CSV Notes verbatim**: `Blocked by nobody`
- **Status**: DONE
- **Files touched**:
  - `ai-backend/app/ai/prompts/error_analysis.py`
  - `ai-backend/app/ai/chains/classify_error.py`
  - `ai-backend/app/ai/chains/__init__.py`
  - `ai-backend/tests/test_classify_error.py`
- **Test count**: 137 -> 144 passed (+7 tests)
- **Plain-language summary**:
  Implemented error analysis chain using structured output from `gemini-3.5-flash-lite` via `AICapability.CLASSIFY`. Classifies code execution failures into the 7-value closed `ErrorFamily` enum and an open snake_case `tag` (conforming to `^[a-z][a-z0-9_]*$`). Added automatic escalation to `gemini-3.5-flash` (`AICapability.REVIEW`) when classification confidence drops below 0.6 or family is UNKNOWN. Built deterministic AST and keyword fallbacks ensuring safe recovery on provider outages, PII stripping, tag normalization, and scaffold tampering detection.
- **Assumptions made**:
  - Low confidence threshold for escalation is 0.6.
  - Sane deterministic heuristics handle offline provider states without crashing the API contract.
- **Open questions for review**: None.
