# React Doctor Remediation Plan + AutoReason Loop

**Date:** 2026-07-02  
**Mode:** implementation plan / autoreason loop  
**Inputs:**

- `.planning/audits/MASTER-AUDIT.md`
- `.planning/architecture-measurement/MEASURABLE-ARCHITECTURE-REVIEW.md`
- `package.json` scripts
- Current repo conventions in `AGENTS.md`

## Full goal

Drive the verified React Doctor / architecture remediation backlog down until **no verified L0–L2 findings remain**.

**Exit condition:**

```text
verified_remaining(L0, L1, L2) == 0
```

Remaining work may be:

- L3 cleanup only,
- accepted false positives,
- explicitly deferred future architecture decisions with a written rationale,
- raw react-doctor noise already classified as no-action.

Do **not** treat raw react-doctor counts as the goal. The goal is verified issue priority, not lint-score vanity.

## Priority levels

| Level | Meaning | Must fix before exit? |
|---|---|---:|
| L0 | runtime/data-loss/security blocker | yes |
| L1 | trust/safety invariant or core architectural seam debt | yes |
| L2 | verified quality/perf/a11y/conversion defect with user/operator impact | yes |
| L3 | cleanup/nit/debt with no current trust/runtime/user impact | no, unless cheap and safe |
| Noise | false positive / accepted pattern | no |

Mapping from the audit:

- MASTER `P0` → L0
- MASTER `P1` → L1
- MASTER `P2` → L2
- MASTER `P3` → L3
- MASTER noise register → Noise

## Non-negotiables

1. **Current repo beats memory.** If a prior audit/memory conflicts with current code, current code wins; update the ledger.
2. **Do not fix raw react-doctor output blindly.** Verify every finding against code and intended architecture.
3. **Deletion before abstraction.** Dead code gets deleted, not polished.
4. **Safety before prettiness.** Trust/receipt/grounding invariants outrank lint and bundle nits.
5. **One seam at a time.** Do not mix action-seam completion, answer-thread deepening, and route-readback extraction in one wave.
6. **Subagents do not run project-wide gates.** They edit scoped files only. The main agent runs verification after integrating the wave.
7. **No public-copy overclaims.** AE does not book, charge, dispatch, or auto-fulfil.
8. **For Convex work, read `convex/_generated/ai/guidelines.md` before editing Convex code.**
9. **For visual/UI changes, read `DESIGN.md`; preserve AE's daylight identity and amber-only warm accent.**
10. **Use LSP for symbol-aware renames/references when available.** Especially `role` → `operatorRole`.

---

# AutoReason loop

Run this loop until the full goal is satisfied.

```text
LOOP ReactDoctorRemediation

1. Baseline
   - Read MASTER-AUDIT.md and this plan.
   - Read/update REACT-DOCTOR-REMEDIATION-LEDGER.md.
   - Check current code for drift before acting.
   - Run only baseline commands needed for this loop iteration.

2. Classify
   - Convert current raw findings into L0/L1/L2/L3/Noise.
   - Never promote a raw react-doctor finding without code evidence.
   - If the raw finding is known noise, record it once and ignore it.

3. Select wave
   - Pick the smallest independent set of L0-L2 fixes.
   - Prefer safety + deletion before architecture.
   - Avoid overlapping file ownership across subagents.
   - If a fix changes a module interface, use a plan/design subagent before code.

4. Spawn subagents
   - One agent per isolated file cluster.
   - Each assignment must include exact files/symbols, non-goals, and no project-wide gates.
   - Agents coordinate via IRC if overlap appears.

5. Integrate
   - Main agent resolves conflicts and checks changed surfaces.
   - Delete obsolete code; no compatibility shims unless required by live callers.

6. Verify
   - Run targeted tests first.
   - Then run the wave gate.
   - Then rerun react-doctor baseline.
   - Any newly introduced L0-L2 item blocks progression.

7. Update ledger
   - Record wave, changed files, tests, react-doctor delta, remaining L0-L2.
   - If remaining L0-L2 > 0, loop to step 2.
   - If remaining L0-L2 == 0, stop and report READY with residual L3/noise list.

END LOOP
```

