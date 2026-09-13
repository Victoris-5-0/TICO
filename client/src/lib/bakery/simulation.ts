/** Client-only preview state. Not a lesson API, Python runner or progress contract. */
export const CUSTOMER_IDS = ["mariam", "nour", "amina", "omar", "dina", "youssef", "hoda", "farid"] as const;
export type CustomerId = (typeof CUSTOMER_IDS)[number];
/**
 * `arriving` and `paying` exist for the scripted encounter in the opening tour; the
 * eight-customer demo never enters either, so its timings are untouched.
 */
export type Phase = "idle" | "arriving" | "loading" | "baking" | "retrieving" | "stocking" | "handover" | "paying" | "exiting" | "advancing" | "complete";
export type LoafOwner = "dough" | "oven" | "peel" | "tray" | `handover:${CustomerId}` | `customer:${CustomerId}`;
export type Loaf = { id: number; owner: LoafOwner };
export type BakeryState = {
  phase: Phase;
  elapsed: number;
  /** Total active playback time; shared by customer patience and scene motion. */
  playbackElapsed?: number;
  orderSizes?: Readonly<Record<CustomerId, number>>;
  queue: CustomerId[];
  served: CustomerId[];
  loaves: Loaf[];
  batches: number;
  active: CustomerId | null;
  auto: boolean;
  paused: boolean;
  hidden: boolean;
  notice: "welcome" | "empty" | "full" | "phase";
  /** Takings, in pounds. Only the scripted encounter moves it. */
  money: number;
  /**
   * What the customer being served still owes. A serve that names a price stops for a
   * `paying` phase; a serve without one — every call the demo makes — goes straight out
   * to `exiting` exactly as it always did.
   */
  charge: number;
};
export type BakeryAction = { type: "bake" | "demo" | "pause" | "reset" | "arrive" | "leave" } | { type: "serve"; count?: number; price?: number } | { type: "tick"; ms: number } | { type: "visibility"; hidden: boolean };
export const BATCH_SIZE = 8;
export const ORDER_SIZE = 2;
export const CUSTOMER_ORDER_SIZES: Readonly<Record<CustomerId, number>> = {
  mariam: 2, nour: 1, amina: 3, omar: 2, dina: 1, youssef: 3, hoda: 2, farid: 2,
};
export const customerOrderSize = (state: BakeryState, id: CustomerId) => state.orderSizes?.[id] ?? ORDER_SIZE;
export const DURATIONS: Record<Phase, number> = {
  idle: 0, arriving: 2600, loading: 1800, baking: 2800, retrieving: 1800, stocking: 1400,
  handover: 2000, paying: 1700, exiting: 2200, advancing: 1400, complete: 0,
};
export const readyLoaves = (state: BakeryState) => state.loaves.filter((loaf) => loaf.owner === "tray");
export const isBusy = (state: BakeryState) => state.phase !== "idle" && state.phase !== "complete";
export const phaseProgress = (state: BakeryState) => DURATIONS[state.phase] ? Math.min(1, state.elapsed / DURATIONS[state.phase]) : 0;
export function initialBakeryState(): BakeryState {
  return { phase: "idle", elapsed: 0, playbackElapsed: 0, orderSizes: CUSTOMER_ORDER_SIZES, queue: [...CUSTOMER_IDS], served: [], loaves: [], batches: 0, active: null, auto: false, paused: false, hidden: false, notice: "welcome", money: 0, charge: 0 };
}
const moveOwner = (state: BakeryState, from: LoafOwner, to: LoafOwner) => state.loaves.map((loaf) => loaf.owner === from ? { ...loaf, owner: to } : loaf);
function enter(state: BakeryState, phase: Phase): BakeryState {
  return { ...state, phase, elapsed: 0, notice: "phase" };
}
function bake(state: BakeryState): BakeryState {
  if (isBusy(state) || state.paused || state.hidden || !state.queue.length) return state;
  const stock = readyLoaves(state).length;
  if (stock >= customerOrderSize(state, state.queue[0])) return { ...state, notice: "full" };
  const loaves: Loaf[] = Array.from({ length: BATCH_SIZE - stock }, (_, i) => ({ id: state.loaves.length + i, owner: "dough" }));
  return enter({ ...state, batches: state.batches + 1, loaves: [...state.loaves, ...loaves] }, "loading");
}
function serve(state: BakeryState, count?: number, price = 0): BakeryState {
  if (isBusy(state) || state.paused || state.hidden || !state.queue.length) return state;
  const stock = readyLoaves(state);
  const active = state.queue[0];
  const quantity = count ?? customerOrderSize(state, active);
  if (stock.length < quantity) return { ...state, notice: "empty" };
  const ids = new Set(stock.slice(0, quantity).map((loaf) => loaf.id));
  return enter({ ...state, active, charge: price, loaves: state.loaves.map((loaf) => ids.has(loaf.id) ? { ...loaf, owner: `handover:${active}` } : loaf) }, "handover");
}
/** The customer walks in. Only the scripted encounter uses this. */
function arrive(state: BakeryState): BakeryState {
  if (isBusy(state) || state.paused || state.hidden || !state.queue.length) return state;
  return enter(state, "arriving");
}
/** ...and walks out again, once they have their bread and have paid for it. */
function leave(state: BakeryState): BakeryState {
  if (isBusy(state) || state.paused || state.hidden || !state.active) return state;
  return enter(state, "exiting");
}
function continueDemo(state: BakeryState): BakeryState {
  if (!state.auto || state.phase !== "idle") return state;
  return readyLoaves(state).length >= customerOrderSize(state, state.queue[0]) ? serve(state) : bake(state);
}
function finishPhase(state: BakeryState): BakeryState {
  switch (state.phase) {
    // She reaches the counter and stands there. Without this the walk never ends: the
    // default arm below leaves the phase alone, the clock keeps re-finishing it, and every
    // later action is refused because the shop still counts as busy.
    case "arriving": return enter(state, "idle");
    case "loading": return enter({ ...state, loaves: moveOwner(state, "dough", "oven") }, "baking");
    case "baking": return enter({ ...state, loaves: moveOwner(state, "oven", "peel") }, "retrieving");
    case "retrieving": return enter(state, "stocking");
    case "stocking": return continueDemo(enter({ ...state, loaves: moveOwner(state, "peel", "tray") }, "idle"));
    case "handover": {
      if (!state.active) return state;
      const handed = { ...state, loaves: moveOwner(state, `handover:${state.active}`, `customer:${state.active}`) };
      // A priced order stops to be paid for; an unpriced one leaves straight away, which
      // is every serve the demo makes.
      return enter(handed, state.charge > 0 ? "paying" : "exiting");
    }
    // The takings go up, and the customer stays put holding her bread — the script wants a
    // beat for her to say thank you before `leave` walks her off.
    case "paying":
      return enter({ ...state, money: state.money + state.charge, charge: 0 }, "idle");
    case "exiting":
      if (!state.active) return state;
      return enter({ ...state, served: [...state.served, state.active], queue: state.queue.slice(1), active: null }, "advancing");
    case "advancing": return state.queue.length ? continueDemo(enter(state, "idle")) : enter({ ...state, auto: false }, "complete");
    default: return state;
  }
}
export function bakeryReducer(state: BakeryState, action: BakeryAction): BakeryState {
  switch (action.type) {
    case "reset": return { ...initialBakeryState(), hidden: state.hidden };
    case "visibility": return { ...state, hidden: action.hidden };
    case "pause": return isBusy(state) ? { ...state, paused: !state.paused } : state;
    case "bake": return state.auto ? state : bake(state);
    case "serve": return state.auto ? state : serve(state, action.count, action.price);
    case "arrive": return state.auto ? state : arrive(state);
    case "leave": return state.auto ? state : leave(state);
    case "demo": return state.phase === "idle" ? continueDemo({ ...state, auto: true, paused: false }) : state;
    case "tick": {
      if (state.paused || state.hidden || !isBusy(state) || !Number.isFinite(action.ms) || action.ms <= 0) return state;
      // One bounded visual step. Background tabs or a stalled browser never drain a queue in a burst.
      const delta = Math.min(action.ms, 1000);
      const next = { ...state, elapsed: state.elapsed + delta, playbackElapsed: (state.playbackElapsed ?? 0) + delta };
      return next.elapsed >= DURATIONS[next.phase] ? finishPhase(next) : next;
    }
  }
}
