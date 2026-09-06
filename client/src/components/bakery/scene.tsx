"use client";
import { motion } from "motion/react";
import { asset, bakeryScene as scene, type ActorAsset } from "@/lib/bakery/scene-manifest";
import { phaseProgress, type BakeryState, type CustomerId, type Loaf } from "@/lib/bakery/simulation";

const mix = (a: number, b: number, p: number) => a + (b - a) * p;
function Sprite({ actor, frame, size = 310, flip = false }: { actor: ActorAsset; frame: number; size?: number; flip?: boolean }) {
  return <g transform={flip ? "scale(-1 1)" : undefined}>
    <svg x={-size / 2} y={-size * 360 / 384} width={size} height={size} viewBox={`${frame % actor.columns * 384} ${Math.floor(frame / actor.columns) * 384} 384 384`} overflow="hidden">
      <image href={actor.src} width={actor.columns * 384} height={actor.rows * 384} />
    </svg>
  </g>;
}
function Prop({ name, x, y, width, height, opacity = 1, loaf }: { name: string; x: number; y: number; width: number; height: number; opacity?: number; loaf?: Loaf }) {
  return <image href={asset(name)} x={x} y={y} width={width} height={height} opacity={opacity} preserveAspectRatio="none" data-loaf-id={loaf?.id} data-owner={loaf?.owner} />;
}
export function BakeryScene({ state, reducedMotion, counterView, label }: { state: BakeryState; reducedMotion: boolean; counterView: boolean; label: string }) {
  const raw = phaseProgress(state);
  const p = reducedMotion ? 0 : raw;
  const step = reducedMotion ? 0 : Math.min(3, Math.floor(raw * 4));
  const walking = reducedMotion ? 0 : 1 + Math.floor(state.elapsed / 180) % 4;
  const baking = ["loading", "baking", "retrieving", "stocking"].includes(state.phase);
  const bakerX = state.phase === "loading" || state.phase === "baking" ? 411 : state.phase === "retrieving" ? mix(411, scene.baker.x, p) : scene.baker.x;
  const bakerFrame = state.phase === "loading" ? step : state.phase === "retrieving" ? 4 + step : state.phase === "stocking" ? 8 + step : state.phase === "handover" ? [10, 13, 14, 15][step] : 15;
  const peelX = state.phase === "loading" ? mix(333, 254, p) : state.phase === "retrieving" ? mix(254, 417, p) : mix(417, 520, p);
  const peelY = state.phase === "stocking" ? mix(546, 590, p) : 546;
  const ovenFacing = ["loading", "baking", "retrieving"].includes(state.phase);
  const grip = scene.actors.hassan.hands[bakerFrame];
  const gripX = bakerX + (ovenFacing ? -grip.x : grip.x);
  const gripY = scene.baker.y + grip.y;
  const peelAngle = Math.atan2(gripY - peelY, gripX - peelX) * 180 / Math.PI;
  const peelLength = Math.hypot(gripX - peelX, gripY - peelY) + 38;
  function customerPosition(id: CustomerId) {
    const index = state.queue.indexOf(id);
    if (state.active === id && state.phase === "exiting") return { x: mix(scene.queue.first.x, -150, p), y: scene.queue.first.y + Math.sin(Math.min(1, p * 4) * Math.PI / 2) * 65 };
    return { x: scene.queue.first.x + (index + (state.phase === "advancing" ? 1 - p : 0)) * scene.queue.spacing, y: scene.queue.first.y };
  }
  return <svg className="bakery-scene" viewBox={counterView ? "145 300 690 485" : "0 0 1600 900"} role="img" aria-label={label} data-phase={state.phase} data-elapsed={Math.round(state.elapsed)}>
    <Prop name="environment" x={0} y={0} width={1600} height={900} />
    <Prop name="awning" x={130} y={143} width={602} height={224} />
    <Prop name="oven" x={202} y={349} width={195} height={346} />
    <Prop name="glow" x={258} y={475} width={86} height={69} opacity={baking ? reducedMotion ? .75 : .75 + Math.sin(p * Math.PI * 2) * .1 : .18} />
    <motion.g transform={`translate(${bakerX} ${scene.baker.y})`} data-actor="hassan">
      <ellipse cy={-2} rx={42} ry={8} fill="#382820" opacity=".18" />
      {scene.actors.hassan && <Sprite actor={scene.actors.hassan} frame={bakerFrame} flip={state.phase === "loading" || state.phase === "baking" || state.phase === "retrieving"} />}
    </motion.g>
    {baking && state.phase !== "baking" && <motion.g transform={`translate(${peelX} ${peelY}) rotate(${reducedMotion ? 0 : peelAngle})`}>
      <Prop name="peel" x={-24} y={-7} width={peelLength} height={26} />
    </motion.g>}
    <Prop name="counter" x={437} y={606} width={218} height={112} />
    <Prop name="worktop" x={430} y={592} width={231} height={28} />
    <Prop name="tray" x={468} y={580} width={165} height={33} />
    {(state.phase === "baking" || state.phase === "stocking") && !reducedMotion && <g transform={`translate(${state.phase === "baking" ? 291 : 551} ${state.phase === "baking" ? 507 : 566})`} fill="none" stroke="#FFF3DA" strokeWidth={3} strokeLinecap="round" opacity={.25 + Math.sin(p * Math.PI) * .3} aria-hidden="true">
      <path d="M-14 0 C-28 -10 -5 -17 -15 -28" /><path d="M4 -3 C-8 -16 18 -20 7 -34" />
    </g>}
    {state.loaves.filter((loaf) => ["dough", "oven", "peel", "tray"].includes(loaf.owner)).map((loaf) => {
      const n = loaf.id % 8;
      const stock = loaf.owner === "tray";
      const inOven = loaf.owner === "oven";
      const placing = state.phase === "stocking";
      const trayX = 479 + (n % 4) * 34;
      const trayY = 578 - Math.floor(n / 4) * 11;
      const x = stock ? trayX : placing ? mix(398 + (n % 4) * 15, trayX, p) : inOven ? 267 + (n % 4) * 15 : peelX - 19 + (n % 4) * 15;
      const y = stock ? trayY : placing ? mix(538 - Math.floor(n / 4) * 8, trayY, p) : (inOven ? 536 : peelY - 8) - Math.floor(n / 4) * 8;
      return <Prop key={loaf.id} loaf={loaf} name={loaf.owner === "dough" || (inOven && raw < .6) ? "dough" : "loaf"} x={x} y={y} width={stock ? 34 : placing ? mix(24, 34, p) : 24} height={stock ? 15 : placing ? mix(11, 15, p) : 11} />;
    })}
    {state.queue.map((id, index) => {
      const actor = scene.actors[id];
      if (!actor) return null;
      const pos = customerPosition(id);
      const leaving = state.active === id && state.phase === "exiting";
      const receiving = state.active === id && state.phase === "handover";
      const frame = leaving || state.phase === "advancing" ? walking : receiving ? 5 : 0;
      const hand = actor.hands[frame];
      return <motion.g key={id} transform={`translate(${pos.x} ${pos.y})`} data-actor={id}>
        <ellipse cy={-2} rx={37} ry={8} fill="#382820" opacity=".2" />
        {index === 0 && !leaving && <ellipse cy={0} rx={44} ry={10} fill="none" stroke="#DB5B31" strokeWidth={3} />}
        <Sprite actor={actor} frame={frame} size={scene.queue.actorSize} />
        {(receiving || leaving) && <>
          <Prop name="bag" x={hand.x - 22} y={hand.y - 4} width={52} height={58} />
          {state.loaves.filter((loaf) => loaf.owner === `customer:${id}`).map((loaf, i) => <Prop key={loaf.id} loaf={loaf} name="loaf" x={hand.x - 17 + i * 16} y={hand.y - 5} width={27} height={13} />)}
        </>}
      </motion.g>;
    })}
    {state.active && state.phase === "handover" && state.loaves.filter((loaf) => loaf.owner === `handover:${state.active}`).map((loaf, i) => {
      const recipient = scene.actors[state.active!]?.receiveHand ?? { x: -73, y: -151 };
      const bakerHand = scene.actors.hassan.receiveHand;
      const destination = { x: scene.queue.first.x + recipient.x - 17 + i * 16, y: scene.queue.first.y + recipient.y - 5 };
      const hand = { x: bakerX + bakerHand.x - 24 + i * 16, y: scene.baker.y + bakerHand.y - 12 };
      const lift = Math.min(1, p * 2);
      const give = Math.max(0, Math.min(1, (p - .5) * 4));
      const x = p < .5 ? mix(543 + i * 16, hand.x, lift) : mix(hand.x, destination.x, give);
      const y = p < .5 ? mix(574, hand.y, lift) : mix(hand.y, destination.y, give);
      return <Prop key={loaf.id} loaf={loaf} name="loaf" x={reducedMotion ? destination.x : x} y={reducedMotion ? destination.y : y} width={32} height={15} />;
    })}
    <Prop name="olive" x={6} y={432} width={104} height={290} />
    {scene.actors.salma && <motion.g transform="translate(158 825)" data-actor="salma">
      <ellipse cy={-2} rx={37} ry={8} fill="#382820" opacity=".2" />
      <Sprite actor={scene.actors.salma} frame={state.phase === "advancing" ? 1 : 0} size={288} />
    </motion.g>}
    <Prop name="aloe" x={1483} y={640} width={100} height={127} />
  </svg>;
}
