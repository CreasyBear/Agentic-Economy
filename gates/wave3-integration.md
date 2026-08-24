# Gates: Wave 3 integration

Scope: Integrate H-I-J corrections and obtain both independent reviewer approvals.

- [ ] G1: Thin UI correction leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave3-ui.md && echo UI_LEAF_OK
  EXPECT: UI_LEAF_OK
  EVIDENCE: pending

- [ ] G2: Release/browser correction leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave3-release.md && echo RELEASE_LEAF_OK
  EXPECT: RELEASE_LEAF_OK
  EVIDENCE: pending

- [ ] G3: Contract reviewer accepts Wave 3.
  EVIDENCE: pending

- [ ] G4: Verification reviewer accepts Wave 3.
  EVIDENCE: pending
