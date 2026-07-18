# Codebase Concerns

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `6983a50d` (post residual deepen campaign Waves 43–49 CLOSED)

## Campaign status (Waves 23–49 CLOSED)

**Waves 23–32 CLOSED.** **Waves 33–37 CLOSED.** **Waves 38–42 CLOSED.** **Waves 43–49 CLOSED.**

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
| 38 | ADR-013 dispatch lifecycle ports — **Accepted** |
| 39 | Dispatch recover/mark/open machines + `DispatchLifecyclePorts` — done |
| 40 | `exportProblemForSupport` load assembly behind ProblemPorts — done |
| 41 | ADR-014 V2 write-family ports — **Accepted** |
| 42 | V2 `commitAggregate` / refresh / retry behind `CustomerRequestV2WritePorts` — done |
| 43 | ADR-015 outbox operator ports + webhook/retry/no-repair deepen — done |
| 44 | ADR-016 V2 preparation ports — **Accepted** |
| 45 | V2 preparation core (`prepare`/`resume`) behind `CustomerRequestV2PreparationPorts` — done |
| 46 | V2 prep egress / egress-state / prepared-action behind egress ports — done |
| 47 | ADR-017 V2 read ports + `getCurrentAggregate` / generation reads — done |
| 48 | ADR-018 mandate issue/revoke ports — **Accepted** |
| 49 | Mandate `issue` / `revoke` / `getHistory` behind `RouteMandateMutationPorts` — done |

**ADRs:** ADR-011–018 — all **Accepted**.  
Plans: `.planning/codebase/WAVES-38-42-PLAN.md`, `.planning/codebase/WAVES-43-49-PLAN.md`.

**Do not reopen Waves 23–49** as line-count chops or sibling Convex host splits. Change only via existing ports seams when semantics require it.

### Verified line counts (`wc -l` at `6983a50d`)

| File | Lines | Residual status |
|------|------:|-----------------|
| `convex/customerRequestApplication.ts` | **1749** | Host-done. Validators forever; size residual only. |
| `convex/registry.ts` | **1622** | Catalog-from-rows shared (Wave 32); search/admission size residual. |
| `convex/discovery.ts` | **1565** | Catalog-from-rows shared (Wave 32); manifest size residual. |
| `convex/inquiries.ts` | **1435** | Host-done (Waves 23–26). Size residual. |
| `convex/customerRequestRouteExecutionJournalPorts.ts` | **981** | Under ~1k ceiling. |
| `convex/customerRequestRouteExecution.ts` | **939** | ADR-011–013 machines; Wave 40 export thin. |
| `src/modules/inquiries/inquiry.functions.ts` | **901** | Dual-path factory (Wave 36). |
| `convex/notificationOutbox.ts` | **809** | Wave 43 operator deepen; dispatch-loop residual optional. |
| `convex/capabilitySupply.ts` | **804** | Host-done graph/probe (Wave 30). |
| `convex/customerRequestRouteMandatePorts.ts` | **686** | Wave 49 adapter. |
| `convex/customerRequestV2WritePorts.ts` | **679** | Wave 42 write adapter. |
| `convex/customerRequestV2.ts` | **561** | Waves 42 + 47 write/read deepened. |
| `convex/customerRequestRouteExecutionCancelPorts.ts` | **394** | Wave 33 adapter. |
| `convex/customerRequestV2ReadPorts.ts` | **391** | Wave 47 adapter. |
| `convex/customerRequestRouteExecutionProblemPorts.ts` | **349** | Wave 34 + 40. |
| `convex/notificationOutboxOperatorPorts.ts` | **288** | Wave 43 adapter. |
| `convex/customerRequestRouteExecutionDispatchPorts.ts` | **286** | Wave 39 adapter. |
| `convex/customerRequestRouteMandate.ts` | **185** | Wave 49 thin shells. |
| `convex/inquiryNotificationBridge.ts` | **123** | Thin; shared persistence (Wave 37). |
| `convex/customerRequestV2PreparationEgressState.ts` | **115** | Wave 46 thin. |
| `convex/customerRequestV2PreparationEgress.ts` | **93** | Wave 46 thin (`"use node"`). |
| `convex/customerRequestV2Preparation.ts` | **70** | Wave 45 thin. |
| `convex/customerRequestV2PreparedAction.ts` | **46** | Wave 46 thin. |

