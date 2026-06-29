---
phase: 04-owner-pending-protected-actions
plan: 01
subsystem: protected-actions
tags: [tanstack-start, convex, owner-approval, protected-action, contact-follow-up, source-readback]
requires:
  - phase: 02-human-inquiry-owner-inbox
    provides: Phase 2 inquiry/source-message, owner inbox, notification/outbox, and reconstruction evidence used to select contact follow-up.
  - phase: 03-standard-agent-builder-discovery
    provides: Read-only discovery posture and explicit non-mutation boundary; no deployed Phase 3 proof claimed here.
provides:
  - Exactly one selected non-money protected action class: owner-approved customer contact follow-up request.
  - Source-owned proposal, policy, owner decision, one-use gateway, attempt, receipt/proof-gap, retention, support, and reconstruction modules.
  - Owner queue/detail/receipt routes and admin reconstruction routes for contact follow-up only.
  - Focused unit, integration, type, copy, UI-contract, SEO, build, codegen, and Playwright evidence.
affects: [phase-04, phase-05, owner-routes, admin-routes, observability, copy-scans]
tech-stack:
  added: []
  patterns:
    - Selected-action-specific protected-action seams instead of a generic action registry.
    - Source-owned readback reconstruction with private evidence refs redacted by retention policy.
    - Route copy and discovery posture gated by copy/source-mining scans.
key-files:
  created:
    - .planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md
    - convex/protectedActions.ts
    - src/modules/protected-action/public.ts
    - src/modules/protected-action/internal/contact-follow-up.ts
    - src/modules/protected-action/internal/schema.ts
    - src/routes/owner.actions.tsx
    - src/routes/owner.actions.$proposalId.tsx
    - src/routes/owner.actions.$proposalId.receipt.tsx
    - src/routes/admin.protected-actions.tsx
    - src/routes/admin.protected-actions.$proposalId.tsx
    - tests/copy/phase4-protected-action-claims.test.ts
    - tests/e2e/protected-action-owner-flow.spec.ts
    - tests/e2e/a11y/protected-action-a11y.spec.ts
  modified:
    - .planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md
    - .planning/GTM-READINESS.md
    - .planning/SECURITY-SPEC.md
    - convex/schema.ts
    - src/lib/ui/contract-scans.ts
    - src/lib/ui/status-presentation.ts
    - src/modules/observability/public.ts
    - src/modules/observability/internal/audit.ts
    - src/modules/observability/internal/funnel.ts
    - src/modules/observability/internal/operator-controls.ts
    - src/routeTree.gen.ts
key-decisions:
  - "Selected `contact-follow-up` from Phase 2 inquiry/owner-inbox evidence as the only Phase 4 action class."
  - "Kept route-facing names selected-action-specific; no generic `proposeAction`, action registry, provider marketplace, or action DSL shipped."
  - "Recorded Phase 4 proof as local/source evidence only; no deployed Phase 4 proof and no Phase 2 provider-smoke closeout claimed."
patterns-established:
  - "Owner approval gates a one-use selected-action gateway before any attempt readback."
  - "Attempts require proposal, policy, owner decision, gateway, audit, and receipt/proof-gap chain."
  - "Retention deletes redact private refs while preserving source hashes and tombstone readback."
requirements-completed: [R1, R2, R3, R4, R5, R6, R7, R8]
coverage:
  - id: D1
    description: "Contact follow-up action selection and UI contract"
    requirement: R1
    verification:
      - kind: unit
        ref: "tests/unit/protected-action/selected-action-contract.test.ts"
        status: pass
      - kind: other
        ref: "npm run test:copy"
        status: pass
    human_judgment: false
  - id: D2
    description: "Selected-action source state, policy, gateway, retention, support, and reconstruction"
    requirement: R2
    verification:
      - kind: unit
        ref: "tests/unit/protected-action/owner-action-flow.test.ts"
        status: pass
      - kind: unit
        ref: "tests/unit/protected-action/selected-action-gateway.test.ts"
        status: pass
      - kind: unit
        ref: "tests/unit/protected-action/selected-action-retention-support.test.ts"
        status: pass
      - kind: integration
        ref: "tests/integration/protected-action-route-readbacks.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner/admin selected-action routes and noindex/copy posture"
    requirement: R4
    verification:
      - kind: e2e
        ref: "playwright test tests/e2e/protected-action-owner-flow.spec.ts tests/e2e/a11y/protected-action-a11y.spec.ts"
        status: pass
      - kind: other
        ref: "npm run test:seo"
        status: pass
      - kind: other
        ref: "npm run test:ui-contract"
        status: pass
    human_judgment: false
