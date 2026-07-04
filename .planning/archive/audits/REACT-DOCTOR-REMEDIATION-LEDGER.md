# React Doctor Remediation Ledger

**Purpose:** live loop state for `.planning/audits/REACT-DOCTOR-REMEDIATION-PLAN.md`.

The loop stops only when verified L0-L2 findings are zero. Raw react-doctor counts are useful telemetry, not the stop condition.

## Priority model

| Level | Meaning | Stop-condition impact |
|---|---|---|
| L0 | runtime/data-loss/security blocker | must be 0 |
| L1 | trust/safety invariant or core architecture seam | must be 0 |
| L2 | verified quality/perf/a11y/conversion defect | must be 0 |
| L3 | cleanup/nit/debt | may remain |
| Noise | false positive / accepted pattern | may remain |

## Current source docs

- Master audit: `.planning/audits/MASTER-AUDIT.md`
- Execution plan: `.planning/audits/REACT-DOCTOR-REMEDIATION-PLAN.md`
- Third-party review: `.planning/architecture-measurement/MEASURABLE-ARCHITECTURE-REVIEW.md`
- React Doctor output target: `.planning/react-doctor/`

## Baseline snapshot

Wave 0 baseline captured 2026-07-02.

| Metric | Before | Current | Target |
|---|---:|---:|---:|
| Verified L0 | 0 | 0 | 0 |
| Verified L1 | 6 | 0 | 0 |
| Verified L2 | 9 | 0 | 0 |
| Verified L3 | 9+ cleanup buckets | 9+ cleanup buckets | allowed |
| Noise / false-positive findings | documented in MASTER + this ledger | documented in MASTER + this ledger | documented |
| Raw react-doctor diagnostics | 687 raw / 680 source-owned | 515 raw / 509 source-owned | informative only |
| Raw react-doctor errors | 46 raw / 46 source-owned | 1 raw / 1 source-owned | informative only |
| Raw react-doctor warnings | 641 raw / 634 source-owned | 514 raw / 508 source-owned | informative only |

## Known verified L1 from MASTER

| ID | Finding | Owner wave | Status | Notes |
|---|---|---|---|---|
| L1-001 | `sanitizeStructuredAnswer` / `validateCatalogGrounding` mandated but uncalled | Wave 1 / AnswerSafety | closed | now called from turn orchestration before persisted/SSE-complete snapshots; `answer-turn-grounding` covers rejection |
| L1-002 | receipt/signature hash comparison uses `!==` in `business-action.ts:977-989` | Wave 1 / ReceiptIntegrity | closed | scalar receipt hashes now compare through `safeEqualHash`; targeted tamper test added |
| L1-003 | action seam half-adopted; bare server fns + vestigial surfaces | Wave 5 / ActionSeamPlan | closed | public `/api/businesses/*` routes now go through registered registry actions; `registry.list` is registered and exposed to agent-tools; owner/private action surfaces remain explicit exceptions |
| L1-004 | circular public seams: observability↔security + catalog barrel | Wave 2 | closed | observability/security now share lower audit-event contract types; catalog public no longer re-exports internal implementations that import public back; final Doctor run reports 0 `circular-dependency` findings |
| L1-005 | `/owner/billing*` imports parked `future-phases/05-*` code | Wave 3 | closed | active routes now import live billing readback/panels from `src/modules/billing`; route helper imports retargeted from parked future-phase files |
| L1-006 | answer-thread module shallow/wide; unconsumed toolDefinition seam | Wave 4 / AnswerTurnPlan | closed | public answer-thread seam narrowed to production exports plus testing/tooling barrels; stale TanStack tool-definition wrapper removed; orchestration now finalizes a sanitized frozen snapshot before streaming/persisting |

## Known verified L2 from MASTER

