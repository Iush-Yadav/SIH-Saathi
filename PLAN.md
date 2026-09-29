# SIH 2026 decision and SIH26080 solution plan

Prepared 29 September 2026. This is a build plan and a judgment about execution risk, not a prediction of the SIH result. The supplied SIH26080 summary and the independent SIH Buddy pages are the working briefs; confirm the final wording and theme in the official SIH portal before submission. The official portal did not allow an automated read during this review. SIH Buddy labels SIH26080 “Disaster Management,” while the supplied summary says “Smart Automation / Disaster Management.”

## 1. Decision: SIH26003 versus SIH26080

| Criterion | SIH26003: dementia support | SIH26080: rainfall correction |
| --- | --- | --- |
| Main deliverable | Tablet app: adaptive games, reminders, voice, offline sync, caregiver dashboard | Forecast data pipeline, regime-aware correction, calibrated heavy-rain probabilities, forecaster dashboard, rigorous verification |
| Hardest dependency | Accessible design and useful local language content; clinical input strengthens credibility | Historical *issued forecasts* matched to observed rain, meteorological validation, and enough extreme events |
| ML burden | Adaptive difficulty can be transparent rules | Real forecasting model and leak-free evaluation are central |
| Demo | Judge plays game, sees adaptation and caregiver view | Raw versus corrected maps plus held-out skill scores by regime and lead |
| Time to a credible prototype | Lower | Higher |
| Distinctiveness ceiling | Moderate; many apps can look similar | High if measured improvement is real and clearly explained |
| Failure mode | Polished games but weak reminder, voice, offline, or caregiver experience; unsupported clinical claims | Attractive maps without verified improvement; regime overfitting; a forecast/observation timing error |

**Easier to build: SIH26003. Best risk-adjusted choice for a general full-stack team: SIH26003.** It needs several product surfaces, but each is conventional application engineering and the demo is immediate. SIH Buddy independently scores its feasibility 5/5 and acceptance potential 5/5; these are opinions, not published win probabilities.

**Choose SIH26080 if the team has a meteorology mentor, reliable compute/storage, and can secure a matched multi-season forecast archive early.** Its ceiling for technical differentiation is higher, but the central claim must survive a held-out comparison against raw NWP and a non-regime correction. If that evidence is unavailable, the dashboard alone will not make the solution competitive. There is no defensible way to state exactly which will win SIH 2026 before seeing the field, judges, and prototype quality. Do not use SIH Buddy's speculative team-count estimates as probabilities.

## 2. What SIH26080 really requires

For each model issue time and forecast lead, determine the monsoon state from information available **at issue time**, then correct the predicted 24-hour rainfall field. Provide grid and district views and uncertainty for operationally important heavy rain. Show whether the correction improves performance over (a) raw NWP and (b) a strong regime-agnostic correction, separately by lead time, region, rain threshold, and regime.

The user's proposed ConvLSTM/U-Net is a possible later model, not a prerequisite. A small data set can favor a regularized tree or quantile mapping. The scientific result matters more than the neural network name.

Key scientific distinctions:

- Active/break are time-varying monsoon states. Coastal and orographic effects are persistent geographic modifiers; a low-pressure system can coexist with an active phase. Represent these as **overlapping features or soft regime weights**, not six mutually exclusive labels.
- Keep a fallback global correction for transition or low-confidence days. Shrink sparse regime corrections toward that fallback.
- Rainfall classes concern observed daily amounts, while the model may output accumulations on different UTC windows. Align windows before training or evaluation.
- IMD gridded rain is spatial observation, not a perfect district truth or live station observation. Label it correctly in the UI.

## 3. Data contract and feasibility gate

**Initial study area:** India at a common 0.25° verification grid, with a smaller focused demonstration area (for example the west coast and central India). **Initial season:** June–September. **Initial lead range:** Day 1–7; extend to Day 10 only after confirming a consistent archived forecast product with those leads. The NCEI page lists 0.5° GFS forecasts to +192 hours and a 1° product to +240 hours; current 0.25° cloud data is described as a trailing 30-day window, so do not assume it supplies multi-year training data.

