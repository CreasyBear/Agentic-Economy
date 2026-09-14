# Rams design audit

**Scope:** Whether the alpha is useful, understandable, honest, unobtrusive, thorough, aesthetic, and designed with restraint.

**Result:** 24 findings — 16 high, 8 medium.

## High severity

| Source | Quality and evidence | Recommendation |
| --- | --- | --- |
| `src/lib/operator/roles.ts:3` — `roleHomeHref` | **Useful:** owner home is Provider Tools, not the buyer's status or next step. | Create buyer Overview; until then, default buyers to Calls or Agents rather than Provider Tools. |
| `src/components/ae/layout/AeOperatorSidebar.tsx:151` | **Understandable:** every owner sees Buy and Supply regardless of Provider setup. | Disclose Supply only after Provider setup or explicit Sell Tools choice. |
| `src/components/ae/layout/AeOwnerMobileNavigation.tsx:40` | **Useful:** Provider Tools displaces Balance in the mobile primary path. | Use Market, Calls, Agents, and Balance for buyer alpha; separate Provider mode. |
| `src/components/ae/console/AeOwnerCredit.tsx:143` | **Aesthetic:** the most important money fact is an ordinary fact row. | Use a dominant AUD Balance hero and unmistakable Add credit action. |
| `src/components/ae/console/AeOwnerCredit.tsx:176` | **Understandable:** funding and Call movements are separately rendered and ordered under one history promise. | Use one chronological transaction ledger with type, amount, state, time, and documents. |
| `src/routes/fund.$fundingSessionId.tsx:40` | **Honest:** copy names Agent/Stripe continuation while actions route to Balance/Market. | Make action match the originating workflow or state honest close-and-resume guidance. |
| `src/components/ae/market/DirectoryExplorerFilters.tsx:70` | **As little design as possible:** raw price/network/source controls precede basic buyer choice. | Default to need/category, buyer price, availability; put source controls under Advanced. |
| `src/components/ae/market/DirectoryComparison.tsx:9` | **Honest:** comparison looks decision-ready but omits buyer consideration, availability, data use, effects, evidence, and recovery. | Label it preliminary and compare the few material decision dimensions; route to Quote/inspection. |
| `src/components/ae/market/tool-detail/AeToolNextAction.tsx:30` | **Honest:** the strongest visual action only copies an opaque reference. | Make **Use with my Agent** the dominant handoff; keep Copy Tool reference technical. |
| `src/components/ae/console/AeAssistantInstallFunnel.tsx:20` | **Thorough:** setup has no visible progress, connection check, completion state, or next step. | Use connect → confirm → policy → fund if needed → first Tool progression. |
| `src/components/ae/console/AeAgentApprovalsSection.tsx:53` | **Understandable:** consequential approval is identified by `toolRef`, not recognizable facts. | Lead with Tool, Provider, Agent, task, AUD ceiling, consequence, and data use. |
| `src/routes/_operator/activity.tsx:322` | **Unobtrusive:** customer Call detail includes Provider obligation and Provider USDC amount. | Keep buyer amount/outcome/delivery/recovery; move upstream finance facts to advanced/operator detail. |
| `src/routes/calls.$callRef.tsx:294` | **As little design as possible:** receipt foregrounds eight internal status/reference facts before what happened. | Lead with Tool, one outcome, buyer amount, Agent, and time; disclose technical record. |
| `src/routes/calls.$callRef.tsx:605` | **Useful:** recovery expects ordinary customers to submit Provider control-plane evidence. | Use a guided customer report; reserve raw reconciliation for privileged operators/support. |
| `src/components/ae/offerings/AeOwnerOfferings.tsx:100` | **Understandable:** seven columns split one operational status across lifecycle, blocker, readiness, access, and next action. | Default to Tool, customer-visible status/reason, recent activity, and one next action. |
| `src/components/ae/offerings/AeProviderWorkspace.tsx:245` | **Useful:** earnings are hidden inside settings/administration. | Keep My Tools, connections, earnings, and payout readiness primary; administration secondary. |

## Medium severity

| Source | Quality and evidence | Recommendation |
| --- | --- | --- |
| `src/components/ae/console/AeOwnerCredit.tsx:238` | **Restraint:** Balance contains daily closes, reconciliation, and Provider obligations. | Keep Balance to funding, transactions, and customer documents; move operator finance work. |
| `src/components/ae/market/DirectoryHero.tsx:19` | **Unobtrusive:** editorial artwork consumes first-view attention before catalogue value. | Let need search and credible results own the signed-in first viewport. |
| `src/components/ae/market/DirectoryToolCard.tsx:66` | **Understandable:** icon-only plus/check does not disclose comparison behavior. | Use a visible Compare toggle. |
| `src/components/ae/market/tool-detail/AeToolInspector.tsx:58` | **Thorough:** desktop first renders mobile layout, then shifts to a resizable split after effect. | Use responsive CSS or SSR-safe viewport handling for a stable first commit. |
| `src/components/ae/console/AeAgentOperatorConsole.tsx:153` | **Restraint:** repeated full Credit section competes with Agent management. | Show Balance only when it blocks Agent work. |
| `src/routes/_operator/activity.tsx:161` | **Understandable:** most outcomes render as raw state strings. | Use one customer-language status projection and direct remedies for attention states. |
| `src/routes/calls.$callRef.tsx:517` | **Restraint:** Run again, receipt, CLI, API, MCP, and prompt variants are peers. | Use one repeat/handoff action; collapse developer options. |
| `src/components/ae/offerings/ProviderWorkspaceSharedUi.tsx:27` | **Honest:** optional summary outages all use destructive red alerts. | Reserve destructive treatment for dangerous/blocking states; consolidate quiet scoped failures. |

## Rams contract for alpha

- Useful means completing the next commercial step, not exposing every owned fact.
- Honest means the action can perform exactly what the copy promises.
- Thorough means every pending, partial, and recovery state has a safe progression.
- Aesthetic hierarchy follows customer importance: Balance, decision, outcome, remedy, then evidence.
- Restraint is a release strategy: advanced protocol, finance, and Provider controls remain available without competing with the buyer path.
