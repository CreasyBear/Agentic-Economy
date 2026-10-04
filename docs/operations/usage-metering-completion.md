# Usage metering completion plan

This continues the staged plan in the 2026-10-04 usage research and the bounded implementation at `3db69e1de383f5dc1b6f3da57400e2c6247dd566`. The selected product/refactor baseline remains main `284d90e5fc0ad2bd154ad0af5238b11c618d99a7`. Work occurs in the isolated `codex/usage-metering` checkout; the shared checkout is read-only.

## Invariants

The existing Tool → Quote → Call chain owns execution. Formance owns financial postings; provider usage and external meter acknowledgements never confer charging authority. Store exact integer quantities with a declared exponent and unit definition. Buyer gross charge, fee, refund and net charge are distinct from provider obligation and booked transfer. Keep occurrence, delivery, ledger effective/insertion, observation and close clocks explicit.

Reuse installed SDKs, Convex Workpool/Workflow/Aggregate/Migrations, existing financial documents and S3 archive procedures, Sentry/PostHog, and actual licensed Arc ports. Do not add another ledger, queue, auth system, generic log store or competing Arc refactor. Existing refused/unknown states remain visible until evidence supports a result.

## Execution and acceptance ledger

| Phase | Existing foundation | Remaining implementation | Acceptance | Status |
| --- | --- | --- | --- | --- |
| A: measurements | Append-only delivered requests and BlockRun provider observations | Versioned contract-declared units across MCP/HTTP/x402; bounded SDK-parsed streaming completion; exact fractional/large units; maintained migrations backfill | Duplicate replay, missing/invalid evidence, partial stream, cache overlap, revision/history and expiry tests; no extra charge/effect | Implemented locally; combined verification pending |
| B: complete reporting | Scoped paginated exports, source fingerprints, native reconciliation and frozen monthly drafts | Durable partitioned complete-period export/close using existing workers; immutable manifests; aggregation and correction lineage | At least 10,000 rows; retries/restarts, drift, forged scope/cursor, month clock bridge, exact totals; no silent cap | Pending |
| C: close and credit | Existing document workers and billing settings; credit APIs currently refuse credential attribution | Policy-bound automatic usage statements and invoice references; credential activity/usage joins; owner controls and replay | Duplicate/zero/held/incomplete closes, late supplement, renderer failure, tenant/RBAC and currency checks; no duplicate tax invoice or adjustment authority | Pending |
| D: operations | Existing gateway/Call telemetry, retention, notification and observability infrastructure | Safe pre-admission events/trace exports; complete-history forecast; durable policy-bound alert delivery; tariff-backed pricing presentation; optional external meter shadow adapter | No secrets/payloads; outage/retry/replay, tenant isolation and audit history; forecasts identify coverage; meter drift; real actions use existing authority | Pending |
| E: combined verification | Prior source/native/UI evidence at the starting revision | Check each coherent increment, then source suite/build/native restore/visual acceptance on final revision; refresh research/evidence | Required source checks plus explicit external holds; reviewable commits and artifact; no success claim from historical runs | Pending |

Update this ledger with implementation paths, tests and exact results as each phase completes. Do not substitute a checklist for implemented behavior.

### Phase A evidence

`serviceUnits` is an optional part of the existing capability contract. Absent declarations preserve legacy contract digests. A definition fixes version, dimension, pointer, exact quantity encoding/exponent and independent/subset semantics. Its canonical digest identifies the unit; subsets are never added to parents. Existing provider observations carry definitions, exact quantities and immutable attempt/source lineage. Missing/invalid quantities remain unknown. Current receipt, monthly evidence, summaries and CSV/JSON export preserve these semantics.

Streaming chat receipts use the installed `@ai-sdk/provider-utils` EventSource parser and tool-delta tracker, within existing byte/deadline and sensitive-output bounds. Only exact documented routes with `stream:true` are eligible. Completion requires terminal choices and DONE; a missing usage frame remains unknown usage. Unsupported response fields require an adapter rather than silent deletion. Payment reconciliation remains in the existing x402 transport. Sources: [BlockRun chat](https://blockrun.ai/docs/api-reference/chat-completions), [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming), [OpenAI chat](https://developers.openai.com/api/reference/resources/chat). This is bounded completion capture, not an end-user incremental delivery UI.

`migrations:backfillCallMeasurements` reuses the existing projection rebuild with 25-row batches. It is explicitly invoked and resumable; it preserves original Call timestamps, never restores expired content and never performs provider/payment/accounting effects. No migration has been run against a deployment.

Local validation: `npm run check` passed; 102 focused measurement/transport tests passed. Logs: `/tmp/aecon-completion-a-check-4.log`, `/tmp/aecon-completion-a-focused.log`. Final combined evidence must supersede these increment results.

## Local work and external gates

Local implementation and deterministic fixtures are authorized. No spending, paid service calls, signing/submitting crypto, account/credential creation, copying/fetching secrets, permission expansion, production schedule enablement, publication, remote push/PR, main merge or deployment is authorized by this plan. Joel performs any live payment directly.

Monthly usage statements summarize existing settled activity. Current funding tax invoices use an admitted commercial/tax policy. Consolidation must preserve those source documents and avoid another charge/tax invoice for the same funding. New invoice meaning requires explicit admitted policy; report finalization must not silently call the buyer adjustment path.

External meter adoption remains conditional on measured need and approved procurement/security terms. Implement/test a disabled shadow boundary where justified; do not claim a vendor is connected. Native Convex/schema deployment, protected staging/authenticated tests, S3 archive access and Base-mainnet 20-Call/five-listing acceptance require their actual authorized environments. The top source gate's anonymous provisioning step remains held; permitted stages run separately.
