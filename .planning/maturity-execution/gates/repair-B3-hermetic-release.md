# Gates: Phase 1 repair B3 — Hermetic release/import proof

Scope: Close acceptance finding B3 exactly as specified in `reviews/phase-1-acceptance.md` without editing root package composition.

Ownership: `tests/imports/operation-product-legacy-independence.test.ts` and focused non-shared release/import tests created by this leaf. `package.json`, `package-lock.json`, root scripts and shared release composition remain driver-owned.

- [x] B3.1: A focused red test proves the clean-state failure originates from consuming absent ignored `packages/cli/dist/ae.js`.
  EVIDENCE: With the ignored dist tree absent, the original exact import suite failed 28/29 with ENOENT at the direct `packages/cli/dist/ae.js` read.

- [x] B3.2: The correction proves legacy independence from tracked/source inputs or gives the driver a tested exact shared-composition change.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:imports
  EXPECT: /passed/
  EVIDENCE: The boundary now scans tracked `tools/ae/**/*.ts`, explicitly including `tools/ae/cli.ts`; driver rerun passed 29/29 imports. No shared package-composition change was required.

- [x] B3.3: The frozen G3 command passes with `packages/cli/dist` absent and no undeclared manual build.
  EVIDENCE: Executor passed frozen G3 twice; driver independently reproduced Node 22 typecheck plus 29/29 imports with `CLI_DIST_ABSENT_BEFORE` and `CLI_DIST_ABSENT_AFTER`.

- [x] B3.4: Repeating from absent `packages/cli/dist` proves the result is non-stateful.
  EVIDENCE: Executor repeated the exact check twice and the driver repeated it once; the directory remained absent after every run and no manual build command ran.

- [x] B3.5: Typecheck, focused lint, placeholder scan and diff check pass.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EXPECT: /exit 0/
  EVIDENCE: Executor and driver typecheck passed; executor focused lint denied warnings, placeholder scan and diff check passed; driver full lint and repair scan also passed.

- [x] B3.6: The four Unlazy passes complete, the repair is committed atomically, and no owned improvement remains.
  EVIDENCE: Executor completed all four passes and committed the one owned import test as `3f75013c504429afd503787a6d88f15adbcf5cea`; no package/script edit or integration change was needed.
