# Codebase Concerns

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `3463c1d4` (post residual deepen campaign Waves 33–37 CLOSED)

## Campaign status (Waves 23–37 CLOSED)

**Waves 23–32 CLOSED.** **Waves 33–37 CLOSED.**

| Wave band | Outcome |
|-----------|---------|
| 23–26 | Inquiry source-state / notification / serializers / host thinness — **host-done** |
| 27 | ADR-011 journal write-plan ports — **Accepted** |
| 28 | Evidence load assembly ports — done |
| 29 | Journal machines (`startOrResume` / `leaseNextDispatch` / `recordOutcome`) behind ADR-011 — done |
| 30 | `capabilitySupply` graph/probe ports — **host-done** |
| 31 | Hosted-agent-journey kernel + scenarios split — done |
| 32 | `catalog-from-rows` shared by registry/discovery — done |
| 33 | ADR-012 cancel machines + `CancelMutationPorts` — done |
| 34 | ADR-012 problem mutation family + `ProblemMutationPorts` — done |
| 35 | Success-outcome / JournalPorts helper split (ports under ~1k) — done |
| 36 | Inquiry dual-path factory + `local-e2e-adapter` — done |
| 37 | Shared outbox persistence + thin inquiry notification bridge — done |

**ADRs:** ADR-011 (start/lease/outcome) + ADR-012 (cancel + problem) — both **Accepted**.  
**Waves 38–42 (in progress):** ADR-013 dispatch lifecycle ports — **Accepted** (Wave 38 design unlock). Wave 39 implements recover/mark/open behind `DispatchLifecyclePorts`. See `.planning/adr/ADR-013-route-dispatch-lifecycle-ports.md` and `.planning/codebase/WAVES-38-42-PLAN.md`.

### Verified line counts (`wc -l` at `3463c1d4`)

| File | Lines | Residual status |
|------|------:|-----------------|
| `convex/customerRequestApplication.ts` | **1749** | Host-done. Validators forever; size residual only. |
| `convex/registry.ts` | **1622** | Catalog-from-rows shared (Wave 32); search/admission size residual. |
| `convex/discovery.ts` | **1565** | Catalog-from-rows shared (Wave 32); manifest size residual. |
| `convex/customerRequestV2.ts` | **1492** | Undeepened bulk host — optional ports-per-family residual. |
| `convex/inquiries.ts` | **1435** | Host-done (Waves 23–26). Size residual. |
| `convex/notificationOutbox.ts` | **1287** | Shared persist (Wave 37); further outbox families optional. |
| `convex/customerRequestRouteExecution.ts` | **1178** | ADR-011 + ADR-012 machines; recover/mark + `exportProblemForSupport` residual. |
| `convex/customerRequestRouteExecutionJournalPorts.ts` | **979** | Wave 35 success-outcome split; under ~1k ceiling. |
| `src/modules/inquiries/inquiry.functions.ts` | **901** | Dual-path factory (Wave 36); local-e2e-adapter extracted. |
| `convex/capabilitySupply.ts` | **804** | Host-done graph/probe (Wave 30). |
| `convex/customerRequestRouteExecutionCancelPorts.ts` | **392** | Wave 33 adapter. |
| `convex/customerRequestRouteExecutionProblemPorts.ts` | **259** | Wave 34 adapter. |
| `convex/inquiryNotificationBridge.ts` | **123** | Thin; shared persistence (Wave 37). |

Thinness locks: `tests/unit/customer-request/route-execution/{machines,journal,problem-mutation,evidence-load}-thinness.test.ts`, `tests/unit/customer-request/application/*-thinness.test.ts`, `tests/unit/capability-supply/*-thinness.test.ts`, `tests/unit/inquiries/*-thinness.test.ts` (incl. `notification-bridge-thinness`).

---

## Locked deepen practices

Future deepen work **must** follow these practices (campaign gold + ADR-011 + ADR-012). Violations are regressions, not progress.

### 1. Provide-facts ports pattern (gold)

Mirror `provideFacts`:

