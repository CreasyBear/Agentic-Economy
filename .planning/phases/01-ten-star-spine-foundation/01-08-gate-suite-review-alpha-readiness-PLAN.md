---
phase: 01
plan: 08
slug: gate-suite-review-alpha-readiness
status: ready-for-execution
wave: 8
depends_on: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress, 01-04-admin-dispute-operator-recovery, 01-05-public-owner-ui-routes, 01-06-registry-search-api-repair, 01-07-discovery-llms-sitemap-robots]
requirements: [R10]
created: 2026-06-27
---

# 01-08 — Gate Suite, Review, Internal Alpha Readiness Plan

## Objective

Turn implemented Phase 1 into an auditable internal-alpha candidate by running and hardening the full local command suite, claims/copy gates, security/SEO/source-mining gates, Fable 5 closeout mapping, Matt Pocock two-axis review prep, and GTM activation evidence plan.

## Authority Inputs

- `01-SPEC.md` R10.
- `PHASE.md` PR08, GTM readiness gate, launch checklist, scope rejection list.
- `01-VALIDATION.md` full command suite and manual-only verifications.
- `FABLE-5-FOUNDATION-REVIEW.md` accepted decisions and must-not-regress checks.
- `.planning/GTM-READINESS.md` launch stages, claims register, activation definition, kill rules.
- Skills: `mattpocock-review`, `autoplan` if explicit auto-review is requested later, `product-design`, `accessibility`, `playwright-best-practices`.

## Scope

### In

- Make every required local command non-no-op and green.
- Add/complete `claims register` test coverage across route copy, SEO/AEO, API docs/examples, llms/UCP/robots/sitemap, GTM assets if any.
- Confirm security tests from `SECURITY-SPEC.md` pass.
- Confirm funnel events and owner activation state are queryable.
- Prepare review artifacts separating Standards vs Spec axes.
- Produce Fable 5 closeout mapping with accepted finding → implementation evidence → residual risk.

### Out

- No deploy claim, no broad public launch, no Product Hunt/paid/social launch, no new product scope.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-08-A | Run/fix full local command suite without suppressing tests. | implementation/test files only as needed | Every command in `PHASE.md` PR08 runs and passes. |
| 01-08-B | Complete claims register coverage. | `tests/copy/*`, docs/assets if present | No route/copy/SEO/API/discovery/GTM overclaim; allowed claims traced to source state. |
| 01-08-C | Complete source-mining and import gates. | `tests/imports/*`, source files if needed | Banned directories/symbols absent; every adapted backup invariant has ledger row and fresh seam test. |
| 01-08-D | Complete activation/funnel readbacks. | observability modules/tests/admin readbacks | Owner activation state can be queried for publish, status readback, capability health, share/interest, attribution, friction/failure. |
| 01-08-E | Create Fable 5 closeout mapping. | `.planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md` | Every accepted Fable 5 finding is implemented or explicitly rejected with reason/source. |
| 01-08-F | Prepare Matt Pocock review context. | review notes or PR description | Standards and Spec axes stay separate; no finding can be hidden by the other axis. |
| 01-08-G | Record internal-alpha readiness evidence. | phase summary or GTM gate artifact | five friendly-owner internal-alpha evidence attempts include activation-state rows, share/copy or consented next-capability interest, friction/failure notes, no unresolved P0 gaps, activation query, and claims register links; one-owner rehearsal explicitly not alpha-ready. |

## Product Design Pass

- **Primary user/job/object/outcome:** founder/operator deciding whether Phase 1 can enter internal alpha; object is the whole launch spine; outcome is evidence, not vibes.
- **States:** all green, failing command, accepted review finding fixed, accepted review finding explicitly deferred/rejected, activation evidence missing, P0 gap blocks launch.
- **Review lens:** visual/product quality requires rendered compact/wide proof for material user-facing surfaces, not just code/test output.

## Verification

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:copy
npm run test:imports
npm run test:source-mining
npm run test:types
npm run test:ts-standards
npm run test:seo
npm run test:ui-contract
npm run test:imports:fixtures
npm run test:source-mining:fixtures
npm run test:ts-standards:fixtures
npm run test:copy:fixtures
npm run test:ui-contract:fixtures
npm run build
```

Manual/review gates:

```text
/mattpocock-review
Fable 5 closeout mapping
rendered compact/wide UI evidence
five-friendly-owner internal-alpha evidence, or one-owner rehearsal explicitly marked not alpha-ready
```

## Stop Conditions

- Any required command is skipped, converted to a no-op, or excluded because it is failing.
- Standards and Spec findings are merged or reranked against each other.
- GTM/copy says launch-ready without owner activation rows and no-P0 evidence.
- Fable 5 accepted findings cannot be mapped to implementation evidence.