| Data | Proposed source | Use | Check before commitment |
| --- | --- | --- | --- |
| Historical issued GFS forecasts | NOAA NCEI GFS archive | Rainfall plus circulation and moisture predictors | Actual dates, variables, leads, archive access, data volume, and model version changes |
| Observed daily rain | IMD 0.25° gauge grid | Primary historical verification target | Download format, date coverage, valid-day convention, missing-value mask |
| Near-real-time rain | IMD gauge–GPM merged product | Operational retrospective display after publication | Product latency and difference from historical gauge-only target |
| Static fields | Elevation, coast distance, land mask, climatology | Geographic effects and regional slices | Licensing and grid alignment |
| Optional local model | IMD GFS/NCUM hindcasts, if supplied | Ministry-specific adaptation | Access requires a request; do not promise it in the MVP |

**Data acceptance test, before model work:** ingest 10 representative forecast issue dates across two seasons at three leads; decode precipitation correctly; produce 24-hour totals on the IMD valid-day window; regrid and mask; inspect raw-versus-observed maps; persist a sample manifest containing source URL/file, checksum, cycle, lead, valid time, units, and grid. If this gate fails, reduce lead range or change archive before building the UI.

For training, use historical forecasts as features, never reanalysis or observed rainfall from after issue time. A regime label derived from later observations is acceptable only as a training/evaluation diagnostic, not as a feature available to the deployed classifier.

## 4. Modeling architecture

```text
NOAA forecast archive -----> GRIB decoder & QC -----> aligned forecast cube ----+
IMD rain archive ----------> observation QC -------> aligned target cube ------+--> versioned training pairs
static geography ----------> regrid/masks ---------> static features ---------+

forecast atmospheric fields --> regime features --> soft regime probabilities --+
raw rainfall ---------------------------------------------------------------+----> correction model
static geography -----------------------------------------------------------+      | 24-hour rainfall quantiles
                                                                             | threshold probabilities
                                                                             v
                                                           calibration + validation + published run
                                                                             |
                                                   tiles / regional summaries / API / dashboard
```

### Regime module

Inputs: forecast rainfall distribution, 850/700 hPa u/v wind, 850 hPa relative humidity, sea-level pressure, geopotential or vorticity, and CAPE if reliably available. Add lat/lon, elevation, coast distance, and day of year. Build physically motivated indices (monsoon trough/pressure anomaly, moisture transport, low-pressure/vorticity signal, active/break rainfall anomaly). Start with transparent rules and a calibrated multinomial or gradient-boosted classifier. Report regime probabilities and the signals behind them. IMD publishes operational criteria for active/weak monsoon at the subdivision level; adapt them carefully to gridded forecast inputs and document the adaptation.

### Rainfall correction ladder

1. **Baseline A:** raw NWP, aligned to the observation grid.
2. **Baseline B:** one global quantile-mapping or gradient-boosted correction by lead and region.
3. **Main model:** a regularized correction using regime probabilities, rainfall, winds, humidity, pressure, CAPE, geography, and interactions. Predict nonnegative rainfall quantiles (for example P10/P50/P90) and exceedance probabilities for 64.5 and 115.6 mm per day. Train with wet-day occurrence plus positive-amount/quantile objectives; add rare-event weighting only after checking calibration and false alarms.
4. **Stretch:** residual U-Net/ConvLSTM if multi-season sample size and compute justify it. Require it to beat Baseline B on held-out extreme-event metrics, not merely mean error.

Calibrate threshold probabilities on a separate validation period (isotonic or logistic calibration). Quantile bands are model prediction intervals, not a claim of guaranteed coverage; measure empirical coverage. For thin regimes, use partial pooling or shrinkage toward Baseline B and publish sample counts.

### Honest evaluation

