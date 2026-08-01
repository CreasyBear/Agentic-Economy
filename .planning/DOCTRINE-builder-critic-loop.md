# Doctrine — the builder/critic ultraloop for Agentic Economy

Adopted 2026-07-31 by founder directive. **Realigned v2 on 2026-08-01** to the confirmed vision and
the gates that have since landed. This is the standing operating loop for all agent sessions building
AE. It adapts the "AAA game, harsh critic, /loop until wowed" pattern to a product whose graphics
engine is trust: a person tells their AI what they need, and the work actually gets done through a
real business.

## Where this doctrine sits (subordinate, never overriding)

| Authority | Owns |
| --- | --- |
| `.planning/VISION-conceptual-map.md` | What AE is; the eleven PM primitives; the eight acts |
| `.planning/PROJECT.md` | Product charter, destination |
| `.planning/BRAND.md` | Voice (LOCKED); copy changes only via `src/content/brand-copy.ts` |
| `wayfinder/MAP-framework.md` | Current execution front, program governance, adopt-first rule, momentum SLO |
| `wayfinder/MAP-vision-gap.md` | Maturity audit, CEO/ENG gate verdicts, revised frontier |

This file describes *how* a session executes inside those. It never re-litigates a settled decision
(cooperative consultant grammar, tree-as-repo, rolling wave + fog, five-dimension node algebra,
report-driven runtime, Bundle-under-Customer-Request, spine exit-contract fields, momentum SLO, brand).

## What the source pattern gets right, and where AE must invert it

| COD pattern | AE verdict |
| --- | --- |
| Judge blind, side by side, against the real thing | **Keep.** The benchmark below. |
| A separate, harsh critic with no builder rationale | **Keep.** Cold context, gates below. |
| "Build every texture and physics system yourself, perfectly" | **Invert.** Adopt-first is binding: hand-rolled function/feature is a *defect*. |
| Stop when it *looks* AAA | **Invert.** AE can render a beautiful fabrication. Fabrication audit precedes taste. |
| `/loop` until wowed, unbounded | **Invert.** Stop conditions are frozen numbers, not adjectives. |
| Fan out across every quality dimension at once | **Invert.** The CEO gate NO-SHIPped horizontal-first. One wedge, vertically. |

## The benchmark ("the actual Call of Duty")

AE is judged **blind, side by side** against the best alternative for the same job: the person doing
it themselves — search, tab-hopping, phone calls, quote chasing — or asking a frontier chat assistant
without AE. A judge shown both outcomes must prefer AE's: faster to a *committed, correct* outcome,
clearer about cost/authority/uncertainty, honest on failure.

Contract parity with agentic.market stays the floor (`eval/parity`); the human-alternative blind test
is the ceiling. The critic runs both: the DIY baseline sets the wow bar, the bare frontier assistant
tracks the marketing claim.

## The unit of work: one wedge, vertically

**Superseded from v1:** the nine horizontal quality axes as a *fan-out unit*. The CEO gate found that
a horizontal first tranche builds a durable comparison product — the commodity layer Perplexity and
OpenAI can ship — while the locked brand promises "gets it done, receipts and all."

The unit is now one wedge carried end to end: grill-lite → charter → one study (weighted, explainable)
→ one approval-bound commitment → receipt → recovery, plus playbook v1. The nine axes survive only as
a **coverage checklist inside a slice**, never as nine parallel programs.

Fan-out happens across the **eight acts** of the journey (VISION §journey) where they are genuinely
independent, and sequentially where they share a seam.

## Stop conditions are numbers, not adjectives

"Utterly perfect" is unbounded by construction and burns budget re-deriving the same failure. Replace
it with what is already frozen:

1. **Momentum SLO (T32, binding)** — lock-to-next-decision-ready. Launch target 75% of non-terminal
   locks produce the next decision-ready item within 24h. Person-facing scalar: `Next decision: Nh`.
2. **Definition of Done by ticket type** (MAP-framework §governance) — research / grilling / task /
   prototype each have an explicit DoD. A task needs named adopted libs, focused tests green with the
   exact commands recorded, files listed, proof ceiling stated, Main re-verified.
3. **Customer kill gate** — observed completion with target customers, blind parity-or-win against
   incumbent assistants on the same asks, real payment or a signed paid pilot.
4. **Per-increment budget.** An increment that exhausts its budget parks with findings; it never
   silently continues.

"Wowed" survives as a tie-breaker *after* the numbers pass, never as a substitute for them.

**HITL, parked:** the kill-gate thresholds (cohort size, completion denominator, blind win rate,
manual-touch ceiling, payment floor, deadline) must be frozen by the founder **before** the slice
starts. Until then the loop may build the slice but may not declare the gate passed.

## Route every gap by failure class

v1 sent every critic finding back to a fresh builder loop. That is correct for exactly one of three
classes. Misrouting is what makes an ultraloop spin.

| Class | Response | Never |
| --- | --- | --- |
| Invariant / contract violation | Make the illegal state unrepresentable — schema shape, type, kernel fence — then add a regression test | Loop. No amount of re-prompting fixes a representable-but-invalid contract. |
| Environment / wiring | Fix it and add a preflight assertion so it cannot silently regress | Loop. A taste critic never finds a revoked credential or an off feature flag. |
| Taste / judgment | Builder/critic loop. **This is the only loop.** | Continue when the critic cannot name a falsifiable gap. |

