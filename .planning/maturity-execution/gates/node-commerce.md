# Gates: Commercial transaction branch

Scope: Prove child phases integrate as one branch.

- [ ] G1: Every child phase gate is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/phase-3.md gates/phase-4.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: Cross-phase interfaces and state transitions compose without adapters that bypass the frozen contract.
  EVIDENCE: pending

- [x] G3: Branch integration and regression checks pass.
  CHECK: cd ../.. && npm run test:conformance && npm run test:integration
  EVIDENCE: Duration  41.26s (transform 2.11s, setup 10.34s, import 19.92s, tests 5.30s, environment 4ms) | cleanup: caches removed=3, browsers terminated=0

- [ ] G4: Shared composition files were changed only by the integration driver and generated artifacts are fresh.
  EVIDENCE: pending

- [ ] G5: Branch documentation, ADRs and operational evidence match executable behavior.
  EVIDENCE: pending

- [ ] G6: A branch-level defect hunt found no remaining correctness, isolation, performance or operability defect.
  EVIDENCE: pending
