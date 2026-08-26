# Gates: Phase 9 — Readiness and GA

Scope: Integrate and prove every Phase 9 leaf.

- [ ] G1: Every Phase 9 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P9-01.md gates/leaf-P9-02.md gates/leaf-P9-03.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [ ] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run test:release:source
  EVIDENCE: pending

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
