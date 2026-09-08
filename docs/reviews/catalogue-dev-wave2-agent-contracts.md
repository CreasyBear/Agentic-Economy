# Catalogue wave 2 — live agent contracts

2026-09-08. Live HTTP at http://127.0.0.1:3025, isolated backend 3210. Read current source and used public discovery only; no paid Calls, Quote, deployment or full suites. CLI commands invoked checked-in source using `node --import tsx tools/ae/cli.ts`.

## P1 — Coinbase small-page continuation is invalid

Exact live requests: POST `/api/v1/market-tools/list`, JSON `{"source":"coinbase","limit":1}` returned HTTP200, one Tool, pagination `{limit:1,nextCursor:"1",hasMore:true}`. Following JSON `{"source":"coinbase","limit":1,"cursor":"1"}` returned HTTP200 unavailable/source_unavailable.

Independent direct SDK proof (installed @coinbase/cdp-sdk): `listX402DiscoveryResources({type:'http',limit:1,offset:0})` returned 20 items and `{limit:20,offset:0,total:14445}`. `offset:1` returned the same 20-item page and offset0. `offset:20` returned20 items and offset20. Upstream rounds to its native page boundary; the implementation assumes requested arbitrary offsets survive unchanged.

Evidence: `convex/capabilityToolCatalog.ts` slices the first SDK page to the requested limit and emits offset+items.length, then refuses the next page when SDK pagination.offset differs. Existing unit tests mock arbitrary offsets rather than the actual pinned API behavior.

Smallest fix: map caller offset to native SDK page offset and slice from its within-page position; advance only the consumed items and retain native total. Do not simply discard the offset check and repeat the first resource. Regression must model normalized upstream offsets and prove no gaps/repetition over limits1,3 and20.

## P2 — CLI cannot select the newly advertised external sources

Exact command: `node --import tsx tools/ae/cli.ts list --source coinbase --base-url http://127.0.0.1:3025 --json`. Result: INVALID_ARGUMENT/invalid-arguments, `Unknown option '--source'`, exitCode1. HTTP with the same source succeeds.

Evidence: registry.tools.list/search input schemas and contracts expose source, including CLI surfaces. `tools/ae/lib/args.ts` has no source option. `commands/list.ts` and `commands/search.ts` never forward one.

Smallest fix: add source to the maintained CLI option/parser and applicable command allowlists, forward it through existing schema validation, and preserve it in continuations. Test actual command payloads and generated continuation commands.

## P2 — List continuation drops hard filters

Exact command: `node --import tsx tools/ae/cli.ts list --limit 1 --filters '{"location":"NO MATCH"}' --base-url http://127.0.0.1:3025 --json`.

Live result: count0, hasMore true with native cursor. Generated nextPageCommand is `ae list --limit 1 --cursor <native cursor> --base-url http://127.0.0.1:3025 --json`; it omits filters entirely. Following it broadens the query and may return excluded supply. The native empty-page behavior itself is correct; callers must retain their constraints while continuing.

Evidence: `tools/ae/commands/list.ts` builds nextPageCommand from limit, cursor, origin and JSON flag only. Search already has a filtersContinuation pattern to reuse.

Smallest fix: preserve parsed filters in list continuation, alongside source. Assert a constrained empty-page response emits the same filters and replay it through CLI parsing/payload generation.

## P2 — Invalid native cursor is misreported as retryable outage

POST `/api/v1/market-tools/list` with `{"source":"current","limit":1,"cursor":"garbage"}` returned HTTP503 `{type:"about:blank",title:"Unavailable",status:503,detail:"The Tool catalogue is temporarily unavailable.",kind:"UNAVAILABLE",code:"tool_read_unavailable",retryable:true}`. By contrast Coinbase `cursor:"bogus"` returned HTTP200 unavailable/query_invalid.

Evidence: native paginate errors escape searchHandler, then HTTP generic catch maps them to service unavailability. Invalid user input encourages an ineffective retry rather than restarting pagination. Preserve genuine database/service failures; map only the maintained Convex invalid-cursor error to query_invalid. Add a live/runtime-representative invalid-cursor test, not a blanket catch of query failures.

## Successful checks

- Default list: HTTP200, five current Tools, AUD indicative prices, limit50 and hasMore false.
- Current search timezone before live import: HTTP200 no_candidates, count0, hasMore false.
- Coinbase search `{"source":"coinbase","query":"timezone","limit":3}`: HTTP200, one admitted Timezone Converter, partialResults true, no fabricated search continuation.
- PayAI browse limit1: HTTP200 count0 and cursor1; following cursor1: HTTP200 count0 and cursor2. Unadmitted candidates do not prematurely end source pagination.
- PayAI semantic search weather: HTTP200 unavailable/query_invalid, consistent with browse-only contract.

Report written before authorized CLI corrections. Parent owns live UI and backend follow-up.

## CLI corrections and verification

Implemented the two CLI findings using the existing parser, command allowlists and schema validation. List/search accept source; pagination/browse continuations preserve it. List continuation also retains parsed filters. Updated JSON help for source and list filters.

Focused verification: `npm test -- tests/unit/market-terminal/cold-loop.test.ts tests/unit/market-terminal/cli-errors-help.test.ts --no-file-parallelism` — 2 files, 63 tests passed.

Live corrected command `node --import tsx tools/ae/cli.ts list --source payai --limit 1 --filters '{"location":"NO MATCH"}' --base-url http://127.0.0.1:3025 --json` succeeded and emitted `ae list --limit 1 --cursor 1 --base-url http://127.0.0.1:3025 --source payai --filters '{"location":"NO MATCH"}' --json`.

Coinbase continuation failure independently repeated: cursor1 unavailable/source_unavailable; cursor20 succeeded and emitted cursor21, demonstrating the same within-page issue will recur. Parent owns backend corrections and runtime/type verification.
