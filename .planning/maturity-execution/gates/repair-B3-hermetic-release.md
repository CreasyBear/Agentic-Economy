# Gates: Phase 1 repair B3 — Hermetic release/import proof

Scope: Close acceptance finding B3 exactly as specified in `reviews/phase-1-acceptance.md` without editing root package composition.

Ownership: `tests/imports/operation-product-legacy-independence.test.ts` and focused non-shared release/import tests created by this leaf. `package.json`, `package-lock.json`, root scripts and shared release composition remain driver-owned.

- [ ] B3.1: A focused red test proves the clean-state failure originates from consuming absent ignored `packages/cli/dist/ae.js`.
  EVIDENCE: pending

- [ ] B3.2: The correction proves legacy independence from tracked/source inputs or gives the driver a tested exact shared-composition change.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:imports
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] B3.3: The frozen G3 command passes with `packages/cli/dist` absent and no undeclared manual build.
  EVIDENCE: pending

- [ ] B3.4: Repeating from absent `packages/cli/dist` proves the result is non-stateful.
  EVIDENCE: pending

- [ ] B3.5: Typecheck, focused lint, placeholder scan and diff check pass.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EXPECT: /exit 0/
  EVIDENCE: pending

- [ ] B3.6: The four Unlazy passes complete, the repair is committed atomically, and no owned improvement remains.
  EVIDENCE: pending
