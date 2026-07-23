// Sampling designs: the ORDER in which cells get revealed, and the
// design-based estimator of the mean + its margin of error.
//
//   random            — Fisher–Yates shuffle
//   systematicGrid    — coarse→fine grid densification (spreads over gradients)
//   systematicLinear  — whole transects added in dispersed order
//   stratified        — proportional allocation, balanced across strata
//
// Systematic designs use the SRS variance formula as an approximation (usually
// conservative under a spatial trend); stratified uses the proper pooled form.
// Because the truth is known, the caller also shows the ACTUAL error.

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function halvingSpacings(size) {
  const sp = [];
  let s = 1;
  while (s * 2 < size) s *= 2;
  for (; s >= 1; s = Math.floor(s / 2)) { sp.push(s); if (s === 1) break; }
  return sp;
}

// Van der Corput (base 2) dispersion over 0..size-1, starting at the CENTRE and
// filling outward: 24,12,36,6,30,... for size 48. Used so a partial first
// transect sits near the mean rather than at a gradient extreme.
function dispersed(size) {
  const vdc = (n) => { let r = 0, b = 0.5; while (n > 0) { r += (n & 1) * b; n = n >> 1; b /= 2; } return r; };
  const out = [];
  const seen = new Uint8Array(size);
  for (let i = 1; out.length < size; i++) {
    const idx = Math.min(size - 1, Math.floor(vdc(i) * size));
    if (!seen[idx]) { seen[idx] = 1; out.push(idx); }
  }
  return out;
}

export function buildOrder(design, landscape, rng) {
  const { rows, cols, n } = landscape;
  const order = [];
  const seen = new Uint8Array(n);
  const add = (i) => { if (!seen[i]) { seen[i] = 1; order.push(i); } };

  if (design === 'random') {
    const all = Array.from({ length: n }, (_, i) => i);
    return Int32Array.from(shuffle(all, rng));
  }

  if (design === 'systematicGrid') {
    // R2 low-discrepancy sequence (Roberts 2018). Unlike a row-major coarse→fine
    // fill, every PREFIX is spatially balanced, so a partial grid is spread
    // evenly across the map rather than clustered — which is what makes a
    // systematic design shine on a gradient. Densifies smoothly as n grows.
    const g1 = 0.7548776662466927;   // 1/plastic-number
    const g2 = 0.5698402909980532;   // 1/plastic-number²
    const guard = n * 40 + 1000;
    for (let i = 1; order.length < n && i < guard; i++) {
      const x = (0.5 + i * g1) % 1;
      const y = (0.5 + i * g2) % 1;
      const c = Math.min(cols - 1, Math.floor(x * cols));
      const r = Math.min(rows - 1, Math.floor(y * rows));
      add(r * cols + c);
    }
    for (let i = 0; i < n; i++) add(i); // fill any remainder deterministically
    return Int32Array.from(order);
  }

  if (design === 'systematicLinear') {
    // Parallel transects (rows) in centre-outward order. Each transect is first
    // sampled sparsely along its length (every 4th cell) so several well-spaced
    // lines appear before any one is densified; later sweeps fill each line in,
    // up to full coverage. This spreads early samples across the landscape
    // instead of dumping them all onto one line.
    const lineRows = dispersed(rows);
    for (const stride of [4, 2, 1]) {
      for (const r of lineRows) {
        for (let c = 0; c < cols; c += stride) add(r * cols + c);
      }
    }
    return Int32Array.from(order);
  }

  if (design === 'stratified') {
    const nStrata = landscape.nStrata;
    const buckets = Array.from({ length: nStrata }, () => []);
    for (let i = 0; i < n; i++) buckets[landscape.strataMap[i]].push(i);
    buckets.forEach((b) => shuffle(b, rng));
    const Nh = buckets.map((b) => b.length);
    const counts = new Array(nStrata).fill(0);
    const ptr = new Array(nStrata).fill(0);
    for (let k = 0; k < n; k++) {
      // pick the stratum most under-represented vs its target share Nh/N
      let best = -1, bestDeficit = -Infinity;
      for (let h = 0; h < nStrata; h++) {
        if (ptr[h] >= Nh[h]) continue;
        const deficit = Nh[h] / n - counts[h] / (k + 1);
        if (deficit > bestDeficit) { bestDeficit = deficit; best = h; }
      }
      if (best < 0) break;
      order.push(buckets[best][ptr[best]++]);
      counts[best]++;
    }
    return Int32Array.from(order);
  }

  return Int32Array.from(Array.from({ length: n }, (_, i) => i));
}

