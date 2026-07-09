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
    for (const sp of halvingSpacings(Math.min(rows, cols))) {
      for (let r = 0; r < rows; r += sp)
        for (let c = 0; c < cols; c += sp) add(r * cols + c);
    }
    for (let i = 0; i < n; i++) add(i); // any remainder
    return Int32Array.from(order);
  }

  if (design === 'systematicLinear') {
    // Whole transects (rows) added from the centre outward; each transect is
    // filled along its columns before the next is begun.
    for (const r of dispersed(rows)) for (let c = 0; c < cols; c++) add(r * cols + c);
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
