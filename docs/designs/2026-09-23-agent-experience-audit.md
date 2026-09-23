# Agent Experience audit and baseline, 23 September 2026

## 1. Verdict

AE's commerce core already matches the gold-standard agentic-commerce pattern: a binding quoted maximum, owner budget, idempotent Call, settlement kept distinct from fulfilment, and a durable recovery identity. AE is ahead of x402's core, which expressly leaves client budgets outside its scope. This is a source-level architectural assessment, not proof of a live charge or supplier fulfilment (`src/lib/server/call-api.ts:84-155`; `src/modules/agent-access/policy.ts:49-103`; `tools/ae/lib/call-recovery-journal.ts:138-160`; [x402 v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)). One action registry projected to CLI, MCP and HTTP fits the Stripe/GitHub practice of scoped, machine-readable actions (`src/modules/actions/index.ts:101-166`; `tests/imports/tool-surface-conformance.test.ts:9-24`; [Stripe MCP](https://docs.stripe.com/mcp); [GitHub MCP](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md)).

The gaps are at the edges: streaming, answer synthesis, MCP currency, error and exit fidelity, and discovery claims that overstate executable behaviour. **One action registry, one event vocabulary, one search envelope, projected to CLI, MCP, HTTP and chat.** AX means completion of discover → quote → authorised Call → receipt/recovery, not simply publication of another manifest ([AX](https://biilmann.blog/articles/introducing-ax/); `tools/ae/commands/manifest.ts:348-360`; `src/modules/chat/search-presentation.ts:34-49`). Scores below concern source, not deployment.

## 2. Scorecard

Legend: **P** present, **p** partial, **A** absent. Each cell cites its audit evidence; gold is a documented exemplar, not an AE implementation claim. The decided summaries are cross-surface judgements, so an individual partial score does not turn a missing shared capability into a present one.

| Axis | CLI | MCP | HTTP | Chat | Gold exemplar | Gap / decided summary |
|---|---|---|---|---|---|---|
| A1 Discovery | p: manifest/help (`tools/ae/commands/manifest.ts:401-410,481-540`) | P: endpoint/catalogue (`src/modules/discovery/internal/api-catalog.ts:63-79`) | p: selective OpenAPI (`src/modules/discovery/internal/openapi-document-builder.ts:21-82`) | p: tool schemas (`src/modules/registry/tool-action-contracts.ts:20-111`) | RFC 9727 + OpenAPI ([RFC 9727](https://www.rfc-editor.org/rfc/rfc9727#section-4); [OAS](https://spec.openapis.org/oas/v3.1.2.html)) | **partial-strong**: llms/skill/UCP/api-catalog/OpenAPI exist; OpenAPI omits live routes, Linkset+JSON conformance unverified (`src/modules/discovery/internal/openapi-document-builder.ts:47-53`; `src/modules/discovery/internal/api-catalog.ts:40-79`). |
| A2 Auth | p: device approval/key override (`tools/ae/commands/connect.ts:222-312`; `tools/ae/lib/config.ts:300-320`) | P: OAuth and scoped tools (`src/lib/server/agent-access-oauth-api.ts:210-262`; `src/lib/server/mcp-api.ts:683-742`) | P: bound keys (`src/lib/server/agent-access-auth.ts:103-198`) | p: Clerk owner not agent key (`convex/chatMessages.ts:69-83`) | OAuth resource metadata/Client ID documents ([MCP authorisation](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization); [registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)) | **partial**: CLI device OAuth, OAuth endpoints, Clerk API keys; no CIMD; durable chat unreachable with agent key (`src/lib/server/agent-access-oauth-api.ts:69-174`; `convex/chatMessages.ts:69-83`). |
| A3 Machine I/O | p: JSON; stdin only quote/call (`tools/ae/commands/call.ts:352-394`; `tools/ae/lib/output.ts:115-126`) | p: structured content, listed outputSchema absent (`tests/unit/server/mcp-api-official-client.test.ts:78-108`) | p: selected JSON schemas (`src/modules/discovery/internal/openapi-document-builder.ts:47-53`) | p: typed tools/UI stream (`convex/chatTools.ts:162-217`; `convex/chatAnonymous.ts:174-186`) | Typed MCP output and AI SDK stream ([MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools); [AI SDK](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)) | **partial**: outputSchema absent in observed listings; payload duplicated as JSON text plus structuredContent (`src/lib/server/mcp-api.ts:563-590`). |
| A4 Errors | p: translated problem loses fields (`tools/ae/cli.ts:534-613`) | p: typed refusals; generic internals (`src/lib/server/mcp-api.ts:201-298`) | p: RFC 9457, internal `{kind}` (`src/lib/server/problem.ts:20-35`; `src/routes/api.internal.provider-consequence.ts:557-582`) | p: thrown strings/UI flattening (`convex/chatMessages.ts:89-98`; `src/components/ae/chat/presentation.ts:251-279`) | Problem Details and CLI exit semantics ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457); [CLI Guidelines](https://clig.dev/#the-basics)) | **partial**: HTTP strong; CLI translation incomplete; internal `{kind}`, Convex strings; degraded `doctor --json` exits 0 (`tools/ae/commands/doctor.ts:207-237,266-268`). |
| A5 Safety/money | P: quote and durable key (`tools/ae/commands/call.ts:284-349,398-455`) | p: procure unsafe hints (`src/modules/capability-execution/procure.actions.ts:40-63`) | P: nonce/quote/Call (`src/lib/server/call-api.ts:88-155`) | p: synthetic principal (`convex/chatTools.ts:248-260,375-431`) | Constrained spend/receipt ([ACP](https://www.agenticcommerce.dev/docs/reference/checkout); [AP2](https://ap2-protocol.org/ap2/flows/)) | **strong core**; P0 `ae_tool_procure` claims destructiveHint:false/openWorldHint:false; header/body idempotency split (`src/modules/capability-execution/procure.actions.ts:40-63`; `src/lib/server/funding-handoff-api.ts:263-273`; `src/lib/server/call-api.ts:84-155`). |
| A6 Async | p: status/wait/cancel, poll-only (`tools/ae/commands/wait.ts:61-85`) | p: handle polling, no SSE/progress (`src/lib/server/mcp-api.ts:780-784`) | p: anonymous stream, status/cancel (`src/routes/api.chat.anonymous.ts:96-106,147-164`; `src/lib/server/call-api.ts:527-584`) | p: reactive deltas, no durable HTTP Stop/resume (`convex/chatGenerate.ts:55-69`; `src/components/ae/chat/chat-session/useChatSession.ts:376-393`) | Explicit cancel/stream/replay semantics ([MCP progress](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress); [AI SDK resume](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)) | **absent as a shared durable agent-turn contract**: CLI/MCP poll-only; chat has no authenticated HTTP cancel/resume (`convex/chatMessages.ts:189-246`; `src/routes/api.chat.anonymous.ts:117-164`). |
| A7 Tokens | p: pagination, pretty JSON (`tools/ae/commands/search.ts:58-88`; `tools/ae/lib/output.ts:157-159`) | p: four anonymous tools in `tools/list`, about 1,426 tokens; 36 actions exist across scopes, but the observed tax is in duplicated results (`agent://ColdMcpAgent/report`; `src/lib/server/mcp-api.ts:492-590`) | p: cursors/technical manifest (`src/modules/discovery/internal/site-manifest.ts:326-378`) | p: bounded search, no format selector (`src/modules/registry/tool-choice-contracts.ts:37-48,68-151`) | Workflow tools/lean projection ([Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents); [Block](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers)) | **weak result projection, not tool-list count**: 56 listed entries cost about 23,678 tokens and nine search hits about 4,641; text duplicates `structuredContent`. Use concise results and remove duplication (`agent://ColdMcpAgent/report`; `src/lib/server/mcp-api.ts:563-590`). |
| A8 Trust | p: version/receipts; headers not projected (`tools/ae/lib/output.ts:97-154`) | p: receipts/correlation (`src/lib/server/mcp-api.ts:364-384,641-667`) | p: request ID, misleading remaining (`src/lib/server/request-correlation.ts:7-23`; `src/lib/server/rate-limit.ts:130-165`) | p: health/price, no cited answer (`src/modules/registry/tool-choice-contracts.ts:68-104`) | Receipt plus source/trace ([Stripe request IDs](https://docs.stripe.com/api/request_ids); [x402 signed receipt](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md)) | **partial**: durable receipts strong; `RateLimit-Remaining` is not live (`src/lib/server/rate-limit.ts:130-165`; `tests/unit/server/mcp-api-official-client.test.ts:112-242`). |
| A9 Onboarding | p: archive/anonymous browse; paid install unproved (`packages/cli/README.md:5-24`; `scripts/test-cli-package.ts:151-191`) | P: client setup/plugin (`src/lib/cli-distribution.ts:37-87`; `plugins/agentic-economy/.mcp.json:1-7`) | p: public browse; call protected (`src/modules/discovery/internal/offering-discovery-file.ts:38-57`) | p: anonymous only for keyless turn (`convex/chatAnonymous.ts:174-186`) | Sandbox/client setup ([Stripe CLI](https://docs.stripe.com/cli); [Linear MCP](https://linear.app/docs/mcp)) | **partial**: install guidance exists; manifest says keyless Call but `ae call` needs credential; stale README compatibility warning (`tools/ae/commands/manifest.ts:348-360`; `tools/ae/commands/call.ts:422-455`; `README.md:79-80`). |
| A10 Synthesis | A: catalogue list (`tools/ae/commands/search.ts:125-178`) | A: choices, no answer (`src/modules/registry/tool-choice-contracts.ts:105-145`) | A: candidate array (`src/modules/registry/tool-choice-contracts.ts:111-140`) | A as shared envelope; chat alone composes prose and Jev hints (`convex/chatTools.ts:292-343,450-477`) | Answer plus cited results ([Exa answer](https://exa.ai/docs/reference/answer); [OpenAI citations](https://developers.openai.com/api/docs/guides/tools-web-search)) | **absent on every public search surface**: chat-only Jev `use`/`belowMatch` (`src/modules/chat/search-presentation.ts:34-49`); no common cited recommendation (`src/modules/registry/tool-choice-contracts.ts:121-151`). |

## 3. Where AE is already best in class

- **Spend boundary:** quote and payable Call are distinct; caller identity, accepted quote and durable idempotency are rechecked at the server. Owner spending limits are bounded, and no model annotation supplies financial authority (`src/lib/server/call-api.ts:84-155`; `src/modules/agent-access/spending-limit-policy.ts:34-71`; [MCP annotation rules](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)).
- **Recovery truth:** Call status, cancellation, reconciliation and CLI recovery journal expose the original identity instead of casually repeating spend. Settlement must not be confused with delivery; x402's payment response alone cannot certify fulfilment (`src/lib/server/call-api.ts:527-553,629-670,710-811`; `tools/ae/lib/call-recovery-journal.ts:36-48,138-160`; [x402 receipt extension](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md)).
- **One projection seam:** the registry filters public and scoped actions into MCP; CLI manifest and HTTP routes use the same action families. This is stronger than hand-maintaining three unrelated catalogues, but does not prove every generated schema or advertisement is accurate (`src/modules/actions/index.ts:101-166`; `tests/imports/tool-surface-conformance.test.ts:9-24`; `src/modules/discovery/internal/openapi-document-builder.ts:21-82`).
- **Low-friction discovery:** anonymous Tool search, scoped credentials, device authorisation, developer skill and MCP install recipes exist already (`src/modules/registry/tool-action-contracts.ts:17-28`; `tools/ae/commands/connect.ts:222-316`; `plugins/agentic-economy/skills/use-agentic-economy/SKILL.md:7-64`; `src/lib/cli-distribution.ts:37-87`). Do not upgrade these source facts into a claim of a successful installed paid Call.

## 4. Baseline spec: MUST, Wave 1

| ID | Required acceptance contract and evidence |
|---|---|
| **M1** | Correct annotations on **every** spend/side-effect action, starting with `ae_tool_procure`: `destructive:true`, `openWorld:true`, `idempotent` reflecting actual durable key semantics. The current procure metadata is false for a payment-effect action. Annotations are hints; budget, quote, principal and replay authority stay server-side (`src/modules/capability-execution/procure.actions.ts:26-65`; `src/modules/capability-execution/call.actions.ts:13-55`; [MCP tools/annotations](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). |
| **M2** | MCP emits a **real** `outputSchema` and conforming `structuredContent`; the text content becomes a short summary, not the duplicate JSON dump. Verify the actual listed output and result, not only the conversion attempt (`src/lib/server/mcp-api.ts:416-467,508-590`; `tests/unit/server/mcp-api-official-client.test.ts:78-108`; [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)). |
| **M3** | `ae doctor --json` uses the **same non-zero exit codes** as human mode when degraded, including unreachable server; JSON output does not make a failed diagnostic successful (`tools/ae/commands/doctor.ts:207-237,266-268`; [CLI Guidelines](https://clig.dev/#the-basics)). |
| **M4** | CLI JSON errors carry RFC 9457 fields verbatim: `type`, `title`, `status`, `detail`, `instance`, plus `code`, `retryable`, `requestId`, `exitCode`. Preserve the HTTP problem identity instead of translating it away. RFC 9457 defines the HTTP shape; CLI projection is AE's decision (`tools/ae/cli.ts:534-613`; `tools/ae/lib/output.ts:131-154`; `src/lib/errors.ts:111-138`; [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)). |
| **M5** | Discovery truthfulness: change the manifest's keyless-Call claim to match credential-required `ae call`; repair the `ae list --technical` continuation, which `list` rejects; remove the stale README compatibility line. Claims must reflect executable paths, not merely available schemas (`tools/ae/commands/manifest.ts:348-360`; `tools/ae/commands/call.ts:422-455`; `tools/ae/commands/search.ts:89-101`; `tools/ae/cli.ts:51-58`; `README.md:79-80`; [AX](https://agentexperience.ax/)). |
| **M6** | **Search envelope v2** shared by CLI/MCP/HTTP/chat: `results[]` plus optional `recommendation {text, citations:[{toolRef, span}], mode:'fast'|'deep', engine}`. Fast = lift Jev `use`/`belowMatch` verdict from chat presentation into the registry search contract, with citations to returned Tool refs and spans of the recommendation text. Deep = LLM synthesis grounded **only** in returned Tool refs. **Deep mode is SHOULD, not MUST.** Search never commits spend or represents an indicative price as a binding quote (`src/modules/chat/search-presentation.ts:34-49`; `src/modules/registry/tool-choice-contracts.ts:105-151`; `convex/chatTools.ts:292-343`; [Exa search](https://exa.ai/docs/reference/search); [OpenAI citations](https://developers.openai.com/api/docs/guides/tools-web-search)). |
| **M7** | **Authenticated streaming chat turn:** `POST /api/v1/chat/turns` **must accept agent API key authentication** (and may accept Clerk), run a key-authenticated turn as that key's principal and budget, and use the existing Convex durable thread. HTTP wire = AI SDK UI message stream reused from `/api/chat/anonymous`, not a new hand-rolled SSE protocol; include AE domain parts `data-ae-state`, `data-ae-quote`, `data-ae-receipt`, `data-ae-problem`. Add `ae chat` TTY rendering and `--json` NDJSON in the AE event vocabulary, with work states mapped 1:1 to A2A task states: submitted, working, input-required, auth-required, completed, failed, canceled, rejected. Payment state is independent of work state; receipts are artifacts. Support `--continue` / `--thread <id>` and Ctrl-C/`DELETE` cancellation. AI SDK framing is transport; AE NDJSON is the vendor-neutral shell contract. Cancellation of generation or client connection must not claim cancellation of an already committed paid Call. Current authenticated chat is Convex mutation/subscription while anonymous HTTP already uses the UI stream (`convex/chatMessages.ts:56-137,189-246`; `convex/chatTools.ts:248-260,375-431`; `convex/chatAnonymous.ts:174-212`; `src/routes/api.chat.anonymous.ts:117-164`; `local://ax/ExtA2aMarket.md:9,36-39`; [AI SDK stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol); [Claude stream-json](https://code.claude.com/docs/en/headless); [MCP cancellation](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/cancellation)). |
| **M8** | Rate-limit headers follow draft-ietf-httpapi-ratelimit-headers-11 structured fields (`RateLimit` + `RateLimit-Policy`) and report live remaining quota, or are omitted. The current `RateLimit-Remaining` reports configured capacity and must not ship as-is (`src/lib/server/rate-limit.ts:130-165`; [draft -11](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)). |
| **M9** | Generate OpenAPI covering **every** `api.v1` route and parity-check against the real route set, not its own declared operation list. Include auth, request, response and errors for the actual callable contract; do not mistake OpenAPI self-consistency for route coverage (`src/modules/discovery/internal/openapi-document-builder.ts:21-82`; `tests/unit/discovery/openapi-document.test.ts:39-45,83-96`; [OAS 3.1.2](https://spec.openapis.org/oas/v3.1.2.html)). |
| **M10** | **MCP picker, role toolsets:** discover (search, describe, compare); buy (quote, call, procure for the exact-`toolRef` and price-ceiling direct path, status accepting any AE ref); account (whoami, balance, activity); provider (separate, listed only when scope has provider authority). Read-only mode is discover plus account. Operations are never registered as tools. This replaces the current scope-filtered 36-action registry projection, not an alleged 36-tool anonymous listing (`src/modules/actions/index.ts:101-166`; `src/lib/server/mcp-api.ts:492-506`; `agent://ColdMcpAgent/report`; [GitHub toolsets](https://github.com/github/github-mcp-server/blob/main/docs/server-configuration.md); [Anthropic tools](https://www.anthropic.com/engineering/writing-tools-for-agents)). |

### Deliberate departures from research

- M7 uses the AI SDK UI stream as transport instead of a custom SSE protocol (reuse over hand-rolling; the AE NDJSON schema is the neutral public contract). [AI SDK stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- The CLI verb is `ae chat` with streaming NDJSON, not `ae ask` with a single final object: a turn is a stream and the durable thread continues. [Claude stream-json](https://code.claude.com/docs/en/headless)
- M6 names the field `results[]` rather than `tools[]`, keeping it envelope-neutral. [Exa answer](https://exa.ai/docs/reference/answer)
- Audit A6/A10 “partial” scores reflect browser-only chat; the scorecard rates the shared public contracts as absent (`src/routes/api.chat.anonymous.ts:117-164`; `convex/chatTools.ts:292-343,450-477`).

## 5. SHOULD, Wave 2

| Work | Boundary and authority |
|---|---|
| MCP currency | Migrate server to official SDK **2.0.0** `createMcpHandler` for revision **2026-07-28**, retaining stateless 2025-client compatibility at the same URL; do not promise old sessionful GET or Tasks (`package.json:84-85`; `src/lib/server/mcp-api.ts:780-784`; [SDK migration](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md); [versions](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/protocol-versions.md)). |
| OAuth | Client ID Metadata Documents instead of deprecated dynamic client registration as the preferred path (`src/lib/server/agent-access-oauth-api.ts:114-170`; [registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)). |
| Async | Request-scoped SSE progress, not a claim of persisted replay; authenticated durable status/receipt handle remains available ([MCP progress](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/progress); `src/lib/server/call-api.ts:527-553`). |
| Token budget | Provide `response_format: concise|detailed` on the workflow tools without duplicating the full machine payload in text (`src/lib/server/mcp-api.ts:563-590`; [Block](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers)). |
| Idempotency | Unify `Idempotency-Key` header across routes as **clean cutover**; money-path risk requires its own design review. Today funding uses header and Call/demand/supply use body (`src/lib/server/funding-handoff-api.ts:263-273`; `src/lib/server/call-api.ts:84-155`; `src/modules/market-demand/market-demand.actions.ts:55-57`; [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)). |
| Discovery | Verify api-catalog **Linkset+JSON** conformance; publish an Arazzo workflow document for search → quote → call → receipt, distinct from OpenAPI (`src/modules/discovery/internal/api-catalog.ts:40-79`; [RFC 9727](https://www.rfc-editor.org/rfc/rfc9727); [Arazzo 1.1.0](https://spec.openapis.org/arazzo/v1.1.0.html)). |
| Stream continuity | Resume from stored Convex deltas plus a cursor, distinguishing next-turn `--continue` from in-flight reconnect; do not claim replay before persistence/cursor works (`convex/chatGenerate.ts:46-119`; [AI SDK resume](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)). |
| Approval and errors | Elicitation for spend confirmation as **UX only**, never server authorisation; map Convex chat and internal route errors to stable problem codes (`convex/chatMessages.ts:89-98`; `src/routes/api.internal.provider-consequence.ts:557-582`; [MCP elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation); [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)). |
| Synthesis | Deep-mode recommendation, grounded solely in returned Tool refs and separately bounded/costed from payable Tools (`src/modules/registry/tool-choice-contracts.ts:105-151`; [Exa answer](https://exa.ai/docs/reference/answer); [Tavily search](https://docs.tavily.com/documentation/api-reference/endpoint/search)). |

## 6. LATER

| Item | Trigger, not a launch promise |
|---|---|
| ACP/AP2/card-network interop | Only after a real integration and regional eligibility; Stripe Shared Payment Tokens are preview and the cited list excludes Australia. None replaces AE's quote/budget/fulfilment evidence ([ACP](https://www.agenticcommerce.dev/docs/reference/checkout); [AP2](https://ap2-protocol.org/ap2/flows/); [SPT countries](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=agent); [Visa](https://developer.visa.com/capabilities/visa-intelligent-commerce); [Mastercard](https://newsroom.mastercard.com/news/latin-america/en/newsroom/press-releases/pr-en/2026/march/mastercard-advances-agentic-payments-in-latin-america-and-the-caribbean-with-live-transactions-completed-across-the-region/)). |
| x402 Bazaar listing | Only participating x402 routes belong in the early-development discovery extension; it is not proof of universal AE Tool payment support ([Bazaar](https://docs.x402.org/extensions/bazaar); [x402 v2](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)). |
| A2A agent card | Only when AE operates an actual A2A service; a catalogue or chat page is not an AgentCard ([A2A discovery](https://a2a-protocol.org/v1.0.0/specification/#8-agent-discovery-the-agent-card)). |
| MCP Tasks extension | Wait for SDK2 implementation; meanwhile use durable Call handle plus status/receipt polling. Do not label application polling as negotiated MCP Tasks (`src/lib/server/call-api.ts:527-553`; [Tasks](https://modelcontextprotocol.io/extensions/tasks/overview); [SDK roadmap](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/ROADMAP.md)). |

## 7. Decided 2026-09-23 (Joel)
- **Q1 YES.** A turn authenticated with an agent API key runs as that key's principal and budget. Streaming chat under an agent key is a **Wave 1 MUST**, not optional (`convex/chatMessages.ts:69-83`; `convex/chatTools.ts:248-260,375-431`; `src/modules/agent-access/policy.ts:49-103`).
- **Q3 YES, promoted to Wave 1 design scope.** MCP must never expose per-service/x402 Operations as individual tools. Its shape is a search/picker with a few workflow tools (search → describe → quote → call → status/receipt), plus a direct path when a counterparty or agent already knows the exact `toolRef` and skips search. The present 36-tool projection is the cutover target (`src/modules/actions/index.ts:101-166`; `tests/unit/server/mcp-api-tools-list.test.ts:234-289`; [workflow tools](https://www.anthropic.com/engineering/writing-tools-for-agents)).
- **Q2 defaulted to the recommendation.** Fast/Jev is free; deep synthesis is authenticated, rate-limited and free during alpha. Keep synthesis cost distinct from payable Tool price (`src/modules/chat/search-presentation.ts:34-49`; [Exa pricing](https://exa.ai/pricing)).


## 8. Next step

Per Joel's standing preference, the Wave 1 RFC `docs/designs/2026-09-23-agent-experience-rfc.md` covers the shared contract set (search, problem and events), journey handle with `next[]`, M7 agent-key chat and CLI, M10 role-scoped MCP picker, and D12 admission input quality, adapted from the cited search-answer, UI-stream and A2A references. Gate it through seven lenses: **design-review, type-driven-designer, module-secret-auditor, bounded-context-auditor, cqs-auditor, idempotency-guardian, error-strategist** before code. D1-D11 are dispatchable defect fixes, except D9 needs Joel's npm credentials/decision; M9 remains a Wave 1 completeness contract, not silently waived. The RFC distinguishes fast retrieval from deep synthesis, principal from thread identity, UI transport from shell events, and cancellation from money reversal (`src/modules/chat/search-presentation.ts:34-49`; `convex/chatMessages.ts:56-137`; `local://ax/ExtA2aMarket.md:35-39`; [Exa answer](https://exa.ai/docs/reference/answer); [AI SDK stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol); [AI SDK resume](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)).

## 9. Appendix: surface inventories and source divergences

**CLI command inventory.** Commands are grouped by workflow, not asserted to have identical permissions. `fund` and `revoke` return browser continuations, not an in-terminal transfer or revocation (`tools/ae/cli.ts:394-449`; `tools/ae/commands/fund.ts:7-27`; `tools/ae/commands/revoke.ts:7-27`).

| Commands | Function/evidence |
|---|---|
| `help`, `--version`, `manifest`, `config`, `doctor` | Help/version, action handshake, redacted config, diagnostics (`tools/ae/cli.ts:145-194,229-252`; `tools/ae/commands/manifest.ts:401-438`; `tools/ae/commands/doctor.ts:846-870`). |
| `list`, `search`, `describe`, `compare` | Public browse, query, exact Tool, comparison (`tools/ae/commands/list.ts:10-35`; `tools/ae/commands/search.ts:11-53`; `tools/ae/commands/compare.ts:17-83`). |
| `request create/list/status/withdraw` | Private unmet demand (`tools/ae/commands/request.ts:64-90,120-151,167-205,222-256`). |
| `connect`, `account status/balance/activity/connections/disconnect` | Device authorisation, identity, balance and credentials (`tools/ae/commands/connect.ts:222-316`; `tools/ae/commands/account.ts:74-133,191-263,306-329`). |
| `quote`, `call`, `call resume`; `history`, `status`, `wait`, `cancel`, `recover` | Purchase preview/commit, journal recovery, history and outcome handling (`tools/ae/commands/call.ts:250-480`; `tools/ae/commands/history.ts:23-97`; `tools/ae/commands/recover.ts:20-105`). |
| `supply preview/tools/status/publish/withdraw/recheck/republish/earnings/calls/connections/connection/connect/reconnect/disconnect/offboarding` | Provider lifecycle under provider scope (`tools/ae/commands/manifest.ts:304-333`; `tools/ae/commands/supply.ts:36-53,302-340`). |
| `fund`, `revoke` | Browser continuations (`tools/ae/commands/fund.ts:7-27`; `tools/ae/commands/revoke.ts:7-27`). |

**MCP tool inventory, 36.** Names are registry projections; listing is scope-filtered (`src/modules/actions/index.ts:101-166`; `src/lib/server/mcp-api.ts:492-506`).

| Scope/count | Tool names and purpose/evidence |
|---|---|
| Public, 4 | `ae_registry_tools_list`, `ae_registry_tools_search`, `ae_registry_tools_describe`, `ae_registry_tools_compare`: list/search/detail/compare (`src/modules/registry/tool-action-contracts.ts:30-115`). |
| Buyer, 3 | `ae_agentAccess_whoami`, `ae_agentAccess_balance`, `ae_agentAccess_activity`: principal/money/activity (`src/modules/agent-access/account.actions.ts:21-49,248-275,301-365`). |
| Funding, 3 | `ae_funding_handoff_config`, `ae_funding_handoff_create`, `ae_funding_handoff_status`: constraints, checkout, status (`src/modules/money/funding-handoff.actions.ts:61-137`). |
| Demand, 4 | `ae_marketDemand_record`, `ae_marketDemand_list`, `ae_marketDemand_status`, `ae_marketDemand_withdraw`: missing-need record/review (`src/modules/market-demand/market-demand.actions.ts:416-555`). |
| Purchase/Call, 7 | `ae_tool_quote`, `ae_tool_procure`, `ae_tool_call`, `ae_call_list`, `ae_call_status`, `ae_call_cancel`, `ae_call_reconcile`: money path/recovery (`src/modules/capability-execution/procure.actions.ts:26-65`; `src/modules/capability-execution/call-recovery.actions.ts:186-332`). |
| Provider, 15 | `ae_supply_source_preview`, `ae_supply_tools_list`, `ae_supply_status`, `ae_supply_publish`, `ae_supply_withdraw`, `ae_supply_recheck`, `ae_supply_republish`, `ae_supply_earnings`, `ae_supply_calls`, `ae_supply_connection_list`, `ae_supply_connection_detail`, `ae_supply_connection_connect`, `ae_supply_connection_reconnect`, `ae_supply_connection_revoke`, `ae_supply_offboarding_status`: supply/connection lifecycle (`src/modules/capability-supply/supply-actions.ts:62-95,203-592`). |

**HTTP `api.v1` endpoint inventory, 47.** Count is distinct method/path contracts in the audit's nine groups; dynamic `{id}` is a parameter, not a literal segment. Public ancillary OAuth, discovery, `/mcp`, webhooks, anonymous chat and internal endpoints sit outside these 47 (`src/routes/mcp.ts:6-19`; `src/routes/api.chat.anonymous.ts:117-169`; `src/routes/oauth.authorize.ts:10-31`).

| Count | Method and paths | Auth/purpose and source |
|---:|---|---|
| 4 | POST `/api/v1/market-tools/{list,search,describe,compare}` | Public browse (`src/routes/api.v1.market-tools.list.ts:13-16`; `src/routes/api.v1.market-tools.search.ts:13-35`; `src/routes/api.v1.market-tools.describe.ts:13-16`; `src/routes/api.v1.market-tools.compare.ts:16-19`). |
| 3 | POST `/api/v1/tools/{quote,call,procure}` | Agent-key quote/paid action (`src/routes/api.v1.tools.quote.ts:5-9`; `src/routes/api.v1.tools.call.ts:5-9`; `src/routes/api.v1.tools.procure.ts:5-9`). |
| 4 | GET `/api/v1/calls`, `/api/v1/calls/{callRef}`; POST `/api/v1/calls/{callRef}/{cancel,reconcile}` | Own history/receipt/recovery (`src/lib/server/call-api.ts:359-376,527-553,629-670,710-811`). |
| 3 | GET `/api/v1/account`; POST `/api/v1/account/{balance,activity}` | Agent-key principal, balance and activity (`src/routes/api.v1.account.ts:9-13`; `src/routes/api.v1.account.balance.ts:6-9`; `src/routes/api.v1.account.activity.ts:6-9`). |
| 4 | GET `/api/v1/account/funding/config`, `/api/v1/account/funding-sessions/{fundingSessionId}`, `/api/v1/account/funding-sessions/public/{fundingSessionId}`; POST `/api/v1/account/funding-sessions` | Funding config/status/checkout (`src/routes/api.v1.account.funding.config.ts:6-10`; `src/routes/api.v1.account.funding-sessions.$fundingSessionId.ts:6-10`; `src/routes/api.v1.account.funding-sessions.public.$fundingSessionId.ts:6-10`; `src/routes/api.v1.account.funding-sessions.ts:6-9`). |
| 4 | POST `/api/v1/market-requests`, `/api/v1/market-requests/{list,status,withdraw}` | Own demand (`src/routes/api.v1.market-requests.ts:5-8`; `src/lib/server/market-demand-api.ts:25-89`). |
| 10 | POST `/api/v1/supply/{sources/preview,tools/list,status,publish,withdraw,recheck,republish,earnings,calls,offboarding/status}` | Provider lifecycle (`src/lib/server/supply-action-api.ts:40-75,99-128`). |
| 5 | POST `/api/v1/supply/connections/{list,detail,connect,reconnect,revoke}` | Provider connection (`src/modules/capability-supply/supply-actions.ts:171-190,287-302,428-443,516-566`). |
| 3 | GET `/api/v1/businesses`, `/api/v1/businesses/{businessId}`, `/api/v1/businesses/search` | Public published business (`src/routes/api.v1.businesses.ts:8-12`; `src/routes/api.v1.businesses.$businessId.ts:9-13`; `src/routes/api.v1.businesses.search.ts:8-12`). |
| 7 | GET/HEAD `/api/v1/{registry,release,catalogue-status,market-metrics,funding/constraints}`; POST `/api/v1/{funding/quote,sandbox-reference}` | Public read/preflight; 7 **path families**, additional HEAD methods (`src/routes/api.v1.registry.ts:17-37,77-138`; `src/routes/api.v1.release.ts:5-23`; `src/routes/api.v1.funding.quote.ts:16-19`). |

**Chat tool inventory, seven IDs.** `registry.tools.list`, `registry.tools.search`, `registry.tools.describe`, `registry.tools.compare` are public retrieval; `tool.quote` and `tool.call` are authenticated money paths; `chat.clarify` asks a constrained question and stops (`src/modules/registry/tool-choice-contracts.ts:27-55,106-224`; `convex/chatTools.ts:265-447`; `src/modules/chat/clarify-card.ts:1-19`). One signed-in turn is limited to six model steps and one Call (`convex/chatGenerate.ts:46-119`; `convex/chatTools.ts:31-47`).

**Research departures, recorded without changing the decisions:** The HTTP gold paper proposes hand-designed AE semantic SSE, but M7 reuses the AI SDK UI message stream; the CLI gold paper proposes `ae ask` and final-object `--json`, while M7 chooses `ae chat` and NDJSON. The search proposal calls its list `tools[]`, while M6 chooses `results[]`. Draft -11's structured fields inform the revised M8; the legacy `RateLimit-Remaining` is removed or replaced with truthful live quota. Chat audit labels A10 partial for model-composed prose; the decided score is absent for the shared cited search envelope. CLI/MCP/HTTP/chat audits label A6 partial because polling or anonymous/browser streams exist; the decided cross-surface durable-turn capability is absent ([HTTP draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/); [AI SDK stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol); [CLI exemplar](https://code.claude.com/docs/en/headless); `convex/chatTools.ts:450-477`; `src/routes/api.chat.anonymous.ts:117-164`).

### Source citation index

The citations above are the decision evidence. The remaining links and source anchors from all nine input reports are retained here for traceability, without importing their separate recommendations into this baseline.

**local://ax/ExtCliGold.md**

<https://devcenter.heroku.com/articles/cli-style-guide> · <https://oclif.io/docs/json/> · <https://cli.github.com/manual/gh_help_formatting> · <https://vercel.com/docs/cli> · <https://learn.chatgpt.com/docs/non-interactive-mode> · <https://geminicli.com/docs/cli/headless/>

<https://llm.datasette.io/en/stable/usage.html> · <https://devcenter.heroku.com/articles/cli-style-guide#stdoutstderr> · <https://clig.dev/#interactivity> · <https://devcenter.heroku.com/articles/cli-style-guide#prompting> · <https://vercel.com/docs/cli/global-options> · <https://vercel.com/docs/cli/agent>

<https://docs.stripe.com/cli#login> · <https://vercel.com/docs/cli#using-in-a-cicd-environment> · <https://learn.chatgpt.com/docs/non-interactive-mode#authenticate-in-automation> · <https://www.rfc-editor.org/rfc/rfc8628> · <https://docs.stripe.com/cli/listen> · <https://docs.stripe.com/cli/trigger>

<https://docs.stripe.com/cli/fixtures> · <https://docs.stripe.com/cli/logs/tail> · <https://vercel.com/docs/cli/logs> · <https://vercel.com/changelog/vercel-logs-cli-command-now-optimized-for-agents-with-historical-log> · <https://code.claude.com/docs/en/cli-reference> · <https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode>

<https://llm.datasette.io/en/stable/logging.html> · <https://llm.datasette.io/en/stable/templates.html> · <https://docs.stripe.com/cli/agent/setup> · <https://www.netlify.com/blog/how-we-measure-netlify-agent-experience/> · <https://oclif.io/docs/plugin_loading/> · <https://clig.dev/#configuration>

<https://clig.dev/#output> · <https://geminicli.com/docs/cli/headless/#exit-codes> · <https://clig.dev/#robustness-guidelines> · <https://vercel.com/docs/cli#updating-vercel-cli> · <https://docs.stripe.com/cli#sandbox>


**local://ax/ExtMcpGold.md**

<https://modelcontextprotocol.io/docs/2026-07-28/learn/versioning> · <https://modelcontextprotocol.io/specification/2026-07-28/changelog> · <https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http> · <https://modelcontextprotocol.io/registry/remote-servers> · <https://modelcontextprotocol.io/registry/about> · <https://vercel.com/changelog/vercel-mcp-now-supports-purchases>

<https://modelcontextprotocol.io/specification/2026-07-28/server/tools#stateful-tools> · <https://modelcontextprotocol.io/specification/2026-07-28/server/resources> · <https://modelcontextprotocol.io/specification/2026-07-28/server/prompts> · <https://vercel.com/docs/agent-resources/vercel-mcp> · <https://www.anthropic.com/engineering/code-execution-with-mcp> · <https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/>

<https://vercel.com/changelog/vercel-mcp-now-supports-the-2026-07-28-mcp-specification> · <https://github.com/x402-foundation/x402/blob/main/specs/transports-v2/mcp.md> · <https://docs.stripe.com/payments/machine/x402> · <https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr>


**local://ax/ExtApiDiscoveryGold.md**

<https://docs.stripe.com/api/expanding_objects> · <https://docs.stripe.com/api/pagination> · <https://docs.stripe.com/api/versioning> · <https://docs.stripe.com/api/errors> · <https://docs.stripe.com/testing-use-cases> · <https://llmstxt.org/>

<https://docs.stripe.com/llms.txt> · <https://docs.stripe.com/llms-full.txt> · <https://vercel.com/llms.txt> · <https://vercel.com/docs/llms-full.txt> · <https://platform.claude.com/llms.txt> · <https://platform.claude.com/llms-full.txt>

<https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md> · <https://json-schema.org/draft/2020-12> · <https://www.rfc-editor.org/rfc/rfc9728#section-3> · <https://www.rfc-editor.org/rfc/rfc8414#section-3> · <https://www.rfc-editor.org/rfc/rfc8707> · <https://a2a-protocol.org/latest/topics/agent-discovery/>

<https://a2a-protocol.org/latest/blog/2026/08/27/a-new-chapter-for-a2a-joining-the-agentic-ai-foundation/> · <https://www.rfc-editor.org/rfc/rfc9457#section-3> · <https://www.rfc-editor.org/rfc/rfc9745> · <https://www.rfc-editor.org/rfc/rfc8594> · <https://www.rfc-editor.org/rfc/rfc9728> · <https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events>

<https://developers.openai.com/api/docs/guides/streaming-responses> · <https://platform.claude.com/docs/en/build-with-claude/streaming.md> · <https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0>


**local://ax/ExtAgentCommerceGold.md**

<https://developers.cloudflare.com/agents/tools/payments/> · <https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/2436> · <https://agentic.market/> · <https://www.agenticcommerce.dev/docs/reference/payments> · <https://www.agenticcommerce.dev/docs/reference/webhooks> · <https://docs.stripe.com/api/refunds/create>

<https://developers.openai.com/commerce/guides/get-started> · <https://ap2-protocol.org/ap2/payment_mandate/> · <https://github.com/stripe/ai/blob/main/tools/typescript/MIGRATION.md> · <https://stripe.com/blog/giving-agents-the-ability-to-pay> · <https://github.com/coinbase/agentkit> · <https://docs.cdp.coinbase.com/agentic-wallet/mcp/mcp-tools/show-wallet-app>

<https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/use-pay-per-crawl-as-ai-owner/crawl-pages/> · <https://developers.cloudflare.com/agents/tools/payments/x402/charge-for-mcp-tools/> · <https://agentmuxer.com/llms.txt> · <https://agentmuxer.com/setup> · <https://agentmuxer.com/terms.md>


**local://ax/ExtAnswerStreamGold.md**

<https://docs.perplexity.ai/docs/sonar/quickstart> · <https://docs.exa.ai/reference/research/create-a-task> · <https://exa.ai/docs/reference/agent-api/create-a-run> · <https://api-dashboard.search.brave.com/api-reference/web/search/get> · <https://api-dashboard.search.brave.com/documentation/services/answers> · <https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool>

<https://ai.google.dev/gemini-api/docs/generate-content/google-search> · <https://ai.google.dev/gemini-api/docs/google-search> · <https://docs.perplexity.ai/docs/getting-started/pricing> · <https://ai-sdk.dev/docs/ai-sdk-ui/reading-ui-message-streams> · <https://ai-sdk.dev/docs/reference/ai-sdk-ui/read-ui-message-stream> · <https://github.com/vadimdemedes/ink>

<https://github.com/mikaelbr/marked-terminal> · `node_modules/ai/package.json:3`


**agent://AuditCli/report**

`tools/ae/lib/args.ts:2,113-185` · `tools/ae/lib/help.ts:7-20` · `tools/ae/cli.ts:145-194,229-252,467-502` · `tools/ae/commands/manifest.ts:401-438,481-576,593-651` · `tools/ae/commands/config.ts:24-54` · `tools/ae/commands/doctor.ts:207-268,846-870`

`tools/ae/commands/call.ts:284-349,352-480,250-281` · `tools/ae/lib/output.ts:157-174` · `tools/ae/commands/call.ts:259-273` · `tools/ae/commands/connect.ts:166-171` · `tools/ae/commands/call.ts:29-45,352-394` · `tools/ae/lib/output.ts:97-126`

`tools/ae/commands/connect.ts:318-390` · `tools/ae/commands/search.ts:34-48` · `tools/ae/cli.ts:451-531,532-613,692-694` · `tools/ae/commands/status.ts:218-250` · `tools/ae/commands/connect.ts:19-28,222-390` · `tools/ae/commands/connect.ts:106-114,307-334`

`tools/ae/commands/status.ts:44-112` · `tools/ae/lib/config.ts:86-99,137-150,275-297` · `tools/ae/lib/args.ts:38-112` · `tools/ae/lib/pending-connect.ts:25-30,63-70` · `tools/ae/lib/call-recovery-journal.ts:36-48,59-73` · `packages/cli/package.json:2-26`

`scripts/build-cli.ts:8-18,22-49` · `package.json:11-22` · `src/lib/cli-distribution.ts:8-32` · `scripts/test-cli-package.ts:19-43,76-191` · `tests/unit/market-terminal/cli-errors-help.test.ts:6-40` · `tests/unit/market-terminal/cli-errors-origin.test.ts:11-69`

`tests/unit/market-terminal/cold-loop.test.ts:16-27` · `tests/unit/market-terminal/doctor.test.ts:70-124` · `tests/unit/discovery/cli-distribution.test.ts:18-58` · `tools/ae/README.md:3-5` · `docs/operations/jev-platform-integration-register.md:270-271` · `tools/ae/cli.ts:35-99`

`tools/ae/commands/call.ts:250-281` · `tools/ae/commands/search.ts:58-88,125-145` · `tools/ae/commands/manifest.ts:587-609` · `tools/ae/commands/manifest.ts:475-480` · `tools/ae/cli.ts:229-252` · `tools/ae/README.md:40-47`

`tools/ae/commands/supply.ts:39-53`


**agent://AuditMcp/report**

`src/lib/server/mcp-api.ts:6-13,780-784` · `tests/unit/server/mcp-api-protocol.test.ts:137-151` · `src/lib/mcp-protocol.ts:1-6` · `src/modules/capability-supply/internal/route-transport-mcp.ts:1-10` · `src/lib/server/mcp-api.ts:201-298,416-467,508-590` · `tests/unit/server/mcp-api-tools-list.test.ts:49-66`

`src/modules/capability-execution/quote.actions.ts:27-49` · `src/modules/registry/tool-choice-contracts.ts:29-52` · `tests/unit/server/mcp-api-tools-list.test.ts:17-90` · `src/modules/common/action.ts:300-315` · `src/modules/market-demand/market-demand.actions.ts:14-17,416-445,459-510,528-555` · `src/modules/capability-execution/quote.actions.ts:13-52`

`src/lib/server/mcp-api.ts:492-506,683-742,785-809` · `tests/unit/server/mcp-api-tools-list.test.ts:176-289` · `src/lib/server/mcp-api.ts:628-636,799-804` · `src/lib/http/oauth-challenge.ts:29-47` · `src/lib/server/agent-access-oauth-api.ts:114-170,210-262` · `src/modules/agent-access/oauth-state.ts:37-59`

`src/lib/http/oauth-challenge.ts:33-47` · `src/routes/mcp.ts:6-11` · `src/routes/openapi[.]json.ts:8-16` · `src/lib/server/mcp-api.ts:416-467,563-590` · `src/lib/server/mcp-api.ts:99-166,201-298,641-667` · `tests/unit/server/mcp-api-protocol.test.ts:70-105,153-217`

`src/lib/server/mcp-api.ts:226-245` · `src/lib/server/mcp-api.ts:58-66` · `src/lib/server/mcp-api.ts:492-590` · `tests/unit/server/mcp-api-official-client.test.ts:176-242` · `src/routes/mcp.ts:8-19` · `tests/unit/server/mcp-api-tools-list.test.ts:17-90,176-289`

`src/modules/registry/tool-action-contracts.ts:67-115` · `src/modules/discovery/internal/page-markdown.ts:94-127` · `src/modules/agent-access/config-snippets.ts:61-95` · `src/lib/server/mcp-api.ts:164-180,563-590` · `src/modules/registry/tool-action-contracts.ts:17-20` · `tests/unit/server/mcp-api-protocol.test.ts:17-36`

`src/lib/server/mcp-api.ts:492-598` · `tests/integration/tool-read-outage-parity.test.ts:19-23` · `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts:1-4`


**agent://AuditHttpApi/report**

`src/lib/server/gateway-json-route.ts:39-78` · `src/modules/registry/tool-choice-contracts.ts:35-75,111-140` · `src/lib/server/call-api.ts:339-356` · `src/lib/server/procure-api.ts:88-112` · `src/modules/capability-execution/call-entry.ts:29-65` · `src/lib/server/agent-account-api.ts:43-80,96-135`

`src/modules/agent-access/account.actions.ts:99-122` · `src/lib/server/funding-handoff-api.ts:247-270,333-350` · `src/lib/server/funding-handoff-api.ts:263-273,325-329` · `src/modules/market-demand/market-demand.actions.ts:55-57,85-99` · `src/routes/api.v1.supply.sources.preview.ts:5-8` · `tools.list.ts:5-8`

`src/routes/api.v1.supply.connections.list.ts:5-8` · `src/routes/api.businesses.ts:11-15` · `src/modules/discovery/internal/openapi-utility-routes.ts:21-76` · `src/routes/api.discovery.schema.ts:37-98` · `src/routes/api.chat.anonymous.ts:22-24,37-49,96-106,117-164` · `src/routes/api.admin.metrics-export.ts:20-52`

`src/lib/server/personal-data-export.functions.ts:68-109` · `src/routes/api.internal.provider-connection-cleanup.ts:33-45,58-65,119-123` · `src/routes/api.clerk.webhook.ts:9-34` · `src/modules/discovery/internal/offering-discovery-file.ts:17-68,83-113` · `src/modules/discovery/internal/agent-skill.ts:1-15` · `src/modules/discovery/internal/discovery-files.ts:13-30,43-103`

`src/routes/[.]well-known/ucp.ts:8-46` · `src/modules/discovery/internal/site-manifest.ts:317-378` · `tests/integration/discovery-route-parity.test.ts:52-125` · `src/lib/http/oauth-challenge.ts:11-46` · `src/lib/server/agent-access-oauth-api.ts:240-263` · `src/routes/[.]well-known/http-message-signatures-directory.ts:10-42`

`src/routes/api.discovery.schema.ts:53-98` · `src/lib/server/agent-access-oauth-api.ts:68-126,240-263` · `src/routes/api.admin.metrics-export.ts:44-52` · `src/routes/api.$.ts:9-31` · `tests/unit/http/problem-envelope-drift.test.ts:19-46` · `src/lib/server/source-write-admission.ts:62-91`

`src/lib/server/call-api.ts:527-584,760-811` · `src/lib/server/request-correlation.ts:7-23,54-71` · `src/routes/api.v1.sandbox-reference.ts:11-35` · `plugins/agentic-economy/skills/use-agentic-economy/SKILL.md:20-51`


**agent://AuditChatAgent/report**

`src/routes/t.new.tsx:5-39` · `src/routes/t.$threadId.tsx:7-36` · `src/modules/model-gateway/public.ts:1-69,128-163` · `convex/chatGenerate.ts:79-100` · `convex/chatMessages.ts:153-185` · `convex/chatTools.ts:31-46,450-483`

`src/components/ae/chat/chat-session/useChatSession.ts:88-109` · `convex/chatThreads.ts:23-90,106-225` · `convex/chatShares.ts:245-401` · `convex/chatAnonymous.ts:17-83,113-212` · `src/components/ae/chat/chat-session/useChatSession.ts:113-125,171-205,376-393` · `convex/http.ts:15`

`src/components/ae/chat/presentation.ts:186-249` · `src/components/ae/chat/chat-session/useChatSession.ts:230-243` · `src/routes/api.chat.anonymous.ts:37-42` · `convex/chatMessages.ts:69-83,230-246` · `convex/chatThreads.ts:32-51` · `src/modules/registry/tool-action-contracts.ts:53-57`

`convex/chatTools.ts:31-47,162-217,248-260,375-447` · `convex/capabilitySupplyToolQueries.ts:237-273,312-375` · `convex/capabilitySupplyTools.ts:24-34` · `convex/capabilityToolCatalog.ts:91-134,162-178` · `convex/lib/capabilityToolCatalogPresentation.ts:5-32` · `src/modules/registry/tool-reranker.ts:95-142`

`src/modules/registry/tool-choice-contracts.ts:68-151,266-307` · `src/modules/decision-engine/jev-client.ts:1-36` · `src/modules/registry/tool-reranker.ts:76-142` · `src/modules/capability-supply/source-assessment.ts:1-18` · `docs/adr/0002-jev-system-one-opportunity-statement.md:3-20` · `src/modules/agent-access/agent-access.functions.ts:64-158,355-430`

`src/modules/agent-access/agent-access.ts:254-415` · `src/modules/agent-access/sandbox-policy.ts:5-32` · `src/modules/agent-access/production-policy.ts:63-96` · `src/modules/agent-access/spending-policy-update.ts:18-39` · `src/modules/agent-access/agent-access.functions.ts:613-650` · `src/modules/agent-access/policy.ts:49-103,160-180`

`src/lib/server/agent-access-oauth-api.ts:69-174,177-269` · `src/routes/_operator/agent-access.authorize.tsx:12-15` · `src/modules/agent-access/config-snippets.ts:1-105` · `src/lib/server/agent-access-oauth-api.ts:242-261` · `src/modules/agent-access/agent-access.functions.ts:355-430` · `convex/chatMessages.ts:230-246`

`src/routes/api.chat.anonymous.ts:93-104` · `convex/chatAnonymous.ts:100-111` · `convex/chatTools.ts:36-39,479` · `src/routes/api.chat.anonymous.ts:115-170` · `src/modules/agent-access/config-snippets.ts:67-105`


## 10. North star (not current scope)

AE eventually brokers agent-to-agent services. A counterparty business hosts an agent and sells it through AE as a packaged service; a procurement business extends a catalogue agent. Wave 1 designs must be A2A-ready. This is Joel's direction, not a claim that an A2A service exists. Do not publish an AgentCard until such a service exists ([A2A discovery](https://a2a-protocol.org/v1.0.0/specification/#8-agent-discovery-the-agent-card); `local://ax/ExtA2aMarket.md:7-11`).

Seven design invariants, not claims of present interoperability (`local://ax/ExtA2aMarket.md:29-39`):

| Invariant | Wave 1 constraint |
|---|---|
| 1. Capability identity | Keep provider/service identity distinct from an Operation/skill. Listing a service cannot grant execution authority; identify execution kind, modalities, authentication, binding and version (`local://ax/ExtA2aMarket.md:33-34`; `src/modules/registry/internal/services-api-projection.ts:39-57`). |
| 2. Search truth | Expose stable service, Operation and skill refs, match reason, schema/examples, availability, price basis and maximum, authority and next action. Distinguish discovery from executable entitlement; never imply that an unverified card claim proves quality (`local://ax/ExtA2aMarket.md:34`). |
| 3. Bounded consent | A Quote fixes scope, maximum spend, currency, turns/retries/time, expiry and partial-delivery terms. Further spend beyond the ceiling requires fresh consent, not a streamed seller price change (`local://ax/ExtA2aMarket.md:35`). |
| 4. Thread versus task | Thread (`contextId`) is separate from a priced Call/task; one thread can hold multiple Calls. States map 1:1 to A2A's submitted, working, input-required, auth-required, completed, failed, canceled and rejected; completion does not mean acceptance (`local://ax/ExtA2aMarket.md:9,36`). |
| 5. Typed events | Keep content separate from task status, input/auth/payment requests, artifact deltas and final artifacts, receipts and recovery. Carry durable context, task and correlation IDs and orderable sequences; a status message is not a receipt (`local://ax/ExtA2aMarket.md:37`). |
| 6. Independent authority and payment | Pause for input, credential or owner approval and show budget effect and deadline. Remote prose cannot authorise spending. Payment state is independent of work state (`local://ax/ExtA2aMarket.md:38`). |
| 7. Evidence and remedy | Receipts are artifacts. Preserve versioned output, quote, consent, artifact, charge, settlement, delivery, acceptance and dispute evidence; report unknown charge or partial delivery rather than blind replay. Neither task completion nor settlement certifies quality (`local://ax/ExtA2aMarket.md:39`). |

**Do not build yet:** an A2A host/proxy/crawler, ecosystem adapters, an AP2 signer, crypto escrow, automatic multi-turn charging, a dispute oracle, or push infrastructure. These require an admitted counterparty and an end-to-end paid-task contract (`local://ax/ExtA2aMarket.md:41`).

## 11. Cold-test evidence

The three independent walks used a fresh buyer identity or anonymous access against the local stack. A protected quote, paid Call, completed device approval and live charge were **not** observed. Token counts use `cl100k_base` on response bodies and are approximate, not latency or model billing (`agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`).

| CLI step | Observed outcome | Size / limit |
|---|---|---|
| `npx -y @agentic-economy/cli --help` | npm E404, exit 1. Local `packages/cli/dist/ae.js --help` succeeded, but is not an external install path. | No response-body token count (`agent://ColdCliAgent/report`). |
| Local `ae search 'AUD to USD exchange rate' --json`, plus four FX variants | Exit 0 and unrelated book, crypto, weather or other listings; no relevant fiat FX Tool. The result still recommended an unrelated describe/compare action. | Five searches, counts 3/1/1/2/10 (`agent://ColdCliAgent/report`). |
| Local `ae describe` Weather Current, then `ae quote` and piped `ae call` | Description said "Just pass a city name" but exposed only an arbitrary `query` object. The guessed Sydney input could not be validated; quote/call returned `agent_access_key_required`, exit 1. | No binding Quote or Call (`agent://ColdCliAgent/report`). |
| Local `ae connect --json`, `ae fund --json`, `ae doctor --json` | Connect produced approval URL/code then timed out before approval. Fund returned an owner-browser continuation, not a charge. Doctor returned degraded/failing origin diagnosis, yet exit 0, and buried actionable checks under 18 Stripe/x402 variables. | Device-flow completion unobserved (`agent://ColdCliAgent/report`). |

| MCP step | Observed outcome | Size / limit |
|---|---|---|
| `GET /mcp`, then POST initialize and `tools/list` | GET returned 405; POST worked. Anonymous `tools/list` listed **four**, not 36, public tools. | Initialize ~388 tokens; four-tool listing 5,701 B/~1,426 tokens (`agent://ColdMcpAgent/report`; `src/lib/server/mcp-api.ts:492-506`). |
| Search FX and weather; `list {limit:100}` | FX returned no suitable Tool or no-match signal. Weather search returned nine mixed results. A 56-entry list had no further cursor; no zero-priced Tool in those entries. | FX three hits ~1,675 tokens; nine weather hits 18,562 B/~4,641; 56 entries 94,709 B/~23,678. Text duplicates structured payload (`agent://ColdMcpAgent/report`; `src/lib/server/mcp-api.ts:563-590`). |
| Describe Weather Current; attempt quote/call; register OAuth client and request device code | Opaque `query` object required guessing. Quote/call returned 401, no URL in body. Registration without `redirect_uris` returned generic `invalid_client`; adding it succeeded. Device polling returned `authorization_pending`, not a token. | Describe ~1,265 tokens; 401 body ~44 tokens; no Quote/Call (`agent://ColdMcpAgent/report`). |

| HTTP step | Observed outcome | Size / limit |
|---|---|---|
| GET `/`, `/llms.txt`, `/openapi.json`, `/.well-known/ucp?technical=1` | Compact agent guide exists, but the root does not point agents to it. OpenAPI does not list funding-session creation. | `/` 1,521,025 B/~435,510 tokens; `/llms.txt` ~705; OpenAPI ~40,403; technical UCP ~61,125 (`agent://ColdHttpAgent/report`). |
| GET unknown `/.well-known/agent-card.json` and `/.well-known/mcp` | Each returned 404 `text/html` rather than a small problem body. The missing AgentCard is not itself an A2A defect. | ~30.5 KB/~8,361 and ~8,359 tokens respectively (`agent://ColdHttpAgent/report`). |
| Search FX and Sydney weather; describe Weather Current; quote | FX returned three unrelated listings or zero on alternate wording. Sydney yielded nine mixed hits. Description required an unconstrained `query` object; Quote returned 401 problem with OAuth challenge header but no body continuation. | No binding Quote or live weather Call (`agent://ColdHttpAgent/report`). |
| GET funding constraints, POST funding quote, POST funding-session creation | Preflight succeeded: A$5 principal yielded A$5.28 total and a funding-session next action. Unauthenticated creation returned 401. Route missing from OpenAPI; no checkout created. | Technical UCP carries the payload at ~61,125 tokens (`agent://ColdHttpAgent/report`; `src/routes/api.v1.account.funding-sessions.ts:6-9`). |
| Repeated anonymous reads and unauthenticated Quotes | `RateLimit-Remaining` stayed at 120 and 5 respectively. `x-ae-request-id` appeared but `/llms.txt` and `/SKILL.md` did not explain it. Existing `/api/v1/nonexistent` correctly returned a concise problem+json 404. | Repeated header values, not a live remaining quota (`agent://ColdHttpAgent/report`; `src/lib/server/rate-limit.ts:130-165`). |

## 12. Friction map

Ranked by severity, then journey order. Identical failures across surfaces share one row and one fix. `S1` includes legitimate human-authority boundaries; those are **continuations to design**, not defects to bypass. The journey scout mapped source-defined paths but did **not** run a live probe. Its unobserved risks are labelled `[INFERENCE]` (`agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`; `agent://FrictionJourneyScout/report`).

| Stage | Surface | Class | Severity | Evidence | Fix |
|---|---|---|---|---|---|
| First-contact | CLI | BLOCKED | S1 | External npm install returned E404; local dist works (`agent://ColdCliAgent/report`). | D9, needs Joel's npm credentials/decision. |
| Search | CLI, MCP, HTTP | MISLED | S1 | AUD/USD returned books, crypto or weather, or empty variants, never an FX Tool or explicit no-match (`agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`). | RFC §5 search `noMatch`, plus catalogue coverage diagnosis. |
| Auth/quote | CLI, MCP, HTTP | BLOCKED | S1 | Sydney quote/call cannot proceed without buyer agent credentials. MCP/HTTP 401 body lacks OAuth continuation; CLI quote recommends `ae account connections`, call recommends `ae connect`. Owner approval remains necessary (`agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`). | D4 and RFC §7 auth-required continuation; never remove approval. |
| Consent | Agent key, owner browser | BLOCKED | S1 | [INFERENCE] `needs_authority` requires owner decision; a key alone cannot approve (`agent://FrictionJourneyScout/report`; `src/modules/capability-execution/call-contracts.ts:91-100,316-352`). | RFC §6 `input-required` with status/next action. |
| Pay | CLI, HTTP | BLOCKED | S1 | `ae fund` points to owner-browser credit; funding-session creation is 401 without credentials. Neither yielded a charge (`agent://ColdCliAgent/report`; `agent://ColdHttpAgent/report`). | RFC §6 browser handoff and auth continuation; no silent headless charge. |
| Pay | HTTP discovery | GUESSWORK | S1 | Funding next action names `/api/v1/account/funding-sessions`, absent from OpenAPI despite live route and UCP schema (`agent://ColdHttpAgent/report`; `src/routes/api.v1.account.funding-sessions.ts:6-9`). | D7. |
| Auth/chat | Agent key, chat | BLOCKED | S1 | [INFERENCE] durable chat requires Clerk owner; anonymous stream is discovery-only (`agent://FrictionJourneyScout/report`; `convex/chatMessages.ts:69-83`; `src/routes/api.chat.anonymous.ts:117-164`). | RFC §7 agent-key turn as one principal/budget. |
| First-contact | CLI manifest | MISLED | S1 | [INFERENCE] keyless-call claim conflicts with required credential on `ae call` (`agent://FrictionJourneyScout/report`; `tools/ae/commands/manifest.ts:348-360`; `tools/ae/commands/call.ts:422-455`). | D8. |
| Call | MCP procure | UNSAFE | S2 | [INFERENCE] `ae_tool_procure` can commit payment yet advertises `destructiveHint:false`, `openWorldHint:false` (`agent://FrictionJourneyScout/report`; `src/modules/capability-execution/procure.actions.ts:26-65`). | D1. |
| First-contact | HTTP root, well-known | TOKEN-TAX | S2 | `/` ~435.5k tokens versus `/llms.txt` 705; unknown well-known paths return ~8.4k-token HTML (`agent://ColdHttpAgent/report`). | D6. |
| First-contact | CLI doctor | MISLED | S2 | Degraded JSON exit 0; local origin reported false mismatch; 18 Stripe/x402 env notices bury discovery fault (`agent://ColdCliAgent/report`). | D2. |
| Discover | MCP result projection | TOKEN-TAX | S2 | Four-tool anonymous schema ~1.4k tokens, but 56 entries ~23.7k and nine weather hits ~4.6k with duplicate text/structured payload (`agent://ColdMcpAgent/report`). | D10; RFC §5 concise search, §8 picker. |
| Discover | HTTP OpenAPI | GUESSWORK | S2 | OpenAPI covers only selected groups, not all live api.v1 routes (`agent://ColdHttpAgent/report`; `src/modules/discovery/internal/openapi-document-builder.ts:41-53`). | D7. |
| Search | CLI, MCP, HTTP, chat | GUESSWORK | S2 | [INFERENCE] CLI `nextCommand`, MCP `nextAction`, HTTP candidates and chat-only Jev verdict disagree (`agent://FrictionJourneyScout/report`; `tools/ae/commands/search.ts:58-145`; `src/modules/chat/search-presentation.ts:34-49`). | RFC §5 shared search envelope and §6 typed `next[]`. |
| Choose | CLI, MCP, HTTP | GUESSWORK | S2 | Weather Current says "Just pass a city name", but only requires an arbitrary `query` object; guessed `query.city` is unverified (`agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`). | D12, RFC §8 admission quality. |
| Auth | MCP OAuth | GUESSWORK | S2 | `/oauth/register` omitted `redirect_uris` and returned generic `invalid_client`; valid registration/device code succeeded, owner approval unobserved (`agent://ColdMcpAgent/report`). | D5. |
| Wait | HTTP headers | MISLED | S2 | `RateLimit-Remaining` stayed fixed across reads and 401s; request ID undocumented in compact guides (`agent://ColdHttpAgent/report`). | D3 and D8. |
| Wait/receipt | CLI, HTTP, owner | SLOW | S2 | [INFERENCE] CLI waits by polling, HTTP status uses a durable Call ref, owner page updates only while visible; no shared agent-turn replay (`agent://FrictionJourneyScout/report`; `tools/ae/commands/wait.ts:14-85`; `src/lib/server/call-api.ts:527-584`). | RFC §5 events, §6 status; stored-delta cursor SHOULD in Wave 2. |
| Failure/recovery | CLI JSON | MISLED | S2 | [INFERENCE] error translation drops HTTP problem fields; degraded doctor JSON also exits 0 (`agent://FrictionJourneyScout/report`; `tools/ae/cli.ts:534-613`; `tools/ae/commands/doctor.ts:224-268`). | D11 and D2. |
| Failure/recovery | Buyer status, provider support | GUESSWORK | S2 | [INFERENCE] reconciling an uncertain Call requires verified evidence, not blind replay; provider summary omits buyer data intentionally (`agent://FrictionJourneyScout/report`; `src/modules/capability-execution/call-recovery-contracts.ts:58-90`; `src/modules/capability-supply/supply-actions.ts:397-423`). | RFC §6 status/next and §10 evidence, preserve privacy. |
| Dispute | Buyer, owner | BLOCKED | S2 | [INFERENCE] reconciliation demands evidence and is not a general dispute channel; ordinary contestation has no equivalent among 36 actions (`agent://FrictionJourneyScout/report`; `src/lib/server/call-api.ts:710-811`; `src/components/ae/call-receipt/CallRecoveryPanel.tsx:172-249`). | RFC §10 dispute-evidence invariant; not a Wave 1 dispute oracle. |
| Pay | HTTP guide | GUESSWORK | S2 | Funding payload `{principalAmount,idempotencyKey}` absent from compact guides; technical UCP costs ~61k tokens (`agent://ColdHttpAgent/report`). | D8 compact funding example, RFC §6 prefilled `next[]`. |
| First-contact | MCP GET | GUESSWORK | S3 | GET `/mcp` 405; POST initialise succeeds; no minimal POST example in GET error (`agent://ColdMcpAgent/report`). | RFC §8 discovery instructions, not evidence of a broken POST transport. |

## 13. Root causes and decided design moves

| Root cause | Design move |
|---|---|
| **RC1.** A static action registry over dynamic Operation data forces agents to carry refs and state (`src/modules/actions/index.ts:78-166`; `agent://FrictionJourneyScout/report`). | **Journey handle.** Every response carries `next[]`: typed actions with prefilled args, so an agent never has to invent an ID. A single `status` action accepts any AE ref (`toolRef`, `quoteRef`, `callRef`) and returns the whole journey state plus `next[]`. The direct path is the existing one-shot procure: an exact `toolRef` plus a price ceiling skips search/describe/quote (RFC §6; `src/modules/capability-execution/procure.actions.ts:26-65`). |
| **RC2.** Three authority seams, Clerk owner, agent key and chat, interrupt the buyer journey (`convex/chatMessages.ts:69-83`; `src/lib/server/agent-access-auth.ts:103-198`; `agent://FrictionJourneyScout/report`). | **One principal.** An agent-key principal can run durable chat turns with its own budget. Authentication and approval gaps become explicit continuation states (`auth-required` carrying a device-flow URL and poll handle, and `input-required` for owner approval or consent). A 401/403 never ends as a dead end (RFC §7). |
| **RC3.** Non-unified projections make search, error and event output differ across CLI, MCP, HTTP and chat (`tools/ae/cli.ts:534-613`; `src/lib/server/mcp-api.ts:563-590`; `src/modules/chat/search-presentation.ts:34-49`). | **One contract set** shared by CLI, MCP, HTTP and chat: (i) Search envelope v2: `results[]` with a concise default of about 100 tokens per result and `detail:'full'` on request, plus a `recommendation` from the fast Jev verdict (`use`/`belowMatch`). No suitable result yields explicit `noMatch` with reason and suggestions, never unrelated hits presented as matches. Deep LLM synthesis cites toolRefs only (SHOULD). (ii) RFC 9457 `type`, `title`, `status`, `detail`, `instance` plus `code`, `retryable`, `requestId`, `next[]`, verbatim CLI JSON and MCP `isError` structured content. (iii) AE events map 1:1 to A2A task states: submitted, working, input-required, auth-required, completed, failed, canceled, rejected. Payment state is independent of work state; receipts are artifacts; thread (`contextId`) differs from Call/task (RFC §5; `local://ax/ExtA2aMarket.md:7-9,35-39`). |

MCP sends `outputSchema` plus `structuredContent`, with text content at most a one- or two-line summary, never a duplicate payload (RFC §5; `src/lib/server/mcp-api.ts:416-467,563-590`). `POST /api/v1/chat/turns` uses required agent API key or Clerk authentication, the existing Convex durable thread and AI SDK UI message stream reused from `/api/chat/anonymous`. Its data parts are `data-ae-state`, `data-ae-quote`, `data-ae-receipt`, `data-ae-problem`. CLI `ae chat` renders TTY output or `--json` NDJSON in the AE event vocabulary, supports `--continue` and `--thread <id>`, and cancels via Ctrl-C or `DELETE`. Stored deltas plus cursor are SHOULD in Wave 2 (RFC §7; `src/routes/api.chat.anonymous.ts:96-106,117-164`; `convex/chatGenerate.ts:46-119`).

MCP role toolsets are **discover** (search, describe, compare), **buy** (quote, call, procure, status accepting any ref), **account** (whoami, balance, activity), and **provider** (separate, listed only with provider authority). Read-only mode exposes discover plus account. Operations are never registered as tools (RFC §8; `src/modules/actions/index.ts:101-166`; `src/lib/server/mcp-api.ts:492-506`).

## 14. Wave 1 defect list

Dispatch D1-D11 and D13-D16 without waiting for the RFC, except D9, which needs Joel's npm credentials/decision. D12 belongs **in** the RFC, not immediate defect dispatch. These are decisions and acceptance contracts, not a claim that the fixes are implemented (`agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`; `agent://FrictionJourneyScout/report`; `src/modules/capability-execution/procure-engine.ts:307-315,363-378`; `src/lib/server/call-api.ts:199-225`; `convex/capabilityToolCatalog.ts:117-141`; `src/lib/server/agent-access-auth.ts:167-188,204-214`).

| ID | Exact repair or decision | Evidence | Status at close-out |
|---|---|---|---|
| **D1** | Correct spend/side-effect annotations on `ae_tool_procure` and every action with side effects. | `src/modules/capability-execution/procure.actions.ts:40-63`; RFC §9. | FIXED |
| **D2** | `ae doctor --json`: exit codes match human mode; honour the local advertised origin (no false hosted-origin failure); rank agent-actionable checks above unrelated Stripe/x402 env noise. | `agent://ColdCliAgent/report`; `tools/ae/commands/doctor.ts:207-237,266-268`. | FIXED |
| **D3** | RateLimit headers: live remaining per draft-11 structured fields, or omitted. | `agent://ColdHttpAgent/report`; `src/lib/server/rate-limit.ts:130-165`; [draft -11](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/). | FIXED |
| **D4** | 401/403 problem bodies carry an auth continuation (connect/device-flow URL plus next command). | `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`; RFC §5 and §7. | FIXED |
| **D5** | OAuth `/oauth/register` errors name the missing or invalid field (RFC 7591 `invalid_redirect_uri` / `invalid_client_metadata`). | `agent://ColdMcpAgent/report`; [RFC 7591 §3.2.2](https://www.rfc-editor.org/rfc/rfc7591#section-3.2.2). | FIXED |
| **D6** | Unknown `/.well-known/*` and API-like paths return a small `application/problem+json` 404, not about 8k tokens of HTML; `/` advertises `/llms.txt` via a `Link` header and `<link rel>`. | `agent://ColdHttpAgent/report`; `src/routes/api.$.ts:9-31`. | FIXED |
| **D7** | OpenAPI covers every `api.v1` route, including `/api/v1/account/funding-sessions` (M9). | `agent://ColdHttpAgent/report`; `src/modules/discovery/internal/openapi-document-builder.ts:21-82`; `src/routes/api.v1.account.funding-sessions.ts:6-9`. | FIXED |
| **D8** | Truthfulness: the manifest keyless-call claim, the `ae list --technical` continuation, the README "compatibility pending" line, and documentation of `x-ae-request-id` in `llms.txt`/`SKILL.md`. | `tools/ae/commands/manifest.ts:348-360`; `tools/ae/commands/search.ts:89-101`; `README.md:79-80`; `agent://ColdHttpAgent/report`. | FIXED |
| **D9** | Publish `@aecon/cli` to npm (currently E404). **Needs Joel: npm credentials/decision.** | `agent://ColdCliAgent/report`; the cold test used the former package name, which remains historical evidence above. | BLOCKED: Joel must run `npm login` and create or confirm the `aecon` organisation. |
| **D10** | MCP `outputSchema` plus no text/structured duplication (M2). | `src/lib/server/mcp-api.ts:416-467,508-590`; `agent://ColdMcpAgent/report`. | FIXED |
| **D11** | CLI JSON errors carry validated RFC 9457 fields (M4): preserve the HTTP problem identity, but accept `next[]` only from the same origin or an allowlist and drop remote extensions. | `tools/ae/cli.ts:534-613`; [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457); RFC §5. | FIXED |
| **D12** | Tool contract quality at admission: an Operation whose description implies specific inputs must publish `inputExamples` or a constrained schema. Weather Current says "Just pass a city name" against opaque `query` object. **RFC §8, not defect dispatch.** | `agent://ColdCliAgent/report`; `agent://ColdMcpAgent/report`; `agent://ColdHttpAgent/report`. | FIXED via S8 admission gate; Weather Current provider contract still needs verification. |
| **D13 [money, S1]** | Procure must accept and preserve a caller-supplied idempotency key; today each invocation generates a fresh Call key, so replay after a lost response can pay twice. Preserve `callRef` for nonterminal Calls rather than mapping them to `refused/no_matching_tool` without a handle. | `src/modules/capability-execution/procure-engine.ts:307-315,363-378`. | FIXED |
| **D14 [CQS]** | GET Call status must not consume a source-write nonce through admission. Use read-only admission on the status path. | `src/lib/server/call-api.ts:199-225`; `convex/lib/callLifecycle/callRecoveryActions.ts:301-324`; `convex/lib/callLifecycle/admission.ts:39`. | FIXED |
| **D15 [CQS]** | Source-filtered search must not run `facilitatorDiscovery.reconcile` through `runMutation` on the query path; separate the reconciliation command from the read. | `convex/capabilityToolCatalog.ts:117-141`. | FIXED |
| **D16 [errors]** | Auth-source outages must surface as retryable `UNAVAILABLE`, not 401 `authentication_required`. Reserve the authentication refusal for verified missing or invalid credentials. | `src/lib/server/agent-access-auth.ts:167-188,204-214`. | FIXED |

## 15. Outcome

At this close-out, D1-D8 and D10-D17 are fixed but uncommitted, pending a commit on `ax/agent-experience`. D9 remains blocked on Joel's npm login and the `aecon` organisation. D12 landed as the S8 admission gate, not as a separate defect patch.

| New finding | Outcome |
|---|---|
| **D17. Publication readback** | FIXED. The validator omitted `lifecycle`; repaired in `convex/lib/capabilitySupply/publicationValues.ts`. |
| **D18. Sandbox probe authority** | OPEN, pre-existing. A `system:dev-seed` publisher cannot pass probe authority, so the sandbox Tool is never routeable locally (`convex/lib/capabilitySupply/publishBootstrap.ts:267-274`; `probeAuthority.ts:180-220`; `qualify-candidate.ts:260-303`; `currentTool.ts:398-402`). Give dev-seed a legitimate probe authority or publish under an owner principal. Never bypass qualification. |

| Programme slice | Result |
|---|---|
| RFC S1-S8 | Implemented. A-1 adds `chatTurns`; A-2 uses single-core money handlers and internal `TrustedChatAuthority`; A-3 adds a pure Quote status query. |
| Pre-commit reviews | Idempotency APPROVE after two blocker fixes. Security APPROVE_WITH_CHANGES; all four low findings AX-SEC-01..04 fixed. |
| Verification | Full suite: 7,608 pass. Remaining failures are pre-existing or from Joel's parallel market-flow work. TypeScript's 88 diagnostics match the HEAD baseline. |
| Live checks | MCP role lists, doctor exit, edge 404/HEAD, search `noMatch` and the chat turn lifecycle pass. Procure live replay is blocked by D18. Chat text: native text deltas are lost by a vendor bug (Wave 2 item 17); the saved answer is delivered by the persisted-answer fallback. |

## 16. Wave 2

The prioritised work and dependencies are in [the Wave 2 plan](2026-09-23-agent-experience-wave2-plan.md). D18 must be closed before the live procure replay can count as proof.
