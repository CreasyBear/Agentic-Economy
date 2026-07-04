---
phase: 01
plan: 04
slug: admin-dispute-operator-recovery
status: ready-for-execution
wave: 4
depends_on: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress]
requirements: [R6, R8, R10]
created: 2026-06-27
---

# 01-04 — Admin, Dispute, Operator Recovery Plan

## Objective

Add source-owned admin authority, owner contention/recovery, privacy removal, audited suppression/unsuppression, operator kill switches, and protected admin readback shells before public indexing/discovery is exposed.

## Authority Inputs

- `01-SPEC.md` R8 and suppression/readback acceptance.
- `PHASE.md` PR04.
- `01-PATTERNS.md` clusters 9, 10, 13, 14.
- `.planning/SECURITY-SPEC.md` roles, trust boundaries, redaction, audit, and prompt-injection rules.
- `01-UI-SPEC.md` admin route contracts.
- Skills: `clerk-tanstack-patterns`, `convex-setup-auth`, `tanstack-start-best-practices`, `tanstack-router-best-practices`, `accessibility`, `product-design`.

## Scope

### In

- Admin membership grant/revoke/bootstrap enforcement with role/action matrix.
- `/admin/claims`, `/admin/audit-events`, `/admin/index-health` protected shells with real denial/readback paths and minimal operational data available so far.
- `/privacy/remove-business` route or server seam for removal/dispute submission and admin adjudication.
- Operator controls: `claims_enabled`, `publish_enabled`, `registry_enabled`, `discovery_enabled`, `public_copy_safe_mode`.
- Audit and redaction for every admin/operator/suppression/dispute action.

### Out

- No public discovery files/routes yet.
- No broad admin console, payments, provider controls, action approval, customer inbox, or notification center.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-04-A | Implement role/action matrix and preauthorized bootstrap/grant/revoke mutations. | `src/modules/security/internal/admin-authority.ts`, `convex/security.ts`, tests | Bootstrap requires explicit source-owned local config such as `ADMIN_BOOTSTRAP_PRINCIPAL_IDS` or a one-time grant; arbitrary first authenticated caller is denied; second bootstrap denied; support/reviewer destructive actions denied. |
| 01-04-B | Add admin route guards at UX and server/Convex layers. | `apps/web` admin routes, route/server functions | Non-admin gets 401/403 and no private data; route guard is not the only enforcement. |
| 01-04-C | Implement disputes/removal workflow with public-write abuse controls. | `src/modules/security/internal/disputes.ts`, `convex/security.ts`, `/privacy/remove-business` route | Removal intake rate-limits, dedupes/contact-hashes, caps evidence size/type, uses CSRF/same-site checks for session-bearing submissions, records idempotent `dispute:open`, keeps evidence out of public indexes, and makes disputes auditable/reconstructable. |
| 01-04-D | Implement suppression/unsuppression admin flow with reason/evidence. | business/security modules, admin routes | Emergency suppression requires reason/evidence, writes audited source-owned status, hides public catalog reads, and queues invalidation/readback. |
| 01-04-E | Implement operator controls and readback. | `src/modules/observability/internal/operator-controls.ts`, `convex/observability.ts`, admin route | Each control has actor, reason, expiry, audit, readback, and behavior test. |
| 01-04-F | Add admin queue and audit shells using AE components. | `src/components/ae/*`, admin routes | Admin UI shows object/source state/surface/readback/attempt/repair/correlation ID where data exists. |

## Product Design Pass

- **Primary user/job/object/outcome:** operator/admin resolves unsafe exposure or ownership dispute; object is business/public surface; outcome is a visible, audited repair path before public discovery can leak.
- **States:** non-admin denied, no queue items, pending claim, contested claim, suppressed, stale projection, repair unavailable, control enabled/disabled/expired, and public removal states for empty form, invalid evidence, submitted, duplicate, contested, suppressed, error, and preserved input.
- **Consequence copy:** destructive actions and removal requests name target, scope, reason/evidence, public effect, response expectation, reversibility, and audit permanence.
- **Accessibility:** admin queues and `/privacy/remove-business` use headings, labels/errors, preserved inputs, tables/lists with labels, keyboard-operable controls, visible focus, compact/wide proof, and no color-only status.

## Verification

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:copy
npm run test:ui-contract
npm run test:imports
npm run test:ts-standards
```

## Stop Conditions

- Any admin action can succeed through env/session/route guard alone.
- Suppression/removal lacks reason/evidence/audit/readback.
- Public routes can be exposed before operator controls exist.
- Admin UI displays raw private payloads, contact PII, cookies, tokens, provider secrets, or owner text as trusted instructions.
