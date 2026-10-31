// art/sounds.ts: every Herdr Empires sound, synthesized with FFmpeg's aevalsrc
// (SPEC §13 tier A, Apache-2.0): mp3, 96 kbps, mono, < 100 KB each, no voice
// lines. Deterministic (no random() except for noise beds, which ffmpeg seeds
// identically per run? No: `random()` is not seeded, so noise-based sounds
// are kept to pure tones + filters to stay byte-stable).
//
//   bun art/sounds.ts [repo root]

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? ".");
const dir = `${root}/mods/empires/sounds`;
mkdirSync(dir, { recursive: true });
const pi = "2*PI";
const tone = (f: number, delay = 0, decay = 2, amp = 1) => `${amp}*sin(${pi}*${f}*(t-${delay}))*exp(-${decay}*(t-${delay}))*gte(t,${delay})`;
const brass = (f: number, delay = 0, decay = 1.2, amp = 1) => `(${tone(f, delay, decay, amp)}+${tone(f * 2, delay, decay * 1.3, amp * 0.5)}+${tone(f * 3, delay, decay * 1.6, amp * 0.25)})`;
const chord = (fs: number[], delay = 0, decay = 2) => fs.map((f) => tone(f, delay, decay)).join("+");
const bellTone = (f: number, delay = 0) => `(${tone(f, delay, 1.6)}+${tone(f * 2.76, delay, 3, 0.4)}+${tone(f * 5.4, delay, 5, 0.2)})`;

// name, seconds, expression, filter
const jobs: [string, number, string, string][] = [
  // Boot horn fanfare (3-4 s): three rising brass calls.
  ["horn", 3.6, `(${brass(196, 0, 1.4)}+${brass(261.63, 0.6, 1.4)}+${brass(392, 1.2, 0.9)}+${brass(523.25, 1.9, 0.8)})/9`, "afade=t=in:d=0.05,afade=t=out:st=2.8:d=0.8,aecho=0.6:0.3:160|300:0.25|0.12"],
  // Blocked = town bell ×3.
  ["bell", 2.4, `(${bellTone(880, 0)}+${bellTone(880, 0.7)}+${bellTone(880, 1.4)})/7`, "afade=t=in:d=0.005,afade=t=out:st=1.9:d=0.5,aecho=0.5:0.3:200:0.2"],
  // Done = brass two-note.
  ["done", 1.4, `(${brass(392, 0, 2.2)}+${brass(523.25, 0.35, 1.6)})/5`, "afade=t=in:d=0.01,afade=t=out:st=1.0:d=0.4"],
  // Age-up fanfare.
  ["ageup", 3.0, `(${brass(261.63, 0, 2)}+${brass(329.63, 0.25, 2)}+${brass(392, 0.5, 2)}+${brass(523.25, 0.9, 1)}+${chord([261.63, 329.63, 392, 523.25], 1.5, 1.2)})/11`, "afade=t=in:d=0.02,afade=t=out:st=2.2:d=0.8,aecho=0.6:0.3:180|360:0.2|0.1"],
  // Stone click (button): a short dull tap.
  ["click", 0.08, `0.08*sin(${pi}*700*t)*exp(-90*t)+0.04*sin(${pi}*2400*t)*exp(-140*t)`, "afade=t=in:d=0.002,afade=t=out:st=0.04:d=0.04"],
  // Wooden knock (menu).
  ["knock", 0.12, `0.1*sin(${pi}*(320*t-900*t*t))*exp(-55*t)`, "afade=t=in:d=0.002,afade=t=out:st=0.06:d=0.06"],
  // Low horn (error).
  ["error", 0.9, `(${brass(110, 0, 3)}+${brass(103.8, 0.1, 3)})/5`, "afade=t=in:d=0.02,afade=t=out:st=0.6:d=0.3"],
  // Short non-vocal select chirp.
  ["select", 0.18, `0.09*sin(${pi}*(880*t+600*t*t))*exp(-18*t)`, "afade=t=in:d=0.004,afade=t=out:st=0.1:d=0.08"],
  // Train: a brisk two-note on a drum.
  ["train", 0.6, `(${tone(80, 0, 14, 0.5)}+${brass(523.25, 0.08, 5, 0.6)}+${brass(659.25, 0.25, 4, 0.6)})/4`, "afade=t=in:d=0.005,afade=t=out:st=0.4:d=0.2"],
  // Victory sting.
  ["victory", 2.6, `(${brass(392, 0, 2)}+${brass(523.25, 0.2, 2)}+${brass(659.25, 0.4, 2)}+${brass(783.99, 0.7, 1.2)}+${chord([392, 523.25, 659.25, 783.99], 1.2, 1.1)})/11`, "afade=t=in:d=0.02,afade=t=out:st=1.9:d=0.7,aecho=0.6:0.3:180:0.2"],
  // Resign sting: a falling minor phrase.
  ["resign", 1.8, `(${brass(329.63, 0, 2.2)}+${brass(293.66, 0.35, 2.2)}+${brass(246.94, 0.7, 1.6)}+${brass(220, 1.05, 1.2)})/7`, "afade=t=in:d=0.02,afade=t=out:st=1.3:d=0.5"],
];

const manifest: Record<string, string> = {};
for (const [name, dur, expr, filter] of jobs) {
  const file = `${dir}/${name}.mp3`;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=${dur}`, "-af", `${filter},alimiter=limit=0.8:level=false`, "-t", String(dur), "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "96k", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", file], { stdio: "inherit" });
  if (r.status) process.exit(r.status ?? 1);
  manifest[`sounds/${name}.mp3`] = "art/sounds.ts";
  console.log(`synthesized ${name} (${dur}s)`);
}
writeFileSync(`${root}/art/manifest-sounds.json`, JSON.stringify(manifest, null, 2) + "\n");
