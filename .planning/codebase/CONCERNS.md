# Codebase Concerns

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `5ea44454` (post residual deepen Waves 23–32)

## Campaign status (Waves 23–32)

**Waves 23–32 are CLOSED.** Do not treat journal start/lease/outcome machines as deferred.

| Host / artifact | Fresh `wc -l` | Residual status |
|-----------------|---------------|-----------------|
| `convex/inquiries.ts` | **1435** | Host-done (Waves 23–26). Size residual only. |
| `convex/customerRequestRouteExecution.ts` | **1606** | ADR-011 machines deepened; **cancel / problem mutation bodies remain**. |
| `convex/customerRequestApplication.ts` | **1749** | Host-done. Thin action shells + ports (e.g. `provideFacts`). Size residual. |
| `convex/capabilitySupply.ts` | **804** | Host-done graph/probe (Wave 30). |
| `convex/registry.ts` | **1622** | Catalog-from-rows (Wave 32). Size residual. |
| `convex/discovery.ts` | **1565** | Catalog-from-rows (Wave 32). Size residual. |
| `src/modules/customer-request/hosted-agent-journey.ts` | **8** | Re-export only; implementation under `hosted-agent-journey/`. |
| `convex/customerRequestRouteExecutionJournalPorts.ts` | **917** | Ports adapter; fat `commitSucceededOutcome` residual. |
| `convex/customerRequestV2.ts` | **1492** | Optional residual god-file. |
| `convex/notificationOutbox.ts` | **1455** | Optional residual god-file. |
| `src/modules/inquiries/inquiry.functions.ts` | **1381** | Dual-path residual (source vs local E2E). |

**ADR-011** (`.planning/adr/ADR-011-journal-write-plan-ports.md`) is **Accepted**. Wave 29 landed:

- Machines: `src/modules/customer-request/route-execution/machines/` (`start-or-resume.ts`, `lease-next-dispatch.ts`, `record-outcome.ts`, `ports.ts`)
- Host shells: `startOrResume` / `leaseNextDispatch` / `recordOutcome` in `convex/customerRequestRouteExecution.ts` call machines via `journalMutationPorts(ctx)`
- Thinness locks: `tests/unit/customer-request/route-execution/machines-thinness.test.ts`, `journal-thinness.test.ts`

## Locked deepen practices

Future deepen work **must** follow these practices (campaign gold + ADR-011). Violations are regressions, not progress.

### 1. Provide-facts ports pattern (gold)

Mirror `provideFacts`:

1. Module-owned ports type + pure orchestration under `src/modules/customer-request/application/provide-facts/` (and peers).
2. Thin Convex adapter: `convex/customerRequestProvideFactsPorts.ts` (`provideFactsPorts(ctx)`).
3. Host keeps validators + thin registration only — see `convex/customerRequestApplication.ts` `export const provideFacts` (~`:699`).

Do **not** re-embed orchestration in the Convex host after a ports deepen.

### 2. No `WritePlan` in journal (or machines)

Forbidden identifiers under `src/modules/customer-request/route-execution/journal/` and `machines/`:

- `WritePlan`, `writePlan`, `intendedPatches`

Ports expose **semantic, immediately executed** commits (e.g. `commitSucceededOutcome`, `grantDispatchLease`). Do not return patch-list DTOs for a later apply step. Enforced by thinness tests.

### 3. No Start / Lease / Outcome sibling chops

**Hard ban:** do not create:

- `convex/customerRequestRouteExecutionStart.ts`
- `convex/customerRequestRouteExecutionLease.ts`
- `convex/customerRequestRouteExecutionOutcome.ts`

Shallow Convex sibling splits move lines without deepening write authority and risk duplicated write sequences. Keep a single host export surface; deepen through `machines/` + `*Ports.ts`.

---

## Tech Debt

