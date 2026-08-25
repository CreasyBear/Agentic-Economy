# Gates: Phase 7 — Scale, fairness and cost

Scope: Integrate and prove every Phase 7 leaf.

- [ ] G1: Every Phase 7 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P7-01.md gates/leaf-P7-02.md gates/leaf-P7-03.md gates/leaf-P7-04.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run typecheck && npm run test:unit && npm run test:integration
  EVIDENCE: Duration  41.63s (transform 2.24s, setup 10.43s, import 20.44s, tests 5.24s, environment 4ms) | cleanup: caches removed=1, browsers terminated=0

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
