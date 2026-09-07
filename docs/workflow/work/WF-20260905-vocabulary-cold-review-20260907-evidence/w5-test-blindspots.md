# Wave 5 — test and consumer blind spots

Review target: refactor HEAD `a51e17b22` (source cutover commit `3770b43ba`).
Node `v22.22.0`; npm `11.5.1`. I inspected the Tool/Quote/Call action registry,
the public Provider supply landing loader and components, OAuth scope
normalisation/handlers, the MCP name derivation, the technical CLI manifest,
the focused supply/manifest tests, the staging chat smoke, the authenticated
multi-agent E2E, and the release workflow entries that run those gates.

## Confirmed findings (4)

### 1. Provider landing filters out every current public Tool action

- **Severity/confidence:** P2 / 10.
- **Location and motivating code:** `src/lib/server/supply-landing.functions.ts:9-15`
  filters `listMcpActions()` with `action.id.startsWith('registry.operations.')`.
  The producer at `src/modules/actions/index.ts:71-76` registers the four
  public reads as `registry.tools.list/search/describe/compare`.
- **Trigger and impact:** The `/for-providers` route loader at
  `src/routes/for-providers.tsx:8` calls this adapter. Against the real registry
  the filter returns `[]`, so `AeSupplyAgentProof` receives no inspection
  actions and renders “AE public inspection actions are temporarily
  unavailable” at `src/components/ae/supply/AeSupplyAgentProof.tsx:39-42`.
  The provider landing page therefore falsely reports that the public
  inspection surface is unavailable.
- **Evidence/reproduction:** The current registry has no `registry.operations.*`
  entries; its MCP list includes the `registry.tools.*` entries. The focused
  test `npm exec --offline vitest run tests/unit/capability-supply/supply-landing-authority.test.ts --reporter=dot`
  passes because its mock supplies `registry.operations.search` at lines 13 and
  40 of `tests/unit/capability-supply/supply-landing-authority.test.ts`.
  The route test only asserts `Route` is defined at
  `tests/unit/routes/supply-landing.test.ts:5-8`, so neither test executes the
  real producer/filter contract.
- **Minimal correction direction:** Filter by the registered canonical Tool
  read set (or an equivalent registry predicate), then make the focused test
  use canonical IDs and exercise the actual loader/registry boundary.
- **Provenance:** Pre-existing stale adapter and fixture from `f8a23c56d8`,
  omitted when the approved Tool vocabulary cutover landed; not introduced by
  `3770b43ba`, but inside the current cutover boundary.

### 2. Technical manifest exposes unregistered continuation IDs

- **Severity/confidence:** P3 / 9.
- **Location and motivating code:** `src/modules/agent-access/account.actions.ts:362-366`
  declares `safeContinuations: ['operation.status']`; 
  `src/modules/money/funding-handoff.actions.ts:195-198` declares
  `safeContinuations: ['operation.invoke']`. Current registered Call actions
  are `call.status`, `call.cancel`, `call.reconcile`, with the purchase action
  `tool.call`; `findAction` only searches the registered array at
  `src/modules/actions/index.ts:121-123`.
- **Trigger and impact:** The technical CLI manifest includes action
  `invocationContract` objects through `tools/ae/commands/manifest.ts:449-467`
  and emits them in technical mode at lines 485-487. An agent or client that
  treats these dot-addressed strings as action continuations is instructed to
  call IDs that the current registry cannot resolve. This can strand an
  account-activity or post-funding continuation despite the underlying action
  succeeding.
- **Evidence/reproduction:** `npm exec --offline vitest run tests/unit/market-terminal/manifest-oauth.test.ts --reporter=dot`
  passes (3 tests), but its manifest assertions at
  `tests/unit/market-terminal/manifest-oauth.test.ts:113-121` check only that a
  contract has some version, input schema, and output schema. No assertion
  validates `safeContinuations` against `findAction`. The current registry has
  no `operation.status` or `operation.invoke` action.
- **Minimal correction direction:** Replace retired continuation references
  with the canonical action(s) appropriate to each returned state, and add a
  contract/manifest check for action-ID continuations where the field is used
  as an ID.
