# Gates: Phase 1 repair B2 — Trusted reset replay

Scope: Close acceptance finding B2 exactly as specified in `reviews/phase-1-acceptance.md` while preserving deferred live deletion wiring.

Ownership: `tools/maturity-reset/**`, `tests/unit/principal-account/workload-context/legacy-identity-reset.test.ts`, `tests/maturity/leaf-P1-04.test.ts`, `tests/review/phase-1-reset-forged-receipt.test.ts`.

- [ ] B2.1: A shape-valid fabricated receipt cannot attest deletion or report removed facts.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/review/phase-1-reset-forged-receipt.test.ts
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] B2.2: Apply and replay bind to trusted execution identity/transaction and reject untrusted or mismatched receipts.
  EVIDENCE: pending

- [ ] B2.3: Success reports facts removed only after reconciled zero counts for every target and unchanged counts for all six protected canonical tables.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/unit/principal-account/workload-context/legacy-identity-reset.test.ts tests/maturity/leaf-P1-04.test.ts
  EXPECT: /passed/
  EVIDENCE: pending

- [ ] B2.4: Replay is idempotent and post-state mismatch fails closed without a false applied result.
  EVIDENCE: pending

- [ ] B2.5: Changed reset paths have 100% statements, branches, functions and lines.
  EVIDENCE: pending

- [ ] B2.6: Typecheck, owned lint, placeholder scan and diff check pass; no live Convex deletion adapter is introduced.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EXPECT: /exit 0/
  EVIDENCE: pending

- [ ] B2.7: The four Unlazy passes complete, the repair is committed atomically, and no owned improvement remains.
  EVIDENCE: pending
