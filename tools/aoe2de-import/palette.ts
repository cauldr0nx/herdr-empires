// JASC-PAL palettes and the palette-number table used by SMX frames.
// Format reference: openage doc/media/smp-files.md ("Palette Info").

export type Palette = Uint8Array; // RGBA, 4 bytes per entry

/** Parse a JASC-PAL text palette ("JASC-PAL", version, count, "r g b [a]" lines). */
export function parseJascPal(text: string): Palette {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines[0] !== "JASC-PAL") throw new Error("not a JASC-PAL palette");
  const count = parseInt(lines[2], 10);
  if (!Number.isFinite(count) || count <= 0) throw new Error("bad palette entry count");
  const out = new Uint8Array(count * 4);
  let n = 0;
  for (let i = 3; i < lines.length && n < count; i++) {
    if (lines[i].startsWith("#")) continue; // DE palettes may carry a "#..." extension line
    const parts = lines[i].split(/\s+/).map((v) => parseInt(v, 10));
    if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) continue;
    out[n * 4] = parts[0];
    out[n * 4 + 1] = parts[1];
    out[n * 4 + 2] = parts[2];
    out[n * 4 + 3] = parts.length > 3 ? parts[3] : 255;
    n++;
  }
  return out;
}

/**
 * Parse `palettes.conf`: lines mapping a palette number to a file name,
 * written as "21,b_west.pal" (comments start with "//" or "#"). Lines in any
 * other shape are ignored rather than fatal, because the exact file layout
 * has not been verified against a real install.
 */
export function parsePaletteConf(text: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").replace(/#.*$/, "").trim();
    const m = /^(\d+)\s*[,=\s]\s*"?([^",\s]+\.pal)"?/i.exec(line);
    if (m) map.set(parseInt(m[1], 10), m[2]);
  }
  return map;
}
