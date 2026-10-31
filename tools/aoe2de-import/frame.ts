// The decoder-neutral frame representation shared by the SMX and SLD readers,
// plus player-colour application.

/** A single-channel layer (shadow alpha). */
export interface AlphaLayer {
  width: number;
  height: number;
  /** Hotspot (anchor) inside this layer. */
  hotspotX: number;
  hotspotY: number;
  alpha: Uint8Array;
}

export interface Frame {
  width: number;
  height: number;
  /** Hotspot (the unit's foot point / building centre) inside the frame. */
  hotspotX: number;
  hotspotY: number;
  /** Base RGBA, player-colour pixels already filled with a neutral shade. */
  rgba: Uint8Array;
  /**
   * Player-colour weight per pixel, 0..255 (null when the frame has none).
   * SMX: 255 on player-colour pixels. SLD: the player-colour mask layer.
   */
  playerMask: Uint8Array | null;
  /**
   * Player-colour shade per pixel, 0..1 where 0.5 is the pure player colour
   * (darker below, lighter above). Null means "derive from base luminance".
   */
  playerShade: Float32Array | null;
  shadow: AlphaLayer | null;
}

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Shade a player colour. s = 0.5 gives the colour itself; s -> 0 goes to
 * black; s -> 1 goes 60% of the way to white (highlights keep some hue).
 */
export function tint(color: RGB, s: number): RGB {
  const t = Math.min(1, Math.max(0, s));
  if (t <= 0.5) {
    const k = t * 2;
    return [Math.round(color[0] * k), Math.round(color[1] * k), Math.round(color[2] * k)];
  }
  const k = (t - 0.5) * 2 * 0.6;
  return [
    Math.round(color[0] + (255 - color[0]) * k),
    Math.round(color[1] + (255 - color[1]) * k),
    Math.round(color[2] + (255 - color[2]) * k),
  ];
}

/** Apply a player colour to a frame, returning a new RGBA buffer. */
export function colorize(frame: Frame, color: RGB): Uint8Array {
  const out = new Uint8Array(frame.rgba);
  const m = frame.playerMask;
  if (!m) return out;
  const n = frame.width * frame.height;
  for (let i = 0; i < n; i++) {
    const w = m[i];
    if (w === 0) continue;
    const o = i * 4;
    const s = frame.playerShade ? frame.playerShade[i] : luminance(out[o], out[o + 1], out[o + 2]);
    const c = tint(color, s);
    const k = w / 255;
    out[o] = Math.round(out[o] + (c[0] - out[o]) * k);
    out[o + 1] = Math.round(out[o + 1] + (c[1] - out[o + 1]) * k);
    out[o + 2] = Math.round(out[o + 2] + (c[2] - out[o + 2]) * k);
  }
  return out;
}
