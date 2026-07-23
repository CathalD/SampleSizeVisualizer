// Module — Sample size, precision & margin of error.
//
// Ties together: (1) the Cochran/UNFCCC sample-size curve (frequentist), and
// (2) a known "true" carbon map that four sampling designs progressively
// reveal, with a Bayesian prior (regional default, strength set by source) updating
// toward the truth as plots are collected.

import { slider, segmented, select, metricCard, el } from '../components/controls.js';
import { createChart, buildLegend } from '../components/chart-panel.js';
import { COLORS, RAMPS, ERROR_RAMP, rampColor, clamp01 } from '../colors.js';
import { ECOSYSTEMS, ECOSYSTEM_ORDER, PRIOR_MODES } from '../data/ecosystems.js';
import { Landscape } from '../simulation/landscape.js';
import { buildOrder, estimate, designComparison } from '../simulation/sampler.js';
import { zFor, cochranN, proportionN, moeAbs, moeProp } from '../simulation/stats.js';

const ROWS = 48, COLS = 48;

// Palette for the design-comparison chart (one colour per design).
const CMP = {
  random: '#6b6b76',            // grey
  systematicGrid: '#2d8a4e',    // green
  systematicLinear: '#854F0B',  // amber
  stratified: '#7F77DD',        // purple
};

