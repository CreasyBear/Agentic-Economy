# Engineering review report — vocabulary rationalisation

Status: issues open; architecture conditionally feasible, dispatch not yet green
Ticket: Review the vocabulary refactor execution plan for engineering integrity
Reviewer: Luna Max / refactor engineering-review subagent
Reviewed at: 2026-09-05 (Australia/Perth)

This is an engineering-feasibility review of the accepted plan. It does not
change accepted vocabulary, select product alternatives, implement a rename,
approve a reset, or close issue 37. Existing Wayfinder Markdown is the only
review record; no JSONL tracker was added.

## Boundary and evidence quality

Read first and used as authorities: PRODUCT.md, AGENTS.md,
docs/designs/vocabulary-rationalisation.md,
docs/operations/vocabulary-cutover-preflight.md, the materialized map and
issues 02–09, 29–31 and 37. Source evidence was bounded to issue 29's
allowlist plus the exact shared schema/module anchors necessary to validate
accepted mappings.

Observed evidence is distinguished from inference. Issue 37 describes tickets
10–28 and 32–36, but those child files were absent during this review. Queue
completeness, finite allowlists and every per-file ownership edge are
provisional; this review does not rediscover the pending queue.

## Executive verdict

The accepted direction is implementable without a migration engine, alias API,
new dependency or structural architecture rewrite. The material risk is a
mechanical replacement crossing three identities:

    generic Action execution      -> executionRef / action-execution tables
    purchase Quote -> paid Call   -> quoteRef, then callRef / call tables
    IAM access binding             -> qualified AgentAccessPrincipal family

Before core dispatch, owners must make explicit and testable: protected
canonical bytes and reference encoders, the generic-versus-paid field map, the
qualified AgentAccessPrincipal exclusion, the target MCP action classifier,
all durable schema/index owners and the finite queue. Hosted reset has a
separate blocker: no Convex backup/restore demonstration and value-bearing
pending funding state. That hosted blocker must not hold back source work or
local QA after independently proven local backup/seed evidence.

## Required review matrix

| Area | Evidence | Finding / owner | State |
| --- | --- | --- | --- |
| Concept boundaries | Product chain; accepted map; src/modules/agent-access/agent-access.ts:30-38; capability-execution schema | AgentAccessPrincipal is IAM access binding, not canonical Agent; generic Action execution must not become paid Call; Quote, delivery and settlement remain separate. Issue 10 needs qualified exception; 11/16 need field map. | Correction required |
| Permission and money invariants | principal schema:8-30; convex/capabilityOperationCommitments.ts:461-480; capability-execution schema:287-455 | Authority, price, provider obligation, delivery and payment are distinct. Preserve snapshots and provider/payment namespaces. Owners 12,14,15,16,18. | Feasible if explicit |
| Ownership and dependency order | convex/schema.ts; src/modules/module-boundaries.ts; issue 37:24-72 | Schemas are re-exported module contracts; action, execution, supply, route and generated writers overlap. Missing child queue makes topological claim provisional. Owner 37. | Evidence gap |
| Durable/generated coupling | capability-execution schema:287-455,459-540; tests/unit/schema/convex-schema.test.ts:239-264; capabilityOperationCalls.ts | Physical table list omits sellerOnboardingCanaryRearmAudits and providerConsequenceJournal and indexes. Issue 18 must inventory them even if names stay. | Correction required |
| Public contracts/consumers | src/lib/server/mcp-api.ts:181-254; operation-invoke-api.ts:81-100,423-437,530-538,618-635; api.v1.operations routes | MCP telemetry still gates operation. and special-cases operation.reconcile; accepted IDs become tool./call.*. Old instruction and HTTP contract strings also remain. Owners 19/21/22. | Correction required |
| Backup/cutover/rollback | docs/operations/vocabulary-cutover-preflight.md; issue 31 receipt | Hosted target has value-bearing pending funding and no Convex restore proof. Read-only inventory is not restoration. Hosted-only blocker; local source/QA can proceed after local proof. Owners 31/33–35. | Hosted blocked |
| Structural necessity/capabilities | actions/index.ts; module-boundaries.ts; package.json | Reuse action/MCP derivation, Convex codegen, Workpool, SDK/package and tests. Relocate only for accepted concept ownership/competing meanings. | No rewrite needed |

## Findings requiring correction

### F1 — MCP event classification goes dark after accepted action-ID cutover (P1, verified)

Observed: src/lib/server/mcp-api.ts:181-194 returns no event unless
actionId.startsWith('operation.'); :227-238 maps terminal reconciliation only
when actionId === 'operation.reconcile'. Accepted IDs become
tool.quote/tool.call/call.list/call.status/call.cancel/call.reconcile.

