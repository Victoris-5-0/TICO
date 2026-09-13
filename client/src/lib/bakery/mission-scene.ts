/**
 * Turn a mission's world description into something `BakeryScene` can draw.
 *
 * A mission speaks the manifest's language — `{ oven: "lit", tray: 2, loaf: 8 }` and an
 * `animate` naming one of `visual.animations`. The scene speaks `BakeryState`. This is
 * the seam between them, and it is deliberately the only place that knows both.
 *
 * The animation names in `el_forn.yaml` ARE the simulation's phase names — that is why
 * they were merged from the demo inventory rather than invented — so `animate` maps
 * across directly. A name the scene does not know leaves the scene still rather than
 * throwing; the Python validator already rejects those, and a dead frame is a better
 * failure than a blank page if one ever gets through.
 */

import { CUSTOMER_IDS, DURATIONS, type BakeryState, type CustomerId, type Loaf, type LoafOwner, type Phase } from "./simulation";

/** The props a mission may set, as the manifest's `visual.sprites` keys. */
export type MissionProps = Record<string, number | string>;

// Every phase the reducer can be in. `arriving` and `paying` were added for the scripted
// encounter and belong here too, or a mission naming one gets a still frame and no error.
const PHASES: readonly Phase[] = [
  "idle", "arriving", "loading", "baking", "retrieving", "stocking",
  "handover", "paying", "exiting", "advancing", "complete",
];

export const isScenePhase = (name: string): name is Phase => (PHASES as readonly string[]).includes(name);

/**
 * Where loaves sit for a given phase.
 *
 * A mission says how many loaves exist, not where they are — but a loaf has to be
 * somewhere for the scene to draw it, and "on the tray" is wrong while the oven is
 * mid-bake. The phase decides.
 */
function ownerForPhase(phase: Phase): LoafOwner {
  switch (phase) {
    case "loading":
      return "dough";
    case "baking":
      return "oven";
    case "retrieving":
    case "stocking":
      return "peel";
    default:
      return "tray";
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * World keys the scene draws rather than reports as a readout.
 *
 * `queue` matters most: every mission used to render all eight neighbours because that was
 * the only thing this mapper knew how to do, so every scene looked identical no matter who
 * the mission was about. A mission about one customer now gets one customer.
 */
const DRAWN = new Set(["loaf", "dough", "oven", "queue", "flour-sack", "sign"]);

const toCount = (value: number | string | undefined): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // The contract allows "= total", a reference to a variable in the student's code. The
  // player resolves those before calling this; anything still unresolved is not a count.
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export type MissionSceneOptions = {
  /** Sprite counts and states from the mission, e.g. `{ oven: "lit", loaf: 8 }`. */
  props?: MissionProps;
  /** One of the manifest animations. Omit for a still scene. */
  animate?: string | null;
  /** 0..1 through the animation. The player drives this from its own clock. */
  progress?: number;
  /**
   * How many of the eight customers to draw.
   *
   * All eight by default. The queue runs from x=550 to x=1595 — the right two thirds of
   * the frame — which is exactly the part the mission panel leaves uncovered, so it is
   * what the student is actually looking at. Trimming it would empty the half of the
   * scene that is on show.
   */
  queueLength?: number;
};

/**
 * Build the state the scene renders for one mission beat.
 *
 * `tray` is a count in mission vocabulary but the scene draws exactly one tray, so the
 * number is not drawn — the player surfaces it as a readout instead. Pretending to draw
 * two trays would be the same class of lie the manifest's `simulation` block exists to
 * prevent.
 */
export function missionSceneState({ props = {}, animate, progress = 0, queueLength: shown }: MissionSceneOptions): BakeryState {
  const queueSize = shown ?? queueLength(props);
  const phase: Phase = animate && isScenePhase(animate) ? animate : "idle";

  const loafCount = toCount(props.loaf) ?? toCount(props.dough) ?? 0;
  const owner = ownerForPhase(phase);

  // `max_shown: 8` in the manifest is what the tray has slots for. Beyond that the scene
  // silently drops loaves, so clamp here and let the caller report the real number.
  const loaves: Loaf[] = Array.from({ length: clamp(Math.round(loafCount), 0, 8) }, (_, id) => ({
    id,
    owner,
  }));

  // The oven's fire is driven by the phase, so an explicitly lit oven needs a phase that
  // keeps it burning. `baking` is the one that does, and it is also what a mission means
  // by "lit" while nothing else is happening.
  const litWithoutPhase = props.oven === "lit" && phase === "idle";

  const served: CustomerId[] = [];
  const queue: CustomerId[] = CUSTOMER_IDS.slice(0, queueSize);

  return {
    phase: litWithoutPhase ? "baking" : phase,
    elapsed: (DURATIONS[phase] || 0) * clamp(progress, 0, 1),
    queue,
    served,
    loaves,
    batches: loaves.length ? 1 : 0,
    // `paying` needs one too: the banknote is drawn from the active customer's hand.
    active: phase === "handover" || phase === "exiting" || phase === "paying" ? queue[0] ?? null : null,
    auto: false,
    paused: false,
    hidden: false,
    notice: "phase",
    // A mission draws a still frame of the world; nobody is buying anything in it.
    money: 0,
    charge: 0,
  };
}

/** How long the scene will spend on this animation, in ms. 0 for a still scene. */
export function missionSceneDuration(animate?: string | null): number {
  return animate && isScenePhase(animate) ? DURATIONS[animate] : 0;
}

/**
 * Props a mission set that the scene cannot draw as a count.
 *
 * Returned so the player can show them as text. `tray: 2` is real information the child
 * needs — it just is not something the artwork can express.
 */
export function undrawnProps(props: MissionProps = {}): Array<[string, number | string]> {
  return Object.entries(props).filter(([key]) => !DRAWN.has(key));
}

/** How many of the eight customers to draw. Omitted keeps the old all-eight behaviour. */
export function queueLength(props: MissionProps = {}): number {
  return clamp(Math.round(toCount(props.queue) ?? CUSTOMER_IDS.length), 0, CUSTOMER_IDS.length);
}

/** Sacks of flour, drawn one per unit. Undefined leaves the painted pile alone. */
export function flourSacks(props: MissionProps = {}): number | undefined {
  const count = toCount(props["flour-sack"]);
  return count === null ? undefined : clamp(Math.round(count), 0, 4);
}

/**
 * The hanging sign, if the mission has an opinion about it.
 *
 * This is the manifest's `write` action in its simplest form: a value out of the student's
 * code becomes text on a surface in the shop. The first variable a child ever writes turns
 * this from مقفول to مفتوح, which is the whole lesson in one line.
 */
export function shopOpen(props: MissionProps = {}): boolean | undefined {
  const value = props.sign;
  if (value === "open" || value === "مفتوح" || value === 1) return true;
  if (value === "closed" || value === "مقفول" || value === 0) return false;
  return undefined;
}
