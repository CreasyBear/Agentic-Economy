# Wayfinder map — The agent-managed PM framework replaces the engine on `/`

Label: `wayfinder:map` (local-markdown tracker fallback — `gh` token invalid, see T1).
Charted: 2026-08-01. Predecessors: [MAP-engine](MAP-engine.md) (destination reached),
[MAP-vision-gap](MAP-vision-gap.md) (audit + gates + spine/cohort execution record).

## Destination

The framework IS `/`: a person states an outcome; AE charters it, grows a five-dimension decision
tree by rolling-wave elaboration, runs studies against supply (mock-from-real accepted), sends
reports, routes calls through a decision inbox, executes locks with receipts on the durable spine —
and the current one-shot plan engine is retired. Cutover included. Saleable end-to-end on one wedge.

## Notes

- Execution is carried in this map (founder directive: apply pressure and build), like MAP-engine.
- **Adopt-first rule (founder, binding):** hand-rolled code is INTEGRATION ONLY — function and
  feature come from adopted OSS/components. Every task ticket names its adopted libraries before
  any hand-rolling; a hand-rolled function/feature is a defect unless the adoption search failed
  and the failure is recorded.
- Subagent discipline (founder): low-reasoning workers get exact direction, success criteria, end
  conditions, and patterns to copy; quality lands via Main review + reviewer gates. No fire-and-forget.
- Model authority: kernel owns tree/budgets/fences; models emit the three gardener verbs only
  (`elaborate` / `study` / `propose_decision`). Settled architecture (verdict docs) is not reopened.