Remedy: issue 19 owns target classifier and route contract; 22 owns generated
action consumers; 21 owns MCP instructions. Update classifier and target-ID
tests atomically, preserving internal invocationRef/operationRef until their
owned API boundary changes. No legacy alias branch. Use
tests/unit/server/mcp-api-operation-recovery.test.ts,
tests/unit/server/mcp-api-official-client.test.ts and action-registry tests.

### F2 — Protected canonical bytes need a fixed mapping receipt (P1, verified)

Observed protected material includes:

- src/modules/capability-execution/operation-invoke.ts:345-394,
  buildOperationInvokeAuthority and exact format operation-invoke-authority:v1;
- convex/capabilityOperationInvocationIdentity.ts:24-45,125-140,
  operationInvocationAttemptIdentityMaterial and validation;
- convex/capabilityOperationCommitments.ts:461-480, exact format
  ae.operation-commitment:v1 evidence;
- src/modules/capability-execution/current-operation-commitment.ts:15-49,
  currentOperationDigest, currentOperationDigestFromSnapshot and
  currentOperationCommitmentsMatch;
- src/modules/action-invocation/durable.ts:43 and
  tests/unit/action-invocation/durable-action-invocation-cancel.test.ts:131-136,
  exact cancel digest material;
- src/modules/agent-access/issued-agent-binding.ts:25-46,
  issued-agent-principal:v2 and related IDs; agent-audit.ts:75-100, where
  agentPrincipalRef is digest input.

These are not presentation strings. Only an explicit existing encode/decode
boundary may rename surrounding API/storage fields. Canonical field names,
ordering, format literals, opaque prefixes, hash inputs and issued IDs remain
exact bytes. No generic compatibility framework.

Remedy: issues 15/16/18 must name preserved formats, encoders/decoders and
before/after literal digest vectors in owning tests. Keep existing vectors,
prove corrupt snapshots fail closed, and do not change these bytes. This is a
source/storage gate independent of hosted reset.

### F3 — Generic Action execution and paid Call references must not merge (P1, verified)

Observed: action-invocation/internal/convex-schema.ts stores generic controls,
attempts and history by invocationRef and authority evidence. Separately,
capability-execution/internal/convex-schema.ts:287-455 stores Call projections
and Calls; Call projection has callRef plus operationRef, provider, delivery,
payment and provider-obligation state. capabilityOperationCalls.ts rebuilds
Call projections from paid invocation rows.

Remedy: issue 11 maps generic invocationRef to executionRef only where it means
generic execution. Issues 16/18 map purchased fields to callRef/quoteRef only
at the paid lifecycle boundary. Assign every reader, writer, validator, index,
queue payload, recovery record and fixture to one side. Preserve operationRef
inside protected/paid/history material until its authorized Tool boundary.

### F4 — AgentAccessPrincipal is qualified IAM, not canonical Agent (P1, verified)

Observed: agent-access.ts:30-38 defines AgentAccessPrincipal as
{principalId, ownerId, credentialId, applicationRef, environment, scopes,
authorityMode}. principal-convex-schema.ts:8-30 defines agentAccessPrincipals
indexed by principalId, credentialId and owner, with scopes, authority mode,
grant generation, policy digest and lifecycle. It is an access binding, not
generic IAM principal, canonical Agent aggregate or credential.

Remedy: issue 10 must retain qualified AgentAccessPrincipal /
agentAccessPrincipals as protected IAM exception and provide a per-field map.
Rename only canonical Agent concepts. Preserve agentPrincipalRef in
agent-audit.ts:75-100 and issued-agent-principal:v2 material. Coordinator
decision is required before issue 10 dispatch; this review does not select a
new term.

### F5 — Operation-bearing durable table map is incomplete (P1, verified)

Observed: capability-execution/internal/convex-schema.ts:459-501 defines
sellerOnboardingCanaryRearmAudits with invocationRef; :505-540 defines
providerConsequenceJournal with invocationRef, operationRef, attemptRef and
provider/authority/payment pointers. tests/unit/schema/convex-schema.test.ts:
75-84,251-264 expects both tables/indexes. They are absent from issue 29's
twelve-table mapping while issue 18 covers durable propagation.

Remedy: issue 18 assigns these tables, indexes, readers, writers, queue
arguments and fixtures. If names remain as audit/journal concepts, record the
exclusion while reviewing their operation/call/execution fields. Preserve
seller, provider, payment and authority meanings.

### F6 — External registry must remain distinct from canonical market Tools (P1, verified)

Observed: src/routes/api.v1.registry.ts:36-46,87-106 serves /api/v1/registry,
queries marketExternalRegistry:search and returns schemaVersion api-registry:v1.
Product and plan say external metadata is not canonical market and becomes an
Operation only after admission/publication.

