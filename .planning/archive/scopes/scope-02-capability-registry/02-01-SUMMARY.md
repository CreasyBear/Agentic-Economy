# Scope 02 / 02-01 Summary — Capability Model

## Status

Source-local complete.

## Tickets resolved

7/7 Scope-2 wayfinder tickets were assigned to the repo owner, resolved with concise comments, and closed:

- Resolve Convex-safe external-fetch path for capability checks
- Prototype domain-control proof for business_endpoint admission
- Settle contradiction precedence: AE-held facts vs business manifest
- Decide capability-table naming and serviceCapabilities fold path
- Decide agent-operation disclosure proof bar
- Tune ae-endpoint-check:v1 freshness windows and timeouts
- Define locality x capability filter composition for registry.search

Map decision lines are now merged into issue #1 "Decisions so far"; the source lines remain in `local://scope02-0201-map-lines.md`.

## Files changed

- `src/modules/capabilities/public.ts`
- `src/modules/capabilities/internal/capability-model.ts`
- `src/modules/capabilities/internal/check-standard.ts`
- `tests/unit/capabilities/capability-model.test.ts`
- `tests/unit/capabilities/check-standard.test.ts`
- `tests/types/capability-contracts.test.ts`
- `.planning/scopes/scope-02-capability-registry/02-01-SUMMARY.md`

## Source/local proof

- The capability axis is a closed four-kind union: `informational_page`, `inquiry_intake`, `business_endpoint`, `action_card`.
- The descriptor contract is a discriminated union keyed by `kind`.
- Capability trust state is exactly `business_supplied`, `checked`, `stale`, `contradicted`, `unsupported`; no `verified` trust state is emitted.
- `computeCapabilityTrustState` is the pure transition oracle for never-checked, checked, stale, contradicted, exhausted failure, and non-exhausted failure branches.
- `ae-endpoint-check:v1` facet evaluation is pure and typed for reachability, schema conformance, freshness, and contradiction.
- The source module scan found no local-service shaped fields or `verified` string in `src/modules/capabilities`.

## Targeted verification

Passed:

```text
npx vitest run tests/unit/capabilities tests/types/capability-contracts.test.ts
npm run typecheck
npm run test:ts-standards
```

Additional local checks:

- GitHub issue state check: the seven Scope-2 scoped tickets report `CLOSED`; resolution comments were posted by `CreasyBear`.
- `local://scope02-0201-map-lines.md` contains seven map-ready lines, and issue #1 now contains the corresponding Scope-2 decisions.
- `grep` over `src/modules/capabilities` found no `serviceArea`, `suburb`, `hours`, `urgency`, `emergency`, or `verified` matches.

## Production/deployed proof

Not claimed. This plan is source-local only. Deployed provider/check-engine proof remains gated to later Scope 2 plans and user-provisioned deployed environment evidence.
