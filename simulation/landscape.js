// Landscape: generates the fixed "true" carbon-stock map for an ecosystem and
// reconstructs an estimated map from collected samples (inverse-distance
// weighting). The true map is deterministic per ecosystem (seeded), so it is a
// stable "known value underneath" that sampling progressively reveals.

// Small seeded PRNG (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value-noise field in [0,1], smooth + patchy (two octaves), upsampled from a
// coarse control grid by bilinear interpolation.
function valueNoise(rng, rows, cols) {
  const octave = (ctrl) => {
    const g = [];
    for (let i = 0; i <= ctrl; i++) {
      g[i] = [];
      for (let j = 0; j <= ctrl; j++) g[i][j] = rng();
    }
    const out = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const fy = (r / (rows - 1)) * ctrl;
        const fx = (c / (cols - 1)) * ctrl;
        const y0 = Math.floor(fy), x0 = Math.floor(fx);
        const y1 = Math.min(y0 + 1, ctrl), x1 = Math.min(x0 + 1, ctrl);
        const ty = fy - y0, tx = fx - x0;
        const top = g[y0][x0] * (1 - tx) + g[y0][x1] * tx;
        const bot = g[y1][x0] * (1 - tx) + g[y1][x1] * tx;
        out[r * cols + c] = top * (1 - ty) + bot * ty;
      }
    }
    return out;
  };
  const a = octave(4), b = octave(9);
  const out = new Float64Array(rows * cols);
  for (let i = 0; i < out.length; i++) out[i] = 0.65 * a[i] + 0.35 * b[i];
  return out;
}

function standardize(arr) {
  let m = 0;
  for (const v of arr) m += v;
  m /= arr.length;
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  s = Math.sqrt(s / arr.length) || 1;
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = (arr[i] - m) / s;
  return out;
}

// A stable per-ecosystem seed.
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export class Landscape {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this.n = rows * cols;
  }

  // Build the true map for an ecosystem definition with mean/sd overrides.
  generate(ecoKey, eco, mean, sd) {
    const { rows, cols, n } = this;
    const rng = mulberry32(hashSeed(ecoKey));
    const w = eco.structure;

    // Gradient (diagonal), standardised.
    const grad = new Float64Array(n);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        grad[r * cols + c] = (r / (rows - 1)) * 0.6 + (c / (cols - 1)) * 0.4;

    // Strata bands along the gradient axis (rows). Stratum id map is exposed
    // for stratified sampling.
    const nStrata = eco.strata || 1;
    this.strataMap = new Int32Array(n);
    const strataTerm = new Float64Array(n);
    for (let r = 0; r < rows; r++) {
      const s = Math.min(nStrata - 1, Math.floor((r / rows) * nStrata));
      for (let c = 0; c < cols; c++) {
        this.strataMap[r * cols + c] = s;
        strataTerm[r * cols + c] = s; // discrete offset per band
      }
    }
    this.nStrata = nStrata;

    const patch = valueNoise(rng, rows, cols);
    const nugget = new Float64Array(n);
    for (let i = 0; i < n; i++) nugget[i] = rng();

    const G = standardize(grad), S = standardize(strataTerm);
    const P = standardize(patch), U = standardize(nugget);

    // Normalise component weights so the composite has ~unit variance, then
    // rescale to the exact requested mean and sd.
    const wsum = Math.hypot(w.gradient, w.strata, w.patch, w.nugget) || 1;
    const gw = w.gradient / wsum, sw = w.strata / wsum, pw = w.patch / wsum, uw = w.nugget / wsum;

    const resid = new Float64Array(n);
    for (let i = 0; i < n; i++) resid[i] = gw * G[i] + sw * S[i] + pw * P[i] + uw * U[i];
    const R = standardize(resid);

    this.truth = new Float64Array(n);
    let tmin = Infinity, tmax = -Infinity, tsum = 0;
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, mean + sd * R[i]); // carbon can't be negative
      this.truth[i] = v;
      tsum += v;
      if (v < tmin) tmin = v;
      if (v > tmax) tmax = v;
    }
    // Realised grid mean (differs slightly from the input mean only when the
    // ≥0 clamp bites, e.g. high-CV seagrass). This is the value estimates
    // actually converge to.
    this.trueMean = tsum / n;
    this.min = tmin;
    this.max = tmax;
    return this.truth;
  }

  strataSizes() {
    const sizes = new Array(this.nStrata).fill(0);
    for (let i = 0; i < this.n; i++) sizes[this.strataMap[i]]++;
    return sizes;
  }

  // IDW (power 2) reconstruction from a list of sampled cell indices.
  reconstruct(sampledIdx) {
    const { rows, cols, n } = this;
    const recon = new Float64Array(n);
    if (sampledIdx.length === 0) return recon;
    const sx = sampledIdx.map((i) => i % cols);
    const sy = sampledIdx.map((i) => Math.floor(i / cols));
    const sv = sampledIdx.map((i) => this.truth[i]);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let wsum = 0, acc = 0, exact = -1;
        for (let k = 0; k < sampledIdx.length; k++) {
          const dx = c - sx[k], dy = r - sy[k];
          const d2 = dx * dx + dy * dy;
          if (d2 === 0) { exact = sv[k]; break; }
          const wk = 1 / d2; // inverse-distance-squared (IDW power 2)
          wsum += wk; acc += wk * sv[k];
        }
        recon[r * cols + c] = exact >= 0 ? exact : (wsum ? acc / wsum : 0);
      }
    }
    return recon;
  }
}
