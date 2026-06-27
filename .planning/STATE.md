---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: Phase 1 — Ten-Star Spine Foundation
status: executing
stopped_at: Phase 1 context gathered after Fable 5 docs auto review
last_updated: "2026-06-27T08:50:12.134Z"
progress:
  total_phases: 1
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# State — Agentic Economy Fresh Repo

**Created:** 2026-06-27
**Current phase:** Phase 1 — Ten-Star Spine Foundation
**Status:** GSD kickoff started; PR00 source-mining in progress. Runtime implementation not started.

## Active decision

`Agentic-Economy-Backup` is frozen as a source mine. The fresh `agentic-economy` repo is the working product repo.

Reason: Phase 35 proved the old repo has useful product insight but poor launch architecture. Six of seven deferred surfaces were spine-woven, so pruning in place would spend launch energy untangling old coupling instead of shipping a clean product.

## Current product slice

```text
claim -> publish -> public business service catalog page -> registry/search/API -> AE-hosted discovery -> operator health/repair
```

No chat, protected actions, wallet, payment, request market, skills, hosted agents, voice, or expert surfaces in Phase 1.

## Open risks

| Risk | Status | Handling |
|---|---|---|
| Bloat re-enters the fresh repo | Active | `SOURCE-MINING.md`, PR00 ledger, import/source-mining scans, hard runtime cuts |
| UCP/agent discovery overclaim | Active | `AI-SPEC.md`; AE-hosted fallback only in Phase 1; no callable/payment/MCP/OpenAPI |
| Publish succeeds but projection fails silently | Active | durable projection attempts, `indexStatus`, admin repair loop |
| Unauthorized claim/admin action | Active | Convex-derived actor/admin, CSRF, rate limit, duplicate detection, source-owned admin roles |
| Suppression leaks through one public output | Active | one eligibility predicate; suppression tests across page/search/sitemap/llms/UCP |
| ABN-first regression | Active | no-ABN claim/publish e2e and copy/form scan |
| Payment readiness cosplay | Active | Phase 1 money-identifier quarantine; Stripe decision deferred to Phase 5 |
| TypeScript contract drift | Active | domain-owned validators, exact unions, type tests, `test:ts-standards` |
| GTM outruns product | Active | `GTM-READINESS.md`; internal alpha before public launch |

## Next action

Complete PR00 source-mining ledger closeout from `.planning/phases/01-ten-star-spine-foundation/01-01-source-mining-ledger-PLAN.md`, then execute PR01 substrate/guardrail scaffolding from the master Phase 1 plan.

## Verification expectation

Phase 1 cannot close until the exact command suite in the plan passes, plus deployment/readback smoke for `/`, `/claim`, `/registry`, `/{slug}`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, and `/admin/*` non-admin denial.

## Session

**Last session:** 2026-06-27T08:50:12.126Z
**Stopped at:** Phase 1 context gathered after Fable 5 docs auto review
**Resume file:** .planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md
