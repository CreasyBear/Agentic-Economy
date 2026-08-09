# AE + Wayfinder — Reference Architecture (the destination)

**Date:** 2026-08-05
**Type:** design artifact (read-only; no source edits). Synthesizes the *idealised* AI/agent
architecture for Agentic-Economy (AE) + Wayfinder, per `.planning/VISION-conceptual-map.md`,
`.planning/wayfinder/MAP-vision-gap.md`, `.planning/wayfinder/JOURNEYS.md`,
`.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, and the research files cited inline.
This is NOT a current-code inventory; other agents are editing code concurrently — nothing here
touches `src/`, `convex/`, or `tests/`.

**Authority invariant that everything below serves:**
> Convex is the durable source of truth; the deterministic kernel owns authority, validation,
> persistence, recovery and projection. Model output is a PROPOSAL, never authority. A marketplace
> display is never executable authority. Nothing consequential is unapproved.

---

## 1. The one accepted paradigm

The idealised AE+Wayfinder architecture is a **long-running durable project engine** — not a chat
wrapper and not a model-owned loop. It runs as:

> **Deterministic stages + bounded model segments + a durable Project state machine on
> `@convex-dev/workflow`**, with the Vercel AI SDK (`ai@7.0.44`) as the *only* model-transport/tool/
> structured-output/stream seam and light Convex components (Workflow/Workpool) for durable
> mechanics. Authority, budgets, validation, commit, recovery and projection stay in the AE
> deterministic kernel (`retain-domain` per the 2026-08-02 runtime audit).

This is the confirmed adjudicated verdict (`.planning/research/2026-07-31-agent-engine-verdict.md`
D1–D6 revised) combined with the Wayfinder load-bearing spine decision
(`.planning/wayfinder/MAP-vision-gap.md`), the running-VM engineering shape of agentic.market
(`.planning/research/2026-08-03-agentic-market-observable-registry-contract.md`) mirrored only where
AE must own more, and the live-engine fixes already landed
(`.planning/research/2026-08-05-engine-usefulness-path.md` slices A–F).

**Canonical project lifecycle data/control flow**

```text
wall ─▶ grill ─▶ charter ─▶ decompose ─▶ decision-graph
  │                                  │
  │        (studies fan out)         ▼
  │        study ──▶ decide ──▶ commit ──▶ wayfind ──▶ done
  └──────────────────────────────────────────────┴────────┴──▶ memory ▶ playbook (next project)
