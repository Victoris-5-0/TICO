"use client";
import { motion } from "motion/react";
import { asset, backProps, bakeryScene as scene, fixtures, frame as cutFrame, handAt, isWorldProp, propSrc, worldProps, type ActorAsset, type WorldPropName } from "@/lib/bakery/scene-manifest";
import { phaseProgress, type BakeryState, type CustomerId, type Loaf } from "@/lib/bakery/simulation";
import { NeighborhoodDetails, OvenFire } from "./neighborhood-details";

const mix = (a: number, b: number, p: number) => a + (b - a) * p;
function Sprite({ actor, frame, size = 310, flip = false }: { actor: ActorAsset; frame: number; size?: number; flip?: boolean }) {
  return <g transform={flip ? "scale(-1 1)" : undefined}>
    <svg x={-size / 2} y={-size * 360 / 384} width={size} height={size} viewBox={`${frame % actor.columns * 384} ${Math.floor(frame / actor.columns) * 384} 384 384`} overflow="hidden">
      <image href={actor.src} width={actor.columns * 384} height={actor.rows * 384} />
    </svg>
  </g>;
}
function Prop({ name, href, x, y, width, height, opacity = 1, loaf, lit, onPick, pickLabel }: { name: string; href?: string; x: number; y: number; width: number; height: number; opacity?: number; loaf?: Loaf; lit?: boolean; onPick?: () => void; pickLabel?: string }) {
  const image = <image href={href ?? asset(name)} x={x} y={y} width={width} height={height} opacity={opacity} preserveAspectRatio="none" data-loaf-id={loaf?.id} data-owner={loaf?.owner} />;
  if (!lit) return image;
  // A mission question names a prop; this is what "points at" it. A ring around the
  // artwork itself, because tinting a label underneath the picture points at the label.
  //
  // In the opening tour the same ring is also the thing a child taps to move on, so when
  // `onPick` is given the group becomes a real button: focusable, Enter and Space, and a
  // hit area that covers the artwork rather than only its opaque pixels.
  return <g
    data-lit={name}
    className={onPick ? "bakery-pick" : undefined}
    role={onPick ? "button" : undefined}
    tabIndex={onPick ? 0 : undefined}
    aria-label={onPick ? pickLabel : undefined}
    onClick={onPick}
    onKeyDown={onPick ? (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(); }
    } : undefined}
  >
    <rect x={x - 6} y={y - 6} width={width + 12} height={height + 12} rx={8} fill="none" stroke="#E9992F" strokeWidth={3} opacity={.95} />
    <rect x={x - 6} y={y - 6} width={width + 12} height={height + 12} rx={8} fill="#E9992F" opacity={.17} />
    {image}
    {onPick && <rect x={x - 6} y={y - 6} width={width + 12} height={height + 12} rx={8} fill="transparent" />}
  </g>;
}
/**
 * One of the painted fixtures, straight out of the manifest's rectangle.
 *
 * It takes `onPick` for the same reason a loose prop does: the tour asks the child to
 * press the oven and the tray, and both of those are fixtures. Leaving it off was a real
 * bug — they lit up, looked exactly like every other target, and did nothing when clicked.
 */
function Fixture({ name, lit, onPick, pickLabel }: { name: keyof typeof fixtures; lit?: boolean; onPick?: () => void; pickLabel?: string }) {
  const at = fixtures[name];
  return <Prop name={name} x={at.x} y={at.y} width={at.width} height={at.height} lit={lit} onPick={onPick} pickLabel={pickLabel} />;
}
/**
 * A plain stretch of the backdrop — plaster, dado band and pavement, no shopfront and no
 * fixtures. Tiled to build wall that is not in the original 1600-wide artwork.
 */
const WALL_SLICE = { x: 20, width: 90 };