Remedy: issues 13/19/21/22 finite allowlists explicitly exclude this route,
marketExternalRegistry, registrySearchDocuments and portfolio
Service/Offering/Publication/Listing/Source. Only AE-owned
registry.operations.* actions move to registry.tools.*. Add route/registry
boundary assertions; no alternate API.

### F7 — Queue ownership/dependency evidence is provisional (P1, provisional)

Observed: issue 37:24-72 names 10–28 and 32–36 and requires finite allowlists
and serialized writers, but only 01–09,29–31,37 existed. Missing child files
prevent overlap/topology verification.

Remedy: issue 37 materializes finite Markdown tickets and runs
path-overlap/topological checks. Serialize source/schema/public-contract/
generated writers; no worker claims an independent green half while consumers
use old contracts. This is a bounded queue gap, not rediscovery.

### F8 — Hosted reset/cutover is blocked by deployment evidence, not source feasibility (P1, verified)

Observed: docs/operations/vocabulary-cutover-preflight.md records 20 pending
funding rows (18 externally/provider referenced), no fresh supported Convex
backup/restore demonstration and callback/job isolation follow-up. RDS drill is
not Convex reset proof and missed RPO by 8 seconds. Issue 31 receipt says its
read-only inventory did not perform restoration.

Remedy: hosted destructive reset/cutover waits for authorized native
backup/restore demonstration, pending-funding reconciliation and callback/
workpool isolation. Local source/QA may proceed with separate local
backup/clean-seed evidence. Owners 31 and 33–35. No deploy/reset/Vercel or
financial mutation in this review.

## Permission and money invariants

Existing durable shapes must remain unchanged in meaning:

- agentAccessPrincipals stores scopes, authority mode, grant generation and
  policy digest; it is not funding or purchase.
- Quote rows carry principal/account/credential/application, operation revision/
  material/current digest, input/pricing, policy/evidence, budget and financial
  snapshots; they are not Calls.
- Call projections at capability-execution schema:287-326 have separate
  deliveryState, paymentState and optional providerObligationState; these do not
  collapse into purchase resolution.
- Receipt unions retain separate charge/payment/provider settlement namespaces,
  including seller-canary variants. Seller, Provider and payment recipient stay
  distinct.

No invariant change is proposed; field maps and tests are required to prove the
rename preserves them.

## Ownership/dependency matrix (provisional until issue 37)

| Boundary | Owner | Order / evidence |
| --- | --- | --- |
| Customer/Agent/IAM exception | 10 | after 09/29/30; agent access/audit/issued-binding tests |
| Generic Action execution | 11 | before shared callers; action schema/control and import boundaries |
| Policy/authorization | 12 | before paid admission; authority tests |
| Tool/supply/provider | 13/14 | before discovery; supply/registry/action tests |
| Quote codecs/storage | 15 | before Call; commitment/current-digest tests |
| Paid Call lifecycle/recovery | 16 | after Quote; invocation/call/worker tests |
| Outcomes/records | 17 | after Call; history/recovery/terminal tests |
| Money/durable propagation | 18 | serialized after 11/14/15/16; schema/index/financial tests |
| HTTP/MCP | 19 | after source fields/IDs; route/MCP/conformance tests |
| CLI/discovery/generated consumers | 20/21/22 | after 19 and central action registry |
| Integrated QA/cutover | 32–36 | after source/contracts; hosted only after 31 |

convex/schema.ts composes module-owned table maps. src/modules/actions/index.ts
centrally derives MCP names and route descriptors; update once and consume it.
convex/marketDispatchWorkpool.ts is existing durable infrastructure; preserve
retry, parallelism and queued argument semantics.

## Test diagram and failure modes

    canonical format/ref bytes
              |
              v
    Quote admission -> Call admission -> Workpool/Provider effect
          |                 |                    |
          v                 v                    v
    policy/price       delivery/payment     reconciliation/closure
          \________________|____________________/
                           v
                 HTTP + MCP projections
                           |
                           v
              action registry / CLI / discovery

| Failure mode | Risk | Proof owner |
| --- | --- | --- |
| Protected material renamed | Existing authority/quote/cancel no longer validates; effect may duplicate/refuse | 15/16/18 vectors and fail-closed tests |
| Generic field treated as Call | Wrong row/index; generic action appears purchased | 11/16/18 fixtures and durable tests |
| MCP classifier left on operation. | Telemetry disappears or reconcile reports completed | 19/21/22 MCP tests |
| Registry broad-replaced | External registry merges with market discovery | 13/19/21 boundary tests |
| Schema/index omitted | Codegen/rebuild/list fails or history disappears | 18/22 schema/codegen tests |
| HTTP contract drifts | 404/405/auth/problem behavior changes | 19/20 route/conformance tests |
| Queue overlap | Producer/consumer compile against different names | 37 overlap/topology receipt |
| Hosted reset without proof | Funding/provider effects or callbacks lost/replayed | 31/33–35 backup/rollback receipt |