// Small seeded PRNG so the design-comparison curves are stable across redraws.
function seededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// For a KNOWN landscape, compute the mean absolute error |x̄ − μ_true| of each
// sampling design as a function of n. Random and stratified are averaged over
// several seeds (they involve a shuffle); the systematic designs are
// deterministic. This is what powers the "which design wins here?" chart —
// e.g. stratified pulls ahead where strata are strong, systematic where a
// smooth gradient dominates, and all four converge where the map is uniform.
export function designComparison(landscape, z, opts = {}) {
  const N = landscape.n;
  const maxN = Math.min(opts.maxN || 200, N);
  const points = opts.points || 24;
  const seeds = opts.seeds || 8;
  const designs = ['random', 'systematicGrid', 'systematicLinear', 'stratified'];

  const nGrid = [];
  for (let i = 0; i < points; i++) {
    const v = Math.round(2 + (maxN - 2) * (i / (points - 1)));
    if (nGrid[nGrid.length - 1] !== v) nGrid.push(v);
  }

  const curves = {};
  for (const d of designs) {
    const stochastic = d === 'random' || d === 'stratified';
    const reps = stochastic ? seeds : 1;
    const mae = new Array(nGrid.length).fill(0);
    for (let s = 0; s < reps; s++) {
      const rng = seededRng(1009 + s * 7919 + designs.indexOf(d) * 31);
      const order = buildOrder(d, landscape, rng);
      for (let gi = 0; gi < nGrid.length; gi++) {
        const n = Math.min(nGrid[gi], order.length);
        const est = estimate(d, order, n, landscape, z);
        mae[gi] += Math.abs(est.mean - landscape.trueMean);
      }
    }
    curves[d] = mae.map((v) => v / reps);
  }
  return { nGrid, curves };
}

function meanVar(values) {
  const n = values.length;
  let m = 0;
  for (const v of values) m += v;
  m /= n;
  let s2 = 0;
  for (const v of values) s2 += (v - m) * (v - m);
  s2 = n > 1 ? s2 / (n - 1) : 0;
  return { mean: m, s2, sd: Math.sqrt(s2) };
}

// Design-based estimate from the first `count` cells of `order`.
export function estimate(design, order, count, landscape, z) {
  const N = landscape.n;
  const idx = [];
  for (let i = 0; i < count; i++) idx.push(order[i]);
  const values = idx.map((i) => landscape.truth[i]);
  const overall = meanVar(values);

  let mean, seAbs, sd = overall.sd;
  if (design === 'stratified' && landscape.nStrata > 1) {
    const Nh = landscape.strataSizes();
    const groups = Array.from({ length: landscape.nStrata }, () => []);
    idx.forEach((i) => groups[landscape.strataMap[i]].push(landscape.truth[i]));
    let m = 0, varSum = 0;
    for (let h = 0; h < landscape.nStrata; h++) {
      const wh = Nh[h] / N;
      const g = groups[h];
      const stat = g.length ? meanVar(g) : { mean: overall.mean, s2: overall.s2 };
      m += wh * stat.mean;
      const nh = g.length || 1;
      const fpc = Math.max(0, 1 - nh / Nh[h]);
      const s2h = g.length > 1 ? stat.s2 : overall.s2; // fallback for tiny strata
      varSum += wh * wh * (s2h / nh) * fpc;
    }
    mean = m;
    seAbs = Math.sqrt(varSum);
  } else {
    mean = overall.mean;
    const fpc = Math.max(0, 1 - count / N);
    seAbs = count > 1 ? Math.sqrt(overall.s2 / count) * Math.sqrt(fpc) : Infinity;
  }

  const moeAbs = z * seAbs;
  return {
    mean,
    sd,
    seAbs,
    moeAbs,
    moeRel: isFinite(moeAbs) && mean > 0 ? moeAbs / mean : Infinity,
    actualError: Math.abs(mean - landscape.trueMean),
    idx,
  };
}
