# Gates: Phase 8 — Support, lifecycle and market integrity

Scope: Integrate and prove every Phase 8 leaf.

- [ ] G1: Every Phase 8 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P8-01.md gates/leaf-P8-02.md gates/leaf-P8-03.md gates/leaf-P8-04.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run typecheck && npm run test:unit && npm run test:integration
  EVIDENCE: Duration  40.36s (transform 2.11s, setup 10.08s, import 19.75s, tests 5.11s, environment 4ms) | cleanup: caches removed=1, browsers terminated=0

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
