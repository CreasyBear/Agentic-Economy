# Agent-facing surfaces: one registry, three public shapes

**Date:** 29 September 2026
**Checkout:** `d104a8009`
**Lens:** HTTP API v1, the MCP server, and the CLI. Do they share one resource model and one verb set, or three shapes?
**Answer:** three public shapes over one internal action registry. MCP names are generated. CLI and HTTP are not thin generated clients of each other, and neither matches Stripe CLI/API parity or OpenRouter's single request surface.

This is a source reading of the current checkout. It is not a live call against a hosted origin.

## What "one model" would mean

Stripe's public model is the HTTP API. Resource commands in the [Stripe CLI](https://docs.stripe.com/cli) are generated from that API's OpenAPI description: `stripe payment_intents create` sends the same fields as `POST /v1/payment_intents`. A small set of local commands (`login`, `listen`, `trigger`) is not generated. The escape hatch `stripe get|post|delete /v1/...` still names the HTTP path.

OpenRouter publishes one HTTP contract, [OpenAI-compatible chat completions](https://openrouter.ai/docs/api/reference/overview). Official SDKs are clients of `POST /api/v1/chat/completions`. Server tools are fields on that same request, not a second catalogue of renamed verbs.

AE's intended model is the action registry in `src/modules/actions/index.ts`: one `defineAction` id, one Zod input schema, one `run`. HTTP routes, MCP `tools/call`, and most CLI commands are supposed to be projections of that registry. The projections do not share names, do not share envelopes, and do not share the same verb for Call.

## The three spellings

| Intent | Action id | HTTP | MCP tool | CLI |
|---|---|---|---|---|
| Search Tools | `registry.tools.search` | `POST /api/v1/market-tools/search` | `ae_registry_tools_search` | `ae search "<job>"` |
| Describe one Tool | `registry.tools.describe` | `POST /api/v1/market-tools/describe` | `ae_registry_tools_describe` | `ae describe <tool-ref>` |
| Compare Tools | `registry.tools.compare` | `POST /api/v1/market-tools/compare` | `ae_registry_tools_compare` | `ae compare <ref> <ref> ...` |
| Quote | `tool.quote` | `POST /api/v1/tools/quote` | `ae_tool_quote` | `ae quote` **and** the first step of `ae call` |
| Call | `tool.call` | `POST /api/v1/tools/call` | `ae_tool_call` | no standalone command; second step of `ae call` |
| Procure | `tool.procure` | `POST /api/v1/tools/procure` | `ae_tool_procure` | `ae procure --input` |
| Saved Tools | `market.savedTools.{list,save,remove}` | `POST /api/v1/saved-tools/{list,save,remove}` | `ae_market_savedTools_*` | `ae saved list\|save\|remove` |
| Missing demand | `marketDemand.{record,list,status,withdraw}` | `POST /api/v1/market-requests` and `/list`, `/status`, `/withdraw` | `ae_marketDemand_*` | `ae request create\|list\|status\|withdraw` |
| Account | `agentAccess.{whoami,balance,activity}` | `GET /api/v1/account`; `POST /api/v1/account/balance` and `/activity` | `ae_agentAccess_*` | `ae account status\|balance\|activity` |
| Fund | `funding.handoff.{config,create,status}` | `GET /api/v1/account/funding/config`; `POST /api/v1/account/funding-sessions` | `ae_funding_handoff_*` | **not these actions.** `ae fund` opens `/owner/credit#fund` |
| Reconcile | `call.reconcile` | `POST /api/v1/calls/{callRef}/reconcile` | `ae_call_reconcile` | `ae recover` |
| Call list | `call.list` | `GET /api/v1/calls` | `ae_call_list` | `ae history` |

MCP names are the only mechanical projection: `mcpToolName` is `` `ae_${action.id.replace(/\./g, '_')}` `` (`src/modules/actions/index.ts:181-184`). HTTP paths are a hand-written route contract per action family. CLI command names are a third vocabulary in `tools/ae/commands/manifest.ts`.

## Who calls what

**CLI is an HTTP client, not an in-process action runner.** Search, describe, compare, saved, request, quote, procure, and call recovery all `callJson` the route-contract path and parse the HTTP JSON with the action schema. Example: `ae search` posts `toolCatalogSearchInputSchema` to `TOOL_MARKET_SEARCH_PATH` (`tools/ae/commands/search.ts:31-53`). `CLI_ACTION_ADAPTERS` (`tools/ae/commands/action-adapters.ts:26-116`) is a hand list that must mention every action declaring `surfaces: 'cli'`. It is a conformance checklist, not a generator.

**MCP is an in-process action host, not an HTTP client.** `createAeMcpServer` registers each admitted action and calls `action.run({ data, context: { caller: 'mcp', ...services } })` (`src/lib/server/mcp-api.ts:558-611`). It does not POST `/api/v1/...`. The tool list is role-filtered by `MCP_TOOLSETS` (`src/modules/actions/mcp-toolsets.ts:4-15`) before the action's own authority check runs again.

**HTTP routes are a third adapter.** Market search and describe call the same `action.run` with `caller: 'http'` (`src/routes/api.v1.market-tools.search.ts:42-45`, `src/routes/api.v1.market-tools.describe.ts:24-27`). They are not generated from the registry: each route file chooses method, path, body limit, auth, and cache headers.

So the shared core is real for the verbs that were wired to `defineAction`. The public clients are not thin generated views of the HTTP API.

## Payload comparison

### Search

Shared input schema: `{ query, source?, limit?, cursor?, filters? }`, query 1–200, limit 1–12 default 8 (`src/modules/registry/tool-choice-contracts.ts:56-62`, `src/modules/common/search-query.ts:1`).

- HTTP and MCP pass that object through.
- CLI joins positional words into `query` and maps flags onto the same object (`tools/ae/commands/search.ts:14-37`). `--json` then adds `nextPageCommand` and `saveNeedCommand`, which are not in the HTTP body (`search.ts:107-109`). Plain text prints a subset.
- MCP success is not the HTTP JSON. It returns MCP `content[]` text plus `structuredContent: { result, next }` (`src/lib/server/mcp-api.ts:631-634`).
- Authenticated HTTP and authenticated MCP may attach `saveNeed` via `withAuthorizedSaveNeed`. Anonymous search does not (`api.v1.market-tools.search.ts:29-48`; MCP at `mcp-api.ts:622-627`).

Same resource, three envelopes.

### Describe

Shared body `{ toolRef }` where `toolRef` matches `operation:v1:` plus 64 hex digits (`tool-choice-contracts.ts:63-65`). CLI passes that body from one positional argument (`tools/ae/commands/describe.ts:22-30`). MCP takes the same object as tool arguments and wraps the result. Help text in the manifest offers `ae describe <tool-ref> [--technical]` (`manifest.ts:243-247`); `runDescribeCommand` never reads `options.technical`. `ae search --technical` is an explicit refusal (`search.ts:24-28`).

### Compare

The action schema allows **one to four** `toolRefs` (`src/modules/capability-supply/tool-schemas.ts:182`). The parameter description says the same (`tool-action-contracts.ts:66-68`). The CLI parses that schema, then **rejects a single ref** and tells the caller to describe instead (`tools/ae/commands/compare.ts:20-44`). HTTP and MCP will accept a one-ref compare that the CLI will not send. JSON CLI output also adds `nextCommands` (`compare.ts:63-76`).

### Quote and call

This is the verb split that matters.

| Surface | What "call" means | Body |
|---|---|---|
| HTTP `POST /api/v1/tools/quote` and MCP `ae_tool_quote` | Price and terms only. No Call. | `{ toolRef, input }` (`quote.actions.ts:12-24`, route `quote.actions.ts:85-91`) |
| HTTP `POST /api/v1/tools/call` and MCP `ae_tool_call` | Execute one existing Quote. | `{ quoteRef, idempotencyKey }` only (`call.actions.ts:12-24`, path `/api/v1/tools/call` in `tool-projection-types.ts:13`) |
| CLI `ae quote` | Same as HTTP quote. | `<tool-ref> --input '<json>'`, then `POST /api/v1/tools/quote` (`call.ts:341-350`) |
| CLI `ae call` | Quote, then Call, then an optional local wait. | `<tool-ref> --input '<json>' [--wait]`. The Call body is built inside the CLI from the Quote. `ae call resume <recovery-ref>` reads a **local** journal, checks `GET /api/v1/account`, and retries the stored `{ quoteRef, idempotencyKey }` (`call.ts:240-305`, comment at `call.ts:335-339`) |

An agent that learned `ae call` cannot replay that command as `ae_tool_call` or as `POST /api/v1/tools/call`. The MCP and HTTP call tools refuse a body that contains `toolRef` and `input`. The CLI conformance adapter records `tool.quote` as the `call` command, not as `quote` (`action-adapters.ts:61-66`), even though both commands exist.

A refused Quote whose continuation is `funding.handoff.create` is rewritten by the CLI to `ae fund` (`call.ts:326-330`). `ae fund` does not call `funding.handoff.create`. It prints a browser URL (`manifest.ts:324-330`). MCP exposes the real handoff tools because those actions declare `surfaces: ['http', 'mcp']` and sit in the account toolset (`funding-handoff.actions.ts:70-102`, `mcp-toolsets.ts:7`). The CLI surface omits them on purpose, then substitutes a different verb in the error path.

### Procure

One id, one path, one schema on all three: `POST /api/v1/tools/procure`, discriminated union `kind: 'need' | 'exact'` (`procure.ts:11-23`). CLI is `ae procure --input '<json>'` (`manifest.ts:340-349`). The schema is shared. The verb still hides two journeys: `need` selects and returns input requirements; `exact` quotes and calls. MCP and HTTP callers see that union. The CLI does not offer a shorter flag form, so this is the closest of the nine verbs to a generated client, aside from the MCP envelope wrap.

### Saved

HTTP and MCP take the action body: list is `{}`; save is `{ kind: 'ae_callable', toolRef }` or `{ kind: 'external_listing', resource | id }`; remove has no compact `id` form (`saved-tools.contracts.ts:15-23,99-103`). CLI `ae saved save <tool-ref|resource-url|listing-id>` parses the positional string back into that union, and it accepts an `http:` URL that the schema then has to judge (`tools/ae/commands/saved.ts:21-29`). List/save/remove are POST subpaths, not `GET /saved-tools` and `DELETE /saved-tools/:id`.

### Demand

The product word in the registry is `marketDemand`. The HTTP collection is `market-requests`. The CLI command is `request`. Create's action requires `idempotencyKey`; the CLI generates a UUID when `--idempotency-key` is omitted (`tools/ae/commands/request.ts:73-79`, manifest note at `manifest.ts:219`). List and status are POST with a JSON body, not GET query parameters (`market-demand.actions.ts:22-54`).

### Account

`agentAccess.whoami` is `GET /api/v1/account` with an empty body (`account.actions.ts:21-35`). Balance and activity are POST (`account.actions.ts:37-53`). CLI `ae account status [market|provider]` does not send a market/provider field: the bracket only chooses which local credential to attach (`manifest.ts:287-288`). `ae account connections` and `ae account disconnect` are local credential-file commands. They have no action id and no HTTP route. MCP account tools are the three `agentAccess.*` actions plus three funding-handoff actions, not the local credential store.

## What each surface has that the others do not

**Declared MCP but not listed.** `registry.search` and `registry.detail` set `surfaces: ['http', 'agentJson', 'mcp']` (`registry.actions.ts:130,424`). `listMcpActions` only returns actions that appear in `MCP_TOOLSETS` (`actions/index.ts:171-174`, `mcp-toolsets.ts:19-24`). Those two business-registry actions are not in a toolset, so a client never sees `ae_registry_search`. The surface flag overclaims.

**HTTP only, outside the action registry.** These routes are a second HTTP vocabulary, not projections of `defineAction`:

- `GET /api/v1/registry` browses the external directory with query parameters (`src/routes/api.v1.registry.ts:22-26`). It is not `registry.tools.search`.
- `POST /api/v1/funding/quote` prices an owner credit top-up (`src/routes/api.v1.funding.quote.ts:16-19`). It is not `tool.quote`.
- Business portfolio routes, catalogue status, market metrics, release, sandbox reference, and chat turns sit beside the action routes with their own paths.

**CLI only, no action.** `connect`, `doctor`, `config`, `manifest`, `chat`, `fund`, `revoke`, `account connections`, `account disconnect`, and `call resume`. `wait` polls `call.status` in a loop (`action-adapters.ts:86-90`). `status` is `GET /api/v1/status/{ref}` for `journey.status`, a different path from `GET /api/v1/calls/{callRef}`.

**Reads are not a consistent HTTP method.** Tool search, describe, compare, saved list, demand list, and account balance are POST. Account self and call list/status are GET. Stripe would use GET for the reads and a resource noun. AE uses a command path either way.

## Could MCP and CLI be thin generated clients of the HTTP API?

**CLI, for the action-backed commands: almost, and it already is a client — just not a generated one.** The route contracts (`method`, `path`, `actionId`) and the Zod input schemas are enough to emit `ae search`, `ae describe`, `ae compare`, `ae procure`, `ae saved`, `ae request`, `ae quote`, `ae history`, `ae cancel`, and `ae recover` as HTTP calls. What a generator would not get from the HTTP routes:

- `ae call` composes quote then call and keeps a local recovery journal.
- `ae fund` / `ae revoke` are browser handoffs, and the quote-refusal path rewrites `funding.handoff.create` into `ae fund`.
- `connect`, `doctor`, `chat`, `config`, and local credential commands are process-local.
- Several help lines override `formatCliArgs` because the real argv does not match the action parameter list (`manifest.ts:134-140`, overrides at `219`, `351`, `405`, `412`).

Generating the CLI from OpenAPI would match Stripe only after those compositions are either deleted or marked as local commands the way Stripe marks `listen`. Today the hand list in `CLI_ACTION_ADAPTERS` drifts by design: `tool.quote` is pinned to the `call` command.

**MCP: a generated HTTP client would be a step sideways, not the missing generator.** MCP already generates its tool name and input schema from the action registry. It does not speak HTTP, so it also does not speak problem+json: failures become MCP tool results with `isError: true`, and successes become `{ result, next }`. Pointing MCP at the HTTP routes would unify the success body with curl and the CLI only if the wrapper were removed. It would also re-enter the HTTP auth, rate-limit, and service-wiring path that the in-process adapter already shares with the route handlers. The registry is the better generation source. HTTP is not a complete description of the public model, because of the extra routes above and because MCP's admitted set is `MCP_TOOLSETS`, not "every route".

**OpenRouter's shape is the opposite choice.** One path, one body, many clients. AE would look like that only if an agent could search, describe, quote, and call with the same JSON on HTTP, on MCP `arguments`, and on CLI `--json`, under one name per verb. The registry is already trying to be that JSON. The public names and the Call composition are what keep it three products.

## Rebuild implication

Keep the action registry as the only resource model. Treat these as the gaps that stop HTTP, MCP, and CLI from being one verb set:

1. **Call.** Either teach CLI `call` to mean `{ quoteRef, idempotencyKey }` and keep quote+call as an explicitly local workflow, or stop exposing `tool.call` as a peer of `ae call`. Do not leave both as "call".
2. **Names.** Project one public id. `marketDemand` / `market-requests` / `request`, `call.reconcile` / `recover`, and `call.list` / `history` are three spellings of one action.
3. **Envelopes.** HTTP returns the action result. MCP wraps it. CLI `--json` sometimes extends it. A generated client cannot do that and still claim parity.
4. **Admission lists.** `surfaces: 'mcp'` on `registry.search` does not list the tool. `surfaces` without a toolset entry is not a contract.
5. **Do not generate funding or registry-browse from the Tool routes.** `POST /api/v1/funding/quote` and `GET /api/v1/registry` are different resources that reuse the words quote and search.

Stripe parity is available for the commands that are already `callJson` of a route contract. It is not available for `ae call`, `ae fund`, or MCP until those stop inventing a second verb or a second body.
