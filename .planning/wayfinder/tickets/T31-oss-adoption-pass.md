# T31 — OSS adoption pass: function/feature from libraries, hand-roll integration only

Labels: `wayfinder:research` (closed 2026-08-01). Map: [Framework](../MAP-framework.md).

## Question

For each framework component, find the adoptable OSS (TS/Convex-compatible or pattern-donor) so no
function/feature is hand-rolled: tree/DAG state + rollup computation, critical-path/scheduling math,
MCDM/weighted scoring, RFx/tender state machines, report/email rendering (e.g. react-email),
tree/timeline/inbox UI components (shadcn ecosystem, headless tree components), template/playbook
engines, notification digests. Per source: what it is, license, maturity, exact API to adopt or
pattern to borrow, and the integration seam. Output feeds the adopt-first rule in every task ticket.

## Resolution

Resolved 2026-08-01 by research subagent (`history://OssAdoptionPass`; source-verified APIs, licenses,
maturity; full component table in the transcript).

**Ranked adoptions:** (1) `@convex-dev/workflow` + `workpool` (already adopted — durable execution);
(2) **XState v5** for RFx/interactive transition modeling (MIT, zero-dep; Convex append-only events
remain durable truth — never persist XState snapshots as source of truth); (3) **react-email** for
report/memo rendering inside Convex actions (MIT; provider call from the action seam; not MJML);
(4) **react-arborist** for the person-facing tree projection (MIT; virtualized, ARIA, controlled
`data` only — server actions own mutations); (5) **date-fns** for calendar arithmetic (MIT, v4).
Conditional projection aids: Graphology (server graph algorithms), d3-hierarchy (layout only). Pin
tested releases before adoption.

**Justified hand-roll (domain policy / integration only):** five-dimension rollup algebra, critical
path (working calendars, unknown dates, evidence — deterministic pure TS), MCDM weighted scoring
(TOPSIS pattern; stale npm package rejected), playbooks as plain typed data with Convex validators
(Handlebars only for untrusted text interpolation, never logic), digest/notification batching
(NotificationEvent + DigestWindow + DeliveryAttempt on scheduled functions).

**Deferred:** gantt/timeline widgets — bespoke Astryx timeline projection first.

Caveat: Convex actions are the integration seam for provider effects; client XState and UI widgets
never carry authorization or durability.

**Addendum (Main, verified 2026-08-01): Linear-style UI leverage.** No adoptable full product exists
(Plane is AGPL-3.0 — verified `LICENSE.txt`, pattern-donor only; Huly hosted-shutdown; Focalboard
unmaintained; Loomio Ruby). BUT **`ln-dev7/circle` (MIT — verified `LICENSE.md`)** is a
Linear-inspired PM interface template in Next.js + shadcn/ui (2.6k stars, UI-only, mock-data driven,
no backend opinion): lift its component patterns (list/board, sidebar, status/priority affordances,
filters) into Astryx tokens for T30, remapping vocabulary (issues→decisions/packages, triage→decision
inbox). Convex remains the data plane. **Founder caveat (2026-08-01): CRM/tracker-shaped UI is not
the consumer front door — circle patterns apply to the behind-disclosure tree view and
operator/business consoles only; the primary person surfaces are dialog, decision inbox, and memo
(see T30 scope ruling).**

## Addendum — donor hunt partially overturns this ticket (2026-08-01)

A second, deeper pass ([donor hunt](../../research/2026-08-01-framework-kernel-donor-hunt.md), five
source-verified librarians) re-tested the "justified hand-roll" list above. Result:

- **Overturned:** base CPM (forward/backward pass, ES/EF/LS/LF, slack, critical flag), working-calendar
  arithmetic, interval-overlap detection, and graph/cycle validation ARE donor-backed —
  PORT `@pyraxi/cpm-engine`/`@bluemillstudio/gantt`/GanttProject; ADOPT `graphology-dag` and
  `@flatten-js/interval-tree`.
- **Overturned in method:** TOPSIS is not "hand-roll" — PORT `kotbaton/pymcdm` `topsis.py` (MIT).
  The npm rejection is now evidence-backed: `topsis@1.3.2` computes `D-/(D- + D-)`, a real bug.
- **Confirmed:** the five-dimension rollup *contract*, playbooks-as-typed-data and digest batching
  have no donor.
- **Confirmed and sharpened:** `ln-dev7/circle` stays a pattern donor; `react-arborist` verified
  active and React 19-compatible (not stale).
- **New:** the whole-system analogue is Task Master AI (MIT) — VENDOR its frontier selection,
  dependency validation and complexity-guided expansion rather than writing them.

## Correction — the "ranked adoptions" above were never installed (2026-08-01)

Verified directly against `package.json` and `node_modules`: **`date-fns`, `react-email`,
`react-arborist` and XState v5 are not in this repo.** This ticket recommended them; the map's
decision line then read as though the adoption had happened, and two later documents cited them as
"already adopted". Caught by `history://AuditModules`, which refused to cite `date-fns` because the
manifest contradicted its brief.

Actually installed and load-bearing: `ai`, `zod`, `convex`, `@convex-dev/workflow`,
`@convex-dev/workpool`, `graphology` + `graphology-dag` + `graphology-traversal`,
`fastest-levenshtein` (the last four installed 2026-08-01), `clsx`, `tailwind-merge`,
`class-variance-authority`, `ajv`, `@cfworker/json-schema`, `@noble/hashes`, `@noble/curves`,
`eventsource-parser`, TanStack and Radix packages.

Rule going forward: a ticket may not record an adoption as done without the manifest entry. "Adopt X"
is a recommendation until `package.json` says otherwise.
