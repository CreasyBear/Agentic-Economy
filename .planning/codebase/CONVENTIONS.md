# Coding Conventions

## Product vocabulary

- **Operation** is the callable market unit.
- The catalogue and canonical Operation contracts are product authority.
- Website chat is an adapter, not a second orchestration platform.
- `/api/v1/services/*` is compatibility vocabulary only; do not use it for new
  discovery, parity, or execution contracts.

## Canonical Actions and validation

- Define input/output at the owning Zod seam, then reuse it across HTTP, MCP,
  CLI, and chat. `src/modules/registry/operation-action-contracts.ts` and
  `src/modules/capability-execution/operation-execute-contract.ts` are current
  examples.
- Parse external values as `unknown`; validate before access and validate the
  successful backend/tool output again before exposing it.
- Prefer discriminated outcomes and exact literal unions to broad strings.
- Cross-module consumers import `public.ts`, `server.ts`, `convex.ts`, or a
  named `*.actions.ts`/`*.functions.ts` seam, never another domain's `internal/`.

## Chat boundary

- Chat has exactly these tool IDs:
  `registry.operations.search`, `registry.operations.detail`,
  `registry.operations.compare`, `registry.operations.inspectPlan`, and
  `operation.execute`.
- Use Agent `createTool({ inputSchema, execute })`; do not revive stale
  `args`/`handler` tool syntax or a custom tool loop.
- Read tools call existing Convex Operation projections. Execute crosses only
  through the existing keyless/SSRF-safe server core.
- Reserve per-generation tool and execute counters before awaiting tool work so
  provider-issued parallel reads remain safe.
- Sanitize model-facing strings and keep each tool result within 64 KiB.
- Do not add generic Action, arbitrary URL, invoke, payment, recovery, or supply
  tools to chat.

## Convex Agent ownership

- Let `@convex-dev/agent@0.7.1` own thread content, messages, deltas, tool calls,
  results, stream state, and component metadata.
- App tables are limited to `chatThreads` and `chatThreadShares` for owner auth,
  ordering/title/busy admission, and token-free share metadata.
- Use Clerk `tokenIdentifier` from `ctx.auth`; never authorize with a
  caller-supplied owner ID.
- Public shares list settled messages without stream synchronization and expose
  compact projections, never raw payloads.
- Anonymous chat uses `saveMessages: 'none'`; never create a durable anonymous
  component thread.

Before any Convex change, read `convex/_generated/ai/guidelines.md`. Registered
functions use object form with exact `args` and `returns`, bounded/indexed reads,
and internal visibility unless direct public access is intentional. Put Node
actions in their own `"use node"` files.

## UI and routes

- TanStack route filenames follow file-router grammar: `t.$threadId.tsx`,
  `s.$shareToken.tsx`, and `api.chat.anonymous.ts`.
- Keep one transcript/composer/card system under
  `src/components/ae/operation-chat/`; do not recreate artifacts, work logs,
  checkpoints, replay, model selection, or run administration.
- Use existing accessible primitives and semantic visual tokens. Query UI in
  tests by role/name and verify keyboard/accessibility behavior.
- Keep route files thin over module/server seams; routes do not import Convex
  schema or private domain implementation.

## Machine surfaces

- API/MCP/CLI own consequential invocation, payment, recovery, and supply.
- Discovery advertises canonical Operation reads/invoke, not browser anonymous
  chat or removed product surfaces.
- The CLI calls public HTTP contracts and never bypasses them through Convex.
- Preserve idempotency keys, exact Operation refs, evidence, and reconciliation
  states across adapters.

## Generated files and dependencies

- Never hand-edit `src/routeTree.gen.ts`, `convex/_generated/`, or
  `packages/cli/dist/ae.js`; run their normal generators/builds.
- Reuse installed/platform facilities before adding code. Delete obsolete code
  and packages before introducing an abstraction.
- Keep provider SDKs quarantined at reviewed adapters. Preserve the
  `@coinbase/cdp-sdk` Convex external-package seam and do not add `@x402/svm` as
  a root dependency.

## Tests and evidence

- Non-trivial logic leaves one focused runnable check with a negative case.
- Convex component tests use `agentTest.register`; model tests use `mockModel`.
- Run the narrow gate first, then relevant type/import/generated checks.
- Do not weaken scanners, regenerate expectations reflexively, or label local
  fixtures as hosted proof.
- Keep production migration evidence explicit: source, staging, drain, export,
  deployment, and deletion are different proof classes.
