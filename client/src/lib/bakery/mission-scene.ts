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

const PHASES: readonly Phase[] = [
  "idle", "loading", "baking", "retrieving", "stocking", "handover", "paying", "exiting", "advancing", "complete",
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
export function missionSceneState({ props = {}, animate, progress = 0, queueLength = CUSTOMER_IDS.length }: MissionSceneOptions): BakeryState {
  // A generated handover is the same physical beat as the authored introduction:
  // bread first, then the customer's banknote travels into the till.
  const handoverShare = DURATIONS.handover / (DURATIONS.handover + DURATIONS.paying);
  const phase: Phase = animate === "handover" && progress > handoverShare
    ? "paying"
    : animate && isScenePhase(animate) ? animate : "idle";
  const phaseProgress = animate === "handover"
    ? phase === "handover"
      ? progress / handoverShare
      : (progress - handoverShare) / (1 - handoverShare)
    : progress;

  const loafCount = toCount(props.loaf) ?? toCount(props.dough) ?? 0;
  const active = phase === "handover" || phase === "paying" || phase === "exiting" ? CUSTOMER_IDS[0] : null;
  const owner: LoafOwner = phase === "handover" && active
    ? `handover:${active}`
    : phase === "paying" && active
      ? `customer:${active}`
      : ownerForPhase(phase);

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
  const queue: CustomerId[] = CUSTOMER_IDS.slice(0, clamp(Math.round(queueLength), 0, CUSTOMER_IDS.length));

  return {
    phase: litWithoutPhase ? "baking" : phase,
    elapsed: (DURATIONS[phase] || 0) * clamp(phaseProgress, 0, 1),
    queue,
    served,
    loaves,
    batches: loaves.length ? 1 : 0,
    active,
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
  if (animate === "handover") return DURATIONS.handover + DURATIONS.paying;
  return animate && isScenePhase(animate) ? DURATIONS[animate] : 0;
}

/**
 * Props a mission set that the scene cannot draw as a count.
 *
 * Returned so the player can show them as text. `tray: 2` is real information the child
 * needs — it just is not something the artwork can express.
 */
export function undrawnProps(props: MissionProps = {}): Array<[string, number | string]> {
  return Object.entries(props).filter(([key]) => key !== "loaf" && key !== "dough" && key !== "oven");
}