**Route-execution cancel / problem (host residual):**
- Issue: After ADR-011 machine deepen, `cancelCurrent`, cancellation open/resolve, recover/mark helpers, and problem `internalMutation`/`internalQuery` bodies remain largely inline in the host. Application-layer problem-route (`src/modules/customer-request/application/problem-route/`) and `convex/customerRequestProblemRoutePorts.ts` are thin for **actions**; durable mutation authority for cancel/problem is still host-owned.
- Files: `convex/customerRequestRouteExecution.ts` (`cancelCurrent` ~`:153`, `reportProblem` ~`:699`, `recordProblemBusinessReport`, `updateProblemStatus`, `replyProblem`, support/export queries); predicates already in `route-execution/journal/` and `route-execution/problem-support/`
- Impact: ~1606-line host stays hard to review; cancel/problem changes risk digest/idempotency drift; easy to “fix” with forbidden sibling chops
- Fix approach: Same ports pattern as start/lease/outcome — module machines + semantic `MutationCtx` ports adapter; **do not** invent `WritePlan`; **do not** fold casually into Start/Lease/Outcome; prefer a dedicated cancel/problem ADR if scope expands

**Fat `commitSucceededOutcome` in journal ports:**
- Issue: Success-path branching (pending cancel, too-late cancel, complete, advance, unknown) lives as a large port method rather than a further-deepened machine/helper seam
- Files: `convex/customerRequestRouteExecutionJournalPorts.ts` (`commitSucceededOutcome` ~`:357`–`:417`); contract in `src/modules/customer-request/route-execution/machines/ports.ts`
- Impact: Ports file ~917 lines; outcome correctness concentrated in one adapter method; harder to unit-test without Convex
- Fix approach: Extract semantic sub-commits or pure branch decisions behind ports **without** introducing write-plan DTOs; keep atomicity inside one mutation

**Inquiry ↔ notification outbox coupling:**
- Issue: Inquiry submit/reply paths bridge into outbox via a Convex-local bridge rather than a single owned seam
- Files: `convex/inquiries.ts` (uses `inquiryNotificationPorts`); `convex/inquiryNotificationPorts.ts`; `convex/inquiryNotificationBridge.ts`; `convex/notificationOutbox.ts`; `src/modules/notification-outbox/public`
- Impact: Notification failures and inquiry admission share failure modes; changes in either host can desync dispatch binding / readback
- Fix approach: Keep module enqueue/bind pure; thin the bridge; avoid duplicating outbox state construction in inquiry host

**`customerRequestV2` host bulk:**
- Issue: V2 aggregate, route-plan generation, and evaluation wiring still concentrate in one Convex host
- Files: `convex/customerRequestV2.ts` (~1492); sibling `convex/customerRequestV2Preparation.ts` (~436)
- Impact: High merge conflict / review cost; accidental coupling to Application and capability-supply hosts
- Fix approach: Ports deepen per operation family (replay, generation load, evaluation candidacy) using provide-facts pattern; leave validators in Convex

**`notificationOutbox` host bulk:**
- Issue: Enqueue, dispatch, webhook ingest, retry, and operator readback remain one large host
- Files: `convex/notificationOutbox.ts` (~1455); module logic under `src/modules/notification-outbox/`
- Impact: Provider/webhook changes touch a wide surface; inquiry bridge depends on host shapes
- Fix approach: Split by operation behind ports after locking module public API; do not shallow-split files without ports

**Inquiry TanStack dual-path (local E2E):**
- Issue: `inquiry.functions.ts` branches on `isLocalE2EAuthBypassEnabled()` into in-process fixture/local state vs Convex source path
- Files: `src/modules/inquiries/inquiry.functions.ts` (~1381); `src/lib/server/local-e2e-bypass`; `src/lib/dev/local-e2e-business-fixtures`
- Impact: Browser/E2E green can diverge from production Convex behavior; fixture secrets and owner IDs live beside real handlers
- Fix approach: Isolate local E2E adapters behind a single factory; shrink dual branches; never treat local-path success as production proof (`ae-verification-gates`)

