# Well 0 — AEcon standalone closeout

Goal: AEcon standalone on x402/CDP/Bazaar. Direct dependence on `agentic.market` and `treg.to`
removed (Paths A and C). Path B (Coinbase Bazaar discovery) and Path D (owner funnel for bespoke
providers) kept unchanged.

## Outcome

Dev cutover complete and proven live. Hosted cutover not done — Joel's call, since it deploys
unpushed local `main` to production. Runbook below.

## What changed

### Severed

- `refreshAgenticEconomyApiRegistryHandler`: dropped the `marketExternalRegistryRefresh.run` call.
  Kept `x402DirectoryIndexRefresh.start` under the same workload name, `'refresh Agentic Economy
  API registry'` (AE's own name).
- Cron `'refresh Agentic Market snapshots'` (6h): removed outright, with its handler.

### Deleted

| Kind | Paths |
| --- | --- |
| Modules | `src/modules/market/{registry-source-adapters,registry-source-contracts,agentic-market-source,registry-launch-cohort,registry-graduation}.ts` |
| Convex functions | `convex/{marketRegistryGraduation,marketExternalRegistryRefresh,marketExternalRefresh}.ts` |
| Convex path | `marketExternalSnapshots` upsert path |
| Function | `admitRegistryPaymentRequiredItem` |
| Eval harness | `eval/parity` and the `parity:check` npm script |
| One-time mutation | `retireRegistrySources` — authored for the purge, run once on dev, deleted in `700dd44df` once the schema no longer permitted non-Coinbase rows |

### Kept

- `convex/scheduledFunctionRetirement.ts` `cancelByName` — bounded newest-first scan of
  `_scheduled_functions` (`newest` arg, default 1000), for auditable pre-deploy cancellation.
- `marketExternalRegistry:search` (public query) — now reads the `'coinbase'` state row via
  `directoryState()`.
- `x402DirectoryIndex*` refresh path — the target state, untouched.
- Workload name `'refresh Agentic Economy API registry'` — AE's own name.

### Schema

- `marketExternalRegistryEntries.source` → `v.literal('coinbase')`.
- `marketExternalRegistryState.key` → `v.literal('coinbase')`.
- Dropped generation fields: `agenticMarketReported`/`Fetched`, `tregReported`/`Fetched`.
- Dropped 20 retired-adapter-only optional entry fields: `providerUrl`, `docsUrl`, `routeIdentity`,
  `capability`, `priceLabel`, `exactPrice`, `sourceCheckedAt`, `credentialRequirements`,
  `readiness`, `lastObservedAt`, `lastVerifiedAt`, `inputSchemaJson`, `exampleInvocation`,
  `probeRequest`, `quality`, `sourceCalls30d`, `sourcePayers30d`, `sourceMedianLatencyMs`,
  `sourceP95LatencyMs`, `sourceSampleSize`.
- Dropped table `marketExternalSnapshots`.
- Durable table inventory: 91 → 90.
- `publicEntry`/`publicEntryValue` narrowed to match — the Coinbase writer never populated the
  dropped fields, so this is a shape correction, not a behaviour change.

### Public API

| Surface | Change |
| --- | --- |
| `/api/v1/registry` | `schemaVersion` → `api-registry:v2`. Items no longer carry the dropped optional fields. Only Coinbase-sourced entries. |
| `/api/v1/market-metrics` | `x402Ecosystem` is always `status: "unavailable"` with `statusDetail: "AEcon does not yet publish an x402 ecosystem snapshot; first-party counts below are live."` until an AE-derived snapshot exists (see Signals proposal). |
| `/api/v1/catalogue-status` | New. `catalogue-status:v1`: `fresh` \| `stale` (>36h) \| `failed` \| `absent`. Also a fifth probe on `/status`. |
| `marketExternalSnapshots:read` | Renamed `marketMetrics:read`. First-party counts only. |

### Single source of truth

`src/lib/deployment/scheduled-workloads.ts` now drives `convex/crons.ts`,
`WORKLOAD_CRON_DECLARATIONS`, and the deployment manifest — one list instead of five hand-copied
ones.

### Drift guard

`tests/imports/external-source-drift.test.ts` fails the build on `treg.to`, `api.agentic.market`,
or `agentic.market/` anywhere in `src`, `convex`, `tools`.

## Dev cutover record

Local Convex deployment, 2026-09-09.

**Backup, taken before any deletion:**

| Field | Value |
| --- | --- |
| Path | `~/Documents/Coding/Backups/Agentic-Economy/closeout-2026-09-09/dev-pre-well0-cutover.zip` |
| sha256 | `5c6b3a0c7a9d73ae062f789098b01102a3ef2d377904d9a4caad4485867c88ad` |
| Size | 46.4 MB |

**Scheduled-job cancellation (`cancelByName`)** for `marketRegistryGraduation:sweep`,
`marketExternalRegistryRefresh:run`, `marketExternalRefresh:run`: scanned 3905, cancelled 0
(nothing pending).

**Purge:** first version of `retireRegistrySources` stalled — a raw `.take(200)` returned only
kept Coinbase rows and self-rescheduled forever. Fixed in `6a2f06425` to walk
`by_generation_source_and_documentId` per retired source.

**Post-purge state:**

| Table | Count |
| --- | --- |
| `marketExternalRegistryState` | 1 row (`coinbase`) |
| `marketExternalRegistryGenerations` | 1 row (`coinbase`, `ingestedCount` 14568, analytics ready) |
| `marketExternalSnapshots` | 0 (table dropped) |
| Dry-run residue | 0 / 0 / 0 / 0 |

Schema push accepted against live rows.

## Live proof

Dev, Vite `http://127.0.0.1:3025`.

| Check | Result | Latency |
| --- | --- | --- |
| `/api/ready` | 200 `{"status":"ready"}` | 16 ms |
| `/api/v1/registry?query=weather` | 200, `kind: ok`, coinbase generation, `coverage.entries` 14568, 24 items first page | 30 ms |
| `/api/v1/catalogue-status` | 200, `fresh`, `ageHours` 9 | 20 ms |
| `/api/v1/market-metrics` | 200, `x402Ecosystem` unavailable, `agenticEconomy` live | — |
| `ae list` | 11 tools | — |
| `ae search allowance` | 1 ("Chain Allowance") | — |

## Gate

`npm run test:all` exit 0 after cleanup: unit 491 files / 4470 tests; integration 120 files;
types, imports, ts-standards, ui-contract all pass.

Before cleanup, `test:ts-standards` failed with 26 pre-existing violations (non-null assertions,
one unknown double cast, one `v.any`) in files last touched 2026-09-04..08. All fixed in the
cleanup commit, no allowlists.

## Code-quality pass

`gstack review` skill run over the Well 0 diff. Findings applied:

- Dead live/delayed branches removed from `externalProjection`.
- Permanently-null snapshot field removed.
- Catalogue freshness projection moved out of the route into
  `src/modules/market/x402-directory-index.server.ts` (`readCatalogueFreshness`).
- One-member union parameter inlined in `facilitator-discovery-admission.ts`.

Deferred to Well 4 (not applied here):

- Fold `marketExternalRegistry:search` + `/api/v1/registry` onto x402DirectoryIndex
  browse/overview — one catalogue contract, but reshapes a versioned API.
- Rename "External Registry" tables/modules to directory naming — needs a real migration.

## Hosted cutover runbook

See `docs/operations/hosted-cutover-runbook.md` for the consolidated steps (Well 0, Well 3, Wells 1+2, Well 4) in execution order.

## Follow-ons and Well 4/5 inputs

- **AE-derived x402 ecosystem snapshot** — re-fill `market-metrics.x402Ecosystem` from AE's own
  data (`docs/workflow/aecon-signals-proposal.md`, awaiting Joel's read).
- **Well 4 — reviewed vs listed tier.** Market scan (`research/2026-09-09-agent-marketplace-scan.md`)
  shows this is the familiar pattern (Locus, AgentMuxer). Surface it using AE's existing declared /
  derived / AE-observed provenance vocabulary — no new concept.
- **Well 4 — one catalogue contract.** Fold `marketExternalRegistry:search` and
  `/api/v1/registry` onto x402DirectoryIndex browse/overview. Public-contract change; versioned API
  reshape.
- **Well 4 — directory naming.** Rename "External Registry" tables/modules to directory naming.
  Needs a real migration, not a rename-in-place.
- **Well 5 input — module rationalisation.** Widens Well 5 (authority and agent-access host files, structural) from host-file extraction to module shape. Baseline measured 2026-09-09:

  | Metric | Value |
  | --- | --- |
  | Modules | 27 |
  | Declared entry surfaces | 186 |
  | Test white-box exceptions | 65 (42 into capability-supply) |
  | capability-supply files | 163 (142 internal) |
  | `@/modules/common` import count | 391 |
  | Import cycles | 365 cycles found by dependency-cruiser on 2026-09-10; peer cycles 0; barrel and capability-supply internal cycles ratcheted by Well 5 (see well-5-structure-closeout.md) |
  | Routes importing module internals | 0 |
  | Lines: src / tests / convex | 155,620 / 150,983 / 65,528 |
  | Duplicated concepts | 2 directory read paths in market, 3 quote paths, 3 ledgers |

  Exit targets: entry surfaces < 60, white-box exceptions 0, one directory/quote/ledger path each.
  Collapse duplicates before splitting capability-supply. Do not reorganise before Wells 3, 1, 2.
- **Bounded generation retention** — deliberately out of scope for Well 0.
- **Scan restart runbook** — `x402DirectoryIndexRefresh:start`.

## Commits

Range `a20b0839e..HEAD`:

| Commit | Message |
| --- | --- |
| `0eef3cb32` | fix: restore registry field and metadata facets dropped by analytics v2 |
| `203b26ffd` | feat: add cancelByName for auditable scheduled-function retirement |
| `dac585295` | docs: record the 2026-09-09 agent marketplace scan |
| `a251b9cef` | fix: stop fetching Agentic Market and Treg on the scheduled workloads |
| `b7dca9ff8` | chore: drop marketplace-origin wording from fixtures and comments |
| `9b99883ac` | feat: surface catalogue freshness on /status |
| `a47226878` | feat: remove the Agentic Market and Treg registry paths |
| `9946e6052` | test: guard runtime code against retired marketplace hosts |
| `1defa8151` | feat: version /api/v1/registry as api-registry:v2 |
| `307873e9b` | feat: add retireRegistrySources for the Well 0 cutover |
| `6c6075839` | test: account for the catalogue freshness probe on /status |
| `e5c573ab0` | test: add the search and metrics regression suites for Well 0 |
| `3cd3bf801` | test: drop the inline stand-in for the retired registry fail mutation |
| `bfe8a5d12` | refactor: derive crons, workload declarations and manifest from one list |
| `6a2f06425` | fix: walk retired registry sources by index and bound scheduled-job scans (cutover fix) |
| `700dd44df` | feat: tighten market schema to the Coinbase directory and drop retired registry rows (schema tightening) |
| `7f0c04352` | fix: close the 26 runtime type holes the ts-standards guardrail was reporting (cleanup) |
| `0dd478cb9` | refactor: remove dead snapshot paths and move catalogue freshness into the market module (cleanup) |
