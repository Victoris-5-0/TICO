/**
 * The shape of an authored bakery script.
 *
 * Both the opening tour and the first mission are arrays of these, played by the same
 * component. That is the whole point: what a child sees in a mission should be what they
 * saw in the tour — the same shop, the same people, speech over their heads, and things
 * they click — rather than a picture parked beside a panel of text.
 *
 * ## Why authored
 *
 * Generation produced scenarios that were individually fine and collectively incoherent:
 * a stranger appearing mid-story to say "I'm in a hurry, I want six", with no relation to
 * anything that happened before it. The structure of a lesson is not something to
 * improvise per learner — it is the part that has to be right every time.
 *
 * So the beats are written here and the model's job shrinks to dressing them: which
 * neighbour comes in, what they want, how many sacks are left. `docs/12` calls this
 * author the beats, generate the dressing, and the split is the same one `visual.sprites`
 * already enforces on art.
 *
 * ## The six phases survive
 *
 * `phase` labels each stop with the stage of the learning flow it belongs to, so the
 * contract in `lib/ai/types.ts` still describes what is happening even though the
 * rendering is nothing like the old phase panels. A mission that skips a phase is a
 * mission that skipped a rung, and the test suite says so.
 */

/** The four TICO drawings that exist. Anything else would be a missing image. */
export type TicoPose = "neutral" | "thinking" | "determined" | "celebrating";

export type Speaker = "tico" | "hassan" | "mariam";

/**
 *   ask     the named prop lights up; clicking it is the only way on
 *   say     a line to read and pass
 *   watch   `action` fires on entry and Next is held until the bakery is at rest
 *   choose  a question with answers, before anything is explained
 *   code    the editor, bound live to the scene
 */
export type StopKind = "ask" | "say" | "watch" | "choose" | "code";

export type LessonPhase = "encounter" | "explore" | "discover" | "understand" | "guided" | "remix";

export type Answer = { ar: string; en: string; correct?: boolean };

/**
 * One typing step.
 *
 * `binding` is the variable the scene watches. The player reads it out of the editor on
 * every keystroke with a plain regex and hands the number to the tray — so the bread
 * changes as they type, before Run and before any Python has executed. Run then executes
 * the real thing through the Pyodide worker and judges it on `tests`.
 */
export type CodeStep = {
  binding: string;
  /**
   * The understand rung: the finished code, shown but not editable, with a Run that plays
   * it. The live binding still drives the tray, so pressing Run is watching the number in
   * front of them become bread.
   */
  readOnly?: boolean;
  starter: string;
  solution: string;
  /** What `binding` has to end up being. Also what the scene plays out on a pass. */
  answer: number;
  tests: ReadonlyArray<{ call: string; expected: string }>;
};

/**
 * World facts a stop sets when it is reached.
 *
 * Applied cumulatively — the player scans from the start of the script to the current
 * stop and keeps the last value declared for each. Derived rather than stored, so
 * stepping backwards rewinds the shop with no undo to get wrong.
 */
export type WorldFacts = {
  /** The hanging sign. The day starts closed. */
  open?: boolean;
  /** Sacks on the floor. They go down as bread gets baked. */
  sacks?: number;
};

export type Stop = {
  id: string;
  speaker: Speaker;
  /** Ignored for anyone but TICO, who has four drawings. */
  pose?: TicoPose;
  kind: StopKind;
  /** Which rung of the learning flow this belongs to. */
  phase?: LessonPhase;
  /** What lights up. Required on an `ask`, because that is also what must be clicked. */
  look?: string;
  /** Dispatched on entry to a `watch` stop. */
  action?: "arrive" | "bake" | "serve" | "leave";
  /** A fact the picture cannot draw, shown as a labelled panel by the order sheet. */
  note?: { ar: string; en: string };
  /** Set on the stop where it becomes true, not repeated afterwards. */
  world?: WorldFacts;
  answers?: ReadonlyArray<Answer>;
  code?: CodeStep;
  ar: string;
  en: string;
};

export type Script = ReadonlyArray<Stop>;

/** The shop as of a given stop: every `world` declared up to and including it. */
export function worldAt(script: Script, step: number): Required<WorldFacts> {
  const facts: Required<WorldFacts> = { open: false, sacks: 4 };
  for (let i = 0; i <= Math.min(step, script.length - 1); i += 1) {
    const set = script[i].world;
    if (!set) continue;
    if (set.open !== undefined) facts.open = set.open;
    if (set.sacks !== undefined) facts.sacks = set.sacks;
  }
  return facts;
}

/**
 * The number a bound variable is currently set to, read straight out of the editor text.
 *
 * Deliberately not Python. This runs on every keystroke to keep the tray in step with the
 * number being typed, and starting a Pyodide worker per character would be absurd — Run
 * is where the real interpreter gets involved. A half-typed or malformed line simply has
 * no value, and the tray holds its last good one.
 */
export function boundValue(source: string, binding: string): number | null {
  const pattern = new RegExp(`^\\s*${binding}\\s*=\\s*(-?\\d+)\\s*$`, "m");
  const found = pattern.exec(source);
  if (!found) return null;
  const value = Number(found[1]);
  return Number.isFinite(value) ? value : null;
}
