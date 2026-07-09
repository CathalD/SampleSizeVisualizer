// Shared palette + colour helpers. Kept visually consistent with the
// Carbon Accumulation tool: clean, minimal, scientific.

export const COLORS = {
  moe: '#c0392b',        // red    — margin of error / precision
  requiredN: '#2d8a4e',  // green  — required sample size
  estimate: '#1a1a2e',   // near-black — running estimate
  ci: 'rgba(26,26,46,0.15)', // estimate CI band fill
  posterior: '#7F77DD',  // purple — Bayesian posterior
  postBand: 'rgba(127,119,221,0.18)',
  truth: '#3B8BD4',      // blue   — true mean reference
  target: '#854F0B',     // amber  — target precision line
  error: '#c0392b',      // red    — actual error
  beige: '#f5f0e8',
  grid: '#e2e0da',
  muted: '#6b6b76',
};

// Sequential ramps for the raster (low → high carbon), one per ecosystem
// family. Each is [lowHex, highHex]; the error ramp is separate.
export const RAMPS = {
  marsh:    ['#eef3ea', '#2f6b3a'],
  seagrass: ['#eef2f0', '#0f6b6b'],
  forest:   ['#eef3ea', '#14432a'],
  wetland:  ['#eef1f3', '#2b5a6b'],
  peat:     ['#f2ece6', '#3a2a18'],
  grass:    ['#f1f3e8', '#5a6b1f'],
};

export const ERROR_RAMP = ['#f5f0e8', '#c0392b']; // no error → beige, high → red

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerpRgb(a, b, t) {
  t = clamp01(t);
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

export function rampColor(ramp, t) {
  return rgbToHex(lerpRgb(hexToRgb(ramp[0]), hexToRgb(ramp[1]), t));
}