Repo precedent for the first row: pattern-to-owner table before any new store; widen-migrate-narrow
for schema change; kernel-owns-fences with models emitting only the three gardener verbs
(`elaborate` / `study` / `propose_decision`).

**Worked example (2026-08-01, decision-map transport).** Six iterations of sharper instructions plus
per-attempt repair feedback never produced a kernel-valid decision map: every model distributed one
decision per root area. Reshaping the transport contract to `branchArea { decisions[] } + otherAreas[]`
— so the invalid tree cannot be expressed — succeeded on the next run. Separately, the live journey's
real blockers were a revoked `OPENROUTER_API_KEY`, `AE_ENGINE_PROPOSALS` defaulting to `false`, a
missing `--env-file`, and a 62.1s model leading the fallback list ahead of an 8.7s one. Class 1 and
class 2 findings. Zero of them were reachable by looping harder.

## Preflight — the loop may not start on a red baseline

Mechanical, before any subagent spawns. Every failure here is class 2: fix and assert, never loop.

- Credentials live for every provider the increment touches.
- Feature flags on, and the server actually executing the changed code.
- Focused tests green; `typecheck` clean; a **green baseline at HEAD**.
- Model fallbacks ordered by *measured* latency, not by name.
- Mandatory skills and referenced configs present on disk.

**Current state: preflight is RED** (MAP-framework §Risks — `typecheck` errors and unit failures at
HEAD, `examples/routing-*` sources deleted while tests still import them, uncommitted tree deleting
mandatory `ae-*` skills and playwright configs). T37 owns it. A "focused tests green" DoD claim made
on this baseline is not evidence.

## Builder charter

- **Adopt-first, checked before writing anything.** Name the adopted library on the ticket. A
  hand-rolled function or feature is a defect unless the adoption search failed and the failure is
  recorded. Hand-rolling is integration only.
- One wedge, one increment, rolling-wave: the smallest real thing that moves the blind comparison.
  Fog is first-class — an unelaborated branch is honest, a fabricated one is a defect.
- Kernel invariants non-negotiable: models propose, the kernel owns tree/budgets/fences and dispatch,
  Convex is the source of truth, registered-action seam, append-only journals.
- Never grades itself. The builder does not write its own critic report.
- **Subagent contract (founder rule):** exact direction, success criteria, end conditions, and
  patterns to copy. No fire-and-forget. Quality lands via Main review plus reviewer gates.

## Critic charter — order of operations

Cold context, no builder rationale, harsh by charter. Judge in this order; a failure at any level
stops the increment before the next is consulted.

1. **Fabrication.** Every fact traced to source. `Observed` / `Inferred` / `Unknown` labelled.
   Evidence classes never upgrade: mock-from-real cohorts prove capability, not availability; sandbox
   is not real supply; local is not hosted. **A beautiful invention is a failure, not a near-miss** —
   this is the one judgment a perceptual critic would get exactly backwards.
2. **Outcome and authority.** Did the customer's job move? Did every consequential effect stop at
   explicit, well-worded approval? Does inspect-only prove no effect? Is refusal honest?
3. **Measured numbers.** Momentum SLO, latency, cost, manual-touch count — against the baseline. A
   red mechanical gate means "not AAA" before taste is consulted at all.
4. **Taste.** Only now: would a real person, seeing this beside the alternative, choose AE? Blind,
   side by side, explicit winner with reasons.

Existing gate archetypes, reused rather than reinvented: **CEO** (customer value), **ENG**
(feasibility and sequencing), **domain**, and **premortem** (inverse: assume it shipped and failed).
A gate runs before any frontier tranche is declared done.

Findings come back as exact `file:line` or journey-step gaps, severity-ranked. "Adequate" is a fail.
But the critic must name a **falsifiable** gap — if it cannot, it passes and records the ceiling.

## Dogfood is the progress metric

AE-builds-AE is a standing fixture through the real runtime seams. Document choreography is not
dogfood. The loop's monotone progress metric is the **manual-escape ledger**: every roadmap increment
removes at least one recorded manual escape, and the count only falls. This is countable and
falsifiable in a way "wowed" never is.

## Fan-out rules

- Independent acts run as parallel builder/critic pairs under one orchestrator; workers coordinate
  directly when seams touch.
- Acts sharing a seam run sequentially. Prerequisites run inline, never as a lone spawned worker.
- HITL work — founder taste, grilling, wedge choice, credentials, production enablement, the kill-gate
  numbers — is **never simulated**. The loop parks `blocked` and surfaces one sharp question with a
  recommendation.
- Every closure lands on the wayfinder map: resolution comment, closed ticket, one-line decision
  pointer. Every premortem or gate finding lands in the risk register with an owner and a trigger
  signal, or is explicitly retired. Session ends with the map updated and a checkpoint commit.
- The map is the only cross-session memory that counts.

## Stop condition

A loop stops when the frozen numbers are met at the highest evidence class currently reachable
(hosted > local > mock-from-real > fixture), **or** the critic cannot name a falsifiable gap, **or**
the increment's budget is spent, **or** it reaches a HITL gate. "Utterly perfect" for AE means the
blind judge picks AE over the alternative for that wedge's journey, repeatedly, with real supply and
real money where enabled, while the momentum SLO holds and the manual-escape count keeps falling.
Until then, /loop — on taste only.
