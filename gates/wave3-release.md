# Gates: Wave 3 release and browser proof

Scope: Make generated-source, deterministic chat, browser accessibility, and exact-revision staging evidence first-class release gates.

- [x] G1: Normal Convex generation runs before dry-run verification and committed-output drift check.
  CHECK: npm run generate:convex && npm run check:convex-codegen && git diff --exit-code -- convex/_generated && echo CODEGEN_SEQUENCE_OK
  EXPECT: CODEGEN_SEQUENCE_OK
  EVIDENCE: Node 22.22.0; normal generation, dry-run verification, and `git diff --exit-code -- convex/_generated` passed with no drift.

- [x] G2: Deterministic chat and retained Operation conformance remain green.
  CHECK: npm run test:chat:conformance && npm run test:conformance && echo RELEASE_CONFORMANCE_OK
  EXPECT: RELEASE_CONFORMANCE_OK
  EVIDENCE: `test:chat:conformance` and retained `test:conformance` both passed and emitted `RELEASE_CONFORMANCE_OK`.

- [x] G3: Browser/accessibility scripts no longer target legacy answer UI and pass through the release contract.
  CHECK: npm run test:e2e && npm run test:e2e:a11y && ! rg -n "AeChat|Answer ready|Agent-readable data|api/answer" tests/e2e tests/deploy-smoke/chat-* && rg -n "test:e2e|test:e2e:a11y|smoke:chat:staging" package.json && echo BROWSER_GATE_OK
  EXPECT: BROWSER_GATE_OK
  EVIDENCE: Commit `18ea46b20`; complete credential-free directory passed 20/20 and accessibility passed 10/10 under Node 22.22.0.

- [x] G4: Exact-revision staging workflow invokes HTTP streaming and proves a compact typed Operation card on a redacted public share.
  CHECK: test -f tests/deploy-smoke/chat-browser-staging.spec.ts && rg -n "smoke:chat:staging|AE_RELEASE_SOURCE_REVISION|playwright-chat-staging-smoke.json|chat-browser-staging" .github/workflows/kernel-release-gate.yml package.json playwright.chat-staging.config.ts tests/deploy-smoke/chat-* && rg -n "registry\.operations\.search exactly once|sharedSearchCard|toolCallId|shareUrl\.origin" tests/deploy-smoke/chat-browser-staging.spec.ts && echo STAGING_WORKFLOW_OK
  EXPECT: STAGING_WORKFLOW_OK
  EVIDENCE: Commits `8855703c5` and `5195538d7`; staged owner/public views require one completed search card, same-origin absolute share, and raw protocol exclusion; config/workflow proof passed.
