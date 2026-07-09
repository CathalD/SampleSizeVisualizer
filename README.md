# Sample Size Visualizer

Link to app - https://cathald.github.io/SampleSizeVisualizer/

An interactive, browser-based educational tool for exploring how **sample size**
controls the **precision** and **margin of error** of an ecosystem carbon-stock
estimate — and how the **sampling design** changes how quickly a known landscape
is revealed. Vanilla HTML/CSS/JS + [Chart.js](https://www.chartjs.org/) (CDN),
no build step. Styled to match the companion Carbon Accumulation tool.

## Scientific basis

**Sample size (Cochran / UNFCCC area-based).** For a mean at relative precision
`r` (margin of error as a fraction of the mean) and confidence `1−α`:

```
n₀ = (z · CV / r)²,   n = n₀ / (1 + n₀/N),   N = A / a
E(n) = z · s/√n · √(1 − n/N)
```

- `z` — normal quantile for the confidence level (two-sided). A normal rather
  than Student-t quantile is used; for the plot counts and the very high
  confidence levels offered (up to 99.9999%) the difference is negligible.
- `CV = s/x̄` — coefficient of variation; `s` the spatial SD.
- `N = A/a` — number of possible plots (total area ÷ plot area). The finite
  population correction drives `E → 0` as sampling approaches a full census.

**A known landscape, progressively revealed.** Each ecosystem has a fixed
"true" carbon map (a seeded field = gradient + discrete strata + autocorrelated
patches + nugget, calibrated to the chosen mean and SD). Four sampling designs
reveal it differently:

- **Random** — simple random plots.
- **Transect** — parallel systematic lines (centre-outward).
- **Grid** — systematic grid, densified coarse→fine.
- **Stratified** — proportional allocation across the map's strata; uses the
  pooled stratified estimator, which removes between-strata variance and so
  reaches a given precision with fewer plots.

The estimate `x̄ ± z·SE` is computed with each design's variance formula
(systematic designs use the SRS approximation), and because the truth is known
the tool also shows the **actual error** `|x̄ − μ_true|` — so you can see when a
design's confidence interval is well-calibrated and when it is not.

**Prior updating (Bayesian).** The IPCC Tier default is a prior on the mean,
`μ ~ N(μ₀, σ²/m)`, where the Tier sets the prior strength `m` (equivalent
plots: Tier 1 ≈ 1, Tier 2 ≈ 4, Tier 3 ≈ 12). The conjugate posterior mean
`(m·μ₀ + n·x̄)/(m + n)` shifts from the IPCC default toward the sample mean
(→ the true mean) as plots accumulate, and its credible interval narrows.

### Ecosystem defaults

Supplied in Mg C ha⁻¹ ± Mg C ha⁻¹ and converted to kg C m⁻² (×0.1). The ± is
treated as the **spatial SD** (σ) driving heterogeneity and Cochran's `s`;
prior uncertainty about the mean is separate and set by the Tier.

| Ecosystem | Mean (kg C m⁻²) | ± SD | Spatial character |
|---|---|---|---|
| Tidal marsh | 9.1 | 6.0 | high/low marsh strata |
| Seagrass | 10.8 | 9.0 | patchy beds + bare sand |
| Forest | 13.0 | 3.5 | fairly homogeneous |
| Mineral wetlands | 20.0 | 8.5 | patchiness + gradient |
| Peatlands | 210.0 | 100.0 | depth-driven gradient |
| Grasslands | 16.0 | 4.5 | high/low meadow |

> The mean/SD values are placeholders in the shape of IPCC Tier 2/3 defaults —
> replace them in `data/ecosystems.js` with sourced values as needed.

## Running locally

Open `index.html`, or serve the folder (ES modules may be blocked on `file://`):

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## Deploying to GitHub Pages

Relative paths and a `.nojekyll` file are included. Push, then **Settings →
Pages** → select the branch and root `/`. Served at
`https://<user>.github.io/<repo>/`.

## Licence

MIT.
