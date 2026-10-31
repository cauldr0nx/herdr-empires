// Builders for tiny SYNTHETIC sprite/texture files, constructed byte by byte
// from the documented formats. No game data is used or stored anywhere.

export class Bytes {
  private a: number[] = [];
  u8(...v: number[]) { for (const x of v) this.a.push(x & 0xff); return this; }
  u16(...v: number[]) { for (const x of v) this.a.push(x & 0xff, (x >> 8) & 0xff); return this; }
  u32(...v: number[]) { for (const x of v) this.a.push(x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff); return this; }
  str(s: string) { for (const c of s) this.a.push(c.charCodeAt(0)); return this; }
  bytes(b: ArrayLike<number>) { for (let i = 0; i < b.length; i++) this.a.push(b[i] & 0xff); return this; }
  zeros(n: number) { for (let i = 0; i < n; i++) this.a.push(0); return this; }
  pad4() { while (this.a.length % 4) this.a.push(0); return this; }
  get length() { return this.a.length; }
  build() { return new Uint8Array(this.a); }
}

// SMX command bytes
export const skip = (n: number) => ((n - 1) << 2) | 0;
export const draw = (n: number) => ((n - 1) << 2) | 1;
export const pdraw = (n: number) => ((n - 1) << 2) | 2;
export const EOR = 3;

export interface SmxLayerSpec {
  width: number;
  height: number;
  hotspot: [number, number];
  edges: [number, number][];
  cmds: number[];
  /** main layers only: packed pixel bytes */
  pixels?: number[];
}

/** One SMX frame: main layer (+ optional shadow). */
export function smxFile(frames: { type: number; palette: number; main?: SmxLayerSpec; shadow?: SmxLayerSpec }[]): Uint8Array {
  const b = new Bytes().str("SMPX").u16(2, frames.length).u32(0, 0).zeros(16);
  for (const f of frames) {
    b.u8(f.type, f.palette).u32(0);
    for (const layer of [f.main, f.shadow]) {
      if (!layer) continue;
      b.u16(layer.width, layer.height, layer.hotspot[0], layer.hotspot[1]).u32(0, 0);
      for (const [l, r] of layer.edges) b.u16(l, r);
      if (layer === f.main) b.u32(layer.cmds.length, layer.pixels!.length).bytes(layer.cmds).bytes(layer.pixels!);
      else b.u32(layer.cmds.length).bytes(layer.cmds);
    }
  }
  return b.build();
}

/** 1024-entry palette as JASC-PAL text, colour i = (i % 256, i >> 2 & 255, 7 * i & 255). */
export function testPaletteText(count = 1024): string {
  const lines = ["JASC-PAL", "0100", String(count)];
  for (let i = 0; i < count; i++) lines.push(`${i % 256} ${(i >> 2) & 255} ${(7 * i) & 255}`);
  return lines.join("\r\n") + "\r\n";
}

export const rgb565 = (r: number, g: number, b: number) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);

/** A BC1 block: c0, c1 (R5G6B5) and 16 2-bit indices (row-major). */
export function bc1Block(c0: number, c1: number, idx: number[]): number[] {
  let bits = 0;
  for (let i = 15; i >= 0; i--) bits = ((bits << 2) | (idx[i] ?? 0)) >>> 0;
  return [c0 & 0xff, c0 >> 8, c1 & 0xff, c1 >> 8, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff];
}

/** A BC4 block: r0, r1 and 16 3-bit indices (row-major). */
export function bc4Block(r0: number, r1: number, idx: number[]): number[] {
  const out = [r0, r1];
  for (let half = 0; half < 2; half++) {
    let v = 0;
    for (let i = 7; i >= 0; i--) v = (v << 3) | (idx[half * 8 + i] ?? 0);
    out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff);
  }
  return out;
}

export interface SldLayer {
  rect?: [number, number, number, number]; // x1 y1 x2 y2 (main/shadow)
  flags?: number;
  cmds: [number, number][];
  blocks: number[][];
}

export interface SldFrameSpec {
  canvas: [number, number];
  hotspot: [number, number];
  main?: SldLayer;
  shadow?: SldLayer;
  player?: SldLayer;
}

export function sldFile(frames: SldFrameSpec[]): Uint8Array {
  const b = new Bytes().str("SLDX").u16(4, frames.length, 0, 0x10).u32(0xff000000);
  frames.forEach((f, i) => {
    const type = (f.main ? 0x01 : 0) | (f.shadow ? 0x02 : 0) | (f.player ? 0x10 : 0);
    b.u16(f.canvas[0], f.canvas[1], f.hotspot[0], f.hotspot[1]).u8(type, 1).u16(i);
    for (const [layer, isMask] of [[f.main, false], [f.shadow, false], [f.player, true]] as const) {
      if (!layer) continue;
      const body = new Bytes();
      if (isMask) body.u8(layer.flags ?? 0, 1);
      else body.u16(...layer.rect!).u8(layer.flags ?? 0, 1);
      body.u16(layer.cmds.length);
      for (const [s, d] of layer.cmds) body.u8(s, d);
      for (const blk of layer.blocks) body.bytes(blk);
      b.u32(body.length + 4).bytes(body.build()).pad4();
    }
  });
  return b.build();
}

/** A DXT1 DDS texture, every block solid `color` (R5G6B5). */
export function ddsDXT1(width: number, height: number, color: number): Uint8Array {
  const b = new Bytes().str("DDS ").u32(124, 0x1007, height, width, 0, 0, 1).zeros(44);
  b.u32(32, 0x4).str("DXT1").zeros(20); // pixel format
  b.zeros(20); // caps + reserved
  const blocks = Math.ceil(width / 4) * Math.ceil(height / 4);
  for (let i = 0; i < blocks; i++) b.bytes(bc1Block(color, 0, new Array(16).fill(0)));
  return b.build();
}
