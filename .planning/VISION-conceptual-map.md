# AE Conceptual Map — the vision authority

**Status:** confirmed by founder (2026-08-01) as the fundamental vision. Companion to `PROJECT.md`
(product charter) and `BRAND.md` (voice, locked). This file names what AE *is* conceptually and the
destination each module grows toward. Product agents: build toward this; do not re-architect against it.

## The core sentence

> **The person never wants to do any of this. They want its effect: the tree of unknowns narrowing
> until only their taste-decisions remain, and then things happening.**

AE productizes the founder's craft — project management and consulting (see BRAND.md provenance;
PM vocabulary never appears in copy). The process is the one used to build AE itself:
grill → locked decisions → map → studies → comparisons → commitments → receipts.

## Projects are durable, not conversational

An ask is not a chat. It becomes a **real project: a long-running decision tree that people come in
and out of.** Sessions are visits. The person leaves mid-plan and returns days later to find studies
completed, quotes collected, the frontier advanced, and only decisions waiting for them. Durability,
resumability, and asynchronous progress are structural requirements, not features.

## What a PM does, at the engineering level (the eleven primitives)

| # | Primitive | Mechanics |
|---|---|---|
| 1 | Elicit | Interview: outcome, hard constraints (date/budget/non-negotiables), wants vs needs, prior decisions. Separate goal from solution-guesses. |
| 2 | Frame | Measurable outcome + scope fence + assumptions register. |
| 3 | Decompose | Outcome → facets → work packages → dependencies. |
| 4 | Rank decisions | Load-bearing decisions first: irreversibility × constraint-power × lead time. |
| 5 | Study (RFx) | Per open decision: market scan → qualify → quotes → weighted comparison → recommendation. |
| 6 | Budget | Ranges, contingency, cash-flow against the envelope. |
| 7 | Schedule | Backward-plan from the end date; lead times, buffers, milestones. |
| 8 | De-risk | Plan B per commitment; fallbacks warm; uncertainty holds. |
| 9 | Govern authority | Who decides/approves/is informed; nothing consequential unsigned. |
| 10 | Drive | Commit, chase, verify against acceptance, collect receipts, re-plan on divergence. |
| 11 | Account | Progress, burn, blockers at a glance; closeout = evidence trail. |

## The module map (conceptual packages)

```
THE GRILL (intake)          THE MAP (decision architecture)
  intake/    Elicitation      decompose/  Facets→decisions→tasks; domain playbooks
  charter/   Goal predicate,  decision-graph/ Nodes ranked by irreversibility ×
             constraints,                    constraint-power × lead time;
             wants/needs,                    visible narrowing is the progress bar
             envelope, date

THE ECONOMY (where it runs) THE SPINE (trust & time)
  study/     RFx: scan→        authority/  observe → propose → approve-each →
             qualify→quotes→               mandate-within-bounds (trust ratchet)
             comparison→rec    wayfinder/  Backward-plan from the date; frontier;
  market/    Registry, priced              chases; re-plans (change control)
             capabilities,     evidence/   Receipts, attempts, burn — the
             web discovery as              project's story
             Imported Claims   recovery/   Plan-B branches, uncertainty holds,
  commerce/  Quotes→holds→                 honest cancellation
             commitments→      memory/     Standing preferences across projects
             payments (x402)
```

Surfaces: person UI (dialog + plan card + timeline), agent API (`/llms.txt`, `/SKILL.md`, MCP),
business console (publish once, earn from agent demand).

## The journey: “Where do we even start?” — eight acts, trust ratchets one notch per act

1. **The wall** — they type the big thing. No form, no category picker.
2. **The grill** — one question at a time, each with a recommended answer they can just accept.
   Competence signal: "it asked what I didn't know to ask." They only answer.
3. **The map** — facets appear; load-bearing decisions highlighted in the order they matter.
   "Three decisions unlock everything else." They only look.
4. **Studies fan out** — the market runs: listed businesses first, cited discovery where thin, real
   quotes in; weighted comparisons scored against their stated wants, with a recommendation. They only read.
5. **Decide** — they tap; the tree visibly collapses; frontier unlocks. Entropy reduction is the
   dopamine loop.
6. **Commit** — approvals bound to exact actions; deposits within a granted envelope; receipts accrue.
   One approval at a time, then earned mandates ("handle everything under $X like this").
7. **Wayfind to the date** — chases, follow-ups, re-plans happen without them; they see only new
   decisions and movement. A vendor falls through → recovery branch, one clean question, no crisis.
8. **Done** — the receipt trail is the story. Closeout feeds preference memory; the next big thing
   starts smarter.

## Why defensible

A chat assistant can do acts 2–3 as prose. Acts 4–8 require the economy: published priced capabilities,
a quote protocol, an authority seam, settlement, evidence. Doors 2 and 3 are not side features — they
are why the decided path ends in receipts instead of a to-do list. Domain playbooks (which facets,
which decisions matter, per project type) compound as proprietary knowledge with every project run.

## Continuity with the current repo (embryo → destination)

| Today | Grows toward |
|---|---|
| Customer Request | Charter |
| Plan contracts (`enginePlans`) | Decision Graph (long-running, re-enterable) |
| Registered actions + sandbox quotes | Study Engine supply |
| `web.discover` / Imported Claims | Market scan where supply is thin |
| Approval Grant / RouteMandate | Authority ratchet (approve-each → mandates) |
| `enginePlanEvents` | Evidence Ledger |
| T24 executable recovery | Wayfinder runtime's first obligation |
| T25 x402 tool spend | Commerce settlement leg |
