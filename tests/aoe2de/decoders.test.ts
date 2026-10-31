// Decoder tests on SYNTHETIC files built in code (tests/aoe2de/synth.ts).
import { describe, expect, test } from "bun:test";
import { decodeBC1Block, decodeBC4Block, rgb565 as unpack565 } from "../../tools/aoe2de-import/bc.ts";
import { decodeDDS } from "../../tools/aoe2de-import/dds.ts";
import { decodeSprite, detectFormat } from "../../tools/aoe2de-import/detect.ts";
import { planDirections } from "../../tools/aoe2de-import/directions.ts";
import { colorize, hexToRgb, luminance, tint } from "../../tools/aoe2de-import/frame.ts";
import { parseJascPal, parsePaletteConf } from "../../tools/aoe2de-import/palette.ts";
import { decodeSimplePNG, encodePNG } from "../../tools/aoe2de-import/png.ts";
import { parseSLD, sldToFrame } from "../../tools/aoe2de-import/sld.ts";
import { parseSMX, PX_NORMAL, PX_PLAYER, PX_TRANSPARENT, smxToFrame } from "../../tools/aoe2de-import/smx.ts";
import { diamondTile } from "../../tools/aoe2de-import/terrain.ts";
import { bc1Block, bc4Block, Bytes, ddsDXT1, draw, EOR, pdraw, rgb565, sldFile, skip, smxFile, testPaletteText } from "./synth.ts";

const px = (rgba: Uint8Array, w: number, x: number, y: number) => Array.from(rgba.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));

describe("magic detection", () => {
  test("detects each format by its first bytes, not its name", () => {
    expect(detectFormat(new Bytes().str("SMPX").zeros(8).build())).toBe("smx");
    expect(detectFormat(new Bytes().str("SLDX").zeros(8).build())).toBe("sld");
    expect(detectFormat(new Bytes().str("SMP$").zeros(8).build())).toBe("smp");
    expect(detectFormat(new Bytes().str("DDS ").zeros(8).build())).toBe("dds");
    expect(detectFormat(new Bytes().str("2.0N").zeros(8).build())).toBe("slp");
    expect(detectFormat(new Bytes().str("PK\u0003\u0004").build())).toBe("unknown");
    expect(detectFormat(new Uint8Array(2))).toBe("unknown");
  });
  test("decodeSprite refuses formats it cannot read", () => {
    expect(() => decodeSprite(new Bytes().str("2.0N").zeros(32).build(), { byNumber: () => null, player: null })).toThrow(/unsupported/);
  });
});

describe("palettes", () => {
  test("JASC-PAL with CRLF and optional alpha", () => {
    const p = parseJascPal("JASC-PAL\r\n0100\r\n3\r\n1 2 3\r\n4 5 6 7\r\n255 0 128\r\n");
    expect(Array.from(p)).toEqual([1, 2, 3, 255, 4, 5, 6, 7, 255, 0, 128, 255]);
  });
  test("palettes.conf number -> file", () => {
    const m = parsePaletteConf("// comment\n21,b_west.pal\n 0 , main.pal \nnonsense\n");
    expect(m.get(21)).toBe("b_west.pal");
    expect(m.get(0)).toBe("main.pal");
    expect(m.size).toBe(2);
  });
});

