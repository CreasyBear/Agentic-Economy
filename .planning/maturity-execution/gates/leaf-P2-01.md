# Gates: P2-01 — Membership and delegation

Scope: Memberships and arbitrary multi-hop grants narrow monotonically, reject cycles and bind generations.

Ownership: src/modules/authority/delegation, tests/unit/authority/delegation, tests/maturity/leaf-P2-01.test.ts

- [ ] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: pending

- [ ] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P2-01.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: pending

- [ ] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P2-01.test.ts
  EVIDENCE: pending

- [ ] G4: The critical negative invariant is proved: child authority can never exceed its ancestor intersection.
  EVIDENCE: pending

- [ ] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: pending

- [ ] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P2-01.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: pending

- [ ] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: pending
