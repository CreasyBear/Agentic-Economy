# Gates: Operation-market prune root

Scope: Deliver the narrow Operation market repository, prove its retained boundaries, and leave irreversible production work behind explicit human gates.

- [x] G1: Foundations and Agent backend are independently accepted.
  EVIDENCE: Wave 1 and Wave 2 dual reviewers passed; chat conformance 82 tests and retained conformance 420 tests were measured after integration.

- [ ] G2: Product cutover is accepted after all Wave 3 contract findings are closed.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave3-integration.md && echo WAVE3_OK
  EXPECT: WAVE3_OK
  EVIDENCE: pending

- [ ] G3: Drain, writer freeze, and retained-boundary extraction are accepted.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-integration.md && echo WAVE4_OK
  EXPECT: WAVE4_OK
  EVIDENCE: pending

- [ ] G4: Audited deletion, dependency cleanup, and documentation are accepted.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave5-integration.md && echo WAVE5_OK
  EXPECT: WAVE5_OK
  EVIDENCE: pending

- [ ] G5: Final source and generated-output gates are green and net removal is at least 55,000 lines.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/final-source.md && echo FINAL_SOURCE_OK
  EXPECT: FINAL_SOURCE_OK
  EVIDENCE: pending

- [ ] G6: Production drain, exact-revision staging, rollback export, Release A/B, and eleven separately confirmed table deletions are evidenced.
  EVIDENCE: pending
