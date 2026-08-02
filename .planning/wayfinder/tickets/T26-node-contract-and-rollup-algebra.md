# T26 — Node contract & five-dimension rollup algebra

Labels: `wayfinder:grilling` (HITL). Map: [Framework](../MAP-framework.md).

## Question

Lock the work-package/node schema every module consumes: Bundle-under-Customer-Request tree shape;
node fields for the five dimensions — timing (lead time/window/date), cost (estimate/committed/
envelope), resources (owner: agent|human|business, exclusivity), effort (human-minutes as the scarce
currency), scope (acceptance criteria kind) — plus status set (locked/ready/studying/queued/fog),
fog/elaboration rules, and the per-dimension rollup algebra (critical-path max for timing, sum+envelope
for cost, conflict detection for resources, attention budget for effort, coverage for scope) as kernel
code. Includes generation/revision fencing alignment with the frozen spine exit contract.

## Resolution

**Locked 2026-08-01** under the founder's "keep moving forward" directive (2026-08-01) — decided by
Main from the settled inputs below, executed immediately; founder veto is cheap until T33 cutover.

Contract: `src/modules/work-tree/internal/contract.ts` (`ae.work-node:v1`, `ae.work-tree:v1`).

- **Node**: `nodeId`, `kind: package|decision|task|study`, title/description, `parentId`
  (Bundle-under-Customer-Request), directional `dependsOn` (Linear `blocks`), priority 0-4 (Linear
  scale), `evidenceRefs`, `authorityRef`, optional `quote` {observedAt, expiresAt, revision,
  evidenceClass} — freshness/evidence-class is the sanctioned hand-roll.
- **Status**: `fog | queued | ready | studying | locked | done | cancelled` with an explicit
  transition table (`WORK_NODE_STATUS_TRANSITIONS`). `done`/`cancelled` terminals added beyond the
  ticket's five (execution needs terminals; Linear completed/canceled is the donor precedent).
- **Five dimensions** (all optional on fog nodes; non-fog non-decision nodes require timing):
  timing {certainty fixed|window|fog, date, window, leadTimeDays}; cost {currency, estimateMinor,
  committedMinor, envelopeMinor — estimate and committed never merge; envelope is the authority
  ceiling}; resource {owner agent|human|business, ownerRef, exclusive half-open interval};
  effort {humanMinutes — attention budget, never complexity points}; scope {acceptance
  binary|criteria|judgement, criteria with per-criterion accepted}.
- **Fog/elaboration**: fog is first-class; elaboration only at the frontier (`isElaborationFrontier`:
  all ancestors non-fog, parent locked/ready); bounds MAX_CHILDREN_PER_ELABORATION=8,
  MAX_TREE_DEPTH=5, MAX_NODES_PER_TREE=128.
- **Fencing**: tree carries generation+revision; every verb mutation compares
  expectedGeneration/expectedRevision + proposalDigest server-side (aligned with the frozen spine
  exit contract).
- **Rollup algebra** (kernel code, T26 implementation dispatched with T28/T29/T30): timing = ported
  CPM (ES/EF/LS/LF/slack) over dependsOn with date-fns v4 business days, fog-bounded envelopes;
  cost = per-currency estimate/committed sums + envelope-breach flags; resources = interval-tree
  conflicts per ownerRef; effort = minutes vs attention budget; scope = criteria coverage with fog
  denominator flag.

Adoptions installed to manifest same day (ledger rule): `date-fns@4`, `@flatten-js/interval-tree`,
`xstate@5`, `@react-email/components`, `@react-email/render`, `react-arborist`.

## Input assets

- **Schema donor extraction** (2026-08-01, `history://SchemaDonorScan`, source-verified from
  `ln-dev7/circle` mock-data (MIT) and `linear/linear` SDK generated types + schema.graphql):
  - **ADOPT-SHAPE** (carries near-verbatim): stable `id`/`identifier`, `title`/`description`,
    created/updated timestamps, `parent`/children hierarchy, labels, assignee→owner, cycle
    `startDate`/`endDate`, `dueDate`, numeric `estimate`, priority scale (0 none/1 urgent/2 high/
    3 medium/4 low), project→milestone hierarchy (ProjectMilestone: `targetDate`, `progress`,
    `progressHistory`, `status`), **directional relations** (`IssueRelationType: blocks | duplicate |
    related`), WorkflowState as a first-class object (`type` taxonomy: triage/backlog/unstarted/
    started/completed/canceled, `position`, `inheritedFrom`), ProjectStatusType
    (backlog/planned/started/paused/completed/canceled), progress %, **health enum**
    (`no-update | on-track | at-risk | off-track`) + ProjectUpdate cadence.
  - **ADAPT** (rename/resemantic): workflow-state taxonomy → AE `locked/ready/studying/queued/fog`
    (triage → AE decision inbox); target-date *granularity* → timing-window certainty; owner →
    `agent | human | business` resource; `estimate` → human-minutes effort (attention budget),
    never complexity points.
  - **MISSING-IN-TRACKERS** (AE-only, no donor — the grill's real work): cost envelope + committed/
    estimated split, authority/mandates, evidence refs, fog/elaboration lifecycle, quote freshness,
    generation fencing, five-dimension rollup algebra, node kinds (package/decision/task/study).
  - Donors settle: IDs + hierarchy, status-enum shape, date fields, estimate + priority, directional
    relations. Donors cannot settle: cost semantics, authority, evidence/freshness, fog lifecycle,
    rollup algebra + generation fences.

## Named adopted libraries (adopt-first rule)

Source: [donor hunt](../../research/2026-08-01-framework-kernel-donor-hunt.md), 2026-08-01.

- **ADOPT** `graphology` + `graphology-dag` — `hasCycle`, `willCreateCycle`, `topologicalSort`,
  `topologicalGenerations` for tree/dependency validation. No CPM in the Graphology ecosystem.
- **ADOPT** `@flatten-js/interval-tree` — resource-exclusivity conflict detection
  (`insert`/`search`/`intersect_any`). Closed intervals: normalize AE bookings to half-open.
- **INSTALL (not yet installed — T31 recommended it, nobody added it)** `date-fns` v4
  (`addBusinessDays`, `differenceInBusinessDays`, `areIntervalsOverlapping`, `eachDayOfInterval`);
  add `@date-fns/tz` only if calendars go DST-aware. Neither supplies holidays or custom workweeks.
- **PORT** critical-path math (ES/EF/LS/LF, total/free slack, `isCritical`) from
  `@pyraxi/cpm-engine` `packages/engine/src/schedule.ts` (MIT) or GanttProject's
  `CriticalPathAlgorithmImpl.java` (GPLv3, algorithm only); working calendars from
  `@bluemillstudio/gantt` `src/store/calendar.ts` (MIT).
- **VENDOR** Task Master AI (MIT) `find-next-task.js` frontier selection and
  `dependency-manager.js` (`isCircularDependency`, `validateTaskDependencies`); Backlog.md (MIT)
  `src/types/index.ts` node-field shape — its dependency validator has no cycle check, do not copy.

**Recorded adoption-search failure (legitimate hand-roll):** the five-dimension rollup *contract* —
timing uncertainty/fog envelopes, cost sum + committed/estimate envelope, resource over-allocation
policy, effort attention-budget, scope-coverage denominator with fog — plus authority/mandate refs,
evidence refs and quote freshness. No package computes all five; no tracker models cost envelopes,
fog lifecycle or generation fences.
