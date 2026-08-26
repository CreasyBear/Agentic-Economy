# Gates: Phase 2 authority-entry close node

Scope: Reconcile provenance-bound evidence, exact release verification, housekeeping and the context-independent handoff.

- [ ] G1: Evidence integration leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-evidence.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: Release/handoff leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-release.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G3: Machine-readable counts, cases, coverage, counterexamples, candidate refs and external evidence assignments reconcile exactly.
  EVIDENCE: pending

- [ ] G4: A fresh read-only verifier accepts implementation evidence without self-certification or source/hosted conflation.
  EVIDENCE: pending

- [ ] G5: No ABANDON, scratch/sprawl, unowned papercut or dirty candidate state remains.
  EVIDENCE: pending

- [ ] G6: The handoff explicitly stops before final acceptance and Phase 3/5/6 work.
  EVIDENCE: pending