Thinness locks include: route-execution `{machines,journal,problem-mutation,problem-support-read,evidence-load,dispatch-lifecycle}-thinness`, `v2-write`, `v2-preparation`, `v2-preparation-egress`, `v2-read`, `route-mandate-mutation`, `notification-outbox/operator-thinness`, application/capability-supply/inquiries thinness.

### Parked residuals (after Waves 43–49 — not reopen)

| Residual | Posture | Notes |
|----------|---------|-------|
| Outbox `dispatchNotificationOutbox` loop | Optional | Wave 43 covered webhook/operator; dispatch-loop may still be thicker. |
| `readProblemForBusiness` | Optional | Wave 40 covered support-export only. |
| Registry / discovery | Size-only | No reopen without a concrete operation-family seam. |
| Application validators | Forever | Not a reopen wave; §6. |
| Inquiry dual-path parity harness | Speculative | Verification harness, not a line-count deepen. |

---

## Locked deepen practices

Future deepen work **must** follow these practices (campaign gold + ADR-011–018). Violations are regressions, not progress.

### 1. Provide-facts ports pattern (gold)

Mirror `provideFacts`:

1. Module-owned ports type + pure orchestration under `src/modules/...` (e.g. `src/modules/customer-request/application/provide-facts/`).
2. Thin Convex adapter: `convex/*Ports.ts` (e.g. `convex/customerRequestProvideFactsPorts.ts` → `provideFactsPorts(ctx)`).
3. Host keeps validators + thin registration only — see `convex/customerRequestApplication.ts` `export const provideFacts`.

**Deletion test:** removing the module orchestration must concentrate complexity in the module (or fail tests) — Convex sibling chops without ports fail this test.

Do **not** re-embed orchestration in the Convex host after a ports deepen.

### 2. No `WritePlan` in journal, machines, or v2-write

Forbidden identifiers under `src/modules/customer-request/route-execution/journal/`, `machines/`, and `v2-write/`:

- `WritePlan`, `writePlan`, `intendedPatches`

Ports expose **semantic, immediately executed** commits. Do not return patch-list DTOs for a later apply step. Enforced by thinness tests.

### 3. No Start / Lease / Outcome sibling chops

**Hard ban** — do not create:

- `convex/customerRequestRouteExecutionStart.ts`
- `convex/customerRequestRouteExecutionLease.ts`
- `convex/customerRequestRouteExecutionOutcome.ts`

Shallow Convex sibling splits move lines without deepening write authority and risk duplicated write sequences. Keep a single host export surface; deepen through `machines/` + `*Ports.ts` (ADR-011).

### 4. No Cancel / Problem / Dispatch / V2-Commit sibling chops

**Hard ban** — do not create:

- `convex/customerRequestRouteExecutionCancel.ts`
- `convex/customerRequestRouteExecutionProblem.ts`
- `convex/customerRequestRouteExecutionDispatch.ts` / `…Recover.ts` / `…Mark.ts`
- `convex/customerRequestV2Commit.ts` / `…Refresh.ts` / `…Write.ts` (mutation-host siblings)

Same rationale as §3. Use dedicated ports adapters + module machines (ADR-012–014).

### 5. Dedicated port families — do not grow JournalPorts for other families

- Journal → `JournalMutationPorts` / `…JournalPorts.ts`
- Cancel → `CancelMutationPorts` / `…CancelPorts.ts`
- Problem → `ProblemMutationPorts` (+ support-read) / `…ProblemPorts.ts`
- Dispatch lifecycle → `DispatchLifecyclePorts` / `…DispatchPorts.ts`
- V2 write → `CustomerRequestV2WritePorts` / `customerRequestV2WritePorts.ts`

