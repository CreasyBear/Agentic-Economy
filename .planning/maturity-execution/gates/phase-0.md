# Gates: Phase 0 — Trustworthy baseline

Scope: Integrate and prove every Phase 0 leaf.

- [x] G1: Every Phase 0 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P0-01.md gates/leaf-P0-02.md gates/leaf-P0-03.md
  EXPECT: /ALL MET/
  EVIDENCE: gates/leaf-P0-03.md: 7 gates | ALL MET (21 met)

- [x] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: The integration driver alone composed shared surfaces: package.json/package-lock.json, .github/workflows/kernel-release-gate.yml, src/routeTree.gen.ts and the release contract. Leaf ownership remained disjoint: P0-01 route/codegen, P0-02 contract inventory/ADR, and P0-03 release integrity/coverage/package proof. No ownership collision or unplanned cross-leaf edit occurred.

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run test:release:source
  EVIDENCE: Exact Node 22 source release gate passed on 2026-08-25: conformance 421, chat 85, release unit 342 files, integration 570, types 4, imports 29, standards 1, SEO 32, UI contract 1, E2E 20, accessibility E2E 10, paid-operation E2E 7, CLI_PACKAGE_PASS, coverage 392 files/2656 tests, COVERAGE_RATCHET_PASS files=699, and the final production build completed successfully.

- [x] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: The generated route tree is current; /api/v1/operations/call is the single canonical call path; ADR-035 no longer describes stale /execute semantics; and the measured inventory records 39 HTTP, 14 MCP, 12 CLI and 5 planned public surfaces with an owner for each surface class.

- [x] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: The full clean-source release suite passed, npm audit --audit-level=high reported zero vulnerabilities, git diff --check passed, generated-source verification detects generator-caused drift while preserving pre-existing user changes, and owned production files contain no placeholder implementation. Expected negative-path logs did not alter test or build outcomes.

- [x] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: Driver rerun returned ALL MET (21 met), independently reran raw release, audit and diff checks, and attempted to falsify coverage reproducibility. That pass exposed order-sensitive V8 counters, replaced them with exact @vitest/coverage-istanbul@4.1.9 instrumentation, recalibrated the measured executable-source ledger to 699 files, and added a deterministic async CodeBlock test before accepting the phase.
