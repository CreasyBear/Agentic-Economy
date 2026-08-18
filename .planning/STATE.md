---
gsd_state_version: 1.0
milestone: atomic-operation-market-reset
milestone_name: Atomic operation market reset
status: phases_0_1_2_3_4_committed; p5_a_files_landed; remainder_p5_freeze
stopped_at: 2026-08-18 remainder P1-d3 — UTC daily settlement cron skips while live-money gate is open
last_updated: "2026-08-18"
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 8
  completed_plans: 5
  percent: 71
current_phase: 05
current_phase_name: remainder-p5-freeze

# Current state

## Atomic Operation Market Reset — 2026-08-18

The program is the reset in [`reset/OPERATING-MODEL.md`](reset/OPERATING-MODEL.md).
Cards: [`reset/CARD-LEDGER.md`](reset/CARD-LEDGER.md). Evidence:
[`reset/RECEIPTS.md`](reset/RECEIPTS.md). Remainder execution:
Cursor plan `atomic_market_reset_remainder_2026-08-18`.

Target unchanged: AE owns operation identity/contract, authorization, exactly-once
durable invocation, delivery evidence, and brokered money. Consuming agents own
planning and orchestration. MCP, CLI, and chat are thin adapters over one market
kernel. `/api/v1/operations/call` is the paid door and is not deprecated.

**Landed on local `main`:** Phases 0, 1, 2, 3, and 4. P5-a frontier v2 files
exist (`1aaf4aa5`). Live money stays fail-closed. Daily settlement cron exists
and skips while the live-money gate is open.

**Open (remainder):** founder freeze go/no-go, P5-b/c/e. No P5-d 410 and no P6.
Local `main` remains unpushed under the written hold.

**Hold (2026-08-18):** founder has not asked to push. Remainder continues locally. See RECEIPTS HK-push-or-hold.

## Atomic Operation Market Reset — 2026-08-16

The program is now the reset described in
[`reset/OPERATING-MODEL.md`](reset/OPERATING-MODEL.md), with cards in
[`reset/CARD-LEDGER.md`](reset/CARD-LEDGER.md) and measured evidence in
[`reset/RECEIPTS.md`](reset/RECEIPTS.md).

Target: AE owns operation identity/contract, authorization, exactly-once durable
invocation, delivery evidence, and brokered money. Consuming agents own planning and
orchestration. MCP, CLI, and chat are thin adapters over one market kernel.

**Phase 0 landed.** Working-tree archaeology is closed:

- 13 stashes from the retired `gsd/plan-21.x` architecture triaged as abandon, archived
  as `archive/stash-00..12` tags (recoverable), stash list cleared. Every path they touched
  (`convex/ownerInbox*`, `src/lib/billing/`, `src/views/`, `src/routes/v1/`) is deleted in
  the current tree.
- 308 dirty paths sliced into 10 attributable commits by concern: gitignore, planning docs,
  release config, market kernel, answer runtime, CLI, protocol surfaces, UI, unit tests,
  boundary tests. No mega-commit.
- Baseline tagged `baseline/pre-atomic-market-reset` and pushed with `main`
  at `9d7aaef6`. Typecheck and lint green at that revision.

**Open (historical 2026-08-16):** Phase 1 closes the category additively — organization-owned money, Delivery /
Qualified Use receipts, disputes and reversals, idempotent settlement, canonical
`/api/v1/operations/call`, standard supply publish actions. Nothing is deleted in Phase 1
and live money stays fail-closed.

## Historical state


## Product-Frontier Cleanup — 2026-08-15

Cleanup doctrine: smaller only where the complete market loop and WorkTree/Study
proving ground get stronger. Positive frontier floor lives at
[`.planning/evidence/product-frontier-baseline/`](evidence/product-frontier-baseline/)
with `npm run check:product-frontier` and
`tests/imports/product-frontier-manifest.test.ts`.

**Landed (low-risk):**
- Batch 0 — frontier manifest, golden journeys, dirty-tree baseline, Goblin
  evidence relocated under `.planning/evidence/goblin/`
- Batch 1 — removed unused `streamdown` family; deleted orphan
  `self-description.ts`; stale `doctor.config.ts` ignores; `uniqueSorted`
  consolidated onto shared helper
