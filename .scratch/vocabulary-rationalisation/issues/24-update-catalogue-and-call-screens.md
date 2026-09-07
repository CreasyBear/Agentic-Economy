# Update catalogue and Call screens

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / Tool discovery, Quote, Call history and recovery presentation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 29, 30

## Outcome

### Bounded Tool-card claim — 2026-09-05

`vocab_chat_card_02` owns exactly `src/modules/chat/tool-card.ts`,
`src/components/ae/chat/ToolCard.tsx`, `src/components/ae/chat/presentation.ts`,
`convex/chatShares.ts`, `src/lib/public/chat-ia.ts` and
`tests/unit/chat/operation-call-handback.test.tsx`. Rename Tool card/choice/fact
types and projectors, use `CallResultState` for the existing result-kind alias,
map AE stored `operation-card` to `tool-card`, and choice `supplier` to
`provider`. The structured execute-card field becomes `suggestedNextAction`;
explanatory `nextAction` remains text and shares still regenerate the action
instead of persisting a new field. The two direct public-copy helpers become
`chatShowingTools`/`chatViewTool`. Preserve card kinds, behavior, SDK fields,
privacy and opaque evidence; run the existing handback UI test and narrow checks.

Update the existing public market, catalogue, command-panel, Tool detail,
Quote/Call, activity, chat and recovery screens after the core and
HTTP/MCP/discovery owners have completed their serialized passes. The screen
pass changes visible vocabulary, accessible names, copyable human-facing
instructions, empty/loading/error states and recovery explanations while
preserving the current discovery → anonymous Tool detail → caller Quote → Call
→ delivery/uncertainty → remedy/status journey.

The anonymous registry detail operation is not a caller-specific Quote. Keep
the existing `describe`/detail boundary and the existing `call`-mediated Quote
flow. Do not add a second catalogue object, a new recovery flow, or a new web
route hierarchy.

## Fixed mappings and protected boundaries

| Current AE-owned screen term | Required presentation | Protection |
| --- | --- | --- |
| Operation catalogue item / Operation detail | Tool catalogue item / Tool detail | Rename only AE-owned callable catalogue language. Preserve upstream OpenAPI `operationId`, MCP methods and external registry metadata. |
| `operation.inspect` / anonymous registry describe | `tool.quote` only where a caller Quote is actually requested | Anonymous `registry.tools.describe`/detail stays a detail read; it is not promoted to `tool.quote`. |
| `operation.invoke` / paid invocation | `tool.call` / Call | Preserve issue 19's `operationKeyFor` canonical `operation.invoke` bytes, while displaying the public `tool.call` action. |
| `operation.list` | `call.list` | This is the Call history/list action. It is not `registry.tools` catalogue enumeration. |
| `operation.status/cancel/reconcile` | `call.status/cancel/reconcile` | Preserve one Call lifecycle, terminal reconciliation event and existing recovery semantics. |
| `operationRef` / `commitmentRef` / `invocationRef` | `toolRef` / `quoteRef` / `callRef` | Consume issue 13/15/16 fields only; opaque IDs, hash material and snapshots remain byte-for-byte protected. |
| `maximumSpendPerInvocation` / `maximumConcurrentInvocations` | `maximumSpendPerCall` / `maximumConcurrentCalls` | Consume the issue 16 UI fields without changing authority, limit or amount semantics. |

Preserve Quote v2 version and error semantics, input as opaque Tool/Provider
JSON, HTTP methods, OAuth and x402 fields, call/delivery/payment/purchase
status distinctions, retry/cancel/reconcile behavior, correlation IDs and all
existing focus/keyboard/scroll behavior. A quote is not payment; a Call is not
delivery or purchase resolution.

## Finite implementation allowlist

Every path is literal. Issues 13, 15, 16 and 19 own mechanical source, type,
route and public-contract propagation in these consumers first. This issue
owns only the remaining presentation text, accessible names, state copy and
human-facing snippets after those checkpoints.

### Public market, catalogue and Call route anchors

- `src/routes/index.tsx`
- `src/routes/market.tsx`
- `src/routes/tools.$toolRef.tsx` (post-13 Tool detail route; issue 13 owns
  the filename/route move, issue 24 owns only presentation)
- `src/routes/calls.$callRef.tsx` (post-16 Call receipt route; issue 16 owns
  the filename/route move, issue 24 owns only presentation)
