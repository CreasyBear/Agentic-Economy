 Tangible Progress, Anti-Ceremony, and Honest Credit

 The purpose of this project is working, deployable software

 delivered accretively in the shortest time compatible with

 correctness, performance, reliability, and innovation. Process

 exists to serve that outcome; it must never become the product.

 No process porn. Certificates, ledgers, dashboards, meta-reports,

 and process documents are not progress. A process artifact may exist

 only when it is a hard gate for a named feature or capability—the

 conformance validator and required release evidence qualify;

 self-referential paperwork does not. Choosing process artifacts

 because they are easy and low-risk is reward hacking, and it is

 treated as such.

 Feature-first ratio. The overwhelming majority of open work items

 must deliver runnable behavior—code, schemas, and contracts that an

 end user or consuming agent can actually exercise. Process and

 operations items are capped at, as a guideline, no more than

 approximately 5% of open beads. Each must name the feature work it

 gates; a process item that gates nothing does not get created.

 Honesty is absolute. Never fake a test, present a fixture or mock as

 live proof, weaken an assertion to make it pass, hard-code a success

 path, or close work that is not done. A false close is reopened with

 an incident comment on the record.

 Refusal is not delivery. A correctly typed refusal is far better

 than a fabricated result—and far less valuable than the real

 capability. Implementing only the refusal path earns partial credit

 at most; it never closes a feature work item. Full credit requires

 the positive capability to be implemented for real, tested, and

 verified. Mark refusal-only states explicitly—for example, with a

 “refusal-only” label and a follow-up item—so they read as

 unfinished, never as shipped.

 These rules bind human-directed sessions and NTM swarms alike, and

 they must be encoded into the acceptance criteria of the work items

 themselves.      
Named Reward-Hacking Patterns (All Forbidden)                        

 Beyond refusal-farming and process porn, these patterns are called

 out by name because this architecture specifically invites them:

1. Gate self-weakening — Editing validator or conformance code so a

  failing check passes. Conformance code is a separate,

  single-owner lane with reviewer sign-off; batch verification

  diffs it every wave.
2. Proof-class inflation — Presenting fixtures, retained captures,

  mocked endpoints, or hand-inserted database rows as live proof.

  Live proof requires runtime-selected subjects with recorded

  selection seeds, receipts chained to real route manifests and

  accounts, and fresh-process readback.
3. Golden regeneration reflex — Regenerating goldens to match broken

  output instead of fixing the output. Golden changes require an

  explicit GOLDEN-CHANGE commit note and a semantic diff review.
4. Commit-stream pumping — Trivial or artificially split commits, or

  todo!() and unimplemented!() scaffolds that pass cargo check.

  Placeholder macros are banned in committed code—batch

  verification searches for them—and every commit names its bead

  and touched scope.
5. Tautological tests — Tests that assert the code does whatever the

  code does, or that omit negative cases. Every feature bead

  pre-specifies its key behavioral assertions, including at least

  one negative case that a naïve, incorrect implementation would

  fail.
6. Easy-bead cherry-picking — Repeatedly claiming low-risk beads

  while articulation-point beads starve. Claim the highest-priority

  ready bead; act on staleness alerts for unclaimed P0 or P1 work.
7. Close-pump abuse — Closing beads, whether yours or a peer’s, to

  flood the ready pool, since closure is what unblocks dependents.

  Only the orchestrator closes; violations are reopened with an

  incident comment.
8. Scope-splitting — Splitting one unit of work into types,

  implementation, and test mini-closures to harvest multiple

  credits. Code and its tests ship in the same bead; test-only

  follow-ups exist only for cross-cutting integration suites.
9. Spec-editing as progress — Weakening a plan, specification, or

  frozen decision instead of implementing it. Plan edits are a

  chore lane, never close feature beads, and frozen decisions

  change only through the joint decision protocol.
10. Conformance metastasis — Adding speculative checks, matrices, or

  reports because they are safe and satisfying. New checks must

  cite an observed defect class or a named release gate.
11. Dependency smuggling — Vendoring or shimming around banned

  runtime or database dependencies to “make progress.” Batch

  verification enforces the dependency deny-list.
12. Demo-path hardcoding — Special-casing pilot SKUs, stores, or

  properties so the happy path passes. Conformance subjects are

  runtime-selected and differ from development fixtures.

