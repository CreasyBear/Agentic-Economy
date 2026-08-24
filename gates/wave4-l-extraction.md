# Gates: Packet L retained-boundary extraction

Scope: Remove final retained imports of legacy answer/harness modules without changing retained Action, supply, evidence, CLI, SEO, rate-limit, error, or request-boundary behavior.

- [x] G1: Retained production and named retained tests import no scheduled legacy module.
  CHECK: ! rg -n "modules/(answer|answer-thread|harness|external-run)|components/ae/chat" src/modules/action-invocation tools/dev/fixtures tests/eval/adr009* tests/unit/capability-supply tests/seo/agent-skill.test.ts tests/unit/market-terminal/cli-errors-harness.ts && echo EXTRACTION_IMPORTS_OK
  EXPECT: EXTRACTION_IMPORTS_OK
  EVIDENCE: `d8d07a9b9` removed the final selected retained imports; the exact scan returned `EXTRACTION_IMPORTS_OK`. The two temporary SSRF allowlist literals are path inventory, not imports, and remain only until their legacy consumers are atomically deleted in Packet M.

- [x] G2: ADR-009, quote-transfer, provider/capability continuity, public semantic, SEO, errors, CLI, rate-limit, SSRF, request-boundary, imports, chat conformance, typecheck, and lint pass.
  CHECK: npm exec -- vitest run tests/eval/adr009-composition-direct-control.test.ts tests/eval/adr009-transfer-comparison.test.ts tests/unit/capability-supply/supplied-candidate-quote-transfer.test.ts tests/unit/provider-operation-fixture/development-provider-operation.test.ts tests/unit/routes/public-semantic-comfort.test.tsx tests/seo/agent-skill.test.ts tests/unit/lib/errors.test.ts tests/unit/server/api-request-boundary.test.ts tests/unit/security/ssrf-surface-drift.test.ts tests/integration/chat-anonymous-transport.test.ts tests/unit/deployment/deployment-manifest.test.ts --reporter=dot && npm run test:cli-package && npm run test:imports && npm run test:chat:conformance && npm run typecheck && npm run lint && echo EXTRACTION_BEHAVIOR_OK
  EXPECT: EXTRACTION_BEHAVIOR_OK
  EVIDENCE: After `d0f55de08` corrected the packet boundary, the targeted suite passed 80/80, chat conformance 85/85, imports 28/28, CLI package, typecheck, and lint all passed.

- [x] G3: Exact chat/Operation rate limits remain and answer limits are absent.
  CHECK: rg -n "chat-submit|chat-anonymous-edge|chat-anonymous" src/lib/server/rate-limit.ts convex/lib/rateLimit.ts convex/rateLimit.ts && ! rg -n "answer-turn-submit|answer-stream" src/lib/server/rate-limit.ts convex/lib/rateLimit.ts convex/rateLimit.ts && echo RATE_LIMIT_EXTRACTION_OK
  EXPECT: RATE_LIMIT_EXTRACTION_OK
  EVIDENCE: The three rate-limit surfaces contain signed-in and anonymous chat buckets and no answer bucket; the anonymous transport integration proof passed in the targeted suite.
