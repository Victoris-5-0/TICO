// Mechanical raster preparation only. Creative masters are generated with imagegen.
// Run from client/: node scripts/prepare-bakery-assets.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const source = "assets/source/bakery-v2";
const output = "public/assets/bakery-v2";
const frames = join(source, "frames");
mkdirSync(output, { recursive: true });
mkdirSync(frames, { recursive: true });
const magick = (...args) => execFileSync("magick", args, { encoding: "utf8" });
const key = ["-alpha", "set", "-channel", "A", "-fx", "(r>g*1.2 && b>g*1.2 && r>0.15 && b>0.15) ? 0 : 1", "+channel"];

if (existsSync(join(source, "environment.png"))) {
  magick(join(source, "environment.png"), "-resize", "1600x900!", "-quality", "86", join(output, "environment.webp"));
}

// Explicit crops prevent the wide awning/worktop crossing a nominal atlas cell.
const fixtures = {
  oven: "390x500+50+0", counter: "465x280+485+205",
  awning: "556x260+975+170", worktop: "530x140+0+730",
  olive: "340x470+550+490", aloe: "360x380+1050+600",
};
if (existsSync(join(source, "fixtures.png"))) {
  for (const [name, crop] of Object.entries(fixtures)) {
    magick(join(source, "fixtures.png"), "-crop", crop, "+repage", ...key, "-trim", "+repage", "-bordercolor", "none", "-border", "2", "-quality", "90", join(output, `${name}.webp`));
  }
}

const actors = ["hassan", "mariam", "nour", "amina", "omar", "dina", "youssef", "hoda", "farid", "salma"];
const props = {
  loaf: "490x240+10+180", dough: "450x240+535+180", tray: "500x180+1020+230",
  peel: "610x180+20+630", bag: "340x350+640+520", glow: "300x300+1100+565",
};
if (existsSync(join(source, "props.png"))) {
  for (const [name, crop] of Object.entries(props)) {
    magick(join(source, "props.png"), "-crop", crop, "+repage", ...key, "-trim", "+repage", "-bordercolor", "none", "-border", "2", "-quality", "90", join(output, `${name}.webp`));
  }
}
for (const actor of actors) {
  const input = join(source, `${actor}.png`);
  if (!existsSync(input)) continue;
  const [width, height] = magick("identify", "-format", "%w %h", input).split(" ").map(Number);
  const columns = actor === "hassan" ? 4 : actor === "salma" ? 2 : 3;
  const rows = actor === "hassan" ? 4 : actor === "salma" ? 1 : 2;
  for (let i = 0; i < columns * rows; i++) {
    const x = Math.round((i % columns) * width / columns);
    const y = Math.round(Math.floor(i / columns) * height / rows);
    const cw = Math.round(((i % columns) + 1) * width / columns) - x;
    const ch = Math.round((Math.floor(i / columns) + 1) * height / rows) - y;
    // Keep an equal-size frame. Foot center normalization avoids arm-reach jitter.
    const cropped = magick(input, "-crop", `${cw}x${ch}+${x}+${y}`, "+repage", ...key, "-trim", "+repage", "-resize", "x336", "-format", "%w %h", "info:").split(" ").map(Number);
    const [rw, rh] = cropped;
    const feet = magick(input, "-crop", `${cw}x${ch}+${x}+${y}`, "+repage", ...key, "-trim", "+repage", "-resize", "x336", "-crop", `${rw}x30+0+${rh-30}`, "+repage", "-format", "%@", "info:");
    const match = feet.match(/(\d+)x\d+\+(\d+)\+/);
    const pivot = match ? Number(match[2]) + Number(match[1]) / 2 : rw / 2;
    magick("-size", "384x384", "xc:none", "(", input, "-crop", `${cw}x${ch}+${x}+${y}`, "+repage", ...key, "-trim", "+repage", "-resize", "x336", ")", "-geometry", `+${Math.round(192-pivot)}+24`, "-compose", "over", "-composite", "-quality", "88", join(frames, `${actor}-${i}.webp`));
  }
  magick("montage", ...Array.from({ length: columns * rows }, (_, i) => join(frames, `${actor}-${i}.webp`)), "-tile", `${columns}x${rows}`, "-geometry", "+0+0", "-background", "none", "-quality", "88", join(output, `${actor}.webp`));
}
