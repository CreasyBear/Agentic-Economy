# Choose bounded implementation order and ownership

Type: grilling
Label: wayfinder:grilling
Status: resolved
Parent: ../map.md
Blocked by: 05

## Question

What sequence produces a complete migration with reviewable, independently owned
changes and a coordinated usable result? Select exact owned slices after mapping
the contracts; do not divide by arbitrary file counts or rename UI while leaving
public/DB work unspecified. Account for generated artifacts, tests, examples,
canonical docs and legitimate historical exceptions.

Specify safe checkpoints, how concurrent dirty work is preserved, and when the
Package 6/7 owners reconcile their held work. Carry all unresolved acceptance
items forward. Link the resulting single candidate plan in docs/designs; run the
relevant installed engineering and developer-experience review skills before
asking Joel for one implementation direction approval.

## Answer — accepted 2026-09-05

Joel approved the complete [implementation plan](../../../docs/designs/vocabulary-rationalisation.md).
This resolves the delivery strategy, not the still-incomplete dispatch queue:

- This task owns coordination, assignments, integration and acceptance;
  GPT-5.6 Luna with max reasoning owns each bounded implementation and fix.
- At most three independent workers. Shared source/schema/public-action
  registration, generated outputs and commits are serialized.
- Phase 0 preserves the dirty baseline, prepares exact-file issues and obtains
  independent engineering/DX review and target/recovery evidence.
- Core language and implementation precede public contracts and developer
  surfaces; non-overlapping UI/docs follow, then integrated verification,
  local clean-data proof, actual client/app use and hosted-test cutover.
- Each rename includes its known consumers and tests. No independently green
  definition-only halves. Structural changes require their own necessary,
  behaviour-preserving issue; optional cleanup does not block this programme.
- No parallel legacy API or custom tracker/migration framework. Existing
  generators, tests, supported Convex operations and deployment projects are
  reused. Protected formats and external financial records remain unchanged.
- Package 6/7 stay held until their actual dependencies and evidence are handed
  back; neither is closed by association with this refactor.

Issue 37 remains open until finite allowlists and dependency checks exist.
Issues 29/30 own execution review; 31 owns recovery/cutover readiness. Their
unfinished proof is not concealed by resolving this accepted decision.