Existing vectors: tests/unit/capability-execution/current-operation-commitment.test.ts;
tests/unit/convex/capability-operation-invocation-identity.test.ts;
tests/unit/action-invocation/durable-action-invocation-cancel.test.ts;
tests/unit/schema/convex-schema.test.ts;
tests/unit/server/mcp-api-official-client.test.ts;
tests/unit/server/mcp-api-operation-recovery.test.ts;
tests/unit/market-terminal/cold-loop.test.ts;
tests/unit/market-terminal/recovery.test.ts;
tests/unit/server/operation-recovery-api.test.ts; and import boundary tests
module-boundaries, operation-surface-conformance and deployment-manifest.
Current baseline remains separate: typecheck and unit pass; 26 standards
findings pre-exist. No broad implementation suite was run.

## Performance and structural review

A vocabulary rename has no inherent performance change. Preserve Call projection
pagination and bounded usage reads in convex/capabilityOperationCalls.ts and
Workpool retry/parallelism. Recreated indexes must be exercised by existing
rebuild/pagination tests; add no unbounded scan or second projection layer.

No extraction is necessary for prettier names. Relocate only when accepted
concept ownership or competing meanings require it (generic Action execution
versus paid Call is such a boundary). Reuse Convex codegen, action registry,
SDK/package build and test harness. No aliases, compatibility framework,
migration engine, new dependency, custom tracker or replacement deployment.

## NOT in scope

- Product/commercial decisions; mappings are fixed.
- IAM Principal/Account/Business/User/Credential/DelegationGrant,
  AgentAccessPrincipal, Seller, payment recipient, Provider, protocol/x402,
  financial namespaces or opaque prefixes.
- Portfolio Service/Offering/Publication/Listing/Source or external registry
  redesign.
- Historical data migration or rewriting issued evidence; clean test rebuild
  follows restore proof.
- Production/mainnet/domain/new-Vercel deployment, package resumption or live
  acceptance.
- Fixing 26 pre-existing standards findings.

## What already exists

Central action/MCP derivation, route contracts, Convex schema composition and
codegen, Workpool workers, canonical digest/validation, projection rebuild/read
paths, CLI/package scripts, boundary tests, route/MCP/recovery fixtures and
deployment preflight/rollback procedures. This is coordination and exact field
ownership, not greenfield infrastructure.

## TODO questions for existing owners

1. Issue 10: record qualified AgentAccessPrincipal exception and canonical Agent
   fields before dispatch.
2. Issues 11/16/18: publish executionRef versus quoteRef/callRef map and all
   shared writers, queues and indexes.
3. Issues 15/16/18: attach literal protected-byte/digest vectors and explicit
   encode/decode boundaries.
4. Issues 19/21/22: update MCP classifier, instructions, generated descriptors
   and method/auth/problem parity tests.
5. Issues 13/19/21/22: add external registry/portfolio exceptions to allowlists.
6. Issues 31/33–35: separate local backup/seed from hosted reset proof and
   reconcile value-bearing pending funding.
7. Issue 37: materialize pending queue and run overlap/topology checks.

## Parallelization

Parallel work is safe only across disjoint finite allowlists. Canonical docs and
independent reviews can proceed together. Serialize shared schema, action
registry, routes, generated output and durable-field writers; then consume with
HTTP/MCP, CLI/discovery, integrated verification and QA. Hosted cutover remains
separately gated by issue 31 and must not block local source work.

## Completion summary

- Architecture: conditionally feasible; no structural rewrite required.
- Concepts: accepted mappings preserved; AgentAccessPrincipal and generic Action
  execution need qualified/field-level boundaries.
- Authority/security: existing gates coherent; protected digest bytes must stay.
- Money: Quote, Call, Charge, provider obligation, delivery and payment remain
  distinct; durable journals need issue 18 ownership.
- Public contracts: MCP classifier and old operation strings are concrete gaps.
- Data/cutover: hosted reset blocked; local work can be independently proven.
- Queue: incomplete/provisional until issue 37 materializes tickets.
- Recommendation: keep issue 29 claimed/open with F1–F8 assigned to existing
  owners; do not waive checks or expand scope.

## Closure receipt

Owned report complete. Issue 29 remains claimed/open pending corrections and
queue recheck. No source, plan, map, work record, generated artifact,
deployment state, backup archive or financial record was mutated.

