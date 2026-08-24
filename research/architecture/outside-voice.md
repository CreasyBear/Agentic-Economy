# Independent architecture challenge

**Reviewer:** fresh GPT-5.5 outside voice  
**Date:** 2026-08-25  
**Boundary:** read-only review of the current plan, product authority, and three fresh architecture evidence reports.

## Load-bearing claim

The plan depends on this claim: the right pre-launch cleanup is not just “make the golden journey releasable,” but “make the internal module graph enforceable before launch.”

That is only partly proven. The CLI artifact defect and divergent Operation projection/call truth are launch risks. Full DAG cleanup is useful, but less clearly launch-blocking unless it directly protects the Operation read/call migration.

## Simpler alternative test

A materially simpler pre-launch plan exists:

1. Fix CLI package/release ordering.
2. Add real-backend golden-journey, projection-drop, inspect-to-call parity, and hosted receipt gates.
3. Add diagnostics and benchmark current search.
4. Materialize the current Operation read model only if diagnostics/benchmark confirm the current path is too risky.
5. Defer full graph acyclicity except edges touched by search/call/release gates.

The current plan is simpler than package-per-domain or engine rewrites. It is not simpler than this narrower release-risk plan.

## Findings

`[P1] (confidence: 9/10) PLAN.md:430` - CLI fix is both “first” and Wave 5.

> “Fix the clean CLI package defect first”  
> “### Wave 5: CLI workspace and exact artifact release”

Impact: the release gate remains untrustworthy while Waves 1-4 run, even though the plan says every later branch needs a clean artifact-free gate.

Recommendation: move CLI workspace, package-owned build/prepack, and import-test ordering into Wave 0/T2. Leave only publish/tag/provenance mechanics in Wave 5.

`[P1] (confidence: 8/10) PLAN.md:401` - read-model migration lacks data/backfill mechanics.

> “Define the canonical digest-linked current Operation projection”  
> “Materialize immutable facts on publication revision”

Impact: a new materialized projection needs schema/index changes, backfill of existing current publications, update hooks, stale/missing projection behavior, and rebuild/rollback rules. Shadow comparison cannot be trusted if only newly touched Operations have projections.

Recommendation: add an explicit Wave 2 migration subplan: schema/index, idempotent backfill, dual-write/update triggers, stale-projection diagnostics, projection rebuild command, and rollback behavior when projection rows exist but are ignored.

`[P2] (confidence: 8/10) PLAN.md:409` - shadow cutover exit is underspecified.

> “zero unexplained shadow mismatches on representative current data”

Impact: “representative” and “no performance regression” are subjective. Cutover can be argued green without enough suppliers, readiness states, price shapes, invalid joins, authenticated/keyless paths, or time under observation.

Recommendation: define the exit contract: dataset composition, minimum row counts, covered Operation variants, observation duration, mismatch budget, latency/query thresholds, and who can approve explained mismatches.

`[P2] (confidence: 7/10) PLAN.md:338` - migration gates mix architecture proof with market-proof instrumentation.

> “Exercise a second distinct gap/search/allocation identity separately from idempotent replay.”

Impact: this is useful product evidence plumbing, but it is not required to prove module-boundary safety. Making it a migration gate risks expanding pre-launch architecture cleanup into market-validation work.

Recommendation: keep replay-vs-repeat semantics protected, but move second-gap/allocation proof to launch evidence or T7, not the critical path for structural cleanup.

`[P2] (confidence: 8/10) PLAN.md:450` - rollback is operationally thin outside the read model.

> “Structural import moves are one commit per edge and revert independently.”  
> “The new Operation read model has a read-only shadow phase and a read-path feature switch.”

Impact: commit-level revert is not the same as live rollback. Call seam, money joins, access/security DTO changes, and Convex helper moves may regress behavior after deployment without a feature switch or old adapter path.

Recommendation: add per-surface rollback rules: keep old adapters callable for one release where practical, run route/action parity canaries after deploy, define Convex schema forward/backward compatibility, and specify whether rollback means flag flip, redeploy, or data repair.

## Product-boundary check

Orders: correctly excluded. Do not reintroduce them as a procurement/order lifecycle.

Customer Requests: correctly excluded as product authority. Existing names inside `action-invocation` should be treated as compatibility residue only.

WorkTrees: correctly excluded. Old `project` URL compatibility must not become project ownership or harness memory.

Agent Engine: correctly rejected. The plan should not introduce an Operation Engine or Agent Engine abstraction to justify cleanup.

## Recommendation ledger

| Recommendation | Classification | Rationale |
|---|---|---|
| Move CLI workspace/build/test ordering into Wave 0; leave publication mechanics later. | Adopt | It fixes a proven release-gate defect before other branches depend on that gate. |
| Add explicit read-model schema, backfill, dual-write/update, rebuild, stale-projection, and rollback steps. | Adopt | Materialized data without migration mechanics is the largest practical hole in Wave 2. |
| Define shadow cutover data, duration, mismatch, and performance thresholds. | Adopt | Prevents subjective cutover acceptance. |
| Move second-gap/allocation proof out of the module-cleanup critical path. | Investigate | It matters for product evidence, but may not belong as a structural migration blocker. |
| Add live rollback/canary rules for non-read-model seam changes. | Adopt | Commit reverts are not enough operational rollback detail. |
| Replace the plan with package-per-domain, Orders, Customer Requests, WorkTrees, or Agent Engine. | Reject | These violate the current product boundary and do not solve the verified defects. |

