# Gates: Phase 1 repair B2 — Trusted reset replay

Scope: Close acceptance finding B2 exactly as specified in `reviews/phase-1-acceptance.md` while preserving deferred live deletion wiring.

Ownership: `tools/maturity-reset/**`, `tests/unit/principal-account/workload-context/legacy-identity-reset.test.ts`, `tests/maturity/leaf-P1-04.test.ts`, `tests/review/phase-1-reset-forged-receipt.test.ts`.

- [x] B2.1: A shape-valid fabricated receipt cannot attest deletion or report removed facts.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/review/phase-1-reset-forged-receipt.test.ts
  EXPECT: /passed/
  EVIDENCE: Driver rerun passed the acceptance test; the shape-valid receipt without a durable execution rejects `reset_receipt_untrusted`, never calls apply and leaves both legacy counts unchanged.

- [x] B2.2: Apply and replay bind to trusted execution identity/transaction and reject untrusted or mismatched receipts.
  EVIDENCE: Receipt is only a lookup hint. `readTrustedExecution` must return an adapter-attested record matching execution ref, transaction ref, plan digest and exact removed facts; missing or mismatched records fail closed.

- [x] B2.3: Success reports facts removed only after reconciled zero counts for every target and unchanged counts for all six protected canonical tables.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/unit/principal-account/workload-context/legacy-identity-reset.test.ts tests/maturity/leaf-P1-04.test.ts
  EXPECT: /passed/
  EVIDENCE: Driver rerun passed 21/21 across review, P1-04 maturity and reset unit files; nonzero targets reject `reset_target_not_empty` and protected drift rejects `reset_canonical_count_changed`.

- [x] B2.4: Replay is idempotent and post-state mismatch fails closed without a false applied result.
  EVIDENCE: Trusted replay returns the original execution/transaction refs without a second apply; malformed/table-mismatched post-state and receipt/execution mismatches reject deterministic typed errors.

- [x] B2.5: Changed reset paths have 100% statements, branches, functions and lines.
  EVIDENCE: Driver Istanbul rerun measured statements 131/131, branches 138/138, functions 42/42 and lines 119/119.

- [x] B2.6: Typecheck, owned lint, placeholder scan and diff check pass; no live Convex deletion adapter is introduced.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EXPECT: /exit 0/
  EVIDENCE: Executor and driver Node 22 typecheck passed; driver full lint passed with warnings denied, repair placeholder/ABANDON scan and diff check were clean. Source documents the durable atomic adapter contract but contains no live Convex deletion wiring.

- [x] B2.7: The four Unlazy passes complete, the repair is committed atomically, and no owned improvement remains.
  EVIDENCE: Executor completed all four passes, added missing execution/transaction audit refs during defect hunt, then committed exactly five owned files as `073d5fce663045eff4ca2d148c671c3b2f9a610b`.
