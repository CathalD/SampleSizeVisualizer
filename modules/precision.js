// Module — Sample size, precision & margin of error.
//
// Ties together: (1) the Cochran/UNFCCC sample-size curve (frequentist), and
// (2) a known "true" carbon map that four sampling designs progressively
// reveal, with a Bayesian prior (IPCC default, strength set by Tier) updating
// toward the truth as plots are collected.

import { slider, segmented, select, metricCard } from '../components/controls.js';
import { createChart, buildLegend } from '../components/chart-panel.js';
import { COLORS, RAMPS, ERROR_RAMP, rampColor, clamp01 } from '../colors.js';
import { ECOSYSTEMS, ECOSYSTEM_ORDER, TIERS } from '../data/ecosystems.js';
import { Landscape } from '../simulation/landscape.js';
import { buildOrder, estimate } from '../simulation/sampler.js';
import { zFor, cochranN, moeAbs } from '../simulation/stats.js';

const ROWS = 48, COLS = 48;

export function create() {
  const st = {
    ecoKey: 'marsh',
    tier: 2,
    design: 'stratified',
    confidence: 0.90,
    r: 0.10,               // relative margin of error
    mean: ECOSYSTEMS.marsh.mean,
    sd: ECOSYSTEMS.marsh.sd,
    plotAreaHa: 0.05,      // ha per plot
    heroMode: 'moe',
    viewMode: 'true',
    speed: 12,             // samples / second when playing
  };

  const land = new Landscape(ROWS, COLS);
  const N = land.n;

  const mod = {
    id: 'precision',
    title: 'Precision & margin of error',
    rows: ROWS, cols: COLS,
    equation:
      'n = (z·CV / r)² / (1 + n₀/N) &nbsp;·&nbsp; E(n) = z·s/√n · √(1 − n/N) &nbsp;·&nbsp; N = A/a',
    callout:
      'Precision is expensive: halving the margin of error quadruples the plots needed ' +
      '(n ∝ 1/E²). Spatial design and stratification change how fast the known map is revealed.',
    state: st,

    // ---- derived quantities ----
    z() { return zFor(st.confidence); },
    cv() { return st.sd / st.mean; },
    plotAreaM2() { return st.plotAreaHa * 10000; },
    totalAreaHa() { return N * st.plotAreaHa; },
    requiredN() { return Math.ceil(cochranN({ z: mod.z(), cv: mod.cv(), r: st.r, N }).n); },
    priorEqN() { return TIERS[st.tier].priorEqN; },

    // ---- lifecycle ----
    regenerate() {
      const eco = ECOSYSTEMS[st.ecoKey];
      land.generate(st.ecoKey, eco, st.mean, st.sd);
      mod.order = buildOrder(st.design, land, Math.random);
      mod.n = 0;
      mod.mask = new Uint8Array(N);
      mod._reconN = -1;
      mod._recon = null;
      mod._last = null;
      if (mod._conv) { mod._conv.data.datasets.forEach((d) => (d.data = [])); }
    },

    // ---- controls ----
    mountControls(container, ctrl) {
      const rebuild = () => { mod.regenerate(); mod._refreshHero(); mod._refreshConv(); mod._refreshReadouts(); mod._markDirty(); ctrl.redraw(); };
      const soft = () => { mod._refreshHero(); mod._refreshReadouts(); };

      const eSel = select({
        label: 'Ecosystem', value: st.ecoKey,
        options: ECOSYSTEM_ORDER.map((k) => ({ value: k, label: ECOSYSTEMS[k].label })),
        onChange: (v) => {
          st.ecoKey = v; st.mean = ECOSYSTEMS[v].mean; st.sd = ECOSYSTEMS[v].sd;
          sMean.set(st.mean); sSd.set(st.sd);
          mod._ecoNote.textContent = ECOSYSTEMS[v].note;
          rebuild();
        },
      });
      container.appendChild(eSel.root);
      mod._ecoNote = document.createElement('p');
      mod._ecoNote.className = 'hint-text';
      mod._ecoNote.textContent = ECOSYSTEMS[st.ecoKey].note;
      container.appendChild(mod._ecoNote);

      container.appendChild(segmented({
        label: 'IPCC tier (prior strength)', value: String(st.tier),
        options: [{ value: '1', label: 'Tier 1' }, { value: '2', label: 'Tier 2' }, { value: '3', label: 'Tier 3' }],
        onChange: (v) => { st.tier = parseInt(v, 10); mod._refreshConv(); soft(); },
      }));

      container.appendChild(segmented({
        label: 'Sampling design', value: st.design,
        options: [
          { value: 'random', label: 'Random' },
          { value: 'systematicLinear', label: 'Transect' },
          { value: 'systematicGrid', label: 'Grid' },
          { value: 'stratified', label: 'Stratified' },
        ],
        onChange: (v) => { st.design = v; rebuild(); },
      }));

      container.appendChild(select({
        label: 'Confidence level', value: String(st.confidence),
        options: [
          { value: '0.8', label: '80%' }, { value: '0.9', label: '90%' },
          { value: '0.95', label: '95%' }, { value: '0.99', label: '99%' },
          { value: '0.999', label: '99.9%' }, { value: '0.9999', label: '99.99%' },
          { value: '0.999999', label: '99.9999%' },
        ],
        onChange: (v) => { st.confidence = parseFloat(v); soft(); mod._markDirty(); },
      }).root);

      container.appendChild(slider({
        label: 'Target precision (margin of error)', min: 1, max: 50, step: 1, value: st.r * 100,
        unit: '% of mean', format: (v) => v.toFixed(0),
        onInput: (v) => { st.r = v / 100; soft(); },
      }).root);

      const sMean = slider({
        label: 'Mean carbon', min: 1, max: 300, step: 0.5, value: st.mean,
        unit: 'kg C m⁻²', format: (v) => v.toFixed(1),
        onInput: (v) => { st.mean = v; rebuild(); },
      });
      const sSd = slider({
        label: 'Spatial SD (σ)', min: 0.5, max: 150, step: 0.5, value: st.sd,
        unit: 'kg C m⁻²', format: (v) => v.toFixed(1),
        onInput: (v) => { st.sd = v; rebuild(); },
      });
      container.appendChild(sMean.root);
      container.appendChild(sSd.root);

      container.appendChild(slider({
        label: 'Plot area', min: 0.01, max: 1, step: 0.01, value: st.plotAreaHa,
        unit: 'ha', format: (v) => `${v.toFixed(2)} (${(v * 10000).toFixed(0)} m²)`,
        onInput: (v) => { st.plotAreaHa = v; soft(); },
      }).root);

      // Raster view toggle.
      container.appendChild(segmented({
        label: 'Map view', value: st.viewMode,
        options: [
          { value: 'true', label: 'True map' },
          { value: 'revealed', label: 'Revealed' },
          { value: 'error', label: 'Error' },
        ],
        onChange: (v) => { st.viewMode = v; mod._markDirty(); ctrl.redraw(); },
      }));
    },

    // ---- readouts ----
    mountReadouts(container) {
      mod._cards = {
        reqN: metricCard('Required n', 'Cochran, for target'),
        curN: metricCard('Collected n', '% of area'),
        est: metricCard('Estimate x̄', 'kg C m⁻²'),
        moe: metricCard('Margin of error', '± / %'),
        err: metricCard('Actual error', '|x̄ − true|'),
        post: metricCard('Posterior mean', 'prior→data'),
      };
      Object.values(mod._cards).forEach((c) => container.appendChild(c.root));
    },

    // ---- charts ----
    mountCharts(container) {
      // Hero chart (sample size vs precision) with an axis toggle.
      const heroHead = document.createElement('div');
      heroHead.className = 'chart-toolbar';
      heroHead.appendChild(segmented({
        label: 'x-axis', value: st.heroMode,
        options: [
          { value: 'moe', label: 'Margin of error vs n' },
          { value: 'reqN_area', label: 'Required n vs area' },
          { value: 'reqN_cv', label: 'Required n vs CV' },
        ],
        onChange: (v) => { st.heroMode = v; mod._refreshHero(); },
      }));
      container.appendChild(heroHead);

      const legHero = document.createElement('div');
      legHero.className = 'chart-legend';
      const wrapHero = document.createElement('div');
      wrapHero.className = 'chart-wrap';
      const cHero = document.createElement('canvas');
      wrapHero.appendChild(cHero);
      container.appendChild(legHero);
      container.appendChild(wrapHero);
      mod._legHero = legHero;

      mod._hero = createChart(cHero, {
        type: 'line',
        data: { datasets: [{ data: [], borderColor: COLORS.moe, borderWidth: 2.5, pointRadius: 0 }] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, referenceLines: { lines: [] } },
          scales: {
            x: { type: 'linear', title: { display: true, text: 'sample size n' } },
            y: { type: 'linear', min: 0, title: { display: true, text: 'margin of error (%)' } },
          },
        },
      });

      // Convergence chart.
      const legConv = document.createElement('div');
      legConv.className = 'chart-legend';
      buildLegend(legConv, [
        { label: 'Design estimate x̄', color: COLORS.estimate },
        { label: 'Frequentist CI', color: COLORS.ci, band: true },
        { label: 'Bayesian posterior', color: COLORS.posterior },
        { label: 'True mean', color: COLORS.truth, dash: true },
      ]);
      const wrapConv = document.createElement('div');
      wrapConv.className = 'chart-wrap';
      const cConv = document.createElement('canvas');
      wrapConv.appendChild(cConv);
      container.appendChild(legConv);
      container.appendChild(wrapConv);

      const band = (color) => ({ data: [], borderWidth: 0, pointRadius: 0, backgroundColor: color });
      mod._conv = createChart(cConv, {
        type: 'line',
        data: {
          datasets: [
            { ...band('transparent') },                                   // 0 ciLo
            { ...band(COLORS.ci), fill: '-1' },                           // 1 ciHi→ciLo
            { ...band('transparent') },                                   // 2 postLo
            { ...band(COLORS.postBand), fill: '-1' },                     // 3 postHi→postLo
            { data: [], borderColor: COLORS.estimate, borderWidth: 2, pointRadius: 0 },   // 4 estimate
            { data: [], borderColor: COLORS.posterior, borderWidth: 2, pointRadius: 0, borderDash: [5, 3] }, // 5 posterior
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, referenceLines: { lines: [] } },
          scales: {
            x: { type: 'linear', title: { display: true, text: 'sample size n' } },
            y: { type: 'linear', title: { display: true, text: 'mean carbon (kg C m⁻²)' } },
          },
        },
      });

      mod._refreshHero();
      mod._refreshConv();
    },

    _refreshHero() {
      const z = mod.z(), cv = mod.cv();
      const ch = mod._hero;
      let data = [], refLines = [], xTitle, yTitle, legend;
      if (st.heroMode === 'moe') {
        const step = Math.max(1, Math.floor(N / 220));
        for (let n = 1; n <= N; n += step) {
          data.push({ x: n, y: (moeAbs({ z, sigma: st.sd, n, N }) / st.mean) * 100 });
        }
        ch.data.datasets[0].borderColor = COLORS.moe;
        ch.options.scales.y.max = Math.min(200, st.r * 100 * 5);
        xTitle = 'sample size n'; yTitle = 'margin of error (%)';
        refLines = [
          { scaleID: 'y', axis: 'y', value: st.r * 100, color: COLORS.target, label: `target ${(st.r * 100).toFixed(0)}%` },
          { scaleID: 'x', axis: 'x', value: mod.requiredN(), color: COLORS.requiredN, label: `n=${mod.requiredN()}` },
          { scaleID: 'x', axis: 'x', value: mod.n || 0, color: COLORS.muted, label: 'now' },
        ];
        legend = [
          { label: 'Margin of error E(n)', color: COLORS.moe },
          { label: 'Target precision', color: COLORS.target, dash: true },
          { label: 'Required n', color: COLORS.requiredN, dash: true },
        ];
      } else if (st.heroMode === 'reqN_cv') {
        for (let c = 0.05; c <= 1.2; c += 0.02) {
          data.push({ x: c * 100, y: Math.ceil(cochranN({ z, cv: c, r: st.r, N }).n) });
        }
        ch.options.scales.y.max = undefined;
        xTitle = 'coefficient of variation (%)'; yTitle = 'required n';
        ch.data.datasets[0].borderColor = COLORS.requiredN;
        refLines = [{ scaleID: 'x', axis: 'x', value: cv * 100, color: COLORS.muted, label: `CV=${(cv * 100).toFixed(0)}%` }];
        legend = [{ label: 'Required n (Cochran)', color: COLORS.requiredN }, { label: 'Current CV', color: COLORS.muted, dash: true }];
      } else { // reqN_area
        const a = st.plotAreaHa;
        for (let A = a * 4; A <= a * N * 4; A *= 1.15) {
          const Na = A / a;
          data.push({ x: A, y: Math.ceil(cochranN({ z, cv, r: st.r, N: Na }).n) });
        }
        ch.options.scales.y.max = undefined;
        xTitle = 'total area (ha)'; yTitle = 'required n';
        ch.data.datasets[0].borderColor = COLORS.requiredN;
        refLines = [{ scaleID: 'x', axis: 'x', value: mod.totalAreaHa(), color: COLORS.muted, label: `${mod.totalAreaHa().toFixed(0)} ha` }];
        legend = [{ label: 'Required n (Cochran)', color: COLORS.requiredN }, { label: 'This landscape', color: COLORS.muted, dash: true }];
      }
      ch.data.datasets[0].data = data;
      ch.options.scales.x.title.text = xTitle;
      ch.options.scales.y.title.text = yTitle;
      ch.options.plugins.referenceLines.lines = refLines;
      buildLegend(mod._legHero, legend);
      ch.update('none');
    },

    _refreshConv() {
      if (!mod._conv) return;
      const ch = mod._conv;
      ch.options.scales.y.min = Math.max(0, st.mean * 0.5);
      ch.options.scales.y.max = st.mean * 1.5;
      ch.options.plugins.referenceLines.lines = [
        { scaleID: 'y', axis: 'y', value: land.trueMean, color: COLORS.truth, label: `true = ${land.trueMean.toFixed(1)}` },
      ];
      ch.update('none');
    },

    _refreshReadouts() {
      mod._cards.reqN.set(String(mod.requiredN()));
      const pct = ((mod.n / N) * 100).toFixed(1);
      mod._cards.curN.set(`${mod.n} · ${pct}%`);
      if (mod._last) {
        const e = mod._last;
        mod._cards.est.set(e.mean.toFixed(2));
        mod._cards.moe.set(isFinite(e.moeAbs) ? `±${e.moeAbs.toFixed(2)} · ${(e.moeRel * 100).toFixed(1)}%` : '—');
        mod._cards.err.set(e.actualError.toFixed(2));
        mod._cards.post.set(mod._posterior().mean.toFixed(2));
      } else {
        ['est', 'moe', 'err'].forEach((k) => mod._cards[k].set('—'));
        mod._cards.post.set(st.mean.toFixed(2)); // prior only
      }
    },

    // Conjugate normal-normal posterior with known σ; prior = priorEqN pseudo-
    // observations at the IPCC default mean.
    _posterior() {
      const m = mod.priorEqN();
      const n = mod.n;
      const xbar = mod._last ? mod._last.mean : st.mean;
      const mean = (m * st.mean + n * xbar) / (m + n);
      const sd = st.sd / Math.sqrt(m + n);
      return { mean, sd };
    },

    // ---- simulation stepping (driven by app loop) ----
    addSamples(k) {
      if (mod.n >= N) return true;
      const target = Math.min(N, mod.n + Math.max(1, Math.floor(k)));
      for (let i = mod.n; i < target; i++) mod.mask[mod.order[i]] = 1;
      mod.n = target;
      mod._last = estimate(st.design, mod.order, mod.n, land, mod.z());
      mod._markDirty();

      // convergence point
      const z = mod.z();
      const e = mod._last;
      const ds = mod._conv.data.datasets;
      const lo = isFinite(e.moeAbs) ? e.mean - e.moeAbs : e.mean;
      const hi = isFinite(e.moeAbs) ? e.mean + e.moeAbs : e.mean;
      const post = mod._posterior();
      ds[0].data.push({ x: mod.n, y: lo });
      ds[1].data.push({ x: mod.n, y: hi });
      ds[2].data.push({ x: mod.n, y: post.mean - z * post.sd });
      ds[3].data.push({ x: mod.n, y: post.mean + z * post.sd });
      ds[4].data.push({ x: mod.n, y: e.mean });
      ds[5].data.push({ x: mod.n, y: post.mean });
      mod._conv.update('none');

      mod._refreshReadouts();
      // update the "now" marker on the MoE hero chart
      if (st.heroMode === 'moe') {
        const lines = mod._hero.options.plugins.referenceLines.lines;
        const nowLine = lines.find((l) => l.label === 'now');
        if (nowLine) { nowLine.value = mod.n; mod._hero.update('none'); }
      }
      return mod.n >= N;
    },

    reset() {
      mod.regenerate();
      mod._refreshHero();
      mod._refreshConv();
      mod._refreshReadouts();
      mod._markDirty();
    },

    done() { return mod.n >= N; },

    // ---- raster rendering ----
    _markDirty() { mod._reconN = -1; },

    _ensureRecon() {
      if (st.viewMode === 'true') return;
      if (mod._reconN === mod.n && mod._recon) return;
      const idx = [];
      for (let i = 0; i < mod.n; i++) idx.push(mod.order[i]);
      mod._recon = land.reconstruct(idx);
      mod._reconN = mod.n;
    },

    prepareFrame() { mod._ensureRecon(); },

    getCellColor(row, col) {
      const i = row * COLS + col;
      const ramp = RAMPS[ECOSYSTEMS[st.ecoKey].ramp];
      const span = (land.max - land.min) || 1;
      if (st.viewMode === 'true') {
        return rampColor(ramp, clamp01((land.truth[i] - land.min) / span));
      }
      if (st.viewMode === 'revealed') {
        if (mod.n === 0 || !mod._recon) return COLORS.beige;
        return rampColor(ramp, clamp01((mod._recon[i] - land.min) / span));
      }
      // error view
      if (mod.n === 0) return COLORS.beige;
      const err = Math.abs((mod._recon ? mod._recon[i] : 0) - land.truth[i]);
      return rampColor(ERROR_RAMP, clamp01(err / (2 * st.sd)));
    },

    sampledMask() { return mod.mask; },
  };

  mod.regenerate();
  return mod;
}
