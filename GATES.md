# Gates: Operation-market prune root

Scope: Deliver the narrow Operation market repository, prove its retained boundaries, and leave irreversible production work behind explicit human gates.

- [x] G1: Foundations and Agent backend are independently accepted.
  EVIDENCE: Wave 1 and Wave 2 dual reviewers passed; chat conformance 82 tests and retained conformance 420 tests were measured after integration.

- [x] G2: Product cutover is accepted after all Wave 3 contract findings are closed.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave3-integration.md && echo WAVE3_OK
  EXPECT: WAVE3_OK
  EVIDENCE: Wave 3 integration ledger is 4/4 met; both original reviewers returned PASS after correction through `68d2cbc7a`.

- [x] G3: Drain, writer freeze, and retained-boundary extraction are accepted.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave4-integration.md && echo WAVE4_OK
  EXPECT: WAVE4_OK
  EVIDENCE: Wave 4 integration ledger is 4/4 met; contract and verification reviewers independently passed the drain candidate, writer freeze, eleven-table Release A compatibility schema, and retained-boundary extraction through `71b688a09`.

- [x] G4: Audited deletion, dependency cleanup, and documentation are accepted.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/wave5-integration.md && echo WAVE5_OK
  EXPECT: WAVE5_OK
  EVIDENCE: Wave 5 integration ledger is 4/4 met; both reviewers accepted the audited prune, dependency/environment cleanup, Operation parity correction, CDP externalization, and current architecture/rollback map through `ca8040f04`.

- [x] G5: Final source and generated-output gates are green and net removal is at least 55,000 lines.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/final-source.md && echo FINAL_SOURCE_OK
  EXPECT: FINAL_SOURCE_OK
  EVIDENCE: Final source ledger G1-G3 are met: source/build/generated/CLI/chat/retained/parity gates pass and the verified tracked reduction is 75,448 net lines.

- [ ] G6: Production drain, exact-revision staging, rollback export, Release A/B, and eleven separately confirmed table deletions are evidenced.
  EVIDENCE: Pending human release operations. No production deployment, export, destructive table deletion, or snapshot-retention decision was inferred or performed.