## Baseline commands

Use existing scripts; do not invent a separate harness unless needed.

```bash
npm run typecheck
npm run check:convex-codegen
npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor
```

For final readiness:

```bash
npm run typecheck
npm run check:convex-codegen
npm run test:imports
npm run test:ts-standards
npm run test:unit
npm run test:integration
npm run test:copy
npm run test:ui-contract
npm run build
npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor
```

Only run heavier suites such as `npm run test:eval`, Playwright, or deploy/provider smokes when the wave touched those surfaces.

---

# Subagent usage model

## Main GPT-5.5 owns

- loop state,
- wave selection,
- high-risk design choices,
- final integration,
- verification,
- updating this plan/ledger if findings change.

## Subagents own

- scoped implementation work,
- exact files/symbols in their assignment,
- no project-wide verification,
- no formatting sweeps,
- no repo-wide exploratory rewrites.

Every subagent assignment must include:

```text
# Target
Exact files/symbols. Explicit non-goals.

# Change
Step-by-step desired edits.

# Acceptance
Observable local result. No project-wide commands.
```

---

# Wave 0 — setup / durability

**Owner:** Main only.

Tasks:

1. Persist per-domain `local://audits/*.md` reports into `.planning/audits/` if still available.
2. Refresh baseline:
   - `npm run typecheck`
   - `npm run check:convex-codegen`
   - `npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor`
3. Update `REACT-DOCTOR-REMEDIATION-LEDGER.md` with baseline counts and known noise.
4. Read exact files for Wave 1 before spawning agents.

**Exit:** baseline known; ledger has current L0-L2 list.

---

# Wave 1 — small/high-confidence fixes

Spawn these in parallel. They are intentionally narrow and mostly disjoint.

## Agent 1 — `AnswerSafety`

**Target:**

- `src/modules/answer/**`
- `src/modules/answer-thread/**`
- `src/components/ae/chat/AeChat.tsx`
- relevant answer/chat tests

**Change:**

1. Wire `sanitizeStructuredAnswer` / `validateCatalogGrounding` into the persist + SSE-complete path, unless current code proves the mandate was superseded.
2. Add the smallest test/eval proving invalid/ungrounded structured output cannot be persisted or streamed as final.
3. Fix `AeChat.tsx` no-adjust-state-on-prop-change stale projection flash with a prev-prop pattern.
4. Extend coverage beyond `ae-chat-route-promotion.test.tsx`; that test covers liveTurn/welcome promotion, not thread-switch stale projection.

**Non-goals:**

- no full answer-thread deepening,
- no tool registry redesign,
- no eval framework rewrite.

## Agent 2 — `ReceiptIntegrity`

**Target:**

- `src/modules/business-action/**`
- existing hash/crypto helpers

**Change:**

1. Replace timing-unsafe `!==` hash comparisons around `business-action.ts:977-989` with existing `safeEqualHex` / `constantTimeEqual`.
2. Preserve behavior for missing/malformed hashes.
3. Add the smallest targeted test if a nearby test harness exists.

**Non-goals:**

- no business-action action-seam migration,
- no receipt model redesign,
- no new crypto helper unless the existing helper cannot fit.

## Agent 3 — `DeadCodeSweep`

**Target:**

- dead files listed in MASTER P3
- `package.json`
- `package-lock.json`

**Change:**

Delete verified-dead code only:

- `src/modules/answer/openui/**`
- `@openuidev/react-lang`
- `src/modules/lifecycle/**`
- `src/modules/answer/artifacts.ts`
- `protected-action/internal/{policy,attempt-readback,reconstruction}.ts`
- `seo/internal/validators.ts`
- `AeSearchContextBar`
- `AeProseBlock`
- `AdminAnalyticsPanel`
- shadcn dead primitives: `hover-card`, `native-select`, `toggle`, `toggle-group`
- dead `ai-elements/message.tsx` `MessageBranch*` / actions / toolbar exports, if verified unused
- `.tmp-answer-eval-inspect.ts`
- `atmn`
- 2 deprecated funnel fns, if verified unused

