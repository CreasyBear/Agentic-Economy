# Mature vocabulary refactor — implementation plan

## Ownership and outcome

**Refactor owner: this task.** I own delivery of the complete refactor: issue
preparation, delegation, sequencing, integration oversight, verification and
closeout. Luna Max subagents own their assigned implementation, tests and fixes.
I monitor and manage their work rather than becoming the fallback implementation
worker.

Refactor Agentic Economy’s product language, source, contracts, database names,
tests, clients and documentation into one familiar vocabulary. Preserve
behaviour and the existing direction: a mature Australian platform informed by
Locus, Nevermined and Whop—not a new product model.

Track and execute the work through the existing Wayfinder issues. Ticket
preparation and dispatch happen in Phase 0.

### Dependency-ordered repair — latest Joel direction, 2026-09-06

Stop reactive batch dispatch. Consolidate remaining failures by root cause and
module into the single repair queue in the existing Wayfinder map. Existing
child issues retain their fixed mappings, file ownership and acceptance; do not
create another tracker or treat one missing export as an independent programme.

Only one repair group is active. Its bounded atomic tasks cover definitions,
exports, callers, validators and owned tests together. At most three Luna Max
workers may operate on genuinely independent tasks within that group; shared
files remain serialized. Finish and verify the group before advancing. Switch
only for an identified dependency recorded on the current issue, not because
another error is easier to fix. Workers have no naming or scope discretion.
Report the first compaction; stop at the second or when the count is unknown.

After each group, run its existing behavioral tests and the same integrated
compiler check. Record exact diagnostic counts, failing test cases separately,
the source checkpoint and generated-artifact state. A compiler diagnostic count
is not a count of independent bugs and is not a substitute for test acceptance.
Run other existing integrated checks when the group's boundary requires them;
record blocked or unrun checks explicitly. Regenerate affected artifacts with
their existing generators only; never hand-edit them to bypass analysis errors.

Close an existing issue when its complete stated acceptance is satisfied,
including caller/test propagation and relevant integrated proof. A passing
atomic patch or smaller diagnostic count does not close a broader issue. Report
completed boundaries and remaining blockers, not worker handoff activity.

Recovery, data rebuilding, deployments and hosted cutover remain parked. This
execution override changes ordering and verification, not vocabulary, product
direction, protected bytes or eventual release acceptance.

### Earlier bulk-rename direction — Joel, 2026-09-05

Complete the bulk vocabulary changes first, then verify and repair module by
module and package by package. Do not hold each naming family behind a complete
test, review, evidence or commit cycle. This supersedes the earlier sequential
per-issue implementation gates, not the fixed names, protected bytes, behaviour
or final acceptance requirements.

Use at most three disjoint Luna Max batches concurrently, taken from the
existing issues. The areas below are coverage boundaries, not open-ended
subagent assignments. Each dispatch names one outcome and a finite file list;
the coordinator checks the result before assigning the next batch.

1. Domain/backend: `src/modules/**` and non-generated `convex/**`.
2. Interfaces/clients/tooling: remaining non-generated `src/**`, `tools/**`,
   `scripts/**`, `eval/**`, package/discovery/plugin source and root command or
   configuration references affected by the rename. This lane alone owns
   `package.json` and later generator execution.
3. Tests/current documentation: `tests/**`, current documentation and active
   root product/contributor documents. Preserve dated evidence and research;
   exclude the selected plan, vocabulary tracker and coordinator work record.

Existing issues remain the mapping, coverage and later verification checklist.
The coordinator owns their tracking during this bulk pass; workers report one
concise handoff rather than repeatedly closing and reopening shared issues.
Within each assigned file list, propagate the fixed mappings. Return outside
callers to the coordinator for the next bounded batch rather than expanding
the assignment. Fresh workers are used for new batches: report the first
context compaction, hand off at the second, and never continue to a third. If
the count is unavailable, hand off rather than assuming spare capacity. The
coordinator stays active to manage progress, conflicts and integration. Ask only
for a genuinely ambiguous concept, protected format or necessary structural
change. Do not perform indiscriminate word replacement across opaque inputs,
upstream protocols, financial namespaces or historical evidence.

Finish the edits before broad checks. Local searches and syntax checks may
catch obvious mistakes; cross-lane intermediate compilation failures are
expected and do not block another lane. Once all lanes finish, generate affected
artifacts together, run an integrated compiler check, then fix and verify each
module/package through the existing issues. No failed check is waived or
represented as passing. No new runtime, compatibility or migration framework.

