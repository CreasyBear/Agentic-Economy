# Gates: Phase 1 acceptance repair integration

Scope: Integrate B1-B3, independently verify the repaired Phase 1 from clean state, and stop before Phase 2.

- [ ] R1: B1, B2 and B3 repair ledgers are independently met with atomic scoped commits and no file-ownership overlap.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status .planning/maturity-execution/gates/repair-B1-trusted-account-succession.md .planning/maturity-execution/gates/repair-B2-trusted-reset-replay.md .planning/maturity-execution/gates/repair-B3-hermetic-release.md
  EXPECT: /ALL MET/
  EVIDENCE: pending

- [ ] R2: Both acceptance reproducer tests assert rejection or verified behavior and pass.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/review/phase-1-succession-forgery.test.ts tests/review/phase-1-reset-forged-receipt.test.ts
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] R3: Every raw P1 leaf test, combined Phase 1 suite, all 34 frozen gates and zero-ABANDON scan pass.
  EVIDENCE: pending

- [ ] R4: Exact Node 22 `npm run test:release:source` passes unchanged.
  EVIDENCE: pending

- [ ] R5: A fresh clean state with `packages/cli/dist` absent passes frozen G3 and the exact release with no undeclared manual build.
  EVIDENCE: pending

- [ ] R6: Changed critical Account authorization and reset paths measure 100% statements, branches, functions and lines.
  EVIDENCE: pending

- [ ] R7: Convex Authz foundation and four-shape scan are reverified; typecheck, full lint, imports, generated-source cleanliness and schema inventory pass.
  EVIDENCE: pending

- [ ] R8: A fresh independent verifier refutes or confirms every repaired finding and records remaining risks without claiming final acceptance.
  EVIDENCE: pending

- [ ] R9: PLAN, frozen Phase 1 evidence and acceptance repair evidence are updated without weakening outcomes; exact ref/inventory/results are measured and Phase 2 remains unstarted.
  EVIDENCE: pending