- `src/routes/_operator/activity.tsx`
- `src/routes/t.$threadId.tsx`
- `src/routes/t.new.tsx`
- `src/routes/s.$shareToken.tsx`

The web route filenames above are the exact post-13/post-16 presentation
anchors; this issue does not make a second route decision. The public API target
routes from issue 19 are
consumed but not owned here: `src/routes/api.v1.tools.quote.ts`,
`src/routes/api.v1.tools.call.ts`, `src/routes/api.v1.calls.ts`,
`src/routes/api.v1.calls.$callRef.ts`,
`src/routes/api.v1.calls.$callRef.cancel.ts`,
`src/routes/api.v1.calls.$callRef.reconcile.ts`,
`src/routes/api.v1.market-tools.list.ts`,
`src/routes/api.v1.market-tools.search.ts`,
`src/routes/api.v1.market-tools.describe.ts` and
`src/routes/api.v1.market-tools.compare.ts`.

### Command panel and market components

- `src/components/ae/command-panel/AeCommandPanel.tsx`
- `src/components/ae/command-panel/CommandPanelProvider.tsx`
- `src/components/ae/command-panel/command-panel-state.ts`
- `src/components/ae/command-panel/index.ts`
- `src/components/ae/command-panel/market-tools-client.ts` (post-13 Tool
  client path; issue 24 owns presentation only)
- `src/components/ae/command-panel/pages/ToolDetailPage.tsx` (post-13
  `OperationInspectPage.tsx` path; anonymous Tool detail, not Quote)
- `src/components/ae/command-panel/pages/ToolsSearchPage.tsx` (post-13
  `OperationsSearchPage.tsx` path)
- `src/components/ae/command-panel/recent-tools.ts` (post-13
  `recent-operations.ts` path)
- `src/components/ae/command-panel/useCommandPanelHotKeys.ts`
- `src/components/ae/market/AeCapabilityTile.tsx`
- `src/components/ae/market/AeCompareTray.tsx`
- `src/components/ae/market/AeMarketComparisonView.tsx`
- `src/components/ae/market/AeMarketPage.tsx`
- `src/components/ae/market/AeMarketToolbar.tsx`
- `src/components/ae/market/AeToolCard.tsx` (post-13
  `AeOperationCard.tsx` path)
- `src/components/ae/market/AeToolPrice.tsx` (post-13
  `AeOperationPrice.tsx` path)
- `src/components/ae/market/AeToolTable.tsx` (post-13
  `AeOperationTable.tsx` path)
- `src/components/ae/market/market-return-context.ts`
- `src/components/ae/market/tool-detail/AeToolCompactDecision.tsx`
- `src/components/ae/market/tool-detail/AeToolNextAction.tsx` (post-13
  `AeOperationContinuation.tsx`; this is a Suggested next action, not a Call)
- `src/components/ae/market/tool-detail/AeToolContractSections.tsx`
- `src/components/ae/market/tool-detail/AeToolDecision.tsx`
- `src/components/ae/market/tool-detail/AeToolEconomics.tsx`
- `src/components/ae/market/tool-detail/AeToolFacts.tsx`
- `src/components/ae/market/tool-detail/AeToolIdentity.tsx`
- `src/components/ae/market/tool-detail/AeToolInspector.tsx`
- `src/components/ae/market/tool-detail/AeToolLatencyChart.tsx`
- `src/components/ae/market/tool-detail/AeToolPosition.tsx`
- `src/components/ae/market/tool-detail/AeToolTrackRecord.tsx`
- `src/components/ae/market/tool-detail/index.ts`
- `src/components/ae/market/tool-detail/tool-inspector-model.ts`

### Operation-chat and shared route states

- `src/components/ae/chat/ChatTranscript.tsx` (post-move stem retained)
- `src/components/ae/chat/ToolCard.tsx` (post-move
  `OperationCard.tsx` and `OperationCard` → `ToolCard`)
- `src/components/ae/chat/Chat.tsx` (post-move `OperationChat.tsx` and
  `OperationChat` → `Chat`)
- `src/components/ae/chat/ChatHeader.tsx` (post-move
  `OperationChatHeader.tsx` and `OperationChatHeader` → `ChatHeader`)
- `src/components/ae/chat/ChatComposer.tsx` (post-move
  `OperationComposer.tsx` and `OperationComposer` → `ChatComposer`)
