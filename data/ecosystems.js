// IPCC-style Tier 2/3 ecosystem defaults.
//
// Source values were supplied in Mg C ha⁻¹ ± Mg C ha⁻¹ and converted to
// kg C m⁻² by ×0.1 (1 Mg ha⁻¹ = 1000 kg / 10 000 m² = 0.1 kg m⁻²).
// The ± is treated here as the SPATIAL standard deviation σ (pixel-to-pixel
// variability), which drives Cochran's s, the CV, and the true-map texture.
// Uncertainty about the *mean* (the Bayesian prior) is a separate, smaller
// quantity derived from the Tier selector — see TIERS below.
//
// `structure` sets the relative weight of each generative component of the
// true carbon map (see simulation/landscape.js). Weights are normalised
// internally; only their ratios matter. `strata` is the number of discrete
// zones used by BOTH the map generator and stratified sampling.

export const ECOSYSTEMS = {
  marsh: {
    label: 'Tidal marsh',
    mean: 9.1, sd: 6.0,            // kg C m⁻²  (91 ± 60 Mg C ha⁻¹)
    ramp: 'marsh',
    // High vs low marsh: strong discrete strata + elevation gradient.
    structure: { gradient: 0.4, strata: 0.75, patch: 0.4, nugget: 0.2 },
    strata: 2,
    note: 'High vs low marsh — stratified sampling gains the most.',
  },
  seagrass: {
    label: 'Seagrass / eelgrass',
    mean: 12.0, sd: 6.0,          // 120 ± 60 Mg C ha⁻¹  →  CV 0.5
    ramp: 'seagrass',
    // Patchy beds over bare sand: patch-dominated with a high nugget.
    structure: { gradient: 0.1, strata: 0.25, patch: 0.75, nugget: 0.5 },
    strata: 2,
    // Matches the eelgrass planning example in the Blue Carbon Eelgrass Workshop
    // (Part 2): ~120 ± 60 Mg C ha⁻¹ (CV 0.5), WWF-Canada regional carbon map.
    // Real eelgrass sediment carbon varies widely between meadows — see the
    // workshop's Part 4 (Röhr et al. 2018; Postlethwaite et al. 2018).
    source: 'WWF-Canada regional carbon map — eelgrass planning example (workshop Part 2)',
    note: 'Patchy beds over bare sand — stratify beds vs sand; high variance needs more plots.',
  },
  forest: {
    label: 'Forest',
    mean: 13.0, sd: 3.5,          // 130 ± 35
    ramp: 'forest',
    // Fairly homogeneous with small gaps: designs converge similarly.
    structure: { gradient: 0.3, strata: 0.1, patch: 0.5, nugget: 0.4 },
    strata: 1,
    note: 'Fairly homogeneous — all designs converge at a similar rate.',
  },
  mineralWetland: {
    label: 'Mineral wetlands',
    mean: 20.0, sd: 8.5,          // 200 ± 85
    ramp: 'wetland',
    structure: { gradient: 0.5, strata: 0.35, patch: 0.6, nugget: 0.3 },
    strata: 2,
    note: 'Moderate patchiness plus a gradient.',
  },
  peatland: {
    label: 'Peatlands',
    mean: 210.0, sd: 100.0,       // 2100 ± 1000
    ramp: 'peat',
    // Depth-driven smooth gradient: systematic grid/linear far outperform random.
    structure: { gradient: 0.85, strata: 0.15, patch: 0.4, nugget: 0.15 },
    strata: 1,
    note: 'Depth-driven gradient — systematic designs win over random.',
  },
  grassland: {
    label: 'Grasslands',
    mean: 16.0, sd: 4.5,          // 160 ± 45
    ramp: 'grass',
    // High vs low meadow: gradient plus mild strata.
    structure: { gradient: 0.6, strata: 0.4, patch: 0.4, nugget: 0.3 },
    strata: 2,
    note: 'High vs low meadow — gradient with mild stratification.',
  },
};

export const ECOSYSTEM_ORDER = [
  'marsh', 'seagrass', 'forest', 'mineralWetland', 'peatland', 'grassland',
];

// Two ways to set the Bayesian prior on the MEAN:
//   'default'  — Tier 2 IPCC regional defaults (mean/SD from the table above,
//                locked); a moderate-strength prior.
//   'measured' — Tier 3 site-specific measured data, entered by the user; a
//                stronger prior (you measured it).
// Prior strength is an equivalent number of pseudo-observations at the prior
// mean; τ₀ = σ / √priorEqN.
export const PRIOR_MODES = {
  default: {
    label: 'Tier 2 · default', priorEqN: 4,
    note: 'IPCC regional default mean/SD (locked).',
  },
  measured: {
    label: 'Tier 3 · measured', priorEqN: 12,
    note: 'Enter your own measured mean/SD as the prior.',
  },
};
