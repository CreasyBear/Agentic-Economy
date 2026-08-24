# Gates: Wave 3 release and browser proof

Scope: Make generated-source, deterministic chat, browser accessibility, and exact-revision staging evidence first-class release gates.

- [ ] G1: Normal Convex generation runs before dry-run verification and committed-output drift check.
  CHECK: npm run generate:convex && npm run check:convex-codegen && git diff --exit-code -- convex/_generated && echo CODEGEN_SEQUENCE_OK
  EXPECT: CODEGEN_SEQUENCE_OK
  EVIDENCE: pending

- [ ] G2: Deterministic chat and retained Operation conformance remain green.
  CHECK: npm run test:chat:conformance && npm run test:conformance && echo RELEASE_CONFORMANCE_OK
  EXPECT: RELEASE_CONFORMANCE_OK
  EVIDENCE: pending

- [ ] G3: Browser/accessibility scripts no longer target legacy answer UI and are present in the release contract.
  CHECK: ! rg -n "AeChat|Answer ready|Agent-readable data|api/answer" tests/e2e tests/deploy-smoke/chat-* && rg -n "test:e2e|test:e2e:a11y|smoke:chat:staging" package.json && echo BROWSER_GATE_OK
  EXPECT: BROWSER_GATE_OK
  EVIDENCE: pending

- [ ] G4: Exact-revision staging workflow invokes both HTTP streaming and browser chat proof and uploads sanitized evidence.
  CHECK: test -f tests/deploy-smoke/chat-browser-staging.spec.ts && rg -n "smoke:chat:staging|AE_RELEASE_SOURCE_REVISION|playwright-chat-staging-smoke.json|chat-browser-staging" .github/workflows/kernel-release-gate.yml package.json playwright.chat-staging.config.ts tests/deploy-smoke/chat-* && echo STAGING_WORKFLOW_OK
  EXPECT: STAGING_WORKFLOW_OK
  EVIDENCE: pending