**Must preserve:**

- all `convex/*.ts` convention-loaded files,
- `answer-thread/projection.ts`,
- `dev/` seed module,
- `radix-ui`,
- live `billing`, `protected-action`, `business-action` modules even if not actions.

**Non-goals:**

- no package-wide unused-export sweep,
- no lint-driven deletions without references proof,
- no route refactors.

## Agent 4 — `OwnerShellMechanical`

**Target:**

- `src/components/ae/layout/AeOperatorShell*`
- sidebar / command menu components
- `src/routes/owner/**`
- `src/routes/admin/**`

**Change:**

1. Rename domain prop `role` → `operatorRole` across shell/sidebar/command-menu and all call sites.
2. Use LSP rename/references first; fall back to AST-aware edits if JSX prop rename needs it.
3. Replace plain `<a>` with TanStack `<Link>` in:
   - `owner.billing.redirecting:36`
   - `admin.monetization.$operationId:156`
   - `owner.inquiries.$threadId:244`

**Non-goals:**

- no owner billing future-phase cutover,
- no action-seam migration,
- no route readback extraction.

## Agent 5 — `SharedPublicPolish`

**Target:**

- `src/components/**` shared primitives
- `src/routes/$slug.inquiry.tsx`
- public token/search helpers

**Change:**

1. Add `sandbox` to `AeGenerativeMap` iframes.
2. Convert `ai-elements/prompt-input.tsx` `isComposing` from `useState` to `useRef`.
3. Fix inquiry form hydration disabled→enabled flash in `$slug.inquiry.tsx`.
4. Deduplicate `normalizeSearchToken` only if an existing shared location is obvious; otherwise record a follow-up.
5. Optionally convert `motion` → `m` + `LazyMotion` in `animate/fade-in.tsx` + `ai-elements/shimmer.tsx` only if the pattern is clean in both files.

**Non-goals:**

- no visual restyle,
- no route IA changes,
- no shared component reorganization.

## Wave 1 gate

Main runs after integrating all five agents:

```bash
npm run typecheck
npm run check:convex-codegen
npm run test:imports
npm run test:ts-standards
npm run test:unit
npm run build
npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor
```

Update ledger. Any new L0-L2 blocks Wave 2.

---

# Wave 2 — circular seams

Run after Wave 1 gate is green or consciously documented.

## Agent 6 — `ObservabilitySecurityCycle`

**Target:**

- `src/modules/observability/**`
- `src/modules/security/**`

**Change:**

Break observability↔security bidirectional imports by extracting a small shared sink/interface. Preferred shape: `AuditEventSink` or equivalent lower-level adapter so security records audit events without importing observability public modules.

**Non-goals:**

- no observability UI rewrite,
- no security policy redesign,
- no action-seam migration.

## Agent 7 — `CatalogCycle`

**Target:**

- `src/modules/catalog/public.ts`
- `src/modules/catalog/internal/publish.ts`
- `src/modules/catalog/internal/owner-public-flow.ts`

**Change:**

Collapse the catalog barrel cycle. `public.ts` must not re-export internal implementation that imports public back. Move shared types/helpers lower if needed.

**Non-goals:**

- no behavior change,
- no registry/action API change.

## Wave 2 gate

```bash
npm run typecheck
npm run check:convex-codegen
npm run test:imports
npm run test:ts-standards
npm run test:unit
npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor
```

Expected delta: circular-dependency verified L2/L1 findings trend to 0.

---

# Wave 3 — billing future-phase cutover

## Agent 8 — `BillingFuturePhaseCutover`

**Target:**

- `src/routes/owner.billing*`
- `src/future-phases/05-*`
- live billing modules/components

**Change:**

Promote the panels/readback that active `/owner/billing*` routes use out of `src/future-phases/05-*` into live `src/`, then cut active route imports from parked future-phase code.

