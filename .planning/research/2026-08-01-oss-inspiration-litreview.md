# OSS inspiration literature review — building the AE vision (2026-08-01)

Charter: `.planning/VISION-conceptual-map.md`. Gap map: `.planning/wayfinder/MAP-vision-gap.md`.
Method: five parallel source-verified researchers (`history://NamedReposScout`, `HarnessScout`,
`DurabilityScout`, `ProjectUxScout`, `StudyRfxScout`) reading actual repos/docs. Stack constraint:
TypeScript + Convex is fixed — most findings are **borrow the pattern**, not adopt the dependency.
This review is itself an AE dry-run: charter → studies → (next) critic gates.

## Verdict summary — what to adopt, borrow, avoid

| Source | What it is | Call | Feeds |
| --- | --- | --- | --- |
| `@convex-dev/workflow` + `workpool` | Durable functions on Convex | **ADOPT** | #1 project spine |
| `mattpocock/skills` grilling + wayfinder | The exact intake + map/ticket/frontier protocols | **ADOPT the mechanics** (as product schema/UX, not GitHub issues) | grill, charter, decision-graph, runtime |
| `yc-software/qm` | "Multiplayer agent harness for work" (MIT, active) | **BORROW** Project scope + Task/Run lease/idempotency model | spine, runtime, recovery |
| Temporal / Inngest / Trigger.dev / Restate | Durable-execution references | **BORROW semantics** (signals/timers/queries, waitpoints, versioning) | spine, chases |
| LangGraph persistence/interrupts | Checkpointer vs store; `interrupt()`/resume | **BORROW pattern** | decision-graph durability, recovery, memory |
| Claude Agent SDK hooks | Pre/Post/defer action fencing, lifecycle events | **BORROW seam** (Commercial Terms — never adopt) | authority, evidence |
| Mastra | TS workflows + memory (resource vs thread) | **BORROW** typed steps, suspend/resume, memory split | runtime, memory |
| oh-my-pi | Coding-agent harness (jobs, subagents, artifacts, skills) | **BORROW** job envelope + artifact-first outputs | runtime, evidence, agent surface |
| Linear (docs) / Plane | Project/initiative/milestone models, saved views | **BORROW** 3 UI patterns | person surface |
| Loomio | Collaborative decision-making | **BORROW** proposal→positions→outcome | decision-graph decide affordance |
| TOPSIS js / OpenProcurement / OpenAI deep research | MCDM scoring, RFx lifecycle, research artifact | **BORROW** scorer + states + report shape | study engine |
| Focalboard / Huly | PM boards / all-in-one platform | **AVOID** (unmaintained / hosted shutdown) | — |

## 1. The spine decision is answered (build item #1)

