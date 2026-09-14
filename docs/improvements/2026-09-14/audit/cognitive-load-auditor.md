# Cognitive-load audit

**Scope:** Alpha buyer and Provider workflows.

**Result:** 24 findings — 14 high, 10 medium.

## High severity

| Source | Evidence | Recommendation |
| --- | --- | --- |
| `src/lib/operator/roles.ts:3` — `roleHomeHref` | Owner home is Provider operations and the role is labelled “Buy and supply”; there is no neutral starting point. | Create Overview with one next action and compact Balance, attention Calls, Agents, and Provider-status summaries. |
| `src/routes/market.tsx:66` — loader | Curated discovery loads only for `view=discover`; the no-parameter default is the densest catalogue. | Make need-led discovery the default; expose **Browse all Tools** explicitly. |
| `src/components/ae/market/DirectoryExplorerFilters.tsx:70` — `FilterBody` | Seventeen tracked filter keys expose network, hostname, schemas, source metadata, payer breadth, tags, and collections together. | Default to category, buyer price, and availability/Provider; move the rest under Advanced with active chips. |
| `src/components/ae/market/DirectoryToolCard.tsx:61` — `DirectoryToolCard` | Cards lead with upstream USDC and network although the customer funds and controls AUD. | Lead with indicative AUD or “Exact AUD price at Quote”; retain USDC/network as source facts. |
| `src/components/ae/market/tool-detail/AeToolNextAction.tsx:56` — `AeToolNextAction` | The primary continuation copies a Tool reference and leaves the user to remember the remaining cross-app steps. | Use a self-contained **Use with my Agent** handoff, recommended client, staged progress, and resumable waiting state. |
| `src/components/ae/console/AeAgentApprovalsSection.tsx:53` — `AeAgentApprovalsSection` | Approval identity is a raw Tool reference; the user must leave and remember facts. | Show Tool, Provider, Agent, purpose/input summary, all-in AUD ceiling, data release, and external effect inline. |
| `src/components/ae/console/AeAssistantInstallFunnel.tsx:20` — `AeAssistantInstallFunnel` | Setup is a remembered sequence of copying, switching apps, authenticating, starting a task, and inferring success. | Use a persistent checklist: add connection, authenticate, confirm live Agent/Tool search, then continue. |
| `src/routes/_operator/activity.tsx:209` — `ActivityAvailable` | “Needs reconciliation” is counted but unresolved Calls remain mixed into one generic table. | Foreground a Needs attention queue/filter with one remedy per row. |
| `src/routes/calls.$callRef.tsx:294` — `StatusFound` | Receipt identity is generic and raw; Tool name, Provider, Agent, and purpose are absent. | Lead with recognizable Call identity; move attempt/evidence references to technical details. |
| `src/routes/calls.$callRef.tsx:605` — `CallRecoveryActions` | Reconciliation expects ordinary buyers to classify effect release and provide Provider evidence references. | Use observed-outcome choices and prefilled known facts; route raw evidence entry to advanced/privileged support. |
| `src/components/ae/console/AeOwnerCredit.tsx:143` — `AeOwnerCredit` | Available Balance is an ordinary small fact row, not the first-view focal point. | Use a large available amount, reserved/locked status, and adjacent Add credit action. |
| `src/routes/fund.$fundingSessionId.tsx:40` — `FundingReturnPage` | Ready says return to the Agent but actions go to Credit/Market; awaiting says return to Stripe but offers Check credit. | Preserve originating return context, or give honest close-and-resume guidance; use the canonical Balance label. |
| `src/components/ae/supply/useSupplyNativeStartState.ts:34` — `useSupplyNativeStartState` | OpenAPI is default while OpenAPI, MCP, Agent Plugin, and x402 appear equally supported. | Recommend the alpha's proven end-to-end path; disclose other sources only when intentionally supported. |
| `src/components/ae/supply/AeSupplySourceNativeStart.tsx:11` — `AeSupplySourceNativeStart` | Source, selection, candidate, terms, and publication sections accumulate without progress or preserved summaries. | Use Source → Tool → Terms → Review stages; collapse completed stages and retain the saved draft. |

## Medium severity

| Source | Evidence | Recommendation |
| --- | --- | --- |
| `src/routes/_operator/owner.credit.tsx:34` | Balance is not mobile-primary while Provider Tools is. | Put Balance in the mobile buyer path; move Provider Tools behind Provider mode. |
| `src/components/ae/layout/AeOperatorSidebar.tsx:223` | Owner navigation supports badges, but customer attention states do not supply them. | Badge only actionable approvals, unresolved Calls, and blockers; repeat them on Overview. |
| `src/components/ae/market/DirectoryToolCard.tsx:66` | Icon-only plus/check does not visibly mean Compare. | Use a labelled Compare toggle or checkbox. |
| `src/components/ae/console/AeAgentOperatorConsole.tsx:150` | A full Credit section precedes approvals and connected Agents. | Show Balance only as a compact contextual blocker/action. |
| `src/components/ae/console/agent-operator-console-model.ts:28` — `agentFacts` | Fourteen peer facts appear before connection/credential detail. | Default to status, authority, spending limit, and recent attention; group the rest. |
| `src/routes/_operator/activity.tsx:160` — `callStateLabel` | All states except `outcome_unknown` can surface as raw machine vocabulary. | Share one buyer-facing status projection across list, drawer, receipt, and notifications. |
| `src/routes/calls.$callRef.tsx:367` — `ReceiptTimeline` | Six equal internal lifecycle stages precede the simpler success/remedy decision. | Default to Approved → Running → Resolved; disclose exact six-stage evidence. |
| `src/routes/_operator/activity.tsx:322` — `activityFacts` | Buyer Call detail exposes Provider obligation and upstream USDC amount. | Keep buyer outcome, amount, delivery/refund, and remedy primary; disclose finance evidence. |
| `src/routes/calls.$callRef.tsx:517` — `CallReuseActions` | Run again, receipt, CLI, API, MCP, and agent prompt compete as peer continuations. | Use one **Use this Tool again** action; collapse technical variants. |
| `src/components/ae/console/AeCreditTopUpPanel.tsx:234` — `AeAccountFundingPanel` | Funding starts with an empty free-form amount and range math. | Offer two or three policy-valid suggestions plus Other amount; keep authoritative totals preview. |

## Cognitive contract for alpha

- Prefer recognition over recall at every cross-app boundary.
- Keep the next decision and its consequences together.
- Reduce choices before adding explanation.
- Externalise progress; never make the customer remember an internal state or reference.
- Treat domain precision as progressive evidence, not as first-view content.
