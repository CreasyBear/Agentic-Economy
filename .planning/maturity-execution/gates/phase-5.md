# Gates: Phase 5 — Reliability, resilience and release

Scope: Integrate and prove every Phase 5 leaf.

- [ ] G1: Every Phase 5 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P5-01.md gates/leaf-P5-02.md gates/leaf-P5-03.md gates/leaf-P5-04.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [ ] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run verify:deployment-manifest -- --environment development && npm run test:release:source:after-codegen
  EVIDENCE: pending

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
