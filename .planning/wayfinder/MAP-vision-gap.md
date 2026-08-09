> **SUPERSESSION BANNER — 2026-08-08.** This file is retained for historical
> mechanics and evidence provenance only. It is **not current authority** for
> AE's product category, ICP, wedge, supplier model, or roadmap.
>
> Current authority is [`PROJECT.md`](../PROJECT.md),
> [`VISION-conceptual-map.md`](../VISION-conceptual-map.md),
> [`wayfinder/MAP.md`](MAP.md), [`D-013`](../records/PROJECT-RECORDS.md), and
> the [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md).
> Do not infer from this historical map that local trades, Australian SMBs, BAS,
> or a one-human-work wedge is the current category or default product frame.

# Wayfinder map — Vision → repo gap (the project of building AE, run like an AE project)

Label: `wayfinder:map`. Charter: `.planning/VISION-conceptual-map.md` (confirmed vision authority).
Voice: `.planning/BRAND.md` (locked). Predecessor: `MAP-engine.md` (destination reached 2026-07-31).
Audited 2026-08-01 by three read-only scouts against executable seams, not file existence
(`history://GrillMapAudit`, `history://MarketMapAudit`, `history://SpineMapAudit`).

## Maturity table (vision module → what exists → gap)

| Vision module | Maturity | Existing (evidence) | Gap to vision |
| --- | --- | --- | --- |
| **Intake (grill)** | embryo | Single-question clarify (`answer-thread/turns/clarification.ts`), one `clarifying_question` in proposal union, semantic interpreter w/ intent-direction + contract facts (`customer-request/semantic-interpreter.ts`) | Multi-question interview, recommended-answer accept affordance, elicitation of outcome/constraints/wants-vs-needs/prior decisions as an artifact |
| **Charter** | partial | Goal predicates, step criteria, envelope (max actions/cost, digest, 15-min expiry), revisions, typed outcomes (`plan-proposal/internal/plan-contract.ts`, `convex/enginePlans.ts`); CustomerCriterion basis/impact hidden in customer-request | Wants/needs fields, non-negotiables, scope fence, assumptions register, **end date**; charter as durable first-class artifact |
| **Decomposer** | embryo | Model-authored steps + DAG/frontier enforcement; capability-graph compile in customer-request | Facet model (outcome→facets→work packages), domain playbooks, facet map projection |
| **Decision graph** | partial | Durable plan w/ revisions, frontier, one-in-progress, visible statuses (`AePlanWork`), same-thread resume | **Days-later re-entry (15-min expiry is the wall)**, ranked decision nodes (irreversibility × constraint-power × lead time), branch collapse on decide, narrowing metric |
| **Study / RFx** | absent | Fragments: comparison contract (`customer-request/agent-contract.ts`), route compiler viability ordering, tradeoffs | Dedicated durable study: scan→qualify→quotes→**weighted comparison scored on stated wants**→explainable recommendation |
| **Market substrate** | near-solid | Registry/search/detail actions, catalog + owner claims, capability contracts (comparison/commitment/result roles), capability import (MCP/OpenAPI/x402), cited web discovery → Imported Claims, readiness probes | Multiple real providers, imported-claim promotion/admission lifecycle, freshness/availability inputs for studies |
| **Commerce** | partial schemas / embryo journey | Paid-operation semantics (release→authorize→settle→deliver→reconcile), x402 attempt states + signer, money ledger/pricing/payout types, `comparison_quote` action live | First-class **quote→hold→commitment→receipt** journey, production rails (x402/Stripe), reconciliation surfaced, customer-visible receipts |
| **Authority** | solid substrate / missing ratchet UX | StandingMandate (scope/expiry/maxSpend/revocation/digest), approve_each, effect fencing, durable authorization (`action-invocation/*`, `convex/actionInvocationControl.ts`) | Product-level trust ratchet (observe→propose→approve-each→mandate) visible in person UI; envelope/usage dashboard; retire `full_yolo` from vision path |
| **Wayfinder runtime** | partial | Engine runtime (`runProposalSegment`), frontier, replan lineage, events | **Backward-plan from date** (dates/lead times/buffers/milestones), scheduled autonomous progress between sessions, chases/reminders (crons today: cleanup only), divergence-triggered replan |
| **Evidence ledger** | partial | `enginePlanEvents` journal + plan metrics, invocation attempts/receipts, money ledger, route-execution journal | Unified per-project story (receipts+attempts+burn), receipt refs in engine events, person-facing burn/receipts view |
| **Recovery** | partial | Route-execution recover/cancel/lease, recovery taxonomy, incident lanes (routing-kernel) | Plan-B branches in plan contract, uncertainty holds as persisted plan state, executable vendor-failure replan (= open T24), honest cancellation timeline |
| **Memory** | none | Only owner notification prefs (`settings`) | Standing preferences, prior decisions/taste, closeout→memory loop, consent model |
| **Agent surface** | partial | llms.txt, SKILL generation, MCP (registry actions), tested discovery contracts | Project/plan/authority/evidence API for agents (drive a project via MCP, not just search) |
| **Person surface** | partial | Plan card (`AePlanWork`), decision trail (`AeDecisionTrail`), dialog stream | Project dashboard: timeline, dates, approvals/mandate controls, receipts/burn, come-back-later re-entry view |
| **Business surface** | near-solid | Claim→publish e2e proven, supply funnel (describe→endpoint→readiness→pricing→test→publish), business tools | Operating console: earnings/receipts, versioning, availability; real (non-sandbox) operated providers |

