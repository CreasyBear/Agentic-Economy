---
phase: 01-ten-star-spine-foundation
plan: 10
subsystem: convex-auth-source-state
tags: [convex, clerk, authz, source-state, codegen, registry, discovery]
requires:
  - phase: 01-ten-star-spine-foundation
    provides: Phase 1 schema, claim/publish seams, admin authority contracts, registry/discovery generators, and fail-closed Convex boundaries
provides:
  - Convex-side Clerk actor resolution helper and source-owned admin authority lookup
  - Convex source-state load/persist adapter coverage for Phase 1 rows
  - Runtime bridge coverage for authenticated claim, publish, registry detail, and discovery readback rows
  - Explicit setup evidence for missing Clerk issuer/keys and network-gated Convex codegen
affects: [phase-01, convex, auth, source-state, registry, discovery, verification]
tech-stack:
  added: []
  patterns:
    - Shared Convex auth helper derives owner/admin authority from `ctx.auth.getUserIdentity()` and active source-owned membership rows
    - Generic source-state adapters map Convex rows to module-shaped state without `_id` leakage
    - Focused Convex unit tests isolate Plan 01-10 behavior from unrelated dirty future-surface work
key-files:
  created:
    - convex/authz.ts
    - convex/source-state.ts
    - tests/unit/convex/phase1-runtime.test.ts
  modified:
    - convex/business.ts
    - convex/catalog.ts
    - convex/discovery.ts
    - convex/registry.ts
    - src/modules/business/internal/schema.ts
    - src/modules/catalog/internal/schema.ts
    - src/modules/discovery/internal/schema.ts
    - tests/unit/convex/authz.test.ts
    - tests/unit/convex/source-state.test.ts
key-decisions:
  - "Continued useful pre-existing dirty Plan 01-10 Convex bridge work instead of discarding it, then added the missing authz/source-state helper seams and focused tests."
  - "Kept admin/operator/suppression paths fail-closed unless source-owned membership and generated deployment wiring prove authority."
  - "Did not stage unrelated dirty billing, Phase 2-5, route, ROADMAP, or future-surface observability work."
patterns-established:
  - "Convex owner actor pattern: `resolveBusinessActor(ctx, payload)` ignores browser authority fields and returns authenticated owner only from Clerk identity."
  - "Convex admin authority pattern: `resolveAdminAuthority(ctx, action)` requires an active `adminMemberships` row plus the existing role/action matrix."
  - "Source-state writeback pattern: table-specific selectors upsert operation keys, audit rows, registry/discovery attempts, disputes, suppression, and operator-control records idempotently."
requirements-completed: [R2, R3, R8, R10]
coverage:
  - id: D1
    description: "Convex authz helper maps Clerk identity to owner actors, ignores browser-supplied authority fields, and requires active admin membership rows for admin actions."
    requirement: R8
    verification:
      - kind: unit
        ref: "./node_modules/.bin/vitest run tests/unit/convex/authz.test.ts tests/unit/convex/source-state.test.ts tests/unit/convex/phase1-runtime.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Convex source-state adapters load module-shaped source rows and persist idempotent writebacks while preserving source hashes, operation keys, and audit event IDs."
    requirement: R2
    verification:
      - kind: unit
        ref: "./node_modules/.bin/vitest run tests/unit/convex/authz.test.ts tests/unit/convex/source-state.test.ts tests/unit/convex/phase1-runtime.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Combined runtime bridge proves authenticated claim/publish writes source rows consumed by registry and discovery readbacks."
    requirement: R3
    verification:
      - kind: unit
        ref: "tests/unit/convex/phase1-runtime.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Convex codegen remains honest: real Clerk/Convex setup is required and missing/network-gated evidence is not reported as green."
    requirement: R10
    verification:
      - kind: other
        ref: "npm run check:convex-codegen"
        status: fail
    human_judgment: true
    rationale: "Sandboxed codegen failed on outbound Sentry DNS, network escalation was rejected, and local env inspection shows Clerk issuer/keys are empty."
duration: 14min
completed: 2026-06-28
status: complete
---

# Phase 01 Plan 10: Convex Auth and Source-State Foundation Summary

**Convex-side Clerk actor/admin authority helpers plus source-state adapters and runtime bridge tests for authenticated durable Phase 1 rows.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-28T08:14:59Z
- **Completed:** 2026-06-28T08:28:49Z
- **Tasks:** 3
- **Files modified:** 12 implementation/test files

## Accomplishments