1. Module-owned ports type + pure orchestration under `src/modules/...` (e.g. `src/modules/customer-request/application/provide-facts/`).
2. Thin Convex adapter: `convex/*Ports.ts` (e.g. `convex/customerRequestProvideFactsPorts.ts` → `provideFactsPorts(ctx)`).
3. Host keeps validators + thin registration only — see `convex/customerRequestApplication.ts` `export const provideFacts`.

**Deletion test:** removing the module orchestration must concentrate complexity in the module (or fail tests) — Convex sibling chops without ports fail this test.

Do **not** re-embed orchestration in the Convex host after a ports deepen.

### 2. No `WritePlan` in journal or machines

Forbidden identifiers under `src/modules/customer-request/route-execution/journal/` and `machines/`:

- `WritePlan`, `writePlan`, `intendedPatches`

Ports expose **semantic, immediately executed** commits (e.g. `commitSucceededOutcome`, `grantDispatchLease`). Do not return patch-list DTOs for a later apply step. Enforced by thinness tests.

### 3. No Start / Lease / Outcome sibling chops

**Hard ban** — do not create:

- `convex/customerRequestRouteExecutionStart.ts`
- `convex/customerRequestRouteExecutionLease.ts`
- `convex/customerRequestRouteExecutionOutcome.ts`

Shallow Convex sibling splits move lines without deepening write authority and risk duplicated write sequences. Keep a single host export surface; deepen through `machines/` + `*Ports.ts` (ADR-011).

### 4. No Cancel / Problem sibling chops

**Hard ban** — do not create:

- `convex/customerRequestRouteExecutionCancel.ts`
- `convex/customerRequestRouteExecutionProblem.ts`

Same rationale as §3. Cancel/problem deepen uses dedicated `CancelMutationPorts` / `ProblemMutationPorts` + `machines/` (ADR-012). Enforced by `machines-thinness.test.ts`.

### 5. Dedicated port families — do not grow JournalPorts for cancel/problem

- Journal machines → `JournalMutationPorts` / `convex/customerRequestRouteExecutionJournalPorts.ts`
- Cancel machines → `CancelMutationPorts` / `convex/customerRequestRouteExecutionCancelPorts.ts`
- Problem machines → `ProblemMutationPorts` / `convex/customerRequestRouteExecutionProblemPorts.ts`

Do **not** absorb cancel/problem into `JournalMutationPorts` to “save a file.” Adapter ceiling ~**1000 lines** per ports file (thinness asserts `<= 1000`).

### 6. Validators stay in Convex forever

Convex `v.*` args/returns and `Doc`/`Id` mapping stay host-side. Do not move validators into `src/modules` with machines. Ports speak domain snapshots / semantic ops, not Convex document types.

### 7. Do not reopen closed deepens as line-count chops

Closed and locked — change only via the existing ports seam when semantics require it:

- Application command set (provide-facts, confirm-route, refine, …)
- Supply writers / eligibility / publication / ledger / graph-probe
- Inquiry source-state / notification / serializers / dual-path factory
- Journal integrity/evidence/decisions + start/lease/outcome machines
- Cancel + problem mutation machines (Waves 33–34)
- Evidence-load; hosted-agent-journey scenarios; catalog-from-rows
- Shared outbox persistence + inquiry notification bridge (Wave 37)

**ADR-002** governed-send stays inquiry-owned — do not relocate send authority into outbox or Application hosts.

### 8. Atomicity at the mutation boundary

Machine orchestration may call many port methods, but production durability remains **one** Convex `internalMutation` / `internalQuery` registration. Application / workers must keep calling the same `internal.customerRequestRouteExecution.*` paths — never bypass mutations to call module machines directly from ActionCtx.

---

## Tech Debt

**Route-execution recover / mark helpers (Wave 39 gated on ADR-013):**
- Issue: ADR-012 left recover/mark host glue out of Waves 33–34. Still host-owned: `recoverExpiredDispatch`, `markDispatched`, `recordNotReleased`, `markAccepted`, `openLeasedDispatch`.
- Files: `convex/customerRequestRouteExecution.ts` (1178); transport worker callers in `convex/customerRequestRouteTransportWorker.ts`
- Impact: Dispatch recovery/mark sequences remain concentrated in the host; wrong extract risks lease/outbox desync.
- Fix approach: **ADR-013 Accepted** — Wave 39 implements `DispatchLifecyclePorts` + `convex/customerRequestRouteExecutionDispatchPorts.ts`; do not grow Journal/Cancel/Problem ports; no sibling chops.