## The load-bearing decisions (ranked by irreversibility × constraint-power × lead time)

1. **The durable Project spine.** Kill "plan = 15-minute artifact inside a chat turn". A Project entity
   that spans sessions, carries the charter, owns the decision graph, and accepts async progress.
   Constrains: studies, chases, memory, dashboards, agent API. Everything queues behind this.
   *Decision inside it:* extend Customer Request vs. new Project aggregate; adopt
   `@convex-dev/workflow`/workpool now (already flagged in MAP-engine "not yet specified").
2. **The Grill + Charter schema.** The interview's output schema (wants/needs/non-negotiables/envelope/
   date) is the input contract for decomposition, study weighting, and mandate bounds. Cheap to build,
   expensive to change later — decide the schema early.
3. **The Study engine.** First visible customer-value delta over a chat assistant: durable, weighted,
   explainable comparisons from real quotes + cited discovery. Depends on 2 (weights) and market
   substrate (exists).
4. **Scheduled autonomy.** Cron/workpool workers advancing frontiers between visits + notification
   outbox reuse for chases. Turns durability into the felt product ("I came back and it had moved").
5. **Commerce journey.** quote→hold→commitment→receipt against one real provider; rails choice
   (x402 + Stripe) is the irreversible part — schemas already lean correct.
6. **Trust ratchet UX.** Surface approve-each→mandate with envelopes in the person UI (substrate ready).
7. **Evidence/receipts view.** Unify existing journals into the project story.
8. **Executable recovery** (= T24, already open) folded into plan-B branches.
9. **Memory.** After closeouts exist.
10. **Playbooks.** Curate from real runs; compounds forever, starts thin.

## Open questions (the study/branch list)

- Project aggregate: evolve Customer Request (rich lifecycle exists) or new `project/` module that
  composes it? (Study: map Customer Request lifecycle coverage vs Project needs.)
- Expiry semantics: quotes stale in minutes, projects live for months — split plan expiry (quote
  validity) from project continuity (revision on wake). Lesson already learned in T16/AP2.
- Scheduling substrate: `@convex-dev/workflow` adoption timing.
- Decision-node ranking: model-scored vs playbook-declared irreversibility/constraint-power.
- Memory consent + scope (per-person, per-household, per-business?).
- Agent API shape: MCP tools for project control vs REST-first.

## Out of scope (inherited)

~~Recruiting real businesses~~ — **superseded by the CEO gate below: a small independent provider
cohort in the chosen wedge is now a prerequisite workstream (HITL), not out of scope.** Still out:
live money movement without the HITL runbook, hosted reachability claims (parity map),
re-architecture of the verdict-doc architecture.

## Critic gates verdict (2026-08-01 — `history://PlanCeoReview`, `history://PlanEngReview`)

Both reviewers: **NO-SHIP on the ranked order as written.** Converged corrections, adopted:

**CEO gate (customer value):**
- Items 1–4 alone build a durable *comparison* product while the locked brand promises "gets it done,
  receipts and all" — the commodity layer Perplexity/OpenAI can ship. Replace the horizontal first
  tranche with **one paid, independently supplied, end-to-end vertical slice** (thin spine + grill-lite
  + one study + one approval-bound commitment + receipt + recovery), judged against a no-AE baseline.
- **Supply is a prerequisite, not out-of-scope**: Study Engine entry is conditional on an independently
  operated provider cohort (several substitutable providers, not the sandbox dentist) returning current
  suitability/availability/quotes through the production seam.
- **Kill gate** after the thinnest slice: observed completion with target customers, blind parity-or-win
  vs incumbent assistants on the same asks, and real payment or a signed paid pilot — failure stops
  generalized spine work and forces another wedge.
- **Playbook v1 ships with vertical #1** (the compounding moat), not at rank 10.
- **Dogfood executably**: AE-building-AE becomes a standing fixture through the real runtime seams;
  every roadmap increment must remove one recorded manual escape. Document choreography ≠ dogfood.

**ENG gate (feasibility/sequencing):**
- The aggregate decision resolves FIRST via the cheapest spike: a thin project read model **keyed to an
  existing Customer Request ID** carrying one charter, one study, one days-later resume/chase. New
  `project/` aggregate only if a named invariant Customer Request cannot preserve emerges.
