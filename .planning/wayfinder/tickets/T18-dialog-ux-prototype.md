# T18 — Dialog UX prototype: clarifying question + plan build-up in the thread

Labels: `wayfinder:prototype` (HITL). Status: closed 2026-07-31 (founder direction recorded). Map: [Agent engine](../MAP-engine.md).

## Question

How should the dialog feel in the existing `/` thread? Prototype (throwaway, /prototype skill) the rendering of: the agent asking one sharp clarifying question mid-plan, plan build-up as steps arrive (investigating → found options → comparing), a proposal card with rationale + next action, and the deterministic fast path (instant options, no dialog theater). React to it with the founder; the accepted direction becomes the render spec for T21. Non-goal: shipping components — this raises fidelity for a decision, then gets discarded.

## Resolution

Resolved 2026-07-31 by founder reaction during the Phase 1 checkpoint: keep the plan work subtle and
inline — quiet work steps (objective, completed/pending states, compact count) inside the answer flow,
with the full plan behind a disclosure control rather than a separate technical panel. Rendered spec
shipped as `src/components/ae/chat/AePlanWork.tsx` (engine plan projection from
`plan-contract` stream events) mounted in `AeThreadTurnStreamSection`; deterministic fast path renders
instant options with no dialog theater; the clarifying question renders as the agent speaking with the
ask box as the reply affordance. Founder-set doctrine for further polish: judge against the
builder/critic loop (`.planning/DOCTRINE-builder-critic-loop.md`), first ultraloop axis is ask → plan.