export function BakeryScene({ state, reducedMotion, counterView, label, highlight, extendLeft = 0, loose, cast, pickable, onPick, pickLabel, sign, sacks, preview }: { state: BakeryState; reducedMotion: boolean; counterView: boolean; label: string; highlight?: readonly string[]; extendLeft?: number; loose?: readonly WorldPropName[]; cast?: readonly CustomerId[]; pickable?: string; onPick?: (name: string) => void; pickLabel?: (name: string) => string;
  /** The hanging shop sign. Omit it and no sign is drawn at all. */
  sign?: { open: boolean; label: string };
  /**
   * Draw this many single sacks instead of the painted pile.
   *
   * `flour-sack.webp` is one sack and `flour-sacks.webp` is a heap of six, so a count the
   * student's code can change has to be built from the single. The pile is the scenery
   * version; this is the countable one, and they stand in the same place.
   */
  sacks?: number;
  /**
   * Loaves to show on the tray while the bakery is at rest, ignoring what it baked.
   *
   * This is the live binding: the number in the editor is the number on the tray, before
   * Run and before any Python has executed. Only honoured at rest, so it can never fight
   * an animation that is mid-flight.
   */
  preview?: number | null; }) {
  const isLit = (name: string) => Boolean(highlight?.includes(name));
  // Exactly one thing is ever tappable, and it is always the thing wearing the ring. The
  // outline is the whole affordance — a child hunting the scene for a clickable pixel is a
  // child who has stopped listening to Hassan.
  const pick = (name: string) => (onPick && pickable === name ? () => onPick(name) : undefined);
  // Bundled so a fixture is wired up exactly like a loose prop at every call site.
  const target = (name: string) => ({ lit: isLit(name), onPick: pick(name), pickLabel: pickLabel?.(name) });
  // Extra wall to the left of the artwork, so a panel can sit over bare wall instead of
  // over the shopfront. The viewBox simply starts further left and the gap is filled with
  // tiles of `WALL_SLICE`, mirrored alternately so the repeat has no visible seam.
  const ext = counterView ? 0 : Math.max(0, Math.round(extendLeft));
  const tiles = ext ? Math.ceil(ext / WALL_SLICE.width) : 0;
  const raw = phaseProgress(state);
  const p = reducedMotion ? 0 : raw;
  const step = reducedMotion ? 0 : Math.min(3, Math.floor(raw * 4));
  const walking = reducedMotion ? 0 : 1 + Math.floor(state.elapsed / 180) % 4;
  // `cast` narrows who is drawn without touching who is in the queue. The opening tour
  // needs an empty shop that can still bake — and the reducer refuses to bake with nobody
  // waiting — so the queue stays full and the cast stays empty until the encounter.
  const onStage = (id: CustomerId) => !cast || cast.includes(id);
  const counted = typeof sacks === "number";
  const visible = counted ? loose?.filter((name) => name !== "flour-sacks") : loose;
  const crowd = cast ? [] : [scene.actors.salma];
  const baking = ["loading", "baking", "retrieving", "stocking"].includes(state.phase);

  // ------------------------------------------------ the bake, in manifest coordinates
  // Every number below used to be a literal tuned against the old painting. They are
  // offsets from the oven's mouth and the tray now, so re-drawing the shop moves the
  // choreography with it instead of leaving the peel stabbing at empty air.
  const oven = scene.oven;
  const tray = fixtures.tray;
  /** Where the baker stands to work the oven: far enough to swing a peel. */
  const ovenStation = oven.x + 120;
  const bakerX = state.phase === "loading" || state.phase === "baking" ? ovenStation
    : state.phase === "retrieving" ? mix(ovenStation, scene.baker.x, p) : scene.baker.x;
  const bakerFrame = state.phase === "loading" ? step : state.phase === "retrieving" ? 4 + step : state.phase === "stocking" ? 8 + step : state.phase === "handover" ? [10, 13, 14, 15][step] : 15;
  // The peel's tip: into the oven, back out, then over to the tray.
  const peelX = state.phase === "loading" ? mix(oven.x + 42, oven.x - 37, p)
    : state.phase === "retrieving" ? mix(oven.x - 37, tray.x - 60, p)
    : mix(tray.x - 60, scene.tray.x - 20, p);
  const peelY = state.phase === "stocking" ? mix(oven.y, scene.tray.y, p) : oven.y;
  const ovenFacing = ["loading", "baking", "retrieving"].includes(state.phase);
  const grip = handAt(scene.actors.hassan, bakerFrame, scene.bakerSize);
  const gripX = bakerX + (ovenFacing ? -grip.x : grip.x);
  const gripY = scene.baker.y + grip.y;
  const peelAngle = Math.atan2(gripY - peelY, gripX - peelX) * 180 / Math.PI;
  const peelLength = Math.hypot(gripX - peelX, gripY - peelY) + 30;
  // Four loaves across the 105-wide tray, in two rows: that is what `BATCH_SIZE` of eight
  // looks like in the picture, and why the loaf is exactly a quarter of the tray.
  const loafW = 24, loafH = 11;
  const trayX = tray.x + 4, trayY = tray.y - 6;

  function customerPosition(id: CustomerId) {
    const index = state.queue.indexOf(id);
    // She walks in from the right of frame and, when she is done, straight out to the left
    // — through the shop rather than back the way she came, which is what people do.
    if (index === 0 && state.phase === "arriving") return { x: mix(1760, scene.queue.first.x, p), y: scene.queue.first.y };
    if (state.active === id && state.phase === "exiting") return { x: mix(scene.queue.first.x, -220, p), y: scene.queue.first.y + Math.sin(Math.min(1, p * 4) * Math.PI / 2) * 45 };
    return { x: scene.queue.first.x + (index + (state.phase === "advancing" ? 1 - p : 0)) * scene.queue.spacing, y: scene.queue.first.y };
  }
  // A scene with tappable props is no longer a picture, and `role="img"` would hide every
  // one of those buttons from a screen reader.
  return <svg className="bakery-scene" viewBox={counterView ? "230 300 700 420" : `${-ext} 0 ${1600 + ext} 900`} role={onPick ? "group" : "img"} aria-label={label} data-phase={state.phase} data-elapsed={Math.round(state.elapsed)} data-extend={ext || undefined}>
    {Array.from({ length: tiles }, (_, i) => {
      const x = -ext + i * WALL_SLICE.width;
      const mirrored = i % 2 === 1;
      return <g key={i} transform={mirrored ? `translate(${x + WALL_SLICE.width} 0) scale(-1 1)` : `translate(${x} 0)`} data-layer="wall-extension">
        <svg width={WALL_SLICE.width} height={900} viewBox={`${WALL_SLICE.x} 0 ${WALL_SLICE.width} 900`} overflow="hidden">
          <image href={asset("environment")} width={1600} height={900} />
        </svg>
      </g>;
    })}
    <Prop name="environment" x={0} y={0} width={1600} height={900} />
    <NeighborhoodDetails />
    <Fixture name="oven" {...target("oven")} />
    <OvenFire elapsed={state.elapsed} baking={baking} reducedMotion={reducedMotion} />
    <LooseProps names={visible} layer="back" isLit={isLit} pick={pick} pickLabel={pickLabel} />
    <g data-layer="plants">
      <Fixture name="olive" />
      <Fixture name="aloe" />
    </g>
    <motion.g transform={`translate(${bakerX} ${scene.baker.y})`} data-actor="hassan">
      <ellipse cy={-2} rx={34} ry={7} fill="#382820" opacity=".18" />
      {scene.actors.hassan && <Sprite actor={scene.actors.hassan} frame={bakerFrame} size={scene.bakerSize} flip={ovenFacing} />}
    </motion.g>
    {baking && state.phase !== "baking" && <motion.g transform={`translate(${peelX} ${peelY}) rotate(${reducedMotion ? 0 : peelAngle})`}>
      <Prop name="peel" x={-20} y={-6} width={peelLength} height={22} />
    </motion.g>}
    <Fixture name="counter" {...target("counter")} />
    <Fixture name="worktop" {...target("worktop")} />
    <Fixture name="tray" {...target("tray")} />
    {(state.phase === "baking" || state.phase === "stocking") && !reducedMotion && <g transform={`translate(${state.phase === "baking" ? oven.x : scene.tray.x} ${state.phase === "baking" ? oven.y - 40 : scene.tray.y - 25})`} fill="none" stroke="#FFF3DA" strokeWidth={3} strokeLinecap="round" opacity={.25 + Math.sin(p * Math.PI) * .3} aria-hidden="true">
      <path d="M-14 0 C-28 -10 -5 -17 -15 -28" /><path d="M4 -3 C-8 -16 18 -20 7 -34" />
    </g>}
    {typeof preview === "number" && state.phase === "idle"
      ? Array.from({ length: Math.max(0, Math.min(8, Math.round(preview))) }, (_, n) => (
        <Prop key={`preview-${n}`} name="loaf" lit={isLit("loaf")} x={trayX + (n % 4) * loafW} y={trayY - Math.floor(n / 4) * 9} width={loafW} height={loafH} />
      ))
      : state.loaves.filter((loaf) => ["dough", "oven", "peel", "tray"].includes(loaf.owner)).map((loaf) => {
      const n = loaf.id % 8;
      const stock = loaf.owner === "tray";
      const inOven = loaf.owner === "oven";
      const placing = state.phase === "stocking";
      const restX = trayX + (n % 4) * loafW;
      const restY = trayY - Math.floor(n / 4) * 9;
      const x = stock ? restX : placing ? mix(peelX - 16 + (n % 4) * 14, restX, p) : inOven ? oven.x - 24 + (n % 4) * 14 : peelX - 16 + (n % 4) * 14;
      const y = stock ? restY : placing ? mix(peelY - 8 - Math.floor(n / 4) * 7, restY, p) : (inOven ? oven.y - 10 : peelY - 8) - Math.floor(n / 4) * 7;
      const sprite = loaf.owner === "dough" || (inOven && raw < .6) ? "dough" : "loaf";
      return <Prop key={loaf.id} loaf={loaf} lit={isLit(sprite)} name={sprite} x={x} y={y} width={stock ? loafW : mix(20, loafW, placing ? p : 0)} height={stock ? loafH : mix(9, loafH, placing ? p : 0)} />;
    })}
    <LooseProps names={visible} layer="front" isLit={isLit} pick={pick} pickLabel={pickLabel} />
    {counted && <FlourSacks count={sacks!} {...target("flour-sacks")} />}
    {sign && <ShopSign open={sign.open} label={sign.label} {...target("sign")} />}
    {state.active && onStage(state.active) && state.phase === "paying" && (() => {
      // The note leaves her hand, arcs over the counter and lands in the till. The till is
      // a placed prop, so this follows it if the shop is ever rearranged again.
      const hand = handAt(scene.actors[state.active], 0, scene.queue.actorSize);
      const from = { x: scene.queue.first.x + hand.x, y: scene.queue.first.y + hand.y };
      const till = worldProps.till;
      const to = { x: till.x + till.width / 2 - 16, y: till.y + 6 };
      const lift = Math.sin(Math.min(1, p) * Math.PI) * 42;
      return <g data-layer="payment">
        <Prop name="banknotes" href={cutFrame("banknotes")} x={reducedMotion ? to.x : mix(from.x, to.x, p)} y={(reducedMotion ? to.y : mix(from.y, to.y, p)) - lift} width={42} height={26} />
      </g>;
    })()}
    {state.queue.map((id, index) => {
      const actor = scene.actors[id];
      if (!actor || !onStage(id)) return null;
      const pos = customerPosition(id);
      const leaving = state.active === id && state.phase === "exiting";
      const receiving = state.active === id && state.phase === "handover";
      const arriving = index === 0 && state.phase === "arriving";
      // Bread already handed over: she keeps holding it while she thanks him and leaves.
      const carrying = state.loaves.some((loaf) => loaf.owner === `customer:${id}`);
      const frame = leaving || arriving || state.phase === "advancing" ? walking : receiving ? 5 : 0;
      const hand = handAt(actor, frame, scene.queue.actorSize);
      return <motion.g key={id} transform={`translate(${pos.x} ${pos.y})`} data-actor={id}>
        <ellipse cy={-2} rx={33} ry={7} fill="#382820" opacity=".2" />
        {index === 0 && !leaving && !arriving && <ellipse cy={0} rx={40} ry={9} fill="none" stroke="#DB5B31" strokeWidth={3} />}
        <Sprite actor={actor} frame={frame} size={scene.queue.actorSize} />
        {(receiving || leaving || carrying) && <>
          <Prop name="bag" x={hand.x - 20} y={hand.y - 4} width={46} height={52} />
          {state.loaves.filter((loaf) => loaf.owner === `customer:${id}`).map((loaf, i) => <Prop key={loaf.id} loaf={loaf} name="loaf" x={hand.x - 15 + i * 14} y={hand.y - 5} width={24} height={11} />)}
        </>}
      </motion.g>;
    })}
    {state.active && onStage(state.active) && state.phase === "handover" && state.loaves.filter((loaf) => loaf.owner === `handover:${state.active}`).map((loaf, i) => {
      const recipient = handAt(scene.actors[state.active!], 5, scene.queue.actorSize);
      const bakerHand = handAt(scene.actors.hassan, 14, scene.bakerSize);
      const destination = { x: scene.queue.first.x + recipient.x - 15 + i * 14, y: scene.queue.first.y + recipient.y - 5 };
      const hand = { x: bakerX + bakerHand.x - 20 + i * 14, y: scene.baker.y + bakerHand.y - 10 };
      const lift = Math.min(1, p * 2);
      const give = Math.max(0, Math.min(1, (p - .5) * 4));
      const x = p < .5 ? mix(scene.tray.x - 10 + i * 14, hand.x, lift) : mix(hand.x, destination.x, give);
      const y = p < .5 ? mix(scene.tray.y - 16, hand.y, lift) : mix(hand.y, destination.y, give);
      return <Prop key={loaf.id} loaf={loaf} name="loaf" x={reducedMotion ? destination.x : x} y={reducedMotion ? destination.y : y} width={28} height={13} />;
    })}
    {crowd.length > 0 && scene.actors.salma && <motion.g transform={`translate(${scene.salma.x} ${scene.salma.y})`} data-actor="salma">
      <ellipse cy={-2} rx={33} ry={7} fill="#382820" opacity=".2" />
      <Sprite actor={scene.actors.salma} frame={state.phase === "advancing" ? 1 : 0} size={scene.salmaSize} />
    </motion.g>}
  </svg>;
}

