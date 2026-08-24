# Gates: Wave 5 integration

Scope: Integrate deletion, dependency/environment cleanup, and documentation with dual review.

- [ ] G1: Runtime prune leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave5-m-prune.md && echo M_OK
  EXPECT: M_OK
  EVIDENCE: pending

- [ ] G2: Dependency/environment cleanup leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave5-n-cleanup.md && echo N_OK
  EXPECT: N_OK
  EVIDENCE: pending

- [ ] G3: Documentation leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave5-o-docs.md && echo O_OK
  EXPECT: O_OK
  EVIDENCE: pending

- [ ] G4: Contract and verification reviewers accept Wave 5.
  EVIDENCE: pending
