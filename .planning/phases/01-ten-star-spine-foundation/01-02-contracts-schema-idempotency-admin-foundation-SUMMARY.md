---
phase: 01-ten-star-spine-foundation
plan: 02
subsystem: contracts-schema-security-observability
tags: [convex, schema, typescript, validators, idempotency, audit, admin, lifecycle, gtm]

requires:
  - phase: 01-ten-star-spine-foundation
    provides: TanStack/Convex substrate, strict TypeScript, executable guardrail scanners, and Phase 1 authority docs
provides:
  - Domain-owned branded IDs, literal state unions, validators, and public module seams
  - Module-owned Convex schema fragments composed by a thin `convex/schema.ts`
  - Durable operation-key reserve/replay/reject contract with tests
  - Typed audit/redaction contract and source-owned admin role/action matrix
  - Descriptor-only lifecycle primitives and owner activation/funnel contracts
affects: [phase-01, contracts, schema, security, observability, lifecycle, gtm]

tech-stack:
  added: []
  patterns:
    - Module-owned `internal/schema.ts` table fragments with `convex/schema.ts` as composition root
    - Tuple-owned state values with Zod validators and Convex literal validators derived from the same constants
    - Pure module seam tests for operation keys, audit/redaction, admin authority, lifecycle, and activation state

key-files:
  created:
    - convex/schema.ts
    - src/modules/common/ids.ts
    - src/modules/common/result.ts
    - src/modules/common/convex-literals.ts
    - src/modules/business/public.ts
    - src/modules/catalog/public.ts
    - src/modules/registry/public.ts
    - src/modules/discovery/public.ts
    - src/modules/observability/public.ts
    - src/modules/security/public.ts
    - src/modules/lifecycle/public.ts
    - src/modules/*/internal/schema.ts
    - src/modules/*/internal/validators.ts
    - src/modules/observability/internal/operation-keys.ts
    - src/modules/observability/internal/audit.ts
    - src/modules/observability/internal/redaction.ts
    - src/modules/observability/internal/funnel.ts
    - src/modules/security/internal/admin-authority.ts
    - src/modules/lifecycle/internal/reference-vertical.ts
    - tests/types/domain-contracts.test.ts
    - tests/unit/schema/convex-schema.test.ts
    - tests/unit/observability/operation-keys.test.ts
    - tests/unit/observability/audit-redaction.test.ts
    - tests/unit/observability/funnel.test.ts
    - tests/unit/security/admin-authority.test.ts
    - tests/unit/lifecycle/lifecycle-descriptor.test.ts
  modified:
    - src/lib/ui/contract-scans.ts

key-decisions:
  - "Kept `convex/schema.ts` as a thin composition root over module-owned schema fragments, avoiding a monolithic schema file while preserving Convex's required default export."
  - "Allowed only `convex/schema.ts` to import module `internal/schema` fragments; route and sibling-module private import guardrails remain active."
  - "Implemented Convex boundary files as type-only seams for this plan, avoiding unshipped Convex query/mutation behavior."
  - "Recorded `npm run check:convex-codegen` as blocked by missing `CONVEX_DEPLOYMENT`; the command remains the real Convex CLI."

patterns-established:
  - "Domain state pattern: `<State>Values` tuple, exported union type, Zod validator, and Convex literal validator derived from the tuple."
  - "Idempotency pattern: reserve new operation keys, replay same-key/same-hash successes, reject same-key/different-hash conflicts, and return retryable in-progress state."
  - "Authority pattern: Clerk/session identity is not admin authority; source-owned active membership plus role/action matrix is required."

requirements-completed: [R2, R8, R9, R10]

coverage:
  - id: D1
    description: "Domain-owned branded IDs, exact state unions, validators, public module seams, and compile-time type equality tests."
    requirement: R2
    verification:
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: unit
        ref: "npm run test:types"
        status: pass
      - kind: unit
        ref: "npm run test:ts-standards"
        status: pass
    human_judgment: false
  - id: D2
    description: "Phase 1 Convex schema tables and indexes, owned by module schema fragments and composed by `convex/schema.ts`."
    requirement: R2
    verification:
      - kind: unit
        ref: "tests/unit/schema/convex-schema.test.ts"
        status: pass
      - kind: other
        ref: "npm run check:convex-codegen"
        status: unknown
    human_judgment: true
    rationale: "Convex codegen is blocked until `CONVEX_DEPLOYMENT` is configured; table/index authority is proven by local schema serialization tests."
  - id: D3
    description: "Operation-key, audit, redaction, funnel event, and owner activation contracts."
    requirement: R2
    verification:
      - kind: unit
        ref: "npm run test:unit"
        status: pass
    human_judgment: false
  - id: D4
    description: "Source-owned admin role/action matrix, bootstrap guard, and descriptor-only lifecycle primitives with a reference vertical descriptor."
    requirement: R8
    verification:
      - kind: unit
        ref: "npm run test:unit"
        status: pass
    human_judgment: false

duration: 43 min
completed: 2026-06-27
status: complete
---

# Phase 01 Plan 02: Contracts, Schema, Idempotency, Admin Foundation Summary

**Module-owned Phase 1 contracts, Convex schema/index authority, idempotency, audit, admin, lifecycle, and activation-state primitives.**

