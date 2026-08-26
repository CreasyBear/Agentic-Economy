# Gates: P1-01 — Canonical Principal registry

Scope: Human, organization, agent and workload principals have credential-independent stable identities.

Ownership: src/modules/principal-account/principal, tests/unit/principal-account/principal, tests/maturity/leaf-P1-01.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: Canonical PrincipalRegistry, opaque prn_ references, four shared kinds, lifecycle/rename/merge operations, Convex validators/table fragment and deterministic errors are implemented in src/modules/principal-account/principal; 3 maturity contract tests and 14 focused unit tests passed.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P1-01.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P1-01.test.ts
  EVIDENCE: Start at  19:02:04 | Duration  243ms (transform 73ms, setup 174ms, import 10ms, tests 3ms, environment 0ms)

- [x] G4: The critical negative invariant is proved: credential rotation cannot create or transfer a Principal.
  EVIDENCE: leaf-P1-01.test.ts passed `proves credential rotation cannot create or transfer a Principal`; it proves transfer and unknown-ref attempts fail, the store write count remains unchanged, and the original Principal object/reference is retained.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P1-01.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Four passes completed: full implementation; domain reread added revision-safe rename/runtime kind validation; defect hunt added runtime ref, timestamp, terminal merge/rotation and corrupt-chain coverage; final free-polish added persisted merge-pointer validation, then `git diff --check`, owned oxlint and the 17-test sweep passed with no further in-scope improvement found.