duration: "not recorded at executor start; completed evidence at 2026-06-29T05:45:00Z"
completed: 2026-06-29
status: complete
commit_metadata: pending sprint commit
---

# Phase 4 Plan 01: One Owner-Approved Protected Action Summary

**Owner-approved contact follow-up with source-owned proposal, approval, one-use gateway, receipt/proof-gap readback, retention, support gating, and route reconstruction.**

## Performance

- **Duration:** Not recorded at executor start; execution completed by 2026-06-29T05:45:00Z.
- **Tasks:** 9/9 plan tasks completed.
- **Commit policy:** Pending sprint commit. No staging, commits, pushes, or git ref/index writes were performed.
- **State policy:** `.planning/STATE.md` and `.planning/ROADMAP.md` were not updated by this executor.

## Accomplishments

- Created `04-ACTION-SELECTION.md` selecting exactly one observed action: `contact-follow-up`, backed by Phase 2 inquiry/owner-inbox evidence.
- Implemented selected-action-only source state and schema for proposal, policy, owner decision, gateway admission, attempts, receipts/proof gaps, private evidence refs, support records, retention, and reconstruction.
- Added owner queue/detail/receipt and admin reconstruction routes with noindex posture and copy guarded against broad action, autonomous, provider-market, and money claims.
- Extended observability/operator-control/funnel/copy/status scans for Phase 4 without claiming deployed proof.

## Task Metadata

1. **04-01-T01 Select action** - `pending sprint commit`
2. **04-01-T02 Amend UI spec** - `pending sprint commit`
3. **04-01-T03 Source state/audit/retention/operator controls** - `pending sprint commit`
4. **04-01-T04 Proposal and policy seam** - `pending sprint commit`
5. **04-01-T05 Gateway, attempt, reconstruction** - `pending sprint commit`
6. **04-01-T06 Owner/operator surfaces** - `pending sprint commit`
7. **04-01-T07 Support record, funnel, kill rules** - `pending sprint commit`
8. **04-01-T08 Copy/discovery/SEO guardrails** - `pending sprint commit`
9. **04-01-T09 Closeout tests and smoke scenarios** - `pending sprint commit`

## Verification Results

- `npm run typecheck` - passed.
- `npm run test:unit` - passed: 41 files, 185 tests.
- `npm run test:integration` - passed: 10 files, 31 tests.
- `npm run test:types` - passed: 2 files, 6 tests.
- `npm run test:imports` - passed: 3 files, 3 tests.
- `npm run test:source-mining` - passed: 1 file, 2 tests.
- `npm run test:ts-standards` - passed: 1 file, 1 test.
- `npm run test:copy` - passed: 4 files, 32 tests.
- `npm run test:seo` - passed: 4 files, 11 tests.
- `npm run test:ui-contract` - passed: 3 files, 4 tests.
- `npm run build` - passed after final route fix.
- `npm run check:convex-codegen` - sandboxed run failed on DNS for Convex/Sentry fetch; rerun with approved network escalation passed dry-run and reported generated files it would write.
- Focused Playwright: `./node_modules/.bin/playwright test tests/e2e/protected-action-owner-flow.spec.ts tests/e2e/a11y/protected-action-a11y.spec.ts` - sandboxed run failed on `listen EPERM 127.0.0.1`; rerun with approved local-server escalation passed: 6 tests across compact/wide projects.

## Files Created/Modified

