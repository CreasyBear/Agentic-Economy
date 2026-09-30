# Alpha live sweep — Agent/developer machine surfaces

**Surfaces covered:** locally built `@aecon/cli` v0.2.0, README quickstart sequence and ancillary CLI journeys; live Streamable HTTP `/mcp` (initialize, anonymous/authenticated/readonly tools/list, discovery, compare, quote, call, procure, saved Tools, private demand); all 54 `src/routes/api.v1.*` routes, including method/error and list continuation checks. Local origin `http://127.0.0.1:3024`; local Convex 3210. No money was spent. Real supply was used for discovery; `sandbox.aecon-testnet-reference` only for Quote/Call refusal and saved-Tool lifecycle.

**Sign-in:** `npm run -s dev:sign-in-url` was captured privately and opened in a dedicated Chromium tab; signed-in owner landed on `/market`. A fresh isolated CLI config started OAuth device authorization and opened `/agent-access/authorize`; clicking **Connect agent** invoked Clerk email reverification. The owner's email code was unavailable, so that *new* connection could not finish. An already stored, origin-bound buyer key was independently validated by `ae connect --json` (`source: validated_stored`) and used for authenticated HTTP/MCP/CLI reads. The stored provider key returned 401 and was not replaced. The device request later displayed “This connection request expired / No connection or authority changed.” At 390×844, that state fit without horizontal overflow; screenshot `/var/folders/86/v05qr_cd4rz4wm5n46zdjlhw0000gn/T/omp-sshots-15916ef850cad3d7.webp`; Tab focused “Skip to content.”

**Evidence notation:** all statuses below are live local HTTP status codes; for MCP tool errors, HTTP 200 is normal JSON-RPC transport and `structuredContent.status` is the *semantic* Problem status. `application/problem+json` errors sampled contained `type`, `title`, `status`, `detail`, `kind`, `code`; POST-only GET returned 405 + `Allow: POST`. A burst across all 54 routes produced temporary 429 `rate_limited` problems; entries marked 429 were not judged as product defects. `—` means exercised without a defect in that probe, not an assurance of full end-to-end fulfilment.

