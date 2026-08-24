# Technology Stack

## Runtime

- Node.js 22.x and npm 11.5.1.
- TypeScript 5.9.3 with strict, no-emit checking.
- React 19.2.7, TanStack Start 1.168.26, and TanStack Router 1.170.16.
- Convex 1.45.0 for application state, functions, scheduling, auth, and mounted
  components.
- Vercel Node server output through Vite 8.1.0 and the pinned Nitro nightly.
- Tailwind CSS 4.3.1 and existing Radix/local UI primitives.

## Chat and model stack

- `@convex-dev/agent` is pinned exactly to `0.7.1` and mounted in
  `convex/convex.config.ts`.
- `ai` and `@openrouter/ai-sdk-provider` provide streaming/tool transport.
- `src/modules/model-gateway/public.ts` is the single model-provider seam.
- Production configuration requires `OPENROUTER_API_KEY` and one
  `AE_LLM_MODEL`; there is no model catalogue or `AE_LLM_MODELS` fan-out.
- Agent context is 20 recent messages. There are no embeddings or RAG.

The old answer loop and its evaluator packages are absent. Chat uses Convex
Agent thread, message, stream, tool, and test APIs instead of owning parallel
persistence or orchestration.

## Durable components

`convex/convex.config.ts` mounts:

- Convex Agent for chat threads/messages/streams/tools;
- workpool for consequential Operation execution;
- rate limiter for HTTP, OAuth, chat, and other admissions;
- aggregate instances for owner activation and market evidence.

Clerk is the human identity provider. `ClerkProvider` wraps
`ConvexProviderWithClerk` for chat routes, and Convex verifies the Clerk JWT
issuer/audience through `convex/auth.config.ts`.

## Market and payment stack

- Zod 4.4.3 owns runtime contracts.
- `@modelcontextprotocol/sdk` owns MCP server/client transport.
- Stripe owns credit, Checkout, Connect, and payout integration.
- Coinbase CDP plus `@x402/core`, `@x402/evm`, `@x402/extensions`, Viem, and
  guarded Undici requests own x402 custody/payment evidence.
- `@coinbase/cdp-sdk` is listed in `convex.json` under
  `node.externalPackages`; Convex loads the retained Node dependency at runtime
  instead of bundling its optional platform graph.
- `@x402/svm` is not a root dependency. It may appear in the CDP package's
  optional peer metadata in the lockfile, but the app neither declares nor
  imports it.

## Verification stack

- Vitest 4.1.9, Testing Library, `convex-test`, and Convex Agent
  `agentTest.register`/`mockModel` for deterministic source tests.
- Playwright 1.61.1 for browser, accessibility, paid Operation, deployment, and
  exact-revision chat staging smoke.
- `eval/parity/` for Operation API/MCP/CLI parity.
- Oxlint for warning-denying lint; React Doctor remains an advisory check.

There is no Promptfoo or Braintrust dependency in the current package graph.
