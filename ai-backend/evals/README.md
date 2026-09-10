# Evals

Tests ask "does the code do what it says". Evals ask "is the **model** any good at this" —
a different question, with a threshold instead of an assertion, because a model that is
right 29 times out of 30 has not failed.

| eval | asks | gate |
|---|---|---|
| `composer_eval.py` | do the composer's invariants hold across the whole profile space? | 2,112 profiles, every invariant |
| `error_classification_accuracy_eval.py` | does the classifier put real mistakes in the right family? | 90% family accuracy |

Run them like tests: `pytest evals/`.

## What is missing, and why

`generation_legality_eval.py` — 23 cases asserting a generated mission only uses what the
world manifest declares — is **not here**. It was written against the props-and-verbs
generator (`app/ai/graphs/mission_gen.py`, `validate_manifest_and_solution`), which was
deleted in #6 when the content turned out to be plain Python functions rather than a game
API. Its cases are about invented prop verbs like `gate.teleport`, and neither the module
nor the concept exists any more.

**The question it asked is still the right one.** Generation is selection from a closed
set, and nothing currently checks that at the eval level — `tests/test_generation.py`
covers the validator, but not "did the model reach outside the vocabulary". Rewriting it
against the six-phase generator is worth doing; the original is preserved on the `ai/eval`
branch to write it from.