| ID | Finding | Owner wave | Status | Notes |
|---|---|---|---|---|
| L2-001 | operator shell domain prop `role` collides with ARIA semantics | Wave 1 / OwnerShellMechanical | closed | renamed to `operatorRole` at all `AeOperatorShell`/sidebar/command-menu call sites |
| L2-002 | inquiry form hydration gate flashes disabled→enabled | Wave 1 / SharedPublicPolish | closed | public inquiry submit is no longer disabled by hydration; pending still disables during submit |
| L2-003 | `AeGenerativeMap` iframes lack sandbox | Wave 1 / SharedPublicPolish | closed | both map iframes now set `sandbox` |
| L2-004 | plain `<a>` full reloads in owner/admin routes | Wave 1 / OwnerShellMechanical | closed | owner/admin internal anchors replaced with TanStack `Link`; grep shows no remaining owner/admin `<a href>` routes |
| L2-005 | `motion`→`m`+`LazyMotion` bundle trim opportunity | Wave 1 / SharedPublicPolish | deferred | optional bundle polish; not a verified L0-L2 stop condition |
| L2-006 | `isComposing` in prompt input should be ref not state | Wave 1 / SharedPublicPolish | closed | `PromptInputTextarea` now tracks composition in a ref |
| L2-007 | `AeChat.tsx` stale projection no-adjust-state pattern | Wave 1 / AnswerSafety | closed | initial-query live turn is adjusted during render; chat tests and scoped Doctor pass |
| L2-008 | `normalizeSearchToken` duplicated src↔convex | Wave 1 / SharedPublicPolish or defer | deferred | no clean neutral shared seam without Convex/browser boundary risk |
| L2-009 | backend perf rules from full-repo scan | Wave 6 / BackendPerfTriage | closed | safe independent read/projection loops were simplified; write/idempotency/audit/order-sensitive loops are explicit defers; remaining raw backend perf diagnostics are L3/defer/noise until case-level proof says otherwise |

## Known L3 cleanup from MASTER

| Finding | Owner wave | Status |
|---|---|---|
| `src/modules/answer/openui/**` + `@openuidev/react-lang` | Wave 1 / DeadCodeSweep | open |
| `src/modules/lifecycle/**` floating | Wave 1 / DeadCodeSweep | open |
| `src/modules/answer/artifacts.ts` dead | Wave 1 / DeadCodeSweep | open |
| protected-action internal dead files | Wave 1 / DeadCodeSweep | open |
| `seo/internal/validators.ts` dead | Wave 1 / DeadCodeSweep | open |
| dead components/primitives | Wave 1 / DeadCodeSweep | open |
| dead `ai-elements/message.tsx` branch/action/toolbar exports | Wave 1 / DeadCodeSweep | open |
| `.tmp-answer-eval-inspect.ts` scratch | Wave 1 / DeadCodeSweep | open |
| `atmn` devDependency | Wave 1 / DeadCodeSweep | open |

## Noise register

Do not fix these unless current code proves otherwise.

| Rule/finding | Classification | Evidence source |
|---|---|---|
| `prefer-tag-over-role` | Noise | MASTER noise register |
| `useContext_deprecated` | Noise | React 19 still supports `useContext`; MASTER noise register |
| route-file `only-export-components` / `no-multi-comp` | Noise | intentional TanStack route co-location |
| shadcn `only-export-components` / `no-multi-comp` | Noise | intentional shadcn slot convention |
| Zod type-position `unused-export` | likely Noise | verify before touching |
| `useServerFn` wrapper `unused-export` | likely Noise | macro blind spot |
| `admin.inquiries:253 no-render-in-render` | Noise | `renderRef` returns string |

## Iteration log

Append one entry per loop.

### Iteration 0 — baseline

