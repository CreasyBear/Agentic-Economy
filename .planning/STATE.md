---
gsd_state_version: 1.0
milestone: protocol-kernel-product-conversion
milestone_name: Protocol/kernel to product conversion
status: wayfinder_real_catalog_deployed; hosted+external proof remains open
stopped_at: Engine NL->discovery->plan works live on real 20-op registry; tiered admission (validate + provenance tri-state + observed->real promotion) landed source-green; #204-opposed</option> hosted registry-to-engine harness + real keyless invocation evidence still open
last_updated: "2026-08-09T00:00:00Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 8
  completed_plans: 0
  percent: 17
current_phase: 05
current_phase_name: consumer-decision-support
---

# Current state

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

Branch `main`, revision `b1b105b1`. Working tree dirty: 137 modified, 11 deleted, 45 untracked (193 files) as of 2026-07-29 — uncommitted work in progress, not shipped behaviour.

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
removed in that commit but has since been re-created on disk and is the
operating contract agents read; it is currently untracked.

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

Source verification is complete. The remaining transition is evidence, not
repository repair: run the hosted readback, provider, browser, demand, and
customer evidence paths without upgrading local or fixture results into those
evidence classes.

## Remaining evidence gaps

- `P5-AGENT` is unimplemented: no `POST /api/compare`, no registered
  inspect-only comparison action.
- `P5-COMPARE` and `P5-HUMAN` are partial: shortlisting exists only in the
  answer surface; no URL shortlist or dedicated accessible comparison route.
- `P5-EVIDENCE` is unmet: no hosted readback, no frozen evidence packet.
- No Phase 05 browser, hosted, provider or customer evidence exists.
- WorkTree parity remains source/local-smoke evidence only: T45 atomic guest→Clerk claim rotation, T51 hosted setup seam plus deployment/evidence, and T52 counsel sign-offs with live money refused remain open. T53 recruitment/external run is retained as historical BAS-wedge provenance, not a current category or wedge frontier (`.planning/wayfinder/tickets/T45-project-identity-and-source-initialization.md`, `.planning/wayfinder/tickets/T51-hosted-parity-release-proof.md`, `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md`, `.planning/wayfinder/tickets/T53-bas-wedge-external-kill-gate.md`).

## Session

**Last session:** 2026-08-05T00:00:00Z
**Stopped at:** Engine natural-language→discovery→plan verified live on a real 20-operation curated registry; tiered admission (pre-flight validate + provenance tri-state + observed→real promotion) landed source-green; remaining open items are #204 hosted registry-to-engine proof + one real keyless invocation evidence.
**Resume file:** `.planning/ROADMAP.md`

### 2026-08-05 delta (Wayfinder journey)

Port the registry from 2 → 20 real operations and add a flexible admission seam. All source verified (tsc clean, unit integration green); still source/local evidence, not hosted/provider/customer.

- **Catalog cutover (real supply):** canonical curated seed now ports 20 real operation publications across 19 provider slugs — Exa (search+contents), Frankfurter, 6 keyless GET (Open-Meteo forecast/geocoding, Wikipedia REST summary, TheCatAPI, CoinGecko keyless, ipify), 4 keyed (OpenWeather, Tavily, SerpAPI, CoinGecko demo), 7 observed agentic.market x402 listings (marked Not verified / not_available_yet). Sandbox/Australian mock supply removed; registry projects real heterogeneous shapes. Files: `convex/curatedProviders.ts`, `src/modules/capability-supply/curated-cluster-{a,b,c}-publications.ts`, `src/modules/dev/internal/curated-cluster-{a,b,c}-fixtures.ts`. Provenance honesty: keyed ops credentialRef via security scheme, x402 listings `not_available_yet`.
- **Engine provider discovery (landed prior days, live-verified 08-05):** `discoverAndFilterDescriptors` (interpret-compile/discover.ts) narrows the descriptor pool via `registry.operations.search`; Convex-native `discoverCapabilitiesPort`; live `customerRequest.planPreview 'convert EUR to USD'` returns a Frankfurter preview (brick wall down). See engine-discovery lesson in memory.
- **Layer 1 — admission normalizer:** `src/modules/capability-supply/internal/admit-provider-schema.ts` — deterministic `$ref`/allOf/oneOf inlining, security-scheme credential extraction + API-key-param stripping, auto dataUse/annotation, first-guaranteed-output→evidence, dynamic-key wrap, named refusals (`admit_schema_*`). Byte-identity no-op on existing curated ops. Reuse-vs-handroll decision documented in `.planning/research/2026-08-05-tiered-capability-admission-onboarding.md` §9 (external deref lib is undeclared/ESM/edge-unsafe and does not cover AE-domain canonicalization; no true internal duplicate).
- **Layer 2 — flexible onboarding:** (a) pre-flight `validateCapabilityPublication` (read-only, named accept/refuse + actionable fix); (b) provenance tri-state `authorityMode` + `third_party_gateway`/`observed_external` threaded through domain+convex+registry (legacy digests byte-identical); (c) `observedPromotionLifecycle` — observed (inactive+`admission_unproven`, inert) promotes to active only on verified evidence + readiness gates, reusing the existing lifecycle state machine. tsc clean; capability-supply 37 files/292 tests + catalog/contract 17/109 green.

**Remaining Wayfinder gaps (unchanged in kind):** hosted MCP/HTTP discovery + representative tool-call proof from the deployed revision (#204), at least one real keyless external invocation exercising the neutral release/validation/readback path, and the #199 Agent runtime rationalization prerequisite. Catalog-prose/observed x402 entries are discoverable but never executable — refusal/observed states are honestly marked, not shipped. Sub-cent/exponent pricing and the `schema_profile_unsupported` remote-`$ref`/envelope catch-all remain documented follow-ups (see the admission design doc).
