# Codebase Structure

This map reflects the post-prune Operation-market source tree.

## Product paths

```text
src/
├── routes/
│   ├── market.tsx, operations*.tsx       # Catalogue and Operation detail
│   ├── t.new.tsx, t.$threadId.tsx        # Thin chat
│   ├── s.$shareToken.tsx                 # Read-only share
│   ├── api.chat.anonymous.ts             # Browser chat proxy
│   ├── api.v1.market-operations.*.ts     # Canonical Operation reads
│   ├── api.v1.operations.*.ts            # Invocation/recovery
│   ├── mcp.ts                            # MCP transport
│   └── llms[.]txt.ts, SKILL[.]md.ts      # Machine discovery
├── components/ae/
│   ├── market/                           # Catalogue cards/page
│   └── operation-chat/                   # One transcript/composer/card UI
├── modules/
│   ├── actions/                          # Canonical Action registry/tool contracts
│   ├── chat/                             # Share token and two-table schema
│   ├── registry/                         # Operation read Action contracts
│   ├── capability-supply/                # Publication, projection, keyless route
│   ├── capability-execution/             # Invoke/execute/recovery contracts
│   ├── action-invocation/                 # Durable consequential effect kernel
│   ├── agent-access/                      # API/MCP/CLI principal and OAuth access
│   ├── money/                             # Charging, payout, settlement
│   └── model-gateway/                     # Single OpenRouter seam
└── routeTree.gen.ts                       # Generated; never edit

convex/
├── chatAnonymous.ts, chatAdmission.ts     # Stateless protected browser chat
├── chatThreads.ts, chatMessages.ts        # Durable owner threads/messages
├── chatGenerate.ts, chatTools.ts          # Agent generation and five tools
├── chatShares.ts, chatExecute.ts          # Public compact shares/keyless Node action
├── capabilitySupplyOperation*.ts          # Canonical Operation projections
├── capabilityOperation*.ts                # Consequential invocation/recovery
├── schema.ts                              # App table composition
├── convex.config.ts                       # Agent/workpool/rate/aggregate mounts
└── _generated/                            # Generated; never edit

tools/
├── ae/                                    # External-agent CLI source
├── dev/                                   # Local orchestration and deterministic evidence
└── release/                               # Exact-deployment and gateway smoke

eval/parity/                               # Operation API/MCP/CLI parity
tests/                                     # Unit, integration, browser, a11y, imports, SEO
packages/cli/                              # Compiled distributable CLI
```

## Responsibility rules

- The catalogue and Operation contracts are product authority.
- `src/components/ae/operation-chat/` renders one thin UI; it does not own model
  loops, durable messages, tool-call records, or execution policy.
- `convex/chatTools.ts` adapts exactly five canonical Action contracts to Convex
  Agent tools. Read tools call existing Operation projections; execution crosses
  only through `convex/chatExecute.ts`.
- `src/modules/chat/internal/convex-schema.ts` defines only `chatThreads` and
  `chatThreadShares`. Agent component tables own thread content.
- API, MCP, and CLI call public Operation contracts. The CLI must not import
  Convex state or private module internals.
- `/api/v1/services/*` remains a compatibility projection only.
- `eval/parity/` is retained release evidence; removed answer/evaluator systems
  are not runtime architecture.

## Where changes belong

| Change | Location |
| --- | --- |
| Canonical Operation input/output | owning Zod schema in `src/modules/capability-*` or `src/modules/registry/` |
| Chat tool adapter | `convex/chatTools.ts`, without adding a sixth tool |
| Durable chat authorization/metadata | `convex/chatThreads.ts`, `convex/chatMessages.ts`, or `convex/chatShares.ts` |
| Anonymous transport policy | `src/routes/api.chat.anonymous.ts` and `convex/chatAnonymous.ts` |
| Catalogue UI | `src/components/ae/market/` and catalogue routes |
| Thin chat UI | `src/components/ae/operation-chat/` and `/t` or `/s` routes |
| Consequential execution | existing capability-execution/action-invocation seams |
| Machine contract | Operation HTTP routes, `src/lib/server/mcp-api.ts`, and `tools/ae/` |
| Architecture guard | `tests/imports/` |

## Generated and evidence paths

- `src/routeTree.gen.ts`, `convex/_generated/`, and `packages/cli/dist/ae.js`
  are generated; change sources and regenerate them.
- `output/`, `outputs/`, `playwright-report/`, and `test-results/` are ignored
  evidence/output paths.
- `.planning/codebase/` documents source truth and must never be imported by
  runtime code.
- `tools/dev/fixtures/` remains development-only even when a filename contains
  “harness”. Such retained test harnesses are not the removed product harness.
