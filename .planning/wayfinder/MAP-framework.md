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
- Skills every session must consult: `wayfinder`; grilling for HITL tickets. The `ae-*` skills were
  **retired 2026-08-01** (founder: they handicapped the build) — their rules live in this map,
  `PROJECT.md`, `BRAND.md`, and the verdict docs.
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
| Provider/model outage degradation undefined | T38 | OpenRouter returned `User not found` during the first live decision-map smoke; deterministic fallback held | program review + 2026-08-01 dialog checkpoint |
| Main is red at HEAD: `typecheck` 9 errors, 5 unit failures — no green baseline to build on | T37 | any "focused tests green" DoD claim | state verification 2026-08-01 (this session) |
| Retired deletions still referenced by source: `examples/routing-*` (deleted `fe50518d`) by 6 test files + `provider:readiness`/`check:routing-edge`; both playwright configs by 4 `smoke:*`/`e2e` scripts + `tools/dev/customer-request-development-surface-parity.ts`; `.planning/records/*` + gutted research file by `tests/unit/planning/project-records.test.ts`. The deletions are the decision — the references are the stale part. | T37 | `test:release:source` cannot run; `typecheck` fails on 6 files | state verification 2026-08-01 |
| `ae-*` skills deletion RETIRED as a risk (founder 2026-08-01: they handicapped the build). Map references updated; no source depended on them. | — | — | founder decision 2026-08-01 |

## Decisions so far

<!-- one line per closed ticket -->

- [T31 — OSS adoption pass](tickets/T31-oss-adoption-pass.md) — **recommends** workflow/workpool,
  XState v5, react-email, react-arborist, date-fns; rollups/CPM/MCDM/playbooks/digests stay
  domain-owned pure TS; hand-roll = integration only. **Corrected 2026-08-01: of those, only
  workflow/workpool are actually installed — XState, react-email, react-arborist and date-fns were
  never added to `package.json`.** A recommendation is not an adoption; the ticket carries the
  verified manifest list.
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
- Journeys spec (2026-08-01, [JOURNEYS.md](JOURNEYS.md)) — 16 journeys J0–J15, each step actor →
  behavior → surface → event with gap ownership; CEO gate (`history://JourneysCeoGate`) NO-SHIP'd v1,
  all five findings applied (arrival attribution, J12 = measured acquisition-to-paid slice, split
  money-yes/identity-claim, provider earnings clock, daily ritual cut for event-triggered
  interruption); J12-leads-the-wedge recommendation recorded as T27 input.
- Donor hunt (2026-08-01, [research](../research/2026-08-01-framework-kernel-donor-hunt.md); five
  source-verified librarians) — the framework kernel is **most similar to Task Master AI** (MIT,
  `elaborate`/frontier/cycle-validation donor), a **CPM/Gantt engine** for timing, and **Linear** for
  surface. T31 partially overturned: base CPM/calendar math, interval-overlap detection, graph
  validation and TOPSIS are donor-backed (port/adopt, do not invent). Six items are the recorded
  adoption-search failure and the ONLY legitimate hand-roll: `study`/`propose_decision` semantics,
  fog lifecycle, the five-dimension rollup contract, cost-envelope/authority/evidence/freshness
  fields, semantic proposal fencing in a Convex mutation, and the adversarial proposal suite.
- Builder/critic doctrine realigned v2 (2026-08-01, [DOCTRINE](../DOCTRINE-builder-critic-loop.md)) —
  the "AAA critic /loop" pattern is made subordinate to this map: the nine horizontal quality axes are
  retired as a fan-out unit (CEO gate killed horizontal-first) in favour of one wedge carried
  vertically across the eight acts; "wowed" is replaced by frozen numbers (momentum SLO, DoD by ticket
  type, customer kill gate, per-increment budget); critic order is fabrication → outcome/authority →
  measured numbers → taste, since a beautiful fabrication is a failure not a near-miss; every gap is
  routed by failure class (invariant → make unrepresentable, environment → preflight assertion, taste
  → the only loop); adopt-first is the builder's first gate; the manual-escape ledger is the monotone
  progress metric. Preflight is RED at HEAD (T37), so no "tests green" DoD claim is evidence yet.
- [T41 — Hand-rolling cutover backlog](tickets/T41-handrolling-cutover-backlog.md) — **closed
  2026-08-01**, first pass: 13 of 17 items landed or refused with evidence by seven parallel
  subagents. The 4 that change a durable or public contract are re-scoped to
  [T42](tickets/T42-durable-and-public-contract-swaps.md). Ran ahead of its T37 dependency, so every
  slice was proved against a pinned pre-existing-failure baseline rather than a green one — that
  substitution is the cost of not having committed yet.

## Build checkpoints

- Decision-dialog slice (2026-08-01, [T30](tickets/T30-decision-inbox-and-reports.md)): the first
  typed, persisted shallow decision map now replaces the generic answer when authored; one ready
  Lock/Adjust/Park decision, assumption correction with exact ripple, stale refusal, disclosure map,
  and trail are wired through `/`. Focused suite: 41 passing tests; Convex codegen bundles. Live
  model proof is blocked at the provider boundary by the configured OpenRouter credential returning
  `User not found`; deterministic fallback was observed and no real-business interaction occurred.
- State verification (2026-08-01, this session): decision-map slice confirmed wired end-to-end
  (`proposal.ts:171-181` → `answer-turn-state.ts:105` → `AeDecisionMapJourney`/`AeDecisionMapReadback`);
  2690/2698 tests pass. The 8 failures are program hygiene, not slice defects: 4 × `planning/project-records`
  (working-tree deletion of `.planning/records/*`), `routing-edge` (deleted `examples/`), plus
  `schema/convex-schema` (206 vs 199 tables), `security/ssrf-surface-drift`
  (`convex/capabilitySupply.ts` unguarded fetch), `customer-request/direct-agent-baseline`
  (blocked vs completed), `action-invocation/development-host-parity`
  (`dynamic_published_snapshot_semantics_invalid`) — the last four already fail at committed HEAD.