/**
 * The loose props a caller asked for, in one of the two depth layers.
 *
 * Unknown names are dropped rather than thrown on. A stop naming a prop that was renamed
 * should lose that prop, not the whole bakery — the same reasoning the mission scene uses
 * for an animation it does not recognise.
 */
function LooseProps({ names, layer, isLit, pick, pickLabel }: { names?: readonly string[]; layer: "back" | "front"; isLit: (name: string) => boolean; pick: (name: string) => (() => void) | undefined; pickLabel?: (name: string) => string;
  /** The hanging shop sign. Omit it and no sign is drawn at all. */
  sign?: { open: boolean; label: string };
  /**
   * Draw this many single sacks instead of the painted pile.
   *
   * `flour-sack.webp` is one sack and `flour-sacks.webp` is a heap of six, so a count the
   * student's code can change has to be built from the single. The pile is the scenery
   * version; this is the countable one, and they stand in the same place.
   */
  sacks?: number;
  /**
   * Loaves to show on the tray while the bakery is at rest, ignoring what it baked.
   *
   * This is the live binding: the number in the editor is the number on the tray, before
   * Run and before any Python has executed. Only honoured at rest, so it can never fight
   * an animation that is mid-flight.
   */
  preview?: number | null; }) {
  if (!names?.length) return null;
  return <g data-layer={`loose-${layer}`}>
    {names.filter((name) => isWorldProp(name) && backProps.has(name) === (layer === "back")).map((name) => {
      const at = worldProps[name as WorldPropName];
      return <Prop key={name} name={name} href={propSrc(name as WorldPropName)} x={at.x} y={at.y} width={at.width} height={at.height} lit={isLit(name)} onPick={pick(name)} pickLabel={pickLabel?.(name)} />;
    })}
  </g>;
}

