# Review the vocabulary refactor for developer and installed-client usability

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Luna Max / refactor_dx_review
Assigned role: Luna Max / independent developer-experience review subagent
Parent: ../map.md
Blocked by: 08

## Outcome

Independently review the accepted vocabulary-rationalisation plan and its
public/developer-surface queue for a coherent installed-client experience.
Check that current source examples are not falsely presented as already
cut-over, and that HTTP, MCP, CLI, discovery, plugin and generated instructions
will agree after their owning tickets land. Record actionable findings in the
owned report. This is a review gate, not a source or documentation
implementation task.

## Fixed mappings under review

Do not choose new terms. Check the exact accepted vocabulary: Customer,
Agent, Tool, Tool version, Provider, Spending policy, Request authorization /
Approval, Quote, Call, Action execution, Suggested next action, Purchase
resolution / purchase status and Outcome records. Check the AE-owned authority
values `inspect_only` -> `read_only`, `approve_each` -> `approval_required`,
`bounded_mandate` -> `spending_policy`, `full_yolo` ->
`unrestricted_test_only`, `mandate_eligible` -> `policy_eligible`, and
`market_operations:invoke` -> `market_tools:call` with the corresponding
`customer_requests:` suffixes.

The public mapping is exact: `registry.operations.*` -> `registry.tools.*`;
`operation.inspect` -> `tool.quote`; `operation.invoke` -> `tool.call`;
`operation.list` -> `call.list`; `operation.status/cancel/reconcile` ->
`call.status/cancel/reconcile`; `/api/v1/market-operations/*` ->
`/api/v1/market-tools/*`; `/api/v1/operations/inspect` ->
`/api/v1/tools/quote`; `/api/v1/operations/call` -> `/api/v1/tools/call`;
`GET /api/v1/operations` -> `GET /api/v1/calls`;
`/api/v1/operations/{invocationRef}` and recovery suffixes ->
`/api/v1/calls/{callRef}` and the same suffixes; and
`operationRef`/`commitmentRef`/`invocationRef` ->
`toolRef`/`quoteRef`/`callRef`. `supplier_operations:v1` ->
`provider_tools:v1` is an AE-owned schema-label rename.

Retain MCP action-derived tool names, `/mcp` and MCP methods, upstream
OpenAPI `operationId`, OAuth fields, x402 fields, portfolio Service APIs and
market-request APIs. Retain generic IAM Principal/Account/Business/User/
Credential/DelegationGrant, Offering/Publication/Listing/Source,
`SuppliedQuote`, Provider/Seller/payment-recipient and
Charge/Provider-obligation/payable/payout/delivery/payment distinctions.
Opaque prefixes, hashes, signatures and external financial namespaces are not
copy changes.

## Finite read-only evidence allowlist

Read only these named planning records, public-surface anchors and the owned
report/ticket:

- `docs/designs/vocabulary-rationalisation.md`
- `PRODUCT.md`
- `CONTEXT.md`
- `AGENTS.md`
- `README.md` (read-only current-surface evidence; issue 27 owns edits)
- `.scratch/vocabulary-rationalisation/map.md`
- `.scratch/vocabulary-rationalisation/issues/02-agree-language.md`
- `.scratch/vocabulary-rationalisation/issues/05-contract-cutover.md`
- `.scratch/vocabulary-rationalisation/issues/08-execution-baseline.md`
- `.scratch/vocabulary-rationalisation/issues/09-consolidate-canonical-language.md`
- `.scratch/vocabulary-rationalisation/issues/37-prepare-implementation-issues.md`
- `package.json`
- `packages/cli/package.json`
- `packages/cli/README.md`
- `scripts/build-cli.mjs`
- `scripts/test-cli-package.mjs`
- `src/modules/actions/index.ts`
- `src/modules/discovery/internal/api-catalog.ts`
- `src/modules/discovery/internal/site-manifest.ts`
- `src/routes/[.]well-known/api-catalog.ts`
- `src/routes/SKILL[.]md.ts`
- `src/routes/api.discovery.examples.ts`
- `src/routes/api.discovery.schema.ts`
- `src/routes/mcp.ts`
- `src/routes/api.v1.registry.ts`
- `src/routes/api.v1.operations.ts`
- `src/routes/api.v1.operations.inspect.ts`
- `src/routes/api.v1.operations.call.ts`
- `src/routes/api.v1.operations.$invocationRef.ts`
- `src/lib/server/mcp-api.ts`
- `src/lib/server/operation-invoke-api.ts`
- `plugins/agentic-economy/skills/use-agentic-economy/SKILL.md`
- `tests/unit/discovery/cli-distribution.test.ts`
- `tests/unit/server/mcp-api-official-client.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/imports/operation-surface-conformance.test.ts`
- `tests/imports/private-imports.test.ts`

The only writable report path is
`.scratch/vocabulary-rationalisation/reports/30-developer-experience-review.md`;
the worker also owns this ticket's resolution text. Do not claim ownership of
the source, package, plugin or current-documentation paths above.

## Review checks

Use the existing developer-experience review workflow and return findings to
the owning issue without expanding acceptance:

1. Confirm CLI verbs remain as they are, `--supplier` becomes `--provider`
   without an old flag alias, and login, discovery, Quote, Call, status,
   cancellation, reconciliation and recovery help/results/errors use the same
   target terms as the HTTP contract.
2. Confirm generated catalogues, manifests, `SKILL.md`/machine instructions,
   plugin instructions, examples and copyable commands are sourced from the
   same current contract. Mark examples as current or approved-target based on
   source state; do not describe target routes as live before issue 19/22 land.
