# Gates: Phase 2 — Authority, connections and secrets

Scope: Integrate and prove every Phase 2 leaf.

- [ ] G1: Every Phase 2 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P2-01.md gates/leaf-P2-02.md gates/leaf-P2-03.md gates/leaf-P2-04.md gates/leaf-P2-05.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [ ] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run typecheck && npm run test:imports && npm run test:integration
  EVIDENCE: pending

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