/**
 * A row of single sacks, drawn where the painted pile stands.
 *
 * Capped at four, and sized so four of them fit inside the pile's own 104-wide rectangle —
 * any wider and the row runs into the bread crate beside it, which is the kind of overlap
 * the prop table is tested against. A larger count belongs in a panel above the scene, for
 * the same reason the tray only ever shows eight loaves.
 */
const SACK = { width: 24, height: 30, gap: 26, max: 4 };

function FlourSacks({ count, lit, onPick, pickLabel }: { count: number; lit?: boolean; onPick?: () => void; pickLabel?: string }) {
  const at = worldProps["flour-sacks"];
  const shown = Math.max(0, Math.min(SACK.max, Math.round(count)));
  return <g data-layer="flour-count" data-sacks={shown}>
    {Array.from({ length: shown }, (_, i) => (
      <Prop
        key={i}
        name="flour-sack"
        x={at.x + i * SACK.gap}
        y={at.y + at.height - SACK.height}
        width={SACK.width}
        height={SACK.height}
        lit={lit && i === 0}
        onPick={i === 0 ? onPick : undefined}
        pickLabel={pickLabel}
      />
    ))}
  </g>;
}

/**
 * The open/closed sign, hung inside the arch where nothing else is drawn.
 *
 * Vector rather than artwork, for the same reason the shop name is: the lettering has to
 * change — that is the whole point of it — and a raster sign would need two files and a
 * translation of each.
 */
