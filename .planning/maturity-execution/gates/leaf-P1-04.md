# Gates: P1-04 — Workload context and clean reset

Scope: Jobs, crons, callbacks and reconciliation use explicit workload Principal and Account context; legacy internal identity data is removed.

Ownership: src/modules/principal-account/workload-context, tools/maturity-reset, tests/maturity/leaf-P1-04.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `workload-context/{workload-context,public}.ts` provides exact-shape factories and canonical-record admission for job, cron, callback and reconciliation contexts; `tools/maturity-reset/{legacy-identity-reset,public}.ts` provides the declared legacy manifest, deterministic measured plan/digest and dry-run-by-default idempotent exact-apply port. The 25 focused contract/unit assertions pass, with owned Istanbul coverage at 100% statements (184/184), branches (148/148), functions (46/46) and lines (165/165).

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P1-04.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P1-04.test.ts
  EVIDENCE: Start at  20:03:40 | Duration  270ms (transform 91ms, setup 178ms, import 30ms, tests 5ms, environment 0ms)

- [x] G4: The critical negative invariant is proved: no internal workload obtains implicit superuser authority.
  EVIDENCE: `leaf-P1-04.test.ts` and `workload-context.test.ts` reject `superuser`, `authority`, multi-Account and unknown context fields before admission; non-workload/inactive Principals, inactive/missing Accounts, wrong-Account access and malformed ownership/membership facts fail closed. Admitted output contains attribution and pinned canonical revisions but no authority, operator, role, scope or bypass material.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P1-04.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Expert reread verified one active Account, active workload Principal ownership/membership attachment, explicit cross-Account attribution, exact-shape no-authority contexts, deterministic manifest ordering, protected canonical inventory, digest-bound apply and receipt idempotency. Defect hunt hardened malformed JSON plan/receipt handling to typed fail-closed errors and deep-froze receipt-derived output. Blast-radius reread narrowed the removable manifest to the two declared legacy identity stores (`owners`, `agentAccessPrincipals`) rather than the cheap over-broad inclusion of security authorization records. The final full Phase 1 regression, coverage, typecheck, lint, placeholder and diff pass found no further in-scope improvement.
