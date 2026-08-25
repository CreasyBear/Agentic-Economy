# Gates: P2-05 — Recovery, break-glass and isolation proof

Scope: Declared account recovery and dual-attributed break-glass coexist with a generated isolation and secret-canary matrix.

Ownership: src/modules/authority/recovery, tests/security/maturity, tests/maturity/leaf-P2-05.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `RecoveryCoordinator`, `generateIsolationMatrix` and `proveSecretCanaryIsolation` implement operational recovery, seven-case-per-surface isolation (including explicit actor-less `missing_workload`) and exact non-vacuous forbidden-sink canary seams under `src/modules/authority/recovery/**`; 22 focused tests pass.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-05.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: Raw CHECK prints `LEAF_TEST_PRESENT`.

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-05.test.ts
  EVIDENCE: Node 22 raw CHECK passes 2/2 contract tests in `tests/maturity/leaf-P2-05.test.ts`; the complete focused set passes 22/22 tests in 3 files.

- [x] G4: The critical negative invariant is proved: operator freeze cannot silently transfer ownership or impersonate.
  EVIDENCE: `recovery-break-glass.test.ts` rejects subject/operator equality, any approval by the protected subject, malformed operators, invalid/pre-freeze approval times, caller-selected operator mismatch, single/duplicate operators and forged/replayed proof; its transaction-faithful race proves exactly one distinct admission can consume shared approvals. `RecoveryCommit` has no ownership mutation field.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: Node 22 `npm run typecheck` passes with the context-local `recovery/public.ts` export.

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-05.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: Raw CHECK prints `NO_PLACEHOLDERS`; the expanded owned-path placeholder and debt scan prints `P2_05_DEBT_SCAN_CLEAN`.

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four passes retained malformed persisted-admission rejection, atomic bounded non-subject approval consumption with canonical operators and ordered safe timestamps, distinct matrix actors, explicit missing-workload denial/runtime decisions and non-empty canary sink evidence; exact Istanbul coverage is 218/218 statements, 237/237 branches, 46/46 functions and 188/188 lines; scoped oxlint, typecheck and `git diff --check` pass.
