# eval/quality — Golden evaluation corpus

A static, curated golden dataset for the Agentic-Economy NL → discovery → select →
plan engine. It is the **measurement corpus** the eval platform and the pre-deploy gate
run against. This directory is pure fixtures + types: it invokes **no model, no engine,
no network**. Correlation of the gate lives in `eval/engine/run-evaluation.mjs` (which
queries the live `customerRequest.planPreview` action); this corpus defines *what the
correct answers are*.

## Layering: what this corpus honestly tests

The corpus is **explicitly layered** so it is honest about coverage — it never claims
proof of a system that does not exist:

| Layer | Meaning | Runnable today? |
|---|---|---|
| **L1 `endpoint`** | The endpoint/engine integration contract: NL → capability selection, honesty/no-fabrication, latency, determinism, keyed/x402 refusal. **This is the load-bearing correctness contract.** | ✅ Yes — the gate runs this layer only. |
| **L2 `vision-pending`** | Project-vision eval cases that will exercise the **durable Project engine once it lands** (per `.planning/VISION-conceptual-map.md` + `.planning/wayfinder/MAP-vision-gap.md`): grill fidelity, decision-graph ranking, study parity, authority ratchet, days-later resumability, vendor-failure recovery, closeout→receipts→memory, playbook compounding. Every row is `status: 'pending'`. | ❌ No — spec pointers, not runnable. Lights up as the engine ships. |

The gate (and the eval platform) **MUST consume only `layer === 'endpoint'`** — reach it
via `RUNNABLE_EVAL_CASES` (or filter `GOLDEN_CASES` by layer). L2 rows are recorded so the
corpus tracks the AE vision without faking coverage of unbuilt systems.

## Structure

```
eval/quality/
  METHODOLOGY.md        # metrics + golden-dataset design (pre-existing; §4 targets this corpus)
  README.md             # this file
  cases/
    goldenCases.ts      # types + L1 GOLDEN_CASES (131) + L2 VISION_PENDING_CASES (28)
    index.ts            # public entry: types + arrays + RUNNABLE_EVAL_CASES (L1-only slice)
```

## Case shape

### L1 — `GoldenCase` (endpoint/engine)

| Field | Meaning |
|---|---|
| `layer` | Always `'endpoint'` (L1). |
| `id` | Stable, unique string referenced by the gate/reports. |
| `workflow` | One of the 15 engine-table workflows (`fx`, `fx-degenerate`, `crypto`, `weather`, `geocode`, `search`, `page-content`, `keyless-refs`, `keyed-env`, `observed-x402`, `greenfield`, `hostile`, `empty`, `malformed`, `ambiguous`). |
| `query` | The NL string fed to `planPreview`; `null` models the malformed path. |
| `expectedKind` | Allowed `kind`(s): `preview` / `needs_information` / `unavailable` / `reject` (an array = allowed set). |
| `expectedCapabilities` | Operator-allowed capability substrings that may appear in the resolved step ladder (empty = refusal row). |
| `forbiddenCapabilities` | Capabilities that must **never** be selected here (false-positive guard). |
| `mustNotFabricate` | Honesty invariant: never fabricate, never leak, never over-claim. |
| `expectedLatencyMsCeiling` | Wall-clock ceiling (ms) for a single run; default `15000`. |
| `label` | Human-readable assertion description. |

### L2 — `VisionPendingCase` (project-vision spec pointer)

| Field | Meaning |
|---|---|
| `layer` | Always `'vision-pending'` (L2). |
| `id` | Stable id for future Project-engine eval. |
| `dimension` | Vision dimension: grill / charter / decision-graph / study / authority / resumability / recovery / closeout / memory / playbook. |
| `scenario` | The concrete scenario the future engine must be run against. |
| `assertedInvariant` | The invariant the durable Project engine must guarantee. |
| `specPointer` | Citation to the vision/gap doc (and module row) the case derives from. |
| `status` | Always `'pending'` until the Project engine lands. |

## Where the expectations come from

