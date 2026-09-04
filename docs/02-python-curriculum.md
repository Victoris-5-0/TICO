# Python curriculum

## Pedagogical contract

The launch curriculum is fixed and linear. Each lesson targets one concept and deliberately carries earlier concepts. The system can recommend skipping eligible lessons after a diagnostic, but cannot reorder them. A skipped lesson remains available.

Every lesson records one primary concept, carried concepts with weights, observable objectives, misconceptions, scaffold variants, tests, hint intents, a private reference solution, and both locales.

## Concept sequence

| Order | Concept | Learner can… |
| --- | --- | --- |
| 1 | Output and strings | produce exact text and combine values into messages |
| 2 | Variables and arithmetic | name values and calculate totals |
| 3 | Input and conversion | accept text input and convert numeric values |
| 4 | Comparisons and conditionals | select behavior from a rule |
| 5 | `for`, `range`, accumulators | repeat known work and build totals |
| 6 | Functions | package behavior with parameters and returns |
| 7 | Lists | store, access, update, and traverse ordered data |
| 8 | Queue operations | model FIFO behavior with list operations |
| 9 | Dictionaries | associate stable keys with values |
| 10 | Filtering | traverse collections and select matching items |
| 11 | Nested iteration | reason about rows and positions |
| 12 | Data-structure composition | use functions with lists and dictionaries |
| 13 | Multi-branch rules | express ordered signal rules with `if/elif/else` |
| 14 | `while` loops | repeat until a changing condition is false |
| 15 | Aggregation and validation | summarize sensor data and handle invalid values |
| 16 | State transitions | update dictionary state through functions |
| 17 | Debugging | read tracebacks and repair common faults |
| 18 | Integrated simulation | combine state, functions, loops, and rules |

## Launch mission matrix

| # | World | Mission | Primary concept | Problem outcome |
| ---: | --- | --- | --- | --- |
| 1 | Bakery | Opening Message | output, strings | print the bakery opening notice exactly |
| 2 | Bakery | Count the Trays | variables, arithmetic | calculate available loaves from trays |
| 3 | Bakery | Family Order | input, `int` conversion | calculate a household order from input |
| 4 | Bakery | Fair Share | comparisons, `if/else` | accept or adjust an order against a limit |
| 5 | Bakery | Morning Batches | `for`, `range`, accumulator | total loaves across production batches |
| 6 | Bakery | Bakery Calculator | functions, return values | create a reusable order calculator |
| 7 | Station | Passenger List | list access and slicing | show the next passengers to board |
| 8 | Station | Ticket Queue | FIFO list operations | serve the ticket queue in order |
| 9 | Station | Destination Board | dictionaries | map train codes to destinations |
| 10 | Station | Right Platform | iteration and filtering | select passengers for a platform |
| 11 | Station | Seat Rows | nested loops, `enumerate` | assign seat labels by carriage row |
| 12 | Station | Station Dispatcher | functions, lists, dictionaries | generate a dispatch summary |
| 13 | Traffic | Signal Rules | `if/elif/else` | choose a light state from conditions |
| 14 | Traffic | Safe Countdown | `while` | count down safely before a change |
| 15 | Traffic | Sensor Summary | aggregates, validation | summarize only valid sensor readings |
| 16 | Traffic | Intersection State | dictionaries, functions | transition an intersection's state |
| 17 | Traffic | Controller Fault | tracebacks, debugging | repair a faulty controller program |
| 18 | Traffic | Green Wave | integrated simulation | coordinate consecutive intersections |

The first six lessons establish the mandatory core order. Later lessons may introduce data structures while continuing to carry and assess that core. Curriculum metadata identifies gates that are never skippable.

## Assessment rules

- Tests evaluate observable behavior, not similarity to a reference solution.
- Visible examples teach the contract; hidden browser tests cover boundaries and misconceptions.
- Browser-hidden tests are formative, not secure; a learner can inspect them.
- A passing result is client-reported. This is acceptable for MVP because rewards are not competitive, credentialed, or economic.
- Completion, XP, extension award, submission, and mastery event are idempotent and atomic.
- Syntax and runtime errors map to a fixed category enum before tailored feedback.

## Mastery

Mastery updates target and carried concepts from validated outcomes. The target receives full configured weight; carried concepts receive fractional lesson weights. Formula, thresholds, decay, and evidence requirements are versioned deterministic configuration. Model output may explain a decision but cannot supply mastery numbers.

Conflicting signals may trigger model review of a rule-proposed advance/hold decision. Store the rule output, confidence, reviewer output, and reason.

## Content acceptance checklist

A lesson cannot publish unless both locales exist; objectives map to tests; its solution passes every test; every world reference exists in the manifest; four hints meet disclosure limits; mode variants preserve the correctness contract; accessibility text exists; and a teacher or admin approves the validated version.
