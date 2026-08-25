# Gates: Phase 6 — Agent APIs, connectors and distribution

Scope: Integrate and prove every Phase 6 leaf.

- [ ] G1: Every Phase 6 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P6-01.md gates/leaf-P6-02.md gates/leaf-P6-03.md gates/leaf-P6-04.md gates/leaf-P6-05.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: pending

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run test:conformance && npm run test:cli-package && npm run test:e2e
  EVIDENCE: [WebServer]   unhandled: true | [WebServer] }

- [ ] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: pending

- [ ] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: pending

- [ ] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: pending
