# Gates: Wave 3 integration

Scope: Integrate H-I-J corrections and obtain both independent reviewer approvals.

- [x] G1: Thin UI correction leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave3-ui.md && echo UI_LEAF_OK
  EXPECT: UI_LEAF_OK
  EVIDENCE: ALL MET (3 met) | UI_LEAF_OK

- [x] G2: Release/browser correction leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave3-release.md && echo RELEASE_LEAF_OK
  EXPECT: RELEASE_LEAF_OK
  EVIDENCE: ALL MET (4 met) | RELEASE_LEAF_OK

- [x] G3: Contract reviewer accepts Wave 3.
  EVIDENCE: PASS after corrections through `68d2cbc7a`; absolute share parity, public typed-card redaction, and isolated retained-payment proof accepted.

- [x] G4: Verification reviewer accepts Wave 3.
  EVIDENCE: PASS under Node 22.22.0; chat 85/85, retained 420/420, general browser 20/20, accessibility 10/10, retained payment 7/7, build/CLI/generated checks green.