- Settled model (do not re-litigate): cooperative consultant grammar (v3), tree-as-repo (v4),
  rolling wave + fog first-class (v5), five-dimension node algebra (timing/cost/resources/effort/
  scope, per-dimension rollups), report-driven runtime ("Linear for agents, for non-software
  outcomes"), Bundle-under-Customer-Request as the tree aggregate, spine exit-contract fields frozen
  (see MAP-vision-gap execution record).
- **Momentum SLO (T32, binding):** lock-to-next-decision-ready is THE operating metric — launch
  target 75% of non-terminal locks produce the next decision-ready item within 24h; the person-facing
  scalar is `Next decision: Nh`. Decision inbox: global, N=3, one ≤10-min daily ritual, no
  batch-approve control.
- Brand is LOCKED (`.planning/BRAND.md`); public copy changes only via `src/content/brand-copy.ts`.
- Skills every session must consult: `ae-actions-and-modules`, `ae-convex-guardrails`,
  `ae-verification-gates`, `wayfinder`; grilling for HITL tickets.
- Evidence classes never upgrade: mock-from-real cohorts prove capability, not availability.

## Program governance (2026-08-01 — this build runs as a program, not a jam session)

- **Definition of Done by ticket type:** research = source-verified report recorded on the ticket;
  grilling = decision + rationale recorded, dependent tickets updated; task = named adopted libs,
  focused tests green (exact commands in resolution), files listed, proof ceiling stated, Main
  re-verified; prototype = founder reacted, direction recorded.
- **Subagent contract (founder rule):** exact direction, success criteria, end conditions, patterns
  to copy; no fire-and-forget; quality lands via Main review + reviewer gates.
- **Cadence:** every working session ends with map updated + checkpoint commit; critic gate
  (CEO/eng/domain) before any frontier tranche is declared done; momentum SLO reviewed at each gate.
- **Risk register:** lives below as `## Risks`; every premortem/gate finding lands there with owner
  + trigger signal, or is explicitly retired.
- **Change control:** LOCKED decisions (brand, verdict architecture, momentum SLO) reopen only via a
  ticket citing new evidence, resolved by the founder — never by drift.
- **Repo protocol (until T37 lands):** work is committed at session end minimum; no force-pushes;
  moves via git-tracked operations.

## Risks (living register)

| risk | owner | trigger signal | source |
| --- | --- | --- | --- |
| 3 days work uncommitted on dirty main (847 files) | founder+Main | any tooling/disk fault | program review 2026-08-01 |
| Identity: durable projects on session cookies | T36 | first multi-device return | program review |
| Workpool ≤100 parallelism vs scheduled autonomy at scale | T38 | chase backlog latency | eng premortem + program review |
| Workflow determinism strandings on deploy | T33/T37 | determinism violation in logs | eng premortem |
| Study concierge-in-disguise (manual touches hidden) | T27 gate | manual-touch count > ceiling | CEO premortem |
| Compliance lead time (ACL/APP/payments-AU) | T40 | first real commitment shipped | program review |
| Provider/model outage degradation undefined | T38 | first OpenRouter outage | program review |

## Decisions so far

<!-- one line per closed ticket -->

- [T31 — OSS adoption pass](tickets/T31-oss-adoption-pass.md) — adopt workflow/workpool, XState v5,
  react-email, react-arborist, date-fns; rollups/CPM/MCDM/playbooks/digests stay domain-owned pure TS;
  hand-roll = integration only.
- [T32 — Linear-builder gate](tickets/T32-linear-builder-gate.md) — NO-SHIP until momentum is
  contractual: 24h/75% momentum SLO, one N=3 inbox ritual, one-scalar top bar, canonical weekly memo,
  freeze kernel + one wedge, `/` cutover gated on continuity.
- Deprecation pass (2026-08-01, `history://PlanningBloatAudit` + `history://LanguageDriftAudit`):
  retired copy purged from live surfaces/tests (root SEO, Customer Request front door, command menu,
  smoke/e2e assertions now consume `brand-copy.ts`); root `AGENTS.md` + July UX/red-team audits
  archived to `.planning/archive/pre-framework-deprecations-20260801/`; ANSWER-AI-CONTRACT related
  refs corrected; ADR PRODUCT/DESIGN citations left in place as decision provenance (QUOTED-OK).
- [T38 — Scale + failure envelope](tickets/T38-scale-and-failure-envelope.md) — 100 global workpool
  slots are the shared budget (100k projects fails at 60s chase actions); batched sharded cron sweeps,
  never per-project timers; journals carry IDs only; degradation modes defined per surface.

## Not yet specified

- **Multiplayer/roles** — partners, teams, positions on taste-decisions (Loomio pattern); sharpens
  after the node contract exists.
- **Liability, disputes, guarantees** — who eats the wrong booking; matures with first real commitments.
- **Distribution front door** — own UI vs MCP-first (other people's assistants driving AE); sharpens
  after the agent project-API shape emerges from the gardener verbs.
- **Memory consent + scope** — standing preferences across projects.
- **Real-supply recruitment motion** — required for the customer-value proof, not for the build.
- **Framework monetization** — is the PM layer free with marketplace rake, or priced? After wedge proof.

## Out of scope

- Hosted production reachability claims (parity map owns).
- Live money movement without the HITL runbook.
- Re-architecture of the verdict-doc architecture; brand/position changes (locked).

## Open tickets (frontier)

| id | type | title | blocked by |
| --- | --- | --- | --- |
| [T26](tickets/T26-node-contract-and-rollup-algebra.md) | grilling (HITL) | Node contract & five-dimension rollup algebra | — |
| [T27](tickets/T27-wedge-and-kill-gate-numbers.md) | grilling (HITL) | Wedge choice + numeric kill-gate thresholds | — |
| [T28](tickets/T28-gardener-verbs-contract.md) | task (AFK) | Gardener verbs replace the one-shot plan proposal | T26 |
| [T29](tickets/T29-study-engine-and-quote-seam.md) | task (AFK) | Study engine + category-generic quote seam | T26 |
| [T30](tickets/T30-decision-inbox-and-reports.md) | prototype (HITL) | Decision inbox + report projection | T26 |
| [T33](tickets/T33-cutover-migration.md) | grilling (HITL) | Cutover: enginePlans→tree, expiry split migration, `/` swap | T26, T28 |
| [T34](tickets/T34-trust-ramp-first-dollar.md) | grilling (HITL) | Trust ramp — the first-dollar moment and mandate growth | — |
| [T35](tickets/T35-playbook-format-authorship.md) | grilling (HITL) | Playbook format + authorship pipeline | — |
| [T36](tickets/T36-identity-and-continuity.md) | grilling (HITL) | Durable identity for durable projects | — |
| [T37](tickets/T37-delivery-pipeline-and-repo-protocol.md) | task (AFK+HITL) | Delivery pipeline + multi-agent repo protocol | — |
| [T39](tickets/T39-threat-model-security-program.md) | research (AFK) | Threat model: spine, studies, commerce | — |
| [T40](tickets/T40-compliance-counsel-pack.md) | task (HITL) | Compliance counsel pack (AU) | — |
