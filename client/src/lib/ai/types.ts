/**
 * AI backend contract types.
 *
 * ============================================================================
 *  GENERATED FILE - DO NOT EDIT BY HAND
 *
 *  Regenerate:  cd ai-backend && python scripts/gen_client_types.py
 *  Source:      the FastAPI service's /openapi.json
 * ============================================================================
 *
 * These describe the `data` half of the response envelope, which is what
 * `aiClient.fetchAi<T>` returns after unwrapping. Field names are camelCase on
 * the wire; the Python source is snake_case and the boundary is declared in
 * `ai-backend/app/schemas/common.py`.
 *
 * Editing this file by hand is what caused the contract drift in the first
 * place. Change the Pydantic schema instead, then rerun the generator.
 */

/** Every successful /v1 response. See docs/06-data-model-and-contracts.md. */
export interface Envelope<T> {
  data: T;
  meta: {
    request_id: string;
    stub: boolean;
    cached: boolean;
  };
}

/** Every 4xx/5xx response. `request_id` and `retryable` are snake_case per docs/06. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    request_id: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
}

export interface AnalyzeRequest {
  sessionId: string;
  /** Which try this is. Real evidence, not bookkeeping: the same error on attempt 7 means something different from the same error on attempt 1. */
  attemptNumber?: number;
  /** The submissions row, when the engine has created one. */
  submissionId?: string | null;
  code: string;
  errorText?: string | null;
  expectedOutput?: string | null;
  actualOutput?: string | null;
}

export interface AnalyzeResponse {
  /** Closed, seven values. Drives syntax_vs_logic and the classifier eval. The guard rejects anything outside the enum. */
  errorFamily: ErrorFamily;
  /** OPEN snake_case label, e.g. 'assignment_vs_comparison'. The hint cache key. The prompt carries the tags seen so far; the model reuses one if it fits and otherwise coins a new one, so the vocabulary grows from real students. */
  errorTag: string;
  /** One sentence naming what the student misunderstands. Feeds TICO's hint. */
  misconception: string;
  confidence: number;
  /** The model coined this tag. A spike in new tags is a signal to look at what students are actually hitting. */
  isNewTag?: boolean;
  /** Low confidence sent this to the stronger model for a second pass. */
  escalated?: boolean;
  /** The student broke something the composer had scaffolded — useful signal about the scaffold itself. */
  inScaffoldedRegion?: boolean;
}

/**
 * The arena, for students who finished the roadmap. No scaffolding, shorter hint
 * ladder, concepts mixed and weighted toward the weakest — a challenge should stretch,
 * not flatter.
 */
export interface ChallengeRequest {
  /** Restrict the arena to one world, e.g. 'cairo_metro'. Omit to mix across everything the student has unlocked. */
  worldSlug?: string | null;
  /** Recently played, to avoid repeats. */
  excludeLevelIds?: Array<string>;
}

/** Rules propose, the model reviews. Always recorded so a decision can be explained. */
export type DecidedBy = "RULE" | "MODEL";

/**
 * The error object from `docs/06-data-model-and-contracts.md`.
 *
 * Its field names are snake_case **on the wire as well** — deliberately. docs/06 spells
 * them `request_id` and `retryable` inside this object, and it is the authority. An
 * inconsistency the contract states explicitly beats a tidier one nobody agreed to.
 */
export interface ErrorBody {
  /** Stable machine-readable code, e.g. 'manifest_reference_invalid'. */
  code: string;
  /** Safe to show a student. Never a stack trace or a solution. */
  message: string;
  /** Echoes X-Request-ID. This is how a bug report becomes a log query. */
  requestId: string;
  /** Whether the client may retry the identical call. */
  retryable: boolean;
  details?: Record<string, unknown>;
}

/** Coarse and stable. Seven values, closed.

This half exists so the numbers work: `syntax_vs_logic` is a count, and the
classifier eval needs a fixed answer set to score against. The specificity lives
in the open `tag` on AnalyzeResponse, which grows from real students. */
export type ErrorFamily = "SYNTAX" | "NAME" | "TYPE" | "LOGIC" | "INCOMPLETE" | "RUNTIME" | "UNKNOWN";

/**
 * What every 4xx/5xx returns. A child mid-mission never sees a raw stack trace.
 */
export interface ErrorResponse {
  error: ErrorBody;
}

/**
 * Explicit generation, as opposed to `/missions/next` which *decides* what is next.
 *
 * Every field is optional: with an empty body the server derives all of it from the
 * student's plan and mastery. That is the "server narrows, the model chooses" rule —
 * anything the client may pass here is a hint, and the server still bounds it against
 * the world manifest before generation runs.
 */
export interface GenerateMissionRequest {
  lessonId?: string | null;
  /** Concept slug, e.g. 'loops'. */
  concept?: string | null;
  worldManifestVersion?: string | null;
  /** Override the composer. Ignored unless the caller is a teacher. */
  scaffoldLevel?: ScaffoldLevel | null;
  locale?: string;
}

/**
 * Exercise-shaped, because this is what gets written to an `exercises` row.
 *
 * Deliberately flatter than `GeneratedMissionOut`: that one describes a mission chosen
 * *for a student* and carries the per-student scaffold reasoning, this one describes the
 * authored artefact.
 */
