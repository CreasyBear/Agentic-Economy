# Gates: AE L3 maturity root

Scope: Prove the complete L3 program is integrated, operated and evidenced.

- [ ] G1: Every branch, phase and leaf gate file is met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/*.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [x] G2: No gate was abandoned.
  CHECK: if rg -n '^ABANDON:' GATES.md gates; then exit 1; else echo NO_ABANDONS; fi
  EXPECT: NO_ABANDONS
  EVIDENCE: NO_ABANDONS

- [ ] G3: The exact clean source release gate passes.
  CHECK: cd ../.. && npm run test:release:source
  EVIDENCE: pending

- [ ] G4: Production evidence names the exact deployed source revision.
  EVIDENCE: pending

- [ ] G5: Every numeric completion claim was remeasured immediately before reporting.
  EVIDENCE: pending

- [ ] G6: Commercial, legal, SLO, security, isolation, recovery and cost gates are evidenced.
  EVIDENCE: pending

- [ ] G7: A final adversarial pass attempted to refute at least one passed root gate and found no defect.
  EVIDENCE: pending
