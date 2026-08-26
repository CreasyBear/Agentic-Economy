# Gates: P3-02 — Resolution and live Quote

Scope: Bounded Resolution produces candidate snapshots and live Quotes pin readiness, authority and terms.

Ownership: src/modules/commercial/resolution-quote, tests/unit/commercial/resolution-quote, tests/maturity/leaf-P3-02.test.ts

- [ ] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: pending

- [ ] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P3-02.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: pending

- [ ] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P3-02.test.ts
  EVIDENCE: pending

- [ ] G4: The critical negative invariant is proved: expired or stale Quotes cannot be accepted.
  EVIDENCE: pending

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P3-02.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [ ] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: pending
