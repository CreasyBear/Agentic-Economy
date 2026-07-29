---
last_mapped_commit: b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0
last_mapped_at: 2026-07-29
last_mapped_tree: e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf
worktree_dirty_files: 189
---

# Codebase Concerns

**Analysis Date:** 2026-07-29

## Implemented Reusable Seams

**Explicit registered-action seam:**
- `src/modules/actions/index.ts:1-81` is the explicit action registry. It imports module-owned action definitions, checks IDs for uniqueness, and exposes `listActions()`/`findAction()`; registration is separate from route reachability.
- New operation work should add a module-owned `*.actions.ts` contract and register it explicitly rather than relying on module-evaluation side effects or adding host-owned business rules.

**Customer Request application seam:**
- `src/modules/customer-request/application/public.ts:1-204` composes interpretation, preparation, route projection, compare/resume, standing-route, confirmation, and problem-route functions behind a public module interface.
- The file explicitly keeps Convex as a transport/auth adapter and keeps mandate, preparation, and route concerns separate. Routes and hosts should project this source-owned state rather than duplicate a compiler or authority lifecycle.

**Action Invocation control seam:**
- `src/modules/action-invocation/contracts.ts:5-150` distinguishes `request_owned` and `standalone` origins, binds actor and prepared-input data, and models refusal, uncertainty, reconciliation, effect generation, and cancellation states.
- `src/modules/action-invocation/contracts.ts:88-134` labels the view environment `MOCK/DEVELOPMENT ONLY`; this is a reusable control and evidence seam, not proof of customer-reachable execution or real-world completion.

**Registry and discovery projection seam:**
- `src/modules/registry/public.ts:29-153` owns public catalog DTOs, source-version/hash fields, projection status, index status, and public catalog surfaces.
- Reuse registry/discovery projections for public reading and comparison. Treat listing inventory, source readback, routeable supply, recommendation, provider acceptance, and customer value as separate facts.

**Bounded payment-transport seam:**
- `src/modules/capability-supply/route-transport-runtime.ts:28-145` binds route transport to an attempt, operation and mandate digests, capability-contract digest, maximum spend, expiry, and payment status observations.
- `src/modules/capability-supply/internal/x402-payment-signer.ts:1-42` isolates x402/viem signing. `src/lib/ui/contract-scans.ts:44-76,346-350` allows the reviewed signer exception while guarding other money/protocol imports. These are source/fixture transport controls; they do not establish customer checkout, custody, settlement, payouts, booking, or fulfilment.

## Tech Debt

**Mixed committed and uncommitted source state:**
- The map anchor is commit `b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0`, while the working tree contains 137 modified files, 7 deleted files, and 45 untracked files: 189 files of uncommitted worktree state.
- Impact: source inspection can describe provisional behavior that is not in the anchor commit, and a generated map or test result can be mistaken for shipped behavior.
- Fix approach: keep map evidence, committed history, and dirty worktree changes distinct; commit or discard unrelated work only under its owning workflow.

**Very large source and test modules:**
- Representative files exceed 500 lines: `convex/registry.ts` (1,832), `src/modules/discovery/developer-discovery.ts` (1,562), `tests/integration/customer-request-v2-multi-capability-route.test.ts` (3,718), `tests/unit/action-invocation/dynamic-published-operation.test.ts` (2,117), and `src/components/ae/chat/AeChat.tsx` (821).
- Impact: ownership, failure boundaries, and focused verification become harder to identify; changes invite broad regressions or duplicated orchestration.
- Fix approach: split only at existing source-owned seams, preserve public module APIs, and keep scenario fixtures/helpers separate from transition assertions.

**Migration aliases remain in public type surfaces:**
- `src/modules/customer-request/customer-projection.ts:85-89` retains `CustomerOptionsProjection` with an `@deprecated` compatibility alias.
- Impact: callers can continue to encode the older projection shape and make removal of the migration path difficult to measure.
- Fix approach: migrate callers to `CustomerRequestView`, add a focused compatibility-removal check, and delete the alias only after all current callers are moved.

**Deprecated observability exports coexist with replacement storage:**
- `convex/observability.ts:435-471` retains deprecated funnel-event and funnel-summary exports while the comments direct funnel storage/counts to PostHog.
- Impact: the old Convex API and the replacement observability source can be mistaken for equivalent sources of truth.
- Fix approach: keep the compatibility boundary explicit, migrate callers, and bound any remaining admin read before removing deprecated exports.

