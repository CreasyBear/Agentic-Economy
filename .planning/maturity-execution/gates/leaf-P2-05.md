# Gates: P2-05 — Recovery, break-glass and isolation proof

Scope: Declared account recovery and dual-attributed break-glass coexist with a generated isolation and secret-canary matrix.

Ownership: src/modules/authority/recovery, tests/security/maturity, tests/maturity/leaf-P2-05.test.ts

- [ ] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: pending

- [ ] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-05.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: pending

- [ ] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-05.test.ts
  EVIDENCE: pending

- [ ] G4: The critical negative invariant is proved: operator freeze cannot silently transfer ownership or impersonate.
  EVIDENCE: pending

- [ ] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: pending

- [ ] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-05.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: pending

- [ ] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: pending
