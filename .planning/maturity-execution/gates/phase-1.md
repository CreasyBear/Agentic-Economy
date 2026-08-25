# Gates: Phase 1 — Canonical principals and accounts

Scope: Integrate and prove every Phase 1 leaf.

- [ ] G1: Every Phase 1 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P1-01.md gates/leaf-P1-02.md gates/leaf-P1-03.md gates/leaf-P1-04.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run typecheck && npm run test:imports
  EVIDENCE: Duration  1.07s (transform 1.22s, setup 2.97s, import 868ms, tests 257ms, environment 1ms) | cleanup: caches removed=1, browsers terminated=0

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