**Non-goals:**

- no billing architecture redesign,
- no Autumn/Stripe behavior change,
- no action-seam migration.

**Gate:**

```bash
npm run typecheck
npm run test:imports
npm run test:unit
npm run build
```

---

# Wave 4 — answer-thread deepening

Do **not** start this as a blind code swarm. First spawn a design/planning subagent.

## Agent 9 — `AnswerTurnPlan`

**Target:**

- `src/modules/answer-thread/public.ts`
- `src/modules/answer/public.ts`
- `src/modules/answer-thread/internal/turn-orchestrator.ts`
- `src/modules/answer/tools/registry-search.tool.ts`
- chat tests

**Change:**

No code initially. Produce a mini-plan:

- current public exports,
- proposed ≤30-symbol interface,
- caller migration map,
- internal seams for turn orchestration,
- test strategy,
- decision: delete or wire unconsumed `registrySearchToolDef`.

Only after main accepts the mini-plan, split implementation into scoped agents:

1. `AnswerTurnInterface`
2. `AnswerTurnOrchestratorSplit`
3. `AnswerToolSeam`

**Gate:**

```bash
npm run typecheck
npm run test:unit -- tests/unit/chat
npm run test:eval:coverage
npm run test:eval:report
npm run test:imports
npm run build
npm run doctor -- --no-telemetry --no-score --output-dir .planning/react-doctor
```

---

# Wave 5 — action seam completion

This is not a lint fix. Treat as a dedicated architecture project.

## Agent 10 — `ActionSeamPlan`

**Target modules:**

- `billing`
- `business-action`
- `protected-action`
- `catalog`
- `observability`
- `/api/businesses/*`
- inquiry UI/owner server fns

**Change:**

No code initially. Produce a table:

```text
module · current path · current seam · desired seam · surfaces · migration steps · tests · risk
```

Decision per module:

1. promote to action,
2. keep server fn and remove misleading action surfaces,
3. route API through action contract,
4. document explicit exception.

Only after main accepts the seam plan, implement module-by-module. Do not expose writes to `agentTools` without admission/approval.

**Gate:**

```bash
npm run typecheck
npm run check:convex-codegen
npm run test:integration
npm run test:imports
npm run test:copy
npm run test:ui-contract
npm run build
```

---

# Wave 6 — backend perf sweep

This comes from the third-party full-repo react-doctor run, not the src-scoped scan.

## Agent 11 — `BackendPerfTriage`

**Target:**

- `convex/*Store.ts`
- `src/modules/**/*.functions.ts`
- server functions

**Rules to verify:**

- `async-await-in-loop` ×67
- `js-combine-iterations` ×63
- `server-sequential-independent-await` ×20
- `zod-v4-no-deprecated-schema-apis` ×18
- `js-min-max-loop` ×15

**Change:**

Only change cases that are provably independent and preserve ordering/side effects. Many awaits-in-loops are correct.

**Gate:**

```bash
npm run typecheck
npm run check:convex-codegen
npm run test:integration
npm run test:unit
npm run build
```

---

# Stop condition checklist

The loop is done when all are true:

- [x] No verified L0 findings remain.
- [x] No verified L1 findings remain.
- [x] No verified L2 findings remain.
- [x] All remaining raw react-doctor findings are classified as L3, Noise, or explicit defer.
- [x] `npm run typecheck` passes.
- [x] `npm run check:convex-codegen` passes.
- [x] Relevant test suites pass for touched surfaces.
- [x] Final react-doctor baseline is written to `.planning/react-doctor/`.
- [x] `REACT-DOCTOR-REMEDIATION-LEDGER.md` records final residuals and rationale.

## Final report format

When stopping, report:

```text
READY / NOT READY

Baseline before → after:
- verified L0:
- verified L1:
- verified L2:
- raw react-doctor diagnostics:

Gates run:
- ...

Residual L3/noise:
- ...

Explicit defers:
- ...
```
