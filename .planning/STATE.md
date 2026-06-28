---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 01
status: executing
stopped_at: Completed 01-13-PLAN.md
last_updated: "2026-06-28T10:03:57.913Z"
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 19
  completed_plans: 13
  percent: 68
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

Execute `.planning/phases/01-ten-star-spine-foundation/01-11-PLAN.md` next. Plan 01-10 added Convex auth/source-state helpers and runtime bridge coverage; route-level durable claim/publish work still needs real Clerk issuer/keys and clean typecheck after unrelated dirty billing work is reconciled.

## Verification expectation

Phase 1 cannot close until the exact command suite in the plan passes, rendered compact/wide product-design evidence exists for materially changed user-facing surfaces, and deployment/readback smoke covers `/`, `/claim`, `/registry`, `/{slug}`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, and `/admin/*` non-admin denial.

## Session

**Last session:** 2026-06-28T10:03:57.896Z
**Stopped at:** Completed 01-13-PLAN.md
**Resume file:** None

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P01 | 14 min | 3 tasks | 54 files |
| Phase 01 P02 | 43 min | 8 tasks | 46 files |
| Phase 01 P03 | 32 min | 7 tasks | 25 files |
| Phase 01 P04 | 6h 56m | 6 tasks | 24 files |
| Phase 01 P06 | 37min | 6 tasks | 29 files |
| Phase 01 P07 | 26min | 6 tasks | 21 files |
| Phase 01 P08 | 35min | 7 tasks | 15 files |
| Phase 01 P09 | 1h 46m | 6 tasks | 4 files |
| Phase 01 P10 | 14min | 3 tasks | 12 files |
| Phase 01 P11 | 21min | 3 tasks | 10 files |
| Phase 01 P13 | 12min | 3 tasks | 5 files |

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
- [Phase 01]: Discovery manifests are AE-hosted fallback documents only; no merchant-origin well-known claim is emitted. — The plan forbids merchant-origin /.well-known/ucp claims and future action/payment protocol overclaims in Phase 1.
- [Phase 01]: llms.txt lists canonical links and source-owned status fields only, not owner-authored free text. — Owner-authored text is excluded from llms.txt to avoid prompt-injection, Markdown, HTML, bidi, and instruction-like prose risk.
- [Phase 01]: Discovery route availability is proven by in-process route-handler parity tests rather than hand-authored static files. — Every URL emitted by manifest, llms, sitemap, and robots must resolve through the shipped route handlers or be omitted.
- [Phase 01]: Browser gates use VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E only at command time because real Clerk keys are absent. — Route rendering could be verified locally without writing fake keys to .env.local or claiming real Clerk proof.
- [Phase 01]: Internal alpha is explicitly not ready until five real friendly-owner activation rows exist. — Plan 01-08 produced instrumentation and a one-owner rehearsal record only; GTM requires five owner evidence rows plus friction/failure notes.
- [Phase 01]: ROADMAP progress update was skipped for Plan 01-08 to avoid mixing pre-existing dirty planning changes. — User explicitly warned not to stage or modify unrelated dirty planning files; ROADMAP.md was already dirty before this execution.
- [Phase 01]: Deploy smoke fails loudly when deployment env, Convex URL, Clerk storage states, or business slug are absent. — A silent skip would create false deploy/readback proof.
- [Phase 01]: Plan 01-10 continued existing dirty Convex bridge work but staged only auth/source-state files and required schema/test support. — Preserved useful partial work while avoiding unrelated billing, Phase 2-5, ROADMAP, and future-surface changes.
- [Phase 01]: Convex actor authority now derives from `ctx.auth.getUserIdentity()` plus source-owned admin membership rows. — Browser-supplied owner/admin/Clerk fields are ignored by the shared authz helper.
- [Phase 01]: Convex codegen proof remains blocked by empty Clerk issuer/keys and rejected outbound codegen network access. — Missing setup is recorded as fail-closed evidence, not a green proof.
- [Phase 01]: Adopted a claim-specific server helper for 01-11 instead of touching unrelated dirty src/lib/server work. — Preserved the dirty-worktree boundary while completing durable claim/readback routing.
- [Phase 01]: Kept 01-11 local e2e bypass command-scoped through VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E. — Production claim/readback authority still requires Clerk-authenticated Convex calls.
- [Phase 01]: Used slug search params for 01-11 success/status readbacks without treating the slug as authority. — The slug selects a public DTO while owner/admin identity remains server-derived.
- [Phase 01]: Skipped ROADMAP.md mutation for 01-11 because ROADMAP.md was already dirty with unrelated planning work. — Avoided staging or overwriting pre-existing Phase 2-5 planning edits.
- [Phase 01]: Public registry/API runtime handlers now call Convex registry query references; legacy synchronous API helper exports are fixture-only for existing guardrail tests. — Preserves dirty-worktree test compatibility while removing route-local default source factories from runtime handlers.

### Blockers

- Phase 01 live deploy/readback remains blocked pending real DEPLOY_BASE_URL, DEPLOY_CONVEX_URL, Clerk admin/owner storage states, and explicit network approval.
- Phase 01 Convex codegen remains blocked pending real VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, CLERK_JWT_ISSUER_DOMAIN, and approved outbound Convex CLI/network access.
- Phase 01 Plan 01-11 Convex codegen verification is auth-gated: npm run check:convex-codegen returns 401 MissingAccessToken until Convex CLI authentication is present.
- Phase 01 Plan 01-11 full public-owner Playwright spec is blocked in this dirty checkout by unrelated untracked src/routes/owner.actions.tsx route-generator overlay; the focused claim-readback regression passes serially.