- Batch 2 — deleted test-only `provider-integrations/shipping`; weekly memo
  parked with notification-outbox as re-entry owner
- Batch 3 — import quarantine for development evidence without move-only churn

**Recorded, not destroyed:**
- Batch 4 — Study characterization + market-loop proof doc; local smokes
  env-blocked (`convex_dev_server_unavailable`, missing journey signing key);
  Tier C not promoted
- Batch 5 — WorkTree owns project-spine successor semantics; memo owned by
  notification-outbox; both remain until wire/characterization
- Batch 6 — routing-kernel history / table drops deferred post hosted proof

**Gate truth:** cleanup-specific positive tests, lint, typecheck, codegen,
conformance, SEO, UI contracts, evals, quality gate, and build pass. The full
repository gate remains partial because unrelated in-flight gateway/settlement
changes fail schema inventory, import/TS standards, one development-host parity
case, and one paid-operation comprehension assertion. Full E2E and local smokes
remain blocked by local Convex/signing-key state. See
`evidence/product-frontier-baseline/CLEANUP-RECEIPT.md`.

**Do not optimize for:** raw LOC, table count, or dependency vanity totals.

## Cloudflare OS production-readiness extraction — 2026-08-09

The source implementation now carries the donor-independent invariants selected
from the pinned Cloudflare OS audit: canonical durable external-effect claims,
connection-backed provider authority and revocation, ordered approval evidence,
answer-step checkpoints, bounded diagnostics and explicit readiness, plus a
closed deployment/config manifest. The implementation and observed gate record
is authoritative at
[`research/2026-08-09-cloudflare-os-production-readiness-patterns.md`](research/2026-08-09-cloudflare-os-production-readiness-patterns.md).

Evidence remains source/local. Unit (3,324), integration (280), and conformance
(278) tests passed with typecheck, lint, and Convex codegen. Production manifest
validation remains blocked on production environment configuration; hosted
deployment/smoke remains consent-gated; the pre-cutover local Convex database
must be deliberately reset and reseeded before it can accept the clean schema.

## Current authority and frontier — 2026-08-08

- **Category authority:** [`PROJECT.md`](PROJECT.md), [`VISION-conceptual-map.md`](VISION-conceptual-map.md),
  [`wayfinder/MAP.md`](wayfinder/MAP.md), and the
  [Agent Services Market category thesis](research/2026-08-08-agent-services-market-category-thesis.md).
  The canonical category is the market and controlled transaction layer for
  authorized agents to discover, buy and invoke admitted third-party Market
  Operations, with suppliers paid after contract-valid delivery.
- **Domain boundary:** the Principal is the human or organization that owns
  authority and budget; the agent is its delegated shopper and distribution
  interface. Suppliers host implementations; AE owns admission, invocation
  identity, authority/policy, evidence, Qualified Use metering and reconciliation.
- **Proof frontier:** V1 is closed to one contract family and curated suppliers.
  The named public-document structured-extraction candidate and current source/local
  implementation evidence do not prove a market, hosted provider fulfilment,
  production settlement, or repeat independent demand.
- **Historical boundary:** BAS/T53 work, `MAP-framework.md`, `MAP-engine.md`,
  `MAP-vision-gap.md`, and `JOURNEYS.md` retain mechanics and evidence provenance
  only. They are not current category, ICP, wedge, or roadmap authority; older
  local-trades, Australian-SMB, and human-service framing is superseded/historical.


## Single-Key Capability Gateway — current status — 2026-08-12

**Status:** remediation campaign open; seven workstreams focused-verified; Node 22 post-codegen source gate green; automatic daily supplier-settlement policy decided in ADR-034 but PRA-003 source implementation remains open; production policy values, manifest, and hosted certification blocked  
**Decision:** [`ADR-035`](adr/ADR-035-single-key-capability-gateway.md)  
**Plan:** [`research/2026-08-09-single-key-capability-gateway-implementation-plan.md`](research/2026-08-09-single-key-capability-gateway-implementation-plan.md)
**Historical closeout:** [`research/2026-08-11-goblin-source-remediation-plan.md`](research/2026-08-11-goblin-source-remediation-plan.md)

