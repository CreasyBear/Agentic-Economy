# Verify source and contract completeness

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / independent source-and-contract verification owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30

## Outcome

Independently verify that the implemented vocabulary cutover is complete from
source definitions through consumers, public contracts, generated outputs and
protected evidence. This is a read-and-test issue, not a second implementation
owner: regressions return to the owning ticket, and missing hosted proof belongs
to issues 31 and 35 rather than blocking source or local evidence here.

## Fixed verification contract

Check the accepted mappings as implemented, without selecting alternatives:

- Customer, Agent, Tool, Tool version, Provider, Spending policy, Request
  authorization/Approval, Quote, Call, Action execution, Suggested next action,
  purchase resolution/status and Outcome records are consistent at their
  respective boundaries.
- Generic IAM `Principal`, `Account`, `Business`, `User`, `Credential` and
  `DelegationGrant`; qualified `AgentAccessPrincipal`; portfolio Service,
  Offering, Publication, Listing and Source; `SuppliedQuote`; Provider/Seller/
  payment recipient; and Charge/Provider obligation/payable/Payout/delivery/
  payment distinctions remain separate.
- Public action, route and reference mappings are exactly those owned by issue
  19. MCP names remain action-derived. `/api/v1/registry`, `marketExternalRegistry`
  and `api-registry:v1` remain external metadata, not the canonical market.
- OAuth, upstream OpenAPI `operationId`, MCP methods, x402 fields, opaque
  prefixes, canonical hash/signature material and external financial namespaces
  remain byte/protocol stable. Existing vectors and fail-closed assertions are
  evidence, not replaceable checks.

## Finite evidence allowlist

Read only these authority and review records, plus the exact changed-path and
verification receipts attached by issues 10–31; do not expand a directory from
an occurrence search:

- `PRODUCT.md`
- `CONTEXT.md`
- `AGENTS.md`
- `docs/designs/vocabulary-rationalisation.md`
- `.scratch/vocabulary-rationalisation/issues/08-execution-baseline.md`
- `.scratch/vocabulary-rationalisation/issues/09-consolidate-canonical-language.md`
- `.scratch/vocabulary-rationalisation/issues/10-rationalise-customer-agent-terminology.md`
- `.scratch/vocabulary-rationalisation/issues/11-rename-generic-action-execution.md`
- `.scratch/vocabulary-rationalisation/issues/12-rename-spending-policies-authorizations.md`
- `.scratch/vocabulary-rationalisation/issues/13-rename-callable-catalogue-to-tools.md`
- `.scratch/vocabulary-rationalisation/issues/14-rename-provider-supply-terminology.md`
- `.scratch/vocabulary-rationalisation/issues/15-rename-commitments-to-quotes.md`
- `.scratch/vocabulary-rationalisation/issues/16-rename-purchased-invocations-to-calls.md`
- `.scratch/vocabulary-rationalisation/issues/17-rationalise-next-actions-and-purchase-outcomes.md`
- `.scratch/vocabulary-rationalisation/issues/18-propagate-money-and-durable-record-names.md`
- `.scratch/vocabulary-rationalisation/issues/19-cut-over-http-and-mcp-contracts.md`
- `.scratch/vocabulary-rationalisation/issues/20-update-cli-consumers-and-distribution.md`
- `.scratch/vocabulary-rationalisation/issues/21-update-discovery-and-plugin-instructions.md`
- `.scratch/vocabulary-rationalisation/issues/22-regenerate-shared-artifacts.md`
- `.scratch/vocabulary-rationalisation/issues/23-update-customer-and-agent-screens.md`
- `.scratch/vocabulary-rationalisation/issues/24-update-catalogue-and-call-screens.md`
- `.scratch/vocabulary-rationalisation/issues/25-update-provider-screens.md`
- `.scratch/vocabulary-rationalisation/issues/26-update-money-and-business-record-screens.md`
- `.scratch/vocabulary-rationalisation/issues/27-reconcile-current-documentation.md`
- `.scratch/vocabulary-rationalisation/issues/28-preserve-and-cross-reference-history.md`
- `.scratch/vocabulary-rationalisation/issues/29-engineering-review.md`
- `.scratch/vocabulary-rationalisation/issues/30-developer-experience-review.md`
- `.scratch/vocabulary-rationalisation/issues/31-hosted-cutover-preflight.md`
- `.scratch/vocabulary-rationalisation/reports/29-engineering-review.md`
- `.scratch/vocabulary-rationalisation/reports/30-developer-experience-review.md`
- `.scratch/vocabulary-rationalisation/reports/31-hosted-cutover-preflight.md`

Check these literal implementation and generated anchors after their owners'
receipts, including imports and route/action boundaries:

- `src/modules/actions/index.ts`
- `src/modules/actions/contract.ts`
- `src/modules/module-boundaries.ts`
- `src/modules/capability-execution/quote.ts`
- `src/modules/capability-execution/call-entry.ts`
- `src/modules/action-execution/index.ts`
- `src/modules/agent-access/contract.ts`
- `src/modules/registry/tool-entry.ts`
- `src/modules/registry/tool-paths.ts`
- `src/modules/common/market-tool-paths.ts`
- `src/lib/server/call-api.ts`
- `src/lib/server/mcp-api.ts`
- `convex/schema.ts`
- `src/modules/capability-execution/internal/convex-schema.ts`
- `src/modules/action-execution/internal/convex-schema.ts`
- `packages/cli/dist/ae.js`
- `public/downloads/agentic-economy-cli-0.1.0.tgz`
- `convex/_generated/api.js`
- `convex/_generated/api.d.ts`
- `convex/_generated/server.js`
- `convex/_generated/server.d.ts`
- `convex/_generated/dataModel.d.ts`
- `src/routeTree.gen.ts`

Use the named maintained tests and producers below as the minimum parity
surface; do not create a new checker or replace a test with a text count:

- `tests/unit/schema/convex-schema.test.ts`
- `tests/imports/private-imports.test.ts`
- `tests/imports/tool-surface-conformance.test.ts`
- `tests/unit/discovery/cli-distribution.test.ts`
- `tests/unit/discovery/developer-discovery-parity.test.ts`
- `tests/unit/server/mcp-api-official-client.test.ts`
- `tests/unit/server/mcp-api-protocol.test.ts`
- `tests/unit/server/mcp-api-call-recovery.test.ts`
- `tests/unit/server/call-api.test.ts`
- `tests/unit/server/call-recovery-api.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/integration/canonical-tool-reads.test.ts`
- `tests/integration/current-tool-snapshot-stability.test.ts`

## Exclusions and state rules

- Do not edit application source, generated output, tests, package artifacts,
  deployment state, data, plan/map/work record or Package 6/7 records. A
  failing assertion is assigned back to its owning issue with evidence.
- Do not treat old names in protected protocol/hash material, historical
  records, external registry values or generic IAM as a defect without the
  owning issue's documented exception.
- Do not run `test:cli-package` until the explicit Node 20/22 compatibility
  decision from report 30 is recorded. Do not weaken that assertion or use a
  downloaded runtime for ordinary project commands.
- Preserve issue 08's baseline: Node 22/npm 11.5.1, typecheck/unit/integration
  results and 26 standards findings remain separate from refactor regressions.
- Hosted deployment, reset, financial reconciliation and live browser proof are
  not performed here; their absence does not block this source verification.

## Dependencies and sequencing

Issues 10–28, reviews 29/30 and baseline 08 must be closed before this
verification begins. The verifier consumes issue 22's final generated outputs
and the changed-path receipts from every owner. Issue 31 is not a prerequisite
for source completeness; hosted evidence remains a separate later gate in
issue 35. If the Node 20/22 decision remains open, record that exact blocker
and leave the package-matrix assertion pending rather than claiming full
verification.

## Verification commands and expected results

Run existing commands with Node 22 and npm 11.5.1 through the project runner:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run lint
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check:convex-codegen
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:imports
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:conformance
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:release:architecture
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run gate:anatomy
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:all
```

Expected: all applicable existing checks pass without weakened assertions;
renamed source/consumers, route/action/MCP/discovery/CLI parity, generated
outputs, schema/index codecs and protected vectors agree. `test:cli-package`
is either passed under the coordinator-approved policy or remains explicitly
pending that policy decision. The 26 baseline standards findings are recorded
separately. The verifier attaches command output, the exact remaining old-name
exception list, generated-output hashes and the predecessor changed-path list.

## Acceptance

- [ ] Every predecessor receipt is present and its owned source/contract paths
      are included in the integrated comparison; no definition-only rename or
      stale consumer is hidden by a broad search result.
- [ ] HTTP routes, action IDs, derived MCP names, discovery output, packaged
      CLI, schema/table/index names and AE-owned refs agree with the fixed map.
- [ ] Protected identifiers, canonical bytes/signatures, external protocol
      fields, financial namespaces and generic IAM/portfolio boundaries match
      their recorded baseline vectors and exceptions.
- [ ] All named integrated checks have results; baseline failures and the
      unresolved Node compatibility decision are separately identified.
- [ ] No application, generated, data, deployment, package, plan/map,
      Package 6/7 or unrelated dirty-tree change was made by this verifier.

## Closure evidence

Attach the exact changed-path receipts consumed, command/runtime results,
remaining old-name exception table with reasons, generated artifact parity
receipt, protected-vector comparison, and a statement that hosted proof is
still owned by issues 31/35. Close only after all required predecessor issues
and the review gates are resolved.

