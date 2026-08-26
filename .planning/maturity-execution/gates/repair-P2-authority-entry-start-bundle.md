# Gates: Phase 2 Start/Clerk built-dispatcher repair

Scope: Diagnose and repair the generated Start dispatcher source/build defect without weakening production Clerk composition or inventing test auth.

- [ ] G1: The clean-build reproducer records exact candidate, .vc-config entrypoint, full compiled serverFn ID, generated chunks/imports, HTTP request and the pre-fix `setErrorThrowerOptions` 500.
  EVIDENCE: pending

- [ ] G2: The source/plugin/dependency cause is identified and repaired without editing generated chunks, adding a test-only branch or removing production Clerk middleware.
  EVIDENCE: pending

- [ ] G3: A clean build launches the generated .vc-config Node handler and an actual compiled public serverFn returns successfully through `/_serverFn/<id>`.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:phase2:start-built-dispatcher
  EXPECT: /START_BUILT_DISPATCHER_PASS/
  EVIDENCE: pending

- [ ] G4: Unauthenticated and invalid-token protected requests fail closed through the same built dispatcher while production Clerk middleware remains present and ordered.
  EVIDENCE: pending

- [ ] G5: Client/server import, route bundle, SSRF, typecheck and exact build scans pass with no secret/key or client-bundle regression.
  EVIDENCE: pending

- [ ] G6: The exact regression is an early unchanged-release dependency and fails on the original missing-symbol artifact.
  EVIDENCE: pending

- [ ] G7: Source evidence is kept separate from hosted P9-01 genuine Clerk issuance/template evidence with revision and freshness rules preserved.
  EVIDENCE: pending

- [ ] G8: Four Unlazy passes complete with no further defect/polish finding; worker stops and reports every dependency/config/shared-file delta to the driver.
  EVIDENCE: pending
