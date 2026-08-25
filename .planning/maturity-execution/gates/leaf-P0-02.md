# Gates: P0-02 — Public contract inventory and ADR repair

Scope: Every public HTTP/MCP/CLI contract has one owner and `/api/v1/operations/call` is canonical in code and ADRs.

Ownership: .planning/adr, .planning/maturity-execution/contracts, tests/maturity/leaf-P0-02.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `.planning/maturity-execution/contracts/public-surface-inventory.json` inventories 39 HTTP contracts (38 TanStack and 1 Convex), 14 MCP tools, and 12 dispatched CLI commands with one canonical owner each; ADR-035 now names `POST /api/v1/operations/call`.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P0-02.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P0-02.test.ts
  EVIDENCE: Vitest at 16:58:42 reported 1 passed file and 4 passed tests in 1.09s.

- [x] G4: The critical negative invariant is proved: no current document calls `/execute` canonical.
  EVIDENCE: `rg -n '/api/v1/operations/execute' .planning/adr` returned no matches (`ADR_EXECUTE_ABSENT`), and the leaf test scans every current ADR and proves no `/api/v1/operations/execute` HTTP entry exists.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P0-02.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: The defect pass corrected an over-broad negative assertion, added the two omitted frozen-but-unimplemented invocation status/cancel paths, constrained owners to known bounded contexts, and then adversarially strengthened ADR checking so multiline wording cannot reintroduce the obsolete route; the final source/inventory comparison found no uncovered current surface.
