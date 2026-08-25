# Gates: Phase 1 — Canonical principals and accounts

Scope: Integrate and prove every Phase 1 leaf.

- [x] G1: Every Phase 1 leaf is independently met.
  CHECK: node /Users/joelchan/.agents/skills/unlazy/scripts/gate-check.mjs --status gates/leaf-P1-01.md gates/leaf-P1-02.md gates/leaf-P1-03.md gates/leaf-P1-04.md
  EXPECT: /ALL MET/
  EVIDENCE: Node 22 status rerun reports `ALL MET (28 met)` across the four frozen child ledgers; each leaf was also rerun individually with its executable checks and reported `ALL MET (7 met)`.

- [x] G2: The phase integration driver composed all local exports without violating file ownership.
  EVIDENCE: Driver commit `b2a953922` alone adds `src/modules/principal-account/public.ts`, composes its six canonical tables in `convex/schema.ts`, and adds the cross-leaf integration contract. Leaf commits retain disjoint ownership recorded in `PHASE-1-BLAST-RADIUS.md`.

- [x] G3: Cross-leaf integration and regression checks pass.
  CHECK: cd ../.. && npm run typecheck && npm run test:imports
  EVIDENCE: Node 22 typecheck passed; the import-boundary suite passed 29/29 after building its declared CLI artifact. After the independent-verifier repair, the combined four-leaf, integration, and owned-unit suite passed 112/112 assertions in 10 files.

- [x] G4: Public contracts, errors, state transitions and documentation agree.
  EVIDENCE: The public barrel exposes each leaf contract without private imports; the integration test proves exact six-table composition, legacy-store separation, identity-binding non-ownership, and Principal isolation from Account selection/authority. Focused leaf suites exercise typed errors and every declared lifecycle/replacement transition.

- [x] G5: No sibling regression, hidden bypass, placeholder or silent failure remains.
  EVIDENCE: Repository lint passed with warnings denied; typecheck and import guards passed; targeted source/test scans found no `ABANDON`, TODO/FIXME/not-implemented marker, implicit superuser field, live reset deletion port, or sibling-table collision. An independent verifier found that an active stranger could assert another owner's Account; commits `556a95281` and `a870c9120` close that bypass by requiring ownership or active membership in the single selected active Account while preserving unrelated-counterparty attribution. The driver reproduced 34/34 P1-02 and 112/112 combined assertions afterward.

- [x] G6: The driver reran child checks and completed an adversarial phase-level defect pass.
  EVIDENCE: The driver reproduced all 28 leaf gates, 112/112 combined assertions, the four owned coverage receipts at 100%, typecheck, full lint, and import isolation. Independent adversarial probing exposed and then rechecked the active-stranger Account-context bypass; P1-02 now measures 100% statements (287/287), branches (147/147), functions (63/63), and lines (263/263). The integration contract also targets duplicate/missing schema composition, legacy/canonical overlap, identity-as-owner drift, and authority or implicit Account data on Principal records.
