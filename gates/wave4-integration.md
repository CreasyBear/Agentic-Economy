# Gates: Wave 4 integration

Scope: Integrate the drain candidate, Release A writer freeze, and retained-boundary extraction with dual review.

- [x] G1: K1 drain leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-k1-drain.md && echo K1_OK
  EXPECT: K1_OK
  EVIDENCE: `gates/wave4-k1-drain.md` reports 3/3 met; verification reran the retirement and HTTP-boundary coverage at 5/5 tests.

- [x] G2: K2 writer-freeze leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-k2-freeze.md && echo K2_OK
  EXPECT: K2_OK
  EVIDENCE: `gates/wave4-k2-freeze.md` reports 3/3 met; verification confirmed exactly 15 frozen writers, 14 retained readers, 11 legacy tables, and 4/4 focused tests.

- [x] G3: L extraction leaf is complete.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-l-extraction.md && echo L_OK
  EXPECT: L_OK
  EVIDENCE: `gates/wave4-l-extraction.md` reports 3/3 met; targeted coverage passed 80/80, chat conformance 85/85, retained conformance 420/420, and imports 28/28 with CLI, typecheck, and lint green.

- [x] G4: Contract and verification reviewers accept Wave 4.
  EVIDENCE: Both read-only reviewers returned PASS. They accepted `d0f55de08` as the correct temporary compatibility seam and explicitly separated pending production drain/deploy/export/deletion evidence from source acceptance.
