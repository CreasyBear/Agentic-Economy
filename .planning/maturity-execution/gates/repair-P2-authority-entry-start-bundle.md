# Gates: Phase 2 Start/Clerk built-dispatcher repair

Scope: Diagnose and repair the generated Start dispatcher source/build defect without weakening production Clerk composition or inventing test auth.

Gate amendment record (2026-08-26, integration driver): the frozen G3 originally required, verbatim, “A clean build launches the generated .vc-config Node handler and an actual compiled public serverFn returns successfully through `/_serverFn/<id>`.” That wording incorrectly coupled the credential-free source gate to a positive Clerk-issued session/template outcome. Official Clerk mechanisms require a development instance and credentials for that positive issuance, which the accepted design assigns to hosted P9-01; inventing a local Clerk token or bypass is prohibited. G3 is therefore explicitly amended—not silently treated as met—to require the real handler and exact compiled call to reach unchanged production Clerk middleware with the bundle defect absent, while missing/invalid credentials fail closed. The original positive issuance requirement remains open at P9-01 with candidate/deployed revision and freshness binding.

- [x] G1: The clean-build reproducer records exact candidate, .vc-config entrypoint, full compiled serverFn ID, generated chunks/imports, HTTP request and the pre-fix `setErrorThrowerOptions` 500.
  EVIDENCE: `.planning/maturity-execution/PHASE-2-START-BUILT-DISPATCHER-EVIDENCE.md`; `AE_CANONICAL_BASE_URL=https://agentic-economy.test /Users/joelchan/.nvm/versions/node/v22.22.0/bin/node tools/maturity/phase-2-start-built-dispatcher.mjs --artifact-root /private/tmp/ae-p2-tanstack-probe.9fsKdm --server-fn readCanonicalBaseUrlServer --expect-regression` -> `START_BUILT_DISPATCHER_REGRESSION_REPRODUCED`.

- [x] G2: The source/plugin/dependency cause is identified and repaired without editing generated chunks, adding a test-only branch or removing production Clerk middleware.
  EVIDENCE: `.planning/maturity-execution/PHASE-2-START-BUILT-DISPATCHER-EVIDENCE.md`; driver-owned Vite 8.1.0 -> 8.2.2 / Rolldown 1.1.3 -> 1.2.5 dependency repair; no generated, application-source, Clerk, TanStack or middleware-order edit.

- [x] G3: A clean build launches the generated `.vc-config` Node handler, contains no unbound Clerk call, and an actual compiled serverFn request reaches unchanged production Clerk middleware and fails closed without Clerk development credentials.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:phase2:start-built-dispatcher
  EXPECT: /START_BUILT_DISPATCHER_PASS/
  EVIDENCE: Node 22 `npm run test:phase2:start-built-dispatcher` -> `START_BUILT_DISPATCHER_PASS`, 1/1 test; exact handler/ID/chunk/runtime in `.planning/maturity-execution/PHASE-2-START-BUILT-DISPATCHER-EVIDENCE.md`. Hosted positive issuance remains open at P9-01 per the amendment above.

- [x] G4: Missing-configuration and caller-shaped invalid-token requests fail closed through the same built dispatcher while production Clerk middleware remains present and ordered and caller-supplied principal/account context is not accepted.
  EVIDENCE: both actual requests return HTTP 500 at unchanged Clerk `no secret key provided`; exact eight-entry middleware order matches; no supplied authority value appears in observable output.

- [x] G5: Client/server import, route bundle, SSRF, typecheck and exact build scans pass with no secret/key or client-bundle regression.
  EVIDENCE: fresh named production build pass; `npm run typecheck` pass; `npm run test:imports` 11 files/29 tests; SSRF drift 1/1; generated artifact key-material scan none.

- [x] G6: The exact regression is an early unchanged-release dependency and fails on the original missing-symbol artifact.
  EVIDENCE: unchanged `test:maturity:coverage` selects `tests/maturity`; no-env test passes against the release-built project root; original artifact fails `--expect-source-fixed` and passes `--expect-regression` with the exact diagnostic.

- [x] G7: Source evidence is kept separate from hosted P9-01 genuine Clerk issuance/template evidence with revision and freshness rules preserved.
  EVIDENCE: source/hosted boundary and candidate-ref limitation recorded in `.planning/maturity-execution/PHASE-2-START-BUILT-DISPATCHER-EVIDENCE.md`; hosted positive Clerk issuance remains explicitly open at P9-01 under the amendment above.

- [x] G8: Four Unlazy passes complete with no further defect/polish finding; worker stops and reports every dependency/config/shared-file delta to the driver.
  EVIDENCE: four attributed passes in `.planning/maturity-execution/PHASE-2-START-BUILT-DISPATCHER-EVIDENCE.md`; only driver-owned Vite/lockfile and named-script shared deltas; disposable upgrade probe removed, retained pre-fix evidence untouched.