- Split by complete monsoon seasons: train on earlier years, tune on a later season, test on a final untouched season. Consider rolling-origin repeats if enough years are available. Never randomly split adjacent grid cells or days across train and test.
- Compare raw, global correction, and regime-aware correction at each lead and region. Show rainfall MAE/bias and threshold scores: CSI, ETS, hit rate/POD, false alarm ratio, and FSS at named neighborhood sizes. Add Brier score, reliability diagrams, and interval coverage for probabilities/quantiles.
- Report event counts and block-bootstrap confidence intervals by weather event or week. A win on one tiny depression subset is not enough. Check that gains do not degrade light rain or create excessive false alarms.
- Predefine the primary success gate: regime-aware model improves held-out heavy-rain CSI/FSS over both baselines for the chosen region and lead band, with no material calibration deterioration. If the result fails, show it honestly and simplify the model.

## 5. Full-stack product

### Frontend: forecaster workspace

Recommended: **Next.js + TypeScript**, MapLibre GL for maps, and a compact chart library. A browser dashboard is the correct first client; no mobile app is needed for the hackathon.

| Screen | Functionality |
| --- | --- |
| Overview | Latest issue time, source/model status, active regime probabilities, rainfall risk hotspots, data freshness |
| Forecast Explorer | Side-by-side raw and corrected maps; Day 1–10 selector where data exists; region search; mm/day scale; layer for corrected minus raw; hover/click grid details |
| Risk & Uncertainty | P10/P50/P90 rainfall, probability of heavy/very heavy rain, confidence and sample-coverage notes; district ranking with area fraction above threshold |
| Regime Explorer | Regime probabilities over lead time, driver values, map of circulation features, transition/low-confidence flag |
| Verification Lab | Raw/global/regime-aware comparison by lead, threshold, season, region, and regime; skill charts, reliability, event count, confidence interval, downloadable methodology/report |
| Runs & Data | Issue/run history, model version, data source and freshness, ingestion/QC status, missing-data notices |

Interactions: synchronized maps and legends; threshold and lead selection update both views; click a district to open its time series and exceedance risk; replay a held-out historical case. Make clear whether a view is historical verification or a future forecast. District summaries must be derived by intersecting the grid with district polygons and state the aggregation rule; do not relabel a 0.25° grid as hyperlocal precision.

Design reference from SIH Buddy: editorial layout, strong headings, thin bordered cards, restrained palette, small uppercase labels, and prominent comparisons. Adapt that grammar to an operational weather desk with high-contrast rain maps, consistent units, color-blind-friendly sequential rainfall scale, and concise explanatory captions. Do not copy its branding or content.

### Backend and data services

Recommended: **Python FastAPI** for serving metadata, time series, district summaries, verification, and forecast retrieval. Keep large gridded arrays in **Zarr/NetCDF object storage** and generated raster/vector map tiles or Cloud Optimized GeoTIFFs; use **PostgreSQL/PostGIS** for run metadata, geography, users, and district aggregates. Redis plus a simple worker queue is optional after workload proves it necessary; scheduled Python jobs are adequate for the MVP.

| Component | Responsibility |
| --- | --- |
| Ingestion worker | Fetch or import forecast GRIB and IMD observation files; checksum, retry, validate variables/units/times |
| Alignment/QC worker | Convert accumulations to daily totals, harmonize grids, mask missing values, record provenance |
| Feature/regime service | Compute indices and soft regime weights from issue-time data |
| Inference worker | Load versioned correction and calibrator; publish rainfall quantiles and exceedance fields atomically |
| Verification worker | Calculate baseline and corrected metrics from held-out historical runs and later observations |
| API | Serve run catalog, tiles, point/district series, regimes, verification, status, and exports |
| Persistence | Object store for arrays/tiles/model artifacts; PostGIS for metadata, boundaries, summaries, audit trail |

Minimum API shape: `GET /runs`, `GET /runs/{id}`, `GET /runs/{id}/tiles/{layer}/{lead}/{z}/{x}/{y}`, `GET /runs/{id}/districts/{code}`, `GET /runs/{id}/regimes`, `GET /verification?region=&lead=&threshold=&regime=`, and `GET /health/data`. Responses include model version, source, issue time, valid time, grid, units, and freshness. Protect administrative import/model endpoints with authentication; the read-only demo can use seeded public historical cases.

