# Gates: L3 completion branch

Scope: Prove child phases integrate as one branch.

- [ ] G1: Every child phase gate is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/phase-9.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: Cross-phase interfaces and state transitions compose without adapters that bypass the frozen contract.
  EVIDENCE: pending

- [ ] G3: Branch integration and regression checks pass.
  CHECK: cd ../.. && npm run test:release:source
  EVIDENCE: pending

- [ ] G4: Shared composition files were changed only by the integration driver and generated artifacts are fresh.
  EVIDENCE: pending

- [ ] G5: Branch documentation, ADRs and operational evidence match executable behavior.
  EVIDENCE: pending

- [ ] G6: A branch-level defect hunt found no remaining correctness, isolation, performance or operability defect.
  EVIDENCE: pending
