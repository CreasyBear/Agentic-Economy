# T50 — Legacy engine clean cutover

Labels: `wayfinder:task`, `tdd:red`, `retirement`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source ticket: T33.
Status: landed + verified at the source/local-smoke evidence boundary — legacy retirement is green through `check:kernel-retirement` in `output/release/final-gate-2.log`, and the WorkTree path is exercised in `output/release/work-tree-smoke.json.log`; open: none at the source/local boundary; hosted/external evidence remains T51/T53.

Blocked by: T46, T47, T48, T49.

## Outcome

Every public caller uses WorkTree/Study/receipt authority; the one-shot engine, decision map and duplicate tables are gone with no flag, shim or dual write.

## Public seam

Human `/`, registered agent action catalog, public readback and release retirement checks.

## Red

`AE_ENGINE_PROPOSALS` gates the old proposal path, root/stream imports still select engine plan or decision-map rendering, and `enginePlans`/`decisionMaps` remain durable authorities. WorkTree is an isolated panel.

## Minimal green

1. Migrate all root/orchestrator/replay callers to T46–T49 seams.
2. Remove `AE_ENGINE_PROPOSALS` and any preview/default branch selecting legacy behavior.
3. Delete `enginePlans`, `decisionMaps`, their Convex hosts/schema spreads, plan-proposal/decision-map modules, `AePlanWork`, `AeDecisionMapJourney` and engine-only stream events.
4. Remove embedded RFx snapshot/state fields superseded by T48 journal.
5. Remove stale tests, fixtures, docs and action descriptors that claim legacy behavior; replace only observable contracts still required.
6. Keep generic answer/thread persistence only where it projects WorkTree events; keep Customer Request and standalone Action Invocation.

## TDD tracer

Before deletion, add/adjust one retirement contract proving public build/action registry/schema contain no legacy source or environment flag while the T46–T49 vertical path remains green. Then delete in dependency order and run LSP references before each exported-symbol removal.

## Adopted seams

Existing import/source completeness tests and LSP references. No compatibility package, alias, migration projection or dual-write helper.

## Acceptance

- Source/import/schema search finds no `enginePlans`, `decisionMaps`, `AE_ENGINE_PROPOSALS` or engine-only public projection.
- No public route/action changes behavior based on a legacy flag.
- Human and agent vertical tests pass after deletion.
- Existing committed production data has an explicit one-time migration or verified absence before schema removal.
- Rollback is commit revert, not runtime dual ownership.

## End condition

WorkTree + Study + append-only receipts are the only project/decision authority in source and deployed schema.

## Source evidence

`src/routes/index.tsx`; `src/modules/answer-thread/internal/turn-orchestrator.ts`; `src/modules/answer-thread/internal/turns/proposal.ts`; `src/components/ae/chat/AeThreadTurnStreamSection.tsx`; `convex/enginePlans.ts`; `convex/decisionMaps.ts`; plan-proposal and decision-map module schemas.
