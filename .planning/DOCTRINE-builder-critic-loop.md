# Doctrine — the builder/critic ultraloop for Agentic Economy

Adopted 2026-07-31 by founder directive. This is the standing operating loop for all agent sessions
building AE toward the charter destination. It adapts the "AAA game, harsh critic, /loop until wowed"
pattern to a product whose "graphics engine" is trust: a person tells their AI what they need, and the
work actually gets done through a real business.

## The benchmark ("the actual Call of Duty")

AE is judged **blind, side by side** against the best human alternative for the same job:
the person doing it themselves — search, tab-hopping, phone calls, quote chasing — or asking a
frontier chat assistant without AE. A judge who sees both transcripts/outcomes must prefer AE's:
faster to a *committed, correct* outcome, clearer about cost/authority/uncertainty, and honest on
failure. Contract parity with agentic.market stays the floor (eval/parity); the human-alternative
blind test is the ceiling we climb toward.

**Founder decisions (2026-07-31):** the critic runs **both** comparisons — the DIY human baseline
sets the wow bar (headline), the bare frontier assistant tracks the marketing claim. The first full
ultraloop after engine Phase 1 closes is **axis 2: ask → plan**.

**Voice decision (founder, 2026-07-31):** public copy speaks as THE authority of the agentic
economy — declarative, zero hedging, zero defensiveness (reference register: withmonid.com's
"We're building the economic layer for AI agents"). Conviction lives in the claims we own
("Businesses publish once. Agents bring them work. Every call is paid."); truth-boundaries live at
decision points per ae-public-copy-guardrails, never as standing qualifiers. "No options yet" is an
invitation to list, not an apology.

## Quality axes (each owned by its own loop)

1. **Ask → answer** — clear asks answered deterministically, instantly, zero model ceremony.
2. **Ask → plan** — open-ended asks earn a durable Plan Contract: goal predicate, typed steps,
   frontier execution, honest progress. (MAP-engine.md)
3. **Options & comparison** — real published supply, real prices, real availability; comparison a
   person can act on without private knowledge.
4. **Authority & approval** — every consequential effect stops at explicit, well-worded approval;
   inspect-only proves no effect. (mandates, T3 scopes)
5. **Execution & recovery** — dispatch, retry, interruption, resume, honest cancellation against
   provider endpoints. (readiness probes, route runtime)
6. **Supply onboarding** — a business publishes once, self-serve, and becomes agent-earnable.
   (T11 funnel, T4/T20 real endpoints)
7. **Money** — prepaid credit, per-call price, rake on paid calls only, provable settlement.
   (T2/T12, x402)
8. **Machine surfaces** — a cold agent discovers, navigates, and completes with zero private
   knowledge. (/mcp, /SKILL.md, llms.txt, requests API)
9. **Copy & UI craft** — reader-first, decision-relevant, Astryx-clean; no directory-wall smell.

## The loop (per axis, per increment)

```
chart (wayfinder ticket) → grill founder on the decision (HITL, one question at a time)
  → BUILDER subagent implements the smallest real increment
  → CRITIC subagent judges it cold — separate context, no builder rationale, harsh by charter
  → verdict "wowed"? → close ticket, journal decision on the map
  → verdict "not AAA"? → concrete gaps back to a fresh BUILDER loop; repeat
```

Critic charter (the harsh part):
- Runs the **cold-agent journey** (skill: ae-agent-journey-testing): public origin only, follows
  `navigation.actions`, no fixture IDs, no scripted transcripts.
- Runs the **person-value judgment**: would a real customer, seeing this next to the human
  alternative, choose AE? Blind, side by side, explicit winner declared with reasons.
- Scores against the axis's mechanical evals first (eval/parity, eval/engine, focused vitest);
  a red mechanical gate means "not AAA" before taste is even consulted.
- Never softens: "adequate" is a fail. The bar is *wowed*. Findings come back as exact
  file:line / journey-step gaps, severity-ranked.
- Evidence classes never upgrade (sandbox ≠ real supply; local ≠ hosted). A wow on labelled
  local evidence is a local wow — the map records the ceiling.

Builder charter:
- One axis, one increment, smallest real thing that moves the blind comparison.
- No self-grading: the builder never writes its own critic report.
- Kernel invariants are non-negotiable: model proposes / kernel validates & dispatches /
  Convex is source of truth; registered-action seam; append-only journals.

## Fan-out rules

- Independent axes run as parallel builder/critic pairs (one orchestrator supervises; workers
  coordinate via IRC when seams touch).
- HITL tickets (grilling, founder taste, credentials, production enablement) are never simulated —
  the loop parks (`blocked`) and surfaces one sharp question with a recommendation.
- Every loop closure lands on the wayfinder map: resolution comment, closed ticket, one-line
  decision pointer. The map is the only cross-session memory that counts.

## Stop condition

A loop stops only when its critic is wowed **at the highest evidence class currently reachable**
(hosted > local > fixture), or when it hits a HITL gate. "Utterly perfect" for AE means: the blind
judge picks AE over the human alternative for that axis's journey, repeatedly, with real supply and
real money where enabled. Until then, /loop.
