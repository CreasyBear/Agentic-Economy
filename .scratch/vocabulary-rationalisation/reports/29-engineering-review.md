# Engineering review report — vocabulary rationalisation

Status: review complete; queue ready for source dispatch (implementation/live proof downstream)
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
docs/operations/vocabulary-cutover-preflight.md, the materialized map, all
issue tickets 02–37 and the post-checkpoint planner receipts. Source evidence
was bounded to issue 29's allowlist plus the exact shared schema/module anchors
necessary to validate accepted mappings.

Observed evidence is distinguished from inference. All issue files 01–37 are
now materialized. The post-checkpoint header dependency read found no cycles,
and the bounded follow-up recheck below confirms that F9–F15 have exact owner,
path and staged-gate receipts. The review does not claim any implementation or
live proof from those planning receipts.

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
| Ownership and dependency order | convex/schema.ts; src/modules/module-boundaries.ts; issues 13/14/16/21/22/24/37 | Schemas are re-exported module contracts; action, execution, supply, route and generated writers overlap. The materialized header graph is acyclic, and the post-predecessor paths, release tooling, web-route receipts and staged generator semantics have bounded owner receipts. | Rechecked queue-ready |
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

### F7 — Materialized queue and bounded ownership/path receipt (P1, rechecked resolved)

The child queue is materialized: issues 09–36 are present and the
post-checkpoint `Blocked by:` graph has zero cycles. The earlier finite
allowlist conflicts are corrected in the owning tickets: issue 13 now consumes
post-11 Action-execution paths, issue 14 uses the post-13 supply path, issue 16
is a Tool-path consumer, issue 24 uses the exact post-core routes and tests,
issue 21 alone owns active release filename moves, and issue 22 alone writes
the root manifest. Issue 03 records the finite disposition and issue 37 records
the staged generator-gate interpretation.

Resolution: the Node 22 read-only header check found 37 issue files, no missing
blockers and no dependency cycles. The detailed F9–F15 recheck below is the
planning dispatch receipt; it does not claim source implementation or live
proof.

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

### F9 — Issue 13's Action-execution importer list is stale after issue 11 (P1, verified)

Issue 11 moves `src/modules/action-invocation/canonical-claim.ts`,
`contracts.ts`, `operation-public.ts`, `reconciliation-evidence.ts` and
`x402-payment-attempt.ts` to `src/modules/action-execution/`, with
`operation-public.ts` specifically becoming `execution-public.ts`
(`issues/11-rename-generic-action-execution.md:79-116`). Issue 13 nevertheless
lists the old five paths as direct importers of `capability-supply/public.ts`
(`issues/13-rename-callable-catalogue-to-tools.md:166-196`) and retains
`tests/unit/action-invocation/operation-public.test.ts` in its test allowlist
(`.../13-rename-callable-catalogue-to-tools.md:275-280`). Since issue 13 is
blocked by issue 11, those paths are not the files its worker will receive.

Remedy: replace the issue 13 importer/test entries with the post-11 paths,
including `src/modules/action-execution/execution-public.ts` and
`tests/unit/action-execution/execution-public.test.ts`. Keep generic
`executionRef`/Action-execution ownership with issue 11 and do not broaden the
Tool pass into the excluded action-execution directory.

### F10 — Issue 14 has a pre-13 path in its post-13 supply allowlist (P1, verified)

Issue 13's exact Convex move is
`convex/capabilitySupplyOperationPorts.ts` →
`convex/capabilitySupplyToolPorts.ts`
(`issues/13-rename-callable-catalogue-to-tools.md:425-434`). Issue 14 says its
allowlist is post-13 (`issues/14-rename-provider-supply-terminology.md:42-46`)
but still lists `convex/capabilitySupplyOperationPorts.ts` as the editable path,
with the Tool path only in parentheses (`.../14-rename-provider-supply-terminology.md:126-152`).

Remedy: make `convex/capabilitySupplyToolPorts.ts` the literal editable path;
retain the old name only as lineage. The Provider follow-through remains after
issue 13 and must not ask its worker to rediscover a moved file.

### F11 — Issue 16 repeats issue 13's Tool path moves as an owned rename (P1, verified)

Issue 13 owns the exact moves for `operation-action-contracts.ts`,
`operation-choice-contracts.ts`, `operation-detail-route.functions.ts`,
`operations.actions.ts`, `operation-entry.ts`, `operation-ref.ts`,
`market-operation-paths.ts` and `operation-paths.ts`
(`issues/13-rename-callable-catalogue-to-tools.md:73-80`). Issue 16's purported
complete worker mapping repeats those same old→new moves
(`issues/16-rename-purchased-invocations-to-calls.md:55-108`) even though it is
strictly blocked by issue 13. Its later consumer list does not clearly mark
the paths as Call-field-only (`.../16-rename-purchased-invocations-to-calls.md:238-250`).