- `src/components/ae/chat/ChatHistory.tsx` (post-move
  `OperationHistory.tsx` and `OperationHistory` → `ChatHistory`; this is
  conversation history, not Call history)
- `src/components/ae/chat/SharedChat.tsx` (post-move
  `SharedOperationChat.tsx` and `SharedOperationChat` → `SharedChat`)
- `src/components/ae/chat/index.ts` (post-move index stem retained)
- `src/components/ae/chat/presentation.ts` (post-move presentation stem
  retained)
- `src/components/ae/home/AeHomeLanding.tsx`
- `src/components/ae/feedback/AeObservabilityErrorBoundary.tsx`
- `src/components/ae/layout/AeOperatorRouteStates.tsx`
- `src/lib/operator/navigation.ts`
- `src/content/brand-copy.ts` — own only the `HOME` export. Leave
  `AGENT_INSTRUCTION`, `AGENT_DOOR` and `AGENT_PAGE` to issue 23,
  `BUSINESS_DOOR` to issue 25 and `ABOUT` to issue 27.

`src/components/ae/command-panel/market-operations-client.ts`, the detail
model and the route files may contain core imports updated by predecessor
issues. Do not independently rename those imports or alter request schemas;
make the presentation pass against the exact post-core paths in the receipts.
Machine-only `AeAgentJsonAffordance` and llms/SKILL/plugin producers remain
issue 21's ownership.

### Focused existing behaviour tests

- `tests/unit/command-panel/command-panel.test.tsx`
- `tests/unit/layout/public-shell-command-panel.test.tsx`
- `tests/unit/market/market-page.test.tsx`
- `tests/unit/market/market-comparison-view.test.tsx`
- `tests/unit/market/compare-tray.test.tsx`
- `tests/unit/market/market-return-context.test.ts`
- `tests/unit/routes/home-catalogue.test.tsx`
- `tests/unit/routes/home-search-error.test.tsx`
- `tests/unit/routes/market-search.test.ts`
- `tests/unit/routes/tool-detail-route.test.tsx` (post-13 Tool detail test)
- `tests/unit/routes/call-status-route.test.tsx` (post-16 Call status test)
- `tests/unit/routes/chat-routes.test.tsx` (post-move
  `operation-chat-routes.test.tsx`)
- `tests/unit/chat/chat-header.test.tsx` (post-move
  `operation-chat-header.test.tsx`)
- `tests/unit/chat-ui/chat-presence.test.tsx` (post-move
  `operation-chat-ui/chat-presence.test.tsx`)
- `tests/unit/routes/public-route-states.test.tsx`
- `tests/unit/routes/operator-side-surface-recovery.test.tsx`

The tests above are maintained behavior checks, not an invitation to rewrite
the market or chat model. Issue 19 owns
`tests/unit/market-terminal/cold-loop.test.ts` and the HTTP/MCP contract tests;
issue 24 consumes their names and does not edit them.

## Post-core handoff and sequencing

The worker must obtain literal before/after paths from the completed receipts,
not infer them from a directory scan:

- Issue 13: `tool-source.ts`, `tool-projection.ts`, `tool-view-model.ts`,
  `tool-ref.ts`, registry `tool-choice-contracts.ts`,
  `tool-detail-route.functions.ts`, `tool-paths.ts` and
  `tools.actions.ts`; `operations.actions` is not a catalogue object after
  the cutover.
- Issue 15: `quote.ts`, `quote.actions.ts` and the current Tool Quote read
  model; the anonymous registry Tool detail remains separate from caller
  Quote.
- Issue 16: `call-*` lifecycle/receipt/recovery/history paths and Call fields.
- Issue 19: `src/lib/server/call-api.ts`, `tool.call`/`tool.quote`,
  `call.list/status/cancel/reconcile`, market-tools routes, and the derived
  MCP names. The canonical `operationKeyFor` contract remains
  `operation.invoke` bytes.
- Issues 20/21: installed CLI, discovery, generated instructions and plugin
  producers. Human-facing copy may link or quote those outputs only after
  their exact producer names are handed over.
- Issue 22: generated router/client artifacts at its producer checkpoints;
  this ticket never edits generated output.

## Explicit exclusions and sequencing