Do **not** absorb unrelated families into `JournalMutationPorts`. Adapter ceiling ~**1000 lines** per ports file.

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
- Dispatch lifecycle machines (Wave 39) + support-export load (Wave 40)
- V2 write family (Wave 42)

**ADR-002** governed-send stays inquiry-owned — do not relocate send authority into outbox or Application hosts.

### 8. Atomicity at the mutation boundary

Machine orchestration may call many port methods, but production durability remains **one** Convex `internalMutation` / `internalQuery` registration. Application / workers must keep calling the same `internal.customerRequestRouteExecution.*` / `internal.customerRequestV2.*` paths — never bypass mutations to call module machines directly from ActionCtx.

---

## Tech Debt

**Further outbox dispatch-loop (optional residual):**
- Issue: Wave 43 deepened webhook/operator; `dispatchNotificationOutbox` provider loop may still concentrate host glue.
- Files: `convex/notificationOutbox.ts` (809), Wave 37 persist, OperatorPorts (288)
- Fix approach: Optional next family deepen; keep inquiry enqueue inquiry-owned (ADR-002); do not reopen Wave 37/43.

**`readProblemForBusiness` (optional thin residual):**
- Issue: Wave 40 thinned `exportProblemForSupport` only; business problem read still inlines auth + load + project in the host.
- Files: `convex/customerRequestRouteExecution.ts` (`readProblemForBusiness`)
- Fix approach: Same ProblemPorts / support-read pattern when needed; keep Application thin. Do not reopen Wave 40 support-export.

**Registry / discovery size residual:**
- Issue: After Wave 32 `catalog-from-rows`, both hosts remain ~1.5k+ lines (validators, admission, row mapping).
- Files: `convex/registry.ts` (1622), `convex/discovery.ts` (1565)
- Impact: Diff noise; temptation to re-chop without ports.
- Fix approach: Only deepen when a concrete operation family needs a seam; preserve catalog-from-rows sharing; do not invent parallel catalog mappers; do not reopen Wave 32 as a size project.

**Application validators forever (size residual, not a reopen wave):**
- Issue: `convex/customerRequestApplication.ts` (1749) is host-done; residual mass is largely Convex validators + thin action shells.
- Files: `convex/customerRequestApplication.ts`; thinness under `tests/unit/customer-request/application/*-thinness.test.ts`
- Impact: Large diffs on validator edits; false urge to “split Application.”
- Fix approach: Never reopen Application deepen as a line-count project; validators stay in Convex forever (§6); deepen only when a new command family needs ports.

**Inquiry dual-path parity harness (speculative):**
- Issue: Wave 36 extraction done; parity between local and Convex paths still soft.
- Files: `src/modules/inquiries/inquiry.functions.ts` (901), `src/modules/inquiries/internal/local-e2e-adapter.ts`
- Fix approach: Verification harness, not a line-count deepen. Do not reopen Wave 36.

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

**Not detected as open source bugs in this pass.** Prefer failing thinness / integration tests over undocumented folklore. If cancel-interleaved success outcomes or outbox webhook races surface, capture with executable reproduction under `tests/integration/` or route-execution unit suites before claiming a bug.

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
- Files: `convex/customerRequestRouteExecutionJournalPorts.ts`, `convex/customerRequestRouteExecutionDispatchPorts.ts`, related adapters
- Cause: Integrity requires fresh projection after each patch sequence.
- Improvement path: Keep projection assembly shared; avoid duplicate scans across port families; do not cache across mutations.

**Catalog hosts still large:**
- Problem: Registry/discovery hosts remain ~1.5k+ lines despite Wave 32 catalog-from-rows.
- Files: `convex/registry.ts` (1622), `convex/discovery.ts` (1565)
- Cause: Validators, admission, and row mapping still co-located.
- Improvement path: Further ports only when a measured hot path or conflict cost justifies it — size-only residual, not a reopen of Wave 32.

**Customer Request workspace client payload:**
- Problem: Workspace shell still owns a large interactive surface for `/engine`.
- Files: `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`, `src/modules/customer-request/customer-projection.ts`, `src/modules/customer-request/route-plan-customer-projection.ts`
- Cause: Clarification, options, authority, and recovery compose a large client surface.
- Improvement path: Lazy-load non-first-paint panels; keep projection families in the customer-request module, not in Convex hosts.

