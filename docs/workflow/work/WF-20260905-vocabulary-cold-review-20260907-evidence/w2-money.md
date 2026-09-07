# Money boundary cold review

Scope: HEAD `a51e17b22` / source refactor `3770b43ba`, with the earlier money
cutover traced where it is the current caller/producer boundary. Read
`PRODUCT.md`, `CONTEXT.md`, the review brief, and the money/agent-access source
and tests. Inspected: `src/modules/money/**`, `convex/money*.ts`,
`convex/agentMoneyReads.ts`, `convex/lib/agentMoneyReads.ts`,
`src/lib/server/money-query.ts`, `src/lib/server/funding-handoff-api.ts`,
`src/lib/server/money-documents.functions.ts`, the agent account actions and
directory projection, owner credit/agent-access routes and components, action
registry/MCP descriptor projection, and the focused unit fixtures. No source or
tests were changed; no broad checks were run.

## Confirmed findings

### P2 — owner Agent directory still reads a retired money source

- **Confidence:** 10/10. **Provenance:** pre-existing caller/producer drift
  from the no-user Formance cutover (`81da40217`); the Tool/Quote/Call refactor
  left this approved-boundary consumer behind.
- **Location / motivating code:**
  `src/modules/agent-access/agent-access-console.ts:101` calls
  `readAgentCredentialSources(keys, createConvexMoneyQueryPort(), grants)`;
  `:322-325` then requests `readCreditAccount`, `listCreditActivity`, and
  `readKeyUsage` with `currency: 'USD'`. Those port methods in
  `src/lib/server/money-query.ts:35-37` target
  `moneyLedger:readCreditAccount`, `moneyLedger:listCreditActivity`, and
  `moneyLedger:readKeyUsage`. Each current producer in
  `convex/moneyLedger.ts:88-107` is a constant refusal:
  `"{ kind: 'refused', code: 'account_aud_required' }"` (activity/usage add an
  empty `items` array).
- **Concrete trigger / caller path:** an authenticated owner opens
  `/agent-access` or `/owner/credit`; both routes call
  `readAgentDirectoryServer` (`src/routes/_operator/agent-access.ts:57-62`,
  `src/routes/_operator/owner.credit.tsx:71-85`), which reaches the stale
  readback above. `readAgentCredentialSources` catches the refusal at
  `:328-330` and marks every bound credential `dataState: 'unavailable'`.
- **Observable impact:** the owner UI cannot show any bound Agent balance,
  activity, usage, or spend and displays the unavailable state for every Agent,
  even though the new AUD producer exists at `convex/agentMoneyReads.ts:21-60`
  and `:62-65`. That producer returns the current Call/Tool-shaped activity
  (`convex/lib/agentMoneyReads.ts:51-63`, `:127-138`), but this owner consumer
  never calls it. If the consumer is switched later, its enrichment still
  extracts `operationKey` (`agent-access-console.ts:270-301`) while the new
  activity contract supplies `toolRef`, so labels would remain unresolved.
- **Evidence / reproduction:** follow the route calls above with any bound
  credential; all three source queries deterministically return
  `account_aud_required`, the catch returns `activity: []` with
  `dataState: 'unavailable'`, and `AgentDetail` projects no account or usage.
  Existing `tests/unit/routes/agent-access-console.test.ts:42-109` injects a
  successful mock `MoneyQueryPort` (including USD fixtures), so it does not
  exercise the live retired handlers.
- **Minimal correction direction:** route the owner projection through the
  current authenticated AUD Agent money read boundary and map its Call/Tool
  activity into the owner view model, or retire this owner money projection
  until that boundary is available. Align enrichment with the producer's
  `toolRef`; preserve the distinct Call and Tool fields.

### P2 — Agent account activity descriptor advertises old Call terminology and a dead continuation

- **Confidence:** 10/10. **Provenance:** pre-existing descriptor from
  `391e5e6ae`; `3770b43ba` changed the scope, output field, and AUD parameter
  but omitted the remaining descriptor contract.
- **Location / motivating code:**
  `src/modules/agent-access/account.actions.ts:345` says
  `"Returns charge evidence and invocation references without operation
  inputs, outputs, bearer secrets, or payment-provider data."`; `:365` declares
  `safeContinuations: ['operation.status']`. The live action is
  `agentAccess.activity`, whose result items at `:107-117` contain `callRef`
  and `toolRef`, and the current recovery action is `call.status`.
