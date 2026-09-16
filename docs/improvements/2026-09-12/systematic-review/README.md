# Systematic source review

**Status: census established; semantic review started, not complete.** This replaces the earlier representative audit as the review method. Its findings remain provisional inputs; they do not select the coverage or establish a platform verdict.

## Coverage

The census records 2,260 present repository files: 1,315 in implementation scope, 684 test/evidence files, 21 configuration files, 8 generated integration files, 3 vendored integration files, 25 public assets, and 204 context/operational documents. It separately records 32 tracked paths absent from the working tree. Four package manifests are present, including the historical Formance spike; active and historical package roles must remain separate.

The TypeScript scan records 10,871 import/re-export/load edges, 380 non-test runtime-call candidates, 1,224 non-test database-operation candidates, and 1,159 non-test state-property sites. These counts establish review inputs, not proven semantic completeness. A state property is not automatically a transition; a database operation is not proof of ownership. Indirect wrappers, config, UI events, provider callbacks and externally triggered behavior must be reconciled while reviewing their owners.

Every inventoried file has exactly one primary coverage unit in [coverage-register.json](coverage-register.json). Units are accounting boundaries, **not agent assignments**. The full [inventory](inventory.json) includes hashes and scope/exclusion explanations. Installed dependencies and ignored local files are outside the repository-source census; integration assumptions are still in scope. Generated source is reviewed through its inputs, consumer contracts and generation checks; vendored code through provenance and adapter behavior. Historical documents do not override PRODUCT.md, CONTEXT.md or current source.

## Dispatch rule

Joel requested short-lived Luna Max agents. The three broad mapping assignments were stopped; they do not count as completed reviews.

Each new agent gets:

- **One named question** about one symbol, one transition, one consumer/producer contract, one data relationship, or one small test obligation.
- **One to three exact files or specified line ranges**, normally no more than 300 source lines total. If more context is necessary, return the missing dependency to root; do not explore the repository.
- Relevant skill principles supplied with the task. No repeated global discovery, multi-skill essay, whole-module reasoning, agent spawning or speculative fixes.
- A compact response: observed contract, input/output or trigger/result cases, path/line evidence, file hash, contradiction or unknown, and exact limit of the conclusion. Default maximum 200 words.
- A stop condition: answer the named question and exit. Root assigns any follow-up as a new bounded task.

At most three agents run concurrently. Root owns decomposition, chronology, cross-module reasoning, evidence validation and consolidation. Do not pay several agents to rediscover the same imports or reread the whole product charter. Supply existing evidence and only the relevant product invariant.

## Systematic progression

For each coverage unit, root decomposes work in this order:

1. **Purpose and surface:** identify the real caller and product responsibility for each export/entry point; flag unused or duplicate responsibilities for evidence, not automatic removal.
2. **Local behavior:** inspect each meaningful branch and input/output guarantee. Separate accepted input assumptions from enforced validation.
3. **Relationships:** trace producer to consumer across imports, adapters, schemas, database ownership/projections, queues, webhooks and external services. Check both ends with separate small tasks before root resolves the relationship.
4. **Transitions:** record source state, trigger, guards/authority, writes, side effects, destination, and recovery. Add relevant invalid, duplicate, reordered, timed-out, restarted, revoked, stale and cross-account cases. For UI, include empty/loading/error/interrupted states. Mark inapplicable cases with reasons.
5. **Tests and design:** a separate small task maps specific assertions to the behavior; root identifies missing proof. Root challenges the design only after this evidence: why it exists, what complexity it buys, what simpler alternative preserves the constraints, and the blast radius of changing it.
6. **Disposition:** keep with rationale, concrete defect, design improvement, accepted deferred product scope, or unresolved question. Findings and positive conclusions both require evidence.

Start with shared contracts and identity/authority, then follow actual dependencies through discovery/supply, execution/money, customer/provider/operator surfaces, and operations/package delivery. This sequence covers all registered units; the previous audit's three findings are not shortcuts around it. If a dependency cycle prevents a simple ordering, root defines the smallest paired relationship review instead of handing the cycle to one agent.

## Evidence and completion

The detailed inputs are [static edges](static-edges.json), [exports/runtime/storage/state candidates](source-contract-candidates.json), and [initial micro-reviews](micro-reviews.json). `Inventoried`, `local contract reviewed`, `relationship reviewed`, `behavior validated`, and `unit complete` are different states. Reading a test is not running it, and a local contract review cannot clear its callers or the platform.

A unit closes only when its in-scope files/symbols are inspected or explicitly justified as trivial/generated, each applicable review dimension has evidence, its inbound/outbound relationships are reconciled, its state/behavior cases have dispositions, and relevant existing tests or missing proof are recorded. Root expands new relationships discovered during review into the register. No whole-platform completion claim while units, semantic relationships, or material unknowns remain open.

File hashes identify the content reviewed. A change to a file invalidates affected symbol conclusions and dependent relationship reviews; unrelated completed work is retained. The inventory itself was collected over an interval in a changing checkout, not an atomic snapshot. Root rechecks paths/hashes before acceptance rather than rerunning the entire audit on every edit.

This phase changes review artifacts only. No implementation fixes, reversions, E2E/Playwright runs, live services or financial activity are included. Tests appropriate to an actual behavior review can follow as separate bounded tasks; no new test infrastructure is implied.