## Fragile Areas

**Route-execution journal + machines + host triad:**
- Files: `src/modules/customer-request/route-execution/journal/`, `machines/`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteExecution{Journal,Cancel,Problem,Dispatch}Ports.ts`
- Why fragile: Integrity digests, lease atomicity, cancel/problem interplay with success outcomes; thinness tests encode hard bans (§2–§5).
- Safe modification: Change predicates in `journal/`; orchestration in `machines/`; persistence only via ports; run `machines-thinness` + `journal-thinness` + `problem-mutation-thinness` + `dispatch-lifecycle-thinness` + `problem-support-read-thinness` + `tests/integration/customer-request-v2-multi-capability-route.test.ts`.
- Test coverage: Strong for start/lease/outcome/cancel/problem/dispatch/support-export thinness (Waves 29–40 closed). Do not reopen those deepens as chops.

**Dispatch lifecycle (Wave 39 — closed):**
- Files: `src/modules/customer-request/route-execution/machines/{open-leased-dispatch,recover-expired-dispatch,mark-dispatched,record-not-released,mark-accepted}.ts`, `convex/customerRequestRouteExecutionDispatchPorts.ts` (286), host shells in `convex/customerRequestRouteExecution.ts`, worker `convex/customerRequestRouteTransportWorker.ts`
- Why fragile: Lease expiry recovery and dispatch marking must stay consistent with journal lease/outcome machines; easy to desync outbox vs attempt state.
- Safe modification: Edit machines + `DispatchLifecyclePorts` only; keep worker calling the same internal exports; keep `dispatch-lifecycle-thinness.test.ts` green. Do not invent Recover/Mark sibling hosts (§4).
- Test coverage: Thinness locked; integration coverage exists.

**Problem support-export (Wave 40 — closed) vs `readProblemForBusiness` (optional residual):**
- Files: `convex/customerRequestRouteExecution.ts` (`exportProblemForSupport`, `readProblemForBusiness`); `convex/customerRequestRouteExecutionProblemPorts.ts` (`problemSupportReadPorts`); `src/modules/customer-request/route-execution/problem-support/`
- Why fragile: Support export is thin + ports-locked; business read still embeds auth/load/project in the host.
- Safe modification: Do not move Convex validators into modules; deepen `readProblemForBusiness` only via ProblemPorts / support-read when needed; keep `problem-support-read-thinness.test.ts` and `problem-route-thinness.test.ts` green. Do not reopen Wave 40.
- Test coverage: Support-export thinness locked; business-read thinness not equivalent.

**V2 write family (Wave 42 — closed) vs prep residual:**
- Files: `src/modules/customer-request/v2-write/`, `convex/customerRequestV2WritePorts.ts` (856), `convex/customerRequestV2.ts` (644); prep siblings `convex/customerRequestV2Preparation*.ts`, `convex/customerRequestV2PreparedAction.ts`
- Why fragile: Write path is ports-locked; prep/egress still host-heavy and can re-couple to Application.
- Safe modification: Keep write changes in `v2-write/` + WritePorts; later ADR for read/prep; keep `v2-write-thinness.test.ts` green. Do not invent Commit/Refresh sibling hosts (§4).
- Test coverage: Write thinness locked; prep thinness not started.

**Inquiry dual-path:**
- Files: `src/modules/inquiries/inquiry.functions.ts` (901), `src/modules/inquiries/internal/local-e2e-adapter.ts`
- Why fragile: Two behavioral stacks; E2E may only exercise local path.
- Safe modification: Change both paths or gate features behind shared domain functions; prove with Convex-backed tests for production claims. Do not reopen Wave 36 as a chop.
- Test coverage: Dual-path parity not exhaustive (speculative harness residual).

**Capability supply quarantine / publication / probe:**
- Files: `convex/capabilitySupply.ts` (804), `src/modules/capability-supply/**`, `tests/unit/capability-supply/convex-host-thinness.test.ts`
- Why fragile: Offerings, bindings, eligibility, publication, and readiness must all be current for routeable supply.
- Safe modification: Use existing command mutations; never short-circuit eligibility hashes; do not reopen graph/probe as a line-count chop (Wave 30 closed).
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
- Scaling path: Ports-per-operation-family; keep one registration host per domain surface; ~1k adapter ceiling. Closed Waves 23–42 already applied this path for their families.

**Convex document size (1 MiB):**
- Current capacity: Per-document ~1 MiB hard limit; unbounded arrays rewrite whole documents on update.
- Limit: High-churn inquiry threads, route execution journals, or supply audit blobs without child tables.
- Scaling path: Keep high-churn children in separate tables (`tests/unit/schema/convex-schema.test.ts`); see `convex/_generated/ai/guidelines.md`.

**Notification outbox throughput:**
- Current capacity: Module + host dispatch loop in `convex/notificationOutbox.ts` (1287).
- Limit: Provider rate limits and webhook ordering; not fully characterized in this map.
- Scaling path: Provider adapters stay module-owned; host stays thin admission + persistence; deepen webhook/retry behind ports in Wave 43+.

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

**V2 read / preparation ports (parked — not a reopen of Wave 42):**
- Problem: Write family is ports-locked; preparation/egress/prepared-action hosts remain undeepened.
- Blocks: Safer reduction of prep merge cost without Application coupling.
- Files: `convex/customerRequestV2Preparation.ts`, `convex/customerRequestV2PreparationEgress.ts`, `convex/customerRequestV2PreparationEgressState.ts`, `convex/customerRequestV2PreparedAction.ts`

**Outbox webhook / retry ports (parked — Wave 43+):**
- Problem: Shared persist closed at Wave 37; webhook ingest / retry / operator surfaces still live in `notificationOutbox.ts`.
- Blocks: Further safe reduction of the 1287-line outbox host without ADR-002 violations.

## Test Coverage Gaps

**Inquiry dual-path parity (speculative harness):**
- What's not tested: Systematic equivalence between local E2E bypass handlers and Convex source handlers for every mutation.
- Files: `src/modules/inquiries/inquiry.functions.ts`
- Risk: E2E-only green while production path breaks.
- Priority: High for inquiry/notification changes; otherwise Medium — harness, not a deepen reopen.

**Journal ports success branch:**
- What's not tested: Exhaustive unit coverage of every `commitSucceededOutcome` branch with port fakes (integration may cover happy path only).
- Files: `convex/customerRequestRouteExecutionJournalPorts.ts` (981)
- Risk: Cancel-interleaved success outcomes regress quietly.
- Priority: Medium

**Further outbox family thinness (Wave 43+):**
- What's not tested: Dedicated thinness for webhook ingest / retry families still hosted in `notificationOutbox.ts`.
- Files: `convex/notificationOutbox.ts` (1287)
- Risk: Shared-persist gains (Wave 37) regress when adding provider families.
- Priority: Medium when next outbox deepen starts

**`readProblemForBusiness` thinness (optional):**
- What's not tested: Ports-adapter thinness comparable to `problem-support-read-thinness.test.ts` for the business problem read.
- Files: `convex/customerRequestRouteExecution.ts` (`readProblemForBusiness`)
- Risk: Host-only edits drift from support-export projection rules.
- Priority: Low unless business-read deepen starts

**V2 prep / egress thinness (parked):**
- What's not tested: Thinness contracts for preparation/egress/prepared-action hosts equivalent to `v2-write-thinness.test.ts`.
- Files: `convex/customerRequestV2Preparation.ts`, `convex/customerRequestV2PreparationEgress.ts`, `convex/customerRequestV2PreparationEgressState.ts`, `convex/customerRequestV2PreparedAction.ts`
- Risk: Prep changes re-embed write-side authority or bypass WritePorts.
- Priority: Medium when a V2 read/prep ADR opens

---

*Concerns audit: 2026-07-18 · mapped at `9d8faa04`*