## Performance

- **Duration:** 43 min
- **Started:** 2026-06-27T13:52:00Z
- **Completed:** 2026-06-27T14:34:42Z
- **Tasks:** 8 plan items across 3 task commits
- **Files modified:** 46 tracked implementation/test files

## Accomplishments

- Added branded IDs, exact state unions, Zod validators, Convex literal validators, and public seams for business, catalog, registry, discovery, observability, security, lifecycle, and SEO.
- Added the Phase 1 Convex durable model with exactly the approved tables and required indexes, split into module-owned schema fragments.
- Implemented and tested operation-key reserve/replay/reject semantics, typed audit/redaction requirements, source-owned admin authority, descriptor-only lifecycle primitives, and owner activation/funnel state transitions.

## Task Commits

1. **Contracts, validators, and module-owned Convex schema** - `b89171e` (feat)
2. **Operation keys, audit/redaction, and funnel contracts** - `c60cc89` (feat)
3. **Admin authority and lifecycle descriptors** - `4842032` (feat)

## Files Created/Modified

- `convex/schema.ts` - Thin schema composition root.
- `src/modules/*/internal/schema.ts` - Module-owned Convex table/index fragments.
- `src/modules/*/public.ts` - Domain-owned public contract seams.
- `src/modules/*/internal/validators.ts` - Domain-owned Zod validators.
- `src/modules/common/*` - Branded IDs, result helpers, and Convex literal helper.
- `src/modules/observability/internal/*` - Operation-key, audit/redaction, and funnel/activation contracts.
- `src/modules/security/internal/admin-authority.ts` - Source-owned admin role/action matrix and bootstrap guard.
- `src/modules/lifecycle/internal/reference-vertical.ts` - Descriptor-only reference vertical.
- `tests/types/domain-contracts.test.ts` - Validator/type equality and invalid-state type checks.
- `tests/unit/**` - Schema, observability, admin, and lifecycle contract tests.
- `src/lib/ui/contract-scans.ts` - Narrow import-scan allowance for `convex/schema.ts` module schema composition.

## Decisions Made

- `convex/schema.ts` remains only the Convex-required default export composition root; table definitions live under owning modules.
- Convex boundary files are type-only in this plan, because later plans own public route behavior, claim mutation flow, projection execution, and discovery generation.
- The import scanner now permits only `convex/schema.ts` to import `src/modules/*/internal/schema`; all route and sibling-module private imports remain blocked.

## Verification

| Command | Result | Notes |
|---|---:|---|
| `npm run typecheck` | PASS | Strict TypeScript completed. |
| `npm run check:convex-codegen` | BLOCKED | Convex CLI failed: `No CONVEX_DEPLOYMENT set, run npx convex dev to configure a Convex project`. |
| `npm run test:types` | PASS | 1 file, 3 tests passed. |
| `npm run test:unit` | PASS | 7 files, 13 tests passed. |
| `npm run test:ts-standards` | PASS | Clean TypeScript standards scan passed. |
| `npm run test:imports` | PASS | Clean import guardrails passed. |
| `npm run test:source-mining` | PASS | Clean source-mining guardrail passed. |
| `npm run test:copy` | PASS | Public copy guardrail passed. |
| `npm run test:imports:fixtures` | PASS | Bad import fixtures still detected. |
| `npm run test:source-mining:fixtures` | PASS | Bad source-mining fixtures still detected. |
| `npm run test:ts-standards:fixtures` | PASS | Bad TS standards fixtures still detected. |
| `npm run test:ui-contract` | PASS | UI contract scan still passes after scanner change. |
| `npm run build` | PASS | Client and SSR builds completed. |

## Deviations from Plan

None - plan executed within scope. The schema was implemented as module-owned fragments per the deep-module pattern rather than as a monolithic schema file.

## Issues Encountered

- `npm run check:convex-codegen` remains blocked by missing Convex deployment configuration. Exact CLI error: `No CONVEX_DEPLOYMENT set, run npx convex dev to configure a Convex project`.
- `.planning/REQUIREMENTS.md` is absent in this repo, so requirement IDs from the plan frontmatter could not be marked in a requirements file.
- Existing unrelated untracked planning/context files were left untouched.

## Known Stubs

None blocking this plan. The `convex/*.ts` files added here are type-only boundary seams by design; later plans own Convex query/mutation behavior.

## User Setup Required

Convex deployment configuration is required before `npm run check:convex-codegen` can pass. The real command is still wired and was not replaced with a no-op.

## Next Phase Readiness

Ready for `01-03-business-claim-publish-suppress-PLAN.md`. The next plan can build claim/publish/suppress behavior against source-owned contracts, schema tables, operation-key semantics, audit contracts, and admin authority primitives.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/01-ten-star-spine-foundation/01-02-contracts-schema-idempotency-admin-foundation-SUMMARY.md`.
- Key files exist: `convex/schema.ts`, `src/modules/business/public.ts`, `src/modules/observability/internal/operation-keys.ts`, `src/modules/security/internal/admin-authority.ts`, `src/modules/lifecycle/public.ts`, and `tests/types/domain-contracts.test.ts`.
- Task commits exist: `b89171e`, `c60cc89`, and `4842032`.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-27*