Recovery remains parked. One hosted cutover follows the completed source pass,
integrated testing and the existing release requirements.

### Earlier execution adjustment — Joel, 2026-09-05

Complete source changes and their relevant tests incrementally. Regenerate
Convex bindings only when affected; a source issue is not a deployment exercise.
Further recovery work is parked until release unless a specific source blocker
requires it. Preserve the completed data-only restoration evidence. Run
integrated testing, then perform one coordinated hosted cutover of the complete
change. This supersedes any per-issue instruction implying mandatory deployment,
operational preflight or unaffected generation; it does not waive release safety
or live acceptance.

### No handrolling

- Reuse maintained SDKs, protocols, components, existing module patterns and
  generators.
- Use existing Wayfinder tracking, test infrastructure and deployment
  procedures.
- Use supported Convex backup, deployment and seeding operations.
- Do not build a custom tracking system, migration engine, compatibility
  framework or replacement platform behaviour.
- Any unavoidable custom implementation requires a documented necessity and
  coordinator review before dispatch.
- New dependencies, services or material scope expansion require Joel’s
  approval.

## 1. Fixed scope and language

### Naming contract

| Existing concept | Target | Boundary |
|---|---|---|
| Business Principal | Customer | Purchasing person or organisation—not every identity or business row |
| Agent Principal | Agent | Authorised software actor—not its credential |
| Callable Operation | Tool | Canonical callable supply unit |
| Operation revision | Tool version | Preserve revision identifiers and versioning behaviour |
| Supplier | Provider | AE-owned terminology for the performing party |
| Standing Mandate | Spending policy | Reusable purchase permissions and limits |
| Request-specific mandate | Request authorization | Use Approval specifically for a person’s recorded authorization |
| Commitment | Quote | Preserve bound inputs, price, terms, permissions, expiry and retry conditions |
| Purchased Invocation | Call | One accepted tool use |
| Generic Action Invocation | Action execution | Administrative/runtime execution remains distinct from purchased Calls |
| Suggested continuation | Suggested next action | Preserve allowed actions and their conditions |
| Commercial closure | Purchase resolution / purchase status | Do not create another purchase object |
| Outcome evidence | Outcome records | Preserve attribution and uncertainty |

Apply corresponding casing and naming conventions to AE-owned types, fields,
files, functions, indexes, events and errors.