## Known Bugs

**No confirmed runtime defect established by this static map:**
- The concerns inventory found source hazards, migration residue, and test exclusions, but no executed reproduction was run for a product runtime failure.
- The absence of a confirmed bug is not evidence of readiness; the 189-file uncommitted state means behavior may still be provisional.

**Chromium-only responsive proof:**
- `tests/e2e/paid-operation-development-surface.spec.ts:98-105` skips the 320px/400%-zoom overflow scenario unless the Playwright browser is Chromium.
- This is an intentional proof-contract exclusion rather than a confirmed UI defect. Non-Chromium responsive behavior remains outside that scenario's evidence.

**Compact-viewport journey exclusion:**
- `tests/e2e/thread-first.spec.ts:31` skips the recent-questions sidebar scenario for the `compact-chromium` project because that sidebar is not shown by default there.
- The skip should remain visible in coverage interpretation; it must not be reported as proof that the compact layout supports the sidebar.

## Security Considerations

**Identity and authority remain separate boundaries:**
- `src/lib/server/customer-request-agent-auth.ts:23-73` authenticates API-key type, scope, current key identity, revocation/expiry, and then returns a principal. The authenticated principal is not itself a consequential-action authority.
- `src/modules/action-invocation/contracts.ts:32-51,137-186` carries exact origin, actor, prepared material, authority reference, idempotency, and reconciliation refusal states. Any new effect must preserve those bindings rather than treating identity, an action reference, or a model result as approval.

**Module and transport imports are actively guarded:**
- `src/lib/ui/contract-scans.ts:59-86` rejects backup/planning imports and private-module imports, and quarantines money/protocol SDK imports to reviewed adapters.
- `tests/imports/capability-contract-boundaries.test.ts:7-48` checks that the neutral capability contract does not absorb provider, transport, routing, or publication ownership. These are boundary/refusal guards, not product capabilities.

**Public claim guards are negative-only controls:**
- `tests/e2e/public-owner-ui.spec.ts:20-25` rejects public copy containing unsupported booking, payment, wallet, custody, settlement, x402, protocol, and internal-architecture terms.
- `tests/e2e/protected-action-owner-flow.spec.ts:3-4` similarly defines forbidden future-surface copy. These tests keep public claims narrow; their vocabulary must not be read as evidence that the guarded features exist.

**Payment credentials and effects need an evidence ceiling:**
- `src/modules/capability-supply/route-transport-runtime.ts:98-145` models credential resolution, payment authorization, possible submission, provider assertion, and unknown states with explicit continuation data.
- `src/modules/capability-supply/internal/x402-payment-signer.ts:12-35` signs a labelled request from a supplied private key. Source or fixture signing does not prove production credential custody, settlement, provider fulfilment, or customer-reachable payment.

## Performance Bottlenecks

**Unbounded duplicate-claim read:**
- `convex/business.ts:552-560` queries `claimFingerprints` with `.collect()` and then consumes only the first row.
- Impact: duplicate detection reads grow with matching rows and can consume Convex transaction/read capacity.
- Improvement path: use `.unique()` where the invariant is enforced, or a bounded `.take()`/paginated read with an explicit duplicate policy.

**Generic full-table collector hides growth:**
- `convex/source_state.ts:461-463` exposes a generic `collect()` helper that materializes every row in a named table.
- Impact: callers can add growing tables to compatibility loading without making the read bound visible at the call site.
- Improvement path: replace generic collection with operation-specific indexed reads and explicit limits; keep migration batches bounded.

**Admin observability summary collects all state:**
- `convex/observability.ts:444-466` collects all `ownerActivationState` rows before counting stages.
- Impact: admin summaries become more expensive as tracked owners grow and can exceed practical query limits.
- Improvement path: maintain bounded counters or paginate/aggregate by indexed stage while retaining an explicit as-of value.

**Repository-scale review cost:**
- The large files listed in Tech Debt concentrate registry, discovery, action-invocation, and Customer Request behavior. This increases parse, typecheck, and scenario-isolation cost even where individual reads are indexed.
- Improvement path: use module-owned public/internal seams and focused tests; do not solve scale by adding a second runtime or duplicating projections.

