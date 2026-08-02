# T46 — Human root WorkTree loop

Labels: `wayfinder:task`, `tdd:red`, `human-surface`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T28, T30, T33.
Status: landed + verified at the source/local-smoke evidence boundary — root WorkTree cutover, development smoke and reload readback are covered by `src/routes/index.tsx`, `src/modules/work-tree/internal/root-loop.ts`, `tools/dev/work-tree-development-smoke.ts` and `output/release/work-tree-smoke.json.log`; the full source gate is green in `output/release/final-gate-2.log`; open: anonymous claim rotation remains tracked by T45, and hosted parity remains T51.

Blocked by: T45.

## Outcome

A person states an outcome at `/`, receives a durable project immediately, watches bounded elaboration, sees a decision-ready item and completes Lock/Adjust/Park with a rereadable receipt.

## Public seam

The root form and stream at `/`, verified only through public WorkTree readback and decision receipts.

## Red

The root defaults to service list/one-shot plan. The streamed path renders `AeDecisionMapJourney`; `AeDecisionInbox` and `AeWorkTreePanel` are isolated callback components. No root caller creates or reads a WorkTree.

## Minimal green

1. Root submit calls `workTree.create` before model work; project reference becomes the stream key.
2. The orchestrator emits only typed WorkTree projection events and invokes `workTree.apply` for `elaborate | study | propose_decision`.
3. Mount `AeDecisionInbox` (N=3) and `AeWorkTreePanel` behind progressive disclosure from source readback.
4. Wire Lock/Adjust/Park to `workTree.decide`; never mutate component/stream state as authority.
5. Show fog, quote freshness, evidence class, refusal/unknown and next decision without exposing model reasoning.
6. On reload, rehydrate from public readback and receipts; the transcript may be absent.

## TDD tracer bullets

Run one red→green cycle per bullet:

- submit BAS ask → durable project reference and inspectable root;
- source proposal → one decision-ready inbox item;
- Lock → durable locked transition receipt;
- stale Adjust → visible refusal with unchanged tree;
- Park → durable parked/queued state per contract;
- reload → same revision, inbox and receipt without replaying model output.

Each test drives the public route/server action boundary; no raw table or component-state assertions.

## Adopted seams

TanStack route/server functions, installed AI SDK structured output, existing WorkTree kernel, `AeDecisionInbox`, `AeWorkTreePanel`, shadcn accessibility primitives, React Arborist only for behind-disclosure tree rendering.

## Acceptance

- Root outcome creates exactly one WorkTree and no `enginePlan` or `decisionMap` write.
- Generation/revision/proposal digest and authority checks occur at the source mutation.
- All three decisions return durable receipts and are keyboard accessible.
- Labelled mock evidence never renders as provider fulfilment.
- A cold reload restores the journey from readback.

## End condition

The BAS development fixture runs outcome → elaboration → decision inbox → receipt entirely through WorkTree on `/`.

## Source evidence

`src/routes/index.tsx`; `src/modules/answer-thread/internal/turn-orchestrator.ts`; `src/components/ae/chat/AeThreadTurnStreamSection.tsx`; `src/components/ae/work-tree/AeDecisionInbox.tsx`; `src/components/ae/work-tree/AeWorkTreePanel.tsx`; `convex/workTrees.ts`.
