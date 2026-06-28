---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
status: executing
stopped_at: Completed 01-06-registry-search-api-repair-PLAN.md
last_updated: "2026-06-28T02:14:30.447Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 13
  completed_plans: 6
  percent: 46
---

# State — Agentic Economy Fresh Repo

**Created:** 2026-06-27
**Current phase:** 01
**Status:** Executing Phase 01

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

Execute `.planning/phases/01-ten-star-spine-foundation/01-05-public-owner-ui-routes-PLAN.md` next. PR04 admin authority, removal disputes, suppression recovery, operator controls, and protected admin readbacks now exist behind module-owned public exports; keep Convex codegen honest until `CONVEX_DEPLOYMENT` is configured.

## Verification expectation

Phase 1 cannot close until the exact command suite in the plan passes, rendered compact/wide product-design evidence exists for materially changed user-facing surfaces, and deployment/readback smoke covers `/`, `/claim`, `/registry`, `/{slug}`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, and `/admin/*` non-admin denial.

## Session

**Last session:** 2026-06-28T02:14:17.555Z
**Stopped at:** Completed 01-06-registry-search-api-repair-PLAN.md
**Resume file:** None

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P01 | 14 min | 3 tasks | 54 files |
| Phase 01 P02 | 43 min | 8 tasks | 46 files |
| Phase 01 P03 | 32 min | 7 tasks | 25 files |
| Phase 01 P04 | 6h 56m | 6 tasks | 24 files |
| Phase 01 P06 | 37min | 6 tasks | 29 files |

## Decisions

- [Phase 01]: 01-01 completed around the existing root TanStack/Vite scaffold instead of moving to apps/web. — Preserved workspace state and avoided restarting the partial substrate the orchestrator identified.
- [Phase 01]: 01-01 clean guardrail scans exclude the scanner definition file while fixture scans prove banned tokens are detected. — The scanner utility must contain the banned regex tokens it enforces; excluding only that file avoids self-matching without weakening runtime coverage.
- [Phase 01]: Kept Convex schema as a thin composition root over module-owned schema fragments. — Avoids a monolithic schema file while preserving the Convex-required default export.
- [Phase 01]: Left Convex codegen as the real Convex CLI command and recorded the missing deployment as an environment blocker. — Prevents false green checks; codegen can pass only after CONVEX_DEPLOYMENT is configured.
- [Phase 01]: Implemented PR03 behavior through module seams and fail-closed generic Convex wrappers. — Generated Convex server files remain unavailable until `CONVEX_DEPLOYMENT` is configured, so runtime mutation boundaries fail closed while seam-level behavior is tested.
- [Phase 01]: Allowed only same-module `public.ts` files to import their own internal implementations. — This enables owning public seams while route, sibling-module, and cross-module private-import bans remain active.
- [Phase 01]: Implemented PR04 admin, dispute, suppression recovery, and operator controls through source-owned module seams with fail-closed Convex wrappers. — Route guards alone are not authority, and deployment boundaries deny until generated auth/DB wiring exists.
- [Phase 01]: Kept admin route loaders fail-closed with `membership: undefined` readbacks. — Non-admins receive safe denial/readback shells without private rows; source-owned admin resolution is deferred to configured Convex deployment wiring.
- [Phase 01]: Public business APIs return explicit public DTO subsets without private ids, source hashes, MCP/OpenAPI, callable, or payment fields. — The plan stop conditions forbid raw database/private fields and future platform/action/payment surfaces.
- [Phase 01]: Admin index-health generates source/projection/repair rows but denied route reads return no private rows until real membership wiring exists. — This keeps admin readback useful in tests and fail-closed in the unauthenticated runtime shell.
- [Phase 01]: Registry search uses deterministic source-owned catalog DTO projection, not an external search engine. — Phase 1 requires no external search engine or marketplace ranking surface.