**Adopt `@convex-dev/workflow` (+ `workpool`).** Evidence: durable functions survive restarts, "pause
indefinitely while it waits for an asynchronous event or sleep for an arbitrary amount of time, without
consuming any resources"; `step.awaitEvent` (= human decision), `step.sleep` (= scheduled chase),
reactive status queries (= dashboard), cancel/restart-from-step; mutations exactly-once, `onComplete`
exactly-once. **Design-in constraints:** 1 MB step data / 8 MiB journal → pass IDs+hashes, keep domain
state in Convex tables; determinism → active workflow definitions are immutable/versioned, replans are
new revisions, never edited handlers; external side effects need idempotency keys (exactly-once is
Convex-mutations only); workpool `statusTtl` defaults 1 day → set `Infinity` for project-lifetime
status; keep pools ≤ ~100 parallelism (Pro).
**Borrowed semantics (Temporal's vocabulary, our runtime):** signals→typed decision events,
timers→chases, queries→reactive dashboard reads. **Expiry split confirmed:** quote validity is domain
freshness (minutes); project continuity is the workflow (months) — waking a project mints a fresh quote
revision, exactly the AP2/T16 lesson.

## 2. The grill and the map are already specified — productize them verbatim

The founder-named skills ARE the spec:
- **Grilling protocol** (quote): "Walk down each branch of the decision tree, resolving dependencies
  between decisions one-by-one. For each question, provide your recommended answer. … one at a time …
  If a *fact* can be found by exploring the environment, look it up rather than asking. The *decisions*
  are mine. … Do not act until I confirm we have reached a shared understanding."
  → Product: Interview cards `{question, recommendedAnswer, answer, source: person|environment,
  status: pending|accepted|edited|skipped, dependencyIds}`; one card at a time; Accept / Edit / I'm
  unsure; a `sharedUnderstandingConfirmed` event gates studies and commitments.
- **Wayfinder protocol** (quote): map = "an index, not a store"; tickets each resolve ONE decision;
  claim-by-assignment; native blocking; "the frontier is the open, unblocked, unclaimed children";
  fog = "Not yet specified"; decisions journaled on resolution.
  → Product: the decision graph IS wayfinder for civilians. Non-technical vocabulary (from
  NamedReposScout): "What we're deciding", "Waiting on", "Ready next", "Decisions so far", "Not ready
  to define yet".
- **qm** (`yc-software/qm`, MIT, active 2026-07-31): Project as durable collaboration scope
  (`{id, orgId, name, ownerId, memberIds}`); Task statuses `pending|in_progress|completed|skipped|
  failed` with `expectedStatus` transitions + append-only TaskEvents; Run queue with `dedupKey`,
  `maxAttempts`, `claim(worker, ttl)` leases, heartbeats, one-running-per-session partial unique index,
  `idempotency_key UNIQUE`. → Borrow wholesale as the Convex-table shape for AE's background runtime.

## 3. Runtime patterns (harness architecture)

- **Hook seam** (Claude SDK shape): Pre-action fence (deny/ask/allow/modify/**defer**) + post-action
  receipt around every registered action. AE already half-owns this (effect metadata + approve_each);
  the borrow is *defer* — pause an action for HITL and resume later — and uniform post-action receipts.
- **Checkpointer vs store** (LangGraph): thread/project-scoped execution state ≠ cross-project memory.
  `interrupt()` persists indefinitely and resumes by pointer — the shape for decision-waits. Add
  retention/expiry (their documented unbounded-growth warning).
- **Job envelope** (oh-my-pi/qm): `{jobId, parentId, status, attempts, event stream, artifacts,
  delivery state}` with auto-delivery on settle — the shape for studies running while the person is away.
- **Memory split** (Mastra): stable `resource` (person/household) vs per-`thread` history; background
  compaction of old history into observations. → AE memory module blueprint.

## 4. Person surface (borrow 3 patterns)

1. **Linear projects**: outcome + target date *with certainty granularity* (year/half/quarter/month/day)
   + milestones — matches charter's date field; timeline/board/list projections.
2. **Re-entry view** (Linear initiatives health + Plane saved views): "what moved since last visit" —
   latest-update rollup, health (green/yellow/red/gray), saved filtered views; answers the come-and-go
   requirement directly.
3. **Loomio decide affordance**: proposal → positions → explicit outcome event collapses the decision
   node and unlocks frontier — decision as first-class object, not a chat reply.

## 5. Study engine (minimal schema, from StudyRfxScout)

Borrow: explainable weighted scoring (TOPSIS-style normalize→weight→ideal-distance, implemented pure
TS — the npm package is stale and buggy); OpenProcurement's RFx lifecycle
(`enquiryPeriod→tenderPeriod→qualification→award`, questions/bids/awards as append-only events);
OpenAI deep-research artifact shape (question → method → findings → **inline citations with source
locators** → recommendation). Proposed `Study` schema recorded in the scout transcript: criteria derive
from charter wants (weights, sum=1), **hard needs gate eligibility before scoring**, per-criterion
explanation persisted, immutable score/recommendation revisions, evidence refs — never store only the
winner.

## 6. What this changes in the build order

Nothing re-ranks; everything de-risks. #1 spine has a named substrate (adopt decision ready), #2 grill
has a verbatim spec, #3 study has a schema donor, #4 chases have a mechanism (`step.sleep` +
workpool + qm leases), person surface has three concrete patterns. Next act in AE's own process:
critic gates (CEO/customer-value review + engineering review), then charters for the product agents.
