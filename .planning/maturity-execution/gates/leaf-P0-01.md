# Gates: P0-01 — Route generation and codegen baseline

Scope: The registry route is generated, type-safe and reproducible from a clean source tree.

Ownership: src/routes/api.v1.registry.ts, vite/config route-generation inputs, tests/maturity/leaf-P0-01.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `src/routes/api.v1.registry.ts:46` binds the committed path; regenerated `src/routeTree.gen.ts:52,287-289,1217-1221,1621` imports, types and registers it; `npm run typecheck` exits 0.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P0-01.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P0-01.test.ts
  EVIDENCE: Start at  16:55:22 | Duration  245ms (transform 66ms, setup 175ms, import 4ms, tests 8ms, environment 0ms)

- [x] G4: The critical negative invariant is proved: route generation cannot silently omit a committed public route.
  EVIDENCE: `tests/maturity/leaf-P0-01.test.ts:67-90` scans every literal public API route for its generated import and typed registration, and its omission mutant produces both expected diagnostics; targeted Vitest reports 3 passed.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P0-01.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: The reread made generated-quote style and Windows path separators explicit; the defect pass exercised a missing-route mutant plus the existing registry route suite (6 passed); targeted oxlint and `git diff --check` exit 0.
