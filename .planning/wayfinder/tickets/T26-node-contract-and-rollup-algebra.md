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

(pending)

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
