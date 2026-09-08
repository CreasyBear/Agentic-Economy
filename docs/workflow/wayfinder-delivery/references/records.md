# Records and housekeeping

## One place for each fact

Use the existing issue, queue or work record as the single current status home.
Do not add a work record when that home already supports resumption. Routine
work can close in the response with its outcome, checks and remaining risk.
For multi-session work, retain scope/approval, owned changes, acceptance evidence
and the next action. Link plans and detailed findings instead of copying them.
Reuse existing IDs across sessions and reviews.

Keep indexes as links, not another status ledger. Replace obsolete progress
summaries in the owning record; do not append a running transcript of assignments,
censuses or review receipts. Preserve unresolved facts and evidence needed to
support acceptance claims. Do not consolidate another active task's records.

Statuses: `scoping`, `awaiting-direction`, `active`, `blocked`, `complete`,
`cancelled`, `superseded`. Keep release facts separate: local commit, pushed,
deployed and live-verified are different observations. `complete` means the
approved goal's criteria are proved; a local-only goal can complete locally,
whereas a live-delivery goal stays open while live proof is missing.

At a material handoff, update only changed results, relevant revision/environment,
open findings and next action in their owning record. On interruption, preserve
partial edits and pending processes with how to await or stop task-owned work.
Never declare a background review or test successful before collecting its result.

## Findings register

Reuse an existing issue ID. Deduplicate by the same behavior/root cause and
affected surface, not just matching wording. Keep actionable papercuts, defects,
structural debt and workflow shortcomings in one canonical backlog. Original
audits remain dated evidence; a current entry links them rather than cloning
their complete content and status.

Use the existing backlog format. A finding needs enough context to act: the
problem, evidence, acceptance condition and current disposition. Add ownership,
priority or estimates only when useful for coordination; do not invent commitments.
P0 is a release blocker, not an untidy folder. Preserve source IDs. A rejection
has a reason, a duplicate links the retained ID, and a deferral names the actual
dependency or next decision.

Suggested states: `open`, `in-progress`, `blocked`, `source-resolved`, `verified`,
`deferred`, `rejected`, `duplicate`. A source fix closes only a source-level
criterion. If live proof is required, keep `source-resolved` plus remaining proof.
Move verified entries to Completed with date and evidence, retaining their IDs.
Do not mark acceptance-critical findings deferred to make the parent goal pass
unless Joel actually approves the changed acceptance scope.

## Documentation by consequence

| Change | Required maintenance |
|---|---|
| User-visible flow or command | Relevant guide/help/generated machine instructions and examples |
| Public contract, persisted schema or protocol | Canonical reference/schema, migration/compatibility guidance and affected consumers |
| Durable architectural choice | Existing ADR or a new concise decision with alternatives and consequences |
| Deployment, credentials or runtime operations | Actual registry/runbook and maturity proof; credentials themselves stay out of docs |
| File/module move or rename | Imports, boundaries, scripts, docs links and any generated map that now misdirects work |
| Removed behavior | Remove or retire affected examples, links and claims; preserve required history |
| Internal fix without documentation impact | None; no document or `not applicable` receipt |

Update an existing document before creating another. New documents need a named
audience, purpose, owner and canonical location. Keep generated maps labelled
with revision/date; refresh affected material when needed, not all maps after
every edit. Do not manually overwrite generated files when their generator owns
them. Product rules and accepted terminology outrank stale lessons or old plans.

Check ignore rules for new durable records. Make only the targeted path visible
to Git; do not blanket force-add an ignored planning tree. Evidence receipts need
revision, environment, time, command/procedure and outcome. Prefer a sanitized
summary plus a durable artifact link over committing raw logs.

## Closeout sweep

Before commit, reconcile acceptance and review findings; update affected docs;
check references; inspect file placement/naming and existing architecture checks;
remove task-owned scratch, debug code and replaced dead paths; join/stop owned
background jobs; inspect the scoped diff and staged content. A dirty shared tree
is acceptable. Deleting another task's files or archiving its plans is not.

For archival, first enumerate candidates, authority, active references and
owners. Only archive genuinely superseded, owned documents in approved scope.
Preserve historical identity and repair links. No `final-v2-new` document copies,
new root-level plan for every phase, or speculative directory hierarchy.

Close with the outcome, relevant check commands/results and remaining risk.
Do not require a retrospective, lesson, separate closeout checklist or receipt
for routine work. Record a lesson only when a demonstrated failure yields a
reusable prevention action; link its evidence and applicability. Supersede stale
guidance rather than appending repeated essays or exporting it into AGENTS.md.

gstack `learn` can maintain its private learning cache, and `retro` can supply
comparable trend evidence. Neither a cache entry nor a subjective score overrides
the repository's product/architecture authority or proves improvement. Before
starting a related task, retrieve relevant lessons and open papercuts, not the
entire history.
