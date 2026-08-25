# Gates: Phase 1 repair acceptance review

Scope: Independently accept or reject candidate `agent-p1-01-principal` at the frozen repair ref without modifying production code or starting Phase 2.

- [x] G1: The clean starting state, candidate ref, exact HEAD, repair base, original baseline, ancestry, merge base, and complete changed-file inventory are independently frozen; any mismatch fails closed.
  EVIDENCE: Initial porcelain status was empty; branch ref and detached HEAD both resolved to 71e2163091ad5cd15259821f82730ebaf6777abf. Bases and ancestry matched exactly. Repair inventory was 23 files, +1251/-112, across seven commits.

- [x] G2: AGENTS.md, Convex project guidance, PLAN.md, original Phase 1 acceptance, every frozen P1 leaf/phase gate, every repair leaf/integration gate, and every changed source/test file are read completely.
  EVIDENCE: All named instructions/contracts/gates plus all 23 changed files and every repair diff hunk were read before disposition.

- [x] G3: The convex-authz foundation check and deterministic four-shape scan cover every eligible `convex/**/*.ts` file, with every hit reported and no production hardening.
  EVIDENCE: Clerk provider and subject/token-linked authorization foundations were present. TypeScript-AST scan covered 133 eligible files and returned zero hits in all four shapes; no source was hardened.

- [x] G4: The code-review Standards axis independently reviews `git diff 028d07bba...HEAD` against all repository standards and the full smell baseline.
  EVIDENCE: Separate Standards subagent returned 3 findings (2 hard, 1 judgment); worst was missing creation attribution on consequential authority/evidence records.

- [x] G5: The code-review Spec axis independently reviews `git diff 028d07bba...HEAD` against PLAN.md and the original acceptance repair requirements.
  EVIDENCE: Separate Spec subagent returned 2 findings (1 high, 1 medium); worst was same-port reset proof forgery. B3 transitive closure was also incomplete.

- [x] G6: All 20 repair leaf gates are independently re-run through the unlazy checker, with at least one raw CHECK rerun per repair leaf and deciding evidence recorded.
  EVIDENCE: B1 7/7, B2 7/7, B3 6/6 mechanically met; raw B1 1/1, B2 1/1, and B3 import suite 29/29 passed independently.

- [x] G7: All 9 repair integration gates are independently re-run through the unlazy checker and deciding evidence is recorded.
  EVIDENCE: phase-1-repair checker reported 9/9 mechanically met.

- [x] G8: All 34 frozen Phase 1 gates are independently re-run through the unlazy checker, with at least one raw CHECK rerun per frozen leaf and zero operational ABANDON.
  EVIDENCE: Four leaves were 7/7 each and Phase 1 integration 6/6: 34/34 mechanically met. Raw leaf results were 3/3, 5/5, 5/5, 5/5. No operational ABANDON was found.

- [x] G9: Raw leaf suites and focused integration suites pass from the exact candidate ref.
  EVIDENCE: Raw leaf outcomes above passed; focused schema plus Phase 1 integration passed 14/14 in two files.

- [x] G10: The exact combined Phase 1 suite and repaired reproducer suites pass from the exact candidate ref.
  EVIDENCE: Exact 10-file combined Phase 1 suite passed 120/120. Existing repair reproducers passed; new focused counterexamples passed 4/4 in three files and demonstrate false B1/B2/B3 gates.

- [x] G11: Targeted 100% coverage is independently measured for changed Account succession and reset critical paths, including every relevant branch/function/line/statement threshold.
  EVIDENCE: Account 38/38: S 364/364, B 217/217, F 73/73, L 339/339. Reset 21/21: S 131/131, B 138/138, F 42/42, L 119/119.

- [x] G12: Schema composition and complete table inventory are independently measured and agree with the frozen contract.
  EVIDENCE: Runtime schema measured exactly 63 durable tables and all nine principal/Account tables; schema/integration focus passed 14/14. Full inventory is in the report.

- [x] G13: Lint, typecheck, import-boundary checks, and diff/inventory checks pass.
  EVIDENCE: Lint with warnings denied, typecheck, imports 29/29, diff check, placeholder scan, and inventory checks passed.

- [x] G14: Exact Node 22 `npm run test:release:source` passes without undeclared preparation.
  EVIDENCE: Node v22.22.0 exact release passed, ending with maturity 2779/2779, coverage ratchet files=708, and successful production build.