**`exportProblemForSupport` (optional thin residual):**
- Issue: Fat support export query still lives on the route-execution host after Wave 34 problem mutations moved.
- Files: `convex/customerRequestRouteExecution.ts` (`exportProblemForSupport`); related problem reads may still be thicker than action thinness.
- Impact: Support export changes risk colliding with mutation deepen diffs.
- Fix approach: Prefer thin ports adapter when under ~1k; keep Application `problem-route/` thinness (`export-support.ts`) — do not re-thicken Application actions.

**Further outbox families (optional residual):**
- Issue: Wave 37 closed shared dispatch persist + thin bridge; `notificationOutbox.ts` still owns webhook ingest / retry / operator surfaces.
- Files: `convex/notificationOutbox.ts` (1287), `convex/notificationOutboxPersistence.ts`, `convex/inquiryNotificationBridge.ts` (123)
- Impact: Outbox host remains a merge hotspot; inquiry enqueue must stay inquiry-owned.
- Fix approach: Next family deepen (webhook / retry) behind ports; keep inquiry enqueue/bind inquiry-owned (ADR-002); do not re-inflate bridge past thinness.

**`customerRequestV2` host bulk:**
- Issue: V2 aggregate, route-plan generation, and evaluation wiring still concentrate in one Convex host.
- Files: `convex/customerRequestV2.ts` (1492); sibling preparation surfaces under `convex/customerRequestV2*.ts`
- Impact: High merge conflict / review cost; accidental coupling to Application and capability-supply hosts.
- Fix approach: Ports deepen per operation family using provide-facts pattern; leave validators in Convex; legacy retirement is a product gate (`legacyAggregateIsInternallyConsistent`, `kind: 'legacy'`).

**Registry / discovery size residual:**
- Issue: After Wave 32 `catalog-from-rows`, both hosts remain ~1.5k+ lines (validators, admission, row mapping).
- Files: `convex/registry.ts` (1622), `convex/discovery.ts` (1565)
- Impact: Diff noise; temptation to re-chop without ports.
- Fix approach: Only deepen when a concrete operation family needs a seam; preserve catalog-from-rows sharing; do not invent parallel catalog mappers.

**Application validators forever (size residual, not a reopen wave):**
- Issue: `convex/customerRequestApplication.ts` (1749) is host-done; residual mass is largely Convex validators + thin action shells.
- Files: `convex/customerRequestApplication.ts`; thinness under `tests/unit/customer-request/application/*-thinness.test.ts`
- Impact: Large diffs on validator edits; false urge to “split Application.”
- Fix approach: Never reopen Application deepen as a line-count project; validators stay in Convex forever (§6); deepen only when a new command family needs ports.

**Dual customer surfaces (Answer Thread vs Customer Request):**
- Issue: Public product is split across `/` (Answer Thread + registry search) and `/engine` (authenticated Customer Request), plus `/api/v1/requests` for agents. Multi-capability RoutePlans persist internally but stay below customer projection.
- Files: `PRODUCT.md`, `AGENTS.md`, `src/modules/answer-thread/`, `src/modules/customer-request/`, `src/components/ae/chat/AeChat.tsx`, `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`
- Impact: New Answer Thread semantics create a second intent/history path; assistants and humans can disagree about which surface is canonical.
- Fix approach: Keep Answer Thread read/compare/inquiry-only; route all Request/RoutePlan/authority work through `src/modules/customer-request/`; prove human cutover before collapsing `/engine`.

**Legacy Customer Request v1 compilers retained:**
- Issue: Parallel legacy compilers remain beside the current Customer Request path.
- Files: `src/modules/customer-request/legacy-v1.ts`, `src/modules/customer-request/legacy-compiler-v1.ts`, `convex/customerRequestV2.ts` (legacy aggregate integrity)
- Impact: Dual code paths; easy to fix the wrong compiler; integrity failures surface as typed throws.
- Fix approach: Bound legacy reads with an explicit retirement gate; stop writing legacy aggregates; delete compilers once migration tests prove no remaining rows.

