# Gates: Phase 1 repair B1 — Trusted Account succession

Scope: Close acceptance finding B1 exactly as specified in `reviews/phase-1-acceptance.md`.

Ownership: `src/modules/principal-account/account/**`, `tests/unit/principal-account/account/**`, `tests/maturity/leaf-P1-02.test.ts`, `tests/review/phase-1-succession-forgery.test.ts`.

- [ ] B1.1: Caller-constructed succession authorization is rejected through the public Account seam with no Account or Ownership writes.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/review/phase-1-succession-forgery.test.ts
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] B1.2: Valid succession resolves one canonical trusted authorization bound to Account, incumbent, successor, current policy revision, freeze, delay and expiry, with unique independently verified participants meeting threshold.
  EVIDENCE: pending

- [ ] B1.3: Replay, stale policy, wrong parties/Account, duplicate participants, below threshold, missing freeze, expiry and `no_transfer` all fail closed deterministically.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/unit/principal-account/account/account-registry.test.ts tests/maturity/leaf-P1-02.test.ts
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] B1.4: Concurrent use of one authorization produces exactly one ownership change and no partial writes.
  EVIDENCE: pending

- [ ] B1.5: Changed Account authorization paths have 100% statements, branches, functions and lines.
  EVIDENCE: pending

- [ ] B1.6: Typecheck, owned lint, placeholder scan and diff check pass.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EXPECT: /exit 0/
  EVIDENCE: pending

- [ ] B1.7: The four Unlazy passes complete, the repair is committed atomically, and no owned improvement remains.
  EVIDENCE: pending
