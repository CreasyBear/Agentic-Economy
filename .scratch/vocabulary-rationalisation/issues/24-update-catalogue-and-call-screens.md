# Update catalogue and Call screens

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / Catalogue and Call screen owner
Assigned role: Luna Max / Tool discovery, Quote, Call history and recovery presentation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 29, 30

## Outcome

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
- `src/routes/operations.$operationRef.tsx`
- `src/routes/operations.invocations.$invocationRef.tsx`
- `src/routes/_operator/activity.tsx`
- `src/routes/t.$threadId.tsx`
- `src/routes/t.new.tsx`
- `src/routes/s.$shareToken.tsx`

The current web route filenames above are presentation anchors, not permission
to invent target filenames. The public API target routes from issue 19 are
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
- `src/components/ae/command-panel/market-operations-client.ts`
- `src/components/ae/command-panel/pages/OperationInspectPage.tsx`
- `src/components/ae/command-panel/pages/OperationsSearchPage.tsx`
- `src/components/ae/command-panel/recent-operations.ts`
- `src/components/ae/command-panel/useCommandPanelHotKeys.ts`
- `src/components/ae/market/AeCapabilityTile.tsx`
- `src/components/ae/market/AeCompareTray.tsx`
- `src/components/ae/market/AeMarketComparisonView.tsx`
- `src/components/ae/market/AeMarketPage.tsx`
- `src/components/ae/market/AeMarketToolbar.tsx`
- `src/components/ae/market/AeOperationCard.tsx`
- `src/components/ae/market/AeOperationPrice.tsx`
- `src/components/ae/market/AeOperationTable.tsx`
- `src/components/ae/market/market-return-context.ts`
- `src/components/ae/market/operation-detail/AeOperationCompactDecision.tsx`
- `src/components/ae/market/operation-detail/AeOperationContinuation.tsx`
- `src/components/ae/market/operation-detail/AeOperationContractSections.tsx`
- `src/components/ae/market/operation-detail/AeOperationDecision.tsx`
- `src/components/ae/market/operation-detail/AeOperationEconomics.tsx`
- `src/components/ae/market/operation-detail/AeOperationFacts.tsx`
- `src/components/ae/market/operation-detail/AeOperationIdentity.tsx`
- `src/components/ae/market/operation-detail/AeOperationInspector.tsx`
- `src/components/ae/market/operation-detail/AeOperationLatencyChart.tsx`
- `src/components/ae/market/operation-detail/AeOperationPosition.tsx`
- `src/components/ae/market/operation-detail/AeOperationTrackRecord.tsx`
- `src/components/ae/market/operation-detail/index.ts`
- `src/components/ae/market/operation-detail/operation-inspector-model.ts`

### Operation-chat and shared route states

- `src/components/ae/operation-chat/ChatTranscript.tsx`
- `src/components/ae/operation-chat/OperationCard.tsx`
- `src/components/ae/operation-chat/OperationChat.tsx`
- `src/components/ae/operation-chat/OperationChatHeader.tsx`
- `src/components/ae/operation-chat/OperationComposer.tsx`
- `src/components/ae/operation-chat/OperationHistory.tsx`
- `src/components/ae/operation-chat/SharedOperationChat.tsx`
- `src/components/ae/operation-chat/index.ts`
- `src/components/ae/operation-chat/presentation.ts`
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
- `tests/unit/routes/operation-detail-route.test.tsx`
- `tests/unit/routes/invocation-status-route.test.tsx`
- `tests/unit/routes/operation-chat-routes.test.tsx`
- `tests/unit/chat/operation-chat-header.test.tsx`
- `tests/unit/operation-chat-ui/chat-presence.test.tsx`
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

- Do not edit `src/routes/operations.tsx` until the coordinator resolves the
  web-route handoff. The accepted plan specifies public API route replacements
  but does not specify whether this internal redirect is retained or what the
  final web Tool/Call route filenames are. Do not invent
  `tools.$toolRef.tsx`, `calls.$callRef.tsx`, aliases or a new hierarchy; issue
  19/core owners must hand an exact target or explicitly retain these anchors.
- Do not edit API/MCP route producers, CLI verbs, package/dist/public bundles,
  llms/SKILL/plugin machine instructions, core modules, Convex schema,
  generated output, deployment state or documentation owned by issue 27/28.
- Do not turn anonymous Tool detail into a Quote, call a Tool from an inspect
  screen without the existing authority/approval path, or display a Quote as
  a payment/settlement receipt.
- Do not recursively rewrite customer Tool input, external registry metadata,
  `operationId`, MCP methods, OAuth/x402 fields, opaque identifiers, hashes or
  signatures.
- Preserve the existing CLI verbs (`describe`, `search`, `history`, `invoke`)
  until their owning issue supplies the final installed-client behavior; this
  ticket does not add aliases or choose a CLI compatibility exception.
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
  tests/unit/routes/operation-detail-route.test.tsx \
  tests/unit/routes/invocation-status-route.test.tsx \
  tests/unit/routes/operation-chat-routes.test.tsx \
  tests/unit/chat/operation-chat-header.test.tsx \
  tests/unit/operation-chat-ui/chat-presence.test.tsx \
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
cancel/reconcile recovery. Include the exact post-core web-route decision or
handoff for the current `operations.$operationRef` and
`operations.invocations.$invocationRef` anchors. Confirm that no API/MCP/CLI/
generated producer or unlisted screen was edited.

## Comments

This is a downstream presentation task, not implementation proof for the
rename. Pre-cutover `operation-*` source names in these anchors are expected
until issues 13-19 land; the screen worker must not score them as failures or
silently choose a route target.