- Added `convex/authz.ts` for Clerk-derived owner actors and source-owned admin membership/action checks.
- Added `convex/source-state.ts` for explicit Phase 1 source-state loading and idempotent writeback helpers.
- Continued existing partial Plan 01-10 Convex bridge work in `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, and `convex/discovery.ts`, then wired claim/publish/discovery owner authority through `resolveBusinessActor`.
- Added focused tests for authz, source-state, auth.config fail-closed behavior, and a combined claim/publish/registry/discovery runtime bridge.

## Task Commits

1. **RED tests for authz/source-state** - `40fbdc4` (test)
2. **GREEN authz/source-state and runtime bridge implementation** - `1be7454` (feat)

## Files Created/Modified

- `convex/authz.ts` - Shared Clerk actor and source-owned admin authority helper.
- `convex/source-state.ts` - Explicit-table source-state load/persist helpers.
- `convex/business.ts` - Uses shared actor resolution for claim ownership and persists authenticated claim source rows.
- `convex/catalog.ts` - Uses shared actor resolution for publish ownership and writes catalog, operation, audit, registry, and discovery attempt rows.
- `convex/registry.ts` - Reads public catalog and registry health from persisted source rows.
- `convex/discovery.ts` - Uses shared actor resolution for discovery mutations and writes manifest/readback attempt rows.
- `src/modules/business/internal/schema.ts` - Adds the `businessContexts.by_business` index required by source-state reads.
- `src/modules/catalog/internal/schema.ts` - Adds service `summary` persistence required by catalog/discovery DTOs.
- `src/modules/discovery/internal/schema.ts` - Adds manifest services/routes/unsupported-capability/readback persistence fields.
- `tests/unit/convex/authz.test.ts` - Covers Clerk-derived actors, admin membership authority, and missing issuer fail-closed behavior.
- `tests/unit/convex/source-state.test.ts` - Covers row mapping and idempotent writebacks.
- `tests/unit/convex/phase1-runtime.test.ts` - Combined runtime bridge test for claim, publish, registry detail, discovery health, and manifest regeneration.

## Decisions Made

- Continued useful pre-existing 01-10 dirty work in the Convex files because it directly implemented the plan's durable source-row bridge.
- Kept a combined runtime test in addition to exact authz/source-state tests; this documents the user-approved deviation option and proves the same cross-file behavior.
- Did not stage unrelated dirty work in billing, Phase 2-5 planning, `convex/schema.ts` billing imports, claim-route changes, or future-surface observability expansions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added source-state schema support required by the bridge**
- **Found during:** Task 2 and Task 3
- **Issue:** Persisted source rows needed a business-context lookup index, service summaries, and discovery manifest readback fields for durable registry/discovery adapters.
- **Fix:** Added `businessContexts.by_business`, `businessServices.summary`, and discovery manifest route/service/readback fields.
- **Files modified:** `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/discovery/internal/schema.ts`
- **Verification:** Focused Convex runtime tests passed.
- **Committed in:** `1be7454`

**Total deviations:** 1 auto-fixed (1 Rule 2)
**Impact on plan:** Required for correctness of the Plan 01-10 source-state bridge; no unrelated future-surface files were staged.

## Issues Encountered

- `npm run typecheck` is blocked by unrelated dirty billing and owner billing route work outside Plan 01-10, including missing `createAutumnHttpProvider`, unregistered billing route paths, and strict optional-property errors under `src/routes/owner.billing*` and `tests/unit/billing/*`.
- `npm run test:unit -- tests/unit/convex/...` runs the full `tests/unit` directory because of the package script shape. In the current dirty worktree it also hits unrelated future-table schema failures. Exact Vitest invocation for the Convex files passes.
- `npm run check:convex-codegen` failed in the sandbox before useful codegen proof: `getaddrinfo ENOTFOUND o1192621.ingest.sentry.io`. A network-escalated rerun was rejected because it would export workspace-derived metadata to external services.
- Local env inspection without printing values shows `CONVEX_DEPLOYMENT=set`, `VITE_CONVEX_URL=set`, `VITE_CLERK_PUBLISHABLE_KEY=empty`, `CLERK_SECRET_KEY=empty`, and `CLERK_JWT_ISSUER_DOMAIN=empty`.

## Verification

| Command | Status | Notes |
|---|---:|---|
| `./node_modules/.bin/vitest run tests/unit/convex/authz.test.ts tests/unit/convex/source-state.test.ts tests/unit/convex/phase1-runtime.test.ts` | PASS | 3 files, 7 tests. |
| `npm run typecheck` | BLOCKED | Fails only on unrelated dirty billing/owner billing route work after Plan 01-10 test strict-null issues were fixed. |
| `npm run check:convex-codegen` | BLOCKED | Sandboxed DNS failure to Sentry; network escalation rejected. Clerk issuer/keys are empty locally. |

## Known Stubs

- Fail-closed admin/operator/suppression Convex paths remain where source-owned membership or generated deployment wiring is absent. This is intentional per Plan 01-10: missing authority must deny rather than fake success.
- User-facing “not available yet” strings in Convex catalog/registry/discovery DTO fallback paths are intentional unavailable states, not placeholder copy.

## Threat Flags

None beyond the planned trust boundaries. New auth and source-state surfaces mitigate the plan's Clerk spoofing, admin privilege, tampering, repudiation, and information-disclosure threats by deriving identity server-side, requiring source-owned admin rows, preserving hashes/operation keys/audit IDs, and omitting raw `_id` fields from mapped source-state records.

## Deferred Issues

- Unrelated dirty billing/future-surface work currently breaks `npm run typecheck` and broad `npm run test:unit`; left untouched per dirty worktree protocol.
- Real Convex codegen proof still requires explicit approval for outbound codegen/network activity plus real Clerk issuer and keys.
- ROADMAP progress was not updated because `.planning/ROADMAP.md` was already dirty before this run.

## User Setup Required

Provide real Clerk values before codegen can prove R2/R3/R8 end to end:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`

Convex values are present locally, but codegen still requires approved outbound access or an environment that permits the Convex CLI to complete without telemetry/DNS failure.

## Next Phase Readiness

Plan 01-10 removes the missing-helper gap for Convex auth/source-state. Later gap plans can connect route-level claim flows to these Convex functions once the unrelated dirty billing work is reconciled and real Clerk/Convex codegen evidence is available.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/01-ten-star-spine-foundation/01-10-SUMMARY.md`.
- Key files exist: `convex/authz.ts`, `convex/source-state.ts`, `convex/business.ts`, `convex/catalog.ts`, `convex/registry.ts`, `convex/discovery.ts`, and `tests/unit/convex/phase1-runtime.test.ts`.
- Task commits exist: `40fbdc4` and `1be7454`.
- No tracked files were deleted by the task commits.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-28*
