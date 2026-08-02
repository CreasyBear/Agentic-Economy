# T49 — Shared decision receipts, trust ramp and memo

Labels: `wayfinder:task`, `tdd:red`, `decision-surface`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T30, T34.
Status: landed + verified at the source/local-smoke evidence boundary — protected-decision step-up, decision policy/inbox, memo, notification and repeat-permission paths are landed in the WorkTree module; inbox→lock→receipt→reload_readback is recorded in `output/release/work-tree-smoke.json.log` and source verification is green in `output/release/final-gate-2.log`; open: hosted parity remains downstream in T51.

Blocked by: T46, T47, T48.

## Outcome

Human and agent decisions produce one durable receipt; money-adjacent or authority-widening decisions require explicit per-item approval; the weekly memo is a projection of the same source journal.

## Public seam

WorkTree inbox on `/`, `workTree.decide` for agents, `workTree.inspect` receipts, and one notification containing a public readback link.

## Red

The inbox is an isolated synchronous projection with callback buttons. `moneyYes` only marks positive cost and does not enforce irreversible/constraint/power/time semantics. Memo generation is not composed into the product loop. Existing repeat permission is Customer-Request-specific and not integrated with WorkTree decisions.

## Minimal green

1. Define source decision identity and `lock | adjust | park` transition receipts on one exact current proposal.
2. Order/cap inbox using source projection: irreversibility, constraint power, lead time and priority; money is one factor, never a batch-approval shortcut.
3. Require step-up/per-item approval for paid, irreversible or authority-widening Lock; Adjust and Park remain explicit source actions.
4. Integrate existing bounded repeat permission for eligible low-risk exact actions; scope widening/expiry/revocation fails closed.
5. Project a weekly memo/exception alert with changed decisions, receipts, refusals and next actions; send through notification outbox using React Email.
6. Memo links to authenticated public readback and contains no secret, raw model reasoning or new source state.

## TDD tracer bullets

- identical proposal in human/agent hosts → same decision identity;
- Lock → one source receipt visible in both hosts;
- paid/irreversible Lock without step-up → refusal;
- Adjust → corrected proposal/revision, not assumption-only UI state;
- Park → durable non-success disposition;
- eligible repeat use → bounded receipt; expired/revoked/widened use → refusal;
- memo delivery retry → one logical notification and same readback link.

## Adopted seams

Existing WorkTree inbox projection, Customer Request repeat-permission actions, notification outbox, React Email/render, date-fns. No new scheduler or approval DSL.

## Acceptance

- No synchronous component callback is treated as completion.
- No multi-item money approval exists.
- Every decision and repeat use is attributable, fenced and rereadable.
- Memo is projection-only and idempotent.
- Keyboard focus, loading, error and stale states are complete.

## End condition

One human decision, one agent decision and one memo all resolve to the same WorkTree journal and receipts; no parallel decision-map write occurs.

## Source evidence

`src/modules/work-tree/internal/inbox-projection.ts`; `src/components/ae/work-tree/AeDecisionInbox.tsx`; `src/modules/customer-request/customer-request.actions.ts`; `CustomerRequestRepeatPermissionControl.tsx`; notification/outbox and memo projection sources.


- Open item: step-up self-submission by approve_each agents is accepted this cycle; binding a human approval artifact to stepUp is open.

## Open follow-up

- A consumed-use ledger with atomic occurrence and spend settlement remains open; per-call validation alone cannot bound cumulative use.