Data tables/keys: `sources`, `ingest_jobs`, `forecast_runs` (source, cycle, issue time, model version), `forecast_fields` (run, lead, variable, URI, checksum), `observations`, `regime_predictions`, `district_summaries`, `verification_results`, `model_versions`. Unique keys on source/cycle/lead/variable make ingest idempotent.

Operational flow: scheduler discovers new cycle → import/QC → inference → summaries and tiles → atomic publish → observations arrive later → verification and monitoring. On missing predictors or corrupt input, preserve the raw forecast, flag corrected output unavailable, and never silently substitute zeros.

## 6. Delivery sequence and ownership

| Phase | Output | Exit gate |
| --- | --- | --- |
| 1. Scope and archive audit | Exact product, geography, lead range, dataset manifest, 10 sample matched cases | Valid-day and units confirmed end to end |
| 2. Verification first | Raw NWP maps and scores; reproducible seasonal split | Baseline scores match spot-checked examples |
| 3. Corrections | Global baseline then regime features and conditional model | Held-out comparison with counts and uncertainty |
| 4. Product | API, maps, district drilldown, skill lab, run status | Entire demo works from versioned real historical data |
| 5. Reliability and pitch | Scripted replay, source/method page, failure behavior, deployment | New run can process without manual notebook steps |

For a six-person team: 2 data/meteorology, 1 ML/verification, 1 backend/geospatial, 1 frontend/maps, 1 integration/UX/pitch, with shared review of the metrics. If fewer people are available, reduce geography and lead range before dropping verification.

**Demo script (about two minutes):** select a held-out monsoon event → show raw and corrected rainfall maps for a chosen lead → reveal regime probabilities and top drivers → click an affected district for heavy-rain probability and interval → open Verification Lab and show raw, global, and regime-aware heavy-rain scores with event counts and confidence intervals → show the run's source and model version. Never choose the demo event as the only evidence of skill.

## 7. Key risks and decision gates

1. **Archive mismatch:** Most damaging risk. If historical forecasts cannot be matched across seasons, use a product with stable archive access; do not train on analysis fields as a substitute for past forecasts.
2. **Rare extremes:** Pool data across seasons/regions, regularize by regime, report counts and uncertainty. Do not claim extreme skill from a handful of events.
3. **Model upgrades:** Record GFS version/date and evaluate before/after upgrades separately or include version effects.
4. **Spatial displacement:** Use FSS as well as exact-grid scores; a one-grid shift can be meteorologically useful but penalized by pointwise metrics.
5. **Operational trust:** Display source time, lead, units, model version, uncertainty, and missing-data state on every forecast page.
6. **False precision:** District summaries are aggregates of coarse grids. The interface must show grid resolution and aggregation method.

**Go/no-go for SIH26080:** after the archive audit and first baseline, commit to this statement only if the team can produce a credible multi-season matched dataset and a repeatable held-out verification table. Otherwise SIH26003 is the stronger build choice for this team unless it has exceptional clinical/user research support.

## Sources reviewed

- [SIH Buddy: SIH26003](https://www.sihbuddy.in/ps/SIH26003) and [SIH Buddy: SIH26080](https://www.sihbuddy.in/ps/SIH26080): independent interpretation and subjective scores.
- [SIH Buddy homepage](https://www.sihbuddy.in/): visual design reference.
- [NOAA NCEI GFS archive](https://www.ncei.noaa.gov/products/weather-climate-models/global-forecast): available GFS products and lead ranges.
- [IMD 0.25° historical gridded rainfall](https://imdpune.gov.in/cmpg/Griddata/Rainfall_25_NetCDF.html) and [IMD merged gauge–GPM rainfall](https://rcc.imdpune.gov.in/download.php): observation sources.
- [IMD monsoon activity criteria](https://mausam.imd.gov.in/responsive/monsooninformation_monsoon_activity.php) and [IMD heavy-rain thresholds](https://mausam.imd.gov.in/backend/assets/cyclone_pdf/14_National_Bulletin_No_14-16th_Sept2024_0830_IST.pdf).
- [Met Office FSS explanation](https://www.metoffice.gov.uk/binaries/content/assets/metofficegovuk/pdf/business/international/yemen-case-study.pdf).
