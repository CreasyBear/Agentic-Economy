# Cut over HTTP and MCP contracts to the approved Tool and Call vocabulary

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / public-contract implementation owner
Assigned role: Public HTTP/MCP contract owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 29, 30

## Outcome

Update the AE-owned HTTP and MCP boundary after the Customer/Agent, action
execution, authority, Tool, Provider, Quote, Call, outcome and durable-field
owners have completed their serialized core work. The public action registry,
route descriptors, HTTP adapters, route files, MCP classifier and contract
tests must expose one exact target vocabulary and preserve existing behavior.
This ticket implements the public contract; generated packages, discovery
copy, screens and hosted proof remain downstream work.

## Fixed contract and protected values

Use the exact mappings in
`docs/designs/vocabulary-rationalisation.md:270-291`: `registry.operations.*`
to `registry.tools.*`; `operation.inspect` to `tool.quote`;
`operation.invoke` to `tool.call`; `operation.list` to `call.list`;
`operation.status/cancel/reconcile` to `call.status/cancel/reconcile`;
`/api/v1/market-operations/*` to `/api/v1/market-tools/*`;
`/api/v1/operations/inspect` to `/api/v1/tools/quote`;
`/api/v1/operations/call` to `/api/v1/tools/call`;
`GET /api/v1/operations` to `GET /api/v1/calls`; and the invocation route and
recovery suffixes to `/api/v1/calls/{callRef}`. Rename AE-owned fields
`operationRef`/`commitmentRef`/`invocationRef` to `toolRef`/`quoteRef`/`callRef`
only after their core owners make the corresponding schemas available.

Retain HTTP methods, `/mcp`, MCP JSON-RPC methods and official SDK semantics,
OAuth standard fields, x402 payment fields, upstream OpenAPI `operationId`,
opaque identifiers, hash/signature material, external financial namespaces,
portfolio Service APIs, market-request APIs and all role/financial/delivery
distinctions listed in the accepted plan. MCP tool names remain mechanically
derived from action IDs (`ae_registry_tools_*`, `ae_tool_quote`,
`ae_tool_call`, `ae_call_list/status/cancel/reconcile`); do not hand-maintain a
second name map. Keep `market_supply:manage` unchanged unless the coordinator
explicitly decides a replacement; it is not a free vocabulary choice here.

Authority values are AE-owned and must use the accepted mapping:
`inspect_only` -> `read_only`, `approve_each` -> `approval_required`,
`bounded_mandate` -> `spending_policy`, `full_yolo` ->
`unrestricted_test_only`, `mandate_eligible` -> `policy_eligible`, and
`market_operations:invoke` -> `market_tools:call` with the corresponding
`customer_requests:` mode suffixes. Preserve `offline_access` and OAuth
standard values. A Quote must not require a reusable spending policy when the
supported path is request authorization/Approval.

## Finite implementation allowlist

Only the following source and maintained contract-test paths are in scope. The
target-named route files are the explicit replacements for the listed current
route files; do not sweep adjacent directories.

### Public action and contract sources

