# Agent experience Wave 2 plan, 23 September 2026

Wave 1 closes except npm publishing (D9) and the pre-existing sandbox probe-authority defect (D18). Sizes are relative delivery estimates, not dates. Items below are in priority order.

| Item | Why (evidence) | Size | Depends |
|---|---|:---:|---|
| 1. Migrate the MCP server to official SDK 2.0.0 `createMcpHandler`, revision 2026-07-28 | Use the maintained protocol implementation rather than extending custom MCP handling. Preserve stateless compatibility with 2025 clients. | L | Existing MCP role lists and tool response contracts. |
| 2. Serve OAuth Client ID Metadata Documents | Dynamic Client Registration is deprecated; give clients a current registration path. | M | MCP migration and existing OAuth authority model. |
| 3. Trim buyer MCP `tools/list`; add `response_format: concise\|detailed` | Buyer list is 31 KB across 21 tools, with `outputSchema` the bulk. Agents should receive a small default response and request detail only when needed. | M | Item 1; preserve role toolsets and no per-Operation tools. |
| 4. Resume chat streams from stored deltas and `chatTurns.sequence` | A disconnected agent needs a cursor and replay rather than losing the ongoing turn (audit §13; RFC §7; A-1). | L | Wave 1 chat turns and durable `chatTurns` state. |
| 5. Send request-scoped MCP SSE progress for long calls | A caller needs progress for its own long-running request, not another caller's events. | M | Item 1; request-scoped lifecycle. |
| 6. Unify `Idempotency-Key` headers across routes | Clients should reuse one retry convention. Review money-path semantics before changing the existing caller-key and Call-ref contract (audit D13; `src/modules/capability-execution/procure-engine.ts:307-315,363-378`). | L | Money-path design review; Wave 1 idempotency fix. |
| 7. Close D18 dev-seed probe authority, then prove live procure replay | `system:dev-seed` cannot pass probe authority, leaving the sandbox Tool unrouteable (`convex/lib/capabilitySupply/publishBootstrap.ts:267-274`; `probeAuthority.ts:180-220`; `qualify-candidate.ts:260-303`; `currentTool.ts:398-402`). Grant legitimate dev-seed probe authority or publish under an owner principal. Never bypass qualification. | M | Legitimate authority decision; D18 fix before live replay. |
| 8. Automatically recover stuck procure keys | A Quote failure before its reference checkpoint can strand the caller's key; recovery must preserve the same-key purchase path. | M | Item 7 for live proof; existing Quote and procure recovery contracts. |
| 9. Prefill validated original input in same-key retry `next[]` | Retry guidance should carry the validated input instead of asking an agent to reconstruct it. | S | Item 8 and the existing `JourneyNext` projection. |
| 10. Retrieve full tool output after streamed-result truncation | A streamed preview can be truncated; the caller needs a stable route to the full result. | M | Item 4 and durable result reference. |
| 11. Route `noMatch` to marketDemand request `next[]`; return useful `nearMisses` when lexical candidates are empty | Search currently ends the journey without a demand request or useful alternatives for an empty lexical pool. | M | Wave 1 `noMatch` envelope and `JourneyNext` projection. |
| 12. Decide and add an owner grant for signed-in web chat Quote/Call | Signed-in web chat is discovery-only. Joel must decide what owner authority permits purchase before enabling money actions. | L | Joel's grant decision; key-bound authority and money-path review. |
| 13. Verify Weather Current contract against the provider | D12's S8 gate may correctly refuse the published Weather Current input description and opaque `query` schema (audit §14 D12). Check the real provider contract, not the admission rule. | S | Provider contract and S8 admission gate. |
| 14. Publish an Arazzo workflow for search→quote→call→receipt | Agents need a documented execution sequence that follows the real action contracts. | S | Stable Wave 1 action and receipt contracts. |
| 15. Retire pre-existing `ds-grammar` failures and the 88-diagnostic TypeScript HEAD baseline | These debts are not Wave 1 regressions; track them separately from the 7,608 passing tests. | L | Ownership of the baseline and failure set. |
| 16. Blind cold re-test with fresh agents after publish | A fresh user must find and run the published package, not rely on an in-repo CLI. D9 is still blocked on Joel's npm login and `aecon` organisation. | M | D9 publish, then independent fresh-agent test. |
| 17. Fix Convex Agent streaming vendor bug | `@convex-dev/agent` `streamText.js:114-120` calls `markFinishedExternally` before save; `streaming.js:167-174` then drops later chunks in `DeltaStreamer.addParts`. Persisted streams lack text, including at HEAD; signed-in web chat shows text only at completion. Interim: a turn-scoped persisted-answer fallback in the chat read path. Upgrade or patch the vendor, then remove the fallback. | M | Vendor fix or upgrade; keep the fallback until native text deltas are proven persisted. |
| 18. Self-serve sandbox/test agent credential | A headless agent needs a first successful call without human approval. Keep owner approval for real money. | M | Sandbox-only authority design; no relaxation of paid-call gates. |
| 19. Rank Tools by caller readiness | Weather Current was recommended but Quote returned `tool_unsupported` with unverified health; the degraded testnet Tool quoted. Never recommend a Tool the caller cannot Quote. | M | Quote eligibility and health in the discovery projection. |
| 20. Cut the OpenAPI token tax | The complete document is 372 KB, about 93,000 tokens. Publish per-tag documents or a compact agent profile, with links from `llms.txt`. | S | Existing complete OpenAPI document and `llms.txt`. |
| 21. Make `noMatch` scope and near misses honest | `scope:page` and `hasMore` forced repeated searches. Exhaust the candidate set or clearly signal page-local `noMatch`; treat 'forecast' versus 'current' phrasing as a useful near miss rather than an overly strict miss. | S | Search pagination and Wave 1 `noMatch` envelope. |
| 22. Describe buy/account tools at anonymous MCP initialise | An unconnected agent needs to plan the payment path before it can list authenticated tools. Describe the buy and account toolsets in the anonymous initialise instructions. | S | Existing MCP role-toolset definitions. |
| 23. Make `ae doctor` probe any routeable sandbox Tool | The Quote probe is tied to the D18 sandbox FX Tool and reports failure despite a working Quote. Select a routeable sandbox Tool instead. | S | D18 awareness and routeability query. |

North star: A2A-ready invariants in audit §10 remain binding.

## Blind re-test (2026-09-23, post-commit 290de2751)

| Surface | Outcome |
|---|---|
| CLI | Completed Quote, stored credential, honest FX `noMatch`, streamed chat and status. Only npm E404 blocked the published-package path. |
| MCP and HTTP | Completed discovery, honest `noMatch` and actionable 401 connect. Credentials blocked completion because the device flow needs human owner approval. |
| Baseline | Zero completions before this programme. |
