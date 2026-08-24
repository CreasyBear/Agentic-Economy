# Gates: Wave 4 integration

Scope: Integrate the drain candidate, Release A writer freeze, and retained-boundary extraction with dual review.

- [ ] G1: K1 drain leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-k1-drain.md && echo K1_OK
  EXPECT: K1_OK
  EVIDENCE: pending

- [ ] G2: K2 writer-freeze leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-k2-freeze.md && echo K2_OK
  EXPECT: K2_OK
  EVIDENCE: pending

- [ ] G3: L extraction leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-l-extraction.md && echo L_OK
  EXPECT: L_OK
  EVIDENCE: pending

- [ ] G4: Contract and verification reviewers accept Wave 4.
  EVIDENCE: pending