- **Provenance:** Pre-existing metadata from `391e5e6ae4` and `a34b22d113`,
  respectively; omitted by the later cutover. This finding is limited to
  live action-contract metadata. Historical hash/evidence strings such as
  `src/lib/server/call-api.ts:82` were considered and excluded.

### 3. Staging chat smoke still asserts retired Tool action IDs

- **Severity/confidence:** P2 / 9.
- **Location and motivating code:** `tests/deploy-smoke/chat-browser-staging.spec.ts:65`
  prompts `registry.operations.search`; lines 77 and 109 select
  `data-operation-tool="registry.operations.search"`; lines 83 and 115 assert
  no `operation.invoke` card.
- **Trigger and impact:** The workflow runs this smoke at
  `.github/workflows/kernel-release-gate.yml:148-151` against the exact staged
  revision. Current chat/MCP action identity is derived from canonical IDs;
  `mcpToolName` at `src/modules/actions/index.ts:137-139` maps the registered
  search action to `ae_registry_tools_search`, and no current action produces
  the retired `registry.operations.search` card identity. The smoke therefore
  waits for a card that cannot appear (or drives the model with a retired
  action name), blocking the staging release gate and leaving chat completion
  proof stale.
- **Evidence/reproduction:** `rg` finds no current `registry.operations.*`
  producer or `operation.invoke` chat action; the action registry test expects
  the canonical Tool IDs. The selectors and prompt are in a runnable staging
  test, not historical evidence or a protected protocol field.
- **Minimal correction direction:** Drive the smoke with the canonical
  `registry.tools.search` identity and update selectors/assertions to the
  current Tool/Call card contracts, retaining the no-purchase assertion.
- **Provenance:** Pre-existing staging smoke expectations (`8855703c50`, with
  later assertion edits), omitted by the current cutover; not changed by
  `3770b43ba`.

### 4. Required authenticated E2E requests retired OAuth scopes and MCP name

- **Severity/confidence:** P2 / 10.
- **Location and motivating code:**
  `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts:294,302` submits
  `market_operations:invoke customer_requests:inspect_only`, and line 347
  expects `market_operations:invoke customer_requests:approve_each
  offline_access`. Line 412 calls MCP tool `ae_registry_operations_search`.
- **Trigger and impact:** Current OAuth normalisation only accepts the
  canonical `market_tools:call` plus a recognised
  `customer_requests:*` authority scope (`src/modules/agent-access/oauth-state.ts:263-272`);
  the old `customer_requests:inspect_only` is an unknown scope. Registration
  consequently returns `invalid_scope` at
  `src/lib/server/agent-access-oauth-api.ts:299-302`, while the test expects
  HTTP 201 at lines 296-297. Even if the grant helper were bypassed, the
  expected old token scope and the old MCP name cannot match current output;
  canonical MCP names are derived from registered IDs by
  `src/modules/actions/index.ts:137-139`.
- **Evidence/reproduction:** The authenticated workflow is explicitly a
  required exact-revision gate at
  `.github/workflows/kernel-release-gate.yml:162-194`; with its configured
  Clerk/test environment, the first `beginDeviceGrant` call fails at the
  registration assertion before exercising the lifecycle. The test is skipped
  only when the environment is absent, so the default local skip does not
  protect the configured gate.
- **Minimal correction direction:** Use the canonical OAuth scope constants and
  current authority mode in the helper, expect the issued canonical scope,
  and call `ae_registry_tools_search` (or derive the name from the registry)
  before asserting the anonymous MCP result.
- **Provenance:** Pre-existing E2E helper from `2c4ba262a2`/`a34b22d113`,
  omitted by the cutover; not introduced by `3770b43ba`.

## Counterevidence and gaps

- I did not flag retained `operation.invoke` strings in call hash material,
  action-execution evidence, opaque references, or historical fixture names;
  the product instructions explicitly preserve those meanings.
- I did not flag the compact CLI command `ae supply operations` because it is
  an intentional user-facing command vocabulary retained in
  `tools/ae/commands/manifest.ts:510-512`.
- The staging and authenticated tests were not run against hosted services:
  the brief prohibits broad/deployment checks and the required secrets are not
  available in this review. Their failures are established from the current
  producer contracts and the focused source tests above.
- No other confirmed test/fixture disagreement was retained after this
  bounded pass.