export function create() {
  const st = {
    ecoKey: 'marsh',
    priorMode: 'default',  // 'default' (regional reference) | 'measured' (user-entered)
    design: 'stratified',
    paramType: 'mean',     // 'mean' (carbon stock) | 'proportion' (e.g. cover)
    p: 0.5,                // expected proportion (conservative default)
    confidence: 0.90,
    r: 0.10,               // margin of error (relative for mean, absolute for proportion)
    mean: ECOSYSTEMS.marsh.mean,
    sd: ECOSYSTEMS.marsh.sd,
    plotAreaHa: 0.05,      // ha per plot
    usablePct: 70,         // expected % of collected plots that yield usable data
    heroMode: 'moe',
    viewMode: 'true',
    speed: 12,             // samples / second when playing
  };
  const MIN_PER_STRATUM = 5; // workshop rule: at least 5 plots per stratum
  // Most partners can realistically collect up to ~50 plots, so the interactive
  // campaign and the n-axis charts focus on that range (rather than the full
  // 2304-cell population, which buried the convergence in a long flat tail).
  const COLLECT_CAP = 50;

  const land = new Landscape(ROWS, COLS);
  const N = land.n;

  const mod = {
    id: 'precision',
    title: 'Precision & margin of error',
    rows: ROWS, cols: COLS,
    maxN: COLLECT_CAP,   // interactive campaign cap (see COLLECT_CAP above)
    equation:
      'n = (z·CV / r)² / (1 + (n₀−1)/N) &nbsp;·&nbsp; E(n) = z·s/√n · √(1 − n/N) &nbsp;·&nbsp; N = A/a',
    callout:
      'Precision is expensive: halving the margin of error quadruples the plots (n ∝ 1/E²). ' +
      'Stratification is the biggest design lever where strata are real; otherwise plot count ' +
      'matters more than which design you pick. A prior — a regional default or your own data — ' +
      'steadies the estimate while n is still small.',
    state: st,

    // ---- derived quantities ----
    z() { return zFor(st.confidence); },
    cv() { return st.sd / st.mean; },
    plotAreaM2() { return st.plotAreaHa * 10000; },
    totalAreaHa() { return N * st.plotAreaHa; },
    requiredN() {
      if (st.paramType === 'proportion') {
        return Math.ceil(proportionN({ z: mod.z(), p: st.p, E: st.r, N }).n);
      }
      return Math.ceil(cochranN({ z: mod.z(), cv: mod.cv(), r: st.r, N }).n);
    },
    // Oversample so that, after attrition (lost/failed cores, non-response),
    // enough USABLE plots remain: collect ceil(required / usable-fraction).
    paddedN() {
      const usable = Math.max(0.01, st.usablePct / 100);
      return Math.ceil(mod.requiredN() / usable);
    },
    // Required n if the margin of error were halved — the "precision is
    // expensive" number (≈ 4× because n ∝ 1/E²).
    halfMarginN() {
      if (st.paramType === 'proportion') {
        return Math.ceil(proportionN({ z: mod.z(), p: st.p, E: st.r / 2, N }).n);
      }
      return Math.ceil(cochranN({ z: mod.z(), cv: mod.cv(), r: st.r / 2, N }).n);
    },
    // Proportional stratified allocation of the required n across the map's
    // strata: nₕ = ceil(max( (Nₕ/N)·n , MIN_PER_STRATUM )). Rounding up and the
    // per-stratum floor mean the strata usually sum to slightly more than n —
    // exactly the WWF-Canada calculator's behaviour (Sheet 2 / Step 5).
    allocation() {
      const total = mod.requiredN();
      const Nh = land.strataSizes();
      const rows = Nh.map((nh, h) => {
        const share = nh / N;
        const plots = Math.ceil(Math.max(share * total, MIN_PER_STRATUM));
        return { h, share, plots };
      });
      const sum = rows.reduce((s, r) => s + r.plots, 0);
      return { total, rows, sum };
    },
    priorEqN() { return PRIOR_MODES[st.priorMode].priorEqN; },

    // Data weight in the conjugate posterior: 0 with no plots, → 1 as n → ∞.
    // The prior's weight is the complement (1 − w), running 1 → 0.
    dataWeight() { return mod.n / (mod.n + mod.priorEqN()); },

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
      if (mod._cmp) mod._refreshCompare();
    },

    // ---- controls ----
    mountControls(container, ctrl) {
      const rebuild = () => { mod.regenerate(); mod._refreshHero(); mod._refreshConv(); mod._refreshReadouts(); mod._markDirty(); ctrl.redraw(); };
      const soft = () => { mod._refreshHero(); mod._refreshReadouts(); };

      const eSel = select({
        label: 'Ecosystem', value: st.ecoKey,
        options: ECOSYSTEM_ORDER.map((k) => ({ value: k, label: ECOSYSTEMS[k].label })),
        onChange: (v) => {
          st.ecoKey = v;
          // In default mode the mean/SD track the regional reference values; in
          // measured mode the user's entered values are kept.
          if (st.priorMode === 'default') {
            st.mean = ECOSYSTEMS[v].mean; st.sd = ECOSYSTEMS[v].sd;
            sMean.set(st.mean); sSd.set(st.sd);
          }
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
        label: 'Prior source', value: st.priorMode,
        options: [
          { value: 'default', label: PRIOR_MODES.default.label },
          { value: 'measured', label: PRIOR_MODES.measured.label },
        ],
        onChange: (v) => {
          st.priorMode = v;
          mod._applyModeUI();
          if (v === 'default') {
            st.mean = ECOSYSTEMS[st.ecoKey].mean; st.sd = ECOSYSTEMS[st.ecoKey].sd;
            sMean.set(st.mean); sSd.set(st.sd);
            rebuild();
          } else {
            mod._markDirty(); mod._refreshConv(); soft(); ctrl.redraw();
          }
        },
      }));
      mod._modeNote = document.createElement('p');
      mod._modeNote.className = 'hint-text';
      container.appendChild(mod._modeNote);

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

      container.appendChild(segmented({
        label: 'Parameter type', value: st.paramType,
        options: [
          { value: 'mean', label: 'Mean (carbon stock)' },
          { value: 'proportion', label: 'Proportion (cover)' },
        ],
        onChange: (v) => {
          st.paramType = v;
          mod._pRow.style.display = v === 'proportion' ? '' : 'none';
          if (mod._heroHead) mod._heroHead.style.display = v === 'proportion' ? 'none' : '';
          if (v === 'proportion') st.heroMode = 'moe';
          mod._setFooter();
          mod._refreshHero(); mod._refreshReadouts();
        },
      }));

      const sP = slider({
        label: 'Expected proportion p', min: 0.05, max: 0.95, step: 0.05, value: st.p,
        unit: '', format: (v) => v.toFixed(2),
        onInput: (v) => { st.p = v; soft(); },
      });
      mod._pRow = sP.root;
      mod._pRow.style.display = st.paramType === 'proportion' ? '' : 'none';
      container.appendChild(mod._pRow);

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

      // Lock mean/SD to the regional reference in default mode; unlock for measured.
      mod._applyModeUI = () => {
        const measured = st.priorMode === 'measured';
        sMean.input.disabled = !measured;
        sSd.input.disabled = !measured;
        sMean.root.classList.toggle('ctrl-locked', !measured);
        sSd.root.classList.toggle('ctrl-locked', !measured);
        if (mod._modeNote) mod._modeNote.textContent = PRIOR_MODES[st.priorMode].note;
      };

      container.appendChild(slider({
        label: 'Plot area', min: 0.01, max: 1, step: 0.01, value: st.plotAreaHa,
        unit: 'ha', format: (v) => `${v.toFixed(2)} (${(v * 10000).toFixed(0)} m²)`,
        onInput: (v) => { st.plotAreaHa = v; soft(); },
      }).root);

      container.appendChild(slider({
        label: 'Expected usable samples', min: 40, max: 100, step: 5, value: st.usablePct,
        unit: '%', format: (v) => v.toFixed(0),
        onInput: (v) => { st.usablePct = v; soft(); },
      }).root);
      container.appendChild(el('p', { class: 'hint-text',
        text: 'Pad for attrition: cores can be lost, short, or fail QC. "Collect" ' +
              'below = required ÷ usable %.' }));

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

      mod._applyModeUI();
    },

    // ---- readouts ----
    mountReadouts(container) {
      mod._cards = {
        reqN: metricCard('Required n', 'Cochran, for target'),
        padN: metricCard('Collect (padded)', 'after attrition'),
        halfN: metricCard('Halve the margin', 'n for E/2 (≈4×)'),
        curN: metricCard('Collected n', '% of area'),
        est: metricCard('Estimate x̄', 'kg C m⁻²'),
        moe: metricCard('Margin of error', '± / %'),
        err: metricCard('Actual error', '|x̄ − true|'),
        post: metricCard('Posterior mean', 'prior→data'),
        weight: metricCard('Data weight w', 'n/(n+m) · prior 1−w'),
        bayes: metricCard('Prior helps by', 'sample err − post err'),
      };
      Object.values(mod._cards).forEach((c) => container.appendChild(c.root));

      // Stratified allocation table (shown only for the stratified design).
      mod._alloc = el('div', { class: 'alloc-panel' });
      container.appendChild(mod._alloc);
    },

    _refreshAlloc() {
      const box = mod._alloc;
      if (!box) return;
      if (st.design !== 'stratified' || land.nStrata < 2 || st.paramType !== 'mean') {
        box.innerHTML = '';
        box.style.display = 'none';
        return;
      }
      box.style.display = '';
      const a = mod.allocation();
      const rowsHtml = a.rows.map((r) =>
        `<tr><td>Stratum ${r.h + 1}</td><td>${(r.share * 100).toFixed(0)}%</td>` +
        `<td>${r.plots}</td></tr>`).join('');
      box.innerHTML =
        `<div class="alloc-title">Stratified allocation (min ${MIN_PER_STRATUM}/stratum)</div>` +
        `<table class="alloc-table"><thead><tr><th>Stratum</th><th>Area</th>` +
        `<th>Plots</th></tr></thead><tbody>${rowsHtml}` +
        `<tr class="alloc-sum"><td>Total</td><td>—</td><td>${a.sum}</td></tr></tbody></table>` +
        `<div class="alloc-note">Proportional to area, rounded up, ≥ ${MIN_PER_STRATUM} each — ` +
        `so the total (${a.sum}) sits at or above the pooled n (${a.total}).</div>`;
    },

    // ---- charts ----
    mountCharts(container) {
      // Hero chart (sample size vs precision) with an axis toggle.
      const heroHead = document.createElement('div');
      heroHead.className = 'chart-toolbar';
      mod._heroHead = heroHead;
      if (st.paramType === 'proportion') heroHead.style.display = 'none';
      heroHead.appendChild(segmented({
        label: 'x-axis', value: st.heroMode,
        options: [
          { value: 'moe', label: 'Margin of error vs n' },
          { value: 'reqN_moe', label: 'n vs margin' },
          { value: 'reqN_cv', label: 'n vs CV' },
          { value: 'reqN_conf', label: 'n vs confidence' },
          { value: 'reqN_area', label: 'n vs area' },
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

      // Design-comparison chart: actual error vs n for all four designs on THIS
      // landscape, so you can see which design wins for the current ecosystem.
      container.appendChild(el('p', { class: 'chart-caption',
        text: 'Which design wins here? Mean error vs n on this ecosystem (known truth).' }));
      const legCmp = document.createElement('div');
      legCmp.className = 'chart-legend';
      buildLegend(legCmp, [
        { label: 'Random', color: CMP.random },
        { label: 'Grid', color: CMP.systematicGrid },
        { label: 'Transect', color: CMP.systematicLinear },
        { label: 'Stratified', color: CMP.stratified },
      ]);
      const wrapCmp = document.createElement('div');
      wrapCmp.className = 'chart-wrap';
      const cCmp = document.createElement('canvas');
      wrapCmp.appendChild(cCmp);
      container.appendChild(legCmp);
      container.appendChild(wrapCmp);
      mod._cmp = createChart(cCmp, {
        type: 'line',
        data: {
          datasets: [
            { label: 'Random', data: [], borderColor: CMP.random, borderWidth: 2, pointRadius: 0 },
            { label: 'Grid', data: [], borderColor: CMP.systematicGrid, borderWidth: 2, pointRadius: 0 },
            { label: 'Transect', data: [], borderColor: CMP.systematicLinear, borderWidth: 2, pointRadius: 0 },
            { label: 'Stratified', data: [], borderColor: CMP.stratified, borderWidth: 2.5, pointRadius: 0 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, referenceLines: { lines: [] } },
          scales: {
            x: { type: 'linear', title: { display: true, text: 'sample size n' } },
            y: { type: 'linear', min: 0, title: { display: true, text: 'mean error |x̄ − true| (kg C m⁻²)' } },
          },
        },
      });

      mod._refreshHero();
      mod._refreshConv();
      mod._refreshCompare();
    },

    _refreshCompare() {
      if (!mod._cmp) return;
      const ds = mod._cmp.data.datasets;
      if (st.paramType !== 'mean') {         // comparison is about the mean estimate
        ds.forEach((d) => (d.data = []));
        mod._cmp.update('none');
        return;
      }
      const { nGrid, curves } = designComparison(land, mod.z(),
        { maxN: COLLECT_CAP, points: 24, seeds: 8 });
      const keys = ['random', 'systematicGrid', 'systematicLinear', 'stratified'];
      keys.forEach((k, i) => { ds[i].data = nGrid.map((n, gi) => ({ x: n, y: curves[k][gi] })); });
      mod._cmp.options.scales.x.min = 0;
      mod._cmp.options.scales.x.max = COLLECT_CAP;
      mod._cmp.update('none');
    },

    _setFooter() {
      const eqEl = document.getElementById('footer-eq');
      if (!eqEl) return;
      eqEl.innerHTML = st.paramType === 'proportion'
        ? 'n = N·p(1−p) / [ (N−1)·(E/z)² + p(1−p) ] &nbsp;·&nbsp; conservative p = 0.5 &nbsp;·&nbsp; N = A/a'
        : mod.equation;
    },

    _refreshHero() {
      const z = mod.z(), cv = mod.cv();
      const ch = mod._hero;
      // reset the n-axis window each refresh (only the 'moe' mode pins it)
      ch.options.scales.x.min = undefined;
      ch.options.scales.x.max = undefined;
      let data = [], refLines = [], xTitle, yTitle, legend;
      if (st.heroMode === 'moe') {
        const isProp = st.paramType === 'proportion';
        // Show up to a little past the required n so the curve visibly reaches
        // the target, capped so it never becomes a long flat tail.
        const viewMax = Math.min(150, Math.max(COLLECT_CAP, Math.ceil(mod.requiredN() * 1.15)));
        const step = Math.max(1, Math.floor(viewMax / 120));
        for (let n = 1; n <= viewMax; n += step) {
          const y = isProp
            ? moeProp({ z, p: st.p, n, N }) * 100
            : (moeAbs({ z, sigma: st.sd, n, N }) / st.mean) * 100;
          data.push({ x: n, y });
        }
        ch.data.datasets[0].borderColor = COLORS.moe;
        ch.options.scales.x.min = 0;
        ch.options.scales.x.max = viewMax;
        ch.options.scales.y.max = Math.min(200, st.r * 100 * 5);
        xTitle = 'sample size n';
        yTitle = isProp ? 'margin of error (proportion, ± % points)' : 'margin of error (% of mean)';
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
      } else if (st.heroMode === 'reqN_moe') {
        const isProp = st.paramType === 'proportion';
        for (let rr = 0.02; rr <= 0.4001; rr += 0.01) {
          const y = isProp
            ? Math.ceil(proportionN({ z, p: st.p, E: rr, N }).n)
            : Math.ceil(cochranN({ z, cv, r: rr, N }).n);
          data.push({ x: rr * 100, y });
        }
        ch.options.scales.y.max = undefined;
        xTitle = 'target margin of error (% of mean)'; yTitle = 'required n';
        ch.data.datasets[0].borderColor = COLORS.requiredN;
        refLines = [{ scaleID: 'x', axis: 'x', value: st.r * 100, color: COLORS.target, label: `target ${(st.r * 100).toFixed(0)}%` }];
        legend = [{ label: 'Required n', color: COLORS.requiredN }, { label: 'Current target', color: COLORS.target, dash: true }];
      } else if (st.heroMode === 'reqN_conf') {
        const isProp = st.paramType === 'proportion';
        for (let cf = 0.50; cf <= 0.9991; cf += 0.01) {
          const zz = zFor(cf);
          const y = isProp
            ? Math.ceil(proportionN({ z: zz, p: st.p, E: st.r, N }).n)
            : Math.ceil(cochranN({ z: zz, cv, r: st.r, N }).n);
          data.push({ x: cf * 100, y });
        }
        ch.options.scales.y.max = undefined;
        xTitle = 'confidence level (%)'; yTitle = 'required n';
        ch.data.datasets[0].borderColor = COLORS.requiredN;
        refLines = [{ scaleID: 'x', axis: 'x', value: st.confidence * 100, color: COLORS.target, label: `${(st.confidence * 100).toFixed(0)}%` }];
        legend = [{ label: 'Required n', color: COLORS.requiredN }, { label: 'Current level', color: COLORS.target, dash: true }];
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
      ch.options.scales.x.min = 0;
      ch.options.scales.x.max = COLLECT_CAP;   // focus on the realistic campaign range
      ch.options.plugins.referenceLines.lines = [
        { scaleID: 'y', axis: 'y', value: land.trueMean, color: COLORS.truth, label: `true = ${land.trueMean.toFixed(1)}` },
      ];
      ch.update('none');
    },

    _refreshReadouts() {
      mod._cards.reqN.set(String(mod.requiredN()));
      mod._cards.padN.set(`${mod.paddedN()} · @${st.usablePct}%`);
      mod._cards.halfN.set(`${mod.halfMarginN()} · ${(mod.halfMarginN() / Math.max(1, mod.requiredN())).toFixed(1)}×`);
      const pct = ((mod.n / N) * 100).toFixed(1);
      mod._cards.curN.set(`${mod.n} · ${pct}%`);
      const w = mod.dataWeight();
      mod._cards.weight.set(`${w.toFixed(2)} · prior ${(1 - w).toFixed(2)}`);
      if (mod._last) {
        const e = mod._last;
        mod._cards.est.set(e.mean.toFixed(2));
        mod._cards.moe.set(isFinite(e.moeAbs) ? `±${e.moeAbs.toFixed(2)} · ${(e.moeRel * 100).toFixed(1)}%` : '—');
        mod._cards.err.set(e.actualError.toFixed(2));
        const postMean = mod._posterior().mean;
        mod._cards.post.set(postMean.toFixed(2));
        // How much the prior improves the estimate right now (sample vs posterior
        // distance to the truth): positive early, → 0 as data takes over.
        const gain = e.actualError - Math.abs(postMean - land.trueMean);
        mod._cards.bayes.set(`${gain >= 0 ? '+' : ''}${gain.toFixed(2)}`);
      } else {
        ['est', 'moe', 'err'].forEach((k) => mod._cards[k].set('—'));
        mod._cards.post.set(st.mean.toFixed(2)); // prior only
        mod._cards.bayes.set('—');
      }
      mod._refreshAlloc();
    },

    // Conjugate normal-normal posterior with known σ; prior = priorEqN pseudo-
    // observations at the regional-default mean.
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
      if (mod.n >= COLLECT_CAP) return true;
      const target = Math.min(COLLECT_CAP, mod.n + Math.max(1, Math.floor(k)));
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
      return mod.n >= COLLECT_CAP;
    },

    reset() {
      mod.regenerate();
      mod._refreshHero();
      mod._refreshConv();
      mod._refreshReadouts();
      mod._markDirty();
    },

    done() { return mod.n >= COLLECT_CAP; },

    // ---- raster rendering ----
    _markDirty() { mod._reconN = -1; },

    _ensureRecon() {
      if (st.viewMode === 'true') return;
      if (mod._reconN === mod.n && mod._blended) return;
      const idx = [];
      for (let i = 0; i < mod.n; i++) idx.push(mod.order[i]);
      mod._recon = land.reconstruct(idx);
      // Posterior map: sampled cells show the measured truth; unsampled cells
      // blend the prior mean with the data reconstruction by the data weight w,
      // so at n = 0 the map is the flat prior and → the data map as n → ∞.
      const w = mod.dataWeight();
      const prior = st.mean;
      const blended = new Float64Array(land.n);
      for (let i = 0; i < land.n; i++) {
        blended[i] = mod.mask[i] ? land.truth[i] : (1 - w) * prior + w * mod._recon[i];
      }
      mod._blended = blended;
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
      // 'revealed' shows the posterior map (flat prior → data as w grows);
      // 'error' shows that posterior map's error against the truth.
      const est = mod._blended ? mod._blended[i] : st.mean;
      if (st.viewMode === 'revealed') {
        return rampColor(ramp, clamp01((est - land.min) / span));
      }
      const err = Math.abs(est - land.truth[i]);
      return rampColor(ERROR_RAMP, clamp01(err / (2 * st.sd)));
    },

    sampledMask() { return mod.mask; },
  };

  mod.regenerate();
  return mod;
}
