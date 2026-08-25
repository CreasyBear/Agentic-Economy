# Gates: P1-04 — Workload context and clean reset

Scope: Jobs, crons, callbacks and reconciliation use explicit workload Principal and Account context; legacy internal identity data is removed.

Ownership: src/modules/principal-account/workload-context, tools/maturity-reset, tests/maturity/leaf-P1-04.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `workload-context/{workload-context,public}.ts` provides exact-shape factories and canonical-record admission for job, cron, callback and reconciliation contexts. Acceptance repair `073d5fce6` makes a reset receipt only a lookup hint: replay must resolve a trusted durable execution and transaction, match the plan digest and removed facts, reconcile zero counts for both legacy targets, and prove unchanged counts for all six protected canonical identity tables. The 15 unit, 5 leaf and 1 repaired review assertions pass; the changed reset path measures 100% statements (131/131), branches (138/138), functions (42/42) and lines (119/119).

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
  EVIDENCE: Expert reread verified one active Account, active workload Principal ownership/membership attachment, explicit cross-Account attribution, exact-shape no-authority contexts, deterministic manifest ordering and protected canonical inventory. Acceptance repair rejects untrusted or mismatched execution/transaction receipts and exposes removed facts only after trusted post-state reconciliation. Blast-radius reread keeps the removable manifest to the two declared legacy identity stores (`owners`, `agentAccessPrincipals`); the live Convex deletion adapter remains explicitly deferred. The final full Phase 1 regression, coverage, typecheck, lint, placeholder and diff pass found no further in-scope improvement.