- Consume the exact post-core web targets supplied by issues 13 and 16:
  `src/routes/tools.$toolRef.tsx`, `src/routes/tools.tsx` and
  `src/routes/calls.$callRef.tsx`. Those issues own the filename/route moves;
  this issue owns only presentation and direct UI imports. Do not add an old
  web-route alias, a new Calls index or another route hierarchy.
- Do not edit API/MCP route producers, CLI verbs, package/dist/public bundles,
  llms/SKILL/plugin machine instructions, core modules, Convex schema,
  generated output, deployment state or documentation owned by issue 27/28.
- Do not turn anonymous Tool detail into a Quote, call a Tool from an inspect
  screen without the existing authority/approval path, or display a Quote as
  a payment/settlement receipt.
- Do not recursively rewrite customer Tool input, external registry metadata,
  `operationId`, MCP methods, OAuth/x402 fields, opaque identifiers, hashes or
  signatures.
- Consume issue 20's retained CLI verbs (`describe`, `search`, `history`,
  `call`) and target fields; this ticket does not add aliases, rename verbs or
  choose a CLI compatibility exception.
- No UI redesign, new filters, new recovery operations, new SDK, dependency or
  infrastructure. Existing comparison, chat, Call status and recovery
  workflows remain intact.

## Verification commands and expected results