**Large but host-done Convex files (size residual, not reopen waves):**
- Issue: Hosts finished deepen campaigns still exceed comfortable review size
- Files: `convex/customerRequestApplication.ts` (1749), `convex/registry.ts` (1622), `convex/discovery.ts` (1565), `convex/inquiries.ts` (1435)
- Impact: Noise in diffs; temptation to re-chop without ports
- Fix approach: Only deepen when a concrete operation family needs a seam; preserve catalog-from-rows / inquiry ports gains

## Known Bugs

**Not detected as open source bugs in this pass.** Prefer failing thinness / integration tests over undocumented folklore. If cancel/problem or outcome races surface, capture with executable reproduction under `tests/integration/` or route-execution unit suites before claiming a bug.

## Security Considerations

**Local E2E auth bypass dual-path:**
- Risk: Mis-set bypass env exposes fixture/local inquiry mutation paths that skip real Clerk/source admission
- Files: `src/modules/inquiries/inquiry.functions.ts`; `src/lib/server/local-e2e-bypass`
- Current mitigation: Gated by explicit local E2E flag helpers; fixture material is clearly named `local-e2e-*`
- Recommendations: Keep bypass impossible in production builds; add a copy/import gate if missing; never call local path from agent tools

**Claim / authority boundary (product, not a code hole):**
- Risk: Assistants or UI copy overclaim booking, payment, dispatch, or verified status
- Files: `AGENTS.md`, `PRODUCT.md`, `src/modules/actions/`, agent tools surfaces
- Current mitigation: Action `boundaries`, public-copy tests (`npm run test:copy`), agent-journey gates
- Recommendations: Any new write surface must declare boundaries before `agentTools` exposure

**Convex `node:*` bundling trap:**
- Risk: Transitively importing Node builtins into query/mutation graphs breaks `npm run check:convex-codegen`
- Files: Guardrails in `.agents/skills/ae-convex-guardrails/SKILL.md`; safe pattern `convex/capabilityCheck.ts`
- Current mitigation: `"use node"` only on action-only files; keep Node helpers out of `convex/` import graphs
- Recommendations: Follow diagnostic order in ae-convex-guardrails before “fixing” schema

## Performance Bottlenecks

**Route-execution projection reads:**
- Problem: Outcome/cancel/problem paths repeatedly rebuild run projections via `readRunProjection`
- Files: `convex/customerRequestRouteExecutionJournalPorts.ts` (`readRunProjection`); host cancel/problem handlers
- Cause: Integrity requires fresh projection after each patch sequence
- Improvement path: Keep projection assembly shared; avoid duplicate scans when deepening cancel/problem ports; do not cache across mutations

**Catalog hosts still large:**
- Problem: Registry/discovery hosts remain ~1.5k+ lines despite Wave 32 catalog-from-rows
- Files: `convex/registry.ts`, `convex/discovery.ts` (`catalogFromRows` usage)
- Cause: Validators, admission, and row mapping still co-located
- Improvement path: Further ports only when a measured hot path or conflict cost justifies it

## Fragile Areas

