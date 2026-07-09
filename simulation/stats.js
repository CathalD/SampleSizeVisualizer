// Statistical helpers: normal quantile, Cochran/UNFCCC sample size, and
// margin-of-error curves. A normal (z) quantile is used rather than Student-t;
// for the plot counts and the very-high confidence levels this tool explores
// (up to 99.9999%) the difference is negligible and z is what the extreme
// tail requires. This is flagged in the README.

// Acklam's rational approximation of the inverse standard normal CDF.
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];
  const plow = 0.02425, phigh = 1 - plow;
  let q, r;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= phigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// Two-sided z for a confidence level given as a fraction (e.g. 0.95).
export function zFor(confidence) {
  const alpha = 1 - confidence;
  return normInv(1 - alpha / 2);
}

// Cochran sample size for a MEAN at relative precision r, with finite
// population correction. N = A/a (number of possible plots).
// r = relative margin of error (E/mean); cv = s/mean.
//
// The FPC form matches the UNFCCC/CDM standard and the paired GEE sampling
// tool: n = n0 / (1 + (n0 − 1)/N), where n0 = z²·σ²/E² = (z·CV/r)².
export function cochranN({ z, cv, r, N }) {
  const n0 = Math.pow((z * cv) / r, 2);
  const n = N && isFinite(N) ? n0 / (1 + (n0 - 1) / N) : n0;
  return { n0, n: Math.min(n, N || n) };
}

// UNFCCC sample size for a PROPORTION p at absolute margin of error E:
//   n = N·p(1−p) / [ (N−1)·(E/z)² + p(1−p) ]
// (p = 0.5 is the conservative default.) Returned n0 is the infinite-population
// limit p(1−p)·(z/E)².
export function proportionN({ z, p, E, N }) {
  const pq = p * (1 - p);
  const n0 = pq * Math.pow(z / E, 2);
  if (!N || !isFinite(N)) return { n0, n: n0 };
  const n = (N * pq) / ((N - 1) * Math.pow(E / z, 2) + pq);
  return { n0, n: Math.min(n, N) };
}

// Achieved absolute margin of error of a MEAN at sample size n (with FPC).
export function moeAbs({ z, sigma, n, N }) {
  if (n <= 0) return Infinity;
  const fpc = N && isFinite(N) ? Math.max(0, 1 - n / N) : 1;
  return z * (sigma / Math.sqrt(n)) * Math.sqrt(fpc);
}

// Achieved absolute margin of error of a PROPORTION at sample size n, using the
// same (N−1) FPC structure as the UNFCCC proportion formula.
export function moeProp({ z, p, n, N }) {
  if (n <= 0) return Infinity;
  const fpc = N && isFinite(N) && N > 1 ? Math.max(0, (N - n) / (N - 1)) : 1;
  return z * Math.sqrt((p * (1 - p) / n) * fpc);
}