Run from the project checkout with Node 22 and npm 11.5.1 selected:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run --no-file-parallelism \
  tests/unit/command-panel/command-panel.test.tsx \
  tests/unit/layout/public-shell-command-panel.test.tsx \
  tests/unit/market/market-page.test.tsx \
  tests/unit/market/market-comparison-view.test.tsx \
  tests/unit/market/compare-tray.test.tsx \
  tests/unit/market/market-return-context.test.ts \
  tests/unit/routes/home-catalogue.test.tsx \
  tests/unit/routes/home-search-error.test.tsx \
  tests/unit/routes/market-search.test.ts \
  tests/unit/routes/tool-detail-route.test.tsx \
  tests/unit/routes/call-status-route.test.tsx \
  tests/unit/routes/chat-routes.test.tsx \
  tests/unit/chat/chat-header.test.tsx \
  tests/unit/chat-ui/chat-presence.test.tsx \
  tests/unit/routes/public-route-states.test.tsx \
  tests/unit/routes/operator-side-surface-recovery.test.tsx
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
```

Expected results are Node 22.x, npm 11.5.1, all focused screen/route tests
green and typecheck green after issues 10-22. Run issue 19's exact HTTP/MCP
focused command and issue 22's generated-artifact checks at their checkpoints;
do not substitute a broad root `npm run test:unit` command. Existing baseline
failures are recorded, not hidden by changing protocol or status assertions.

## Acceptance

- The public market, home catalogue, search, compare, detail and command-panel
  surfaces consistently say Tool where the item is an AE callable Tool, with
  correct empty, pending and unavailable states and no stale Provider/Supplier
  ownership claim.
- The detail journey distinguishes anonymous registry Tool description from a
  caller-specific Quote. The Quote/Call controls show price, access terms,
  required input, authority/approval requirements and next valid action before
  dispatch, without changing the underlying request or validation.
- Activity, Call detail, chat transcript/history and recovery screens use
  `callRef`, `quoteRef` and `toolRef` display labels only after their core
  handoff, preserve opaque IDs and distinguish delivery, payment, purchase and
  outcome status. Cancel/reconcile/retry affordances retain current guards and
  accessible disabled/loading/error behavior.
- All copyable human-facing snippets name the actual issue 19-21 HTTP/MCP/
  discovery action, route and recovery contracts. They do not hand-maintain a
  second action map, claim `registry.tools.describe` is `tool.quote`, or
  invent a route/alias.
- Three concrete error paths remain actionable and accessible: catalogue load
  or comparison failure, Call status/receipt failure or uncertainty, and chat
  or command-panel recovery failure. Each preserves correlation/reference
  visibility without exposing secrets.
- Existing comparison, keyboard command-panel, chat presence and route-state
  behavior tests remain green; no machine-only producer or generated artifact
  is changed.

## Closure evidence

Attach the focused test and typecheck output, the final literal changed-path
list, and a short state-matrix note covering catalogue unavailable/empty,
Quote required/denied, Call pending/succeeded/uncertain/failed, and
cancel/reconcile recovery. Confirm consumption of the post-core web routes
`tools.$toolRef.tsx` and `calls.$callRef.tsx`; no API/MCP/CLI/generated
producer or unlisted screen was edited.

## Comments

This is a downstream presentation task, not implementation proof for the
rename. Issues 13 and 16 supply the exact Tool/Call route and field paths
before this worker starts; this issue must not make a second route decision or
silently add an alias.

## Queue correction: complete mechanical UI file and symbol propagation — 2026-09-05

The presentation worker must consume the exact post-13/post-16 source paths and
must not leave a type/import half behind. The mappings below are finite and
mechanical; no visual interaction redesign or new screen model is admitted.
Issues 13 and 16 may first update Tool/Quote/Call fields in these existing UI
callers; after those checkpoints this issue is the sole owner of the UI
filename/symbol move and its importer/test propagation. The slices are
serialized and do not promise independent green halves.

### Exact market and Tool-detail file/symbol mappings

- `src/components/ae/market/AeOperationCard.tsx` →
  `src/components/ae/market/AeToolCard.tsx`; `AeOperationCard` → `AeToolCard`
- `src/components/ae/market/AeOperationPrice.tsx` →
  `src/components/ae/market/AeToolPrice.tsx`; `AeOperationPrice` → `AeToolPrice`
- `src/components/ae/market/AeOperationTable.tsx` →
  `src/components/ae/market/AeToolTable.tsx`; `AeOperationTable` → `AeToolTable`
- `src/components/ae/market/operation-detail/AeOperationCompactDecision.tsx`
  → `src/components/ae/market/tool-detail/AeToolCompactDecision.tsx`;
  `AeOperationCompactDecision` → `AeToolCompactDecision`
- `src/components/ae/market/operation-detail/AeOperationContinuation.tsx` →
  `src/components/ae/market/tool-detail/AeToolNextAction.tsx`;
  `AeOperationContinuation` → `AeToolNextAction`
- `src/components/ae/market/operation-detail/AeOperationContractSections.tsx`
  → `src/components/ae/market/tool-detail/AeToolContractSections.tsx`;
  `AeOperationContractSections` → `AeToolContractSections`
- `src/components/ae/market/operation-detail/AeOperationDecision.tsx` →
  `src/components/ae/market/tool-detail/AeToolDecision.tsx`;
  `AeOperationDecision` → `AeToolDecision`
- `src/components/ae/market/operation-detail/AeOperationEconomics.tsx` →
  `src/components/ae/market/tool-detail/AeToolEconomics.tsx`;
  `AeOperationEconomics` → `AeToolEconomics`
- `src/components/ae/market/operation-detail/AeOperationFacts.tsx` →
  `src/components/ae/market/tool-detail/AeToolFacts.tsx`;
  `AeOperationFacts` → `AeToolFacts`
- `src/components/ae/market/operation-detail/AeOperationIdentity.tsx` →
  `src/components/ae/market/tool-detail/AeToolIdentity.tsx`;
  `AeOperationIdentity` → `AeToolIdentity`
- `src/components/ae/market/operation-detail/AeOperationInspector.tsx` →
  `src/components/ae/market/tool-detail/AeToolInspector.tsx`;
  `AeOperationInspector` → `AeToolInspector`
- `src/components/ae/market/operation-detail/AeOperationLatencyChart.tsx` →
  `src/components/ae/market/tool-detail/AeToolLatencyChart.tsx`;
  `AeOperationLatencyChart` → `AeToolLatencyChart`
- `src/components/ae/market/operation-detail/AeOperationPosition.tsx` →
  `src/components/ae/market/tool-detail/AeToolPosition.tsx`;
  `AeOperationPosition` → `AeToolPosition`
- `src/components/ae/market/operation-detail/AeOperationTrackRecord.tsx` →
  `src/components/ae/market/tool-detail/AeToolTrackRecord.tsx`;
  `AeOperationTrackRecord` → `AeToolTrackRecord`
- `src/components/ae/market/operation-detail/index.ts` →
  `src/components/ae/market/tool-detail/index.ts` (index stem retained)
- `src/components/ae/market/operation-detail/operation-inspector-model.ts` →
  `src/components/ae/market/tool-detail/tool-inspector-model.ts`;
  `operationInspectorModel`/`OperationInspectorModel` →
  `toolInspectorModel`/`ToolInspectorModel`

The same direct Tool type/symbol propagation applies to the post-13
`src/modules/market/tool-view-model.ts` and its `ToolCardViewModel` exports;
issue 13 owns that module move, while this issue owns the UI imports and
presentation labels. Tool detail is anonymous catalogue detail and remains
distinct from caller-specific Quote.

### Exact command-panel file/symbol mappings

- `src/components/ae/command-panel/market-operations-client.ts` →
  `src/components/ae/command-panel/market-tools-client.ts`;
  `OperationChoiceSearchResult` → `ToolChoiceSearchResult`,
  `MarketOperationSearchInput` → `MarketToolSearchInput`,
  `OPERATION_SEARCH_RESULT_LIMIT` → `TOOL_SEARCH_RESULT_LIMIT`,
  `searchMarketOperations` → `searchMarketTools`
- `src/components/ae/command-panel/recent-operations.ts` →
  `src/components/ae/command-panel/recent-tools.ts`;
  `useRecentOperationRefs`/`readRecentOperationRefs`/
  `rememberRecentOperationRef` →
  `useRecentToolRefs`/`readRecentToolRefs`/`rememberRecentToolRef`, with the
  associated `RecentOperations`/`Operation` constants and event names changed
  mechanically to `RecentTools`/`Tool` (the opaque `operation:v1:` identifier
  pattern remains unchanged)
- `src/components/ae/command-panel/pages/OperationInspectPage.tsx` →
  `src/components/ae/command-panel/pages/ToolDetailPage.tsx`;
  `OperationInspectPage` → `ToolDetailPage`
- `src/components/ae/command-panel/pages/OperationsSearchPage.tsx` →
  `src/components/ae/command-panel/pages/ToolsSearchPage.tsx`;
  `OperationsSearchPage` → `ToolsSearchPage`

`ToolDetailPage` is an anonymous Tool detail page, not a Quote page. The
existing command-panel inspect/search state, keyboard behavior and recovery
copy are preserved while imports and visible catalogue terms are updated.

### Exact chat directory/file/symbol mappings

- `src/components/ae/operation-chat/` → `src/components/ae/chat/`
- `src/components/ae/operation-chat/ChatTranscript.tsx` →
  `src/components/ae/chat/ChatTranscript.tsx` (stem retained)
- `src/components/ae/operation-chat/OperationCard.tsx` →
  `src/components/ae/chat/ToolCard.tsx`; `OperationCard` → `ToolCard`
- `src/components/ae/operation-chat/OperationChat.tsx` →
  `src/components/ae/chat/Chat.tsx`; `OperationChat`/`OperationChatProps` →
  `Chat`/`ChatProps`
- `src/components/ae/operation-chat/OperationChatHeader.tsx` →
  `src/components/ae/chat/ChatHeader.tsx`; `OperationChatHeader` → `ChatHeader`
- `src/components/ae/operation-chat/OperationComposer.tsx` →
  `src/components/ae/chat/ChatComposer.tsx`; `OperationComposer` →
  `ChatComposer`
- `src/components/ae/operation-chat/OperationHistory.tsx` →
  `src/components/ae/chat/ChatHistory.tsx`; `OperationHistory` → `ChatHistory`
  (conversation history, never Call history)
- `src/components/ae/operation-chat/SharedOperationChat.tsx` →
  `src/components/ae/chat/SharedChat.tsx`; `SharedOperationChat` → `SharedChat`
- `src/components/ae/operation-chat/index.ts` →
  `src/components/ae/chat/index.ts` (index stem retained)
- `src/components/ae/operation-chat/presentation.ts` →
  `src/components/ae/chat/presentation.ts` (presentation stem retained)

### Exact test-stem mappings and direct UI importers

Move and update the existing focused tests with these exact target names:

- `tests/unit/routes/operation-detail-route.test.tsx` →
  `tests/unit/routes/tool-detail-route.test.tsx`
- `tests/unit/routes/invocation-status-route.test.tsx` →
  `tests/unit/routes/call-status-route.test.tsx`
- `tests/unit/routes/operation-chat-routes.test.tsx` →
  `tests/unit/routes/chat-routes.test.tsx`
- `tests/unit/chat/operation-chat-header.test.tsx` →
  `tests/unit/chat/chat-header.test.tsx`
- `tests/unit/operation-chat-ui/chat-presence.test.tsx` →
  `tests/unit/chat-ui/chat-presence.test.tsx`

The direct import and field-propagation callers are finite:

- `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- `src/components/ae/command-panel/AeCommandPanel.tsx`
- `src/components/ae/command-panel/CommandPanelProvider.tsx`
- `src/components/ae/command-panel/command-panel-state.ts`
- `src/components/ae/command-panel/index.ts`
- `src/components/ae/command-panel/useCommandPanelHotKeys.ts`
- `src/components/ae/home/AeHomeLanding.tsx`
- `src/components/ae/market/AeCompareTray.tsx`
- `src/components/ae/market/AeMarketComparisonView.tsx`
- `src/components/ae/market/AeMarketPage.tsx`
- `src/components/ae/market/AeMarketToolbar.tsx`
- `src/components/ae/supply/AeSupplyLanding.tsx`
- `src/modules/chat/tool-card.ts`
- `src/modules/market/home-catalogue.ts`
- `src/modules/market/server.ts`
- `src/modules/module-boundaries.ts` (entry/path declarations only)
- `src/routes/s.$shareToken.tsx`
- `src/routes/t.$threadId.tsx`
- `src/routes/t.new.tsx`
- `tests/unit/chat/chat-system.test.ts`
- `tests/unit/chat/operation-call-handback.test.tsx`
- `tests/unit/chat/operation-chat-agent-tools.test.ts` →
  `tests/unit/chat/chat-agent-tools.test.ts`