- `.planning/phases/04-owner-pending-protected-actions/04-ACTION-SELECTION.md` - selected action decision record.
- `.planning/phases/04-owner-pending-protected-actions/04-UI-SPEC.md` - selected-action-specific UI/copy contract.
- `.planning/GTM-READINESS.md` and `.planning/SECURITY-SPEC.md` - Phase 4 local/source claim and security posture updates; no deployed proof claimed.
- `convex/schema.ts`, `convex/protectedActions.ts`, `src/modules/protected-action/internal/schema.ts` - Phase 4 schema/descriptor surfaces.
- `src/modules/protected-action/**` - selected contact follow-up contract, policy, gateway, attempt/readback, reconstruction, retention, support, validators, and public seam.
- `src/routes/owner.actions*`, `src/routes/admin.protected-actions*`, `src/routeTree.gen.ts` - owner/admin selected-action routes.
- `src/lib/ui/contract-scans.ts`, `src/lib/ui/status-presentation.ts`, observability modules - status, copy/source, audit/funnel/operator-control guardrails.
- `tests/unit/protected-action/*`, `tests/integration/protected-action-route-readbacks.test.ts`, `tests/types/protected-actions-contracts.test.ts`, `tests/copy/phase4-protected-action-claims.test.ts`, `tests/ui-contract/protected-action-status-copy.test.ts`, `tests/seo/protected-action-noindex.test.ts`, `tests/e2e/protected-action-owner-flow.spec.ts`, `tests/e2e/a11y/protected-action-a11y.spec.ts` - focused proof.

## Decisions Made

- Chose contact follow-up because Phase 2 already has inquiry/source-message and owner review evidence; Phase 3 remains read-only and did not provide mutation authority.
- Kept Convex route descriptor read-only and selected-action-specific; no generic mutation gateway or action catalog was introduced.
- Kept proof local/source-only. This summary does not claim deployed Phase 4 proof, deployed Phase 3 proof, or final Phase 2 deploy/provider smoke closeout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nested receipt route rendered the parent detail route**
- **Found during:** Focused Playwright protected-action E2E.
- **Issue:** `/owner/actions/:proposalId/receipt` matched the nested route tree but the parent detail component lacked an outlet path for the child.
- **Fix:** Added nested child rendering in `src/routes/owner.actions.$proposalId.tsx`.
- **Verification:** Focused Playwright rerun passed 6/6; final `npm run build` passed.
- **Commit:** pending sprint commit.

**2. [Rule 2 - Critical copy guardrail] Phase 4 planning copy used negative exclusions the scanner did not recognize**
- **Found during:** `npm run test:copy`.
- **Issue:** Some negative future-surface exclusions were worded as prose rather than scanner-recognized unavailable/out-of-scope clauses.
- **Fix:** Tightened `04-ACTION-SELECTION.md` and `04-UI-SPEC.md` wording and updated the copy test to allow explicit negative exclusions while rejecting positive claims.
- **Verification:** `npm run test:copy` passed 4 files / 32 tests.
- **Commit:** pending sprint commit.

## Issues Encountered

- `npm run check:convex-codegen` initially failed under restricted network on `getaddrinfo ENOTFOUND o1192621.ingest.sentry.io`; approved network escalation passed.
- Focused Playwright initially failed under sandboxed local binding with `listen EPERM 127.0.0.1`; approved local-server escalation passed.
- Pre-existing dirty worktree entries, including `.planning/STATE.md`, `.planning/ROADMAP.md`, `output/`, and Phase 2/3/5 artifacts, were left untouched.

## Known Stubs

None found that block this plan's selected-action source/local objective. The owner/admin routes render from source-owned readback helpers and deterministic empty state when no contact-follow-up proposals exist; tests inject source state to verify populated reconstruction paths.

## Threat Flags

No unplanned threat flags. New trust-boundary surfaces are the planned Phase 4 Convex schema/descriptor, owner/admin routes, gateway/attempt readback, private evidence refs, and retention/support modules, with mitigations covered by selected-action-only seams, noindex route posture, operator controls, copy/source scans, redaction, and source-hash reconstruction tests.

## Next Phase Readiness

- Phase 4 has local/source proof for exactly one owner-approved, non-money protected action class.
- Phase 2 deployed support/provider smokes remain open; this summary does not close them.
- Phase 3 local/source verification remains the evidence basis; this summary does not claim deployed Phase 3 proof.
- Any public launch claim still needs orchestrator/verifier review and evidence handling after the sprint commit.

## Self-Check: PASSED

- Summary file exists: `.planning/phases/04-owner-pending-protected-actions/04-01-SUMMARY.md`.
- Key created files exist: `04-ACTION-SELECTION.md`, `convex/protectedActions.ts`, `src/modules/protected-action/public.ts`, owner/admin protected-action routes, and focused tests.
- No commits were expected or created; task metadata is `pending sprint commit`.
