---
name: agentic-economy
description: Discover Tools, buy bounded services with authorized Calls and recover; keep task/planning in the user's harness.
---

# Agentic Economy

Alpha users get trial credit. Paid calls open soon.

Use https://app.aecon.ai/mcp?readonly=1 to discover and read account data without buying or writing.

## Task

Keep need, Tool and input in the harness. Go beyond setup/authenticated reads: Quote
→ authorized Call → output/receipt. Browse-only permits discovery. Recover before
buying again. Return output or exact refusal/uncertainty; continue the task.

Paginate tools/list; refresh after connection. Use only listed tools. Installation
grants no connection/spending authority. Use host settings; refresh in a fresh task
if needed. Never use unlisted sign-in tools or pasted tokens. Setup:
https://app.aecon.ai/for-agents.

Share exact verification link; **Follow live onboarding** observes access before
issuance. `ae_agentAccess_whoami` supplies `principalRef` for
`/agent-access?caller=<principalRef>` with `resumeTool=<toolRef>` or accepted
`callRef=<original Call reference>`. This follows recorded access/Calls, not
planning. No credentials/private input in URLs.

## Discovery

Public `ae_registry_tools_search`, `ae_registry_tools_describe`,
`ae_registry_tools_compare` need no connection. Search capabilities;
describe/compare exact returned refs. Select callable, ready supply; follow
listings/setup handoffs. Candidates confer no authority. Retain query,
source, filters and limit with cursors. Partial assessment is not no match;
failed assessment is not absent supply.
`tool_read_unavailable` means no catalogue read completed: retry as directed;
never invent listings or reuse stale terms.

Optional `includeLatency: true`: 30-day admission-to-completion latency including
recovery, bounded by `window.from`/`to`. Median/p95 need 5 samples among up to 48
latest completed Calls. Absent fields/`insufficient_sample` prove no performance.
Latency is not first-byte, Provider duration or SLA.

## Quote/Call

Inspect recipient/permitted input before quoting: managed x402 price inspection may
send input to that Provider before a Quote. Input can leave Aecon before
purchase/payment. Use `ae_tool_quote` with exact Tool/schema-valid input. Check
price, expiry, effects, data use, authority/approval within user limits. Delegation
needs no extra ceremony; free prices still need authority.

Submit `ae_tool_call` with returned `quoteRef`/stable `idempotencyKey`, saved first.
Same material/key replays; changes need a Quote. Never substitute
Provider/endpoint/price/credential. Keep `callRef`/continuation. `ae quote`
inspects; `ae call` quotes afresh. Explicit Quote/Call actions buy the inspected
Quote. CLI Call journals before submission. `ae call resume <recoveryRef>` reuses
its Quote/key on the original origin/Agent without new input/key.

Share owner handoffs/keep refs. Insufficient credit: follow
`funding.handoff.create`, share hosted Checkout URL, keep session; read
`funding.handoff.status`. After confirmed funding, re-quote before explicit
resubmission. Funding is neither authority nor purchase.

## Procurement/Plans

Exact `ae_tool_procure`: Tool, exact input, AUD ceiling and key. Save full request,
origin/Agent and key before submission. `kind: "need"` only selects/asks for input.
After response loss, replay unchanged material/original key; read returned Call.

CLI exact procurement saves full input/key/origin/Account/Agent in its protected
local journal before submission; returns local recoveryRef.
`ae procure resume <recoveryRef>` needs the same origin/Agent. Known Calls: read
only; no new input/key. Never share journals or include them in diagnostics.
Delivery is not financial resolution; read original Call before buying again.
Refusal without Call can stay unresolved. Persistent Quote preparation needs
support; never replace Quote/key.

For 1–10 admitted nodes/bounded dependencies, use listed `ae_tool_plan_quote`,
`ae_tool_plan_run`, `ae_tool_plan_get`, `ae_tool_plan_cancel` and owner schemas.
Inspect frozen Quote, node ceilings, data flows and exact total. Save `planRef`,
unchanged `approvedTotalAudUnits`, origin/Agent and stable run `idempotencyKey`
before direct HTTP/MCP submission; CLI saves that command in the local purchase
journal before submission. Required owner approval: `/plans/<planRef>`. After
response loss, read same Plan before replaying unchanged run request/key. Partial
results keep completed Calls; cancellation stops future nodes, not completed
effects. Uncertain payment holds capacity until reconciliation. Keep node Call refs
for permitted recovery. `ae plan watch` approval/reconciliation is not completion.

`ae plan resume <recoveryRef>` needs same origin/Agent. Read original Plan first;
submit saved command only if still `quoted`.
Approval/reconciliation/missing/accepted work never creates another run.

Quote all contributions before independent purchases. Keep each Quote/input, exact
price (currency/integer units/exponent), expiry, Account/Agent and budget. Sum units
against task ceiling, not rounded prices. Refused/expired Quotes leave totals
unknown; changes need fresh Quotes. Sums reserve no budget/later authority; earlier
Calls remain spent.

## Recovery

Read `structuredContent.result`/`structuredContent.next`; return output/receipt.
Delivery, settlement and purchase resolution differ. Pending/timeout/unknown
effects: read original work with `ae_call_status` and only offered
`ae_call_reconcile`/`ae_call_cancel`. Respect Retry-After. Response loss never
authorizes a fresh-key purchase. Cancellation does not guarantee rollback. Missing
access/evidence: explain the exact handoff. Preserve historical
`invocationRef`/`operationRef` keys/values for reconciliation; never rename opaque
IDs.

CLI reads: 15s; Quote/Call: 60s each; separate 60s `call --wait`/`ae wait` window.
Timeout establishes neither failure nor cancellation; keep Call/recovery refs. `--json`:
machine-readable stdout, progress on stderr.

## Lifecycle

Start at https://app.aecon.ai/for-providers. Keep draft/connection-attempt refs;
read status on return. Callbacks prove neither connection nor publication. Reopen
secure handoff or listed `ae_supply_connection_detail`; never duplicate a failed
callback. Credentials: secure form only, never prompts/MCP/CLI arguments. Keep exact
authenticated Offering/Publication maintenance identity; never guess
revisions/hashes. Earnings: unavailable (`capability_unsupported`), not zero.
Arbitrary async completion needs SDK/counterparty qualification. Publication,
delivery, money and cleanup are distinct.

Published clients: use advertised contract/protocol and recorded compatibility;
source/local smoke is not hosted proof. The safe public tutorial is unqualified;
paid production Calls/founder privileges are not setup. Keep unresolved purchase
journals/manual direct HTTP/MCP identities before upgrade/uninstall. Local
disconnect/uninstall never cancels/revokes. Complete `ae revoke`’s printed owner
continuation.

## Feedback/help

Optional listed `ae_feedback_submit` or `ae feedback "<message>"`: send
expected/actual behaviour through PostHog with pseudonymous attribution. Exclude
secrets, personal/business data and payloads. Tell user after acceptance; skip
disabled/unavailable feedback, never auto-retry. Continue task; feedback is no
rating/refund.

- Guides: https://app.aecon.ai/llms.txt
- Schemas: https://app.aecon.ai/openapi.json
- Setup help: https://app.aecon.ai/support
- Support: support@aecon.ai

Keep `x-ae-request-id` and safe Call/request refs for support. Never publish
secrets, private input/results or journals. Report unavailable documented
servers/help; never guess hosts or send credentials there.