const SIGN = { x: 1150, y: 236, width: 104, height: 58 };

function ShopSign({ open, label, lit, onPick, pickLabel }: { open: boolean; label: string; lit?: boolean; onPick?: () => void; pickLabel?: string }) {
  const cx = SIGN.x + SIGN.width / 2;
  return <g
    data-prop="sign"
    data-open={open}
    className={onPick ? "bakery-pick" : undefined}
    role={onPick ? "button" : undefined}
    tabIndex={onPick ? 0 : undefined}
    aria-label={onPick ? pickLabel : undefined}
    onClick={onPick}
    onKeyDown={onPick ? (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPick(); }
    } : undefined}
  >
    <path d={`M${cx} ${SIGN.y - 26} V${SIGN.y}`} stroke="#4A3726" strokeWidth={3} />
    {lit && <rect x={SIGN.x - 6} y={SIGN.y - 6} width={SIGN.width + 12} height={SIGN.height + 12} rx={9} fill="#E9992F" opacity={.2} stroke="#E9992F" strokeWidth={3} />}
    <rect x={SIGN.x} y={SIGN.y} width={SIGN.width} height={SIGN.height} rx={7} fill={open ? "#2F7D6E" : "#7C6A58"} stroke="#3A2C1E" strokeWidth={3} />
    <text
      x={cx}
      y={SIGN.y + SIGN.height / 2 + 11}
      textAnchor="middle"
      lang="ar"
      direction="rtl"
      fontSize={30}
      fontWeight={700}
      fill="#FFF3DA"
      style={{ fontFamily: "var(--font-arabic), Tahoma, sans-serif" }}
    >{label}</text>
  </g>;
}
