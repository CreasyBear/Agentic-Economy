# T29 — Study engine + category-generic quote seam

Labels: `wayfinder:task` (AFK). Map: [Framework](../MAP-framework.md). Blocked by: [T26](T26-node-contract-and-rollup-algebra.md), [T31](T31-oss-adoption-pass.md).

## Question

Build the durable Study per the litreview schema: scan (registry + cited web discovery) → qualify
(hard needs gate eligibility) → quotes → explainable weighted scoring (criteria from charter wants,
per-criterion contribution persisted, never store only the winner) → recommendation with evidence
refs. Includes closing the named gap from MockSupplyCohorts: a category-generic quote seam in
sandbox-supply (mock cohorts for photographers/funeral/dentists must each produce labelled quotes)
without mislabeling operations. RFx lifecycle states borrowed from OpenProcurement pattern.

## Resolution

(pending)

## Named adopted libraries (adopt-first rule)

Source: [donor hunt](../../research/2026-08-01-framework-kernel-donor-hunt.md), 2026-08-01.

- **PORT** `kotbaton/pymcdm` `pymcdm/methods/topsis.py` (MIT) — normalize → weight → PIS/NIS →
  distances → closeness, with every intermediate named. Persist per alternative × criterion: `raw`,
  `normalized`, `weight`, `weighted`, PIS/NIS deltas, squared distance contributions. Alternative
  reference: `quatrope/scikit-criteria` `skcriteria/agg/topsis.py` (BSD-3).
- **AVOID, proven** npm `topsis@1.3.2` — `index.js:~199` computes `D-/(D- + D-)`, i.e. the closeness
  score is mathematically wrong; issue #12 open and unanswered since 2020. Also rejected: `topsis2`
  (no per-criterion output, `NaN` on zero columns), `mcdajs` (source repo 404), `ahp-calc`,
  `airicyu/ahp`, `electre-js`, `promethee`, `weighted-sum` — all stale or license-gate failures.
- **INSTALL (not yet installed — T31 recommended XState v5, nobody added it)** XState v5 for the RFx
  lifecycle (`enquiry → tender → qualification → award`, OpenProcurement pattern). No OSS procurement
  machine exists in TS; Convex append-only events stay the durable truth.
- **BORROW** study artifact schema: `assafelovic/gpt-researcher` (Apache-2.0)
  `{learnings:[{insight, sourceUrl}], followUpQuestions, citations}` claim→source linkage;
  `langchain-ai/open_deep_research` (MIT) numbered-inline-citation + `### Sources` convention.
  AE extends both with `quoteOrLocator`, `qualityScore`, `observedAt`, `expiresAt`, `revision`.

**Recorded adoption-search failure (legitimate hand-roll):** quote-freshness/validity-window
modelling and the evidence-class labelling that keeps mock-from-real cohorts from being read as
availability. Donors carry URL-only citations and no expiry semantics.
