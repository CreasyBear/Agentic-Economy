# P2-P5 Production Maturity Plan Review

**Created:** 2026-06-28
**Scope:** P2-P5 planning bundle created after the production-maturity discussion.
**Mode:** Internal GSD fallback review. External GSD reviewer CLIs were not available on `PATH`, and `workflow.plan_review_convergence` is not enabled, so this is not an official external-CLI convergence run.
**Verdict:** Ready as a GSD-executable P2-P5 planning bundle after the Phase 1 closeout gate produces its source-owned proof. No current high/actionable plan blockers remain in the reviewed files.

CYCLE_SUMMARY: current_high=0 current_actionable=0

## Reviewed artifacts

- `.planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md`
- `.planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md`
- `.planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md`
- `.planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md`
- `.planning/phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md`
- `.planning/phases/04-owner-pending-protected-actions/04-SPEC.md`
- `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md`
- `.planning/phases/05-paid-activation-money-rails/05-SPEC.md`
- `.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md`
- `.planning/phases/03-standard-agent-builder-discovery/03-UI-SPEC.md`
- `.planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md`
- `.planning/phases/05-paid-activation-money-rails/05-UI-SPEC.md`
- `.planning/SECURITY-SPEC.md`
- `.planning/GTM-READINESS.md`
- `.planning/ROADMAP.md`
- `src/lib/ui/contract-scans.ts`
- `tests/copy/claims-register.test.ts`
- current `src/modules/**`, `src/routes/**`, and `tests/**` listings used by plan allowlists.

## Resolution pass

### Structural execution contract

- Converted the shared P2-P5 frame and the P2, P3, P4, and P5 execution plans to the GSD verifier contract: YAML frontmatter, concrete `<task>` blocks, `<read_first>`, `<files>`, `<action>`, `<acceptance_criteria>`, `<verify>`, `<done>`, `must_haves`, and `Artifacts this phase produces`.
- Verified all five plan files with `gsd-tools verify plan-structure --raw`; each returned `valid`.
- Verified all five plan files with `gsd-tools verify key-links`; each returned `all_verified: true`.

### Source-owned shared substrate

- Shared plan now forces P2 before P3 before P4 before P5 and adds a substrate task for P2-P5 audit events, target types, state-changing events, operator controls, funnel events, status presentation, capability support records, and claim evidence before phase-specific runtime work depends on them.
- P2/P3/P4/P5 closeouts include current package guardrails: `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm run test:a11y`, `npm run test:types`, `npm run test:imports`, `npm run test:source-mining`, `npm run test:ts-standards`, `npm run test:copy`, `npm run test:seo`, `npm run test:ui-contract`, and `npm run build` unless a plan document records a source-grounded replacement.

### Phase-boundary and authority fixes

- P2 plan now keeps retry/no-repair controls behind `owner_admin` or explicit source-owned operator permission, while normal owners get delivery readback only.
- P2 plan now carries owner reply delivery, webhook held/unbound handling, customer-safe status/support tokens, privacy/export/delete/tombstone behavior, and CSRF/Origin mutation checks.
- P3 plan now keeps optional API-key/OpenAPI/MCP projection rows gated behind explicit source-owned projection evidence, adds the UI-contract test target, and treats future platform rows as unavailable/deferred until accepted.
- P4 SPEC and plan now require selected-action-specific proposal seams; route-facing generic `proposeAction`/registry-style contracts remain prohibited.
- P4 plan now includes the SEO test target needed by its public-claim acceptance criteria.
- P5 SPEC now locks the rail to Autumn Cloud + Stripe PSP, with direct Stripe subscription authority only as an evidence-backed Autumn-blocker fallback; Connect, x402, wallet, credits, custody, split payout, marketplace settlement, provider-specific billing IDs, and rail-specific core fields stay out of core business/catalog/registry/discovery state.
- P5 plan now routes public/owner/admin billing projections through `src/modules/billing/public.ts`, keeps owner checkout/portal starts owner-only, and limits admin/operator work to reconciliation/readback/rollback/support.
- P5 UI spec now keeps unsupported money rails in explicit out-of-scope copy recognized by the claim scanner.

### Claim and copy guardrails

- `src/lib/ui/contract-scans.ts` now rejects generic live booking/payment claims, route-form `/.well-known/ucp`, standalone OpenAPI claims, and standalone money-rail terms such as balance and Connect outside approved negative/planning contexts.
- `tests/copy/claims-register.test.ts` includes mixed positive/negative and future-capability fixtures for those scanner boundaries.
- Copy scan targets cover route, component, UI copy, catalog/registry/discovery/SEO modules, GTM/SEO/AEO/discovery/API-doc/launch-planning assets, and generated public artifacts while keeping phase-owned planning fixtures explicit.

## Verification run

Observed local checks after the resolution pass:

- `node .codex/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md --raw` → `valid`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md --raw` → `valid`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md --raw` → `valid`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md --raw` → `valid`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify plan-structure .planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md --raw` → `valid`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify key-links .planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md` → `all_verified: true`, `verified: 3`, `pending: 0`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify key-links .planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md` → `all_verified: true`, `verified: 3`, `pending: 0`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify key-links .planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md` → `all_verified: true`, `verified: 3`, `pending: 0`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify key-links .planning/phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md` → `all_verified: true`, `verified: 3`, `pending: 0`
- `node .codex/gsd-core/bin/gsd-tools.cjs verify key-links .planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` → `all_verified: true`, `verified: 3`, `pending: 0`
- `npm run test:copy` → 3 files passed, 28 tests passed
- `npm run test:ts-standards` → 1 file passed, 1 test passed
- `npm run test:source-mining` → 1 file passed, 2 tests passed
- `npm run test:ui-contract` → 2 files passed, 2 tests passed
- `npm run typecheck` → `tsc --noEmit` exited 0

## Residual gating

- This remains an internal fallback review, not an official external-CLI convergence run, because external reviewer CLIs were not available on `PATH` and `workflow.plan_review_convergence` is not enabled.
- P2 execution remains gated by the Phase 1 closeout evidence path named in the shared plan. The planning bundle is ready for that handoff; it does not claim Phase 1 runtime proof exists.