## Fragile Areas

**Action registration versus actual reachability:**
- Files: `src/modules/actions/index.ts:1-11,39-71`, `src/modules/registry/public.ts:73-88`.
- Why fragile: a registered descriptor or public DTO can exist without a real host adapter or customer-reachable route.
- Safe modification: trace one action through its source owner, intended route/host, identity check, and focused test before making reachability claims.
- Test coverage: registry/action tests and import guards cover contract shape; they do not by themselves prove every declared surface is reachable.

**Customer Request migration surface:**
- Files: `src/modules/customer-request/application/public.ts:1-7,46-118`, `src/modules/customer-request/customer-projection.ts:78-89`.
- Why fragile: the application seam contains many distinct transitions while the deprecated projection alias preserves an older result shape.
- Safe modification: add behavior to the application/source-owned seam, preserve request lineage and exact revisions, and migrate aliases deliberately; do not place a second compiler or authority lifecycle in a route.
- Test coverage: focused application and Customer Request suites exist, but this map did not execute them.

**x402 adapter and neutral routing boundary:**
- Files: `src/modules/capability-supply/route-transport-runtime.ts:28-145`, `src/modules/capability-supply/internal/x402-payment-signer.ts:1-42`, `src/lib/ui/contract-scans.ts:44-76`.
- Why fragile: transport status fields include payment authorization and settlement observations, while neutral route state must remain honest about unknown effects.
- Safe modification: keep adapter-specific signing and reconciliation inside the reviewed transport seam; never convert a challenge, signature, receipt, or provider assertion into proof of real-world work.
- Test coverage: `tests/unit/capability-supply/route-transport-runtime.test.ts:13-40` uses labelled authority and provider fixture values; it is not production payment evidence.

## Scaling Limits

**Convex reads can grow without visible bounds:**
- `convex/_generated/ai/guidelines.md:242-250` requires indexed, bounded reads or pagination instead of unrestricted `.collect()` for data that is not explicitly all-results.
- `convex/business.ts:552-556`, `convex/source_state.ts:461-463`, and `convex/observability.ts:452-465` currently contain collection patterns that require a table-growth review.
- Limit: larger claims, source-state tables, or owner populations can turn currently acceptable local reads into transaction-limit or latency failures.

**Large aggregate and projection surfaces:**
- `convex/registry.ts`, `src/modules/discovery/developer-discovery.ts`, and the Customer Request application tree concentrate broad projection and routing behavior.
- Limit: adding another cross-cutting concern to these files increases coupling and makes focused verification less reliable.
- Scaling path: preserve module-owned schema/public seams, bound Convex work, and add one transition with one executable failure/recovery proof at a time.

**Dirty worktree cannot serve as a clean capacity baseline:**
- The measured state is 137 modified, 7 deleted, and 45 untracked files (189 total) as uncommitted work in progress.
- Limit: performance, coverage, and reachability observations from this tree cannot be attributed solely to `b1b105b1` without isolating the provisional changes.

## Dependencies at Risk

**x402 and viem are high-consequence adapter dependencies:**
- `package.json:81-83,96-97` pins `@x402/core`, `@x402/evm`, `@x402/extensions`, and `viem`; the runtime import is intentionally isolated in `src/modules/capability-supply/internal/x402-payment-signer.ts:1-8`.
- Risk: SDK changes can affect signing and challenge parsing at the adapter boundary, while accidental imports into neutral modules would widen the money/protocol surface.
- Mitigation: keep the reviewed import exception narrow and retain `src/lib/ui/contract-scans.ts:346-350` as the explicit allow-list boundary.

**Generated Convex guidance and schema coupling:**
- `convex/_generated/ai/guidelines.md:242-250` is the installed Convex query guidance, while source adapters such as `convex/source_state.ts:461-463` and `convex/business.ts:552-556` encode the actual read behavior.
- Risk: generated guidance can be followed in new code while older compatibility adapters continue to violate bounded-read expectations.
- Migration plan: audit affected call sites with focused schema/query tests and change source ownership at the adapter rather than weakening the rule.