| # | Route / journey step | Expected | Observed | Severity (blocker/major/minor) | Evidence (screenshot path, response excerpt) | Suspected source path:line |
|---|---|---|---|---|---|---|
| 1 | CLI build → `ae --version` | Runnable development binary | `npm run build --workspace @aecon/cli` succeeded; `ae 0.2.0 (development)` | — | CLI exit 0 | `packages/cli/package.json:17-20` |
| 2 | CLI `search "convert EUR to USD" --json` / HTTP `/market-tools/search` / MCP `ae_registry_tools_search` | Relevant current ready Tool or honest scoped continuation | Search returned `kind:unavailable`, `reason:source_unavailable`, `results:[]`, `assessed.coverage:partial`, `freshness.state:absent`; another query (“web search research”) did return six `match` rows, all `setup_required`/`unverified`. Intermittent ranking/source failure prevents reliable exact-task discovery. | major | CLI exit 0 but unavailable; MCP text reported zero Tools and retry/next-page; current-source query reproduced unavailable | `src/modules/registry/tools.actions.ts:154-178` |
| 3 | CLI `describe` / MCP describe, compare | Exact schemas and comparison | Sandbox describe `found` with required `value:string`; MCP compare of two exact refs `ok` | — | CLI exit 0; MCP 200 `structuredContent.result.kind:found/ok` | `src/modules/registry/tools.actions.ts:280-288` |
| 4 | CLI isolated fresh `connect`, browser approval | Owner approves and agent obtains origin-bound key | Device URI/code displayed; signed-in owner clicked Connect agent, Clerk demanded an emailed verification code unavailable to sweep; CLI returned `kind:pending`; request subsequently expired with no authority change. Existing stored buyer credential validated successfully; this is an external MFA prerequisite, not a bypassable product error. | blocker (verification prerequisite) | Browser modal “Verification required / Enter the code sent to your email”; mobile screenshot above | `src/components/ae/agent-access/authorize-form/useAgentConsentDecision.ts:190-196,323-327` |
| 5 | CLI `doctor --json` | Discovery/Quote/Call readiness | Exit 1 `degraded`: `groups.discovery:fail`, `quoting:skipped`, `purchase:pass` despite connected buyer; local provider secrets reported missing informationally | — (downstream of #2/#6) | CLI `doctor` output, not a claim hosted fulfilment | `tools/ae/doctor/credential.ts:25-33` |
| 6 | CLI `quote` then `call` sandbox Tool; MCP `ae_tool_quote` | Caller-specific AUD Quote then deliberate sandbox Call/receipt | All 66 current list rows had `displayPrice.kind:unavailable`, `reason:fx_missing`; sandbox CLI Quote and Call both refused `pricing_setup_required` before purchase. MCP Quote tool-error had semantic status 400, same code. **No new Call or receipt was created.** | blocker | CLI exit 1 `AUD reference price temporarily unavailable`; HTTP list `66/66` unavailable | `convex/lib/capabilityExecution/quotes/quoteAction.ts:76-89` |
| 7 | CLI `procure --input '{"kind":"need","need":"convert EUR to USD"}'`; MCP `ae_tool_procure` | Select matching **ready** published Tool or honestly refuse | Both returned `no_matching_tool`; the current sandbox FX portfolio alone does not prove a ready matching Tool, so selection remains unproven rather than a confirmed defect. No input was invented. | — | CLI `kind:refused,status:refused,code:no_matching_tool`; MCP semantic 400 | `src/modules/capability-execution/procure-engine.ts` (exact branch unconfirmed) |
| 8 | CLI `history`, `status <existing callRef>` | Read durable historical receipt without creating purchase | `history --limit 2` returned existing completed Call and AUD paid usage; `status` returned `kind:call`, terminal recovery, usage. `status <sandbox toolRef>` returned `kind:tool,readiness:unavailable`; empty request list worked. | — | CLI exits 0; existing callRef redacted in report | `tools/ae/commands/status.ts:250-254` |
| 9 | CLI `saved list → save <sandbox ref> → list → remove` | Account-bound Tool survives list then removes | `available []` → `saved` → list one current descriptor → `removed`; MCP matching lifecycle also succeeded with explicit `{kind:'ae_callable',toolRef}` | — | CLI/MCP successful structured result sequence | `src/modules/market/saved-tools.contracts.ts:15-24` |
| 10 | CLI `request create` / MCP `ae_marketDemand_record` | Record a genuinely missing job, then status/withdraw | CLI valid unusual job returned 503 `source_unavailable`; no requestRef created, so status/withdraw lifecycle cannot proceed. MCP record returned `code:source_unavailable,retryable:true` but incorrectly labeled semantic `status:400,FAILED_PRECONDITION`; MCP status/withdraw for fabricated refs returned `not_found`. | major | CLI 503 “The missing job could not be recorded”; MCP `structuredContent.status:400` | `src/lib/server/mcp-api.ts:246-259`; underlying demand source unavailable |
| 11 | MCP `initialize`, anonymous/authenticated/readonly `tools/list` | Correct negotiated protocol and tiered Tool inventory | 200 protocol `2025-06-18`; anonymous list 3 discovery Tools; authenticated buyer list 24 including quote/call/procure/saved/demand; `readonly=1` list 12 with no quote; anonymous quote 401; invalid list cursor JSON-RPC `-32602` | — | MCP JSON-RPC responses; invalid cursor message names cursor | `src/lib/server/mcp-api.ts:487-505,685-766` |
| 12 | MCP `tools/list` schema for procure and Saved Tool writes | Discoverable required arguments usable by generic MCP clients | **Procure, saved save, saved remove** each advertised `inputSchema:{"type":"object","properties":{},"additionalProperties":false}` even though correct calls require `kind`/`need` or `kind`/`toolRef`; hand-constructed calls work. Schema-following clients cannot form them. | blocker | Authenticated MCP tools/list exact schema; valid `{kind:'ae_callable',toolRef}` saved/removed | `src/lib/server/mcp-api.ts:466-475` (`normalizeObjectSchema` fallback) |
| 13 | MCP `ae_tool_call` | Refuse missing Quote without charge; valid Quote would Call | Fake well-formed `operation-commitment:v1:<64 hex>` returned tool-error semantic 400 `operation_not_current`; paid execution not reachable due #6 | — | MCP 200 tool result `isError:true`; no new Call | `src/lib/server/mcp-api.ts:545-608` |
| 14 | GET `/api/v1/registry?limit=2` → exact `nextCursor` | Page 2 loads with same limit | Page 1 returned 200, `hasMore:true`, cursor length **735**; URL-encoded cursor on page 2 returned 400 `invalid_query_parameter`, `cursor: Too big: expected string to have <=512 characters`. | blocker | Live first/second HTTP requests; list `/market-tools/list` cursor worked | `src/routes/api.v1.registry.ts:22-26,155-160` |
| 15 | GET `/api/v1/businesses?limit=2` → cursors | Each paginated turn shows services or an honestly terminal page | Page 1 had 2 services, pages 2–6 each 200 `services:[]`, `hasMore:true`, rotating `nextCursor`; five empty continuation steps. | major | Live page 1–6 response sequence | `src/modules/registry/internal/services-api-projection.ts:61-72`; `src/modules/registry/registry.actions.ts:189-200` |
| 16 | POST `/api/v1/market-tools/search` unavailable result → returned `pagination.nextCursor` | Every advertised next cursor is reusable with unchanged query/source/limit, or an unavailable result omits unusable pagination | Search with `{source:'current',query:'web search research',limit:2}` returned `kind:unavailable`, `next:[retry]`, yet `hasMore:true` and a 216-character raw cursor; using it unchanged returned HTTP 400 `invalid_cursor`. | major | Two live requests; second `The supplied pagination cursor is invalid or expired.` | `src/modules/registry/tools.actions.ts:176-178`; `src/modules/registry/tool-choice-contracts.ts:380-382,422-434` |
| 17 | GET public errors, POST invalid body, HEAD | Standards-compliant differentiated errors | 400 malformed cursor/duplicate limit/invalid input, 404 missing business/funding session, 405 method/Allow, 401 missing bearer, 429 burst and 200 HEAD with empty body. | — | `/registry?limit=1&limit=2` 400; `/market-tools/search` GET 405 `Allow:POST`; five HEAD routes 200 | `src/lib/server/problem.ts:19-32,63-77` |
| 18 | Authenticated HTTP/MCP from Python standard-library client | Identical bearer key authenticates independent of User-Agent | GET `/api/v1/account` with same valid key is 200 under curl, `python-requests/2.32.0`, `AgentAlpha/1.0`, but 401 `authentication_required` under `Python-urllib/3.14`; authenticated MCP tools/list likewise 401 under urllib. | major | `x-clerk-auth-message: Unexpected error (code=unexpected-error, status=403)` and `x-clerk-auth-reason: unexpected-error`; reproduced with `curl -A` so not a Python header bug | `src/lib/server/agent-access-auth.ts:169-176` (Clerk middleware/verification upstream) |

## HTTP API v1 route census (54/54)

The following is **one live request per route** using its declared method (plus selected valid transitions above). For writes that would alter real supply, payments, Calls or authority, `{}` was deliberately invalid; a 400 validator or 401 auth refusal verifies boundary admission, **not** that a complete legitimate write works. The stored provider credential returned 401 on every Provider route after rate-limit cooldown, so Provider success paths remain untested. Initial 429 responses during the request burst were RFC 9457 rate-limit problems; entries were retried after cooldown where possible.

| Route(s) | Live result / scope |
|---|---|
| `/api/v1/account` | GET 200 authenticated. |
| `/api/v1/account/activity` | POST 200 `available`. |
| `/api/v1/account/balance` | POST 200 `available`. |
| `/api/v1/account/funding-sessions` | POST `{}` 400 `invalid_request`; no session created. |
| `/api/v1/account/funding-sessions/$fundingSessionId` | GET missing ID 404 `funding_session_not_found`. |
| `/api/v1/account/funding-sessions/public/$fundingSessionId` | GET missing ID 404 `funding_session_not_found`. |
| `/api/v1/account/funding/config` | GET 200 `funding_config`. |
| `/api/v1/businesses` | GET 200, pagination broken usability as #15. |
| `/api/v1/businesses/$businessId` | GET known business 200; missing business 404 `service_not_found`. |
| `/api/v1/businesses/search` | GET 200 `ok`. |
| `/api/v1/calls` | GET 200 `available`, historical completed Call listed. |
| `/api/v1/calls/$callRef` | GET existing historical Call 200; unknown Call 404 `invocation_not_found`. |
| `/api/v1/calls/$callRef/cancel` | POST `{}` 400 `invalid_request`, no cancellation. |
| `/api/v1/calls/$callRef/reconcile` | POST `{}` 400 `invalid_request` after initial burst 429. |
| `/api/v1/catalogue-status` | GET 200 `catalogue-status:v1`; HEAD 200 empty. |
| `/api/v1/chat/turns` | POST `{}` 400 `invalid_input` after initial burst 429; no turn started. |
| `/api/v1/chat/turns/$turnRef` | GET and DELETE malformed ref each 400 `malformed_ref`; no turn deleted. |
| `/api/v1/funding/constraints` | GET 200 `funding_constraints`; HEAD 200 empty. |
| `/api/v1/funding/quote` | POST `{}` 400 `invalid_funding_quote`. |
| `/api/v1/market-metrics` | GET 200; HEAD 200 empty. |
| `/api/v1/market-requests` | POST `{}` 400 `invalid_request` after burst 429; valid CLI create failed source unavailable (#10). |
| `/api/v1/market-requests/list` | POST `{limit:2}` 200 `available`, empty. |
| `/api/v1/market-requests/status` | POST `{}` 400 `invalid_request`. |
| `/api/v1/market-requests/withdraw` | POST `{}` 400 `invalid_request` after burst 429. |
| `/api/v1/market-tools/compare` | POST two exact refs 200 `ok`. |
| `/api/v1/market-tools/describe` | POST exact ref 200 `found`; malformed ref 400 `invalid_body`. |
| `/api/v1/market-tools/list` | POST current list 200 (66 rows); `limit:2` valid page 2; bogus cursor 400 `invalid_cursor`; GET 405. |
| `/api/v1/market-tools/search` | POST valid query current matched for web search but FX/sandbox queries intermittently `unavailable` (#2); unavailable response exposed unusable cursor (#16); empty query 400 `invalid_body`; GET 405. |
| `/api/v1/registry` | GET 200, HEAD 200, invalid cursor/limit/duplicate limit 400; valid cursor fails #14. |
| `/api/v1/registry/detail` | GET missing `id` 400 `invalid_query_parameter`; exact page `detailRef` 200. |
| `/api/v1/release` | GET 200 `ok`; HEAD 200 empty. |
| `/api/v1/sandbox-reference` | POST `{}` 200 deterministic sandbox response (request optional). |
| `/api/v1/saved-tools/list` | POST `{}` authenticated 200 `available`; unauthenticated 401. |
| `/api/v1/saved-tools/save` | POST `{}` 400 `invalid_request` after burst 429; valid CLI/MCP save succeeded. |
| `/api/v1/saved-tools/remove` | POST `{}` 400 `invalid_request` after burst 429; valid CLI/MCP remove succeeded. |
| `/api/v1/status/$ref` | GET sandbox operation ref 200 `kind:tool`. |
| `/api/v1/supply/calls` | Initial POST `{limit:2}` 429; retry POST `{}` with stored provider key 401 `authentication_required`. |
| `/api/v1/supply/connections/connect` | POST `{}` provider key 401 (initial 429); no mutation. |
| `/api/v1/supply/connections/detail` | POST `{}` provider key 401 (initial 429). |
| `/api/v1/supply/connections/list` | POST `{}` provider key 401 after cooldown. |
| `/api/v1/supply/connections/reconnect` | POST `{}` provider key 401 (initial 429); no mutation. |
| `/api/v1/supply/connections/revoke` | POST `{}` provider key 401 `authentication_required` after initial burst 429; no mutation. |
| `/api/v1/supply/earnings` | POST `{}` provider key 401 after initial burst 429. |
| `/api/v1/supply/offboarding/status` | POST `{}` provider key 401 after initial burst 429. |
| `/api/v1/supply/publish` | POST `{}` provider key 401 after initial burst 429; no publish. |
| `/api/v1/supply/recheck` | POST `{}` provider key 401 after initial burst 429; no recheck. |
| `/api/v1/supply/republish` | POST `{}` provider key 401 after initial burst 429; no publish. |
| `/api/v1/supply/sources/preview` | POST `{}` provider key 401 after initial burst 429. |
| `/api/v1/supply/status` | Initial POST `{}` 401; repeat during burst 429. |
| `/api/v1/supply/tools/list` | Initial POST `{}` 401; repeat during burst 429. |
| `/api/v1/supply/withdraw` | POST `{}` provider key 401 after initial burst 429; no withdraw. |
| `/api/v1/tools/call` | POST `{}` 400 `invalid_request` after burst 429; valid sandbox CLI Call refused before purchase (#6). |
| `/api/v1/tools/procure` | POST `{}` 400 `invalid_request` after burst 429; valid need CLI/MCP refused (#7). |
| `/api/v1/tools/quote` | POST `{}` 400 `invalid_request` (also transient burst 429); valid sandbox CLI/MCP Quote refused (#6). |

## Not reachable and why

- **New OAuth approval:** Clerk requires the owner's emailed reverification code; none available in the session. Do not bypass MFA or infer that pre-existing stored buyer key verifies fresh approval.
- **Fresh Call and new receipt:** 66/66 current list Tools show `fx_missing`; sandbox Quote refuses `pricing_setup_required`, preventing charge and Call. Existing historical receipt reads are not proof a new Call works.
- **Request save → status → withdraw:** valid request creation refused `source_unavailable` before a requestRef existed. Status/withdraw tested only with nonexistent refs.
- **Provider success paths:** stored provider key returned 401; owner-approved fresh provider credential requires the blocked OAuth/MFA path. No real supplier lifecycle write was attempted.
- **Payment/funding and external x402 execution:** no real-money payments allowed. Invalid-body admission and read-only configuration were tested; no real Stripe checkout, live x402 settlement, or public paid-purchase proof.
- **Mobile/keyboard:** only owner OAuth approval/expired state at 390×844 and keyboard skip-link focus were observed. HTTP, MCP and CLI are machine surfaces without responsive page UI.