**Route-execution journal + machines + host triad:**
- Files: `src/modules/customer-request/route-execution/journal/`, `machines/`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteExecutionJournalPorts.ts`
- Why fragile: Integrity digests, lease atomicity, and cancel interplay with success outcomes; thinness tests encode hard bans
- Safe modification: Change predicates in `journal/`; orchestration in `machines/`; persistence only via ports; run `machines-thinness` + `journal-thinness` + relevant integration tests
- Test coverage: Strong for start/lease/outcome thinness; cancel/problem deepen not yet machine-locked the same way

**Problem-route action vs mutation split:**
- Files: `src/modules/customer-request/application/problem-route/`, `convex/customerRequestProblemRoutePorts.ts`, problem `internalMutation`s in `customerRequestRouteExecution.ts`
- Why fragile: Application thinness can look “done” while mutation hosts still own durable writes
- Safe modification: Do not move Convex validators into modules; deepen mutation side with ports; keep `problem-route-thinness.test.ts` green
- Test coverage: Action thinness covered; mutation deepen optional residual

**Hosted agent journey split:**
- Files: `src/modules/customer-request/hosted-agent-journey.ts` (8-line re-export); `hosted-agent-journey/*.ts` (`run.ts`, `runtime.ts`, `happy.ts`, `cancel.ts`, …)
- Why fragile: External evals import the barrel; scenario files must stay aligned with front-door claims
- Safe modification: Edit scenario modules; keep public exports stable via `index.ts` / re-export
- Test coverage: Journey / integration suites; do not re-inflate the barrel file

**Inquiry dual-path:**
- Files: `src/modules/inquiries/inquiry.functions.ts`
- Why fragile: Two behavioral stacks in one module
- Safe modification: Change both paths or gate features behind shared domain functions; prove with Convex-backed tests for production claims
- Test coverage: E2E may only exercise local path — verify intended surface class before claiming

## Scaling Limits

**Convex host god-files:**
- Current capacity: Multi-thousand-line hosts still load; review/human bandwidth is the limit, not runtime
- Limit: Merge conflict rate and accidental authority duplication as more workers deepen in parallel
- Scaling path: Ports-per-operation-family; keep one registration host per domain surface

**Notification outbox throughput:**
- Current capacity: Module + host dispatch loop in `convex/notificationOutbox.ts`
- Limit: Provider rate limits and webhook ordering; not fully characterized in this map
- Scaling path: Provider adapters stay module-owned; host stays thin admission + persistence

## Dependencies at Risk

**Design-system migration pressure:**
- Risk: Legacy behavioral UI vs Astryx-first rule in `AGENTS.md` / `ae-design-system`
- Impact: New UI that reintroduces bespoke/`Ae*` or shadcn patterns creates dual systems
- Migration plan: Astryx primitives first (`@astryxdesign/core`, `@astryxdesign/theme-neutral`); Tailwind as layout glue only

**Convex codegen vs TypeScript typecheck split:**
- Risk: `check:convex-codegen` disables typecheck; TS errors only via `npm run typecheck`
- Impact: Green codegen with red types (or the reverse) misleads narrow verification
- Migration plan: Always run both for Convex changes (ae-convex-guardrails, ae-verification-gates)

## Missing Critical Features

**Customer-visible multi-capability RoutePlan / full Approve→Run lifecycle:**
- Problem: Target Request → RoutePlan → Approve → Run → Inspect is architectural; customer projection and public claims remain narrower (`PRODUCT.md` / `AGENTS.md`)
- Blocks: Public marketing or assistant tools that imply booking, dispatch, or autonomous fulfillment

**Cancel / problem machine deepen (optional residual):**
- Problem: Unlike start/lease/outcome, cancel/problem lack an accepted machine+ports deepen with thinness locks
- Blocks: Safe reduction of `customerRequestRouteExecution.ts` below residual cancel/problem load

## Test Coverage Gaps

**Cancel / problem mutation deepen:**
- What's not tested: Thinness contracts equivalent to `machines-thinness.test.ts` for cancel/problem mutation orchestration (application problem-route thinness exists; host mutation deepen does not)
- Files: `convex/customerRequestRouteExecution.ts` cancel/problem exports; absence of `route-execution/machines/cancel-*.ts`
- Risk: Host-only edits regress idempotency/replay without thinness failing
- Priority: High if cancel/problem deepen is next; Medium if left as optional residual

**Inquiry dual-path parity:**
- What's not tested: Systematic equivalence between local E2E bypass handlers and Convex source handlers for every mutation
- Files: `src/modules/inquiries/inquiry.functions.ts`
- Risk: E2E-only green while production path breaks
- Priority: High for inquiry/notification changes; otherwise Medium

**Journal ports success branch:**
- What's not tested: Exhaustive unit coverage of every `commitSucceededOutcome` branch with port fakes (integration may cover happy path only)
- Files: `convex/customerRequestRouteExecutionJournalPorts.ts`
- Risk: Cancel-interleaved success outcomes regress quietly
- Priority: Medium

---

*Concerns audit: 2026-07-18 · mapped at `5ea44454`*