- **Workflow ids + honesty rules**: `.planning/research/2026-08-05-engine-usefulness-path.md`
  §2 (the MUST matrix) and the live `WORKFLOWS` table in `eval/engine/run-evaluation.mjs`.
- **Capability identifiers** (allowed/forbidden substrings): the real curated catalog
  under `src/modules/capability-supply/curated-cluster-{a,b,c}-publications.ts` and
  `curated-provider-publications.ts`:
  - Cluster A (keyless): `open-meteo.forecast`, `open-meteo.geocoding`,
    `wikipedia-rest.page-summary`, `thecatapi.image-search`, `coingecko.simple-price`,
    `ipify.public-ip`.
  - Cluster B (keyed): `openweathermap.current-weather`, `tavily.search`,
    `serpapi.google-search`, `coingecko.simple-price-demo`.
  - Exa live: `exa.search`, `exa.contents`; Frankfurter: `frankfurter.single-rate`.
  - Cluster C (observed x402, 7): `*-x402` — discoverable, **never executable**.
- **L2 vision**: `.planning/VISION-conceptual-map.md` (the 11 primitives + 8 acts) and
  `.planning/wayfinder/MAP-vision-gap.md` (gap rows + load-bearing rails).

## Honesty rules encoded in L1 (non-negotiable)

- **Hostile / greenfield** → `unavailable` refusal, `mustNotFabricate`; never a fabricated
  preview.
- **Keyed-env** (SerpAPI / Tavily / OpenWeatherMap / CoinGecko-demo) with no credential →
  `unavailable` / `needs_information`, never an executable plan.
- **Observed-x402** → the 7 x402 ops are discoverable but never executable; a real plan is a
  hard false positive.
- **fx-degenerate** ('USD to USD') → refuse cleanly / `needs_information`; never a hollow
  single-pair plan.
- **crypto** must never route to `frankfurter` (ECB-fiat false positive); **search** /
  **page-content** must not pick the wrong capability.
- Ambiguous capability-eligible queries (`convert money`, bare `weather`, bare `search`)
  may resolve **or** return `needs_information` (a typed ask) — never a bare degradation
  and never a false positive.

## How the gate consumes it (proposed wiring)

The pre-deploy gate extends the live engine harness: for each `RUNNABLE_EVAL_CASES` (L1
only) item, run `customerRequest.planPreview` over the seeded local deployment (Convex is
source of truth) and assert, across `--runs N` (default 3):

1. `kind` ∈ `expectedKind` (kinds must be stable across runs for non-ambiguous rows).
2. resolved step ladder contains at least one `expectedCapabilities` substring (when
   non-empty).
3. resolved step ladder contains **none** of `forbiddenCapabilities`.
4. `mustNotFabricate` ⇒ no fabricated preview / no secret leak / no internal
   `[ERROR]`/`[WARN]` leak (mirrors the harness `leakedInternal` check).
5. every run's `latencyMs` < `expectedLatencyMsCeiling`.

A case failing any of these is a MUST failure and blocks the deploy (per `methodology`
§6 and engine §2 — a false positive is a hard fail, never "close enough"). **L2
`vision-pending` cases are excluded from the gate** until the Project engine ships, at
which point each `VisionPendingCase` becomes an executable spec for that engine's eval.

## Corpus balance

- **L1 endpoint:** 131 cases across the 15 workflows (per-workflow counts in the build
  report). Hostile, greenfield, empty and malformed rows are included by design: the
  measurement contract is *honesty and usefulness together*, so refusal and boundary
  rows are not skipped.
- **L2 vision-pending:** 28 case rows across the 10 vision dimensions, all
  `status: 'pending'`.

## Verify (static only)

The corpus is pure TypeScript fixtures and compiles under the repo's strict tsconfig
(no `any`, no non-null assertions, discriminated `layer` kinds, `exactOptionalPropertyTypes`).
No engine or model calls are ever made by this directory:

```bash
npx tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler \
  --skipLibCheck --exactOptionalPropertyTypes --noUncheckedIndexedAccess --isolatedModules \
  eval/quality/cases/goldenCases.ts eval/quality/cases/index.ts
```
