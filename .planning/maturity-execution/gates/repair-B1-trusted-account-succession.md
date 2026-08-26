# Gates: Phase 1 repair B1 — Trusted Account succession

Scope: Close acceptance finding B1 exactly as specified in `reviews/phase-1-acceptance.md`.

Ownership: `src/modules/principal-account/account/**`, `tests/unit/principal-account/account/**`, `tests/maturity/leaf-P1-02.test.ts`, `tests/review/phase-1-succession-forgery.test.ts`.

- [x] B1.1: Caller-constructed succession authorization is rejected through the public Account seam with no Account or Ownership writes.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/review/phase-1-succession-forgery.test.ts
  EXPECT: /passed/
  EVIDENCE: Driver rerun passed the focused acceptance test; an attacker-supplied structural object plus unknown `sau_` reference rejects `succession_authorization_not_found`, preserves both original object identities, leaves one Ownership fact and creates no Membership.

- [x] B1.2: Valid succession resolves one canonical trusted authorization bound to Account, incumbent, successor, current policy revision, freeze, delay and expiry, with unique independently verified participants meeting threshold.
  EVIDENCE: `registerSuccessionAuthorization` resolves adapter-trusted approval refs inside the transaction, rejects duplicate participant and verification refs, requires active independent participant Principals and threshold, and persists the bound `sau_` authorization plus participant evidence before `succeedOwnership` can resolve it.

- [x] B1.3: Replay, stale policy, wrong parties/Account, duplicate participants, below threshold, missing freeze, expiry and `no_transfer` all fail closed deterministically.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npx vitest run tests/unit/principal-account/account/account-registry.test.ts tests/maturity/leaf-P1-02.test.ts
  EXPECT: /passed/
  EVIDENCE: Driver focused rerun passed 38/38 across review, P1-02 maturity and Account unit files, covering each named rejection and strict expiry boundary.

- [x] B1.4: Concurrent use of one authorization produces exactly one ownership change and no partial writes.
  EVIDENCE: Two simultaneous uses produced one fulfillment and one `account_revision_conflict`; exactly one new commit and one successor Ownership were recorded. The authorization was consumed in that same revision-checked commit and replay rejected `succession_authorization_consumed`.

- [x] B1.5: Changed Account authorization paths have 100% statements, branches, functions and lines.
  EVIDENCE: Driver Istanbul rerun measured statements 349/349, branches 217/217, functions 73/73 and lines 324/324.

- [x] B1.6: Typecheck, owned lint, placeholder scan and diff check pass.
  CHECK: PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EXPECT: /exit 0/
  EVIDENCE: Executor and driver Node 22 typecheck passed; driver full lint passed with warnings denied, repair placeholder/ABANDON scan and `git diff --check` were clean. Convex Authz foundation exists and its four-shape scan/manual classification found zero actionable hits.

- [x] B1.7: The four Unlazy passes complete, the repair is committed atomically, and no owned improvement remains.
  EVIDENCE: Executor completed implement/domain-reread/defect-hunt/free-polish, fixing expiry-boundary and replay-error ordering defects, then committed exactly six owned files as `58a73a444727d319676cb3ebc14262c5566f0af4`.