Remedy: leave issue 13 as the sole filename/path owner. In issue 16, list only
the post-13 target files as a serialized Call-field consumer slice (and keep
issue 19's action-ID/route ownership); remove the duplicate old→new rename
mapping from issue 16's complete worker allowlist.

### F12 — Issue 24 still blocks on a web-route decision already made (P1, verified)

Issue 13 now fixes the Tool web moves to
`src/routes/tools.$toolRef.tsx`/`src/routes/tools.tsx` and explicitly forbids an
old alias or Calls index (`issues/13-rename-callable-catalogue-to-tools.md:640-655`).
Issue 16 similarly fixes the Call receipt route to
`src/routes/calls.$callRef.tsx` (`issues/16-rename-purchased-invocations-to-calls.md:429-441`).
Issue 24 still lists the old `operations.$operationRef.tsx` and
`operations.invocations.$invocationRef.tsx` as its route anchors and says not to
edit `src/routes/operations.tsx` until a coordinator resolves the handoff
(`issues/24-update-catalogue-and-call-screens.md:52-69,183-190`).

Remedy: issue 24 must consume a post-core path receipt, update its allowlist and
focused tests to the exact Tool/Call targets, and replace the obsolete route
uncertainty with the no-alias/no-new-index rule already recorded by issues 13/16.
It remains a presentation owner; it must not make a second route decision.

### F13 — Issue 37's dependency audit must exempt the staged issue 22 checkpoint (P1, verified)

Issue 22 deliberately permits an early serialized generator checkpoint before
issues 10–21 close, while reserving final issue-22 acceptance for those source
receipts (`issues/22-regenerate-shared-artifacts.md:12-14,110-119`). Issue 37's
required dependency/topology check currently says every core issue 10–28 must
carry its preceding contract/data dependencies (`issues/37-prepare-implementation-issues.md:102-108`)
without stating this issue-22 staged exception. A literal checker could either
reject the approved checkpoint or force 22 to depend on 10–21, defeating the
checkpoint and risking a cycle.

Remedy: issue 37's audit receipt must state that issue 22 has two gates: its
header blockers permit the early non-deploying checkpoint, while its final
acceptance consumes 10–21. Verify that staged interpretation without adding
10–21 header edges. The existing approved target and no-deploy procedure remain
unchanged.

### F14 — Residual filename/symbol ownership from issue 03 remains a dispatch gap (P1, verified)

Issue 03 still records concrete source/test families with no final filename or
exported-symbol owner: the market/operation-detail and operation-chat files,
their tests, the x402 invocation-policy family, and the CLI
`tools/ae/commands/invoke.ts` (`issues/03-current-footprint.md:193-248`). The
new issue-13 receipt now maps the operation icons and read helpers, but issue 24
and issue 20 still do not give every remaining family an exact move/symbol map
or an explicit protected-exception classification.

Remedy: issue 37/planner must assign each listed filename/symbol family to one
owner with a literal target or an explicit protected/generic rationale before
dispatch. Preserve protocol and generic exceptions; do not turn this into a
directory-wide replacement or a display-copy-only assignment.

### F15 — Release tooling and package command ownership is cross-ticket (P1, verified)

The coordinator's new issue-21 map makes it the mechanical owner of the active
`tools/release/operation-gateway-production-smoke*` moves and the two
`package.json` producer paths (`issues/21-update-discovery-and-plugin-instructions.md:208-237`).
Issue 13 still includes three of those release files and the release test
harness in its mechanical allowlist (`issues/13-rename-callable-catalogue-to-tools.md:326-344`),
and issue 16 includes the invocation smoke file (`issues/16-rename-purchased-invocations-to-calls.md:468-480`).
Separately, issues 13, 15 and 16 all list `package.json` as an editable shared
path (`issues/13-rename-callable-catalogue-to-tools.md:137-142`,
`issues/15-rename-commitments-to-quotes.md:60-64`,
`issues/16-rename-purchased-invocations-to-calls.md:170-174`), while issue 22
declares it read-only (`issues/22-regenerate-shared-artifacts.md:57-68`).

Remedy: issue 21 must be the sole filename/import owner for the release-tooling
move. If issues 13/16 need Tool/Call field updates there, mark them as
serialized field-only producer slices before issue 21's move. Partition root
`package.json` by exact script keys (or assign one owner), reconcile issue 22's
read-only wording, and record the order. Do not add scripts, dependencies or a
second release command.

## F9–F15 bounded recheck — resolved for planning dispatch

After the all-dirty checkpoint `645a348421479510432db4bdc630ed306acd18d8`, the
owning ticket corrections were reread against the original findings. These are
planning receipts only; they do not claim source implementation, generated
output, local/hosted reset, live QA or hosted cutover.

- **F9 — resolved.** Issue 13's direct Action-execution consumers are now the
  post-11 `src/modules/action-execution/*` paths, including
  `execution-public.ts`, and its focused test is
  `tests/unit/action-execution/execution-public.test.ts`
  (`issues/13-rename-callable-catalogue-to-tools.md:194-203,285`). The generic
  `executionRef` boundary remains with issue 11.
- **F10 — resolved.** Issue 14's editable supply path is
  `convex/capabilitySupplyToolPorts.ts`; the old Operation path is lineage only
  (`issues/14-rename-provider-supply-terminology.md:140-141`).
- **F11 — resolved.** Issue 16 now lists post-13 `tool-*` paths as
  Call-field consumers and explicitly leaves filename ownership with issue 13
  and public action/route ownership with issue 19
  (`issues/16-rename-purchased-invocations-to-calls.md:99-115`).
- **F12 — resolved.** Issue 24 consumes `tools.$toolRef.tsx` and
  `calls.$callRef.tsx`; its focused command now uses
  `tool-detail-route.test.tsx`, `call-status-route.test.tsx`,
  `chat-routes.test.tsx`, `chat-header.test.tsx` and
  `chat-ui/chat-presence.test.tsx`, with no second route decision
  (`issues/24-update-catalogue-and-call-screens.md:235-252,482-487`).
- **F13 — resolved.** Issue 37 records that issue 22's header may use the
  approved early non-deploying checkpoint without adding all 10–21 header
  edges, while final issue-22 acceptance consumes the completed source
  contracts (`issues/37-prepare-implementation-issues.md:220-227`). The Node 22
  read-only header check found 37 issue files, no missing blockers and no
  dependency cycles.
- **F14 — resolved.** Issue 03's finite disposition assigns the remaining
  operation-detail/chat, helper, x402-policy and CLI families to issues 13,
  16, 20 and 24 with literal targets or retained generic/protocol rationale
  (`issues/03-current-footprint.md:300-416`). The CLI Call map is explicit in
  issue 20 (`issues/20-update-cli-consumers-and-distribution.md:184-232`), the
  x402 policy map in issue 16
  (`issues/16-rename-purchased-invocations-to-calls.md:503-581`), and the
  catalogue/chat map in issue 24 (`issues/24-update-catalogue-and-call-screens.md:396-500`).
- **F15 — resolved.** Issue 21 alone owns active release-tooling filename and
  import moves; issues 13/16 are field-only producer slices
  (`issues/21-update-discovery-and-plugin-instructions.md:197-250`,
  `issues/13-rename-callable-catalogue-to-tools.md:700-702`,
  `issues/16-rename-purchased-invocations-to-calls.md:640-647`). Issue 22 is
  the sole root `package.json` writer with the exact command-key table and
  early checkpoints before source acceptance
  (`issues/22-regenerate-shared-artifacts.md:65-96`).

The F9–F15 planning blockers are therefore closed. Issue 29 may close as the
implementation-dispatch review gate; later source acceptance, generated-output
checks, backup/restore, local data, live QA and hosted cutover remain with their
own issues, including live-proof owners 32, 34 and 35.

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

## Ownership/dependency matrix (confirmed for dispatch; implementation evidence pending)

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
7. F9–F15 planning corrections: resolved by the issue 03/37 finite disposition
   and the owning issue receipts above. Preserve the later source, generated,
   backup/restore, local-data, live-QA and hosted-cutover gates.

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
- Queue: all child tickets are materialized, the header graph is acyclic, and
  F9–F15 have been rechecked against exact owner/path receipts.
- Recommendation: close issue 29 as the implementation-dispatch planning gate;
  retain F1–F8's existing owner gates and all later implementation/live-proof
  issues. Do not waive checks or expand scope.

## Closure receipt

Owned report updated after the clean all-dirty checkpoint
`645a348421479510432db4bdc630ed306acd18d8`. The bounded F9–F15 recheck found
37 issue files, no missing blockers and no dependency cycles; exact path,
filename, package-writer and staged-generator ownership is recorded above. No
application source, generated artifact, deployment state, backup archive or
financial record was mutated by this review. Issue 29 is closed as the planning
dispatch gate; issue 37 remains its own claimed preparation record, and later
implementation/live proof remains open under the owning issues.
