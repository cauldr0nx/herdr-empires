// Block-compression decoders (S3TC): BC1 (DXT1), BC3 (DXT5) and BC4.
// Written from the public S3TC description and openage's SLD format notes
// (https://github.com/SFTtech/openage/blob/master/doc/media/sld-files.md).
// Each function decodes one 4x4 block into a caller-owned buffer, pixels in
// row-major order (left to right, top to bottom).

/** Expand a 5- or 6-bit channel to 8 bits by bit replication. */
const x5 = (v: number) => (v << 3) | (v >> 2);
const x6 = (v: number) => (v << 2) | (v >> 4);

/** Unpack an R5G6B5 colour into [r, g, b]. */
export function rgb565(c: number): [number, number, number] {
  return [x5((c >> 11) & 0x1f), x6((c >> 5) & 0x3f), x5(c & 0x1f)];
}

/**
 * Decode a BC1 block (8 bytes at `off`) into `out` (16 * 4 bytes RGBA).
 * `forceFourColor` is used by BC3, whose colour block never has the
 * transparent mode.
 */
export function decodeBC1Block(src: Uint8Array, off: number, out: Uint8Array, forceFourColor = false): void {
  const c0 = src[off] | (src[off + 1] << 8);
  const c1 = src[off + 2] | (src[off + 3] << 8);
  const a = rgb565(c0);
  const b = rgb565(c1);
  const lut = new Uint8Array(16);
  lut.set([a[0], a[1], a[2], 255], 0);
  lut.set([b[0], b[1], b[2], 255], 4);
  if (c0 > c1 || forceFourColor) {
    for (let i = 0; i < 3; i++) {
      lut[8 + i] = Math.round((2 * a[i] + b[i]) / 3);
      lut[12 + i] = Math.round((a[i] + 2 * b[i]) / 3);
    }
    lut[11] = 255;
    lut[15] = 255;
  } else {
    for (let i = 0; i < 3; i++) lut[8 + i] = Math.round((a[i] + b[i]) / 2);
    lut[11] = 255;
    // index 3: fully transparent black (already zero)
  }
  let bits = (src[off + 4] | (src[off + 5] << 8) | (src[off + 6] << 16) | (src[off + 7] << 24)) >>> 0;
  for (let p = 0; p < 16; p++) {
    const idx = bits & 3;
    bits >>>= 2;
    out[p * 4] = lut[idx * 4];
    out[p * 4 + 1] = lut[idx * 4 + 1];
    out[p * 4 + 2] = lut[idx * 4 + 2];
    out[p * 4 + 3] = lut[idx * 4 + 3];
  }
}

/** Decode a BC4 block (8 bytes at `off`) into `out` (16 single-channel values). */
// Interpolated values truncate, matching the worked example in the format notes.
export function decodeBC4Block(src: Uint8Array, off: number, out: Uint8Array): void {
  const r0 = src[off];
  const r1 = src[off + 1];
  const lut = [r0, r1, 0, 0, 0, 0, 0, 0];
  if (r0 > r1) {
    for (let i = 1; i <= 6; i++) lut[i + 1] = Math.floor(((7 - i) * r0 + i * r1) / 7);
  } else {
    for (let i = 1; i <= 4; i++) lut[i + 1] = Math.floor(((5 - i) * r0 + i * r1) / 5);
    lut[6] = 0;
    lut[7] = 255;
  }
  // Two 24-bit little-endian groups of eight 3-bit indices each.
  for (let half = 0; half < 2; half++) {
    const o = off + 2 + half * 3;
    let bits = src[o] | (src[o + 1] << 8) | (src[o + 2] << 16);
    for (let p = 0; p < 8; p++) {
      out[half * 8 + p] = lut[bits & 7];
      bits >>>= 3;
    }
  }
}

/** Decode a BC3 block (16 bytes: BC4-style alpha, then BC1 colour) into RGBA. */
export function decodeBC3Block(src: Uint8Array, off: number, out: Uint8Array): void {
  const alpha = new Uint8Array(16);
  decodeBC4Block(src, off, alpha);
  decodeBC1Block(src, off + 8, out, true);
  for (let p = 0; p < 16; p++) out[p * 4 + 3] = alpha[p];
}

/** Decode a whole BC1/BC3 image (blocks row-major) into RGBA. */
export function decodeBCImage(src: Uint8Array, off: number, width: number, height: number, kind: "bc1" | "bc3"): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const bw = Math.ceil(width / 4);
  const bh = Math.ceil(height / 4);
  const bsize = kind === "bc1" ? 8 : 16;
  const block = new Uint8Array(64);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = off + (by * bw + bx) * bsize;
      if (o + bsize > src.length) return out;
      if (kind === "bc1") decodeBC1Block(src, o, block);
      else decodeBC3Block(src, o, block);
      for (let py = 0; py < 4; py++) {
        const y = by * 4 + py;
        if (y >= height) break;
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px;
          if (x >= width) break;
          out.set(block.subarray((py * 4 + px) * 4, (py * 4 + px) * 4 + 4), (y * width + x) * 4);
        }
      }
    }
  }
  return out;
}