export interface GenerateMissionResponse {
  missionId: string;
  title: string;
  instructions: string;
  starterCode: string;
  /** [{input, expectedOutput, isHidden?}] — the `exercises.testCases` shape. */
  testCases?: Array<Record<string, unknown>>;
  /** Authored fallback, one per rung. Used when the model is unavailable or the answer-leak assertion rejects its output. */
  hints?: Array<string>;
  /** {"primary": slug, "carried": [slug, ...]} */
  concepts?: Record<string, unknown>;
  scaffoldPlan?: Record<string, unknown>;
  /** Set by the Python validator, never by the model. False is never shipped to a student. */
  validated: boolean;
  engineVersion: string;
}

export interface GeneratedMissionOut {
  id: string;
  levelId: string;
  /** Fixed by the roadmap. Generation never changes the world. */
  worldId: string;
  /** Chosen from the manifest's scene list. */
  sceneId: string;
  targetConceptId: string;
  carriedConceptIds?: Array<string>;
  /** The situation, in TICO's voice. */
  brief: string;
  /** Python, with the scaffold plan already applied. */
  starterCode: string;
  tests?: Array<MissionTest>;
  scaffoldPlan: ScaffoldPlan;
  /** What generation filled in, bounded by param_schema. */
  params?: Record<string, unknown>;
  /** Set by the validator function, never by the model. An unvalidated mission is never returned. */
  validated: boolean;
  /** An equivalent params + scaffold combination already existed and was reused. */
  reused?: boolean;
}

export interface HealthResponse {
  status: string;
  environment: string;
  database: string;
}

/**
 * Fields follow `docs/06`: "mission/session IDs, code excerpt, last result, locale".
 *
 * Serialised camelCase — `sessionId`, `missionId`, `codeExcerpt`, `lastResult` — which
 * is what `client/src/lib/ai/client.ts` has always sent.
 */
export interface HintRequest {
  sessionId: string;
  /** The exercise the student is on. `Exercise` is the row; 'mission' is what it is called everywhere the student can see, and the contract uses the student-facing word. Needed to load test cases and to key the hint cache. */
  missionId: string;
  /** The student's current code, exactly as typed. */
  codeExcerpt: string;
  /** Outcome of the most recent run, from the engine. The AI service never executes code. */
  lastResult?: LastResult | null;
  locale?: string;
  /** The actual failing message. `lastResult` says *that* it failed; this says how, which is what separates a useful hint from a generic one. */
  errorText?: string | null;
  /** From /submissions/analyze if it has already run, e.g. 'assignment_vs_comparison'. Sharpens the hint and forms part of the cache key. */
  errorTag?: string | null;
}

export interface HintResponse {
  /** Which rung this is. Decided in Python, not by a model. */
  rung: HintRung;
  /** TICO's words. Egyptian Arabic prose, English identifiers. */
  hint: string;
  /** True on rung 4. The client should then offer the mini-practice, not an answer. */
  isFinal: boolean;
  /** Set when is_final: 'mini_practice'. No rung ever returns the solution. */
  nextStep?: string | null;
  hintEventId: string;
  /** Served from the Postgres hint cache with no model call. Expected to be common on early lessons. */
  cached?: boolean;
}

/** The 4-rung ladder. The server fixes the rung before any model is called.

No rung ever emits a complete solution. After WALK the student is sent to a
mini-practice on the same idea, not to the answer. */
export type HintRung = 1 | 2 | 3 | 4;

/** Outcome of the student's most recent run, as the engine reports it.

Screaming case because that is what `client/src/lib/ai/types.ts` already sends and
what `SubmissionStatus` uses in Prisma. Keeping one spelling across the three
languages is worth more than matching the lowercase style of the enums below. */
export type LastResult = "PASSED" | "FAILED" | "ERROR" | "TIMEOUT";

/**
 * One row of the student's personal path. The concept order never changes; which
 * lessons are in the path does.
 */
export interface LessonPlanEntry {
  levelId: string;
  requirement: LessonRequirement;
  reason?: string | null;
  decidedBy: DecidedBy;
  confidence: number;
  decidedAt?: string | null;
}

export type LessonRequirement = "REQUIRED" | "OPTIONAL" | "DONE" | "SKIPPED";

/**
 * Per student, per concept. Moved by the target concept at full weight and by every
 * carried concept at its own `level_concept.weight`.
 */
export interface MasteryOut {
  conceptId: string;
  mastery: number;
  confidence: number;
  evidenceCount: number;
  lastSeenAt?: string | null;
}

/**
 * One check the engine runs against the student's code. The validator asserts the
 * generated solution passes all of these before the mission ships.
 */
export interface MissionTest {
  name: string;
  /** Python expression to evaluate, using only manifest verbs. */
  call: string;
  expected: string;
}

/**
 * docs/06 endpoint 5: "learner profile, lesson, world manifest version".
 *
 * The *learner* half is deliberately absent. The student comes from the verified JWT,
 * never from the body — a client that could name the student could ask for another
 * child's next mission. Same reason `worldId` is not here: the roadmap fixes it.
 */
