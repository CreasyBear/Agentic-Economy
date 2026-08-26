# Gates: P0-03 — Coverage, dependency and package integrity

Scope: Coverage ratchets, dependency policy and CLI/package release checks are executable and fail closed.

Ownership: tools/release, scripts, tests/release, tests/maturity/leaf-P0-03.test.ts

- [x] G1: The leaf's observable outcome is implemented completely under the frozen contract.
  EVIDENCE: `tools/release/{coverage-ratchet,maturity-release-integrity,verify-coverage-ratchet,verify-maturity-release-integrity}.ts` implement the coverage, exact-nightly and generated-source gates; `scripts/test-cli-package.mjs` verifies the exact packed artifact. The phase driver wired all three through `package.json` and the source release chain.

- [x] G2: A leaf-specific executable contract test exists.
  CHECK: cd ../.. && test -f tests/maturity/leaf-P0-03.test.ts && echo LEAF_TEST_PRESENT
  EXPECT: LEAF_TEST_PRESENT
  EVIDENCE: LEAF_TEST_PRESENT

- [x] G3: The leaf-specific contract test passes.
  CHECK: cd ../.. && npx vitest run tests/maturity/leaf-P0-03.test.ts
  EVIDENCE: Start at  16:57:22 | Duration  264ms (transform 80ms, setup 185ms, import 11ms, tests 3ms, environment 0ms)

- [x] G4: The critical negative invariant is proved: source release cannot pass with stale generated or unpackaged artifacts.
  EVIDENCE: The leaf test rejects generator-added and generator-rewritten snapshots, missing packed files, leaked repository TypeScript, ranged Nitro and mutable Nitro tags. The integrated Node 22 source verifier emitted `MATURITY_RELEASE_INTEGRITY_PASS nitro=3.0.1-20260628-090458-3df69609`; the live pack/install check emitted `CLI_PACKAGE_PASS`.

- [x] G5: Type checking passes with the leaf integrated through context-local exports.
  CHECK: cd ../.. && npm run typecheck
  EVIDENCE: > agentic-economy@0.1.0 typecheck | > tsc --noEmit

- [x] G6: Owned production files contain no placeholder implementation markers.
  CHECK: cd ../.. && if rg -n '(TODO|FIXME|not implemented)' tests/maturity/leaf-P0-03.test.ts 2>/dev/null; then exit 1; else echo NO_PLACEHOLDERS; fi
  EXPECT: NO_PLACEHOLDERS
  EVIDENCE: NO_PLACEHOLDERS

- [x] G7: The expert reread, defect hunt and free-polish pass found no remaining improvement.
  EVIDENCE: Final passes replaced the inherited `HOME` override with `AE_CONFIG_DIR`, changed generated freshness from dirty-tree rejection to before/after generator hashing, rejected mutable Nitro tags and traversal-like pack paths, excluded generated/test files from the ratchet, and made missing critical files fail closed. `git diff --check` then passed.