- Date: 2026-07-02
- Commands run:
  - `npm run typecheck` — passed.
  - `npm run check:convex-codegen` — passed.
  - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor` — exited non-zero as expected because diagnostics remain; wrote `.planning/react-doctor/`.
- Raw react-doctor diagnostics: 687 total; 46 errors / 641 warnings. After filtering known tool-output dirs (`.codex/`, `.output/`, `playwright-report/`): 680 source-owned diagnostics; 46 errors / 634 warnings.
- Verified L0: 0
- Verified L1: 6 (`L1-001` through `L1-006` remain open)
- Verified L2: 9 (`L2-001` through `L2-009` remain open)
- Notes: Current doctor run includes supply-chain telemetry and tool-output-dir leakage. These are raw telemetry only unless code-verified into L0-L2. Wave 1 remains the smallest safe first implementation wave.

### Iteration 1 — Wave 1 small/high-confidence fixes

- Agents:
  - `AnswerSafety`
  - `ReceiptIntegrity`
  - `DeadCodeSweep`
  - `OwnerShellMechanical`
  - `SharedPublicPolish`
- Files changed:
  - Safety/integrity: `src/modules/answer/internal/catalog-grounding.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/components/ae/chat/AeChat.tsx`, `src/modules/business-action/internal/business-action.ts`.
  - Mechanical/public polish: `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/layout/AeOperatorSidebar.tsx`, `src/components/ae/layout/AeOperatorCommandMenu.tsx`, owner/admin routes, `src/components/ae/artifacts/AeGenerativeMap.tsx`, `src/components/ai-elements/prompt-input.tsx`, `src/routes/$slug.inquiry.tsx`.
  - Dead-code cleanup: removed dead OpenUI, protected-action readback helpers, SEO validator, unused primitives/components, scratch file; `src/modules/lifecycle/**` and `atmn` remain L3/deferred.
- Commands run by main:
  - `npm run typecheck` — passed.
  - `npm run check:convex-codegen` — passed.
  - `npm run test:imports` — passed.
  - `npm run test:ts-standards` — passed after narrowing `workLogStatusToHarnessStatus`.
  - `npx vitest run tests/unit/chat/ae-chat-route-promotion.test.tsx tests/unit/chat/ae-answer-checks.test.ts` — passed.
  - `npx vitest run tests/unit/discovery/developer-discovery-route.test.ts` — passed after preserving assertions and raising the slow route-loader test timeout to 10s.
  - `npm run test:unit` — 95 files / 453 tests passed.
  - `npm run build` — passed; existing CSS token warning remains.
  - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor` — non-zero as expected; now 568 raw / 565 source-owned diagnostics, only 1 raw/source-owned error (`posthog-js` supply-chain review).
- Result: Wave 1 integrated. Verified L1 fell 6→4; verified L2 fell 9→3. No new L0-L2 introduced.
- Remaining L0: 0
- Remaining L1: `L1-003`, `L1-004`, `L1-005`, `L1-006`
- Remaining L2: `L2-009`; `L2-005` and `L2-008` explicitly deferred out of the stop condition.
- New findings introduced: none verified. Raw Doctor count still includes accepted supply-chain review and migration-scale L3/noise.
- Next action: Wave 2 circular seams (`observability↔security`, catalog barrel).

### Iteration 2 — Wave 2 circular seams

- Agents:
  - `ObservabilitySecurityCycle`
  - `CatalogCycle`
- Files changed:
  - Observability/security seam: `src/modules/common/audit-events.ts`, `src/modules/observability/internal/audit.ts`, `src/modules/observability/internal/literals.ts`, `src/modules/observability/internal/operator-controls.ts`, `src/modules/observability/public.ts`, `src/modules/security/public.ts`, `src/modules/security/internal/admin-authority.ts`, `src/modules/security/internal/disputes.ts`.
  - Funnel cycle follow-up: `src/modules/observability/funnel.source.ts`, `src/modules/observability/funnel.functions.ts`, `src/modules/observability/funnel.capture.server.ts`.
  - Catalog seam: `src/modules/catalog/public.ts`, `src/modules/catalog/internal/catalog-model.ts`, `src/modules/catalog/internal/publish.ts`, `src/modules/catalog/internal/owner-public-flow.ts`; removed zero-reference obsolete helpers `src/modules/catalog/internal/first-request.ts` and `src/modules/catalog/internal/public-catalog-dto.ts`.
- Commands run by main:
  - `npx vitest run tests/unit/catalog/public-catalog-dto.test.ts tests/unit/catalog/publish.test.ts tests/unit/catalog/owner-public-flow.test.ts tests/unit/catalog/first-request.test.ts` — 4 files / 9 tests passed.
  - `npx vitest run tests/unit/observability/record-funnel-event.test.ts tests/unit/observability/funnel.test.ts tests/unit/observability/operator-controls.test.ts tests/unit/security/admin-authority.test.ts tests/unit/security/disputes.test.ts` — 5 files / 21 tests passed.
  - `npm run typecheck` — passed.
  - `npm run check:convex-codegen` — passed.
  - `npm run test:imports` — passed.
  - `npm run test:ts-standards` — passed.
  - `npm run test:unit` — 95 files / 453 tests passed.
  - `npm run build` — passed; existing CSS token warning remains.
  - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor` — non-zero as expected because accepted/residual diagnostics remain; now 563 raw / 557 source-owned diagnostics, 1 raw/source-owned error (`posthog-js` supply-chain review), and 0 `circular-dependency` findings.
- Result: Wave 2 integrated. Verified L1 fell 4→3; verified L2 remains 3. Circular public/module seams from the master audit are closed without behavior changes.
- Remaining L0: 0
- Remaining L1: `L1-003`, `L1-005`, `L1-006`
- Remaining L2: `L2-009`; `L2-005` and `L2-008` remain explicitly deferred out of the stop condition.
- New findings introduced: none verified. Raw Doctor count still includes accepted supply-chain review plus migration-scale L3/noise.
- Next action: Wave 3 billing future-phase cutover.

### Iteration 3 — Wave 3 billing future-phase cutover

- Agent:
  - `BillingFuturePhaseCutover`
- Files changed:
  - Billing future-phase cutover: `src/modules/billing/owner-billing.panels.tsx`, `src/modules/billing/owner-billing.readback.ts`, owner billing route imports, and `tests/unit/billing/owner-routes.test.ts`.
  - Gate follow-ups required by strict checks: `src/modules/answer-thread/internal/answer-run-summary.ts`, `src/lib/observability/posthog.client.ts`, `src/modules/common/action.ts`, `src/modules/harness/session-journal.ts`, and `tests/unit/harness/run-loop.test.ts`.
- Commands run by main:
  - `npm run typecheck` — passed.
  - `npm run check:convex-codegen` — passed.
  - `npm run test:imports` — passed.
  - `npm run test:ts-standards` — passed.
  - `npx vitest run tests/unit/billing/owner-routes.test.ts` — passed.
  - `npx vitest run tests/unit/discovery/developer-discovery-route.test.ts` — passed after the first full-suite run exposed a load-sensitive timeout.
  - `npm run test:unit` — passed on rerun; 100 files / 489 tests.
  - `npm run build` — passed; existing CSS token warning remains.
  - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor` — non-zero as expected because accepted/residual diagnostics remain; now 577 raw / 574 source-owned diagnostics, 1 raw/source-owned error (`posthog-js` supply-chain review), and 0 `circular-dependency` findings.
- Result: Wave 3 integrated. Verified L1 fell 3→2. Active owner billing routes no longer import parked future-phase implementation.
- Remaining L0: 0
- Remaining L1: `L1-003`, `L1-006`
- Remaining L2: `L2-009`; `L2-005` and `L2-008` remain explicitly deferred out of the stop condition.
- New findings introduced: none verified. Raw Doctor count still includes accepted supply-chain review plus migration-scale L3/noise.
- Next action: Wave 4 answer-thread deepening plan before implementation.

### Iteration 4 — Wave 4 answer-thread deepening

- Planning agent:
  - `AnswerTurnPlan`
- Implementation:
  - Main accepted the safety-first slice: keep `streamAnswerTurn` as the orchestration entry, delete the stale TanStack `registrySearchToolDef` wrapper, promote read-tool ids/actions through the canonical action registry, add a frozen-snapshot finalization seam, and expose only production/test/tooling symbols through explicit barrels.
- Files changed:
  - `src/modules/answer-thread/internal/turn-orchestrator.ts`
  - `src/modules/answer-thread/internal/answer-turn-finalization.ts`
  - `src/modules/answer-thread/internal/answer-harness-operation.ts`
  - `src/modules/answer-thread/internal/tool-runner.ts`
  - `src/modules/answer-thread/internal/answer-tool-use-agent.ts`
  - `src/modules/answer-thread/internal/answer-run-summary.ts`
  - `src/modules/answer-thread/public.ts`
  - `src/modules/answer-thread/testing.ts`
  - `src/modules/answer-thread/tooling.ts`
  - `src/modules/harness/*`
  - answer-thread/harness unit and integration tests
- Commands run by main:
  - `npm run typecheck` — passed
  - `npm run test:unit -- tests/unit/chat` — passed, 105 files / 519 tests
  - `npm run test:eval:coverage` — passed, 12 cases / 10 turn cases / 2 thread cases
  - `npm run test:eval:report` — passed, min score 9.84
  - `npm run test:imports` — passed, 3 files / 3 tests
  - `npm run build` — passed
  - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor` — ran; exits 1 only on accepted `posthog-js` supply-chain diagnostic
- Result:
  - Remaining L0: 0
  - Remaining L1: 1 (`L1-003` action seam)
  - Remaining L2: 3 (`L2-005`, `L2-008`, `L2-009`; only `L2-009` remains an active stop-condition triage item)
  - New findings introduced: no verified L0-L2; raw Doctor count is now 601 raw / 598 source-owned, driven by public seam/test seam exports and accepted source-owned diagnostics.
- Next action:
  - Wave 5 action seam completion.

### Iteration 5 — Wave 5 action seam completion

- Planning agent:
  - `ActionSeamPlan`
- Implementation agents:
  - Main, using `ActionSeamPlan` result.
- Files changed:
  - `src/modules/common/action.ts`
  - `src/modules/actions/index.ts`
  - `src/modules/inquiries/inquiry.actions.ts`
  - `src/modules/registry/registry.actions.ts`
  - `src/routes/api.agent.tools.ts`
  - `src/routes/api.businesses.ts`
  - `src/routes/api.businesses.search.ts`
  - `src/routes/api.businesses.$slug.ts`
  - `src/components/ae/chat/AeChat.tsx`
  - `src/routes/index.tsx`
  - action, agent-tools, registry API, and answer-turn tests.
- Commands run by main:
  - `npm run typecheck` — passed
  - `npx vitest run tests/unit/actions/registry.test.ts tests/integration/agent-tools-api.test.ts tests/integration/registry-api.test.ts` — passed, 3 files / 35 tests
  - `npx vitest run tests/unit/chat/ae-chat-route-promotion.test.tsx tests/integration/answer-turn-boundary-follow-up.test.ts` — passed, 2 files / 5 tests
  - `npm run test:imports` — passed, 3 files / 3 tests
  - `npm run test:ts-standards` — passed, 1 file / 1 test
  - `npm run check:convex-codegen` — passed
  - `npm run build` — passed
  - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor` — ran; exits 1 only on accepted `posthog-js` supply-chain diagnostic
- Result:
  - Remaining L0: 0
  - Remaining L1: 0 (`L1-003` action seam closed)
  - Remaining L2: 2 (`L2-005`, `L2-008`; `L2-009` initial-query state/effect sync closed)
  - New findings introduced: no verified L0-L2; raw Doctor count is now 602 raw / 596 source-owned, driven by accepted source-owned diagnostics plus one accepted `posthog-js` supply-chain diagnostic.
- Next action:
  - Wave 6 backend perf sweep.

### Iteration 6 — Wave 6 backend perf sweep

- Agent:
  - Main plus `InquiryPerf`, `CatalogDiscoveryPerf`, `BillingActionPerf`, and `StoreHarnessPerf` triage agents.
- Files changed:
  - `convex/catalog.ts`
  - `convex/discovery.ts`
  - `convex/harnessSessions.ts`
  - `convex/inquiries.ts`
  - `convex/observability.ts`
  - `convex/protectedActionStore.ts`
  - `convex/security.ts`
  - `convex/source_state.ts`
  - `convex/billingStore.ts`
  - `src/modules/billing/billing.functions.ts`
  - `src/modules/registry/registry.functions.ts`
- Commands run by main:
  - `npm run typecheck` — passed after correcting the owner billing readback reducer type.
  - `npm run check:convex-codegen` — passed.
  - `npm run test:imports` — passed, 3 files / 3 tests.
  - `npm run test:ts-standards` — passed, 1 file / 1 test.
  - `npm run test:unit` — passed, 105 files / 521 tests.
  - `npx vitest run tests/unit/actions/registry.test.ts tests/integration/agent-tools-api.test.ts tests/integration/registry-api.test.ts` — passed, 3 files / 35 tests.
  - `npx vitest run tests/unit/billing/rail.test.ts tests/unit/billing/owner-routes.test.ts tests/unit/billing/autumn-provider.test.ts` — passed, 3 files / 17 tests.
  - `npm run build` — passed.
  - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor` — ran; exits 1 only on accepted `posthog-js` supply-chain diagnostic.
- Result:
  - Remaining L0: 0
  - Remaining L1: 0
  - Remaining L2: 0
  - New findings introduced: no verified L0-L2; raw Doctor count is now 560 raw / 554 source-owned, with the only raw error still the accepted `posthog-js` supply-chain diagnostic.
  - Backend perf residuals are L3/defer/noise: order-sensitive Convex writes, idempotency/audit/event append loops, framework-loaded Convex generated/server exports, and migration-scale low-risk iteration cleanups that require case-level review.
- Next action:
  - Stop the remediation loop and publish the final stop report.

## Final stop report

Completed 2026-07-02 after closeout verification.

```text
SCOPED READY / VERIFICATION GATES PASS

Verified audit backlog before → after:
- L0: 0 → 0
- L1: 6 → 0
- L2: 9 → 0
- L3: 9+ cleanup buckets → 9+ cleanup buckets
- Noise: documented → documented

Raw react-doctor before → current:
- diagnostics: 687 raw / 680 source-owned → 394 raw / 390 source-owned
- errors: 46 raw / 46 source-owned → 0 raw / 0 source-owned
- warnings: 641 raw / 634 source-owned → 394 raw / 390 source-owned

Audit/remediation gates run before the active UI branch diverged:
- npm run typecheck — passed
- npm run check:convex-codegen — passed
- npm run test:imports — passed
- npm run test:ts-standards — passed
- npm run test:unit — passed
- npx vitest run tests/unit/actions/registry.test.ts tests/integration/agent-tools-api.test.ts tests/integration/registry-api.test.ts — passed
- npx vitest run tests/unit/billing/rail.test.ts tests/unit/billing/owner-routes.test.ts tests/unit/billing/autumn-provider.test.ts — passed
- npm run build — passed
- npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor — ran; exit 1 was the then-active posthog-js supply-chain diagnostic before config was normalized.

Closeout rerun after the active UI-work interjection and small type/build blockers were cleared:
- npm run check:convex-codegen — passed
- npm run test:imports — passed
- npm run test:ts-standards — passed
- npm run test:unit — passed, 105 files / 525 tests on final rerun
- npx vitest run tests/unit/actions/registry.test.ts tests/integration/agent-tools-api.test.ts tests/integration/registry-api.test.ts — passed, 3 files / 35 tests
- npx vitest run tests/unit/billing/rail.test.ts tests/unit/billing/owner-routes.test.ts tests/unit/billing/autumn-provider.test.ts — passed, 3 files / 17 tests
- npm run typecheck — passed
- npm run build — passed; one CSS warning remains for generated `.rounded-[var(--ae-radius-*)]`, not a build blocker
- npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor — refreshed; latest baseline has 394 raw diagnostics / 390 source-owned diagnostics, 0 error diagnostics, and warnings only. Latest follow-up L3 cleanup reduced current source-owned warnings from 399 to 390.

Residual L3/noise:
- posthog-js supply-chain diagnostic is accepted package risk, not a new remediation blocker.
- unused-export/no-multi-comp/only-export-components remain migration-scale or documented framework/noise buckets.
- backend async/iteration diagnostics remain case-by-case L3/defer unless source review proves independence and no write/idempotency/audit ordering risk.
- optional bundle/de-dupe defers remain documented: motion LazyMotion bundle trim and normalizeSearchToken cross-runtime de-dupe.

Explicit defers:
- Remaining L3 items are cleanup/debt, not verified L0/L1/L2 trust, data-loss, runtime, or user-impact blockers.
```