- **Concrete trigger / caller path:** an Agent or MCP client obtains the
  registered action descriptor. `src/modules/actions/index.ts:147-149` uses
  `describeActionForAgent`; MCP renders the action's `summary` and `boundaries`
  in `src/lib/server/mcp-api.ts:570-573`. Execution metadata also exposes the
  action's invocation contract to the action-execution path.
- **Observable impact:** the descriptor tells a caller that rows identify old
  “invocations” and “operations”, and recommends `operation.status`, which is
  not a registered current Call recovery action. A caller following the
  advertised continuation cannot retrieve the Call status through the current
  Tool/Quote/Call surface.
- **Evidence / reproduction:** `rg` over the registered action IDs finds
  `call.status` in `src/modules/capability-execution/call-entry.ts:37` and
  current recovery actions, while no current `operation.status` action exists;
  `tests/unit/agent-access/account-actions.test.ts:106-109` only checks the
  AUD parameter description and does not assert the boundary or continuation.
- **Minimal correction direction:** describe the row identity using the
  current Call/Tool vocabulary and point the safe continuation to the current
  `call.status` action (or another actually registered action appropriate to
  the result).

### P2 — funding handoff metadata still instructs callers with old AE terms

- **Confidence:** 10/10. **Provenance:** pre-existing descriptor from
  `a34b22d11`; `3770b43ba` changed all three funding actions to
  `market_tools:call` but left these strings in the cutover surface.
- **Location / motivating code:**
  `src/modules/money/funding-handoff.actions.ts:160` says the payer receives
  no `"Mandate"`; `:162` says creating a session does not retry the blocked
  `"Operation"`; `:197` declares `safeContinuations: ['operation.invoke']`.
  The current registered purchase path is `tool.quote -> tool.call`, and the
  current Call recovery path is `call.status` / `call.reconcile`.
- **Concrete trigger / caller path:** an Agent asks MCP for
  `funding.handoff.create` or `funding.handoff.status`. The actions are
  registered in `src/modules/actions/index.ts:66-68`; MCP emits each action's
  summary and boundaries through `src/lib/server/mcp-api.ts:570-573`. The
  status action's returned schema at `funding-handoff.actions.ts:76-108`
  contains only funding lifecycle `nextAction` values, so the stale
  `operation.invoke` is metadata guidance rather than a valid returned action.
- **Observable impact:** callers receive a public instruction using retired AE
  authority/role language and a continuation ID that cannot be invoked on the
  current Tool/Quote/Call registry. This can cause a post-funding agent to
  attempt a nonexistent action or misunderstand that funding merely restores
  Account credit; it does not itself authorize or retry a Call.
- **Evidence / reproduction:** current action registration contains
  `tool.call` (`src/modules/capability-execution/call-entry.ts:37-58`) and no
  `operation.invoke` action in `src/modules/actions/index.ts`; MCP's description
  function directly concatenates the stale boundaries. The funding route's
  actual HTTP result maps status to `poll`/`continue` at
  `src/lib/server/funding-handoff-api.ts:269-273`, so no runtime path validates
  the stale continuation.
- **Minimal correction direction:** rewrite the public boundary in current
  Customer/Agent, Account, authority, and Call language; replace the stale
  continuation with a registered current action or a neutral instruction that
  does not invent a funding-to-Call retry contract.

## Uncertain leads and verification gaps

- `src/modules/money/public.ts:331-346` defines `CreditAccountView.accountId`,
  while `CreditAccountViewSchema` at `:421-437` omits it. This is an older
  type/schema mismatch and the current owner path does not parse that schema;
  no confirmed current runtime failure was established, so it is not in the
  confirmed findings.
- `ProviderEarningsView.truncated` is `boolean` at
  `src/modules/money/public.ts:372-383` but `z.literal(false)` at `:464-474`.
  This also predates the vocabulary refactor and appears in release evidence;
  no current source producer was established in this pass.
- Existing `moneyLedger` owner/provider earnings stubs and the removal of
  legacy payout/readback tests were treated as intentional no-user Formance
  cutover/deferred implementation work, not refactor defects. Protected
  external protocol names, opaque/hash/evidence keys, and historical command
  envelope fields were excluded.

## Limits

This was a read-only source review of the money and adjacent Agent account
surfaces. I did not run compiler, broad tests, hosted/deployment checks, or
external payment calls, and I did not modify the checkout.