3. Confirm HTTP action IDs and reference parameters follow the exact mapping,
   MCP names remain derived from action IDs, methods/authentication/problem
   envelopes remain stable, and OAuth/MCP/OpenAPI/x402 standard values are
   preserved.
4. Confirm public instructions distinguish Tool discovery, Quote issuance,
   purchased Call lifecycle and generic Action execution; spending policy is
   not presented as a universal Call prerequisite where request authorization
   is the supported path; pending, failed, refunded and delivered outcomes are
   not conflated.
5. Check installed-client/package boundaries, module-boundary declarations,
   generated producers and their tests. Require existing build/test/generator
   paths; no new client hierarchy, compatibility framework, dependency or
   replacement protocol behavior.
6. Record accessibility text, empty/error states and copyable instructions as
   target-surface requirements for the owning UI/docs tickets, without a visual
   redesign or unrelated product gap.

## Explicit exclusions

- Do not edit source, CLI/package files, plugin manifests/instructions, current
  documentation, generated output, `map.md`, the shared work record or the
  selected plan.
- Do not implement a route, action, CLI flag, alias, generated artifact or UI
  copy; do not run deployment or data mutation.
- Do not retain old AE-owned product vocabulary as a compatibility surface or
  change external protocol names, protected IDs/hash material or Package 6/7
  requirements.
- Do not close on a screenshot or a passing build alone; current source,
  generated output, packaged consumers and live/deployed proof are separate
  facts owned by later issues.

## Dependencies and sequencing

- Baseline issue 08 and canonical-document issue 09 are dispatch blockers.
- This review and issue 29 must both resolve before core implementation issues
  10–28 are treated as ready to execute; public-surface issues 19–22 then
  follow their core owners and shared generators are serialized.
- Issue 37 remains claimed/unresolved while its explicit downstream queue is
  pending. This review may cite that queue but must not mark preparation or
  Package 6/7 complete.

## Verification commands and expected results

- `git diff --check -- .scratch/vocabulary-rationalisation/issues/30-developer-experience-review.md .scratch/vocabulary-rationalisation/reports/30-developer-experience-review.md` — no whitespace errors.
- `npm run test:cli-package` — pass when run after the owning CLI change; any
  pre-refactor baseline failure is recorded separately, not hidden.
- `npm run test:imports` — pass at the integration checkpoint for the owned
  module/public-boundary set; do not add a new checker or weaken assertions.
- `git status --short -- .scratch/vocabulary-rationalisation/issues/30-developer-experience-review.md .scratch/vocabulary-rationalisation/reports/30-developer-experience-review.md` — only this ticket and its report are review-owned.

## Acceptance

- [x] The report covers CLI/distribution, HTTP/MCP, discovery/catalogues,
      plugin/machine instructions, generated producers, package boundaries,
      current-vs-target examples and user-facing error/accessibility states.
- [x] Exact mappings, protected protocol values and command/flag constraints
      are checked without inventing terms or aliases.
- [x] Each consequential finding has one owning implementation/docs issue and
      the four dispatch tickets carry its finite correction, verification path
      and any explicit coordinator decision; implementation/live proof remains
      with later owners. Issues 19–22 and 27 now carry the DX-01 through DX-08
      corrections; the Node 20/22 matrix remains explicitly assigned to Joel/
      issue 22 and is unrun and unwaived.
- [x] No source, plan, map, deployment or data mutation is included; Package
      6/7 remain held.

## Closure evidence

Attach `.scratch/vocabulary-rationalisation/reports/30-developer-experience-review.md`,
the named evidence paths, a surface/consumer parity matrix, owner-linked
findings and the focused command receipts. The report records DX-01 through
DX-08, including the installed `describe`/`inspect` mismatch, exact current
MCP/action/path output, three error traces, the `/api/v1/registry` boundary,
the Node 20/22 verification decision and the non-weather x402 journey gate.
The Phase 0 assignment gate is resolved: each consequential finding is now
owned by a finite implementation/docs ticket. The Node 20/22 compatibility
choice remains explicitly open with Joel/issue 22 and must not be waived or
run by this review; post-cutover implementation and hosted/UI proof belong to
their owning issues.

## Comments

- 2026-09-05 — Claimed by Luna Max / refactor_dx_review for the bounded
  independent DX review. Issue 08 is resolved. Issue 09's canonical document
  is available; root's minor final-diff checks remain separate and are not a
  dispatch blocker under the coordinator's Phase 0 direction.
- 2026-09-05 — Initial review completed in the owned report. Findings were open
  for issues 19, 20, 21, 22 and 27. Issue 09's canonical document is available;
  root's minor final-diff checks remain separate and are not a dispatch blocker.
  No source, generated artifact, plan or external state was changed. The
  assignment gate was then pending finite ticket corrections and the
  coordinator's Node 20 compatibility-matrix decision; implementation/live
  proof was not required for this plan-review closure.
- 2026-09-05 — Re-review after the clean checkpoint and coordinator/queue
  corrections. DX-01 through DX-08 are now assigned with finite corrections:
  issue 20 owns the anonymous `describe`/mediated `call` CLI boundary and
  `--provider`; issue 19 owns the exact HTTP/MCP/action/ref/scope/error map,
  including the `supply.tools.list` inventory route; issue 21 owns derived
  discovery producers, the `tool-contract.ts` move and active release-tooling
  filename propagation; issue 22 owns serialized generation/package parity and
  the explicit Node 20/22 decision; issue 27 consumes the selected useful
  existing x402 fixture without a weather proxy. No unassigned consequential
  planning finding remains. Issue 30 is resolved as the Phase 0 assignment
  gate only; implementation, generated, hosted, UI and x402 runtime proof are
  not claimed.
