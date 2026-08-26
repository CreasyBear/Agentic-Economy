# Gates: Phase 1 acceptance repair integration

Scope: Integrate B1-B3, independently verify the repaired Phase 1 from clean state, and stop before Phase 2.

- [x] R1: B1, B2 and B3 repair ledgers are independently met with atomic scoped commits and no file-ownership overlap.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status .planning/maturity-execution/gates/repair-B1-trusted-account-succession.md .planning/maturity-execution/gates/repair-B2-trusted-reset-replay.md .planning/maturity-execution/gates/repair-B3-hermetic-release.md
  EXPECT: /ALL MET/
  EVIDENCE: Node 22 status rerun reports `ALL MET (20 met)`: B1 7/7 at `58a73a444`, B2 7/7 at `073d5fce6`, and B3 6/6 at `3f75013c5`. The three commits have disjoint owned files; only driver commits touch shared integration/evidence surfaces.

- [x] R2: Both acceptance reproducer tests assert rejection or verified behavior and pass.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/review/phase-1-succession-forgery.test.ts tests/review/phase-1-reset-forged-receipt.test.ts
  EXPECT: /passed/
  EVIDENCE: Test Files 2 passed (2); Tests 2 passed (2). The succession reproducer rejects forged structural authority while retaining the original Account/Ownership, and the reset reproducer rejects `reset_receipt_untrusted` with no apply call or count change.

- [x] R3: Every raw P1 leaf test, combined Phase 1 suite, all 34 frozen gates and zero-ABANDON scan pass.
  EVIDENCE: Raw P1-01 through P1-04 leaf files pass 18/18; the exact combined 10-file Phase 1 suite passes 120/120; the four leaf ledgers plus phase ledger report `ALL MET (34 met)`; `rg '^ABANDON:' .planning/maturity-execution` returns no operational entry.

- [x] R4: Exact Node 22 `npm run test:release:source` passes unchanged.
  EVIDENCE: Fresh-clone run at `39e2283cc2221a6cce51db12f5ccf72a572c59d1` exited 0: 421 conformance, 85 chat-conformance, 2,575 unit, 570 integration, 4 type, 29 import, 1 standards, 32 SEO, 1 UI-contract, 20 E2E, 10 accessibility E2E, 7 paid-operation E2E, CLI package proof, 2,779 maturity-coverage assertions over 403 files, coverage ratchet over 708 files and production build all passed.

- [x] R5: A fresh clean state with `packages/cli/dist` absent passes frozen G3 and the exact release with no undeclared manual build.
  EVIDENCE: Fresh clone `/tmp/ae-phase1-repair-release.Gz7RTO/repo` began tracked-clean at exact ref. `packages/cli/dist` was absent before and after frozen G3; Node 22 typecheck and imports 29/29 passed without a manual build. The exact release then passed and emitted `FRESH_TRACKED_WORKTREE_CLEAN_AFTER_RELEASE`.

- [x] R6: Changed critical Account authorization and reset paths measure 100% statements, branches, functions and lines.
  EVIDENCE: Account path: 349/349 statements, 217/217 branches, 73/73 functions and 324/324 lines. Reset path: 131/131 statements, 138/138 branches, 42/42 functions and 119/119 lines. Both are 100% in all four dimensions.

- [x] R7: Convex Authz foundation and four-shape scan are reverified; typecheck, full lint, imports, generated-source cleanliness and schema inventory pass.
  EVIDENCE: `convex/auth.config.ts` providers and token/subject-linked ownership/membership indexes remain present. Objective four-shape scan returned zero actionable findings after manual classification of the three broad read candidates. Node 22 typecheck, warnings-denied full lint, imports 29/29, source-integrity/codegen cleanliness and exact 63-table schema inventory (including nine principal-account tables) pass.

- [x] R8: A fresh independent verifier refutes or confirms every repaired finding and records remaining risks without claiming final acceptance.
  EVIDENCE: A fresh typed GSD verifier returned `INTERNALLY_VERIFIED` after independently inspecting the source diff and rerunning 132/132 focused tests, raw leaves 18/18, frozen gates 34/34, repair leaves 20/20, zero-ABANDON, G3 29/29 without CLI dist, both targeted 100% coverage runs, schema inventory, authz scans, lint/typecheck and fresh-release artifacts. It recorded the deferred live reset adapter, hosted Clerk/cloud proof and Phase 2 production-surface wiring as residual risks and explicitly did not claim final Ox acceptance.

- [x] R9: PLAN, frozen Phase 1 evidence and acceptance repair evidence are updated without weakening outcomes; exact ref/inventory/results are measured and Phase 2 remains unstarted.
  EVIDENCE: PLAN status, P1-02/P1-04/Phase 1 ledgers and the historical acceptance report now append repair evidence while retaining the original `CHANGES_REQUIRED` verdict. The final handoff measures `agent-p1-01-principal` with `git rev-parse HEAD`, scoped commits, the complete `028d07bba..HEAD` inventory and all gate/release/coverage results. Phase 2 is explicitly blocked pending a fresh context-independent Ox verdict of `SOURCE_ACCEPTED` or `SOURCE_ACCEPTED_EVIDENCE_OPEN`.