- [x] G15: A genuinely fresh checkout/state with `packages/cli/dist` absent proves hermetic frozen G3 and full release behavior, correct packaged-CLI ordering, and no ignored-artifact or undeclared manual-build dependency.
  EVIDENCE: Second fresh checkout was exact and tracked-clean; dist was absent before G3 and release. G3 passed without dist. Exact release itself created dist at the declared package step and emitted CLI_PACKAGE_PASS; no manual build occurred.

- [x] G16: A new ephemeral Ox Alpha run is launched only after `codex --help` confirms syntax, using installed profile `ox-alpha`, read-only sandbox, approval never, and the candidate worktree as cwd; full prompt and attributed output are preserved.
  EVIDENCE: Syntax confirmed with codex and exec help. Deciding ephemeral session 01a03980-46c2-7351-a2fb-5bb64a927b53 exited 0 under stealth/ox-alpha, read-only, approval never, candidate cwd; full prompt and attributed final output are preserved.

- [x] G17: Ox adversarially attempts to refute B1 succession across trusted authorization origin, unique participant threshold, full binding, replay/race/cross-account/partial-consumption resistance, and no-transfer/stale-policy enforcement; every claimed issue is reproduced or rejected with evidence.
  EVIDENCE: Ox returned B1 PASS after inspecting storage resolution, binding and atomic consumption; it noted duplicate active authorizations as informational. Driver accepted functional resistance but Standards review found frozen creation attribution absent.

- [x] G18: Ox adversarially attempts to refute B2 reset across lying execution ports, forged/digest-valid/replayed receipts, zero-target/canonical reconciliation, partial failure, retry, and mismatched execution; every claimed issue is reproduced or rejected with evidence.
  EVIDENCE: Ox returned B2 PASS by assuming readTrustedExecution is a distinct trusted capability. Driver refuted that assumption with a permitted same-object port: test passes and falsely returns already-applied/factsRemoved=5 while live legacy counts remain 2 and 3.

- [x] G19: Ox adversarially attempts to refute B3 release across pristine-checkout hermeticity, packaged-CLI pre-release ordering, ignored artifacts, and deleting `packages/cli/dist` before frozen G3/full release; every claimed issue is reproduced or rejected with evidence.
  EVIDENCE: Ox returned B3 PASS for hermetic execution and separate package proof. Driver independently confirmed those properties, then refuted semantic closure: a synthetic transitive legacy import passes the source scan while appearing in the bundle.

- [x] G20: Active-stranger, cross-account, lifecycle-race, credential/principal mutation, workload-superuser, and schema/codegen attacks are independently retried for regressions.
  EVIDENCE: Focused results: stranger/cross-Account 2/2; lifecycle/race 2/2; credential/principal rotation 13/13; workload-superuser 1/1; schema 14/14; codegen passed in the fresh release state.

- [x] G21: Every repair commit and every changed planning, source, tool, import, schema, unit, maturity, integration, and review-test hunk is manually reviewed against the frozen contract and repository standards.
  EVIDENCE: All seven commits, 23 files, and +1251/-112 diff were manually reviewed; no implementer assertion was accepted as evidence.

- [x] G22: The committed acceptance report contains exact refs, changed-file inventory, measured evidence, separate Standards/Spec axes, Ox attribution, reproductions, source verdict, open external evidence with owning later gate, and exact repair tests for any blocker.
  EVIDENCE: phase-1-repair-acceptance.md contains every named section, CHANGES_REQUIRED, three blocker repair-test sets, and later-gate ownership.

- [x] G23: Only the acceptance ledger, acceptance report, preserved Ox prompt/output, and focused review-only tests (if needed) are committed; production code is unchanged and Phase 2 is not started.
  EVIDENCE: Final review diff is limited to GATES.md, three review documents, and two tests/review files. Exact comparison to candidate shows no src/convex/tools/packages production diff; no Phase 2 artifact exists.

- [x] G24: The verdict follows the required three-way policy, and the exact handoff keeps Phase 2 blocked unless the verdict is SOURCE_ACCEPTED or SOURCE_ACCEPTED_EVIDENCE_OPEN.
  EVIDENCE: Verdict is CHANGES_REQUIRED for present B1/B2/B3 defects. Report handoff explicitly keeps Phase 2 blocked and separates later external evidence.

- [x] G25: A final checker/status pass shows this ledger complete with zero operational ABANDON, and every numerical claim in the report is re-measured.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status GATES.md
  EXPECT: /ALL MET \(25 met\)/
  EVIDENCE: Final checker reports ALL MET (25 met); zero operational ABANDON; report counts were reconciled to exact command/test outputs before commit.