The 2026-08-11 remediation closeout and its source/local gate claims are historical evidence for that dated snapshot, superseded for current status by the 2026-08-12 post-remediation re-audit recorded in `PAPERCUTS.md`.

The accepted gateway architecture and W0-W8 contract remain the scope. The
2026-08-11 source-completion/local-gate claims are historical; the
2026-08-12 re-audit leaves the remediation campaign open. Seven workstreams are
focused-verified. ADR-034 now selects automatic daily full-balance supplier
settlement, but PRA-003 source implementation remains open. The canonical
protected action is
`operation.invoke:v1` at `POST /api/v1/operations/execute`; MCP, CLI, and
Answer are adapters over one application service. Existing
`operation.execute:v1` remains public/keyless/read-only.

The current sequence is:

- `W0` architecture/ownership freeze and no-handroll record;
- `W1` clean-cutover generalization of Customer Request key/principal/OAuth;
- `W2` per-key grant, budget, rate, concurrency, and mandate admission;
- `W3` authenticated HTTP/MCP action projection;
- `W4` durable standalone invocation service over Action Invocation, supply,
  transport, money, and evidence;
- `W5` generation-bound provider connection leases and credential custody;
- `W6` recovery, cancellation, reconciliation, correlation, redaction, and
  observability;
- `W7` one-question first-use and separate consumer/supplier settings;
- `W8` discovery/docs/CLI/Answer projections and hosted release proof.

The work reuses the existing Clerk auth/OAuth, action/MCP, keyless executor,
capability-supply publication/binding/readiness/provider-connection,
Action Invocation, route transport, money, `convex/lib/rateLimit.ts`,
canonical digest/stable serialization, RFC 9457, Convex, workflow/workpool,
and MCP SDK seams. No second token verifier, registry, ledger, transport, or
execution state machine is allowed; the exact reuse and package evidence are
in ADR-035 and the implementation plan.

The 2026-08-09 gate report and 2026-08-11 closeout are historical evidence for
their dated source snapshots. A complete current Node 22 post-codegen source
gate passed on 2026-08-12: lint, typecheck, kernel-retirement verification,
unit and integration release suites, type/import/TypeScript/SEO/UI-contract
checks, the 13-case/15-turn Answer evaluation, and production build. The outer
`test:release:source` gate still fails closed before conformance/codegen because
the production deployment manifest lacks or rejects operator-owned canonical,
Clerk, Convex, model, Stripe, x402-custody, and source-write configuration. No
strict hosted gateway receipt exists in `output/release/`.

The exit gate is positive, not refusal-only: the same real Clerk-issued key
must invoke two real operations from distinct admitted suppliers/connection
modes on a configured hosted deployment, with current approval/budget,
server-only supplier credentials, durable terminal/recovery state,
usage/evidence readback, and revoke→refused replay. Fixtures, mocks,
refusals, synthetic local identities, source-only OAuth, and unavailable
Convex are not production proof. Until that sequence runs, hosted proof stays
uncertified.

Checked-out base `6639c106f540f3cf08dc236f0ee6c053b3b60883`; later source is staged in the current index and concurrent owner work remains uncommitted in the working tree; neither is shipped or revision-bound evidence.

The 2026-08-02 WorkTree parity program (T44–T53) is landed and verified at the source + local-smoke evidence boundary: `output/release/final-gate-2.log` records `npm run test:release:source` exit 0 with 2,687 unit, 244 integration, eval 12/12 and build; `output/release/work-tree-smoke.json.log` records the labelled-local sequence `outcome → create → elaborate → study → propose → inbox → lock → receipt → reload_readback`. This does not upgrade evidence: T45 claim rotation, T51 hosted setup seam + deployment/evidence, T52 counsel sign-offs (**LIVE MONEY: REFUSED**), and T53 recruitment/external run remain open; `.planning/research/2026-08-02-hosted-parity-attempt.md` records Ready preview `dpl_F83yP9wsudjvVqrLQjB6Z65iVbYp` behind HTTP 401 protection, expired `VERCEL_OIDC_TOKEN`, no hosted Convex ID after anonymous/local dry-run refusal, and Playwright `No tests found` before the spec body; see `.planning/wayfinder/tickets/T45-project-identity-and-source-initialization.md`, `.planning/wayfinder/tickets/T51-hosted-parity-release-proof.md`, `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md` and `.planning/wayfinder/tickets/T53-bas-wedge-external-kill-gate.md`.