```

Each hop is a **typed, versioned, digest-bound transition** committed by the kernel. The model
*proposes* the typed step (charter fields, facet/decompose tree, study comparison recommendation,
decision-node weights, follow-up wording); the kernel *validates against the digest, scores, budgets,
and commits*. Between hops the engine sleeps on Convex Workflow and wakes on events (a study
completes, a hold is about to expire, a reminder fires, a person or agent answers) — never on
polling. Sessions are visits to a durable tree; the person leaves and returns days later to find the
frontier advanced and only decisions waiting (J1/J5/J11/J13).

Every open Wayfinder architecture question gets one resolved answer here (see table at the end of
§3), because each was a blockage for the rest of the design.

---

## 2. Reference component architecture

Every component below lists Boundary/IO, AI-SDK responsibility, Kernel responsibility, and the
invariant it must never break. Each **composes existing seams** — capability-supply, registry,
customer-request, work-tree, harness, action-invocation — and never creates a second lifecycle.

> **Project aggregate (the durable spine)** — one durable outcome that spans sessions; owns the
> charter, the decision tree, and the journal.
> - Boundary / IO: `projectId` = existing thread/CR identity (the spine spike freezes
>   `convex/projectSpine.ts` fields: `projectId, generation, charterRef?, status, workflowId?,
>   definitionVersion, timestamps`); owns charter, Bundle(s), decision graph, study refs, mandates,
>   receipts; durable store = Convex project tables.
> - **Resolved:** adopt a **new `project/` module that COMPOSES Customer Request**, not a fork.
>   `Customer Request` stays the durable *authority/execution* aggregate for each compiled
>   plan/route (the operation substrate: graph, attempts, grants, outbox, evidence); the **Project
>   aggregate is the durable *continuity* aggregate** (charter + tree + journal + memory link). The
>   decision **Bundle-under-Customer-Request** roots the work tree under the CR; the Project aggregates
>   one-or-many CR-derived Bundles over its life. This satisfies the ENG gate (thin read model keyed to
>   an existing CR ID) while naming the invariant CR cannot preserve — cross-session continuity of a
>   multi-study, multi-commit outcome — and justifies the aggregate.
> - **Resolved:** adopt `@convex-dev/workflow@0.4.4` here for the durable wait/event/resume state
>   machine (definition-version router + generation fences make it deploy-survivable, spiked).
> - AI-SDK responsibility: none directly — the aggregate is pure kernel state; model output only ever
>   arrives as validated commit inputs.
> - Kernel responsibility: `retain-domain`. Everything about the aggregate (identity, generation,
>   revision fences, event ownership, artifact refs, invocation identity) is AE authority
>   (`.planning/wayfinder/MAP-vision-gap.md` item-1
>   exit contract).
> - Invariant: a Project is resumable across arbitrary delay; stale-generation work is refused; reads
>   are bounded and projected; no second lifecycle beyond capability-supply/CR/work-tree.

> **Grill / Charter schema** — the intake output contract (wants/needs/non-negotiables/envelope/date).
> - Boundary / IO: typed interview that produces a Charter artifact; inputs are the person's/agent's
>   free ask + accepted/edited recommended answers; durable store = Project.charterRef.
> - AI-SDK responsibility: `generateText` + `Output.object` to draft a typed charter proposal; the
>   model may *assume* defaults and render them as tappable chips (J1.3 "here's what I heard"); may ask
>   ONE blocking question with a recommended answer when a hard constraint is absent (J2). This is
>   `Output.object`-validated at the wire; strict domain validation remains in the kernel.
> - Kernel responsibility: validate charter against the schema (zod strict), digest it, bind to the
>   Project, revision with fences; wants/needs feed study weights and mandate bounds.
> - Invariant: the Grill is observation-class (free); nothing inside may open a spend effect. The
>   schema is decided early (MAP gap item 2) because it constrains decompose/study/mandate. The 15-min
>   plan expiry is **split** here: quote validity expires on TTL; project continuity only via
>   generation revision on wake (never a hard wall).

> **Decision Graph** — ranked decision nodes, load-bearing first; branch collapse on decide.
> - Boundary / IO: tree of nodes, each a decision; edges = dependency/frontier; the visible narrowing
>   is the progress bar; five-dimension node algebra rollup; durable store = Per-project tree tables
>   (Bundle under CR).
> - AI-SDK responsibility: propose node fields (facet, decision statement, irreversibility ×
>   constraint-power × lead-time weights, dependencies) via `Output.object`; rank/enrich as a proposal.
> - Kernel responsibility: score, validate, rank, commit; enforce the one-in-progress frontier; present
>   the ≤3 decision inbox (J3); compute the entropy/narrowing metric; collapse branches on decision.
> - **Resolved:** decision-node ranking = **model-scored estimates validated against playbook-declared
>   baselines**, not either/or. Playbooks declare canonical weights (moat compounding); the model
>   proposes per-project deltas; the kernel scores and commits the merged, digest-bound rank. Kernel
>   never trusts a model rank verbatim; playbook never overrides real project constraints.
> - Invariant: discovery ≠ selection ≠ authority; a node is never committed as decision-ready on model
>   authority alone; the decision inbox is event-triggered, cap 3, no batch-approve (J3, gate #5).

> **Study engine (RFx)** — the first real customer-value delta over a chat assistant.
> - Boundary / IO: per open decision, scan → qualify → quotes → weighted comparison scored on stated
>   wants → explainable recommendation; durable store = study artifacts + quote/evidence links.
> - AI-SDK responsibility: compare candidates and write the explainable recommendation with
>   `generateText` + `Output.object`; the comparison is a typed, digest-bound **proposal** the kernel
>   presents, with evidence one tap deep (J3).
> - Kernel responsibility: run scans through the market substrate (listed businesses first, cited
>   discovery where thin, real quotes in), qualify against charter weights, pin exact quotes/tolerances
>   and freshness, score the weighted comparison *deterministically*, hold the recommendation until a
>   person locks it. Recovery: plan-B kept warm where the study held seconds (J6).
> - Invariant: a marketplace display or call/payer counter is never readiness or authority; quotes go
>   stale on TTL without collapsing the project; the recommendation is explainable and one-tap-deep.

> **Scheduled autonomy** — the engine advances the frontier between visits.
> - Boundary / IO: Study completions, chases, reminders, deadline/deadline-ripple work, frontier
>   advancement, divergence-triggered replan; durable store = Workflow sleeps + notification outbox.
> - AI-SDK responsibility: none for timing; model may only produce typed proposal payloads that a
>   schedule consumes. `@convex-dev/workflow` owns durable sleep/event/restart mechanics —
>   **not** `@convex-dev/agent` (deferred, §3) and **not** a model-run loop (verdict D1/D4).
> - Kernel responsibility: `retain-domain` — scheduled observations/studies advance; only decision &
>   money effects interrupt the person (J3); momentum SLO: 75% of non-terminal locks → next
>   decision-ready item ≤24h; the report *comes to the person* (J5, outbox/react-email), never a daily
>   ritual.
> - Invariant: scheduled work never spends or discloses without an approval digest; non-participation
>   parks the project honestly (J13) rather than nagging.

> **Commerce (quote → hold → commitment → receipt)** — settlement through paid rails.
> - Boundary / IO: first-class quote→hold→commitment→receipt journey against one real provider; rails
>   **x402 + Stripe** (chosen, irreversible); durable store = money ledger, price/payout types, receipt
>   refs in engine events.
> - AI-SDK responsibility: frame the money-yes in the person dialog (`createUIMessageStream` payloads);
>   **transport only** — `toolApproval`/HMAC may protect a UI approval token, never *be* authority.
> - Kernel responsibility: digest-bound Approval Grant → hold → execute with idempotency → receipt;
>   reconcile ambiguous settlement preserving `unknown`; money-yes **before** identity-claim as two
>   measured steps with resumable approved intent (J4.2); refunds with a stated timeline (J14); the
>   mandate offer after N clean receipts (J4.4); `full_yolo` never person-facing.
> - Invariant: authorization precedes effects; exact atomic money, aggregate ceilings, ledger
>   authorization and ambiguous-settlement reconciliation are AE-owned; provider receipt ≠ AE customer
>   completion receipt.

> **Authority trust-ratchet** — observe → propose → approve-each → bounded mandate.
> - Boundary / IO: StandingMandate (scope/expiry/maxSpend/revocation/digest), approve_each, effect
>   fencing; durable store = `action-invocation/*`, `convex/actionInvocationControl.ts`.
> - AI-SDK responsibility: render approval requests; provide the approval-request *token* mechanics via
>   the SDK's tool-approval/HMAC seam. It is never the identifier, budget or grant.
> - Kernel responsibility: `retain-domain` — caller identity, budget, graph freshness, exact
>   route/command digests, refusal/unknown, replay. One approval at a time, then earned mandates
>   ("handle under $X like this"); identity ≠ authority for agents (J10.4).
> - Invariant: everything consequential is unapproved until a digest-bound yes; agent identity never
>   stands in for person authority; no batch-approve.

> **Evidence ledger** — the project's story: attempts, burn, receipts, reasoning.
> - Boundary / IO: unified per-project story fed from `enginePlanEvents`, invocation attempts, money
>   ledger, route-execution journal; receipt refs in engine events; durable store = Convex.
> - AI-SDK responsibility: `onStepEnd` provides per-step usage/accounting data that *feeds* the ledger;
>   never the ledger itself.
> - Kernel responsibility: journal ownership, finalization hashes, replay/dedupe, evidence class
>   honesty (P3A-R8), redacted readback.
> - Invariant: evidence is written once, replay-safe; raw private payload never becomes public; closeout
>   = the receipt trail (J8).

> **Recovery** — plan-B branches, uncertainty holds, honest cancellation.
> - Boundary / IO: route-execution recover/cancel/lease + plan-B branches in the plan contract +
>   uncertainty holds persisted as plan state; executable vendor-failure replan (= T24).
> - AI-SDK responsibility: none for the decision; model only drafts the "*I held the next-best — undo
>   if you'd rather*" message after the kernel activates plan-B (J6).
> - Kernel responsibility: fail-inform-don't-panic, within-mandate auto-proceed only if scoped
>   (else inbox item), honest cancellation with refund window and timeline (J6.4/J14).
> - Invariant: recovery preserves `unknown`; it never fabricates success or a false refund path.

> **Memory** — standing preferences, prior decisions, taste; closeout → next project.
> - Boundary / IO: consent-gated per-person (opt-in household/business later); duplicate/share across
>   projects; durable store = Convex memory rows.
> - AI-SDK responsibility: `@convex-dev/ai`-style memory is NOT installed; the AI SDK memory doc
>   (03-agents/06-memory.mdx) is a mechanical seam — AE may use an in-context summary *primitive*, but
>   consent, persistence, retrieval and redaction stay AE-owned.
> - **Resolved:** memory scope = **per-person by default; opt-in household/business per J15**; memory is
>   written at closeout (J8) under explicit consent fog, and read to pre-fill the next charter (J15).
> - Invariant: memory never leaks raw project data; it is a redacted, consent-gated preference store,
>   not a transcript dump.

> **Agent surface (MCP/REST)** — someone else's assistant drives AE.
> - Boundary / IO: `/SKILL.md`, `/llms.txt`, `/mcp`, project/plan/authority/evidence APIs; durable
>   store = read projections + MCP tool registry.
> - **Resolved:** agent API shape = **MCP tools for project DRIVE + REST read projections** (not
>   REST-first-only). MCP gives an agent typed open-project/study/interrupt/resume tools and
>   discovery via `/llms.txt` + `/SKILL.md`; REST supplies deterministic, redacted read projections for
>   reporting/business. Both reuse the one authority seam.
> - AI-SDK responsibility: MCP tool definitions come through `node_modules/ai/docs/03-ai-sdk-core/
>   16-mcp-tools.mdx`; the SDK provides the tool-call protocol seam.
> - Kernel responsibility: agent identity ≠ person authority (J10.4); approvals always bind to the
>   person; an agent may open a project, run studies, and receive interrupt payloads, but never
>   self-grant money/disclosure.
> - Invariant: an agent can never approve its own consequential effect.

> **Person surface** — dialog stream + project dashboard + re-entry view.
> - Boundary / IO: UIMessageStream for the dialog; `AePlanWork` plan card, `AeDecisionTrail`, timeline,
>   approvals/mandate controls, receipts/burn, come-back-later re-entry (J11 "since you were here").
> - AI-SDK responsibility: `createUIMessageStream` / `createUIMessageStreamResponse` /
>   `pipeUIMessageStreamToResponse` (`node_modules/ai/src/ui-message-stream/*`) for transient framing;
>   AE owns event payload, terminal-complete policy, abort suppression, durable replay (A6).
> - Kernel responsibility: `retain-domain + simplify only after parity` — public data stays redacted;
>   projections consume source-owned truth, never reconstructed from component/transcript/browser state
>   (`.planning/PROJECT.md` operating rule).
> - Invariant: public readbacks are projections, never raw documents.

> **Business surface** — publish once, earn from agent demand.
> - Boundary / IO: claim → publish e2e (supply funnel describe→endpoint→readiness→pricing→test→
>   publish), earnings clock at publish, operating console (earnings/receipts, versioning, availability),
>   no-demand honesty path (J9).
> - AI-SDK responsibility: none for authority; model may assist reading/formatting provider material.
> - Kernel responsibility: `publishOwnerCapability` must route a generic imported descriptor through the
>   canonical **normalize → admit → publish → readiness → routeable-graph** seam (the known drift fix,
>   agentic-market doc §seam comparison) rather than a hardcoded demo quote contract; imported/web
>   businesses render as Imported Claims with invite-to-list, never bookable supply (J9.6).
> - Invariant: never a second registry/lifecycle; a marketplace row or survey hint is never canonical
>   identity, readiness or authority.

---

## 3. Do we need anything beyond the AI SDK? (founder resolution)

**Direct answer:** `ai` (Vercel AI SDK, installed **@7.0.44**) is **sufficient alone for the model
*orchestration* seam** — transport, tools, structured output, streaming — and must NOT be supplemented
by a second agent framework or a generic persisted-agent product. But the idealised architecture is
**`ai` + Convex components + the deterministic kernel**, because the SDK deliberately does not provide
durability, authority, or money, and Convex already provides the durable scheduling primitives. Lean
rules (reuse-before-build; check the project's existing deps first) say: the necessary extras already
live in the install graph (`@convex-dev/workflow@0.4.4`, `@convex-dev/workpool@0.4.9`) — no new
framework is required, and `@convex-dev/agent@0.6.4` must be **deferred** on peer-compatibility
evidence.

**ADOPT / DEFER / REJECT table** (versions verified from `node_modules` metadata on 2026-08-05):

| Candidate | Verdict | Evidence / role | Gate to reconsider |
|---|---|---|---|
| **Vercel AI SDK `ai@7.0.44`** | **ADOPT** | The model-transport/tool/structured-output/stream seam. ESM, Node ≥22, v7-native `instructions`, `Output.object`, `stopWhen`/`isStepCount`, `prepareStep`/`activeTools`, `onStepEnd`, `createUIMessageStream`. Bundled docs: `node_modules/ai/docs/03-agents/*`, `03-ai-sdk-core/15-tools-and-tool-calling.mdx`, `10-generating-structured-data.mdx`, `65-lifecycle-callbacks.mdx`. | — (already installed/used) |
| **`@convex-dev/workflow@0.4.4`** | **ADOPT** | Durable multi-step sleep/event/restart; embeds Workpool; the durable Project/ inquiry state machine substrate (proven in `convex/projectSpine.ts`). Never replace route journal with it. | definition-version router + generation-fence deploy-survival (spiked, MAP gap) |
| **`@convex-dev/workpool@0.4.9`** | **ADOPT** | Bounded async queue/retry/concurrency for study/transport enqueue (`maxParallelism:32`, retry max 3, `runAfter` 5 s). AE journal stays authoritative; never read status from terminal work rows (no source `statusTtl`). | none |
| **`@convex-dev/agent@0.6.4`** | **DEFER** | Official release **peers `ai ^6.0.35` / `@ai-sdk/provider-utils ^4.0.6`** against installed **ai 7 / provider-utils 5**; source emits an explicit v6 guard (`AssertAISDKv6`). Its generic `threads/messages/streamingMessages` rows are not AE identity/authority/evidence/projection/recovery. | only when it peers on the installed `ai` major **and** covers a named invariant `ai`+Convex cannot (none today); re-verify, don't assume. |
| **Temporal / Restate / Inngest / Trigger** | **REJECT** | Verdict D4: each is a foreign orchestrator that would lease durability/authority outside Convex, contradicting "Convex is the source of truth." AE already owns a durable state machine; adding one re-parallelizes lifecycle. | — |
| **LangGraph / other agent frameworks** | **REJECT** | `ai` covers the seam (tools + structured output + loop controls + harness). A second framework would duplicate the tool plan/menu/stop/budget that AE's deterministic kernel already owns (D2). | — |

**What `ai` does NOT give you — and the first-party mechanism that covers each:**

| Missing capability | First-party owner |
|---|---|
| Authority / identity / digest-bound approval | AE deterministic kernel: Customer Request, RouteMandate, Approval Grant, `action-invocation/*` |
| Budgets / caps / stop conditions | AE planner + `ai` `stopWhen`/`isStepCount` at the mechanical step-cap layer (D2) |
| Validation (strict domain) | zod strict boundary (`zod@4.4.3`), AE normalizers; `Output.object` only wire-level |
| Commit / durability / replay | Convex atomic transactions; `@convex-dev/workflow` journal for durable steps |
| Recovery / reconciliation | AE route-execution kernel (outcome `unknown`, cancel/lease, plan-B); Workflow restart |
| Money / ledger / settlement | AE money ledger + price/payout types + x402/Stripe at protocol seam |
| Projection / redaction | AE projection layer + `@convex-dev/workflow` operational rows never being AE status |
| Long-lived sleep/resume | `@convex-dev/workflow@0.4.4` (durable), not `ai` |

Conclusion: the architecture is **`ai` + Convex components + deterministic kernel**, not `ai` + a
second framework.

### 3.1 AI-SDK usage map — where each construct is RIGHT and where it is NOT

| SDK construct (installed `ai@7.0.44`) | Right place in AE | NOT for |
|---|---|---|
| `generateText` + `Output.object` (`10-generating-structured-data.mdx`) | Typed, budgeted *proposal* steps: charter draft, decompose/facet proposal, study recommendation, decision-node weights, follow-up wording. Wire-typed, then kernel-validated. | Authority, commit, eligibility — output is a proposal. Aggregate `usage` is per-step, not lifetime. |
| `tools` + `strict` + `stopWhen`/`isStepCount` (`15-tools-and-tool-calling.mdx`, `04-loop-control.mdx`) | Bounded selection menus; the deterministic seeker → candidates → ONE model select → stable terminal. "No tool call" is the stable *ask* terminal (`needs_information`), not a bare refusal — the live-engine fix (engine-usefulness-path slices A/B). | The whole runtime; a "no-call" terminal ≠ an answer when candidates exist. |
| `prepareStep` / `activeTools` (`04-loop-control.mdx`) | The decision-frontier menu: narrow the ≤3 decision inbox / candidate tool menu per stage to reduce selection error (D2). | Menu for authority/eligibility — kernel still binds. |
| `streamText` + `createUIMessageStream`/`createUIMessageStreamResponse`/`pipeUIMessageStreamToResponse` (`node_modules/ai/src/ui-message-stream/*`) | Transient person-dialog framing on Flow A/person surface; AE owns payload, terminal policy, abort, durable replay (A6). | The durable record; persistence/finalization stays Convex. |
| `onStepEnd` / `onEnd` (`65-lifecycle-callbacks.mdx`) | Per-step usage accounting that *feeds* the evidence ledger; finalization cosmetics. | The evidence ledger/journal itself; final-step fields under `result.finalStep`. |
| `ToolLoopAgent` (`node_modules/ai/src/agent/tool-loop-agent.ts`) | Only as the bounded single-step selection loop, never the whole runtime (verdict D1). | The project engine, authority, evidence, recovery — reject as umbrella. |
| `toolApproval` / HMAC (`06-tool-approvals.mdx`, `06-policy-tool-approvals.mdx`) | Transport-only protection of an approval *token* / UI approval request frame. | Being the person's approval, identity, budget or mandate — that is `retain-domain` kernel (audit Flow B confirm/mandate). |
| mock providers (`55-testing.mdx`) | Deterministic eval fixtures (eval ladder). | Production authority. |

**What AE must NOT delegate to the SDK:** authority, budgets, validation, commit, recovery,
projection, money, durability (§ table above). The SDK is the nervous system for understanding and
proposing; the kernel is the skeleton that decides and acts within the granted envelope.

**Open Wayfinder questions — one resolved answer each:**

| Question | Resolution |
|---|---|
| Project aggregate | New `project/` module **composing** Customer Request (not a fork); CR = per-execution authority aggregate, Project = cross-session continuity aggregate; Bundle-under-CR roots the tree. |
| Scheduling substrate | `@convex-dev/workflow@0.4.4` for durable sleep/event/resume + `@convex-dev/workpool@0.4.9` for bounded transport queue; definition-version router + generation fences for deploy survival. |
| Agent API shape | MCP tools for project drive + REST read projections; `/llms.txt` + `/SKILL.md` for discovery. |
| Memory scope | Per-person default, consent-gated; opt-in household/business later (J15). |
| Decision-node ranking source | Model-proposed deltas validated/scored against playbook-declared baselines; kernel commits the digest-bound merged rank. |

---

## 4. The agentic.market mirror

Mirror agentic.market/Bazaar's *engineering* where AE must own more; never adopt its *authority*.
A marketplace display is a discovery/merchandising projection over heterogeneous payable endpoints —
never executable truth (`.planning/research/2026-08-03-agentic-market-observable-registry-contract.md`).

| What AE MIRRORS from agentic.market/Bazaar | What AE OWNS differently |
|---|---|
| Catalog projection: search/filter/leaderboard/Featured as **candidate discovery** | Provider/business identity (never a market service grouping); immutable operation material + digests |
| Endpoint → operation materialization from OpenAPI/MCP/Bazaar declarations | Exact admitted schema + capability-contract registry; refuse catalog-only executable import |
| Discovery + ranking as candidate inputs (may order probes) | Readiness probes + validity/qualification determine eligibility; external ranking is never authority |
| Buyer "calls endpoint directly after authority" | Registered `http-json`/`mcp-jsonrpc`/`x402-fetch` through the existing adapter seam; pins exact resource/method/payee/schema/ceiling |
| Official x402 / OpenAPI / MCP / A2A clients at protocol seams | Revisions / readiness TTL / withdrawal; effects, data-use, evidence; mandate/grant authority; exact spend; reconciliation; redacted readback |
| Price/network hints | Live pinned challenge + AE policy control spend; blank/`upto`/decimal = not authorization |
| Aggregate quality counters | Per-call provider receipt bound to the exact AE attempt; `unknown` outcomes preserved, never success |

**Invariant:** provider receipt ≠ AE completion receipt; a 402 challenge proves a payment boundary
responded, not that payment/output/fulfilment works; no second registry/lifecycle/transport.

---

## 5. The user-journey → architecture mapping

The eight acts (VISION module map) and the ask/understand/choose/authorize/act/follow movements
(`.planning/PROJECT.md`) map onto components below. "Reading/deciding" rows are where the person is
kept in the loop; "autonomous" rows advance without them.

| Act / movement | Component(s) | Person "reading/deciding" vs autonomous |
|---|---|---|
| 1. **The wall** (ask) | Person surface (`/`), Project aggregate | Person types the big thing; kernel instantiates project + playbook, one branch elaborated, rest fog (J1). |
| 2. **The grill** (understand) | Grill/Charter | Person answers 0–2 chips / accepts a recommended answer; kernel drafts the typed charter (J1.3). Observation-class, no effect. |
| 3. **The map** (understand/choose) | Decision Graph | Person **only looks**; facets appear, load-bearing decisions highlighted (J1.2). Autonomous: decompose + ranking. |
| 4. **Studies fan out** (choose) | Study engine + market substrate | Person **only reads** weighted comparisons with evidence one tap deep (J3). Autonomous: scan/qualify/quote/score. |
| 5. **Decide** (choose) | Decision Graph → decision inbox | Person taps Lock/Adjust/Park; tree visibly collapses (J3). Autonomous: branch collapse + next-study wake. |
| 6. **Commit** (authorize/act) | Commerce + Authority ratchet | Person gives one digest-bound yes (money-yes then identity-claim, J4.2); kernel executes + receipts; later bounded mandates |
| 7. **Wayfind to the date** (act/follow) | Scheduled autonomy + Recovery | Person sees only new decisions/movement; chases, follow-ups, replans run without them (J5/J6/J13). |
| 8. **Done** (follow) | Evidence ledger + Memory | Person reads the receipt trail (J8); closeout → memory → next project starts smarter (J15). |

**Autonomy rule:** observation/work (grill, decompose, study, frontier advancement, chases) is free;
*decision and money* always reach the person (J1/J3/J4). Non-participation parks honestly (J13);
the report comes to the person (J5).

---

## 6. The decision graph as trees-in-a-repo

**Tree-as-repo.** Each Project's decision tree is a versioned, observable structure — a "repo" whose
commits are decision/study/journal events, whose "branches" are fog vs elaborated, and whose review is
the report. This is the settled *tree-as-repo* refinement (MAP gap model refinements).

**Rolling-wave elaboration** with three verbs and fog first-class:
- **elaborate** — expand a node's facets (one branch at a time; the rest stays **fog**: honest,
  un-elaborated unknowns, not false detail);
- **study** — run an RFx on an open decision node;
- **propose_decision** — surface a node as decision-ready with a recommendation;
- **fog** is a first-class node state — the project never fakes precision where it has none.

**Five-dimension node algebra.** Every node carries rollups over **timing / cost / resources /
effort / scope** (per-dimension ranges + contingency). The kernel rolls these up tree-wide so a ripple
recomputed end-to-end ("150 guests changes these N things…", J7) is a deterministic diff across the
five dimensions, not prose.

**Report-driven runtime.** The engine is "Linear for agents, for non-software outcomes": the memo (J5)
is a generated report of what moved, what's next, the ≤3 decisions and burn-vs-envelope — the project's
running review. It is event-triggered, not a daily ritual (gate #5).

**Who proposes vs validates.** The model proposes node fields (facet label, decision statement,
weights, dimension estimates, dependencies) as `Output.object` proposals. The kernel validates each
against the charter digest + playbook baselines, scores the five-dimension rollups deterministically,
commits the node, and re-derives the frontier. A node never becomes decision-ready on model authority
alone; **Bundle-under-Customer-Request** is the tree aggregate that ties these trees to the durable CR.

---

## 7. Data / durability model

- **Convex is the source of truth.** Per-project tables: project aggregate, charter, decision-tree
  nodes, study artifacts, mandates, journals, receipts, memory. All writes are atomic transactions;
  scheduled mutations are exactly-once, scheduled actions at-most-once (audit note).
- **Journals/events.** Every transition writes a typed, versioned event (spine's `definitionVersion` +
  `generation`); replay/dedupe are exact; journal caps are bounded (reads stay bounded even when
  durable event writes are uncapped, review-hardened spine lesson).
- **Workflow sleep/resume across days.** `@convex-dev/workflow@0.4.4` sleeps on a decision and resumes
  on an event — a study completes, a hold nears expiry, a reminder fires, a person/agent answers — with
  **no polling**. The definition-version router + generation fences (spiked) let a v1 workflow sleep
  beside registered v2 and refuse stale-generation work; superseded workflows are cancelled AND cleaned
  up (no journal leak).
- **Quote validity vs project continuity split.** Quotes/TTL expire in minutes (freshness fence on
  wake: `expiresAt === createdAt + PLAN_EXPIRY_MS`, first late `step_started` expires the quote
  aggregate; the lesson from T16/AP2). Project **continuity** is months-long and only advances via
  generation revision on wake — never a hard wall.
- **Evidence/receipt links.** Provider evidence, attempt receipts, money-ledger rows and the engine
  journal all link back to the exact approved digest; closeout renders the receipt trail as the story.
- **Projection/redaction.** Public/person/agent readbacks are redacted projections, never raw
  documents; Workflow/Workpool operational rows are never AE status; identity binds for the person at
  first lock/spend (J4.2), not at ask.

---

## 8. Eval ladder for the idealised system

Extends the L0–L7 ladder (2026-08-02 audit) to the project engine, each row grounded in the engine
usefulness evaluation table (2026-08-05).

| Level | Evidence gate | Example failure = fail |
|---|---|---|
| L0 source/contract | Version lock, map anchors, Node ≥22 runtime, no incompatible agent dep, seam schemas frozen | v6 API use, configured runtime below Node 22, missing row/owner/citation |
| L1 grill/charter schema | Typed charter proposal validates/strict round-trips; wants/needs/envelope/date survive; split expiry | Wrong/incorrect fields, expiry wall where continuity should stand, leak |
| L2 deterministic decompose/commit | Facet tree + five-dim rollup deterministic; frontier/one-in-progress; compose geocode→forecast | Wrong branch, stale digest accepted, false positive (crypto→Frankfurter) |
| L3 decision-graph rank quality | Model-proposed weights validated vs playbook baselines; ≤3 inbox; event-triggered | Model rank committed verbatim; inbox >3; daily-ritual burden |
| L4 study parity vs human | Weighted study counts real quotes + cited discovery; recommendation one-tap explainable; provider no-AE response gate | Unweighted/collapsed recommendation; rating from counters; concierge-touch overrun |
| L5 authority ratchet correctness | Zero unauthorized effects; digest-bound yes; agent≠person authority; no batch-approve; `full_yolo` absent | Approval token forgery, agent self-approve, disclose-without-authority |
| L6 resumability / recovery | Crash after each commit/effect boundary; days-later wake (no polling); plan-B; `unknown` preserved; stranding risk from deploy managed | Lost durable intent, false cancel, workflow stranding, no recovery branch |
| L7 adversarial honesty | Zero fabrication/leak/hostility; 3× determinism; `needs_information` reachable; no `[ERROR]` leak; eval report honest | Any MUST-cell fail in engine-usefulness table, fake `ok`, cross-protocol conversion |

Minimum metric set (per audit): model calls/retries, per-step/final-step tokens, tool calls by canonical
ID, byte bounds, time-to-frame, Convex/OCC conflicts, queue metrics, grant/mandate/release refusals,
provider idempotency, `unknown` rate, evidence/journal completeness, projection parity/redaction, eval
coverage.

---

## 9. Non-goals & rejected alternatives

The idealised architecture deliberately does **not** include:
- **Autonomous model-owned loop as default** — rejected (D1/D2): predictable work is deterministic
  stages; the model proposes, the kernel decides (benchmarks + first-party guidance: τ-bench, GAIA,
  Agentless).
- **Temporal / Restate / Inngest / Trigger** — rejected (D4): foreign orchestrators lease
  durability/authority away from Convex, the source of truth.
- **Generic persisted-agent substitution** (`@convex-dev/agent` generic threads/messages) — deferred
  on peer mismatch (ai ^6 vs installed ai 7); its rows are not AE identity/authority/evidence/recovery.
- **Marketplace-as-authority** — rejected: market rows/rankings/counters are candidate input, never
  executable truth, readiness, or fulfilment.
- **Hand-rolled x402 / OpenAPI / MCP / A2A** — rejected: adopt official client libraries at protocol
  seams; never reinvent headers/base64/signing/JSON-RPC/card mapping.
- **A second registry / lifecycle / transport runtime** — rejected: reuse capability-supply, registry,
  customer-request, work-tree, harness, action-invocation seams.
- **Weakening `contract_identity_conflict` / provenance tri-state** — never; one capabilityId+version
  → one content stays inviolate (report Idempotency lesson).

---

## 10. Migration path from today (dependency-respecting)

Reuses the 2026-08-02 audit migration sequence + the Wayfinder frontier; each step has an exit
contract. Blocking order = dependencies (aggregate identity before studies/memory, etc.).

| Step | Work | Exit contract |
|---|---|---|
| 1 | **Freeze compatibility baseline.** Keep `ai@7.0.44`, workflow 0.4.4, workpool 0.4.9; align `vite.config.ts`/engine to Node ≥22; do **not** install `@convex-dev/agent`. | Hosted runtime provably on Node ≥22; recorded route/evidence/projection fixtures. |
| 2 | **Canonicalize v7 names.** Normalize `system`→`instructions`, `onStepFinish`→`onStepEnd`, `onFinish`→`onEnd`, `fullStream`→`stream`; explicit `finalStep` usage. | Behavior-preserving; mock/provider + route tests green. |
| 3 | **Make adapter contracts explicit.** `ModelProposalPort`, `ToolExecutionPort`, `StreamAdapter`. | Digests/attempt/budget/abort flow through, never authority into a callback. |
| 4 | **Confirm the Project aggregate (compose-CR).** Thin `project/` read model keyed to existing CR ID; charter + one study + days-later resume/chase. Freeze aggregate ID/owner, generation fences, artifact refs, event ownership, invocation identity. | Spine spike exit contract (MAP gap item-1) met; enginePlans-canonical consolidation. |
| 5 | **Retain/harden Flow B + split expiry.** Keep Convex aggregate/head/run/attempt/outbox; widen-migrate-narrow the expiry to split quote-validity from project-continuity; migration test (generation fences, quote-revision links, bounded reads). | Late `step_started` expires quote only; project continuity intact; 0 lost intent. |
| 6 | **Vertical slice** (CEO gate): founder wedge, independent provider cohort, grill-lite→charter→one study→one approval-bound commitment→receipt→recovery, playbook v1. | Customer kill gate: observed completion, blind parity-or-win, real payment or signed paid pilot, manual-touch ceiling, numeric thresholds frozen. |
| 7 | **Wire the founder roadmap path** (§3 table): keep the ADOPT set, preserve DEFER gate for `@convex-dev/agent`. | No cross-protocol conversion; compatibility re-check on every upgrade. |
| 8 | **Run the eval ladder + SLO study.** Start mock, then provider captures, then Convex fault/load, adversarial, integrity gates. | L0–L7 pass; measured vs [PROPOSED] SLOs; no literature substitution. |
| 9 | **Delete only proven duplication + clean aliases/fallbacks.** | Parity/census/canary evidence; no reopens of completed kernel work to ease UI (PROJECT.md operating rule). |

Each step preserves the invariants in §1; steps 4–6 are the spine/vertical gating order from the
revised frontier (MAP gap), items 7–9 are the generalization carried only after the kill gate passes.

---

## Design authority map (works cited)

Vision: `.planning/VISION-conceptual-map.md`. Gap/decisions/frontier: `.planning/wayfinder/MAP-vision-gap.md`.
Journeys+requirements: `.planning/wayfinder/JOURNEYS.md`, `.planning/REQUIREMENTS.md`. Adjudicated engine
verdict: `.planning/research/2026-07-31-agent-engine-verdict.md`. Runtime audit (Flow A/B/C, eval ladder,
SLOs, migration): `.planning/research/2026-08-02-agent-runtime-architecture-audit.md`. Mirror source:
`.planning/research/2026-08-03-agentic-market-observable-registry-contract.md`. Live-engine fixes:
`.planning/research/2026-08-05-engine-usefulness-path.md`. Charter: `.planning/PROJECT.md`.

AI SDK 7 (installed `ai@7.0.44`) constructs cited from `node_modules/ai/docs/03-agents/`,
`03-ai-sdk-core/{15-tools-and-tool-calling,10-generating-structured-data,16-mcp-tools,55-testing,
65-lifecycle-callbacks}.mdx` and `node_modules/ai/src/{ui-message-stream,agent,generate-text}/`.
Convex components verified on disk: `@convex-dev/workflow@0.4.4`, `@convex-dev/workpool@0.4.9`;
`@convex-dev/agent` absent. `src/` + `convex/` referenced strictly as seams to reuse — never edited.

*End of reference architecture.*
