---
phase: 01
slug: ten-star-spine-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-27
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest for unit/integration/type-contract scans; Playwright for E2E/a11y/render checks; TypeScript strict build; Convex codegen. |
| **Config file** | `package.json`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `convex/schema.ts` — created in `01-01`/`01-02`. |
| **Quick run command** | `npm run test:unit && npm run test:imports && npm run test:copy && npm run test:ui-contract && npm run test:types && npm run test:ts-standards` |
| **Full suite command** | `npm run typecheck && npm run check:convex-codegen && npm run test:unit && npm run test:integration && npm run test:e2e && npm run test:a11y && npm run test:copy && npm run test:imports && npm run test:source-mining && npm run test:types && npm run test:ts-standards && npm run test:seo && npm run test:ui-contract && npm run build` |
| **Estimated runtime** | Unknown until `01-01` creates runtime scaffold; `01-01` must record first observed quick/full suite duration. |

---

## Sampling Rate

- **After every task commit:** Run the narrowest created command for the touched seam, then the quick run command once the command exists.
- **After every plan wave:** Run the full suite command for all commands that exist by that wave.
- **Before `/gsd:verify-work`:** Full suite plus deployment/readback smoke must be green.
- **Max feedback latency:** target quick run under 90 seconds after `01-01`; if exceeded, split scans into targeted task commands but keep full wave gate.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | R1, R10 | T-source-mining | Backup imports, future-surface symbols, phase-numbered runtime names, and broad TS holes fail before runtime work proceeds. | static/fixture | `npm run test:imports && npm run test:source-mining && npm run test:ts-standards && npm run test:imports:fixtures && npm run test:source-mining:fixtures && npm run test:ts-standards:fixtures` | W0 | pending |
| 01-01-02 | 01-01 | 1 | R4, R10 | T-ui-drift | UI routes cannot ship raw colors, route-local status colors, `transition-all`, local buttons/skeletons/empty states, or future nav/copy. | static/fixture | `npm run test:ui-contract && npm run test:copy && npm run test:ui-contract:fixtures && npm run test:copy:fixtures` | W0 | pending |
| 01-02-01 | 01-02 | 2 | R2, R8, R9 | T-authority | Convex schema, literal unions, validators, branded IDs, admin authority, lifecycle descriptors, and operation keys compile from source-owned contracts. | type/unit/codegen | `npm run typecheck && npm run check:convex-codegen && npm run test:types && npm run test:unit` | after 01-02 | pending |
| 01-03-01 | 01-03 | 3 | R3, R6 | T-claim-abuse | No-ABN claim/publish succeeds only for authenticated owner; CSRF, wrong owner, duplicate, rate limit, empty services, and idempotency failures return typed results and audit. | integration/e2e | `npm run test:integration && npm run test:e2e` | after 01-03 | pending |
| 01-04-01 | 01-04 | 4 | R8 | T-admin-control | Non-admins are denied; support/reviewer permissions are limited; admin bootstrap and operator controls are audited and source-owned. | integration/e2e | `npm run test:integration && npm run test:e2e` | after 01-04 | pending |
| 01-05-01 | 01-05 | 5 | R4, R10 | T-overclaim | Public and owner UI render all required states at compact/wide widths without overclaim copy or inaccessible controls. | e2e/a11y/copy | `npm run test:e2e && npm run test:a11y && npm run test:copy && npm run test:ui-contract` | after 01-05 | pending |
| 01-06-01 | 01-06 | 6 | R5, R6, R8 | T-projection-stale | Registry/API/search use one catalog DTO, exclude suppressed/unpublished records, show forced projection failure, retry without duplicate side effects, and keep registry/admin repair UI accessible. | integration/e2e/a11y/seo | `npm run test:integration && npm run test:e2e && npm run test:a11y && npm run test:seo && npm run test:ui-contract` | after 01-06 | pending |
| 01-07-01 | 01-07 | 7 | R7 | T-agent-injection | UCP/llms/sitemap/robots are generated from eligible source state, route-tested, suppression-aware, prompt-injection inert, and free of callable/payment/MCP/OpenAPI/API-key claims. | integration/seo/copy | `npm run test:integration && npm run test:seo && npm run test:copy` | after 01-07 | pending |
| 01-08-01 | 01-08 | 8 | R10 | T-launch-claim | Full local gate, Fable 5 closeout mapping, Matt Pocock Standards/Spec review prep, claims register, and five-owner GTM internal-alpha evidence are complete; one-owner rehearsal is not alpha-ready. | full/review | full suite command plus review artifacts | after 01-08 | pending |
| 01-09-01 | 01-09 | 9 | R10 | T-deploy-drift | Vercel/Convex/Clerk/readback smoke proves public routes, headers, discovery outputs, admin denial, suppression, kill switches, and no unresolved P0 gaps. | deployment/smoke | `npm run test:deploy-smoke` with `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `SMOKE_ADMIN_STORAGE_STATE`, `SMOKE_OWNER_STORAGE_STATE`, and `SMOKE_BUSINESS_SLUG` | after 01-09 | pending |

*Status: pending, green, red, flaky.*

---

## Wave 0 Requirements

- [ ] `package.json` — non-no-op scripts for every command in this strategy.
- [ ] `tsconfig.json` — strict TypeScript flags from `ENGINEERING-STANDARDS.md`.
- [ ] `vitest.config.ts` — unit/integration/static scan setup with no watch-mode defaults.
- [ ] `playwright.config.ts` — E2E/a11y/render setup, including compact and wide viewport projects.
- [ ] `tests/imports/private-imports.test.ts` — route/module seam scan.
- [ ] `tests/imports/backup-imports.test.ts` — backup path and `.planning` runtime import scan.
- [ ] `tests/imports/source-mining.test.ts` — banned source-mining seed and allowed negative-flag exceptions.
- [ ] `tests/imports/ts-standards.test.ts` — no `any`, unsafe casts, non-null assertions, `v.any()`, broad statuses, or inexact Convex returns.
- [ ] `tests/copy/phase1-banned-copy.test.ts` — no future-capability owner/public copy.
- [ ] `tests/ui-contract/class-scan.test.ts` — no raw route colors, `space-y-*`, `transition-all`, arbitrary visual tokens, local status colors, or route-local scroll listeners.
- [ ] `tests/fixtures/bad-source-mining/*` — fail-first banned backup/payment/callable/MCP/OpenAPI/future-surface cases.
- [ ] `tests/fixtures/bad-ts-standards/*` — fail-first unsafe TypeScript cases.

- [ ] `tests/fixtures/bad-copy/*` — fail-first future-capability and overclaim copy cases.
- [ ] `tests/fixtures/bad-ui-contract/*` — fail-first raw color, local primitive, `space-y-*`, `transition-all`, and future-nav cases.
---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rendered UI quality at compact and wide widths | R4, R8, R10 | Automated a11y and copy scans cannot prove hierarchy, trust, or visual polish. | Capture `/`, `/claim`, `/claim/success`, `/privacy/remove-business`, `/{slug}`, `/registry`, `/admin/claims`, `/admin/index-health`, and `/admin/audit-events` at 375px and wide desktop; compare against `01-UI-SPEC.md`, `DESIGN.md`, and `FRONTEND-DESIGN-FRAMEWORK.md`; record evidence in phase summary. |
| Friendly-owner internal alpha gate | R10 | Requires real owner attempts and observed friction. | To claim internal alpha, record five friendly-owner attempts with activation-state rows, copy/share or consented next-capability interest, and friction/failure notes; a one-owner rehearsal may be recorded only as not alpha-ready. |
| Matt Pocock two-axis review | R10 | Review is judgment-based across Standards and Spec axes. | Run `/mattpocock-review`; keep Standards and Spec findings separate; fix or explicitly record every finding. |
| Fable 5 closeout mapping | R10 | Confirms accepted docs-auto findings were not lost in execution. | Re-run or manually map Fable 5 findings to implementation evidence; record owner, disposition, source/spec link, and remaining risk. |
| Deployment/readback smoke | R10 | Requires deployed Vercel/Convex/Clerk environment and public HTTP behavior. | Run `npm run test:deploy-smoke` against live/preview URLs for `/`, `/claim`, `/claim/success`, `/privacy/remove-business`, `/registry`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/admin/*` non-admin denial, cache/content-type/CORS headers, suppression, kill switches, and Convex/Clerk readback. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify commands or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all missing test infrastructure.
- [ ] No watch-mode flags.
- [ ] Feedback latency measured after runtime scaffold exists.
- [ ] `nyquist_compliant: true` set in frontmatter only after runtime validation infrastructure exists and this map has no W0 gaps.

**Approval:** pending runtime scaffold.
