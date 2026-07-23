# Sample Size Visualizer

Link to app - https://cathald.github.io/SampleSizeVisualizer/

An interactive, browser-based educational tool for exploring how **sample size**
controls the **precision** and **margin of error** of an ecosystem carbon-stock
estimate — and how the **sampling design** changes how quickly a known landscape
is revealed. Vanilla HTML/CSS/JS + [Chart.js](https://www.chartjs.org/) (CDN),
no build step. Styled to match the companion Carbon Accumulation tool.

## Scientific basis

**Sample size (Cochran / UNFCCC area-based).** For a **mean** at relative
precision `r` (margin of error as a fraction of the mean) and confidence `1−α`:

```
n₀ = (z · CV / r)² = z²·σ²/E²,   n = n₀ / (1 + (n₀ − 1)/N),   N = A / a
E(n) = z · s/√n · √(1 − n/N)
```

The finite-population-correction form `n = n₀/(1 + (n₀−1)/N)` matches the UNFCCC
CDM standard and the paired Blue Carbon GEE sampling tool exactly (verified
numerically: with a common z, the two agree to the decimal).

For estimating a **proportion** (e.g. % cover) the tool offers the UNFCCC
proportion formula, with `p = 0.5` the conservative default:

```
n = N · p(1−p) / [ (N − 1)·(E/z)² + p(1−p) ]
```

`z` is the exact normal quantile (e.g. 1.645 at 90%, as the CDM standard
specifies). The GEE tool uses a cubic polynomial approximation of z that agrees
to within ~1% up to 95% confidence but degrades badly beyond it (it cannot
exceed ≈2.41), so above 95% this tool is the more accurate of the two.

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
- **Grid** — systematic grid via a low-discrepancy (R2) sequence, so every
  *partial* grid is evenly spread across the map (not clustered), which is what
  lets a systematic design perform well on a gradient.
- **Stratified** — proportional allocation across the map's strata; uses the
  pooled stratified estimator, which removes between-strata variance and so
  reaches a given precision with fewer plots.

The estimate `x̄ ± z·SE` is computed with each design's variance formula
(systematic designs use the SRS approximation), and because the truth is known
the tool also shows the **actual error** `|x̄ − μ_true|` — so you can see when a
design's confidence interval is well-calibrated and when it is not.

**Prior updating (Bayesian).** The prior on the mean is `μ ~ N(μ₀, σ²/m)`, with
two sources selectable via the **Prior source** control:

- **Regional default** — μ₀, σ are the locked Canadian regional reference values
  for the chosen ecosystem; a moderate-strength prior (`m ≈ 4` equivalent plots).
- **Your measured data** — you enter your own measured mean/SD as the prior; a
  stronger prior (`m ≈ 12`), since a site measurement is more trusted.

The conjugate posterior mean `(m·μ₀ + n·x̄)/(m + n)` shifts from the prior toward
the sample mean (→ the true mean) as plots accumulate, and its credible interval
narrows.

The **data weight** `w = n/(n + m)` is shown live: 0 with no plots (pure prior)
and → 1 as n → ∞ (pure data); the prior's weight is `1 − w`. A stronger prior
makes w climb more slowly. The **Revealed** map is the posterior map — at n = 0
it is the flat prior; unsampled cells blend the prior mean with the data
reconstruction by w, while sampled cells show the measured value — so the prior
visibly updates toward the true map as samples come in.

### Ecosystem reference values (Canada)

Shown in kg C m⁻² with the spatial SD as ±. **Coastal** ecosystems use Canadian
coastal measurements (BC and, where available, the East coast); **terrestrial**
soil carbon uses Sothe et al. (2022), the 250 m SOC map of Canada. Depths and
methods differ between sources, so treat these as teaching reference points, not
a harmonised inventory — swap in your own site values in the tool.

| Ecosystem | Mean (kg C m⁻²) | ± SD | Source |
|---|---|---|---|
| Tidal marsh | 10.0 | 5.0 | Bay of Fundy salt marsh (Connor et al. 2001; Chmura) |
| Seagrass / eelgrass | 1.3 | 0.5 | Pacific Canada eelgrass, Clayoquot Sound BC (Postlethwaite et al. 2018) |
| Forest (soil C) | 8.7 | 3.0 | Canadian boreal forest soil to ~1 m (Sothe et al. 2022) |
| Mineral wetlands (soil C) | 20.0 | 9.0 | Canadian mineral wetlands, approximate (Sothe et al. 2022) |
| Peatlands (soil C) | 140.0 | 70.0 | Canadian peatlands, whole peat column (Sothe et al. 2022) |
| Grasslands (soil C) | 6.0 | 2.0 | Canadian prairie grassland soil (Sothe et al. 2022) |

> Full per-ecosystem sources are in `data/ecosystems.js`. Pacific-coast eelgrass
> sediment stocks are genuinely low; Atlantic (Nova Scotia) sediment stocks are
> less quantified. Terrestrial values are read from the Sothe et al. (2022)
> Canadian SOC map — read your own region off the map for a local value.

**Reference:** Sothe, C., Gonsamo, A., Arabian, J., Kurz, W. A., Finkelstein, S. A.,
& Snider, J. (2022). *Large Soil Carbon Storage in Terrestrial Ecosystems of Canada.*
Global Biogeochemical Cycles 36, e2021GB007213.

## Teaching views & workshop alignment

This tool doubles as the interactive companion to the **Project Planning** part of
the Blue Carbon Eelgrass Workshop. Alongside the sample-size number it shows:

- **Change a variable, watch *n* move.** The hero chart plots required *n* against
  the **margin of error**, **confidence level**, **CV**, or **total area** — so the
  cost of each choice is visible (halving the margin ≈ 4× the plots).
- **Which design wins here?** A comparison chart runs all four designs on the same
  known map and plots their actual error vs *n*. The honest lesson: **stratification
  is the biggest lever where strata are real; for a well-mixed site, plot count
  matters more than which design you pick.**
- **Why a prior helps.** The convergence chart overlays the frequentist estimate and
  the Bayesian posterior; the *Prior helps by* read-out shows how much closer to the
  truth the posterior sits while *n* is small (→ 0 as data takes over).
- **Stratified allocation** (mean + stratified design): proportional shares with a
  **minimum of 5 plots per stratum**, rounded up — mirroring the WWF-Canada calculator
  (Sheet 2 / Step 5), so the strata total sits at or above the pooled *n*.
- **Attrition padding**: an *expected usable %* input reports how many to **collect**
  so enough usable plots remain (the workshop's ~70% → oversample rule; e.g. a
  CV-0.5 site's required 66 → collect ~95).
- **Realistic scale**: the interactive campaign and the *n*-axis charts focus on
  **~50 plots** — the most many partners can collect — so you can watch the estimate
  converge instead of staring at a long flat tail.

### Notation crosswalk (UNFCCC / CDM ↔ workshop)

| This tool | Workshop / UNFCCC | Meaning |
|---|---|---|
| `z` | `Z_{α/2}` | normal quantile for the confidence level |
| `r` (target precision) | `E` / `e_abs` | margin of error, relative to the mean |
| `s` (spatial SD) | `SD` | standard-deviation prior |
| `CV = s/x̄` | `CV` | coefficient of variation |
| `N = A/a` | `N` | number of possible plots (area ÷ plot area) |
| `n` | `n` | plots to collect |

**Prior source, not IPCC tiers.** The prior is framed simply as **Regional default**
vs **Your measured data**, rather than IPCC Tier 2/3 labels — which the workshop
spreadsheet applies in the inverted order and which caused confusion. Regional
defaults are the Canadian reference values above.

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
