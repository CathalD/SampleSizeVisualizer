// Canadian carbon-stock reference values, per ecosystem.
//
// Values are in kg C m⁻² (× 0.1 to convert from Mg C ha⁻¹). The ± is treated as
// the SPATIAL standard deviation σ (pixel-to-pixel variability) that drives
// Cochran's s, the CV, and the true-map texture. Depths and methods differ
// between sources, so treat these as teaching reference points, not a
// harmonised inventory — swap in your own site values in the tool.
//
// Coastal ecosystems use Canadian coastal measurements (BC and, where available,
// the East coast). Terrestrial soil carbon uses Sothe et al. (2022), "Large Soil
// Carbon Storage in Terrestrial Ecosystems of Canada", Global Biogeochemical
// Cycles 36, e2021GB007213, the state-of-the-art 250 m SOC map of Canada.
//
// `structure` sets the relative weight of each generative component of the true
// carbon map (see simulation/landscape.js). `strata` is the number of discrete
// zones used by both the map generator and stratified sampling.

export const ECOSYSTEMS = {
  marsh: {
    label: 'Tidal marsh',
    mean: 10.0, sd: 5.0,          // ~100 ± 50 Mg C ha⁻¹ (CV 0.5)
    ramp: 'marsh',
    structure: { gradient: 0.4, strata: 0.75, patch: 0.4, nugget: 0.2 },
    strata: 2,
    source: 'Bay of Fundy salt marsh (Atlantic Canada) — carbon density ≈ 0.022–0.026 g C cm⁻³ ' +
            '(Connor et al. 2001; Chmura et al.); ~10 kg C m⁻² over the rooting zone.',
    note: 'High vs low marsh — stratified sampling gains the most.',
  },
  seagrass: {
    label: 'Seagrass / eelgrass',
    mean: 1.3, sd: 0.5,           // ~13 ± 5 Mg C ha⁻¹ (CV 0.38)
    ramp: 'seagrass',
    structure: { gradient: 0.1, strata: 0.25, patch: 0.75, nugget: 0.5 },
    strata: 2,
    source: 'Pacific Canada eelgrass, Clayoquot Sound BC — 1.34 ± 0.48 kg C m⁻² ' +
            '(Postlethwaite et al. 2018). Genuinely low vs global means; Atlantic ' +
            '(Nova Scotia) sediment stocks are less quantified.',
    note: 'Patchy beds over bare sand — low but variable; stratify beds vs sand.',
  },
  forest: {
    label: 'Forest (soil C)',
    mean: 8.7, sd: 3.0,           // ~87 ± 30 Mg C ha⁻¹ soil to ~1 m (CV 0.34)
    ramp: 'forest',
    structure: { gradient: 0.3, strata: 0.1, patch: 0.5, nugget: 0.4 },
    strata: 1,
    source: 'Canadian boreal forest soil organic carbon to ~1 m ≈ 87 Mg C ha⁻¹ ' +
            '(Sothe et al. 2022; boreal soil-C syntheses).',
    note: 'Fairly homogeneous — all designs converge at a similar rate.',
  },
  mineralWetland: {
    label: 'Mineral wetlands (soil C)',
    mean: 20.0, sd: 9.0,          // ~200 ± 90 Mg C ha⁻¹ (CV 0.45), approximate
    ramp: 'wetland',
    structure: { gradient: 0.5, strata: 0.35, patch: 0.6, nugget: 0.3 },
    strata: 2,
    source: 'Canadian mineral (non-peat) wetlands — approximate, from the Sothe et al. ' +
            '(2022) SOC map; read your region off the map for a local value.',
    note: 'Moderate patchiness plus a gradient.',
  },
  peatland: {
    label: 'Peatlands (soil C)',
    mean: 140.0, sd: 70.0,        // ~1400 ± 700 Mg C ha⁻¹, whole peat column (CV 0.5)
    ramp: 'peat',
    structure: { gradient: 0.85, strata: 0.15, patch: 0.4, nugget: 0.15 },
    strata: 1,
    source: 'Canadian peatlands (e.g. Hudson & James Bay Lowlands) — very large SOC over the ' +
            'whole peat column (Sothe et al. 2022 highlight forested peatlands on the boreal shield).',
    note: 'Depth-driven gradient — even coverage (grid/transect) maps it best.',
  },
  grassland: {
    label: 'Grasslands (soil C)',
    mean: 6.0, sd: 2.0,           // ~60 ± 20 Mg C ha⁻¹ soil to ~1 m (CV 0.33)
    ramp: 'grass',
    structure: { gradient: 0.6, strata: 0.4, patch: 0.4, nugget: 0.3 },
    strata: 2,
    source: 'Canadian prairie grassland soil organic carbon (Sothe et al. 2022; ' +
            '~42 Mg C ha⁻¹ to 30 cm, higher to 1 m).',
    note: 'High vs low meadow — gradient with mild stratification.',
  },
};

export const ECOSYSTEM_ORDER = [
  'marsh', 'seagrass', 'forest', 'mineralWetland', 'peatland', 'grassland',
];

// Two ways to set the Bayesian prior on the MEAN:
//   'default'  — the ecosystem's regional reference mean/SD above (locked); a
//                moderate-strength prior.
//   'measured' — your own measured mean/SD, entered by hand; a stronger prior
//                (you measured it, so trust it more).
// Prior strength is an equivalent number of pseudo-observations at the prior
// mean; τ₀ = σ / √priorEqN.
export const PRIOR_MODES = {
  default: {
    label: 'Regional default', priorEqN: 4,
    note: 'Canadian regional reference mean/SD (locked).',
  },
  measured: {
    label: 'Your measured data', priorEqN: 12,
    note: 'Enter your own measured mean/SD as the prior.',
  },
};
