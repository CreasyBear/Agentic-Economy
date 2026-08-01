# T32 — Linear-builder adversarial gate

Labels: `wayfinder:research` (closed 2026-08-01). Map: [Framework](../MAP-framework.md).

## Question

An adversarial review in the voice of someone who built Linear, over: v3/v4/v5 visuals
(/tmp/ae-vision-v3..5.html), the five-dimension model, the report-driven runtime, and the layered
architecture (kernel/runtime/planes/surfaces). Judge: momentum-as-product (lock-to-next-decision-ready
time), opinionated defaults vs configurability creep, narrow-launch discipline, report craft,
never-stale sync, decision-inbox ritual. Deliver falsifiable findings + the single highest-leverage
change, same contract as prior critic gates.

## Resolution

Resolved 2026-08-01 (`history://LinearBuilderGate`, full falsifiable findings there). Verdict:
**NO-SHIP on the settled model as an operating contract** — right thesis, momentum not yet contractual.
Adopted rulings:

1. **The momentum SLO is the operating metric:** clock runs from a durable current-generation
   `decision_locked` event to the first subsequent fully decision-ready node (recommendation,
   alternatives, consequence, current evidence, Lock/Adjust/Park exits). Launch target: **75% of
   non-terminal locks yield the next decision-ready item within 24 hours.** Never pauses for provider
   waits. Studies, supply, reports, inbox ordering, and recovery all optimize this one number.
2. **One global decision inbox, N=3, one ritual:** ranked by irreversibility × constraint-power ×
   lead time; one daily pass ≤10 minutes; recommendation first, "why now", exact consequence,
   Lock/Adjust/Park; Park gets a system-chosen revisit trigger (no settings panel). One digest when
   inbox becomes non-empty; interrupts only for expiring hold/deadline/recovery. Money/effect
   decisions each need their own digest-bound yes — **no batch-approve control** (amends the earlier
   "batched money-yes" idea).
3. **Top bar is ONE scalar:** `Next decision: 18h` (0h = ready now). The five dimensions surface only
   as the explanation of the selected call, never as dashboard counters.
4. **The weekly memo is canonical and crafted** — the product surface most customers live in.
5. **Freeze the kernel, launch one wedge top-to-bottom; gate `/` cutover on continuity** (no
   user-visible dual systems).

Feeds T30 (inbox/report spec above is binding), T33 (cutover continuity gate), and map Notes
(momentum SLO). Linear sources are pattern references only (proprietary product, not OSS).
