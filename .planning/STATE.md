---
gsd_state_version: 1.0
milestone: protocol-kernel-product-conversion
milestone_name: Protocol/kernel to product conversion
status: wayfinder_source_local_smoke_verified
stopped_at: Security remediation + final-gate-3 source/local-smoke evidence verified; hosted and external gates remain open
last_updated: "2026-08-02T05:05:17Z"
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

Branch `main`, revision `b1b105b1`. Working tree dirty: 137 modified, 11 deleted, 45 untracked (193 files) as of 2026-07-29 — uncommitted work in progress, not shipped behaviour.

The 2026-08-02 WorkTree parity program (T44–T53) is landed and verified at the source + local-smoke evidence boundary: `output/release/final-gate-2.log` records `npm run test:release:source` exit 0 with 2,687 unit, 244 integration, eval 12/12 and build; `output/release/work-tree-smoke.json.log` records the labelled-local sequence `outcome → create → elaborate → study → propose → inbox → lock → receipt → reload_readback`. This does not upgrade evidence: T45 claim rotation, T51 hosted setup seam + deployment/evidence, T52 counsel sign-offs (**LIVE MONEY: REFUSED**), and T53 recruitment/external run remain open; `.planning/research/2026-08-02-hosted-parity-attempt.md` records Ready preview `dpl_F83yP9wsudjvVqrLQjB6Z65iVbYp` behind HTTP 401 protection, expired `VERCEL_OIDC_TOKEN`, no hosted Convex ID after anonymous/local dry-run refusal, and Playwright `No tests found` before the spec body; see `.planning/wayfinder/tickets/T45-project-identity-and-source-initialization.md`, `.planning/wayfinder/tickets/T51-hosted-parity-release-proof.md`, `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md` and `.planning/wayfinder/tickets/T53-bas-wedge-external-kill-gate.md`.

The same-day security remediation and post-fix evidence are recorded in the [MAP addendum](wayfinder/MAP-framework.md): `npm run typecheck` is clean and the full `final-gate-3` output exits 0 with suites `2703/244/4/50/1/29/1` and answer evaluation `12/12`, average score `9.9`. ([final-gate-3.log](../output/release/final-gate-3.log)) The local no-mock-code smoke exits 0; its packet lineage records the latest revision 7 `lock` accepted and `reload` accepted. ([T44](wayfinder/tickets/T44-green-release-baseline.md); [work-tree-smoke.json.log](../output/release/work-tree-smoke.json.log))


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
- WorkTree parity remains source/local-smoke evidence only: T45 atomic guest→Clerk claim rotation, T51 hosted setup seam plus deployment/evidence, T52 counsel sign-offs with live money refused, and T53 recruitment/external run remain open (`.planning/wayfinder/tickets/T45-project-identity-and-source-initialization.md`, `.planning/wayfinder/tickets/T51-hosted-parity-release-proof.md`, `.planning/wayfinder/tickets/T52-compliance-and-first-dollar-gate.md`, `.planning/wayfinder/tickets/T53-bas-wedge-external-kill-gate.md`).

## Session

**Last session:** 2026-08-02T05:05:17Z
**Stopped at:** Security remediation + final-gate-3 source/local-smoke evidence verified; hosted and external gates remain open
**Resume file:** `.planning/ROADMAP.md`
