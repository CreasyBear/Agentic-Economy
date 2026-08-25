# Gates: P6-02 — Agent OAuth and token exchange

Scope: Autonomous agent credentials and actor/subject token exchange preserve the full AE authority chain.

Ownership: src/modules/agent-auth, tests/unit/agent-auth, tests/maturity/leaf-P6-02.test.ts

- [ ] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: pending

- [ ] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P6-02.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: pending

- [ ] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P6-02.test.ts
  EVIDENCE: pending

- [ ] G4: The critical negative invariant is proved: token exchange cannot widen audience, scope, budget or expiry.
  EVIDENCE: pending

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P6-02.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [ ] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: pending
