# Gates: Phase 4 — Invocation, evidence and Stage 1 money

Scope: Integrate and prove every Phase 4 leaf.

- [ ] G1: Every Phase 4 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P4-01.md gates/leaf-P4-02.md gates/leaf-P4-03.md gates/leaf-P4-04.md gates/leaf-P4-05.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run test:conformance && npm run test:integration
  EVIDENCE: Duration  41.60s (transform 2.20s, setup 10.45s, import 20.36s, tests 5.24s, environment 4ms) | cleanup: caches removed=1, browsers terminated=0

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
