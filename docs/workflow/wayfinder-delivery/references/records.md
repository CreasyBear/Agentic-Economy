# Records and housekeeping

## One place for each fact

Use the working repository's established authorities. The work record is a
resumable index, not a duplicate specification. Keep goal, approval, current
status, acceptance/evidence, owned change boundary, native artifact links,
remaining findings and next action there. Use a task-owned timestamped goal ID;
reuse it across sessions, retries, commits and review findings.

Link new active work from the workflow entry point. Keep status in the work
record rather than duplicating it in the index. On closeout, retain a searchable
link or archive entry so a later task can find the prior decision and receipt.

Statuses: `scoping`, `awaiting-direction`, `active`, `blocked`, `complete`,
`cancelled`, `superseded`. Keep release facts separate: local commit, pushed,
deployed and live-verified are different observations. `complete` means the
approved goal's criteria are proved; a local-only goal can complete locally,
whereas a live-delivery goal stays open while live proof is missing.

At every material handoff, record the result, exact artifact/selected revision,
open assumptions/findings and next action. Update after meaningful changes,
not every tool call. On interruption, preserve partial edits, pending processes
and how to await or safely stop task-owned work. Never declare a background
review or test successful before collecting its result.

## Findings register

Reuse an existing issue ID. Deduplicate by the same behavior/root cause and
affected surface, not just matching wording. Keep actionable papercuts, defects,
structural debt and workflow shortcomings in one canonical backlog. Original
audits remain dated evidence; a current entry links them rather than cloning
their complete content and status.

For gstack `TODOS.md`, use its component headings and required fields: What,
Why, Context, Effort, Priority. Add ID, Kind, Status, Owner, Evidence and Close
when. An owner may be `unassigned`; do not invent someone's commitment. P0 is a
release blocker, not a synonym for an untidy folder. Preserve source IDs during
migration. A rejected finding includes the evidence/reason; a duplicate points
to the retained ID; a deferral names the actual dependency or next decision.

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
| Internal fix without documentation impact | A short `not applicable` reason in closeout; do not invent a document |

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

Write a short retrospective in the work record: what fell short, the evidence,
causal explanation if known, what changed, and residual uncertainty. Do not invent
a lesson for every run. Promote only reusable, evidence-supported lessons to the
repo's curated lesson home. Each lesson has applicability, provenance, last
validation and a narrow prevention action. Supersede contradictory/stale guidance;
avoid repeated append-only essays or exporting everything into AGENTS.md.

gstack `learn` can maintain its private learning cache, and `retro` can supply
comparable trend evidence. Neither a cache entry nor a subjective score overrides
the repository's product/architecture authority or proves improvement. Before
starting a related task, retrieve relevant lessons and open papercuts, not the
entire history.