describe("SMX (palette-indexed, player colour)", () => {
  // 5x2 frame. Row 0: 1 transparent (left edge), 2 normal, 1 player, 1 skipped.
  // Row 1: empty (0xFFFF edges, no commands).
  // 4plus1 chunk: indices [10, 20, 7, 0], section byte: p0=0, p1=1 (bits 2-3), p2=2 (bits 4-5).
  const sections = (0 << 0) | (1 << 2) | (2 << 4);
  const file = smxFile([
    {
      type: 0x03,
      palette: 21,
      main: {
        width: 5, height: 2, hotspot: [2, 1],
        edges: [[1, 0], [0xffff, 0xffff]],
        cmds: [draw(2), pdraw(1), skip(1), EOR],
        pixels: [10, 20, 7, 0, sections],
      },
      shadow: {
        width: 3, height: 1, hotspot: [1, 0],
        edges: [[0, 0]],
        cmds: [draw(2), 100, 120, EOR], // last pixel omitted: repeated
      },
    },
  ]);

  test("parses frame, layer header and indexed pixels", () => {
    const smx = parseSMX(file);
    expect(smx.version).toBe(2);
    expect(smx.frames.length).toBe(1);
    const m = smx.frames[0].main!;
    expect([m.width, m.height, m.hotspotX, m.hotspotY]).toEqual([5, 2, 2, 1]);
    expect(Array.from(m.kind)).toEqual([PX_TRANSPARENT, PX_NORMAL, PX_NORMAL, PX_PLAYER, PX_TRANSPARENT, 0, 0, 0, 0, 0]);
    expect(m.index[1]).toBe(10);
    expect(m.index[2]).toBe(20 + 256); // section 1
    expect(m.index[3]).toBe(7 + 512); // section 2
    expect(Array.from(smx.frames[0].shadow!.alpha)).toEqual([100, 120, 120]);
  });

  test("decodes to expected RGBA through the palette, then player colour", () => {
    const pal = parseJascPal(testPaletteText());
    const frame = smxToFrame(parseSMX(file).frames[0], { byNumber: (n) => (n === 21 ? pal : null), player: null })!;
    expect(px(frame.rgba, 5, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(frame.rgba, 5, 1, 0)).toEqual([10, 2, 70, 255]); // palette[10]
    const i = 276; // palette[20 + 256]
    expect(px(frame.rgba, 5, 2, 0)).toEqual([i % 256, (i >> 2) & 255, (7 * i) & 255, 255]);
    expect(frame.playerMask![3]).toBe(255);
    expect(frame.playerMask![1]).toBe(0);
    const red = hexToRgb("#d23a2f");
    const out = colorize(frame, red);
    expect(px(out, 5, 3, 0)).toEqual([...red, 255]); // no player palette: shade 0.5 = pure colour
    expect(px(out, 5, 1, 0)).toEqual([10, 2, 70, 255]); // normal pixels untouched
  });

  test("player palette brightness shades the player colour", () => {
    const pal = parseJascPal(testPaletteText());
    // Player palette: entry 519 (7 + 512) is twice as bright as the average.
    const lines = ["JASC-PAL", "0100", "1024"];
    for (let k = 0; k < 1024; k++) lines.push(k === 519 ? "100 100 100" : "50 50 50");
    const player = parseJascPal(lines.join("\n"));
    const frame = smxToFrame(parseSMX(file).frames[0], { byNumber: () => pal, player })!;
    const s = frame.playerShade![3];
    expect(s).toBeGreaterThan(0.5);
    const blue = hexToRgb("#3561d9");
    expect(px(colorize(frame, blue), 5, 3, 0)).toEqual([...tint(blue, s), 255]);
  });

  test("8to5 packing (bit layout from the format notes' worked example)", () => {
    const f = smxFile([
      {
        type: 0x09, // main + 8to5
        palette: 0,
        main: { width: 2, height: 1, hotspot: [0, 0], edges: [[0, 0]], cmds: [draw(2), EOR], pixels: [0x90, 0x1e, 0x32, 0x73, 0xaa] },
      },
    ]);
    const m = parseSMX(f).frames[0].main!;
    expect(m.index[0]).toBe(0x90 + 2 * 256); // index 0x90, section 2
    expect(m.index[1]).toBe(0x87); // index 0x87, section 0
  });

  test("rejects a non-SMX buffer", () => {
    expect(() => parseSMX(new Bytes().str("SLDX").zeros(40).build())).toThrow(/not an SMX/);
  });
});

describe("block compression", () => {
  test("BC1 four-colour block", () => {
    const out = new Uint8Array(64);
    const blk = bc1Block(rgb565(255, 0, 0), rgb565(0, 0, 255), [0, 1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    decodeBC1Block(new Uint8Array(blk), 0, out);
    expect(px(out, 4, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(out, 4, 1, 0)).toEqual([0, 0, 255, 255]);
    expect(px(out, 4, 2, 0)).toEqual([170, 0, 85, 255]);
    expect(px(out, 4, 3, 0)).toEqual([85, 0, 170, 255]);
    expect(px(out, 4, 3, 3)).toEqual([0, 0, 255, 255]);
  });
  test("BC1 three-colour block has a transparent index", () => {
    const out = new Uint8Array(64);
    decodeBC1Block(new Uint8Array(bc1Block(0x0000, 0x1082, [3, 2, 1, 0])), 0, out);
    expect(px(out, 4, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 4, 2, 0)).toEqual([...unpack565(0x1082), 255]);
    expect(px(out, 4, 3, 0)).toEqual([0, 0, 0, 255]);
  });
  test("BC4 matches the format notes' worked example", () => {
    const out = new Uint8Array(16);
    decodeBC4Block(new Uint8Array([0x10, 0x82, 0x33, 0x45, 0xfb, 0x37, 0x17, 0x77]), 0, out);
    // c0=16 c1=130 c2=38 c3=61 c4=84 c5=107 c6=0 c7=255
    expect(Array.from(out)).toEqual([61, 0, 84, 38, 84, 0, 0, 255, 255, 0, 84, 61, 130, 0, 107, 61]);
  });
});

describe("SLD (BC1 main + BC4 player-colour mask)", () => {
  const RED = rgb565(255, 0, 0);
  const solid = (c: number) => bc1Block(c, 0, new Array(16).fill(0));
  const maskIdx = new Array(16).fill(0);
  maskIdx[0] = 1; // top-left pixel of the block: weight 0
  const file = sldFile([
    {
      canvas: [16, 16], hotspot: [8, 12],
      // 8x4 layer at (4,4): block 0 skipped (transparent), block 1 solid red.
      main: { rect: [4, 4, 12, 8], cmds: [[1, 1]], blocks: [solid(RED)] },
      shadow: { rect: [4, 8, 8, 12], cmds: [[0, 1]], blocks: [bc4Block(200, 200, new Array(16).fill(0))] },
      player: { cmds: [[1, 1]], blocks: [bc4Block(255, 0, maskIdx)] },
    },
    {
      // Frame 2 reuses frame 1's pixels for "skipped" blocks (flag 0x80).
      canvas: [16, 16], hotspot: [8, 12],
      main: { rect: [4, 4, 12, 8], flags: 0x80, cmds: [[2, 0]], blocks: [] },
    },
  ]);

  test("parses frames and places layers", () => {
    const sld = parseSLD(file);
    expect(sld.version).toBe(4);
    expect(sld.frames.length).toBe(2);
    const f = sld.frames[0];
    expect(f.frameType).toBe(0x13);
    expect([f.main!.x1, f.main!.y1, f.main!.width, f.main!.height]).toEqual([4, 4, 8, 4]);
    expect(f.playerMask!.width).toBe(8);
  });

  test("decodes BC1 blocks to RGBA and the mask to weights", () => {
    const frame = sldToFrame(parseSLD(file).frames[0])!;
    expect([frame.width, frame.height, frame.hotspotX, frame.hotspotY]).toEqual([8, 4, 4, 8]);
    expect(px(frame.rgba, 8, 0, 0)).toEqual([0, 0, 0, 0]); // skipped block
    expect(px(frame.rgba, 8, 5, 2)).toEqual([255, 0, 0, 255]);
    expect(frame.playerMask![4]).toBe(0); // top-left of block 1
    expect(frame.playerMask![5]).toBe(255);
    expect(frame.playerMask![0]).toBe(0); // skipped block
    expect(frame.shadow!.alpha[0]).toBe(200);
    expect([frame.shadow!.hotspotX, frame.shadow!.hotspotY]).toEqual([4, 4]);
  });

  test("applies the player colour through the mask", () => {
    const frame = sldToFrame(parseSLD(file).frames[0])!;
    const blue = hexToRgb("#3561d9");
    const out = colorize(frame, blue);
    const s = luminance(255, 0, 0);
    expect(px(out, 8, 5, 0)).toEqual([...tint(blue, s), 255]); // full weight
    expect(px(out, 8, 4, 0)).toEqual([255, 0, 0, 255]); // zero weight: untouched
  });

  test("flag 0x80 copies blocks from the previous frame", () => {
    const frame = sldToFrame(parseSLD(file).frames[1])!;
    expect(px(frame.rgba, 8, 6, 1)).toEqual([255, 0, 0, 255]);
    expect(px(frame.rgba, 8, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  test("decodeSprite dispatches on magic", () => {
    const r = decodeSprite(file, { byNumber: () => null, player: null });
    expect(r.format).toBe("sld");
    expect(r.frames.length).toBe(2);
  });
});

describe("DDS, PNG, terrain", () => {
  test("DXT1 DDS decodes", () => {
    const img = decodeDDS(ddsDXT1(8, 8, rgb565(0, 255, 0)))!;
    expect([img.width, img.height]).toEqual([8, 8]);
    expect(px(img.rgba, 8, 7, 7)).toEqual([0, 255, 0, 255]);
  });
  test("PNG round-trips", () => {
    const rgba = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const png = encodePNG(3, 1, rgba);
    expect(Array.from(png.subarray(1, 4))).toEqual([80, 78, 71]);
    const back = decodeSimplePNG(png);
    expect([back.width, back.height]).toEqual([3, 1]);
    expect(Array.from(back.rgba)).toEqual(Array.from(rgba));
  });
  test("diamond tile: opaque centre, transparent corners", () => {
    const tex = { width: 4, height: 4, rgba: new Uint8Array(64).fill(200) };
    const t = diamondTile(tex, 4, 0, 0, 96, 48);
    expect(px(t, 96, 48, 24)[3]).toBe(255);
    expect(px(t, 96, 0, 0)[3]).toBe(0);
    expect(px(t, 96, 95, 47)[3]).toBe(0);
  });
});

describe("direction mapping", () => {
  test("16 source directions -> every second one", () => {
    const p = planDirections(16 * 10);
    expect(p.sourceDirs).toBe(16);
    expect(p.framesPerDir).toBe(10);
    expect(p.rows.map((r) => r.source)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });
  test("8 directions map 1:1; counter-clockwise and offset are honoured", () => {
    expect(planDirections(8 * 3).rows.map((r) => r.source)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(planDirections(8, { clockwise: false, offset: 4 }).rows.map((r) => r.source)).toEqual([4, 3, 2, 1, 0, 7, 6, 5]);
  });
  test("5 directions mirror the east side; single frames repeat", () => {
    const p = planDirections(5 * 6);
    expect(p.rows.map((r) => `${r.source}${r.flip ? "f" : ""}`)).toEqual(["0", "1", "2", "3", "4", "3f", "2f", "1f"]);
    const one = planDirections(3);
    expect(one.sourceDirs).toBe(1);
    expect(one.framesPerDir).toBe(3);
  });
});