- `tests/unit/chat/operation-chat-provider-boundary.test.tsx` →
  `tests/unit/chat/chat-provider-boundary.test.tsx`
- `tests/unit/chat/operation-chat-provider-contract.test.ts` →
  `tests/unit/chat/chat-provider-contract.test.ts`
- `tests/unit/chat/operation-chat-prune-boundary.test.ts` →
  `tests/unit/chat/chat-prune-boundary.test.ts`
- `tests/unit/command-panel/command-panel.test.tsx`
- `tests/unit/layout/public-shell-command-panel.test.tsx`
- `tests/unit/market/compare-tray.test.tsx`
- `tests/unit/market/market-comparison-view.test.tsx`
- `tests/unit/market/market-page.test.tsx`
- `tests/unit/market/market-return-context.test.ts`
- `tests/unit/market/operation-view-model.test.ts` →
  `tests/unit/market/tool-view-model.test.ts` (post-13 target)
- `tests/unit/release/green-release-baseline.test.ts` (asserts the existing
  chat-conformance list; root manifest update belongs to issue 22)
- `tests/unit/routes/home-catalogue.test.tsx`
- `tests/unit/routes/public-route-states.test.tsx`
- `tests/unit/routes/operator-side-surface-recovery.test.tsx`
- `tests/unit/ui/supply-funnel-harness.tsx`

