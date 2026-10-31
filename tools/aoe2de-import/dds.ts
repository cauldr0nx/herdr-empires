// DDS texture reader (top mip level only): BC1/DXT1, BC3/DXT5 and
// uncompressed 32-bit RGBA/BGRA, including the DX10 extended header.
// Anything else (BC7 and friends) is handed to ImageMagick (`magick`) when it
// is installed, which reads DDS natively.

import { spawnSync } from "node:child_process";
import { decodeBCImage } from "./bc.ts";

export interface Image {
  width: number;
  height: number;
  rgba: Uint8Array;
}

const fourcc = (buf: Uint8Array, o: number) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);

/** Decode a DDS buffer natively; returns null when the pixel format is unsupported. */
export function decodeDDS(buf: Uint8Array): Image | null {
  if (fourcc(buf, 0) !== "DDS ") throw new Error("not a DDS file");
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const height = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const pfFlags = dv.getUint32(80, true);
  const cc = fourcc(buf, 84);
  let dataAt = 128;
  if (pfFlags & 0x4) {
    if (cc === "DXT1") return { width, height, rgba: decodeBCImage(buf, dataAt, width, height, "bc1") };
    if (cc === "DXT5" || cc === "DXT4") return { width, height, rgba: decodeBCImage(buf, dataAt, width, height, "bc3") };
    if (cc === "DX10") {
      const dxgi = dv.getUint32(128, true);
      dataAt = 148;
      if (dxgi === 71 || dxgi === 72) return { width, height, rgba: decodeBCImage(buf, dataAt, width, height, "bc1") };
      if (dxgi === 77 || dxgi === 78) return { width, height, rgba: decodeBCImage(buf, dataAt, width, height, "bc3") };
      if (dxgi === 28 || dxgi === 29) return { width, height, rgba: buf.slice(dataAt, dataAt + width * height * 4) };
      if (dxgi === 87 || dxgi === 91) return { width, height, rgba: swapRB(buf.slice(dataAt, dataAt + width * height * 4)) };
    }
    return null;
  }
  // Uncompressed RGB(A) with channel masks.
  const bits = dv.getUint32(88, true);
  if (bits !== 32) return null;
  const masks = [dv.getUint32(92, true), dv.getUint32(96, true), dv.getUint32(100, true), dv.getUint32(104, true)];
  const shift = (m: number) => (m === 0 ? -1 : Math.log2(m & -m));
  const sh = masks.map(shift);
  const hasAlpha = (pfFlags & 0x1) !== 0 && masks[3] !== 0;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = dv.getUint32(dataAt + i * 4, true);
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = sh[c] < 0 ? 0 : (v >>> sh[c]) & 0xff;
    rgba[i * 4 + 3] = hasAlpha ? (v >>> sh[3]) & 0xff : 255;
  }
  return { width, height, rgba };
}

function swapRB(px: Uint8Array): Uint8Array {
  for (let i = 0; i < px.length; i += 4) { const t = px[i]; px[i] = px[i + 2]; px[i + 2] = t; }
  return px;
}

/** Decode a DDS file through ImageMagick, or null if `magick` is unavailable or fails. */
export function decodeWithMagick(path: string): Image | null {
  const id = spawnSync("magick", ["identify", "-format", "%w %h\n", path], { encoding: "utf8" });
  if (id.status !== 0 || !id.stdout) return null;
  const [w, h] = id.stdout.split("\n")[0].trim().split(/\s+/).map((v) => parseInt(v, 10));
  if (!w || !h) return null;
  const px = spawnSync("magick", [`${path}[0]`, "-depth", "8", "rgba:-"], { maxBuffer: w * h * 4 + 1024 });
  if (px.status !== 0 || !px.stdout || px.stdout.length < w * h * 4) return null;
  return { width: w, height: h, rgba: new Uint8Array(px.stdout.buffer, px.stdout.byteOffset, w * h * 4) };
}