The same-day security remediation and post-fix evidence are recorded in the [MAP addendum](wayfinder/MAP-framework.md): `npm run typecheck` is clean and the full `final-gate-3` output exits 0 with suites `2703/244/4/50/1/29/1` and answer evaluation `12/12`, average score `9.9`. ([final-gate-3.log](../output/release/final-gate-3.log)) The local no-mock-code smoke exits 0; its packet lineage records the latest revision 7 `lock` accepted and `reload` accepted. ([T44](wayfinder/tickets/T44-green-release-baseline.md); [work-tree-smoke.json.log](../output/release/work-tree-smoke.json.log))

The MAP addendum is retained as historical mechanics and evidence provenance
only. It cannot override the current category or proof frontier above.


Repository consolidation completed on 2026-08-01. Runtime/platform cutovers,
public-seam migrations, bounded persistence/search paths, exact Convex
contracts, source-write authority, request-body limits, canonical-origin
handling, and TypeScript standards guardrails are integrated in the current
working tree. This is a source-level verification baseline; it does not claim
hosted, provider, demand, or customer evidence.

The 2026-08-01 catalog cutover is complete in the working tree: Offering rows
are the only durable catalog source, public catalog/discovery/inquiry surfaces
consume the Offering projection, and the retired BusinessService,
service-capability, Phase 1 bridge, and serialized projection facades are
deleted. `/api/v1/services*` remains only as an explicit Offering-to-service
compatibility projection.

The current-tree adopt-first closure also deletes the final verified generic
infrastructure reinvention: `convex/source_state.ts` and
`convex/inquiryRuntimeDbHelpers.ts` are gone, and their stringly typed
`Runtime*` database facade/dynamic row registry has been cut over to generated
Convex `DataModel`/`Doc`/`Id` types and native readers/writers. The residual
whole-repository audit found no further safe native/library substitution;
remaining custom mechanisms are domain policy, protocol integration, or
evidence-backed refusals already recorded on T41/T42.

Verification on 2026-08-01: Convex codegen passed; the focused catalog schema,
projection, suppression, observability, and boundary set passed 18/18; the
local Convex deployment accepted the narrow schema and deleted the retired
`businessServices`/`serviceCapabilities` indexes; and `npm run test:all`
completed with exit 0, including typecheck, codegen, unit, integration, type,
import, lint, and production-build gates. This remains labelled local/source
evidence, not hosted or customer evidence.

The 2026-08-02 rationalisation wave (T41 fifth pass) removed ~5,700 further
lines: dead commands/facades/aliases, single-host inquiry/outbox port
indirection, and duplicated Convex row/projection mappers now share one
implementation each (`customerRequestRouteExecutionSnapshots`,
`businessSupplyProjectionSnapshot`, `capabilitySupplyRowMappers`,
`common/json-pointer`). Refusals stayed evidence-backed (transport-schema
divergence, x402 mock behavior differences, seed-generator mismatch, CLI seed
entrypoints, shipping founder gate). `npm run test:all` exit 0 on 2026-08-02:
typecheck, codegen, unit 2,687, integration 244, types, imports, standards,
seo, ui-contract, and production build in one composite run.