- Adopt-first cutover, tranche 1 (2026-08-01): every hand-rolled cycle/reachability DFS in live
  source is retired in favour of the adopted graph library. Installed `graphology@0.26.0`,
  `graphology-dag@0.4.1`, `graphology-traversal@0.3.1` (all MIT, verified on npm). Replaced:
  `decision-map/internal/kernel.ts` reference-cycle DFS → `DirectedGraph` + `hasCycle`, and its
  O(n²) fixed-point ripple loop → `bfsFromNode`; `plan-proposal/public.ts` `validatePlan` cycle DFS;
  `customer-request/application/reference-composition.ts` `hasCycle` DFS. Evidence: 680 focused
  tests (customer-request + plan-proposal + decision-map + Convex store) with only the pre-existing
  HEAD failure, `tsc --noEmit` clean outside the deleted `examples/`, `npm run lint` clean, Convex
  codegen bundles the CJS graphology packages. The four extra integration failures on this working
  tree were isolated to pre-existing uncommitted work by reverting each change and re-running.
  Tranche 2 (same session): `answer/internal/provider-location-filter.ts` drops its 18-line
  `levenshteinDistance` for `fastest-levenshtein` (MIT, already resident via `promptfoo`, dedupes);
  `tests/unit/answer` 169 green. Two items are deliberately NOT cut and are recorded in the
  [donor hunt](../research/2026-08-01-framework-kernel-donor-hunt.md#tranche-2--audit-of-the-rest-of-live-source):
  the **two divergent `slugify` implementations** (`catalog/internal/publish.ts`,
  `storefront/internal/import-draft.ts`) need a founder call because slugs are persisted and public,
  and `convex/registry.ts` `groupByStringField` needs an ES2024 `lib` bump for `Object.groupBy`.
- Adopt-first cutover, tranche 3 (2026-08-01, [T41](tickets/T41-handrolling-cutover-backlog.md),
  audit transcripts `history://AuditModules`, `history://AuditLibComponents`,
  `history://AuditConvexTools`, `history://AuditDepsUnused`): four scouts ran the whole-repo
  hand-rolling audit. **Landed:** two more graphology cutovers (`customer-request/compiler.ts`
  wave-Kahn → `topologicalGenerations`, `route-plan-generation.ts` indegree loop → `hasCycle`), each
  proved equivalent by differential fuzz (20k and 30k randomized cases) because `compiler.ts`
  ordering feeds `canonicalDigest`; **14 unused dependencies removed** (10 `@radix-ui/*` superseded
  by the `radix-ui` umbrella, plus `http-message-sig`, `next-themes`, `tokenlens`, `web-bot-auth`);
  `tsconfig` lib ES2022 → ES2023 unlocking `findLast`/`toSorted` at 5 sites; `Response.json` at 5
  route handlers. Green after each step: typecheck, lint, build, 2719 unit+ui-contract+seo tests,
  and integration counts identical to pre-session (43/203). **Backlog:** 17 ranked items,
  ~700 lines, on T41 behind T37's green baseline.
- **Ledger correction (2026-08-01):** `date-fns`, `react-email`, `react-arborist` and XState v5 were
  recorded as adopted but were never installed. Caught by a scout refusing to cite `date-fns`
  because `package.json` contradicted its brief. T31, T26, T29, T30 and the donor hunt are corrected;
  the rule now is that a ticket may not record an adoption without the manifest entry.
- Adopt-first cutover, tranche 4 (2026-08-01, [T41 resolution](tickets/T41-handrolling-cutover-backlog.md)):
  the backlog was executed by **seven parallel subagents** under one contract — disjoint file lists, no
  agent permitted to touch `package.json` or run a project-wide check, every change labelled provably
  pure or behaviour-affecting, kind (b) shipping only behind a differential fuzz, every API claim
  carrying a `.d.ts`/doc-URL/file:line citation, and Main running the project-wide validation once at
  the end. Landed: `isRecord` ×10 and `deepFreeze` ×10 consolidated onto canonical helpers; the
  HTTP/MCP/x402 transport validator moved to Zod v4 `strictObject`; OAuth codes to `nanoid`; three
  full-table Convex scans constrained by `by_target_status`; six `JSON.stringify` origin comparisons
  moved to `stableStringify`; `cloneJsonValue` to `structuredClone`; 43 manual class strings to
  `cn`/`cva`; a recursive `readdir` walk to `node:fs/promises` `glob`. Evidence includes ~100k
  differential cases across the slices, a compiled-Tailwind proof that one class collapse was already
  dead in the cascade, and a mutual-cycle proof that four `deepFreeze` copies never terminated.
  **Refused on evidence:** `console.table` (six CLI callers depend on padded output), 4 of 10
  `structuredClone` sites (the type admits `Request`/callbacks, which `structuredClone` throws on and
  JSON cloning silently dropped), and 4 boundary `isRecord` guards (each with the schema that should
  own the payload named). One gate — capability-contract's pinned import allowlist — was updated
  consciously rather than backing the import out. Verification: typecheck, lint, build and Convex
  codegen clean; 2723 focused tests with the same 7 pre-existing failures; `test:imports` failure set
  byte-identical to HEAD; integration 43/203, identical to pre-session.

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
| [T42](tickets/T42-durable-and-public-contract-swaps.md) | task (AFK + HITL) | The 4 adopt-first swaps that change a durable or public contract | T37 |