For filenames, use the area-specific [file naming rules](../../AGENTS.md#file-naming):
`kebab-case` for domain modules/utilities/standalone tests, `camelCase` for
Convex backend files, and `PascalCase` for AE-owned React components. Preserve
framework, generated and maintained-library exceptions. Vocabulary replacement
does not imply flattening these conventions into one style. Any style-only
filename correction needs an explicit bounded assignment with its callers;
this clarification does not expand existing worker allowlists or authorize a
separate folder-reorganisation programme.

Explicitly retain:

- Generic IAM `Principal`, Account, Business, User, Credential and
  DelegationGrant concepts.
- Distinct Offering, Publication, Listing, Source and Provider connection
  records.
- Existing portfolio Service records and APIs; they are not automatically
  callable Tools.
- Qualified `SuppliedQuote` concepts rather than merging them into customer
  Quotes.
- Provider, Seller and payment recipient distinctions.
- Charge, Provider obligation, payable amount, payout, delivery status and
  payment status distinctions.
- External protocol names, including upstream OpenAPI `operationId`, MCP
  methods, OAuth standard fields and x402 payment fields.

Opaque identifier prefixes, canonical hash-material formats, signatures and
external financial namespaces are protected exceptions. Renaming surrounding
fields does not authorize changing their bytes. This does not require legacy
client aliases.

### Bounded structural cleanup

Allow extraction or relocation only when necessary to:

- Separate concepts being renamed.
- Remove competing definitions that would otherwise drift.
- Repair dependencies preventing a safe refactor.

Each structural change gets its own Wayfinder issue, exact before/after
responsibility and behaviour-preserving tests. Keep structural and mechanical
changes separately reviewable.

No general architecture rewrite, cosmetic folder reorganisation, new
abstraction programme, dependency upgrades or unrelated cleanup. Optional
improvements go to the existing backlog and do not block completion.

### Cutover decisions

- There are no users requiring legacy client support.
- Update AE-owned clients and contracts together; do not retain parallel old
  APIs.
- Rebuild development/test data after verified backup rather than migrating
  historical test rows.
- Preserve old evidence and external financial history.
- Use a maintenance window for the hosted test cutover.
- No production/mainnet rollout, domain changes or new Vercel project is
  included.
- Package 6 closeout and Package 7 implementation remain held until their
  refactor dependencies are satisfied.

## 2. Phase 0 — establish issues, ownership and dispatch

### Establish the refactor execution baseline

**Owner:** Luna Max preparation subagent.

- Save this as the single selected plan under
  `docs/designs/vocabulary-rationalisation.md`.
- Reuse the existing vocabulary Wayfinder map and work record.
- Record the accepted decisions; supersede the rejected standalone-register
  proposal.
- Extend the map’s Notes to cover implementation and repeated issue
  pickup/closure.
- Capture branch, HEAD, dirty/untracked changes and existing test failures.
- Preserve the current implemented baseline, including relevant uncommitted
  work. Do not start from a clean checkout that silently omits it.
- Establish the `codex/vocabulary-rationalisation` working branch and a
  reliable boundary between pre-existing work and refactor changes.

**Close when:** the baseline is recoverable, ownership is explicit, and the
plan and tracking records agree.

### Create and assign implementation issues

**Owner:** Luna Max planning subagent; refactor owner controls assignments.

Create individual local-Markdown issues beneath the existing Wayfinder map for
the work below. Reuse existing decision issues instead of duplicating them.

Each issue must contain:

- One outcome and exact old-to-new mappings.
- A finite file allowlist covering definitions, affected callers and owned
  tests.
- Explicit exclusions and protected old-name occurrences.
- Named dependencies.
- Exact verification commands and expected results.
- Assigned subagent and closure evidence requirements.

Use the completed contract, storage and surface inventories. Confirm locations
against the execution baseline, including active untracked files. Include
scripts, plugin manifests, generated-output producers and module-boundary
declarations.

Do not split work into “rename the definition” and “let another worker discover
the broken callers.” Include known propagation work in the assignment.

Create separate structural issues only where the necessity rule is met.
Optional cleanup goes to the existing backlog.

**Close when:** every implementation area has an owned issue, shared-file
conflicts are sequenced, and workers do not have to choose names or migration
strategies.

### Review the execution plan

**Owners:** separate Luna Max engineering and developer-experience reviewers.

Use the existing engineering and developer-experience review workflows to
check:

- Concept boundaries and permission/money invariants.
- Ownership overlaps and dependency order.
- Public contracts and installed-client coverage.
- Database, generated-type and durable-payload coupling.
- Backup, fresh-seed, cutover and rollback feasibility.
- Whether structural changes exceed necessity.
- Whether existing maintained capabilities are being reused.

Return findings to the issue owner for correction. Reviewers cannot silently
redesign the product or expand acceptance.

**Close when:** consequential findings are resolved and the execution queue is
ready.

### Confirm test cutover and backup targets

**Owner:** Luna Max deployment-operations subagent.

Use the existing deployment registry and procedures to identify exact local and
hosted test targets, linked projects, callbacks, component queues and external
financial systems.

Record backup coverage and demonstrate restoration before any destructive
reset. Confirm how the clean test backend will be established through supported
Convex operations within the existing project structure.

Do not modify backup archives to simulate table renames. Do not create another
Vercel project.

**Close when:** exact targets, recovery evidence, callback isolation and
rollback steps are recorded. Missing access blocks cutover, not independent
source work.

## 3. Phases 1–3 — implement the refactor

### Phase 1: canonical language and core implementation

Run cross-cutting core renames sequentially where they share contracts or
callers. Each owner implements the assigned change, updates tests, fixes
introduced failures and supplies a reviewable patch.

| Issue | Implementation and closure criteria |
|---|---|
| **Consolidate canonical language** | Update CONTEXT, PRODUCT and current contributor instructions. Retire the glossary proposal as an active authority. Define Calls using the existing supported authorization paths, not a universal requirement for a standing policy. Preserve commercial direction and roadmap requirements. |
| **Rationalise customer and agent terminology** | Replace role-specific Business/Agent Principal names. Preserve generic IAM identities, accounts, business identities and legal-customer bindings. Verify sign-in, account selection, membership and credential ownership. |
| **Rename generic action execution** | Rename the `action-invocation` family, including controls, attempts, history, imports and architecture declarations. Preserve leasing, concurrency, cancellation, reconciliation and authority behaviour. |
| **Rename spending policies and request authorizations** | Rename standing-policy and request-authorization families separately. Update validators, persisted discriminators, action metadata, agent-access contracts and consumers. Preserve limits, expiry, revocation and approval requirements. |
| **Rename callable catalogue supply to Tools** | Update canonical types, references, registry contracts, search, comparisons, mappings and projections. Preserve Offering, Publication and portfolio Service models. Verify unchanged admission, discovery and eligibility. |
| **Rename Provider supply terminology** | Replace AE-owned Supplier names across setup, connection, admission, publication and offboarding. Preserve commercial roles and upstream vocabulary. Verify publish, withdraw, reconnect and offboarding transitions. |
| **Rename Commitments to Quotes** | Update contracts, actions, storage, codecs and callers. Preserve expiry, bound inputs, price ceilings, permissions and retry rules. Verify stale or changed terms still prevent execution. |
| **Rename purchased Invocations to Calls** | Update admission, dispatch, attempts, history, recovery, receipts and read models. Preserve effect identity, idempotency and uncertain outcomes. Verify recovery does not create another purchase. |
| **Rationalise next actions and purchase outcomes** | Update AE-owned next-action fields and presentation models without changing permitted transitions. Keep purchase, delivery and payment statuses separate. Terminal failure must not become success. |
| **Propagate names through money and durable records** | Update affected link fields, indexes, codecs, events, audit records, queued arguments and callers. Preserve amounts, identities, obligation attribution, signatures and canonical formats. Verify round trips and money-boundary behaviour. |

Authority modes change as follows:

- `inspect_only` → `read_only`
- `approve_each` → `approval_required`
- `bounded_mandate` → `spending_policy`
- `full_yolo` → `unrestricted_test_only`
- `mandate_eligible` → `policy_eligible`

Update AE-owned scope values consistently, including
`market_operations:invoke` → `market_tools:call` and corresponding
`customer_requests:` mode suffixes.

Preserve permission ordering and the existing production refusal of
unrestricted test access. Standard OAuth semantics remain unchanged.

### Physical database changes

The relevant core issue owns each rename together with validators, indexes,
readers, writers, fixtures and generated-type dependencies.

| Current table | Target table |
|---|---|
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

Do not merge tables or rename generic `principals`, `accounts`, `businesses`,
`operationKeys`, financial tables or Convex component internals merely because
their names appear in a search.

### Phase 2: public contracts and developer surfaces

| Issue | Implementation and closure criteria |
|---|---|
| **Cut over HTTP and MCP contracts** | Apply the fixed mappings below. Update router filenames, parameters, action bindings, server adapters and tests. One owner controls shared action registration. Preserve methods, endpoint count, authentication and problem envelopes. |
| **Update CLI consumers and distribution source** | Update requests, results, help, placeholders, errors, next actions and `--supplier` → `--provider`. Retain existing command verbs; no new hierarchy or old flag aliases. Verify login, discovery, calling, status and recovery. |
| **Update discovery and plugin instructions** | Update generated API catalogues, manifests, machine instructions, examples and existing plugin surfaces. Verify served outputs and copyable commands agree with implementation. |
| **Regenerate shared artifacts** | A dedicated integration subagent owns Convex generation, router generation, CLI builds and public packages. Use existing generators only. Verify packaged consumers correspond to current source. |

Public contract mapping:

| Existing | Replacement |
|---|---|
| `registry.operations.*` | `registry.tools.*` |
| `operation.inspect` | `tool.quote` |
| `operation.invoke` | `tool.call` |
| `operation.list` | `call.list` |
| `operation.status/cancel/reconcile` | `call.status/cancel/reconcile` |
| `/api/v1/market-operations/*` | `/api/v1/market-tools/*` |
| `/api/v1/operations/inspect` | `/api/v1/tools/quote` |
| `/api/v1/operations/call` | `/api/v1/tools/call` |
| `GET /api/v1/operations` | `GET /api/v1/calls` |
| `/api/v1/operations/{invocationRef}` and recovery suffixes | `/api/v1/calls/{callRef}` and the same suffixes |
| `operationRef`, `commitmentRef`, `invocationRef` | `toolRef`, `quoteRef`, `callRef` |

MCP tool names remain derived from action IDs. `/mcp`, MCP methods, portfolio
Service APIs and market-request APIs are not redesigned.

Rename AE-owned non-identity schema labels consistently; for example,
`supplier_operations:v1` becomes `provider_tools:v1`. Protected
identity/evidence formats remain explicit exceptions.

### Phase 3: product surfaces and current documentation

These issues may run concurrently when file ownership does not overlap.

| Issue | Implementation and closure criteria |
|---|---|
| **Update customer and agent screens** | Sign-in, onboarding, account selection, agent setup, permissions, settings and support use consistent terms. Include errors, empty states, accessibility text and copyable instructions. |
| **Update catalogue and Call screens** | Search, comparison, quote, Call history, result, chat and recovery screens agree with the API and distinguish pending, failed, refunded and delivered outcomes. |
| **Update Provider screens** | Setup, connections, publication, availability and offboarding use Provider/Tool terminology while preserving workflow steps and records. |
| **Update money and business-record screens** | Credit, top-ups, usage, charges, earnings, payouts and documents use familiar terms without conflating balances, permissions, delivery and payment. |
| **Reconcile current documentation** | Update README, current guides, runbooks and roadmap terminology. Preserve package scope, status evidence and acceptance criteria. |
| **Preserve and cross-reference history** | Retain dated research, whitepaper findings and release evidence. Add current mappings where needed rather than rewriting old results. Coordinate Package 6/7 edits with their owners. |

No visual interaction redesign is included unless required to display the same
behaviour clearly under the new terminology.

## 4. Phase 4 — integrate, verify and fix

### Verify source and contract completeness

**Owner:** independent Luna Max verification subagent.

Use existing searches, type checks, import checks, schema tests and parity
tests—not a new checking framework.

Verify:

- Planned renames are implemented through definitions and consumers.
- Remaining old names have exact documented reasons.
- HTTP routes, action IDs, MCP names, discovery outputs and packaged CLI agree.
- Renamed database fields and codecs round-trip correctly.
- Generated outputs are current.
- Protected identifier/hash vectors and external protocol values remain stable.
- Unrelated work was not lost or silently included.

Use Node 22/npm 11.5.1 throughout. Integrated checks include:

- `npm run typecheck`
- `npm run lint`
- `npm run check:convex-codegen`
- `npm run test:types`
- `npm run test:imports`
- `npm run test:conformance`
- `npm run test:release:architecture`
- `npm run gate:anatomy`
- `npm run test:cli-package`
- `npm run test:all`

Run focused existing tests during implementation and combined checks at
integration checkpoints. Treat the action audit as supporting evidence because
it is advisory.

Record baseline failures separately. Fix refactor regressions in their owning
issues. Do not weaken assertions, change acceptance or misrepresent advisory
output to obtain a pass.

### Rebuild and verify local test data

**Owner:** Luna Max database/integration subagent.

- Start from a clean local dataset through supported Convex operations.
- Update and run the existing seed.
- Verify references, fresh writes/reads and repeated seed behaviour.
- Verify renamed Call, Quote and policy data completes existing workflows.
- Ensure historical external payments, webhooks and queued work are not
  replayed.
- Verify financial records and storage references are internally consistent.

### Exercise the application and installed clients

**Owner:** Luna Max live-QA subagent.

Actually use the application and supported clients:

1. Sign in, select an account, connect an agent, grant permissions and
   replace/revoke credentials.
2. Discover a Tool, obtain a Quote, complete a useful x402 testnet Call and
   inspect its result and usage record.
3. Exercise blocked spending, expired Quotes, timeout, uncertain
   payment/delivery and supported recovery without duplicate charging.
4. Connect a Provider, publish a Tool, inspect availability, withdraw it and
   verify new Calls stop as before.
5. Inspect credit, charges, supported refunds, Provider earnings and business
   records.

Use the existing maturity references and Package 6 acceptance requirements.
Record build, environment, actions, observed results and limitations.

Refactor-caused papercuts return to their owning issues. Owners fix them and
rerun affected proof. Unrelated product gaps retain their existing issues or
receive bounded backlog entries.

## 5. Phase 5 — hosted test cutover and closeout

### Perform the coordinated hosted test cutover

**Owner:** Luna Max deployment-operations subagent.

After source verification and backup/restore proof:

1. Pause new test activity and account for pending Calls, callbacks and
   scheduled work.
2. Establish the clean test backend using the Phase 0 target and supported
   procedure.
3. Deploy the renamed schema, backend and matching clients through existing
   projects.
4. Reconnect test identities and seed fresh data.
5. Confirm old callbacks and queued work cannot operate against the fresh
   dataset.
6. Repeat live acceptance journeys against the deployed candidate.
7. Reopen test activity only after acceptance passes.

Rollback restores the matched previous application/backend configuration and
retained data. If new external financial effects occurred, stop and reconcile
them before rollback. Do not replay them or restore over them blindly.

### Close the refactor and resume package delivery

**Owner:** Luna Max closeout subagent; refactor owner accepts closure.

- Verify required implementation, review and live-acceptance issues are
  resolved.
- Inspect and commit only owned refactor changes, preserving unrelated work.
- Reconcile current documentation and final naming exceptions.
- Record local commit, deployed candidate and live verification separately.
- Remove task-created temporary artifacts while retaining deliberate backup and
  rollback records.
- Hand the new contracts and evidence to Package 6 and Package 7 owners.
- Resume their work without marking outstanding requirements complete by
  association.

### Execution rules throughout

- Implementation owners use **GPT-5.6 Luna, max reasoning**.
- At most three independent subagents run concurrently.
- Each subagent claims its Wayfinder issue before work and owns implementation,
  tests, fixes and the resolution record.
- Shared files, generated outputs and Git commits are serialized.
- I manage the queue, dependencies, ownership conflicts, reviews and evidence,
  and remain accountable for the overall outcome.
- Workers cannot choose new vocabulary, expand scope, introduce dependencies,
  handroll replacement behaviour or waive checks.
- Workers return concrete blockers; the coordinator resolves them before
  redispatch.
- A completed patch alone does not close an issue. Its stated acceptance must
  pass.
- Missing deployed proof remains open on the corresponding live issue.
- New structural work is admitted only when necessary for this refactor.
  Optional cleanup does not extend the programme.

**Done:** familiar vocabulary is consistent across the implemented platform,
database, clients and current documentation; existing behaviour works locally
and in the selected hosted test environment; history and external financial
records are preserved; and Package 6/7 can continue against one coherent
implementation.

## Execution review status — 2026-09-05

The accepted scope and acceptance above are unchanged. Review findings refine
the bounded assignments; they are not permission to redesign behaviour.

| Review | Record | Current result |
| --- | --- | --- |
| Engineering | [Issue 29 report (archived)](../workflow/work/WF-20260908-closeout.md#remaining-housekeeping--2026-09-08) | Planning gate resolved after exact field/format ownership, finite queue corrections and acyclic dependency recheck. Implementation/live proof remains downstream. |
| Developer experience | [Issue 30 report (archived)](../workflow/work/WF-20260908-closeout.md#remaining-housekeeping--2026-09-08) | Planning gate resolved; contract, installed-client and discovery findings have bounded owners and acceptance. Implementation/live proof remains downstream. |
| Operations | [Current preflight](../operations/vocabulary-cutover-preflight.md) | Read-only inventory complete; hosted financial reconciliation, current Convex backup/restore and isolation proof outstanding. |

Coordinator decisions applying the accepted boundaries:

- Retain qualified `AgentAccessPrincipal` / `agentAccessPrincipals` IAM
  access-binding names; those records are not the canonical Agent identity or
  its Credential. Role-specific fields outside that boundary still require
  the owning issue's explicit mapping. Protected hash fields remain unchanged.
- Map generic execution references separately from purchased Call references.
  Preserve exact canonical digest inputs and vectors, not merely valid-looking
  hashes. Any necessary small encoding adjustment belongs at the existing
  owning codec, with its necessity and tests reviewed before dispatch.
- Update MCP classification together with action IDs. Keep external registry
  and portfolio records distinct without exempting their Tool/Quote/Call links
  from required propagation.
- Preserve CLI behaviour: `describe` is anonymous catalogue detail; `call`
  already obtains the caller-specific Quote before the Call. Fix stale
  instructions using existing commands, not an alias or new workflow.
- Plan-review closure requires corrected, complete assignments and decisions.
  Actual code, generated-package and live proof remain in their later issues;
  requiring that proof before core dispatch would create a dependency cycle.
- Hosted financial/recovery blockers do not block independently safe source
  work or local proof. Local data operations still need their own exact target,
  backup and isolation checks. Existing unrelated operations debt does not
  expand this refactor.

**Cleared for core dispatch — 2026-09-05 10:10 UTC:** inventory 03, queue
preparation 37 and independent planning reviews 29/30 are resolved. Issue 10
has been dispatched to Luna Max as the first application-source owner. The
existing installed-CLI Node 20/22 test matrix still needs a decision against
the Node 22-only project rule; it has not been run or weakened and remains an
explicit later verification item. Source implementation, database cutover and
deployed refactor acceptance are not established by planning-review closure.