- `src/modules/actions/index.ts`
- `src/modules/actions/contract.ts`
- `src/modules/agent-access/contract.ts`
- `src/modules/capability-execution/quote.ts` (issue 15's `operation-commitment.ts`)
- `src/modules/capability-execution/quote.actions.ts` (issue 15's `operation-commitment.actions.ts`)
- `src/modules/capability-execution/call-entry.ts` (issue 16's `operation-invoke-entry.ts`)
- `src/modules/capability-execution/call-contracts.ts` (issue 16's `operation-invoke-contracts.ts`)
- `src/modules/capability-execution/call.actions.ts` (issue 16's `operation-invoke.actions.ts`)
- `src/modules/capability-execution/call-history.actions.ts` (issue 16's `operation-history.actions.ts`)
- `src/modules/capability-execution/call-recovery-contracts.ts` (issue 16's `operation-recovery-contracts.ts`)
- `src/modules/capability-execution/call-recovery.actions.ts` (issue 16's `operation-recovery.actions.ts`)
- `src/modules/capability-execution/call-authority.ts` (issue 16's `operation-invoke.ts`)
- `src/modules/registry/tool-entry.ts` (issue 13's `operation-entry.ts`)
- `src/modules/registry/tool-paths.ts` (issue 13's `operation-paths.ts`)
- `src/modules/registry/tool-action-contracts.ts` (issue 13's `operation-action-contracts.ts`)
- `src/modules/registry/tools.actions.ts` (issue 13's `operations.actions.ts`)
- `src/modules/common/market-tool-paths.ts` (issue 13's `market-operation-paths.ts`)

### HTTP/MCP adapters and route bindings

- `src/lib/server/call-api.ts`
- `src/lib/server/mcp-api.ts` (including operation-prefix classifier and
  action-derived MCP admission)
- `src/routes/mcp.ts`
- `src/routes/api.v1.operations.ts`
- `src/routes/api.v1.operations.inspect.ts`
- `src/routes/api.v1.operations.call.ts`
- `src/routes/api.v1.operations.$invocationRef.ts`
- `src/routes/api.v1.operations.$invocationRef.cancel.ts`
- `src/routes/api.v1.operations.$invocationRef.reconcile.ts`
- `src/routes/api.v1.market-operations.list.ts`
- `src/routes/api.v1.market-operations.search.ts`
- `src/routes/api.v1.market-operations.describe.ts`
- `src/routes/api.v1.market-operations.compare.ts`
- `src/routes/api.v1.tools.quote.ts`
- `src/routes/api.v1.tools.call.ts`
- `src/routes/api.v1.calls.ts`
- `src/routes/api.v1.calls.$callRef.ts`
- `src/routes/api.v1.calls.$callRef.cancel.ts`
- `src/routes/api.v1.calls.$callRef.reconcile.ts`
- `src/routes/api.v1.market-tools.list.ts`
- `src/routes/api.v1.market-tools.search.ts`
- `src/routes/api.v1.market-tools.describe.ts`
- `src/routes/api.v1.market-tools.compare.ts`


### Exact file moves owned by issue 19

- `src/lib/server/operation-invoke-api.ts` → `src/lib/server/call-api.ts`
- `tests/unit/server/operation-invoke-api.test.ts` → `tests/unit/server/call-api.test.ts`
- `tests/unit/server/operation-recovery-api.test.ts` → `tests/unit/server/call-recovery-api.test.ts`
- `tests/unit/server/operation-history-api.test.ts` → `tests/unit/server/call-history-api.test.ts`
- `tests/unit/server/mcp-api-operation-recovery.test.ts` → `tests/unit/server/mcp-api-call-recovery.test.ts`
- `tests/unit/routes/operation-invoke-route-binding.test.ts` → `tests/unit/routes/tool-call-route-binding.test.ts`

Issue 13 already moves `tests/imports/operation-surface-conformance.test.ts` to
`tests/imports/tool-surface-conformance.test.ts`; issue 19 consumes that target
without another file rename.

Update every existing import of the HTTP adapter in the listed route/MCP/test
files, including `tests/integration/capability-call-workpool.test.ts`
(post-16), in this same patch. This additional integration file is an owned
mechanical-import slice, not a change to workpool behavior. `package.json` is
also owned only for updating existing test-path references to these moved
tests; no new scripts or dependencies. Add the moved workpool test to the
focused run. Preserve all existing test assertions.

### Existing contract tests

- `tests/unit/server/mcp-api-official-client.test.ts`
- `tests/unit/server/mcp-api-protocol.test.ts`
- `tests/unit/server/mcp-api-call-recovery.test.ts`
- `tests/unit/server/call-api.test.ts`
- `tests/unit/server/call-recovery-api.test.ts`
- `tests/unit/routes/tool-call-route-binding.test.ts`
- `tests/unit/server/call-history-api.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/imports/tool-surface-conformance.test.ts`

The `operation-*.ts` and `api.v1.operations*` entries above are the current
pre-cutover anchors. Issues 13–16 must hand the coordinator the exact
before/after path pair for every core-renamed file before this ticket is
dispatched; the after paths must be added literally here or in the dispatch
record, never inferred with a wildcard. The target route entries listed above
are already the explicit HTTP replacements.

## Implementation steps that must not be skipped

1. **F1 MCP classifier:** audit every operation-prefix special case in
   `src/lib/server/mcp-api.ts` before changing action IDs. Update recognition to
   the declared `tool`/`call` IDs while preserving generic-action versus
   catalogue-read classification, required authority modes, authentication
   challenges and action-derived names.
2. Keep `tools/list` and `tools/call` dispatch aligned for Quote, Call and
   `call.status/cancel/reconcile`. Verify reconciliation terminal events remain
   one durable Call outcome, not a second effect or an unlisted recovery tool.
3. Propagate the declared Quote v2 contract to route files, schemas, errors and
   version details; do not invent a new version while moving from
   `operation.inspect` to `tool.quote`.
4. Run the focused HTTP/MCP/recovery tests first. Treat the CLI portions of
   `tests/imports/tool-surface-conformance.test.ts` and the full
   conformance result as the post-issue-20/22 integration checkpoint; do not
   demand an independently green CLI half before issue 20 updates it.
5. Preserve the existing HTTP command hash material in
   `src/lib/server/call-api.ts`'s `operationKeyFor`: its
   `contract` field currently receives the literal `operation.invoke` through
   `OPERATION_INVOKE_ACTION_ID`. The public action becomes `tool.call`, but
   this protected canonical field remains `operation.invoke`. Keep the
   existing key builder and add a literal before/after operation-key vector to
   the existing server test. This is a necessary adjustment at an existing
   encoder, not a public alias or a compatibility framework. Predecessors
   13/15/16 own their top-level Tool/Quote/Call reference projections here.
   The Quote's `input` is opaque Tool/Provider JSON, not an AE authorization
   envelope: preserve it exactly, including keys that happen to match old
   vocabulary. Never use recursive key substitution on customer input.

## Explicit exclusions and sequencing

Do not edit CLI command consumers, package README/dist/public archives,
discovery/llms/SKILL/plugin copy, screens, current README, generated Convex or
router output, test data, deployment state, Package 6/7 records or the plan,
map and work record. Do not add a legacy alias, new route hierarchy, SDK,
dependency or error framework. `operation.list` maps to `call.list`; the CLI
verb `history` remains owned by issue 20. The anonymous CLI `describe` remains
registry Tool detail and is not promoted to caller-specific `tool.quote`.

Issues 10–18 provide the core fields and producers before this ticket runs.
Issues 29 and 30 are review gates. Issue 22 owns generation after this source
contract lands. Issues 20 and 21 may prepare disjoint consumers in parallel,
but must not edit these paths or invent a pre-contract mapping.

## Verification commands and expected results

Use Node 22 and npm 11.5.1 through the project NVM runner for all commands:

- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` — pass with the
  target action/route schemas.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types` — pass without
  weakening protected vectors or protocol types.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run
  tests/unit/server/mcp-api-official-client.test.ts
  tests/unit/server/mcp-api-protocol.test.ts
  tests/unit/server/mcp-api-call-recovery.test.ts
  tests/unit/server/call-api.test.ts
  tests/unit/server/call-recovery-api.test.ts
  tests/unit/routes/tool-call-route-binding.test.ts
  tests/unit/server/call-history-api.test.ts
  tests/unit/market-terminal/cold-loop.test.ts
  tests/integration/capability-call-workpool.test.ts --no-file-parallelism` — pass for the focused
  HTTP/MCP/action/recovery boundary.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:conformance` — run at
  the issue 20/22 integration checkpoint; do not use it to claim the CLI half
  is independently complete before issue 20.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:imports` — run at that
  same integration checkpoint after CLI consumers and generated artifacts are
  updated; this is the repository's import/conformance command and it also
  serializes the CLI build owned by issue 22.
- `git diff --check -- src/modules/actions/index.ts
  src/modules/actions/contract.ts src/modules/agent-access/contract.ts
  src/modules/capability-execution/quote.ts
  src/modules/capability-execution/quote.actions.ts
  src/modules/capability-execution/call-entry.ts
  src/modules/capability-execution/call-contracts.ts
  src/modules/capability-execution/call.actions.ts
  src/modules/capability-execution/call-history.actions.ts
  src/modules/capability-execution/call-recovery-contracts.ts
  src/modules/capability-execution/call-recovery.actions.ts
  src/modules/capability-execution/call-authority.ts
  src/modules/registry/tool-entry.ts
  src/modules/registry/tool-paths.ts
  src/modules/registry/tool-action-contracts.ts
  src/modules/registry/tools.actions.ts
  src/modules/common/market-tool-paths.ts
  src/lib/server/call-api.ts src/lib/server/mcp-api.ts
  src/routes/mcp.ts src/routes/api.v1.operations.ts
  src/routes/api.v1.operations.inspect.ts src/routes/api.v1.operations.call.ts
  src/routes/api.v1.operations.\$invocationRef.ts
  src/routes/api.v1.operations.\$invocationRef.cancel.ts
  src/routes/api.v1.operations.\$invocationRef.reconcile.ts
  src/routes/api.v1.market-operations.list.ts
  src/routes/api.v1.market-operations.search.ts
  src/routes/api.v1.market-operations.describe.ts
  src/routes/api.v1.market-operations.compare.ts
  src/routes/api.v1.tools.quote.ts src/routes/api.v1.tools.call.ts
  src/routes/api.v1.calls.ts src/routes/api.v1.calls.\$callRef.ts
  src/routes/api.v1.calls.\$callRef.cancel.ts
  src/routes/api.v1.calls.\$callRef.reconcile.ts
  src/routes/api.v1.market-tools.list.ts
  src/routes/api.v1.market-tools.search.ts
  src/routes/api.v1.market-tools.describe.ts
  src/routes/api.v1.market-tools.compare.ts
  tests/unit/server/mcp-api-official-client.test.ts
  tests/unit/server/mcp-api-protocol.test.ts
  tests/unit/server/mcp-api-call-recovery.test.ts
  tests/unit/server/call-api.test.ts
  tests/unit/server/call-recovery-api.test.ts
  tests/unit/routes/tool-call-route-binding.test.ts
  tests/unit/server/call-history-api.test.ts
  tests/unit/market-terminal/cold-loop.test.ts
  tests/imports/tool-surface-conformance.test.ts` — no whitespace errors.

Do not start Convex, deploy, push schema, use `dev --once`, or exercise a
hosted target from this ticket. Any local backend/codegen activity requires the
local-target and activity-safety decision from issue 31 and belongs to issue
22. Record the supplied issue 08 baseline separately from refactor results.

## Acceptance

- [ ] One public action/route registry emits the exact fixed target map; no
      parallel old AE-owned API or compatibility alias remains.
- [ ] Quote v2 remains v2 under the target action name; route files, params,
      error/version details and declared schemas agree without inventing a new
      version.
- [ ] `toolRef`, `quoteRef` and `callRef` propagate through inputs, outputs,
      paths, recovery and conformance while opaque/hash/protocol values stay
      byte-for-byte protected.
- [ ] MCP names derive from action IDs; `/mcp`, initialize/tools/list/tools/call,
      DELETE, structured errors, authentication and OAuth/x402 fields retain
      their established behavior. F1 classifier prefix recognition covers
      Quote, Call and recovery, and reconciliation terminal events remain one
      durable Call outcome.
- [ ] Authority modes/scopes use the accepted values; Quote, request
      authorization/Approval and spending policy remain distinct.
- [ ] Invalid JSON, invalid arguments, auth/scope refusal, idempotency
      conflict, pending/unknown result, status, cancel and reconcile preserve
      problem media, correlation, Retry-After and no-duplicate-Call semantics.
- [ ] All listed focused tests and type/conformance checks pass; no unrelated
      source or protected protocol surface changes.

## Closure evidence

Attach the changed-path list, exact route/action/ref mapping table, MCP derived
name receipt, contract-version/error receipt, authority scope/mode receipt,
focused test results and `git diff --check`. Mark downstream package,
discovery, live-QA and hosted evidence as pending their owners; do not claim
those from this ticket.

## Comments

- 2026-09-05 — Prepared as the single public HTTP/MCP contract owner after the
  bounded DX review. Current pre-cutover names are baseline; implementation
  begins only after issues 10–18, 29 and 30 satisfy their gates.