- `@convex-dev/workflow` adoption is **gated on a versioned-deployment spike**: a v1 workflow sleeping
  on a decision must survive deploy of a structurally-changed v2 (definition-version router, replay
  dedup, drain/cancel/retention policy). Determinism violations from ordinary deploys are the stranding
  risk for months-long workflows.
- Expiry migration is not a TTL bump: `recordPlanRevision` fences `expiresAt === createdAt +
  PLAN_EXPIRY_MS`, first late `step_started` expires the aggregate, reads are thread-scoped, journal
  caps at 128 events. Requires widen-migrate-narrow design + executable migration test (project
  generation fences, quote-revision links, bounded project-scoped reads).
- **Pattern-to-owner table before any new store**: borrowed hooks/checkpointer/job-envelope/memory must
  name the canonical AE owner (Action Invocation, Customer Request, enginePlanEvents…) or they create
  parallel lifecycles — the known anti-pattern.
- **Item-1 exit contract**: freeze aggregate ID/owner, revision+generation fences, freshness-vs-
  continuity split, artifact refs, event ownership, invocation identity — items 2–5 are blocked on it.

## Revised frontier (post-gates)

| # | Work | Type | Gate |
| --- | --- | --- | --- |
| 0 | Spine spike: CR-keyed project read model + workflow v1→v2 deploy-survival + days-later resume + stale-generation refusal | prototype | eng exit contract |
| 1 | Vertical slice: pick the wedge (founder), recruit/onboard an independent provider cohort, grill-lite → charter → one study (weighted, explainable) → one approval-bound commitment + receipt + recovery, playbook v1 | task (HITL: wedge + supply) | customer kill gate |
| 2 | Standing dogfood project (AE-builds-AE through real seams), manual-escape ledger | task | escape count monotonically falls |
| 3+ | Generalize: broad scheduled autonomy, memory, agent project-API, counters band | deferred | only after gate 1 passes |

## Execution record (2026-08-01, pressure-and-build wave)

- **Frontier #0 DONE — spine spike proven** (`convex/projectSpine.ts`, `src/modules/project-spine/`,
  4 focused tests green, codegen clean; `history://SpineSpike`). Proven semantics: v1 workflow resumes
  beside registered v2 (definition-version router); stale-generation refusal; event-driven resume after
  arbitrary delay (no polling); quote-freshness refresh preserving project continuity. Review-hardened
  after `history://PremortemEngLibs` findings: control surface made internal-only (identity binds in
  the frontier-#1 exit contract), durable event writes uncapped (reads stay bounded), superseded
  workflows cancelled AND cleaned up (no journal leak). Exit-contract fields frozen: `projectId`
  (= existing thread/CR identity), `generation`, `charterRef?`, `status`, `workflowId?`,
  `definitionVersion`, timestamps. Ceiling: identity/session validation and enginePlans-canonical
  consolidation are item-1 work; projectSpine planRevision is a read-model pointer.
- **Mock supply cohorts DONE** (`history://MockSupplyCohorts`): 3 categories × 3 providers seeded from
  real cited businesses (wedding photographers: Bedford/Little Reed/Rachel Levingston; funeral:
  WN Bull/Funerals of Compassion/Gregory & Carr; dentists: Adelaide CBD/Perfect Smile/Fixed Dental) —
  priced offerings, searchable, provenance `publicly_observed`/development-mock, manifest at
  `output/dev/mock-cohorts.json` with HTTPS citations; 20 focused tests green (9 re-verified by Main).
  **Finding (product gap, study-engine scope): no category-generic quote seam in sandbox-supply** —
  only the dental checkup resolver exists; wedding/funeral quotes need the study engine's quote
  collection contract, not seed work.
- **Gate refinements adopted from `history://PremortemVision`:** (1) supply gates split — the labelled
  mock cohort unlocks the product slice (now satisfied); independently operated providers are required
  only for the customer-value/pilot proof; (2) the customer kill gate needs **numeric thresholds frozen
  before the slice starts** (cohort size, completion denominator, blind win rate, manual-touch ceiling,
  payment floor, deadline) — founder decision; (3) generalization additionally gates on distribution
  and operating leverage: channel-attributed acquisition, provider response without AE intervention,
  manual-touch count, contribution margin.
- **Model refinements settled in founder session (pending vision-doc consolidation):** cooperative
  consultant grammar; tree-as-repo structure; rolling-wave elaboration (`elaborate/study/
  propose_decision` verbs, fog first-class); five-dimension node algebra (timing/cost/resources/
  effort/scope with per-dimension rollups); report-driven runtime ("Linear for agents, for
  non-software outcomes"); Bundle-under-Customer-Request as the tree aggregate.