**Customer Request compatibility alias:**
- `src/modules/customer-request/customer-projection.ts:85-89` is an explicit deprecated dependency for callers of `CustomerOptionsProjection`.
- Risk: the alias keeps old consumers compiling while masking whether all callers use the current `CustomerRequestView` contract.
- Migration plan: inventory and migrate callers, then remove the alias with focused type and application checks.

## Missing Critical Features

**Unified account, membership, and commercial owner:**
- The module inventory under `src/modules/` has business, catalog, capability-supply, Customer Request, action-invocation, registry, and settings owners, but no separate `billing` or `commercial` module directory was present in the current listing.
- Existing commercial fields in `src/modules/capability-supply/public.ts:67-119` describe supply relationships and offering metadata; they are not an account entitlement or product-usage ledger.
- Missing: a source-owned account principal, membership/role model, account-scoped commercial state, and immutable usage records with bounded readback.

**Production evidence for consequential external effects:**
- `src/modules/action-invocation/contracts.ts:88-94` labels invocation views `MOCK/DEVELOPMENT ONLY`, and `tests/unit/capability-supply/route-transport-runtime.test.ts:27-40` uses fixture endpoint/credential references.
- Missing: hosted or independent provider evidence that would establish customer-reachable booking, payment, custody, settlement, payouts, fulfilment, or customer value. Payment terms in guard/refusal code remain policy boundaries unless a specific intended surface and effect prove otherwise.

**Bounded public and admin read models:**
- `convex/source_state.ts:461-463` and `convex/observability.ts:452-465` lack a generally visible bounded/paginated pattern for their full-table helper and owner summary.
- Missing: explicit as-of, cursor, aggregation, and retention behavior where populations can grow; this is a scaling and operations gap rather than a claim that the current reads already fail.

## Test Coverage Gaps

**Production and hosted evidence boundary:**
- `tests/unit/capability-supply/route-transport-runtime.test.ts:13-40` exercises deterministic authority and fake provider transport values.
- Not tested: deployment reachability, production credentials, independent provider outcome, customer fulfilment, or customer value. Risk: a green fixture test could be over-read as production payment or outcome proof. Priority: High whenever the surface is presented as customer-reachable.

**Identity and authority cross-boundaries:**
- `src/lib/server/customer-request-agent-auth.ts:40-73` checks API-key authentication and scope, while `src/modules/action-invocation/contracts.ts:32-51` models exact action refusal codes.
- Not tested by this mapping: every cross-principal, stale-authority, material-input, replay, uncertain-effect, and post-release cancellation combination across all current hosts. Risk: an adapter can accidentally broaden an identity check into authority. Priority: High for consequential changes.

**Scale regressions in Convex reads:**
- `convex/business.ts:552-556`, `convex/source_state.ts:461-463`, and `convex/observability.ts:452-465` are concrete collection sites.
- Not tested by this mapping: behavior at growing table sizes, transaction-limit boundaries, pagination, or counter reconciliation. Risk: local fixtures remain small while production-shaped data becomes slow or fails. Priority: Medium now, High before broadening these populations.

**Skipped browser dimensions:**
- `tests/e2e/paid-operation-development-surface.spec.ts:98-105` and `tests/e2e/thread-first.spec.ts:31` intentionally skip declared browser/viewport cases.
- Not tested: those skipped combinations. Risk: the proof contract is narrower than a general browser-compatibility claim. Priority: Medium for UI changes crossing those dimensions.

## Evidence Ceiling

- This map is based on current on-disk source reads, the Stage-A concerns inventory, representative line counts, and the measured dirty-worktree status. It does not include a test run, browser run, provider call, deployment, schema mutation, or hosted readback.
- The map is anchored to commit `b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0`, tree `e6a09cd838ecd86ccb4b6693b5d25a58fc85bddf`, with 189 files of uncommitted worktree state. Claims about provisional files must not be promoted to committed or shipped behavior.
- Static guards, refusal codes, payment-status models, fixtures, and compatibility names document boundaries and development semantics. They do not establish readiness, booking, fulfilment, wallets, credits, custody, settlement, payouts, production payment, or customer value.
- Verification remains evidence-class specific: source inspection proves source shape; focused tests prove their declared fixtures; labelled local/dev flows prove development contracts only. The earliest unproven intended-surface boundary must remain explicit.

---

*Concerns audit: 2026-07-29 (commit b1b105b1e07a46f637f4dcfb33537eaf4dca6bc0)*
