# Gates: Phase 1 — Canonical principals and accounts

Scope: Integrate and prove every Phase 1 leaf.

- [x] G1: Every Phase 1 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P1-01.md gates/leaf-P1-02.md gates/leaf-P1-03.md gates/leaf-P1-04.md
  EXPECT: /ALL MET/
  EVIDENCE: Node 22 status rerun reports `ALL MET (28 met)` across the four frozen child ledgers; each leaf was also rerun individually with its executable checks and reported `ALL MET (7 met)`.

- [x] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: Driver commit `b2a953922` added `src/modules/principal-account/public.ts`, composed the original six canonical tables in `convex/schema.ts`, and added the cross-leaf integration contract. Repair integration commit `dc3e991aa` verifies the three additional context-local recovery-approval/authorization tables, for nine principal-account tables and 63 exact schema tables total. Leaf commits retain disjoint ownership recorded in `PHASE-1-BLAST-RADIUS.md`.

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run typecheck && npm run test:imports
  EVIDENCE: Node 22 typecheck passed and the import-boundary suite passed 29/29 directly from a fresh checkout with `packages/cli/dist` absent before and after the frozen command. Repair `3f75013c5` scans the tracked TypeScript CLI source instead of an ignored prebuilt artifact. The combined four-leaf, integration and owned-unit suite passed 120/120 assertions in 10 files.

- [x] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: The public barrel exposes each leaf contract without private imports; the integration test proves exact six-table composition, legacy-store separation, identity-binding non-ownership, and Principal isolation from Account selection/authority. Focused leaf suites exercise typed errors and every declared lifecycle/replacement transition.

- [x] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: Repository lint passed with warnings denied; typecheck and import guards passed; targeted source/test scans found no operational `ABANDON`, TODO/FIXME/not-implemented marker, implicit superuser field, live reset deletion adapter, or sibling-table collision. Earlier active-stranger Account-context repairs remain intact. Acceptance repairs `58a73a444` and `073d5fce6` additionally close caller-forgeable succession and reset-receipt trust failures; both review reproducers now prove safe rejection. The driver reproduced 38/38 focused Account, 21/21 focused reset and 120/120 combined assertions afterward.

- [x] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: The repair driver reproduced all 28 frozen leaf gates, 120/120 combined assertions, both repaired review reproducers, targeted 100% Account and reset coverage, typecheck, full lint, authz scans and hermetic import isolation. From a fresh clone at exact repair ref `39e2283cc`, with `packages/cli/dist` absent and no undeclared build, frozen G3 passed and the unchanged Node 22 `npm run test:release:source` completed with deployment-manifest validation, 421 conformance, 85 chat-conformance, generated-source integrity, 2,575 unit, 570 integration, 4 type, 29 import, 1 standards, 32 SEO, 1 UI-contract, 20 E2E, 10 accessibility E2E, 7 paid-operation E2E, CLI package proof, 2,779 maturity-coverage assertions over 403 files, `COVERAGE_RATCHET_PASS files=708`, production build success and a clean tracked worktree. Final source acceptance remains reserved for the fresh context-independent Ox task.