export interface NextMissionRequest {
  /** Which lesson to compose for. Omit and the server takes the next one from the student's LessonPlan, which is the normal path. */
  lessonId?: string | null;
  /** Pin generation to a manifest version. Omit for current. The server still validates every prop and verb against that manifest. */
  worldManifestVersion?: string | null;
  /** Skip reuse and compose a fresh scenario. Costs a model call. */
  forceRegenerate?: boolean;
}

/** The seven-phase mission loop from the proposal. */
export type Phase = "ENCOUNTER" | "EXPLORE" | "DISCOVER" | "UNDERSTAND" | "GUIDED_CODING" | "ADAPT_REMIX" | "INDEPENDENT";

export interface PlanRequest {
  /** From onboarding. True marks every lesson required with no diagnostic and no model call. */
  isBeginner: boolean;
  /** The diagnostic playthrough. Required when is_beginner is False. */
  diagnosticSessionId?: string | null;
  selfReportedLevel?: string | null;
}

export interface PlanResponse {
  lessons: Array<LessonPlanEntry>;
  startingLevelId: string;
  skippedCount: number;
  /** What they are skipping and why, in TICO's voice. */
  summary: string;
}

/**
 * docs/06 calls the input to this endpoint an "evidence watermark".
 *
 * It is the id of the newest submission the caller already knows about. The recompute
 * reads only evidence newer than it, which makes the call idempotent: firing it twice
 * after the same session is a no-op rather than double-counting a student's attempts
 * into their mastery score.
 *
 * Optional — with no watermark the server recomputes from the last stored one.
 */
export interface RefreshRequest {
  /** Newest submission or progress id the caller has already accounted for. */
  watermark?: string | null;
}

export interface RefreshResponse {
  profile: StudentProfileOut;
  concepts: Array<MasteryOut>;
  /** Did the gate move the student on, or hold them for another rep? */
  advanced: boolean;
  decidedBy: DecidedBy;
  /** Why. Always set when decided_by is MODEL. */
  reason?: string | null;
  /** Human-readable, written after the numbers exist. */
  summary?: string | null;
}

/** How much of a carried concept is pre-filled in the starter code. */
export type ScaffoldLevel = "NONE" | "PARTIAL" | "FULL";

/**
 * What the composer decided, per carried concept. Also part of the hint cache key —
 * TICO must not hint about a concept that was scaffolded away.
 */
export interface ScaffoldPlan {
  /** concept_id -> how much is pre-filled. */
  scaffold?: Record<string, ScaffoldLevel>;
  difficultyBand: number;
  /** 1 on a first attempt, higher when the composer scheduled extra practice. */
  repNumber: number;
}

export interface SessionClose {
  outcome: SessionOutcome;
  timeSpentMs: number;
}

export interface SessionCreate {
  /** The lesson being played. */
  levelId: string;
  /** The composed scenario, when the mission came from generation. */
  generatedMissionId?: string | null;
}

/**
 * The end-of-mission screen: what the student actually did, in TICO's voice.
 *
 * Everything except `tico_feedback` is counted in Python from `submissions` and
 * `hint_events`. The model only writes the sentence — it is never asked how many
 * attempts there were, because it would guess.
 */
export interface SessionDebriefResponse {
  sessionId: string;
  outcome: SessionOutcome;
  totalAttempts: number;
  hintsUsed: number;
  /** Error tags that appeared and then stopped appearing. This is the thing worth celebrating, and it is the one metric a student actually feels. */
  errorsOvercome?: Array<string>;
  timeSpentMs: number;
  /** Concepts that crossed the mastery threshold in this session. */
  conceptsMastered?: Array<string>;
  /** Egyptian Arabic. Specific to what happened, never generic praise. */
  ticoFeedback: string;
  starsEarned: number;
}

export interface SessionOut {
  id: string;
  userId: string;
  levelId: string;
  generatedMissionId?: string | null;
  phase: Phase;
  outcome: SessionOutcome;
  hintsUsed: number;
  timeSpentMs: number;
  startedAt: string;
  endedAt?: string | null;
}

export type SessionOutcome = "IN_PROGRESS" | "SOLVED" | "ABANDONED" | "TIMED_OUT";

export interface SessionPhaseUpdate {
  phase: Phase;
}

export type SkillBand = "STRUGGLING" | "ON_LEVEL" | "READY_TO_STRETCH";

/**
 * A cache of the evidence tables, but it is what every prompt loads. Recomputed in the
 * background after a session closes, never in the request path.
 */
export interface StudentProfileOut {
  userId: string;
  selfReportedLevel?: string | null;
  skillBand: SkillBand;
  hintDependency: number;
  /** 0 = errors are mostly syntax, 1 = mostly logic. */
  syntaxVsLogic: number;
  pace?: number | null;
  locale?: string;
  lastComputedAt?: string | null;
  modelVersion?: string | null;
}

export interface TicoMessageRequest {
  /** Also the LangGraph thread_id. A closed session is rejected — TICO has no context to stand on. */
  sessionId: string;
  message: string;
}
