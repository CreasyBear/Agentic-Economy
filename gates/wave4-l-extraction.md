# Gates: Packet L retained-boundary extraction

Scope: Remove final retained imports of legacy answer/harness modules without changing retained Action, supply, evidence, CLI, SEO, rate-limit, error, or request-boundary behavior.

- [ ] G1: Retained production and named retained tests import no scheduled legacy module.
  CHECK: ! rg -n "modules/(answer|answer-thread|harness|external-run)|components/ae/chat" src/modules/action-invocation tools/dev/fixtures tests/eval/adr009* tests/unit/capability-supply tests/seo/agent-skill.test.ts tests/unit/market-terminal/cli-errors-harness.ts && echo EXTRACTION_IMPORTS_OK
  EXPECT: EXTRACTION_IMPORTS_OK
  EVIDENCE: pending

- [ ] G2: ADR-009, quote-transfer, provider/capability continuity, public semantic, CLI, rate-limit, SSRF, and request-boundary checks pass.
  CHECK: npm exec -- vitest run tests/eval/adr009-composition-direct-control.test.ts tests/eval/adr009-transfer-comparison.test.ts tests/unit/capability-supply/supplied-candidate-quote-transfer.test.ts tests/unit/routes/public-semantic-comfort.test.tsx tests/unit/server/api-request-boundary.test.ts tests/unit/security/ssrf-surface-drift.test.ts --reporter=dot && npm run test:cli-package && echo EXTRACTION_BEHAVIOR_OK
  EXPECT: EXTRACTION_BEHAVIOR_OK
  EVIDENCE: pending

- [ ] G3: Exact chat/Operation rate limits remain and answer limits are absent.
  CHECK: rg -n "chat-submit|chat-anonymous-edge|chat-anonymous" src/lib/server/rate-limit.ts convex/lib/rateLimit.ts convex/rateLimit.ts && ! rg -n "answer-turn-submit|answer-stream" src/lib/server/rate-limit.ts convex/lib/rateLimit.ts convex/rateLimit.ts && echo RATE_LIMIT_EXTRACTION_OK
  EXPECT: RATE_LIMIT_EXTRACTION_OK
  EVIDENCE: pending
