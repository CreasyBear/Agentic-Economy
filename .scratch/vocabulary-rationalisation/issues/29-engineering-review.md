# Review the vocabulary refactor execution plan for engineering integrity

Type: task
Label: wayfinder:task
Mode: AFK
Status: claimed
Assignee: Luna Max / refactor engineering-review subagent
Assigned role: Luna Max / independent engineering-review subagent
Parent: ../map.md
Blocked by: 08, 09

## Outcome

Independently review the accepted vocabulary-rationalisation plan and its
materialized issue queue for concept boundaries, permission and money
invariants, ownership/order, durable storage coupling, public-contract impact,
backup/cutover feasibility and structural-change necessity. Record findings in
the owned report below. This is a review gate: it does not implement renames,
rewrite the plan or silently redesign the product.

## Fixed mappings under review

Review the accepted mappings exactly; do not select alternatives:

- Business Principal -> Customer; Agent Principal -> Agent; Callable Operation
  -> Tool; Operation revision -> Tool version; Supplier -> Provider.
- Standing Mandate -> Spending policy; request-specific mandate -> Request
  authorization (Approval for a person's recorded authorization); Commitment
  -> Quote; Purchased Invocation -> Call.
- Generic Action Invocation -> Action execution; Suggested continuation ->
  Suggested next action; Commercial closure -> Purchase resolution / purchase
  status; Outcome evidence -> Outcome records.
- `inspect_only` -> `read_only`; `approve_each` -> `approval_required`;
  `bounded_mandate` -> `spending_policy`; `full_yolo` ->
  `unrestricted_test_only`; `mandate_eligible` -> `policy_eligible`.
- `market_operations:invoke` -> `market_tools:call`, including the related
  `customer_requests:` mode suffixes.
- `supplier_operations:v1` -> `provider_tools:v1`.

The physical table mappings that the review must trace to one owning core issue
are:

| Existing table | Target table |
| --- | --- |
| `actionInvocationControls` | `actionExecutionControls` |
| `actionInvocationAttempts` | `actionExecutionAttempts` |
| `actionInvocationHistory` | `actionExecutionHistory` |
| `capabilitySupplierOperationProjections` | `capabilityProviderToolProjections` |
| `registeredOperationMappings` | `registeredToolMappings` |
| `capabilityOperationCommitments` | `capabilityQuotes` |
| `capabilityOperationInvocations` | `capabilityCalls` |
| `capabilityOperationCallProjections` | `capabilityCallProjections` |
| `marketOperationCategories` | `marketToolCategories` |
| `marketOperationRatings` | `marketToolRatings` |
| `marketActiveOperations` | `marketActiveTools` |
| `marketActiveSuppliers` | `marketActiveProviders` |

The public surface mapping to check is `registry.operations.*` ->
`registry.tools.*`; `operation.inspect` -> `tool.quote`;
`operation.invoke` -> `tool.call`; `operation.list` -> `call.list`;
`operation.status/cancel/reconcile` -> `call.status/cancel/reconcile`;
`/api/v1/market-operations/*` -> `/api/v1/market-tools/*`;
`/api/v1/operations/inspect` -> `/api/v1/tools/quote`;
`/api/v1/operations/call` -> `/api/v1/tools/call`;
`GET /api/v1/operations` -> `GET /api/v1/calls`;
`/api/v1/operations/{invocationRef}` and its recovery suffixes ->
`/api/v1/calls/{callRef}` and the same suffixes; and
`operationRef`/`commitmentRef`/`invocationRef` ->
`toolRef`/`quoteRef`/`callRef`.

## Finite read-only evidence allowlist

The reviewer may read only these named planning records, source anchors and
the owned report/ticket. The source anchors are for coupling verification, not
permission to edit them:

- `docs/designs/vocabulary-rationalisation.md`
- `PRODUCT.md`
- `CONTEXT.md`
- `AGENTS.md`
- `.scratch/vocabulary-rationalisation/map.md`
- `.scratch/vocabulary-rationalisation/issues/02-agree-language.md`
- `.scratch/vocabulary-rationalisation/issues/03-current-footprint.md`
- `.scratch/vocabulary-rationalisation/issues/04-retained-data.md`
- `.scratch/vocabulary-rationalisation/issues/05-contract-cutover.md`
- `.scratch/vocabulary-rationalisation/issues/06-delivery-order.md`
- `.scratch/vocabulary-rationalisation/issues/07-acceptance.md`
- `.scratch/vocabulary-rationalisation/issues/08-execution-baseline.md`
- `.scratch/vocabulary-rationalisation/issues/09-consolidate-canonical-language.md`
- `.scratch/vocabulary-rationalisation/issues/37-prepare-implementation-issues.md`
- `convex/schema.ts`
- `convex/actionInvocationControl.ts`
- `convex/capabilityOperationCommitments.ts`
- `convex/capabilityOperationInvocations.ts`
- `convex/capabilityOperationCalls.ts`
- `convex/marketDispatchWorkpool.ts`
- `src/modules/actions/index.ts`
- `src/modules/module-boundaries.ts`
- `src/routes/api.$.ts`
- `src/routes/api.v1.registry.ts`
- `src/routes/api.v1.operations.ts`
- `src/routes/api.v1.operations.inspect.ts`
- `src/routes/api.v1.operations.call.ts`
- `src/routes/api.v1.operations.$invocationRef.ts`
- `src/routes/api.v1.operations.$invocationRef.cancel.ts`
- `src/routes/api.v1.operations.$invocationRef.reconcile.ts`
- `src/lib/server/operation-invoke-api.ts`
- `src/lib/server/mcp-api.ts`
- `src/lib/deployment/manifest.ts`
- `tests/imports/operation-surface-conformance.test.ts`
- `tests/imports/action-invocation-host-boundaries.test.ts`
- `tests/imports/capability-contract-boundaries.test.ts`
- `tests/imports/module-boundaries.test.ts`
- `tests/imports/deployment-manifest-boundaries.test.ts`
- `tests/unit/server/mcp-api-official-client.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `package.json`

The report output is the only additional owned path:
`.scratch/vocabulary-rationalisation/reports/29-engineering-review.md`.
The reviewer may cite the literal child-ticket paths listed in issue 37 after
they are materialized, but must not edit any child ticket other than this one
or the report.

## Review checks

Apply the existing engineering-plan review workflow and return concrete,
bounded findings for the issue owners:

1. Confirm that Customer/Agent do not replace generic IAM identities, accounts,
   businesses or credential records; Tool does not absorb portfolio Service,
   Offering, Publication, Listing or Source; Quote is not a Call; generic
   Action execution is not a paid Call; Spending policy and request
   authorization/Approval remain separate; Provider, Seller, payment recipient,
   Charge, Provider obligation, payable amount, payout, delivery and payment
   states remain separate.
2. Trace every listed table and public mapping to one implementation owner with
   validators, indexes, readers, writers, fixtures, codecs, events, queued
   arguments and generated-type coupling covered. Confirm shared source,
   schema, public-contract, generated-output and Git writers are serialized.
3. Confirm core implementation tickets 10–28 are blocked by baseline 08 and
   both independent reviews, while contract/storage dependencies are ordered
   and no dependency cycle exists. Issue 37 remains claimed/unresolved until
   its pending queue is complete; do not mark it resolved by association.
4. Check that HTTP method count, authentication and problem envelopes remain
   stable; external `operationId`, MCP methods, OAuth fields, x402 fields,
   opaque prefixes, canonical hashes, signatures and external financial
   namespaces remain byte-stable.
5. Check backup/restore proof, clean local seed, hosted-test maintenance window,
   callback/job isolation, in-flight Call accounting and rollback are gates
   before any destructive reset or hosted cutover. Confirm no production,
   mainnet, domain or new-Vercel scope has slipped in.
6. Admit structural extraction/relocation only where a renamed concept,
   competing definition or dependency makes it necessary; send cosmetic or
   architectural alternatives to the existing backlog. Confirm maintained
   SDKs, generators and test infrastructure are reused and no dependency or
   custom migration/tracking/checking framework is introduced.

## Explicit exclusions

- Do not edit application source, tests, generated output, package manifests,
  deployment state, `map.md`, the shared work record or
  `docs/designs/vocabulary-rationalisation.md`.
- Do not claim a source rename, generated-artifact pass, database backup,
  deployment, live acceptance or Package 6/7 completion.
- Do not change accepted terms, add legacy aliases/parallel APIs, merge
  purchase objects, rename protected protocol/identity/financial values or
  weaken an acceptance criterion.
- Do not run a broad implementation suite or mutate any environment; the
  coordinator baseline and later integration issue own those checks.

## Dependencies and sequencing

- Baseline issue 08 and canonical-document issue 09 are the dispatch blockers.
- This review and issue 30 must both resolve before core implementation issues
  10–28 can be dispatched as green work. Issue 31 is a separate Phase 0
  deployment preflight and may proceed from its own inventory inputs.
- The issue-preparation queue in issue 37 remains the source of truth for
  pending ticket coverage; this review does not close 37 or assume that an
  unmaterialized ticket is covered.

## Verification commands and expected results

- `git diff --check -- .scratch/vocabulary-rationalisation/issues/29-engineering-review.md .scratch/vocabulary-rationalisation/reports/29-engineering-review.md` — no whitespace errors.
- `find .scratch/vocabulary-rationalisation/issues -maxdepth 1 -type f -name '*.md' -print | sort` — the queue contains the literal child paths in issue 37 once preparation is complete; no combined tracker file is introduced.
- `git status --short -- .scratch/vocabulary-rationalisation/issues/29-engineering-review.md .scratch/vocabulary-rationalisation/reports/29-engineering-review.md` — only this ticket and its report are owned by the review worker.
- If a source check is needed, use the existing focused commands named by the
  owning issue; do not add a checker. The coordinator's baseline is
  `npm run typecheck` PASS and `npm run test:ts-standards` 26 pre-existing
  findings, which must remain separate from review findings.

## Acceptance

- [ ] The report evaluates all seven review areas above against the accepted
      plan and the materialized queue, with each consequential finding linked
      to its owning issue.
- [ ] Concept, permission, money, persistence, public-contract, generated
      output, deployment and rollback invariants are either evidenced or
      explicitly marked as a blocking gap.
- [ ] Shared writers and dependency order are shown to be acyclic; no core
      issue is described as independently green while its consumers remain on
      old contracts.
- [ ] Any structural change is justified by the necessity rule; optional
      cleanup is not admitted into acceptance.
- [ ] The report contains no source, shared-plan, deployment or tracker
      mutation and does not alter accepted vocabulary or Package 6/7 status.

## Closure evidence

Attach `.scratch/vocabulary-rationalisation/reports/29-engineering-review.md`,
the read-only evidence paths used, the dependency/ownership matrix, the list of
resolved findings and any remaining blockers. Keep the ticket open until the
report is complete and consequential findings are corrected by their owners.

## Review receipt

Report completed by Luna Max / refactor engineering-review subagent:
`.scratch/vocabulary-rationalisation/reports/29-engineering-review.md`.
The review found the accepted architecture conditionally feasible, with F1–F8
requiring existing-owner correction or evidence before the relevant gate:
MCP target-ID classification, protected canonical byte vectors, generic
execution versus paid Call field ownership, qualified AgentAccessPrincipal
IAM exclusion, omitted durable journals, external-registry exclusion,
provisional queue ownership, and hosted-only backup/restore readiness.

Issue 29 remains claimed/open. No source, plan, map, work record, generated
output, deployment state, backup archive or financial record was mutated. The
hosted reset findings do not block separately proven local source work or QA.
