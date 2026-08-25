# Phase 1 identity/account blast radius

Measured: 2026-08-25 before any Phase 1 delegation.

## Existing sources of identity and tenancy

- `agentAccessPrincipals` is referenced by 16 non-generated production files. It currently couples stable principal, owner, credential, policy, and grant facts in one record.
- Legacy `owners` / `businesses` concepts appear across 74 non-generated production files and remain compatibility/domain consumers during Phase 1.
- Direct Convex authentication identity reads or `subject` / `tokenIdentifier` use appear in 20 non-generated production files.
- The new `src/modules/principal-account`, `tests/unit/principal-account`, and `tools/maturity-reset` scopes contain 0 files before Phase 1.
- No `tests/maturity/leaf-P1-*.test.ts` contract test exists before Phase 1.

This phase introduces the canonical model and compatibility seams. It does not mass-migrate the 74-file business catalogue or begin Phase 2 authorization. Existing callers remain stable through explicit adapter/projection boundaries owned by the integration driver.

## Frozen leaf ownership

| Leaf | Exclusive writable production scope | Exclusive writable test scope | Hard end condition |
|------|-------------------------------------|-------------------------------|--------------------|
| P1-01 | `src/modules/principal-account/principal/**` | `tests/unit/principal-account/principal/**`, `tests/maturity/leaf-P1-01.test.ts` | Stable typed Principal registry for four kinds; rotation cannot create/transfer identity; leaf gate ALL MET; atomic commit |
| P1-02 | `src/modules/principal-account/account/**` | `tests/unit/principal-account/account/**`, `tests/maturity/leaf-P1-02.test.ts` | Ownership, membership, and complete lifecycle state machine; impossible transitions rejected; leaf gate ALL MET; atomic commit |
| P1-03 | `src/modules/principal-account/external-identity/**` | `tests/unit/principal-account/external-identity/**`, `tests/maturity/leaf-P1-03.test.ts` | Unique external bindings and generation-bound credential lifecycle; collisions/stale credentials fail closed; leaf gate ALL MET; atomic commit |
| P1-04 | `src/modules/principal-account/workload-context/**`, `tools/maturity-reset/**` | `tests/unit/principal-account/workload-context/**`, `tests/maturity/leaf-P1-04.test.ts` | Explicit workload Principal + exactly one Account context and deterministic legacy reset; no implicit superuser; leaf gate ALL MET; atomic commit |

No two leaves own the same file. Each executor must implement, reread as a domain expert, hunt defects, apply free polish, run its exact Unlazy checker, and commit only its owned files plus its own leaf gate ledger.

## Integration-driver-only surfaces

- `convex/schema.ts` and all `convex/_generated/**`
- Any new Convex composition/function module under `convex/`
- `src/modules/principal-account/public.ts` and any cross-context barrel
- Shared HTTP/composition surfaces, including `convex/http.ts`
- Root scripts/configuration, including `package.json`
- Cross-leaf integration/isolation tests and `.planning/maturity-execution/gates/phase-1.md`
- `.planning/maturity-execution/PLAN.md` measured status log

## Compatibility and risk boundaries

- Existing `agentAccessPrincipals` and legacy `owners` remain read-compatible until a later explicitly gated migration; Phase 1 canonical tables must not silently reinterpret them.
- External provider identifiers and credentials are bindings to a Principal, never stable resource identity.
- `identity.tokenIdentifier` remains the canonical external-auth lookup key; `identity.subject` alone is not a global key.
- All canonical tables and functions use Convex validators, complete ordered index names, and internal registration for non-public functions.
- Internal workload admission must require explicit context; reset tooling must be deterministic, scoped, dry-runnable, and incapable of deleting canonical tables.
