# Gates: Phase 2 authority-entry runtime migration node

Scope: Migrate every protected runtime family through its documented registration seam with disjoint ownership and actual-handler proof.

- [ ] G1: All three disjoint Convex migration leaves are independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-convex-a.md gates/repair-P2-authority-entry-convex-b.md gates/repair-P2-authority-entry-convex-c.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G2: Convex HTTP and Start authority leaves are independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-http.md gates/repair-P2-authority-entry-start.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G3: MCP/CLI and background/external leaves are independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status --timeout 120 gates/repair-P2-authority-entry-edge.md gates/repair-P2-authority-entry-background.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] G4: The driver composed shared HTTP, cron, Start, generated and edge wiring only after leaf refs were stable.
  EVIDENCE: pending

- [ ] G5: Actual registrations—not imported handlers or projected sinks—drive every protected/exempt case with exact provenance.
  EVIDENCE: pending

- [ ] G6: Cross-family denial/isolation, authorized behavior, partial/unknown and consequence-time authority checks pass without overlap or bypass.
  EVIDENCE: pending