The 2026-08-02 gold-standard integration wave (T41 sixth pass) aligned the
model layer with AI SDK v7 canon: one `generateText` per answer turn with
tools + `Output.object` (deferred tool-less final step), `isStepCount`/
`onStepEnd`/cacheWrite usage/failed-request accounting, semantic transport on
`Output.object` + `timeout:` with a deliberately tolerant wire schema
preserving the old failure taxonomy, and eight entropy-ledger fixes.
`@convex-dev/agent` remains blocked with evidence (0.6.4 peers ai ^6.0.35;
v7 = draft PRs #305-307); workflow/workpool usage audited canonical, raw
scheduler hops refused with at-most-once evidence. The prompting/data-flow
architecture is now a maintained map at
`.planning/codebase/PROMPT-DATA-FLOW.md` (three cited end-to-end traces,
adoption boundary, entropy ledger) linked from ARCHITECTURE.md. `npm run
test:all` exit 0: typecheck, codegen, unit 2,703, integration 244, types,
imports, standards, seo, ui-contract, production build.

Phases 1 and 2 are complete at the local control-plane evidence boundary.
ADR-009 is accepted. ADR-010 is accepted with Gate 10 narrowed. ADR-019 owns
the four-mode product destination. ADR-026 owns the one-business supply graph.

Phase 3A is complete at the labelled local/mock boundary. Phase 3B confirmed
that a second operation-owned provider can use the same paid-operation host,
semantics and query-agnostic renderer without fallback or a second product
stack.

Phase 05 source is integrated on `main`. The ADR-026 offering supply graph
(offering source/migration/supply, catalog/capability-supply/discovery/registry
projections, owner offering routes, UCP/offering manifests) and the
answer-first consumer surfaces landed via `664d533e` and `b8567dc7`, then were
extended on 2026-07-25: catalog supply can express a callable, priced
capability (`b342afa7`) and `/api/sandbox/$slug/checkup-quote` serves it to
agents and people against labelled sandbox supply (`c6f871fd`).

## Owner decision — 2026-07-25

The public-claim ceiling was removed. Deleted: `tests/copy/claims-register.test.ts`,
`tests/copy/phase1-banned-copy.test.ts`,
`tests/copy/pm05-trust-language-gate.test.ts`,
`tests/copy/discovery-overclaim.test.ts`, and the answer standing-caveat and
overclaim gates (`cfebb919`, `2cb10448`, `97b978b3`). `src/lib/ui/contract-scans.ts`
was not deleted: `cfebb919` stripped the banned-copy register from it and the
file remains in source as the architecture scanner behind nine guard tests.
`PRODUCT.md` and `DESIGN.md` were removed (`ba263c10`, recoverable at
`8dbef716`); `PROJECT.md` now owns the product destination. `AGENTS.md` was
removed in that commit but has since been re-created and is tracked as the
operating contract agents read.

Public copy is an owner judgement, not a machine-enforced ceiling. Internal
evidence classes still apply: this document must not upgrade a source or
fixture result into hosted, provider, or customer evidence.

## Verified evidence — 2026-08-01

- `npm run test:all` — clean end to end.
- TypeScript compilation, Convex code generation, lint, kernel-retirement
  verification, import boundaries, TypeScript standards, SEO contracts,
  UI contracts, and the production Vercel/Nitro build all passed.
- Unit suite: 378 files, 2,737 tests passed.
- Integration suite: 39 files, 246 tests passed.
- Type-contract suite: 1 file, 4 tests passed.
- Import-boundary suite: 12 files, 46 tests passed.
- TypeScript-standards suite: 1 file, 1 test passed.
- SEO suite: 6 files, 29 tests passed.
- UI-contract suite: 1 file, 1 test passed.
- Focused local Convex answer rate-limit verification passed after the watcher
  deployed both `answer-turn-submit` and `answer-follow-up-chips` admission
  names: 2 files, 5 tests passed.
- The production build generated `.vercel/output/nitro.json`.

## Next transition

The current gateway transition remains remediation, not only externally
configured evidence. Seven workstreams are focused-verified and the complete
Node 22 post-codegen source gate is green. ADR-034 now supplies the payout
policy; automatic-settlement source implementation remains open.
Hosted transition still requires a valid production deployment manifest, the
exact source revision, the approved strict hosted
discovery/invoke/replay/meter/revoke/withdraw receipt, independent parsing, and
the hard-capped live top-up/charge/payout block. Missing production
configuration blocks certification; it does not close the remediation campaign.

## Remaining evidence gaps

- `P5-AGENT` is met in integrated source: anonymous `POST
  /api/v1/market-operations/compare` invokes the registered inspect-only
  `registry.operations.compare` action.
- `P5-COMPARE` and `P5-HUMAN` are partial: shortlisting exists only in the
  answer surface; no URL shortlist or dedicated accessible comparison route.
- `P5-EVIDENCE` is unmet: no hosted readback, no frozen evidence packet.
- No Phase 05 browser, hosted, provider or customer evidence exists.
- WorkTree parity remains source/local-smoke evidence only: T45 atomic guest→Clerk claim rotation, T51 hosted setup seam plus deployment/evidence, and T52 counsel sign-offs with live money refused remain open. T53 recruitment/external run is retained as historical BAS-wedge provenance, not a current category or wedge frontier (`.planning/wayfinder/tickets/T45-project-identity-and-source-initialization.md`, `.planning/wayfinder/tickets/T51-hosted-parity-release-proof.md`, `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md`, `.planning/wayfinder/tickets/T53-bas-wedge-external-kill-gate.md`).

## Session

**Last session:** 2026-08-12  
**Stopped at:** Payout-policy convergence; ADR-034 selects automatic daily full-balance supplier settlement; PRA-003 source implementation, operator/legal production values, manifest validation, and hosted certification remain open.  
**Resume file:** `.planning/research/2026-08-12-p0-p1-architectural-remediation-plan.md`

### 2026-08-05 delta (Wayfinder journey)

Port the registry from 2 → 20 real operations and add a flexible admission seam. All source verified (tsc clean, unit integration green); still source/local evidence, not hosted/provider/customer.

- **Catalog cutover (real supply):** canonical curated seed now ports 20 real operation publications across 19 provider slugs — Exa (search+contents), Frankfurter, 6 keyless GET (Open-Meteo forecast/geocoding, Wikipedia REST summary, TheCatAPI, CoinGecko keyless, ipify), 4 keyed (OpenWeather, Tavily, SerpAPI, CoinGecko demo), 7 observed agentic.market x402 listings (marked Not verified / not_available_yet). Sandbox/Australian mock supply removed; registry projects real heterogeneous shapes. Files: `convex/curatedProviders.ts`, `src/modules/capability-supply/curated-cluster-{a,b,c}-publications.ts`, `src/modules/dev/internal/curated-cluster-{a,b,c}-fixtures.ts`. Provenance honesty: keyed ops credentialRef via security scheme, x402 listings `not_available_yet`.
- **Engine provider discovery (landed prior days, live-verified 08-05):** `discoverAndFilterDescriptors` (interpret-compile/discover.ts) narrows the descriptor pool via `registry.operations.search`; Convex-native `discoverCapabilitiesPort`; live `customerRequest.planPreview 'convert EUR to USD'` returns a Frankfurter preview (brick wall down). See engine-discovery lesson in memory.
- **Layer 1 — admission normalizer:** `src/modules/capability-supply/internal/admit-provider-schema.ts` — deterministic `$ref`/allOf/oneOf inlining, security-scheme credential extraction + API-key-param stripping, auto dataUse/annotation, first-guaranteed-output→evidence, dynamic-key wrap, named refusals (`admit_schema_*`). Byte-identity no-op on existing curated ops. Reuse-vs-handroll decision documented in `.planning/research/2026-08-05-tiered-capability-admission-onboarding.md` §9 (external deref lib is undeclared/ESM/edge-unsafe and does not cover AE-domain canonicalization; no true internal duplicate).
- **Layer 2 — flexible onboarding:** (a) pre-flight `validateCapabilityPublication` (read-only, named accept/refuse + actionable fix); (b) provenance tri-state `authorityMode` + `third_party_gateway`/`observed_external` threaded through domain+convex+registry (legacy digests byte-identical); (c) `observedPromotionLifecycle` — observed (inactive+`admission_unproven`, inert) promotes to active only on verified evidence + readiness gates, reusing the existing lifecycle state machine. tsc clean; capability-supply 37 files/292 tests + catalog/contract 17/109 green.

**Remaining Wayfinder gaps (unchanged in kind):** hosted MCP/HTTP discovery + representative tool-call proof from the deployed revision (#204), at least one real keyless external invocation exercising the neutral release/validation/readback path, and the #199 Agent runtime rationalization prerequisite. Catalog-prose/observed x402 entries are discoverable but never executable — refusal/observed states are honestly marked, not shipped. Sub-cent/exponent pricing and the `schema_profile_unsupported` remote-`$ref`/envelope catch-all remain documented follow-ups (see the admission design doc).
