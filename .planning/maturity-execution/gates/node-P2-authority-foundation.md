# Gates: Phase 2 authority-entry foundation node

Scope: Freeze the complete migration inventory and prove the registrar/capability and Start bundle foundations before domain migration.

- [x] G1: Inventory/classification leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-inventory.md
  EXPECT: /ALL MET/
  EVIDENCE: 2026-08-26 — Committed inventory candidate `85486e84fb46c775c64b177f9ddd85d76146bc11` passed the named checker 8/8 and a fresh read-only verifier 8/8. The accepted contracts freeze 298 registrations across 52 files, exact 242 runtime and 39/14/12 edge namespaces, 59/59 fresh source digests, 1,186 declared runtime joins within the frozen namespace, zero unresolved/duplicate/stale identities, disjoint migration ownership and 607 later source obligations.

- [ ] G2: Registrar/capability foundation leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-foundation.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G3: Start bundle repair leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-start-bundle.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G4: The manifest, registrar modes, structural capabilities and built dispatcher compose without a raw or test-only path.
  EVIDENCE: pending

- [ ] G5: Type/import/bundle/codegen and compatibility checks pass with exact shared-file ownership preserved.
  EVIDENCE: pending

- [ ] G6: The driver reran all child checks and an adversarial alias/factory/wire/bundle counterexample.
  EVIDENCE: pending