The moved files must have no old-path imports left in these callers. Core
`toolRef`/`quoteRef`/`callRef` field changes come from issues 13/15/16; issue
24 updates only the UI's mechanical references and presentation. The Tool
route is `tools.$toolRef.tsx` and the Call route is `calls.$callRef.tsx`, both
consumed here after their owning source moves; no target collision or alias is
allowed.

### Manifest handoff and protected values

Root `package.json` is not editable by this issue; issue 22 is the sole writer.
Its exact existing `test:chat:conformance` key receives only the moved test
paths `tests/unit/chat/operation-chat-agent-tools.test.ts` →
`tests/unit/chat/chat-agent-tools.test.ts`,
`tests/unit/chat/operation-chat-provider-boundary.test.tsx` →
`tests/unit/chat/chat-provider-boundary.test.tsx` and
`tests/unit/routes/operation-chat-routes.test.tsx` →
`tests/unit/routes/chat-routes.test.tsx`; the operation-chat provider-contract
and prune tests similarly move to `chat-provider-contract.test.ts` and
`chat-prune-boundary.test.ts`. Preserve every other command key and dependency.

Do not rename upstream `operationId`, MCP methods, OAuth/x402 fields, opaque
identifier prefixes or canonical hash bytes. The screen may display Tool,
Quote and Call labels and the new `toolRef`/`quoteRef`/`callRef` field names,
but `input.input` remains opaque and the existing protected
`operation.invoke`/authority/recovery material remains byte-stable.