**Bespoke `Ae*` UI vs Astryx mandate:**
- Issue: Large `src/components/ae/**` remains primary UI while `AGENTS.md` forbids extending bespoke `Ae*` presentation and requires Astryx first.
- Files: `src/components/ae/**`, `AGENTS.md`, `.agents/skills/ae-design-system/SKILL.md`
- Impact: New UI work extends `Ae*` instead of Astryx; design-system drift.
- Fix approach: Re-skin onto `@astryxdesign/core` + `@astryxdesign/theme-neutral`; do not add new `Ae*` presentation components.

## Known Bugs

**Not detected as open source bugs in this pass.** Prefer failing thinness / integration tests over undocumented folklore. If recover/mark, cancel-interleaved outcomes, or outbox webhook races surface, capture with executable reproduction under `tests/integration/` or route-execution unit suites before claiming a bug.

## Security Considerations

**Local E2E auth bypass dual-path:**
- Risk: Mis-set bypass env exposes fixture/local inquiry mutation paths that skip real Clerk/source admission.
- Files: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/internal/local-e2e-adapter.ts`, `src/lib/server/local-e2e-bypass.ts`
- Current mitigation: Gated by explicit local E2E flag helpers; fixture material clearly named `local-e2e-*`.
- Recommendations: Keep bypass impossible in production builds; never call local path from agent tools.

**Claim / authority boundary (product, not a code hole):**
- Risk: Assistants or UI copy overclaim booking, payment, dispatch, or verified status.
- Files: `AGENTS.md`, `PRODUCT.md`, `src/modules/actions/`, agent tools surfaces
- Current mitigation: Action `boundaries`, public-copy tests (`npm run test:copy`), agent-journey gates.
- Recommendations: Any new write surface must declare boundaries before `agentTools` exposure.

**Clearance + quiet agent door write admission:**
- Risk: Collapsing WBA identity → tool scope → clearance/source-write admission → `allowWrites` reopens authorization bugs.
- Files: `src/routes/api.agent.tools.ts`, `src/modules/clearance/**`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`
- Current mitigation: Fail-closed layered admissions; refusal taxonomies.
- Recommendations: Follow `.agents/skills/ae-agent-identity-and-mandates/SKILL.md` and `.agents/skills/ae-agent-surfaces/SKILL.md`; never treat signature as permission.

**Storefront import SSRF (mitigated — do not regress):**
- Risk: Authenticated `storefront.importDraft` fetching private/metadata URLs.
- Files: `src/modules/storefront/internal/import-draft.ts`, `src/modules/network-guard/public.ts`, `tests/unit/storefront/import-draft.test.ts`
- Current mitigation: Manual redirects with per-hop re-guard, DNS/literal private-range rejection, connect-time guarded undici lookup, timeout, 2 MiB cap.
- Recommendations: Preserve hermetic network-guard tests on any importer change.

**Convex `node:*` bundling trap:**
- Risk: Transitively importing Node builtins into query/mutation graphs breaks `npm run check:convex-codegen`.
- Files: `.agents/skills/ae-convex-guardrails/SKILL.md`; safe pattern `convex/capabilityCheck.ts`
- Current mitigation: `"use node"` only on action-only files; keep Node helpers out of `convex/` import graphs.
- Recommendations: Follow diagnostic order in ae-convex-guardrails before “fixing” schema.

## Performance Bottlenecks

**Route-execution projection reads:**
- Problem: Outcome/cancel/problem/recover paths repeatedly rebuild run projections via ports helpers such as `readRunProjection`.
- Files: `convex/customerRequestRouteExecutionJournalPorts.ts`, host recover/mark handlers in `convex/customerRequestRouteExecution.ts`
- Cause: Integrity requires fresh projection after each patch sequence.
- Improvement path: Keep projection assembly shared; avoid duplicate scans when deepening recover/mark; do not cache across mutations.

**Catalog hosts still large:**
- Problem: Registry/discovery hosts remain ~1.5k+ lines despite Wave 32 catalog-from-rows.
- Files: `convex/registry.ts` (1622), `convex/discovery.ts` (1565)
- Cause: Validators, admission, and row mapping still co-located.
- Improvement path: Further ports only when a measured hot path or conflict cost justifies it.

**Customer Request workspace client payload:**
- Problem: Workspace shell still owns a large interactive surface for `/engine`.
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/route-plan-customer-projection.ts`
- Cause: Clarification, options, authority, and recovery compose a large client surface.
- Improvement path: Lazy-load non-first-paint panels; keep projection families in the customer-request module, not in Convex hosts.

## Fragile Areas

**Route-execution journal + machines + host triad:**
- Files: `src/modules/customer-request/route-execution/journal/`, `machines/`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteExecution{Journal,Cancel,Problem}Ports.ts`
- Why fragile: Integrity digests, lease atomicity, cancel/problem interplay with success outcomes; thinness tests encode hard bans (§2–§5).
- Safe modification: Change predicates in `journal/`; orchestration in `machines/`; persistence only via ports; run `machines-thinness` + `journal-thinness` + `problem-mutation-thinness` + `tests/integration/customer-request-v2-multi-capability-route.test.ts`.
- Test coverage: Strong for start/lease/outcome/cancel/problem thinness; recover/mark helpers still host-owned without equivalent machine locks.

**Recover / mark dispatch helpers:**
- Files: `convex/customerRequestRouteExecution.ts` (`recoverExpiredDispatch`, `markDispatched`, `recordNotReleased`, `markAccepted`, `openLeasedDispatch`); `convex/customerRequestRouteTransportWorker.ts`
- Why fragile: Lease expiry recovery and dispatch marking must stay consistent with journal lease/outcome machines; easy to desync outbox vs attempt state.
- Safe modification: Prefer journal predicates for decisions; deepen only behind ports with thinness locks; keep worker calling the same internal exports.
- Test coverage: Integration coverage exists; dedicated recover/mark thinness not equivalent to machines-thinness.

**Problem-route action vs mutation split:**
- Files: `src/modules/customer-request/application/problem-route/`, `convex/customerRequestProblemRoutePorts.ts`, problem `internalMutation`s / queries in `customerRequestRouteExecution.ts`
- Why fragile: Application thinness can look “done” while fat queries like `exportProblemForSupport` still own support projection.
- Safe modification: Do not move Convex validators into modules; thin support export via ports if needed; keep `problem-route-thinness.test.ts` green.
- Test coverage: Action thinness covered; support-export thinness optional residual.

**Inquiry dual-path:**
- Files: `src/modules/inquiries/inquiry.functions.ts` (901), `src/modules/inquiries/internal/local-e2e-adapter.ts`
- Why fragile: Two behavioral stacks; E2E may only exercise local path.
- Safe modification: Change both paths or gate features behind shared domain functions; prove with Convex-backed tests for production claims.
- Test coverage: Dual-path parity not exhaustive (Wave 36 residual).

**Capability supply quarantine / publication / probe:**
- Files: `convex/capabilitySupply.ts` (804), `src/modules/capability-supply/**`, `tests/unit/capability-supply/convex-host-thinness.test.ts`
- Why fragile: Offerings, bindings, eligibility, publication, and readiness must all be current for routeable supply.
- Safe modification: Use existing command mutations; never short-circuit eligibility hashes; do not reopen graph/probe as a line-count chop.
- Test coverage: Substantial unit coverage; production useful-supply proof still separate from sandbox.

**Import / copy / claim boundary scanners:**
- Files: `src/lib/ui/contract-scans.ts`, `tests/copy/**`, `tests/imports/**`, `tests/ui-contract/**`
- Why fragile: Product honesty depends on mechanical scans; stale allowlists drift.
- Safe modification: Run `npm run test:copy`, `test:imports`, `test:ui-contract` on surface changes.
- Test coverage: Broad; keep scanners aligned with actual tree.

## Scaling Limits

**Convex host god-files:**
- Current capacity: Multi-thousand-line hosts still load; review/human bandwidth is the limit, not runtime.
- Limit: Merge conflict rate and accidental authority duplication as more workers deepen in parallel.
- Scaling path: Ports-per-operation-family; keep one registration host per domain surface; ~1k adapter ceiling.

**Convex document size (1 MiB):**
- Current capacity: Per-document ~1 MiB hard limit; unbounded arrays rewrite whole documents on update.
- Limit: High-churn inquiry threads, route execution journals, or supply audit blobs without child tables.
- Scaling path: Keep high-churn children in separate tables (`tests/unit/schema/convex-schema.test.ts`); see `convex/_generated/ai/guidelines.md`.

**Notification outbox throughput:**
- Current capacity: Module + host dispatch loop in `convex/notificationOutbox.ts` (1287).
- Limit: Provider rate limits and webhook ordering; not fully characterized in this map.
- Scaling path: Provider adapters stay module-owned; host stays thin admission + persistence; deepen further families behind ports.

## Dependencies at Risk

**Design-system migration pressure:**
- Risk: Legacy behavioral UI vs Astryx-first rule in `AGENTS.md` / `ae-design-system`.
- Impact: New UI that reintroduces bespoke/`Ae*` or shadcn patterns creates dual systems.
- Migration plan: Astryx primitives first (`@astryxdesign/core`, `@astryxdesign/theme-neutral`); Tailwind as layout glue only.

**Convex codegen vs TypeScript typecheck split:**
- Risk: `check:convex-codegen` disables typecheck; TS errors only via `npm run typecheck`.
- Impact: Green codegen with red types (or the reverse) misleads narrow verification.
- Migration plan: Always run both for Convex changes (ae-convex-guardrails, ae-verification-gates).

## Missing Critical Features

**Customer-visible multi-capability RoutePlan / full Approve→Run lifecycle:**
- Problem: Target Request → RoutePlan → Approve → Run → Inspect is architectural; customer projection and public claims remain narrower (`PRODUCT.md` / `AGENTS.md`).
- Blocks: Public marketing or assistant tools that imply booking, dispatch, or autonomous fulfillment.

**Recover / mark / support-export machine deepen (optional):**
- Problem: Unlike start/lease/outcome/cancel/problem, recover/mark helpers and fat `exportProblemForSupport` lack equivalent machine+ports thinness locks.
- Blocks: Safe further reduction of `customerRequestRouteExecution.ts` below the recover/mark + support-export residual.

## Test Coverage Gaps

**Recover / mark dispatch thinness:**
- What's not tested: Thinness contracts equivalent to `machines-thinness.test.ts` for `recoverExpiredDispatch` / `markDispatched` / `recordNotReleased` / `markAccepted` / `openLeasedDispatch`.
- Files: `convex/customerRequestRouteExecution.ts` (those exports)
- Risk: Host-only edits regress lease recovery without thinness failing.
- Priority: High if recover/mark deepen is next; Medium if left as optional residual.

**`exportProblemForSupport` thinness:**
- What's not tested: Ports-adapter thinness for support export comparable to evidence-load thinness.
- Files: `convex/customerRequestRouteExecution.ts` (`exportProblemForSupport`); `src/modules/customer-request/application/problem-route/export-support.ts`
- Risk: Support projection drifts from problem mutation digests.
- Priority: Medium

**Inquiry dual-path parity:**
- What's not tested: Systematic equivalence between local E2E bypass handlers and Convex source handlers for every mutation.
- Files: `src/modules/inquiries/inquiry.functions.ts`
- Risk: E2E-only green while production path breaks.
- Priority: High for inquiry/notification changes; otherwise Medium

**Journal ports success branch:**
- What's not tested: Exhaustive unit coverage of every `commitSucceededOutcome` branch with port fakes (integration may cover happy path only).
- Files: `convex/customerRequestRouteExecutionJournalPorts.ts` (979)
- Risk: Cancel-interleaved success outcomes regress quietly.
- Priority: Medium

**Further outbox family thinness:**
- What's not tested: Dedicated thinness for webhook ingest / retry families still hosted in `notificationOutbox.ts`.
- Files: `convex/notificationOutbox.ts` (1287)
- Risk: Shared-persist gains (Wave 37) regress when adding provider families.
- Priority: Medium when next outbox deepen starts

---

*Concerns audit: 2026-07-18 · mapped at `3463c1d4`*
