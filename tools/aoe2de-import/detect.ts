// Per-file format detection by magic bytes (never by extension alone).

import { parseSLD, sldToFrame, SLD_MAGIC } from "./sld.ts";
import { parseSMX, smxToFrame, SMX_MAGIC, type SmxPalettes } from "./smx.ts";
import type { Frame } from "./frame.ts";

export type SpriteFormat = "smx" | "sld" | "slp" | "smp" | "dds" | "unknown";

export function detectFormat(buf: Uint8Array): SpriteFormat {
  if (buf.length < 4) return "unknown";
  const m = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (m === SMX_MAGIC) return "smx";
  if (m === SLD_MAGIC) return "sld";
  if (m === "SMP$") return "smp";
  if (m === "DDS ") return "dds";
  // Classic SLP: 4-byte ASCII version such as "2.0N" or "4.0X".
  if (/^\d\.\d[A-Z]$/.test(m)) return "slp";
  return "unknown";
}

/** Decode any supported sprite file to neutral frames (frames without a main layer become null). */
export function decodeSprite(buf: Uint8Array, pals: SmxPalettes): { format: SpriteFormat; frames: (Frame | null)[] } {
  const format = detectFormat(buf);
  if (format === "smx") return { format, frames: parseSMX(buf).frames.map((f) => smxToFrame(f, pals)) };
  if (format === "sld") return { format, frames: parseSLD(buf).frames.map((f) => sldToFrame(f)) };
  throw new Error(`unsupported sprite format: ${format}`);
}
