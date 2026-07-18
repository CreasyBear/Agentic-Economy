# Codebase Concerns

**Analysis Date:** 2026-07-18  
**last_mapped_commit:** `74fcb3b8` (post residual deepen Waves 33–37)

## Campaign status (Waves 23–37)

**Waves 23–32 CLOSED.** **Waves 33–37 CLOSED** (ADR-012 cancel/problem; success-outcome split; inquiry dual-path; shared outbox persistence).

| Host / artifact | Fresh `wc -l` | Residual status |
|-----------------|---------------|-----------------|
| `convex/customerRequestApplication.ts` | **1749** | Host-done. Size residual. |
| `convex/inquiries.ts` | **1435** | Host-done (Waves 23–26). Size residual. |
| `convex/notificationOutbox.ts` | **1287** | Shared dispatch persist + source-state ports (Wave 37); further families optional. |
| `convex/customerRequestRouteExecution.ts` | **1178** | ADR-011 + ADR-012 cancel/problem machines; recover/mark + exportProblem residual. |
| `convex/customerRequestRouteExecutionJournalPorts.ts` | **979** | Success outcome split (Wave 35); under 1k. |
| `src/modules/inquiries/inquiry.functions.ts` | **901** | Dual-path factory (Wave 36); local-e2e-adapter extracted. |
| `convex/capabilitySupply.ts` | **804** | Host-done graph/probe. |
| `convex/customerRequestRouteExecutionCancelPorts.ts` | **392** | Wave 33 adapter. |
| `convex/customerRequestRouteExecutionProblemPorts.ts` | **259** | Wave 34 adapter. |
| `convex/inquiryNotificationBridge.ts` | **123** | Thin; shared persistence (Wave 37). |
| `hosted-agent-journey.ts` | **8** | Re-export only. |

**ADR-011** — start/lease/outcome. **ADR-012** — cancel + problem mutation ports (Accepted). Thinness: `machines-thinness`, `journal-thinness`, `problem-mutation-thinness`, inquiry/outbox thinness suites.

## Locked deepen practices

Future deepen work **must** follow these practices (campaign gold + ADR-011 + ADR-012). Violations are regressions, not progress.

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

**Route-execution recover / mark / exportProblem (optional residual):**
- Issue: ADR-012 Waves 33–34 deepened cancel + problem mutations. Remaining host glue: `recoverExpiredDispatch`, `markDispatched`, `recordNotReleased`, `markAccepted`, fat `exportProblemForSupport` / some problem reads.
- Files: `convex/customerRequestRouteExecution.ts` (~1178); CancelPorts / ProblemPorts adapters; thinness locks for cancel/problem machines
- Fix approach: Same ports pattern only when those families need a seam; no sibling chops; do not reopen cancel/problem deepen

**Success-outcome / JournalPorts (Wave 35 closed):**
- Status: `decideSucceededOutcomeBranch` + semantic helpers; JournalPorts ~979 (under 1k). Single `commitSucceededOutcome` port retained for atomicity.
- Residual: further helper locality only if ports approach 1k again

**Inquiry ↔ notification outbox (Wave 37 closed for shared persist):**
- Status: `notificationOutboxPersistence.ts` + source-state ports; bridge ~123 lines. Outbox host ~1287 still has webhook/retry/operator residual.
- Fix approach: Next outbox family deepen (webhook ingest / retry) behind ports; keep inquiry enqueue/bind inquiry-owned

**`customerRequestV2` host bulk:**
- Issue: V2 aggregate, route-plan generation, and evaluation wiring still concentrate in one Convex host
- Files: `convex/customerRequestV2.ts` (~1492); sibling `convex/customerRequestV2Preparation.ts` (~436)
- Impact: High merge conflict / review cost; accidental coupling to Application and capability-supply hosts
- Fix approach: Ports deepen per operation family using provide-facts pattern; leave validators in Convex; legacy retirement is a product gate

**Inquiry TanStack dual-path (Wave 36 closed):**
- Status: `resolveInquiryServerBackend` / `createInquiryServerBackend`; local helpers in `internal/local-e2e-adapter.ts`; `inquiry.functions.ts` ~901
- Residual: dual-path parity tests still not exhaustive; never treat local-e2e green as production proof

**Large but host-done Convex files (size residual, not reopen waves):**
- Issue: Hosts finished deepen campaigns still exceed comfortable review size
- Files: `convex/customerRequestApplication.ts` (1749), `convex/registry.ts` (~1622), `convex/discovery.ts` (~1565), `convex/inquiries.ts` (1435)
- Impact: Noise in diffs; temptation to re-chop without ports
- Fix approach: Only deepen when a concrete operation family needs a seam; preserve catalog-from-rows / inquiry / ADR-012 gains

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
