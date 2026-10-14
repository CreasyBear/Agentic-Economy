# Deployment map

**Last verified:** 14 October 2026, for the scoped production treasury/app readbacks below.
The payment audience change was verified on 12 October. This is a dated inventory;
resolve current provider identities and source revisions before mutations.
[TODOS.md](../../TODOS.md) owns work; [readiness](../production-readiness-plan.md)
owns acceptance and its limits.

## Destinations and authority


| Purpose | Address | Provider identity | Authority |
| --- | --- | --- | --- |
| Marketing | <https://aecon.ai> | Vercel `agentic-economy-website`; separate repository | Public website |
| Production app | <https://app.aecon.ai> | Vercel `agentic-economy`, project `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`; Convex `upbeat-cricket-954` (`aws-ap-southeast-2`) | Explicit production declaration; payments open to everyone, revision 3 |
| Isolated staging | <https://staging.aecon.ai> | Same Vercel project, `staging` environment; Convex `courteous-finch-213` | Development declaration, sandbox payments; staging inventory last verified 2 October |
| Production ledger | <https://formance-alpha.aecon.ai> | Formance Ledger 2.4.14, ledger `agentic-economy-production`, existing AWS `ae-alpha` footprint | Production financial authority |
| Production identity | <https://clerk.aecon.ai> | Existing Clerk production instance | Signed identity, owner MFA and revocation checks |

Production and staging are separate environments within one Vercel project. A
branch Preview is not a separate application project. The existing AWS topology
is one private host and Multi-AZ RDS with independent backups; no second permanent
stack is approved. Resolve provider identities afresh before mutations.

## Current production release

### Treasury recovery candidate and live baseline, 14 October

The treasury archive was restored into `codex/treasury-recovery-20261014` and
its implementation ported onto current main. Production has not changed for
this resumption. Native Convex readback confirms the `production` declaration
and source binding `9a80df0d48db0768bae411a458a24227bc1eb157` on
`upbeat-cricket-954`; the public web release reports the same revision.
Official Vercel inspection resolves `app.aecon.ai` to production deployment
`dpl_FNzHh9BtpNxfQ399kcfgfWXzvNub` in project `agentic-economy`.

The 07:52 AWST public sample returned health/readiness 200 and payments ready.
The latest native treasury snapshot had matched cash, settlements, funding and
reservations, 28 audited payments and no in-flight Calls. Recent resolved
reconciliation-unavailable/stale episodes establish recurring interruption, not
its precise provider cause. `sellable` remains false and the catalogue was stale;
these bounded treasury checks do not qualify full commercial availability.

The [candidate design](../designs/treasury-readiness-reliability.md) records typed
receipt failures, shared absolute deadlines, retained contradiction priority and
safe readiness recovery. It adds one per-environment coordination table/index,
three internal coordination mutations and one internal recovery action, with
90-second leases and at most two claimed attempts per five-minute window.
Evidence publication, completion and follow-up scheduling share a transaction.
Existing financial tables require no migration/backfill. Twelve confirmations,
two required providers, current authority/custody/configuration and original
observation clocks remain mandatory.

Fresh checks, full gate and independent review belong to the exact candidate
and its release review. Deployment, release-binding changes, merge and web
promotion await Joel's concrete approval. No AWS change, credential rotation,
financial replay, authority expansion, provider quota upgrade or historical
settlement-proof reuse is proposed. The 250-read historical audit limit remains.

Current web recovery reference is `dpl_FNzHh9BtpNxfQ399kcfgfWXzvNub`, and current
backend source is `9a80df0d48db0768bae411a458a24227bc1eb157`. New coordination rows
and queued callbacks must survive a compatible code recovery; code rollback is
not permission to restore or clear a database or ledger. Prefer a reviewed
fix-forward if preserving those runtime contracts requires it.

### Directory indexes and aggregate reconciliation, 13 October

Joel approved both operations from
`d0a26e63f98fae756a82fcbfbeb1f46b7106c63f`. Native Convex 1.45.0 deployed that
source to Sydney production `upbeat-cricket-954` at 22:39 AWST. It reported exactly
the eight reviewed index deletions: five directory search indexes, two external
entry indexes and the unused external-entry full-text index. A subsequent native
dry run found no remaining index differences or component mount changes.
The aggregate update preserves missing-member and recency repair while skipping
healthy unchanged memberships. The [reviewed change](../designs/directory-io-reduction-2026-10-13.md)
records the contract, exact indexes and shared chat-contract carryover.

After deployment, the nonsecret `AE_RELEASE_SOURCE_REVISION` binding was updated
and read back as that exact source; the `production` declaration was preserved.
The web release remains `6fce9ae10b9e93297531fa1d0d03d1268c1d4cbb`. This was a
backend release, with no web deployment or source merge.

Ten native directory queries returned the same ordered samples and generation
before and after deployment: adoption, popular and price order globally, by
category and by Provider, plus keyword search. Public health and registry reads
returned 200. Native Aecon MCP search and directory-reference Describe returned
current metadata; no Quote, paid Call or live chat-model test was performed.

The first post-deploy readiness sample returned 503. A later read at 22:47 AWST
returned 200 with payments ready and paid Calls open, without a recovery mutation.
The cause of the transient failure was not established. At 22:47 commercial quoting
reported unavailable and `sellable: false`; the successful checks do not establish
complete commercial availability or sustained readiness. The pre-deploy HTTP
baseline did not retain commercial fields, so quoting's prior state and cause
remain unverified. The paid-Calls policy switch and quoting availability are
separate signals; their combination does not itself violate an admission rule.
The final read at 23:03 AWST returned health and readiness 200, with quoting
ready again and paid Calls open. `sellable` remained false. The backend revision
still matched the approved source. No broader commercial acceptance is claimed.

The candidate passed `npm run check` and the full `npm run gate`, including
10,081 unit tests, 3,313 integration tests, 20 browser journeys, 20 accessibility
cases, CLI and docs checks. Existing skips and runtime limits remain recorded in
the reviewed change. Billed I/O/storage savings await native observation after a
normal refresh; no refresh, backfill or cleanup was forced.

Rollback/fix-forward source is
`6fce9ae10b9e93297531fa1d0d03d1268c1d4cbb`; restoring the deleted indexes requires
a rebuild and consumes I/O. Code rollback does not authorize a database or ledger
restore. Treasury and retained-proofs work remain deferred.

### MCP admission and native-client recovery, 12 October

Codex desktop logs at 15:29 and 15:37 UTC record native startup HTTP 429
(`rate_limited`), then a closed initialized-notification channel. A fresh
installed Codex `0.162.0-alpha.17.2` app-server subsequently discovered all 29
authenticated tools against production in 7.46 seconds, with no tool error.
This establishes native handshake and paginated discovery, not native purchase
execution. The active chat's older tool catalogue still had no Aecon connection.

The MCP route now separates anonymous discovery (30/minute per trusted IP) from
credential verification (120/minute per trusted IP, before Clerk). Only verified
credentials also enter `public-read`; invalid credentials remain anonymous.
Rotating unverified headers cannot create a new quota. Spending policy, principal
resolution, Call idempotency and financial admission remain separate boundaries.
The verification bound permits more credential checks than the old anonymous
guard while preserving a finite per-IP ceiling. No credential cache is introduced.

Admission failures return correlated 429 or retryable 503 responses with
`Retry-After`; an uncertain admission debit is never retried automatically.
Real-component regression coverage exhausts anonymous capacity, connects two
official clients concurrently through initialization and every metadata page,
exhausts verification with rotating junk credentials, then checks recovery after
refill and continued authentication refusal. Existing official-client Call
recovery tests now exercise route admission, including the stable original Call.

Local Codex startup timeout for this server was raised from the default 10 to
30 seconds; other connection fields and credentials were preserved. If native
startup fails, honour `Retry-After` and restart the MCP connection in the host.
Verify native discovery and recover the original Call before another purchase.
A custom HTTP/JSON-RPC client is not evidence that the requested native harness
integration works. Do not silently substitute one for a failed native connection.

### Production payment audience and delivered Call, 12 October

At 15:57 UTC on 12 October, Joel authorized opening production payments to all
customers and completed owner MFA in `/admin/treasury`. The existing audited
audience command changed `paymentsOpenTo` and `resumePaymentsOpenTo` from `admins`
to `everyone`, revision 2 to 3; native readback records `updatedAt=1791820646972`.
The UI shows **Paid calls on**. `/api/ready` returned 200 with payment checks
`ready` and `paidCalls: open`. Its aggregate `sellable` field remained false;
this control change alone does not establish every commercial journey.

The production alias resolves to Vercel `dpl_DBTAyJfRj4dymrv84uGk2rftKuWJ`,
`syd1`, Node 22, source `0c1d64a10d365827ece8ed0348ebb17757e6b539`.
The Sydney backend's release binding reports the same revision. No application
deployment, credential rotation, custody-cap change or financial-data restore
was performed. The existing admitted readiness refresh passed current RPC,
CDP, Formance, reference-rate, treasury and commercial-policy checks; sanctions
remain deliberately deferred under `alpha_not_screened_v1`.

Rollback for the audience change is the existing **Turn off paid calls** control,
restoring `admins` with a new audited revision. Payment admission still requires
current readiness, funding and Account/Agent authority. Retain accepted Calls
and recover their exact references; an audience rollback does not reverse money.

The authorized Colosseum website audit completed through Aecon's MCP endpoint at
16:00:02 UTC. Call `operation-invocation:v1:8c9c84228d53ccaf4479cea8aa7e4b7d895ee047c3a474db0b0a89b3b7954e96`
delivered output and a settled receipt: A$0.114872 from promotional credit,
USDC 0.08 Provider settlement, transaction
`0x19aa8dad3cb155b5fd4bad89192e22df8aa1725a4212af33527bb64e142f57d9`.
The Provider fetched the signup page, not authenticated hackathon content.
The transport was a Python JSON-RPC MCP client using the configured credential;
Codex's native MCP tool integration was not exercised and remains unverified.

The overlapping 15:59 treasury audit refused `treasury_sources_changed_during_audit`.
The next normal 16:04 cycle matched cash, funding, reservations and settlements
with zero differences, zero committed funds and zero signing liability. Its
USDC 0.08 timing adjustment accounts for the finalized-chain observation lag.
After current source checks passed, the existing admitted readiness refresh
restored backend `ready` and public `/api/ready` 200 at 16:05 UTC. This is bounded
post-payment recovery evidence; the five-minute schedules can briefly gate
new purchases when an audit overlaps a payment. No evidence or gate was bypassed.

### 9 October Sydney release snapshot

At 03:38 UTC on 9 October, production moved to Sydney through
[PR #376](https://github.com/CreasyBear/Agentic-Economy/pull/376). The subsequent
[PR #378](https://github.com/CreasyBear/Agentic-Economy/pull/378) deploys bounded
request work, treasury retries and telemetry lifetime. At 06:34 UTC, both web
and backend report source `d3c9061f4297a5d56e2f84379c20cdf86572f56a`, merged as
`40789ec3e91ec83e6afcb5239a2f57439d245ded` with the same runtime tree.

| Surface | Current identity |
| --- | --- |
| Web | `app.aecon.ai`, Vercel `dpl_2qcjc45uo7dZP3u8P1GrfiJ2fs28`, `syd1`, Node 22; `/api/v1/release` reports `d3c9061f4297a5d56e2f84379c20cdf86572f56a` |
| Backend | `upbeat-cricket-954`, permanent/default production, `aws-ap-southeast-2`; cloud `https://upbeat-cricket-954.ap-southeast-2.convex.cloud`, site `https://upbeat-cricket-954.ap-southeast-2.convex.site` |
| Retained backend | `cautious-zebra-473`, nondefault and paused, reference `production-virginia-retained-2026-10-09`; never run both against shared financial providers |
| Browser recovery lineage | `VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL=https://cautious-zebra-473.convex.cloud`; preserve this namespace on subsequent releases |

Health is live; web configuration and Convex readiness pass. Payment readiness
remains blocked. These releases do not requalify earlier paid or signed-in
journeys. The [cutover receipt](#final-cutover-and-live-verification) retains the
migration evidence; [follow-through verification](#follow-through-release-and-live-verification)
records current evidence and the fix-forward boundary.

## Historical accepted application releases

The following acceptance evidence is dated 6 October 2026.

| Surface | Verified source / identity |
| --- | --- |
| Production web | `/api/v1/release` reports `1cfe08489f3f3d3dfc36d2a37619c509e4924034` after PR #367 |
| Production Convex | `cautious-zebra-473`; deployed PR #367 candidate `04f2d41901ec143a88b07f67925c657695a9af31`, identical tree to merged source `1cfe08489f3f3d3dfc36d2a37619c509e4924034`; release revision read back after deployment |
| Chat/MCP acceptance baseline | PR #359 runtime tree `bf8e246d28121e3753ade6dad12421f6ab10d2b1`; web `81124766527c30f0cf3b6ee941a9ad7f2088e163` and Vercel `dpl_3xt4Wjed5sfTMg8gASAVTJE2xUS4` |
| CLI distribution | Hosted and npm 0.3.1 archives verified byte-for-byte after PR #363, including installed CLI smoke. PR #364 prepares 0.3.2 with optional product feedback; its release PR records deployment and registry readback. |
| Plan ledger | Additive v1.7.0 installed/read back at 03:55:24 UTC; digest `sha256:c47ed17051aecfc2b0ad86bbeabc385d841a04774667098528ed5ffb1ff740a4` |

[PR #367](https://github.com/CreasyBear/Agentic-Economy/pull/367) retains price
and purchase restrictions across chat follow-ups. Fresh production follow-ups
confirmed unknown terms stay unknown and an external listing cannot be quoted.
Its full gate passed before deployment. Rollback is PR #366 web
`dpl_74cZ5bj8Za5pHjK8UHZsfxYRhXy8` and backend revision
`31a06382c0644dfd0c66a794edf221fcbe606596`. No financial rollback is implied.

[PR #366](https://github.com/CreasyBear/Agentic-Economy/pull/366) restores the
native Convex Agent loop for guest and signed-in chat. The exact runtime tree
passed `npm run check` and `npm run gate`: 9,249 unit and 3,078 integration tests,
18 browser journeys, 18 accessibility cases, SEO checks, CLI packaging and public
build. Existing skips and todos remain outside this proof. The
[production chat record](../production-readiness-plan.md#native-chat-production-check-6-october)
separates verified interaction behavior from retrieval quality and paid execution.
Rollback references are prior web `dpl_EgeSP1hCL9eQPt6twSiTZueJ9BiD` and backend
release `1ec6e59596af63d8e055a5bacecec2360c40df4e`. No ledger or database restore is
part of an application rollback.

[PR #362](https://github.com/CreasyBear/Agentic-Economy/pull/362) adds bounded
buyer-side Plans. Backend, web and full gate share tree
`5425af4304077d960bc61c14ee92c709d3d94f82`. The production two-node acceptance
completed with both Calls settled, unused credit released, zero Hold balances
and same-key replay across CLI/MCP/HTTP. The [readiness record](../production-readiness-plan.md#two-node-plan-acceptance-6-october)
separates this proof from native approval/partial/uncertainty tests.

Recovery retains prior web `dpl_JeYPMLKhndnnB6GaxKVxw9SbF5L4` and main source
`453b6f60d8f16c8cf2a555c43a56b75fb86bf62c`. After these paid Calls, preserve the
additive schema and financial records; any financial correction is fix-forward.
The operator's retained recovery bundle is `plan-quotes-362` dated 6 October.

[PR #359](https://github.com/CreasyBear/Agentic-Economy/pull/359) is the final
chat walkthrough release, following [#357](https://github.com/CreasyBear/Agentic-Economy/pull/357)
and [#358](https://github.com/CreasyBear/Agentic-Economy/pull/358). Guest and signed-in
search, detail, recovery and immediate comparison work through the existing
market. Chat offers recommendations or useful refinement without pagination.
The [chat contract](../designs/chat-market-entry.md) preserves its boundaries.

MCP server 2.3.0 accepts protocol 2026-07-28 and the verified legacy client.
OAuth advertises/emits the canonical authorization-response issuer. The CLI
package and download have scoped acceptance. [PR #360](https://github.com/CreasyBear/Agentic-Economy/pull/360)
configures the `@agentic-economy/cli` npm scope; registry readback confirms 0.2.1
and its public tarball. The [CLI guide](../../packages/cli/README.md) owns installation.
The EVM receipt-ordering repair has regression proof, but no new paid runtime
measurement establishes faster Calls.

The PR #359 runtime release passed `npm run check` and `npm run gate`: 9,071 unit and
3,039 integration cases, clean types/import boundaries, 31 SEO proofs, 18 browser
journeys, 18 accessibility cases, CLI packaging and the public build. Existing
skips/todos do not supply proof. Documentation-only changes after this snapshot
may advance Git or the web revision without changing the accepted runtime tree;
check `/api/v1/release` and the release PR for current provenance.

## Commercial and operating limits

Production payments are open to `everyone`, observed launch-control revision 3
on 12 October after Joel's explicit authorization and owner MFA.
`alpha_not_screened_v1` deliberately means payees are not screened. Recorded
custody ceilings are USDC 0.5 per Call, USDC 10 platform daily, USDC 2 per payee
daily and USDC 0.5 on first payee use; read active policy before any effect.
Funding does not expand authority.

The [readiness record](../production-readiness-plan.md) separates 20 paid mainnet
results and scoped recovery from fixtures, availability limits and outstanding
paid development chat. Historical durations are approximately 71–132 seconds
through recovery. Public API reads can also vary; they are a different measure.

[Metering operations](usage-metering.md) retain explicit holds: no historical
backfill has run, automatic monthly scheduling is inactive and external metering
is disconnected. The [founder console](../designs/founder-console.md) distinguishes
funded activity from promotional or unclassified usage. Datadog remains a
[proposal](../adr/0005-datadog-supported-operational-observability.md).

## Release and recovery routine

Use Node 22 / npm 11.5.1 locally; retain Vercel's approved npm 11.19.1 install
override. Run `npm run check`, affected tests and `npm run gate` on the frozen
candidate. Never push directly to main. Deploy Convex separately when backend
contracts change, using the verified target and exact source; merge through the
reviewed PR, then verify the web alias and release revision. Read health,
readiness and the relevant signed-in journeys separately.

Preserve previous source and provider deployment references. Financial correction
is append-only; fix forward after value-bearing transactions. Never restore a
database or ledger merely to roll back application code. GitHub source workflows
were manually disabled at this snapshot; Vercel build success alone is insufficient.
[Infrastructure](../../infra/package4/README.md) and [recovery procedures](../../infra/package4/recovery-drill/README.md)
retain the operational commands and evidence requirements.

## Compatibility and docs release policy

**Policy added 7 October 2026; no new deployment or client acceptance.** Preserve
the dated inventory above. A working web alias or a docs-only Git revision does
not establish that the web, backend, generated schema, instructions and installed
client are compatible. [MM-055](mercator-maturity-register.md#mm-055) owns docs
acceptance; [the operating contract](../designs/agent-operating-contract.md#cross-transport-contract-policy)
owns transport semantics and [publication boundaries](../designs/agent-operating-contract.md#documentation-architecture-and-publication-boundary).

Record one compatibility tuple in the existing release/readiness receipt, with
environment and observation time:

| Tuple member | Required identity/evidence |
| --- | --- |
| Web | Exact `/api/v1/release` source revision, canonical alias and provider deployment reference. |
| Backend | Convex deployment identity and exact independently deployed source revision. |
| Schema | Manifest/schema and action contract versions plus generated artifact digest from the named source. |
| Docs | Authored source revision and generated reference digest; renderer/build version only if adopted. |
| Installed client | Released CLI/plugin package version and artifact digest; harness/MCP protocol version with the actual installed-client journey receipt. |

Missing tuple members remain unknown. State which pairings and journeys were
tested, the supported client range, breaking changes and migration/recovery
instructions. Do not infer compatibility from equal version strings, source
tests, a registry listing or a historical acceptance receipt. Keep prior exact
pairings available for supported recovery; a rollback must preserve backend and
financial compatibility. Versioned instructions must not recommend a new paid
Call to recover an uncertain old one.

The earlier isolated Fumadocs OpenAPI trial failed complete recursive-response
and example qualification. The subsequent local candidate uses official Fumadocs
TanStack Start/MDX with Scalar-generated linked Markdown instead. Its collection
contains 224 approved pages: eleven guides/concepts, an operation index, 59 rendered
operations, nine exact OpenAPI fallbacks and 144 models. The complete Call/seven-model
reference retains its original qualification; wider rendering uses bounded static
checks and reader review. The raw owner OpenAPI and canonical skill remain unchanged
copies of their current owners. Exact versions, tradeoffs and commands are
in the [operating contract](../designs/agent-operating-contract.md#current-implementation-fumadocs-with-scalar-markdown).

This execution has not changed the dated deployed tuple above. Local candidate
identity is HEAD `3da6013d` plus the source/dirty/lock/contract digests emitted to
`packages/docs/public/docs-provenance.json`; web/backend and published-client
acceptance for contract `1.0.0-alpha.1` are still unknown. The existing release gate
now includes `docs:build`; its separate pinned docs install is a prerequisite.
Local HTML, Markdown, search, copy/theme and private-route readbacks do not supply
a new hosted release or public safe-sandbox acceptance. [MM-055](mercator-maturity-register.md#7-october-pre-stability-execution)
records exact current checks and blockers.

<a id="http-response-profile-migration"></a>

### Public contract compatibility

The 7 October pre-stability candidate uses one canonical owner-validated output
per operation across HTTP, MCP and CLI. No external consumers depend on this candidate at the time of review. The unshipped `agent-v1`/legacy split was removed; no response-profile
header, fallback projection or profile-specific cache variation is supported.
Earlier profile proposals are superseded, not evidence of a deployed migration.

`/api/v1` identifies the API major line. OpenAPI `info.version` identifies the
public contract revision. The current source candidate is `1.0.0-alpha.2`;
`1.0.0-alpha.1` identifies the earlier docs candidate. Neither inherits the
application package version. A contract
revision covers inputs, defaults, outcomes, continuation, recovery and disclosure
semantics. Neither value alone establishes compatibility with a hosted backend or
an installed client. A supported release pairs exact web and backend revisions, the contract/schema
digest, the docs revision and the installed client/protocol version with observed
journey evidence. Missing members remain unqualified.

Before external onboarding, qualify the web/backend/contract/docs/client tuple
and publish its supported and experimental capabilities. During alpha, a breaking
change requires a reviewed contract revision, explicit before/after examples,
affected consumers, a client rebuild and coordinated release evidence. Once any
external consumer depends on the contract, record a compatibility period and
migration/deprecation procedure before removal. Changes to defaults or outcome
meaning count as contract changes even when JSON still validates.

All releases must preserve the ability of authorised callers to read and recover
accepted purchases: opaque references, signatures, original request identities,
financial records and historical meaning survive the revision. Response loss
uses the original request and purchase identity. It never authorises another paid
purchase merely to obtain a new-shaped response. This candidate introduces no
historical-data migration and has not been deployed or published by this work.

#### Source migration to alpha.2

Rebuild internal clients with this source candidate. No external consumer depends
on the earlier candidate, so this change has no public migration window. Hosting
and installed-client qualification remain separate from the source checks.

| Earlier candidate | Alpha.2 contract | Caller change |
| --- | --- | --- |
| Quote continuation repeats `method`, `path` and `input` | `action` names the registered operation; `args` carries its known arguments | Resolve transport details from the generated reference and send `args`. Keep the returned Quote and original key. |
| Search aliases such as `describe` or `next-page` | Registered operation names with retained query, source, filters, limit and cursor | Follow the exact returned arguments. Per-candidate external detail remains an inspection link. |
| Quote echoes `normalizedInput` and returns UI-shaped `requiredActions` | Execution retains the input; output contains price, authority evidence and an optional `ownerHandoff` | Keep your submitted input. Read the handoff actor, reason and destination. |
| Some funding replies say `poll`, `continue` or `create_new` | Pending replies name `funding.handoff.status` with the session ID and timing; a payer handoff is separate | Observe the same session. A new funding intent requires its own key. Ready funding does not authorise a purchase. |
| Procurement presents display totals as net/GST and refund amounts | `money.kind: recorded` contains exact Quote price and Call usage/receipt; older caches report `historical_display_only` | Read recorded evidence. Do not calculate tax, net price or refunds from rounded display text. |
| Invalid price filters may be ignored; unknown prices may pass a ceiling | Invalid supplied filters are refused, and a hard ceiling requires a known comparable upper bound | Correct invalid arguments; omit a ceiling only when your task permits unbounded discovery. |
| CLI persistence covers ordinary Calls | Plan runs and exact procurement also retain a local recovery record before submission | Use `ae plan resume` or `ae procure resume` with the returned reference. Preserve the journal across upgrade and disconnect. |

Current-source public validators reject the old output shapes. Historical chat
and procurement readers accept their known stored forms only for readback.
They do not rewrite signed cursors, purchase references, original financial
evidence or request identities. The CLI still reads version-1 Call journals.
Plan and procurement records use version 2 in the same protected directory.

A missing procurement Quote checkpoint means preparation is unresolved. The
original inspection may still be running or may have stopped after disclosure.
Keep the original material, key and request ID. Retry only unchanged material;
if uncertainty persists, request support investigation. A new key or automatic
re-Quote is not recovery. Delivery, payment and financial resolution remain
separate facts even when a result contains useful output.

## Historical inventories

The [prior deployment map](../archive/2026-10-05/operations/deployments.md) retains
earlier releases and observations. The [archive index](../archive/README.md)
locates older inventories and local recovery context. Retained checkouts and
retired projects are not additional approved deployments.

## 7 October source consolidation

Joel authorised integrating the alpha.2 API/docs candidate with the trial branch,
prepared Datadog design and Arc work. The candidate retains current main’s native
chat and purchase restrictions from PRs #366/#367. Trial source from PR #368 uses
the existing Admin command, promotional-credit and payment-admission owners;
its additive backend schema must precede a matching web deployment. Arc source
`2fef56dab1c0d3e9de9f0690b9ec612b06012184` is already contained in current main.
The Datadog ADR is the existing prepared design with repaired repository links,
not evidence of configured monitors or received telemetry.

Combined source qualification and merge identity will be recorded in the
consolidation PR. No production invitation, grant, telemetry activation, paid
Call or deployment is part of this source merge. Preserve the separate hosted
acceptance gates and the whitepaper/strategy drafts.

For this source-only consolidation, `vercel.json` disables automatic Git
deployments from `main` and `codex/chat-runtime-repair-2026-10-06`. Other branches
retain their existing behaviour. This prevents web from moving ahead of the
additive trial backend. The coordinated release must verify backend compatibility
and then remove these two entries before resuming automatic web releases. This
uses [Vercel’s branch deployment setting](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled); it does not stop the current hosted release.

## Platform UI candidate — 7 October

Source baseline: `84abbda0bd892b7f9688e53d84001e970ba32ab1` plus the reviewed
working candidate. This is source preparation, not a hosted release. The existing
production/staging and accepted-release records above remain historical evidence.

The matching release must include the new authenticated admin command-receipt
read, workspace terminal-receipt read, explicit current-session scope on
`operatorContext.readCurrent`, Team lifecycle operations, and Provider inventory
query/projection changes before the corresponding web UI. These reuse the
existing authorization, audit, command and identity owners. Exact purchase
references, financial history, request keys and authorized recovery are unchanged.
Table is pinned to 9.2.6; Router and Start retain their prior pinned versions.

The public market recut also extends `x402DirectoryIndex:facets` with optional
`providerPrefix`. Deploy this backend reader before the matching web Host page
and picker. It uses the existing `by_generation_and_kind_and_key` index and
eligible-listing counts. No schema migration or backfill is required for this
reader. Prefix cursors bind the prefix and active generation, including bounded
split-page cursors. An expired page offers a first-page restart. No hosted release
of this market change has been performed.

Provider inventory needs an explicit staged rollout on a populated deployment:

1. Deploy optional `inventoryName`/`inventoryText` fields, projection maintenance,
   and the internal `capabilityProviderTools:backfillInventoryPage` operation.
   Stage `by_businessId_and_inventoryName` and `search_inventoryText`; retain
   date-only reads while the indexes are staged.
2. The authorized backend owner runs bounded pages with
   `paginationOpts: { numItems: 50, cursor: null }`, then the returned opaque
   cursor until `isDone`. Inspect `skipped` and repair missing or wrong-owner
   source revisions; an incomplete owner inventory is not a complete search.
3. Confirm index readiness, remove staged flags, then enable the final indexed
   reads and matching web candidate. The bounded missing-projection probe remains
   fail-closed as `index_pending`. No live backfill was performed in this work.

`AE_PUBLIC_DOCS_URL` optionally selects a vetted docs root. Until configured,
app help links use the existing local API reference. Fumadocs's optional
`VITE_AE_DOCS_APP_URL` controls its return-to-app link. Neither setting provisions
`docs.aecon.ai`, publishes content or grants Account authority.

Record source gate results in the existing maturity execution record and the
eventual PR. Before release, record the actual web/backend/source/docs/client
tuple and repeat required authenticated qualification. Joel explicitly deferred
that production journey to a later authorized action. The configured local
test environment currently lacks `AE_E2E_OWNER_EMAIL` and `CONVEX_URL`; public
loopback browser proof cannot qualify membership, Account switching or recovery
against a live backend. Existing Vercel automatic-deployment protections remain.

**8 October settings completion — coordinated candidate, not deployed.** Identity
owns the additive `accountRef` returned by `workspaceTeam:invitationContext` and
the required `expectedAccountRef` on `workspaceAccounts:renameUnboundWorkspace`.
The matching web server handlers and UI send/check Account identity for invitations
and bound/unbound renames. Deploy the matching backend/web candidate together;
a stale rename caller missing the required Account must fail closed and reload,
not be grandfathered into an unfenced write. The invitation projection must be
present before its new web check can permit invitations. No data migration or
historical purchase rewrite is involved. Live Clerk, webhook readback and Account
switching remain in the deferred authenticated qualification.


**8 October release authorization and preparation.** Joel authorized committing,
integrating and deploying the coordinated candidate, then production testing.
The verified pre-release web/backend revision is
`1cfe08489f3f3d3dfc36d2a37619c509e4924034`; Vercel production deployment is
`dpl_6QuZitnMGqaoLy8cyUESZVw5dWBF`. Production remains the existing
`agentic-economy` Vercel project and `cautious-zebra-473` Convex deployment,
with `clerk.aecon.ai` and the production Formance ledger/gateway above. The
current payment audience was read back as `admins`; release work does not change it.

An independently reviewed additive preparation preserves the pre-release Quote
contract and date-only inventory reads, adding only optional inventory fields,
projection maintenance, the bounded backfill and two staged indexes. Native
production dry run passes and deletes no indexes. The sole current inventory
projection has a matching owned source revision. Complete its backfill and enable
the indexes before final reads. Build the matching production web deployment
without assigning domains before the backend/web cutover. After backfill, code
rollback must retain the additive schema; never restore a financial database.

Pre-release readiness is already unavailable: Base RPC evidence fails and treasury
requires reconciliation. Configuration and backend probes pass. Preserve that
failure independently of UI release acceptance; paid production journeys and
expanded Customer access are not qualified by this release. The release PR and
subsequent readback record own the exact deployed tuple and outcomes.

## 8 October platform UI production release

[PR #370](https://github.com/CreasyBear/Agentic-Economy/pull/370) merged at
02:44:56 UTC as `a4de76f2bf846646ddb303c2a6fb61b44a201841`. Joel authorized the
coordinated production release and subsequent manual testing. The preceding
candidate sections preserve historical preparation, not current deployment status.

| Surface | Deployed or verified evidence |
| --- | --- |
| Source | `ce7a0e57e1fbc13a0bf8f0ff8d1bb5ecc99bab7a`, gated and read back from both web and backend. |
| Web | `app.aecon.ai`, Vercel `agentic-economy`; `dpl_6wpnJZLa4aZmFLY6Y8oQQB5nZD7L`, built before backend cutover and promoted through the native CLI after merge. |
| Backend | `cautious-zebra-473`; deployed from the exact committed-source archive. |
| Contract/docs/client | OpenAPI `1.0.0-alpha.2`, 62 paths. Source gate verified 228 docs pages, 84 owner examples and packaged CLI on Node 20/22. No standalone docs deployment or authenticated installed-client qualification is claimed. |
| Bindings | Existing `clerk.aecon.ai`, production Formance gateway/ledger and custody configuration retained; persisted payment audience read back as `admins`. |

Inventory preparation retained the preceding production Quote/date-only contracts
and added only the reviewed projection/schema/backfill changes. Native deploy
deleted no indexes. The bounded backfill processed **1**, skipped **0**, and
completed in one page. The final deployment enabled both name/text indexes;
read-only probes returned the owned projection through each. No purchase,
financial history or ledger rewrite occurred.

`check` and the full `gate` passed: 9,538 unit tests, 3,118 integration tests,
20 public browser checks, 20 accessibility checks, types, import/security
boundaries, SEO, production build, docs and packaged CLI. Existing unavailable
qualifications remain 1 unit skip, 77 integration skips/3 todos and 18 browser
skips. Source fixtures do not replace authenticated production journeys.

Post-promotion health is 200. Market, Provider, sign-in, OpenAPI, `/llms.txt` and
`/SKILL.md` return 200. Anonymous browser inspection of Market, populated Tools,
Provider and sign-in at 390/1440px found no uncaught JavaScript errors or document
overflow. Recipient disclosures precede their actions. No paid Calls or account
mutations were exercised; Joel's signed-in journey qualification remains open.

Readiness remains 503: Base RPC reports `treasury_chain_unavailable`, treasury
reports `treasury_reconciliation_required`, and the catalogue is stale. Those
payment failures preceded the release. The post-release commercial probe also
reports quoting unavailable; a populated directory is not proof of callable
supply. Configuration/Convex probes pass. Money/Registry owners retain this work;
no policy relaxation was used to clear it.

Rollback reference: previous web `dpl_6QuZitnMGqaoLy8cyUESZVw5dWBF`, source
`1cfe08489f3f3d3dfc36d2a37619c509e4924034`. Backend rollback must retain additive
inventory fields now stored in projections; reverting the old schema alone is
unsafe. Preserve accepted operations and financial history; financial recovery
remains fix-forward. Automatic Git deployment from `main` remains disabled.

**Sidebar visibility follow-up:** [PR #371](https://github.com/CreasyBear/Agentic-Economy/pull/371)
owns the subsequent web-only release and its exact deployment receipt. It makes
the desktop sidebar opt-in from the existing Display settings dropdown. Backend,
domain modules, server handlers and deployment bindings have identical Git trees
to `ce7a0e57`; that backend and the alpha.2 contract remain compatible without a
backend redeploy. Read the PR receipt and `/api/v1/release` for the newer web
revision; the coordinated release tuple above records the preceding rollout.


### 8 October header navigation correction

[PR #372](https://github.com/CreasyBear/Agentic-Economy/pull/372) supersedes the
sidebar visibility follow-up: navigation destinations move into the header menu,
the global sidebar/preference is removed, and chat retains its conversation history.
This is a web-only release for `agentic-economy` / `app.aecon.ai`. The existing
`cautious-zebra-473` backend remains on `ce7a0e57`; backend, domain, server and
deployment trees are unchanged. Clerk, Formance and payment audience are unchanged.

The PR receipt owns the exact gated source, Vercel deployment, promotion/readback
and current readiness observations. The preceding web rollback target is
`dpl_GU335fgpfBQwTdiHJk9sFsx1yRpb` (`dbb79bc089e48a34790c3091292c63540340ce8e`).
No data migration or backend redeploy is required. Source/component and read-only
header fixtures do not establish real Clerk popup or authenticated journey
qualification; that acceptance remains with Joel under the existing deferral.

## 8 October performance and resilience candidate

**Local source candidate; not deployed.** Owner: canonical integrator, with
bounded independent Sol reviews. Base: `e9950737c9c7620e9df984c6b0b6123eded32570`.
The measured v4 source-diff/untracked digest is
`221d0e83c4dc04d68e00dde1c74a446ce586b9573ff208e3369cc4e515de4764`.
The local `output/release/performance-candidate.json` receipt identifies the
measurements, source fingerprint and verification results. Unrelated whitepaper
and strategy drafts are excluded. No new branch, worktree or register was created.

The candidate removes unused Discover reads, defers unopened feature and optional
observability imports, stabilizes Convex client ownership, and gives Router the
canonical Market search/cache state. Workspace settings share one request-scoped
authenticated transport. Calls/Plans load before optional financial reports.
Read deadlines include response consumption and propagate cancellation; abandoning
a read does not undo accepted work. Existing REUI Skeleton/Spinner compositions
provide announced loading states and respect reduced motion.

Independent isolation review corrected old-Account Router cache, private header,
portal and delayed-notification exposure. The visibility helper contains no
authority facts. Drafts survive same-Account access refresh; accepted command
receipts, uncertainty and recovery survive notification suppression.

### Local evidence and limits

| Cohort | Result |
| --- | --- |
| Public warm navigation | Matched baseline/v4 HTTP/2 comparison, 600 navigations per build, 100 per directed route pair. Usable median **294→128.5ms**, p95 **310→143.1ms**. Transition-settled p95 **326.6→160.4ms**. No endpoint or local HTTP failures. |
| Cold browser, controlled mobile | 100 fresh contexts; 390×844, 4× CPU slowdown, 150ms latency, 1.6Mbps downstream. p95 **4.443s**; all endpoints completed. First newly started server request **6.607s**, retained as the one over-budget result. |
| Cold browser, desktop | 100 fresh contexts on the already started server. p95 **1.207s**; all below 3s. Repeated cold server startup is unqualified. |
| Signed-in navigation | Test Clerk/local Convex; 25/25 steps completed. Settings menu requests **5→2**, direct Workspace return **4→2**, Activity return **9→6**. Medians 397/259/255/160/488ms across the five journeys; four exceed 200ms. Five samples per journey cannot qualify p95. |
| Retained browser/rollback | Three emitted-build fixtures passed: same-tab A→B→A, Router/app asset-loss recovery, and command-panel fallback. All traffic was GET. Missing-asset errors were retained. Hosted pinning, old authenticated server-function clients, drafts and purchase recovery across deployment remain open. |

These are compiled-client local fixtures using emitted Nitro under a development
server environment, not hosted performance. Shared Mac CPU load was recorded;
unrelated applications were left running. Public browser traffic outside loopback
was deliberately refused, including Clerk SDK loading; those errors remain in
the evidence. Authenticated tests separately allowed the configured test Clerk
host. Timing cohorts made no purchases or Account changes. Activity now waits for
fresh primary data; its earlier cached-content timing is not an equivalent
comparison. Optional summaries remained partly unavailable and completed after
the real Call. Scope-change/delayed-response fixtures do not replace hosted
two-Account acceptance. The failed preliminary mobile screen is preserved; the
full cohort uses the original p95 budget.

`npm run check` and the complete `npm run gate` pass under Node 22 with explicit
development/sandbox configuration. The gate includes the production build, clean
types, 9,628 unit tests (one skipped), 3,128 integration tests (77 skipped and
three todo), 20 browser journeys, 20 accessibility checks, CLI package verification,
and the docs build/publication check (228 pages and 84 owner examples). The browser
pass leaves 18 environment/configuration-gated cases skipped; those and skipped
financial/restore integrations are not runtime qualification.

Earlier attempts remain in the local evidence: a workspace disconnection during
clean types, then two stale navigation/transition assertions. Correcting those
assertions changed no application behavior; all 21 affected tests and the full
rerun passed. Final check/gate log: `performance/closeout-final-gate.log` in the
Codex execution workspace, linked by the local release receipt. The hosted
hydration stall remains unresolved.

The local advisory React Doctor hook reports one error-level finding and 26
warnings across touched files. Its baseline comparison reports zero new errors
and five new warnings. The error is the inherited render-time `mountedIdentity`
ref write in `AeConvexProviders.tsx`, present at the base revision. Web/DX retains
its lifecycle review in `TODOS.md`; passing the gate does not dismiss it. The
comparison reports are retained beside the gate log. No post-gate runtime edit
was made.

### Compatibility, infrastructure and rollback

The [PR #372 production receipt](https://github.com/CreasyBear/Agentic-Economy/pull/372#issuecomment-6051921139)
binds current web `6e1abd0162bfef197e35a79b4b1aa8765db9769f` to
`dpl_5ojMkJbKXCqwtHc9xzZt2xXhstHR`, with backend
`ce7a0e57e1fbc13a0bf8f0ff8d1bb5ecc99bab7a` on `cautious-zebra-473`.
Native read-only Vercel inspection confirms that deployment, Sydney, Node 22,
Fluid Compute, 2048 MiB and a 300-second function timeout. The skew setting is
43,200 seconds. Installed Nitro supplies the deployment cookie; one live document
GET confirmed emission matching the expected deployment without retaining its
value. Configuration and emission do not prove behavior through promotion or expiry.

No changed/new candidate source intersects the inspected Convex runtime-import
closure: 184 roots and 1,355 files. Backend function names, serialized contracts,
schema and financial commands are unchanged. Source-contract review requires no
backend redeploy or data migration; it does not establish byte-identical rebuilt
backend bundles. API/CLI/protocol compatibility is unchanged by this package;
existing hosted acceptance remains bound to its recorded release tuple.

Before a separately authorized release, complete hosted compatibility checks and
re-resolve the current deployment. Retain the verified PR #372 web deployment
above as this candidate's rollback baseline. Web rollback preserves the backend,
ledger, opaque references, journals and accepted operation identities; it must
not restore financial data. Manual deployment controls remain in place.

At 06:57:37 UTC (14:57:37 Perth), public health returned 200 and readiness 503
`payments_unavailable`, with configuration and Convex ready. Current Infura/Alchemy
allowance and the cause remain unproved. AWS CLI and intended profiles exist but
the native login session has expired; no resource queries followed. Current
backup/metrics/alert evidence and joint restoration remain with Operations/finance
under MM-042; Datadog stays with #284. The independent ACID review confirmed the
High Account/month cap race under [MM-004](mercator-maturity-register.md#mm-004).
This candidate does not repair that financial owner or qualify payment availability
or operational restoration. No deployment, credentials, caps or infrastructure changed.

## 8 October bounded alpha readiness candidate

Owner: canonical integrator with independent Sol finance review. Candidate base
`44ae4826a83752e84e5503bf03047b15a68ac333` plus the reviewed working diff; this
section does not record a deployment. The bounded change corrects committed Chat
identity and the Account monthly admission race under MM-004. The earlier
performance candidate remains part of this local source lineage.

At 10:14 UTC production web reported
`6e1abd0162bfef197e35a79b4b1aa8765db9769f`; native Convex
`cautious-zebra-473` reported `ce7a0e57e1fbc13a0bf8f0ff8d1bb5ecc99bab7a`.
Health was 200; readiness was 503 `payments_unavailable`. Direct read-only RPC
probes identified Alchemy's monthly capacity refusal while Infura answered.
Joel explicitly chose to leave Alchemy unchanged. The proposed US$25/month
Alchemy allowance and alerts are preparation only, separate from his authorized
US$200 aggregate / US$10 per test-user treasury purchase ceiling. The ceiling
is not a target, permission to raise existing financial limits, or an instruction
to create twenty users. Invitations and the Admin-only payment audience remain
unchanged. No paid Call, deployment, billing, credential or failover change has
occurred in this correction.

The native cap reader was exercised read-only from local candidate source
against the verified production ledger at 10:50:54 UTC: complete traversal,
24 current-month sales for the existing authenticated Account, gross 182,595
AUD/6 units, high-water ID 195, 2,381 ms. Its sale-list SHA-256 was
`58dc4d47c6ca35338c7e56684058ea0c742c84d9f093632c26439373c356973f`.
The reader uses the official SDK's descending native cursor and validates scope,
identities, amounts and completeness. This does not qualify a deployed financial
mutation, paid delivery, cross-channel recovery or joint restore.

At 11:06 UTC the actual installed CLI `0.3.2 (development)`, official MCP client
(protocol `2026-07-28`, 29 authenticated Tools) and direct authenticated HTTPS
all read the same completed historical Call. Their Call/result projection hashes
matched: `2832c96cad6b3ae466b65a14332fdf90ae3b146e8309c893f417554c3e2c4e79`.
The CLI journey envelope retains the original Call recovery object. The installed
binary SHA-256 is `a1f6e0a606c56ea1afbd0a62de256bff19fe41960a07262512d7f27592fe2c30`;
this identifies the tested installation without claiming a newly published client.
Credential-free HTTP redirected to HTTPS with 308. Health passed; readiness
remained 503, catalogue stale and quoting unavailable at this observation.
Evidence is retained in the execution workspace's
`performance/proposals/alpha-readonly-channels.json`. These checks performed no
new purchase or replay submission. Fresh paid Chat/MCP/CLI/HTTPS delivery,
response-loss replay and authenticated browser acceptance remain unqualified.

Backend changes are additive indexes and an optional immutable Call gross-price
projection, plus replacement of the internal Plan-only exposure query. Public
HTTP/MCP/CLI contracts, owner spend response shape and existing native references
are preserved. Generated Convex API files come from official anonymous local
codegen. New Quotes initialize zero Plan exposure; old unknown material remains
visible. No historical purchase or financial record is rewritten.

At 11:10–11:11 UTC bounded native document reads completed below their 1,001-row
sentinel: 25 Calls (24 completed, one refused), three terminal Plans and 57
Quotes. All Calls had conclusive financial states; no unheld begun Plan remained.
The cohort fits the new source bounds without rewriting its 25 legacy Calls
whose optional price projection is absent. This is point-in-time record evidence,
not proof that no action is executing or that the new indexed query is deployed.
The execution workspace retains `performance/proposals/alpha-production-cohort-bounds.json`.

Source verification passed: `npm run check`, official anonymous Convex codegen
and the full `npm run gate`: 9,650 unit tests, 3,133 integration tests, 20 public
browser checks, 20 accessibility checks, packaged CLI, types, boundaries, SEO,
production build and 228 docs pages/84 owner examples. Existing unavailable
qualifications remain one unit skip, 77 integration skips/three todos and 18
browser skips. The complete gate log is retained at
`performance/alpha-final-gate.log` in the Codex execution workspace. Independent
Sol review found no remaining material source regression within the stated native
snapshot and source-coverage assumptions. This is not hosted paid acceptance.

Before release, preserve accepted journals. Drain cap-reading preparation actions
before switching the backend;
old query/snapshot shapes are incompatible with the new internal contract.
If an unheld begun Plan crosses the switch, inspect/requeue its original Plan
reference through its owner. Do not cancel/recreate it or weaken the new guard.
Frozen Hold booking and accepted Call recovery material remain unchanged.
Backend and web require their own release identities. After new Calls carry
`buyerAmountUnits`, any backend rollback must retain that optional schema field
and the additive indexes: redeploying the raw previous schema can reject existing
documents. A rollback to the previous financial guard also reintroduces MM-004;
keep new paid admission closed if that rollback is necessary. Code rollback never
restores the ledger or Convex data, changes accepted keys, or authorizes a
replacement payment. Paid production
qualification remains blocked until existing RPC and treasury readiness recover.

Catalogue freshness is a separate open Operations/Registry decision: the import
runs every 168 hours but reports stale after 36 hours. The previous unchanged
scan shortcut is absent from deployed source. Daily full import requires current
cost/allowance evidence; no cadence increase or timestamp-only freshness repair
was made. AWS session expiry and joint financial restoration remain separate
Operations acceptance boundaries.

## 8 October alpha readiness release

[PR #373](https://github.com/CreasyBear/Agentic-Economy/pull/373) merged at
11:23:47 UTC as `c5f9671e7248af34ccb5d5061d29775ef366d98c`. The deployed runtime
source is `c608833bd9b015d1b89600377d7aeb83b6edd2e9`, including the performance
lineage above. Native Convex `cautious-zebra-473` and the public web release
endpoint both reported that runtime revision after deployment.

Vercel deployment `dpl_6YhthsjQUGVZffbTB5Gu41TCLWkd`
(`agentic-economy-6cqi1owo8-creasybears-projects.vercel.app`) was promoted to
`https://app.aecon.ai`. The backend dry run and deploy added the three reviewed
indexes and retained existing documents. No historical financial migration,
credential, RPC allowance, quorum, billing or payment-audience change occurred.
Payments remain Admin-only, revision 2. No test purchase budget was spent.

The deployed exposure reader returned complete native coverage at 11:22 UTC:
24 current-month sales, 182,595 AUD/6 units, high-water 195 and zero outstanding
allocations for the observed Account. At 11:27 UTC installed CLI, official MCP
and direct HTTPS again read the same historical Call with the unchanged
projection digest recorded above. Private Call reads remained `no-store`.
Release, health, OpenAPI, SKILL and llms endpoints returned 200. Readiness
remained 503 with payments unavailable, stale catalogue and quoting unavailable.
Fresh paid delivery and response-loss replay therefore remain unqualified.

An anonymous tab opened before promotion navigated afterward without a reload
failure. Fresh desktop and mobile-width page checks had no JavaScript errors or
horizontal page overflow. The first desktop Market observation took 4,275ms to
the hydrated-header/visible-heading marker and missed the desktop target. This
was one sample, not p95; mobile widths were not a controlled mobile profile.
These checks did not establish table readability, which Joel subsequently
reported as defective. Signed-in transitions and paid journeys remain separate.
Evidence is retained in the execution workspace under `performance/alpha-release/`.

Rollback web target: `dpl_5ojMkJbKXCqwtHc9xzZt2xXhstHR`, source `6e1abd016`.
The prior backend source is `ce7a0e57e1fbc13a0bf8f0ff8d1bb5ecc99bab7a`; retain the
new optional Call field and additive indexes if rolling its code back. The
financial guard and original-reference precautions in the candidate entry still
apply. A code rollback never restores financial data or replaces accepted keys.

## 8 October public table repair

[PR #374](https://github.com/CreasyBear/Agentic-Economy/pull/374) replaces the public
catalogue's operator-table wrappers with the installed REUI auto-width
composition. Native components retain layout and scrolling; existing owners
retain prices, identities, Save/Compare, Host selection and opaque pagination.
No upstream vendor source, dependency, API, backend or financial owner changed.

Runtime source `b8d4570c7241cf28ce0557953fb6897cc3ba2f62` was built from a clean Git
archive as Vercel `dpl_2AUthBPTg2eZPXZLjvqNLyfX1thR`,
`agentic-economy-4c81a95ej-creasybears-projects.vercel.app`, and promoted to
`https://app.aecon.ai`. The protected candidate and public release endpoint both
reported that source. The backend retains the established `c608833bd` release;
this was a web-only deployment. Rollback web target is
`dpl_6YhthsjQUGVZffbTB5Gu41TCLWkd`; no backend or financial rollback is needed.

The complete source gate passed: 9,650 unit tests (one existing skip), 3,133
integration tests (77 skips, three todos), 20 public browser checks (18 skips),
20 accessibility checks, CLI packaging, and 228 docs pages with 84 owner examples.
Twelve focused existing table tests and independent Sol source review passed.
Local actual-component evidence covers three table views at six widths, dark
mode, keyboard actions and saved-status failure/recovery. A source hook reported
two advisory pure-helper allocation warnings; no React errors.

At 12:23 UTC, anonymous production Tool and Host tables passed at 1440px and
390px: no filler cells, clipped cell content, page overflow or JavaScript errors.
Tool names received 451px at desktop instead of the old 150px; price decimals
and provenance remained visible. Compare toggled on/off and opaque pagination
advanced and returned to the original rows. A tab retained across promotion
navigated successfully in 56ms. Signed-in saved persistence and purchases were
not exercised. Screenshots and raw checks are in the execution workspace under
`performance/market-table-hosted.json` and `performance/market-table-release/`.

The first fresh desktop Tools load took 4,688ms to the hydrated-header/table
marker and remains a performance miss. Later fresh diagnostic samples took
1,878–2,363ms; their first response arrived in 177–201ms, while the document
finished at 976–1,398ms. Neither the earlier landing-page cohort nor these three
Tools observations establishes p95 or explains the first-load outlier. The next
Web/DX package must separate streamed data completion from hydration and reduce
confirmed unnecessary reads/imports before claiming a timing improvement.

Health returned 200. Readiness remained 503 (`payments_unavailable`), with stale
catalogue and quoting ready at this observation. RPC configuration and the
Admin-only payment audience were unchanged; no purchase budget was spent.

## 8 October public read reuse investigation

Baseline web source is `b8d4570c7241cf28ce0557953fb6897cc3ba2f62`;
canonical integration starts at `d1a641d95`. Independent native provider
readback confirmed Vercel Node 22/Fluid in `syd1` and production Convex
`cautious-zebra-473` in `aws-us-east-1`. Catalogue reads therefore cross
Sydney/Virginia. No region, billing, credential, RPC or infrastructure change
is part of this correction. Moving Convex is a separate data migration, not
an in-place configuration switch.

Five fresh anonymous desktop Tools observations took 1,517–2,953ms to the
hydrated-header/table marker. First response arrived in 184–279ms; document
completion took 792–1,947ms. Five Tools/Hosts round trips in one browser
observed a first Hosts load of 4,120ms and five server-function requests;
subsequent transitions took 57–85ms with no data fetches. Public marketing
return navigation medians were 136–152ms, retaining first-visit misses of
811ms and 870ms. These are small unthrottled diagnostics, not p95 qualification
or signed-in acceptance. Raw evidence remains in the execution workspace under
`performance/read-reuse-*.json`.

Cloudflare screenshots describe `formance-alpha.aecon.ai`, not website asset
caching. Current website JavaScript and CSS returned Vercel HIT with immutable
cache headers. A read-only source census predicts 2,016 treasury aggregate
requests/day from seven aggregates every five minutes, close to the screenshot's
2.01k. The same workload intentionally reads the treasury audit twice to detect
source changes. Public Market reads do not call Formance. Request-level logs
are still needed to attribute the 820 4xx and three 5xx; local Cloudflare API
configuration contains placeholders. Neither the count match nor geographic
request counts establish actual caller attribution.

The candidate removes unused Discover chat configuration and native Host
Tool facets/recipient reads. Pending destination search and Agent handoff wait
for the destination's disclosure before becoming actionable. Shared chrome
no longer eagerly imports admin recovery; recovery loads on an actual admin
render, preserves saved identities, and contains a chunk failure locally.

The candidate uses native Nitro caching for finite unfiltered first-page catalogue presets,
filter metadata and directory display exchange-rate observations for 30 seconds.
Custom filters and queries bypass the cache to bound key cardinality.
Opaque continuation validation stays live; expired rates lose their AUD estimate
using the original observation expiry. Unavailable results are not retained.
Request cancellation cannot cancel another reader’s shared resolution. The cache
is process-local; cold workers still read Convex. Its lifetime can combine with
the existing 30-second Router lifetime for roughly 60-second-old displayed
metadata. Quote, Call, identity, financial and recovery owners remain uncached.

`npm run check` and the complete `npm run gate` passed after integration:
9,668 unit cases (one existing skip), 3,133 integration cases (77 skips and
three todos), 20 public browser checks (18 skips), 20 accessibility checks,
CLI packaging, and 228 docs pages with 84 owner examples. Independent Sol
reviews corrected pending disclosure and unbounded cache-key cardinality.
Two existing assertions now wait for their lazy content; their failed gate
runs remain in the execution evidence. No current source test was waived.
Runtime source `e4d04a47ecb940d249f596a06d7b228892a500e0` was built from a
clean Git archive as Vercel `dpl_EBpeFYykzMSFr8qUaJY6qg3ge512`,
`agentic-economy-olujsdgde-creasybears-projects.vercel.app`, and promoted to
`https://app.aecon.ai` through [PR #375](https://github.com/CreasyBear/Agentic-Economy/pull/375).
Protected and public release probes both report that source. This is web-only;
Convex remains on `c608833bd9b015d1b89600377d7aeb83b6edd2e9`. Rollback is
`dpl_2AUthBPTg2eZPXZLjvqNLyfX1thR`; no backend or financial rollback is needed.

Five interleaved anonymous SSR requests per immutable deployment returned valid
Tools tables. Median response start fell from 1,182ms to 748ms; median complete
response fell from 1,193ms to 766ms. The first candidate request still took
1,810ms to complete. Five fresh desktop browser contexts reached hydrated header
plus Tools table in 1,448–2,670ms (median 1,471ms), versus the earlier five-sample
median of 1,923ms. The first Hosts transition used two server-function requests
and took 901ms; repeated Tools/Hosts transitions took 66–89ms without Market
loader fetches. Public marketing return medians remained 140–148ms, with first
visits of 817ms and 830ms. No JavaScript errors were observed in these cohorts.
These are diagnostic samples, not p95 acceptance or a controlled browser A/B:
the local host had elevated unrelated load during candidate measurements.

Independent Sol review exercised desktop/mobile reading, comparison facts,
keyboard tabs, Tools pagination and return. It found two unresolved UI defects:
Compare activation loses keyboard focus to the document body, and the long AX1
selection chip expands a 390px viewport to 638px. UI/Registry owns their
correction in `TODOS.md`; this release does not close whole-UI acceptance.
The reviewer did not complete Host next/back traversal because its locator
expected a button rather than the actual link. A separate parent-controlled
Hosts-to-Tools test held destination GETs until the pending state appeared:
search was inert and Agent handoff absent until recipient disclosure arrived.
No search, chat submission or purchase was sent.

The retained-browser promotion harness reached the old hydrated page, but its
stdin control connection was closed and the post-promotion step could not run.
That check is unverified. A prior entry-asset hash returned 404 on the new alias;
current assets returned Vercel HIT with immutable headers. Existing stale-chunk
recovery tests pass, but they do not establish hosted retained-browser recovery.
The failed harness and all diagnostic results remain under
`performance/read-reuse-release/` and `performance/read-reuse-*.json` in the
execution workspace. Earlier threshold misses and failed gate attempts remain.

Health returned 200. Readiness remained 503 (`payments_unavailable`), as on the
baseline. The first protected candidate quoting probe was unavailable; later
public probes were ready, with stale catalogue. No purchase budget was spent.
Signed-in performance, controlled mobile/cold p95, retained-browser recovery and
payment acceptance remain open. Alchemy, payment audience, provider agreement,
credentials and infrastructure were unchanged.

## 9 October Sydney migration validation

Owner: canonical integrator with infrastructure, execution and authority owners;
continue [#256](https://github.com/CreasyBear/Agentic-Economy/issues/256).
Reviewed source: `d46a07ad70df0a71f7539f0f8b437c287ecd2b24`. Joel accepts
the 30% regional surcharge if validation demonstrates improved performance.
Sydney is the recommended migration candidate for the Australian product and
existing Sydney web tier. This is a placement recommendation,
not a measured performance improvement or approval to run two financial backends.

Native Convex management GETs on 9 October confirm production
`cautious-zebra-473`, project `2983394` (`agentic-economy`), in `aws-us-east-1`.
Team `505132` reports `aws-ap-southeast-2` available. The project has production,
development and preview deployments, all in Virginia; no Sydney target exists.
The preceding Vercel inspection confirms `dpl_EBpeFYykzMSFr8qUaJY6qg3ge512`
in `syd1`. AWS ledger placement remains declared Sydney; expired AWS login
prevents fresh resource verification. No deployment, binding, credential, payment
audience, Alchemy plan or production data was changed in this validation.

[Convex regions](https://docs.convex.dev/production/regions) documents a 30%
regional usage surcharge and requires a new deployment plus export/import to
move regions. Exact account billing and dashboard cross-checks remain unverified:
the installed Codex browser skill's required control tool is unavailable in this
session. Orca was stopped when Joel selected Codex computer use; no substitute
browser driver was used. Usage counters alone do not establish the invoice.

Independent Sol source review and integrator spot checks identify these gates:

| Boundary | Finding and required disposition |
| --- | --- |
| Executing copied work | `convex/crons.ts` registers 18 workloads. Copied workload identities can remain active. `convex/lib/money/treasury/paymentAdmission.ts` deliberately preserves accepted Call replay outside new-purchase admission. Payment pause is not a rehearsal execution barrier. |
| Component backlog | Workpool recovery can classify missing scheduled jobs as failed and retry them. Three Workpools and Workflow carry Call, Stripe, notification and lifecycle work. Prove nested component coverage and disposition; neither dropping components nor blindly cancelling work establishes safety. |
| Existing quarantine | `convex/lib/capabilityExecution/callLifecycle/restoredDispatches.ts` handles at most 25 exact Call/work-ID pairs and requires separately observing retirement. It is not a global worker or financial-effects fence. |
| Missing schedules | Backups omit pending scheduled functions. Copied credential-expiry and Plan materializations can still reference them. Inventory and reconstruct or explicitly resolve missing continuations before accepting work. |
| Browser recovery | `src/components/ae/admin/actions/admin-command-recovery.ts` scopes retained commands by deployment URL and actor. Resolve or deliberately bridge the old namespace while preserving actor isolation and original operation identities. |
| Bridge and readiness bindings | Switch `CONVEX_URL`, `VITE_CONVEX_URL`, `CONVEX_SITE_URL` and `AE_PROVIDER_CONSEQUENCE_ORIGIN` coherently. The explicit site URL takes precedence in the consequence bridge. Regenerate readiness against the new configuration; imported green evidence is insufficient. |

Use [native deployment pause](https://docs.convex.dev/production/pause-deployment)
as the first candidate isolation control, established and verified on an empty
target before importing data or activating application workers. Pause rejects
function calls, skips crons and queues scheduled jobs until resume. It therefore
cannot qualify running-app latency and does not dispose of backlog. A safe
read-only benchmark needs separately proven isolation before any resume; no
custom replacement scheduler or blanket migration flag has been selected.

The bounded sequence is:

1. Prove target isolation and production-effect refusal using synthetic work;
   verify target defaults, ingress and external bridge bindings. Do not copy
   production credentials into an active rehearsal.
2. Rehearse application, nested component and storage restoration behind that
   barrier. Compare snapshot membership, counts and digests using the existing
   archive comparator; separately prove schedule reconstruction and pending-work
   disposition. `tools/release/convex-restore.ts` only compares archives.
3. Measure matching source, data/index coverage and Australian cold/warm
   journeys. Keep desktop cold p95 <3s, controlled mobile <5s, eligible warm
   median <200ms and p95 <500ms. Retain failures and separate regional latency
   from caching, hydration and RPC readiness. No Sydney measurement exists yet.
4. Qualify authentication, original Call/recovery identities, old browser
   journals, storage, aggregate consistency and pagination across the URL change.
   Embedded Convex cursor portability is unproven; restart pagination explicitly
   if necessary. Run candidate checks, affected tests and the release gate.
5. Cut over with one authoritative writer/worker, a controlled quiescence
   boundary, final consistent snapshot and explicit pending-work transfer.
   Switch bindings together, preserve payment policy and verify fresh readiness.
   Once Sydney accepts value-bearing work, reactivating the old database is not
   a safe rollback; financial recovery remains fix-forward.

[Backup semantics](https://docs.convex.dev/database/backup-restore) cover data,
not code, configuration, environment variables or pending schedules. The
existing snapshot comparator is evidence for archive equality only. This review
does not qualify a restore, live migration, regional speedup or payment journey.
Verdict: proceed with isolation/rehearsal preparation; no-go for running a copied
production backend or cutting over now. Codex dashboard access, proven isolation,
component/schedule recovery and measured Sydney performance remain open.

## 9 October live infrastructure audit and isolated target

Follow-up to the validation above, after Joel completed the native AWS login.
This supersedes its expired-login and no-Sydney-target observations. Canonical
source remains `d46a07ad`; production web remains
`dpl_EBpeFYykzMSFr8qUaJY6qg3ge512`, runtime `e4d04a47e`, and production Convex
remains `cautious-zebra-473` in Virginia. No production binding was changed.

Method: repository deployment-operations and Wayfinder, installed pstack
poteto/how/verification guidance, Convex reviewer and Cloudflare skills; four
bounded independent Sol source reviews followed by native provider readback.
The maintained [AWS review skill](https://github.com/aws/agent-toolkit-for-aws/blob/main/plugins/aws-core/skills/aws-well-architected-review/SKILL.md)
was evaluated as a reference. This is a focused operational audit, not a complete
AWS Well-Architected review or certification. No Codex computer-control tool is
available; no alternate browser driver was used.

### Live evidence and decisions

AWS caller is the non-root `Package4ReleaseOpenTofu` assumed role in account
`197716152388`. Queries and two read-only SSM inspections completed on 9 October:
`e11ade46-8b95-433a-b8cc-50d10c14e1c0` and
`4d084f42-35d2-40ec-af1d-d4432573ceda`. No secret values were emitted.

| Area | Verified result, limit and disposition |
| --- | --- |
| Compute | `i-073197e0346d83010`, `ae-alpha-package4-k3s`, is a private `t4g.large` in Sydney `ap-southeast-2a`, SSM online and IMDSv2 required. One sample reported 13% CPU and 16% memory; workload pods were running without restarts. Keep current size pending sustained load evidence. One host and one NAT remain an AZ dependency; two tunnel pods do not remove it. |
| Database and copies | `ae-alpha-formance` is available, encrypted, private, Multi-AZ PostgreSQL 16.13 on `db.t4g.medium`. Seven-day PITR was current to 01:51:40 UTC when inspected at approximately 01:57 UTC. The two queried 8/9 October backup jobs and Melbourne copies completed. This proves recent protection, not five-minute RPO, host recovery, regional restore or joint Convex/ledger consistency. |
| Credential consumption | RDS rotates its managed password every seven days. Contrary to the initial source-only concern, the live host has an active five-minute reconciliation timer; its last inspected run succeeded at 02:00:46 UTC. It reads the current secret and reapplies Settings. The initial checksum attribution was incorrect: the inspected SHA-256 strings were image pins, not credential comparisons. Ledger pods started about four minutes after the last password rotation. Preserve this working mechanism and reconcile its missing source declaration; reconnect behavior was not fault-injected. |
| Infrastructure alerts | All eight current alarms were OK with actions enabled. The live SNS topic uses customer-managed key `73c82281-a628-4334-9307-5073361571c8` with CloudWatch/EventBridge grants, one confirmed subscription, and a recorded successful CloudWatch publish on 2 October. This disproves the source-only `alias/aws/sns` diagnosis for the live deployment. It does not prove recipient acknowledgement, backup-event delivery or Datadog journey alerts. |
| Network logging — confirmed failure | Active flow log `fl-085d85b94cfa66529` reports `FAILED`, `Access error`. Its audit bucket uses KMS key `08d05b35-edd3-4f11-9779-1a03fb2ba211`; the live key lacks `delivery.logs.amazonaws.com`, while bucket write permissions exist. Missing KMS permission is the leading demonstrated configuration cause. Correct the existing key through reviewed IaC and verify newly delivered objects before closing. No live policy changed in this audit. |
| Cost visibility | AWS Cost Explorer estimated US$72.87 for 1–8 October excluding credits/refunds, led by RDS US$41.75 and EC2 compute/other US$27.34. The US$400 runway budget includes credits/refunds and reports US$0; a separate US$20 unblended-cost budget reports US$72.87. Preserve the authorized ceiling, but reconcile gross usage and net billing alerts. This is neither a monthly forecast nor total Vercel/Convex/Cloudflare spend. |
| Provider access | The configured Cloudflare management token failed verification (HTTP 400), so current zone rules, Access policy and Tunnel dashboard state are unverified. Running cloudflared pods establish process state only. Datadog's native pilot and whole-stream privacy/delivery acceptance remain with #284. No credentials were changed or external test notification sent. |

[AWS's flow-log requirement](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs-s3-cmk-policy.html)
and [S3 delivery guidance](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AWS-logs-infrastructure-S3.html)
require the customer-managed key's delivery permission; Bucket Keys also need
explicit consideration. Enabling caching of ledger balances or transactions is
not a remedy for missing log delivery or Sydney–Virginia application reads.

State identity was checked in memory, without dumping state or credentials.
Bucket `agentic-economy-p4-state-197716152388-ap-southeast-2` contains:

- `agentic-economy/account-baseline/opentofu.tfstate`, serial 5, OpenTofu 1.12.6:
  `aws_kms_key.audit` is the exact failing log destination key above.
- `agentic-economy/alpha/opentofu.tfstate`, serial 6, OpenTofu 1.12.6:
  `module.alpha_environment` owns the exact live host, database, flow log and
  custom SNS key. The checked-in environment roots do not match that module
  address. `environments/production` declares a different `ae-production` stack.

Before AWS apply, recover the canonical alpha root and reconcile the live timer
and SNS key with source. Do not apply the declaration-only production root or
replace working resources to match stale templates. The account-baseline key
correction needs its own saved plan, unchanged unrelated resources, and fresh
delivery proof. Existing README references to `docs/operations/aws-foundation.md`
and the deployment skill's optional `scripts/deployment_snapshot.sh` are stale;
neither file exists. Use this deployment map and native provider tools until the
owning procedures are corrected.

### Isolated Sydney preparation

Created preview `upbeat-cricket-954` (ID `6033150`) in the existing project
`2983394`, `aws-ap-southeast-2`, reference
`preview/preview-sydney-rehearsal-2026-10-09`. It is not the default deployment.
Verified provider expiry is 9 October 2026 at **06:02 UTC / 14:02 Perth**;
re-resolve it before further work. Preview/default environment lists were empty.
No application code, production data, secrets, payment bindings or webhooks were
copied. Native pause returned 200; a query returned transport 200 with a domain
error explicitly refusing execution because the deployment was paused. This is
refusal evidence, not a successful query or proof about a restored job queue.

Provider canonical URL readback returned:

- `https://upbeat-cricket-954.ap-southeast-2.convex.cloud`
- `https://upbeat-cricket-954.ap-southeast-2.convex.site`

The sanitized receipt is `performance/sydney-rehearsal/target.json` in the
execution workspace. The preview is deliberately temporary and paused; no
regional application latency measurement or data restoration has occurred.
Production continues to use its original backend. The isolation, backlog,
schedule reconstruction and single-writer cutover gates above still apply.

### Source correction and next bounded work

`src/lib/deployment/manifest.ts` now includes `CONVEX_SITE_URL` in optional URL
validation and the configuration fingerprint. Previously a malformed or changed
site binding could leave validation evidence unchanged. Focused cases in
`tests/unit/deployment/deployment-manifest.test.ts` cover regional URLs, changed
binding evidence and invalid production URLs. This validates URL shape and
evidence sensitivity; it does not prove a cloud/site pair belongs to the same
deployment. Provider canonical identity remains a cutover check.

The fingerprint input set changes even when the site variable is absent.
Regenerate affected configuration/readiness evidence with the candidate;
historical hashes, accepted purchases and recovery references are not rewritten.
The initial direct test-runner invocation failed because `vitest` was not on its
PATH. Rerunning through npm succeeded: 2 files, 139 tests. `npm run check` passed,
including 25 import suites / 76 tests and the TypeScript standards check. This
candidate is not merged or deployed; the full release gate has not been rerun.
An independent Sol closeout review found no material source or record correction;
it verified the sanitized preview receipt and evidence limits. AWS live facts
were checked by the integrator, not independently re-attested by that reviewer.

The independent web review leaves three bounded source packages open:

1. HTTP admission in `src/lib/server/rate-limit.ts` has no request deadline before
   dispatch. Reuse existing bounded read/signal mechanics; fail closed on timeout
   and do not retry or dispatch after uncertain admission.
2. `src/modules/agent-access/agent-access-console.ts` can await policy and up to
   25 per-Agent history reads without an overall deadline. Reuse the existing
   page composition owner, preserve available directory facts, and disclose
   incomplete enrichment. Measure before redesigning its query model.
3. `src/lib/observability/posthog.server.ts` buffers events without a demonstrated
   serverless flush lifetime. Qualify a bounded native request-lifetime flush;
   event loss is a risk, not an observed financial-record loss.

Executive disposition: keep current AWS capacity and financial isolation;
continue Sydney preparation after proving safe restored-work handling; repair
network logging and source/live drift before claiming operational readiness.
Hosted signed-in performance, retained-browser deployment recovery, current joint
financial restore and acknowledged alerts remain separate acceptance gates.
Alchemy, the Admin-only payment audience and the purchase-test budget are
unchanged. No paid Call, production migration, AWS apply or release promotion ran.

## 9 October Sydney migration execution

Joel authorised healing and migration after the audit above. Its earlier
no-apply/no-data-copy statements describe that audit, not this implementation.
Source baseline: `d46a07ad70df0a71f7539f0f8b437c287ecd2b24`. Unrelated whitepaper
and strategy drafts remain untouched. The preparation below preceded the
completed cutover recorded at the end of this section.

### Repairs and source reconciliation

The reviewed account-baseline plan changed only audit-key policy on
`08d05b35-edd3-4f11-9779-1a03fb2ba211`: the documented AWS log-delivery service
grant, constrained to account `197716152388` and Sydney Logs ARNs, retaining
existing administration and CloudTrail statements. Apply completed at 02:35:52
UTC with zero creates/deletes and one policy change. Fresh encrypted VPC log
files arrived by 02:44 UTC. One file contained 390 records: 386 `OK`, two
`NODATA`, two `SKIPDATA`; this proves restored delivery, not lossless capture.
Provider delivery status cleared to `SUCCESS` by 02:55:59 UTC.

The first plan attempt lacked the bucket-required KMS header for its S3 state
lock. Configuring the existing backend key resolved the refusal; locking and
bucket protections stayed enabled. Private receipts and saved plan are in the
execution workspace's `performance/sydney-migration-2026-10-09/aws/` directory.

`infra/package4/environments/alpha/` restores the existing state's root/module
addresses from retained infrastructure history. Module declarations now include
its live SNS CMK, storage ceiling and five-minute credential reconcile timer.
Pinned OpenTofu 1.12.6 formatting, backend-free initialization and validation
pass. No alpha environment plan/apply ran: bootstrap changes can replace the
host and need their own reviewed replacement/restore qualification. Current
capacity, 18:00 UTC backups, financial state and archived workers are preserved.

### Recovery and rehearsal

The web candidate accepts optional
`VITE_AE_ADMIN_RECOVERY_DEPLOYMENT_URL`, retaining the existing browser journal
namespace when the current Convex URL changes. For this data lineage it must
remain `https://cautious-zebra-473.convex.cloud`. It carries no authority: the
current server still validates actor and operation correlation. Migration/remount
regressions prove retained same-actor recovery and no duplicate execution;
independent Sol review found no material defect. This binding and
`CONVEX_SITE_URL` participate in URL validation and configuration fingerprinting.
Regenerate readiness evidence; preserve historical purchase hashes and identity.

A native census covers the root and all 18 deployed components. The rehearsal
observation found no pending/in-progress scheduled functions, 25 terminal Calls,
three terminal Plans, one completed Workflow and four empty Workpools. The two
future credentials are API keys without interactive-expiry materialization.
All 18 root cron records had pending next runs and completed last runs. This
is point-in-time evidence, not the final freeze; repeat after pausing source
execution. Pending funding and failed Stripe inbox records need preserved
continuation ownership, not blind replay.

Sydney demonstrates code push, import, export and ordinary-query refusal while
natively paused. Source snapshot `1791514139509132865` includes application,
component and storage data. Restore, re-export and full archive equality remain
in progress. No production secrets or application execution are enabled on the
target. Running copied code would also enable crons; stopped Workpools alone
are not an execution barrier.

Focused verification passed 172 tests and `npm run check`. The first full gate
passed 9,675 unit tests but timed out in the existing 10,000-record usage-report
case at 90 seconds. Its entire five-test file passed alone in 44.9 seconds.
A complete gate rerun uses Vitest's supported four-worker limit, preserving all
assertions and timeouts. The failed run is retained; the rerun is not yet a pass.

Remaining cutover gates: archive equality; permanent target identity; final
worker/cron/financial freeze; coherent web/browser/site/bridge bindings;
retained-client refusal/reload; source release gate; and actual regional
measurements. Old production is a rollback source only until new consequential
work occurs. Alchemy and Admin-only payment eligibility are unchanged.


### Final cutover and live verification

**Completed 9 October 2026.** The source pause began at 03:20:30.556 UTC;
Sydney resumed at 03:38:39.826 UTC (approximately 18 minutes, 9 seconds).
All ordinary source requests still refuse execution. Sydney is permanent
production with no expiry and is now the default. The reviewed Vercel candidate
was promoted before Sydney resumed. Its custom alias, release identity, compiled
browser URLs, site URL and stable browser-recovery namespace were verified.
Production project bindings and the GitHub production deployment key now target
Sydney; keys and environment values are not recorded here.

The final pause census covered root plus all 18 components with zero pending or
in-progress scheduled functions. The three existing batch workers were stopped;
the notification worker remained absent. All 18 root crons had pending next runs,
with no in-progress run at the freeze. Native deployment pause supplied the
execution barrier throughout export, import and comparison.

| Frozen archive evidence | Result |
| --- | --- |
| Source snapshot | `1791516095352967219` |
| Restored snapshot | `1791516612868970277` |
| Existing full comparator | Matched: 248 tables, 307,930 exported records, eight stored files, 467 archive members |
| Source ZIP SHA-256 | `3ff9eced488f7023f88ed0d536fa1d9195d9ff70f60f9c67345a0184c0d1d440` |
| Restored ZIP SHA-256 | `65fbbfef32bc6faa4c534876a9abed17cdc7e8ff53039f8918b7c331d8b183e1` |

The comparator's default 128 MiB member limit rejected the existing 296 MB
catalogue table. Its supported bounded override (384 MiB member, 600-second
comparison deadline, 60-second command deadline) completed with identity,
content, schema, archive membership and storage checks unchanged. The initial
refusal and successful receipt are retained. Different ZIP hashes are expected;
record and stored-file equality, not ZIP container equality, is the acceptance.

The frozen disposition retained 25 terminal Calls, three terminal Plans, a
completed purchase Workflow and financial records unchanged. The one pending
funding command is sandbox, with expired Checkout/recovery time; no production
funding command was pending. Six failed Stripe inbox records refer to absent
funding commands and were preserved without replay. The pending daily-close
signature and four treasury alerts remain owner work. Two unexpired API keys
use read-time expiry; no missing expiry job needed recreation.

Before starting each existing worker, native empty enqueue refreshed its
copied deployment-local function handles while it remained stopped. Native
status and work queries passed, then all three workers started. The initial
post-resume assertion requiring zero work failed: enabled root crons had already
created a new `x402DirectoryIndexRefresh:scan`. Native component inspection
confirmed page 0 completed successfully and page 100 progressed under the new
workflow. The historical purchase Workflow stayed terminal and all 11 historical
steps stayed inactive. Independent review confirms this establishes new-work
progress; it does not establish completed catalogue refresh or financial
execution. The initial failed assertion is retained, not relabelled as a pass.

Live checks establish:

- Production alias points at `dpl_DWQJGdALwj3BhFWiN21W6YUPoZkb`; liveness returns
  200 and the public release reports the reviewed source.
- `/api/ready` identifies Sydney and passes configuration/Convex checks. A fresh
  owner readiness refresh passes web identity, Formance, CDP custody, commercial
  policy and reference rate. Base RPC reports `treasury_chain_unavailable` and
  treasury reports `treasury_reconciliation_stale`; readiness remains 503.
  Alchemy, custody limits and Admin-only eligibility are unchanged.
- A document request carrying the old Vercel deployment cookie returns 200 and
  replaces it with the new deployment cookie. This is native HTTP evidence, not
  a signed-in retained-browser journey. Codex computer use was unavailable.
- The first cron read observed 14 successful last runs, two cancelled last-run
  records and two with no last run; all 18 had pending next runs. No blanket
  scheduler or provider-recovery acceptance follows from this point observation.

### Measured improvement and remaining limits

Fifteen interleaved warm native backend reads of the same records from Perth
measured median 326 ms in Virginia and 103 ms in Sydney, with no failures and
matching record digests. This measures the regional read path, not browser
navigation or payment execution.

Six HTTP samples per public route, including the first cold observation, used
the same routes before and after. Warm medians are diagnostic response-start
samples from Perth; they do not establish a p95 or usable-content target.

| Public HTTP path | Before warm median | After warm median |
| --- | ---: | ---: |
| `/market` | 264 ms | 286 ms |
| `/market?view=tools` | 514 ms | 326 ms |
| `/market?view=providers` | 502 ms | 342 ms |
| `/api/v1/catalogue-status` | 756 ms | 380 ms |

The first post-promotion Market response took 4.43 seconds; a subsequent Tools
sample took 3.14 seconds. Keep those failures visible. Cold startup, hydration,
protected-screen latency and the agreed navigation percentiles remain open with
Web/DX. Moving the database improved several reads; it did not close them.

The complete release gate passed with `VITEST_MAX_WORKERS=4`, using unchanged
assertions/timeouts: 9,676 unit tests, 3,133 integration tests, 76 import tests,
20 browser and 20 accessibility cases, CLI packaging and the generated docs
build (228 pages, 84 owner examples). Existing skips/todos do not qualify hosted
behavior. The earlier unit timeout, its standalone passing file, full rerun and
172 focused passes remain in the evidence bundle. Subsequent closeout edits are
records only; they do not change the reviewed/deployed runtime tree.

### Recovery boundary and follow-up owners

Sydney now owns new execution and state. **Fix forward. Do not resume Virginia
or promote an old web build that reconnects it.** The frozen source, final native
archives and retained web deployment are recovery evidence, not an automatic
rollback recipe. A financial restore requires the existing coherent
Convex/storage/Formance reconciliation procedure and an explicit recovery
boundary. Retained records do not qualify that procedure by themselves.

Web/DX owns cold/hydration and authenticated compatibility acceptance; Money and
infrastructure own RPC readiness and joint financial restore (MM-041/MM-042);
the existing operations owner retains host replacement and acknowledged
service-origin alert tests. No paid Call, historical purchase-work replay, Alchemy upgrade, authority
expansion or new permanent AWS stack ran in this migration.

Private execution evidence remains outside Git under
`performance/sydney-migration-2026-10-09/` in the execution workspace:
`final-comparison.json`, `source-freeze.json`, `frozen-census.json`,
`default-switch.json`, `target-resume.json`, `target-resume-verification.json`,
`live-health-initial.json`, `live-cutover-verification.json`,
`payment-readiness-after.json`, `public-http-before-valid.json`,
`public-http-after.json`, `gate-receipt.json`, and scoped AWS receipts.

## 9 October Sydney health follow-through candidate

Baseline at 04:53 UTC still resolves production web and Sydney backend to
`7d4eba169`. Health is 200; configuration and Convex readiness pass; payment
readiness is 503. Direct read-only probes found Infura responding and Alchemy
returning HTTP 429 with exhausted monthly capacity. The 8 October Infura daily
quota notice does not establish its current state or explain a Tool-detail
timeout. Alchemy remains unchanged under Joel's explicit instruction.

The 05:07 UTC native treasury readback distinguishes matched funding and
reservations from unavailable payment receipts, chain evidence and cash
attribution. Available ledger/spend projections are not a substitute for those
missing checks. No financial difference, recovery success or healthy payment
state is inferred from an unavailable result.

At 05:21 UTC the existing host is SSM-online and all eight CloudWatch alarms
are OK. Six recent five-minute samples show host CPU below 10%, memory below
14% and disk below 16%; RDS CPU is below 6%, with about 3.07 GB free memory and
49.67 GB free storage. RDS is private, encrypted, deletion-protected and
Multi-AZ, with seven-day retention and a latest restorable time of 05:11:41 UTC.
These observations provide no evidence for a host/database capacity upgrade;
alarm state does not prove notification delivery or recovery.

### Bounded source repairs

- The treasury receipt audit already owns two attempts. Pinned viem's transport
  adds three retries by default, allowing eight physical requests per failing
  method/provider. Only this audit now selects transport `retryCount: 0`.
  Its explicit retry, total budget, two-provider agreement, 12 confirmations,
  identity and freshness remain unchanged. Other execution/recovery callers
  retain their original transport policy. Offline real-transport regression
  demonstrates four versus one HTTP request per invocation; 86 focused tests
  pass, with independent review.
- HTTP admission uses existing 12-second bounded waiting and request
  cancellation, including signature acquisition and response-body consumption.
  Late signing cannot initiate quota writes; late admission cannot dispatch the
  operation. A remotely accepted quota debit cannot be undone by abort. No
  automatic retry is added. Existing 503/429 outcomes remain; 23 focused tests
  pass, including actual SDK cancellation and both admission branches.
- Agent-directory authentication and canonical reads share the source deadline.
  Optional policy/activity reads now use the existing three-second enrichment
  bound alongside keys/connections. Canonical identity survives optional
  failures, authority/usage remain unavailable, and unfinished Convex reads are
  aborted on completion. Request cancellation prevents returning a stale private
  projection. Clerk SDK work may not be cancellable; waiting is bounded. The
  existing directory and owner-console suites pass 40 tests, including a
  review-discovered cancellation race corrected by lazy enrichment dispatch.
- Public Tool detail retains its loaded descriptor if optional listing evidence,
  Provider-link verification or display FX exceed three seconds or the remaining
  page deadline. Essential reads still time out; visitor cancellation still
  rejects, including a reviewed primary-settlement race. Missing enrichment
  stays absent rather than implying performance, price or Provider identity.
  The inspected evidence query is indexed and bounded; this containment defect
  does not establish the cause of the inaccessible historical Sentry event.
- PostHog's existing singleton now receives the official Vercel `waitUntil`
  helper (`@vercel/functions` 3.9.11, Node 22 compatible). The installed SDK owns
  batching and debounce; capture does not await network work. Its send timeout
  is five seconds with no immediate transport retries. Network-failed batches
  can remain in the SDK queue for a later flush; this is best-effort telemetry,
  not durable event delivery. No event fields, opt-out, sanitization or explicit
  feedback acknowledgment change. Controlled-transport tests with the pinned
  SDK cover concurrent captures, later batches, held responses and cancellation.
  Hosted lifetime and ingestion still need independent qualification. The
  current Nitro Node adapter does not expose `Request.waitUntil`; the official
  provider helper avoids relying on that absent adapter hook.
- TanStack's supported splitting moves eligible loaders and pending UI into
  route chunks. A retained failed build identified the installed compiler's
  unsupported object-form Activity loader. A supported route-specific exception
  preserves its `staleReloadMode: 'blocking'`; no handler rewrite is used.
  Operator guards, Market disclosure/preload policy and recovery remain intact.
  Independent emitted-code review finds RPC stubs in split client loaders and
  matching SSR registrations, without inspected server implementation markers.

| Build measure | Before | Candidate |
| --- | ---: | ---: |
| Main client entry | 325,782 B | 237,597 B |
| Full client static dependency graph | 1,412,088 B / 137 files | 1,384,768 B / 141 files |
| Summed gzip of that graph | 461,794 B | 455,763 B |
| Full SSR router static dependency graph | 15,285,672 B | 15,212,090 B |

The client entry decreases 27.1%, but total static bytes decrease only 1.94%
(summed gzip 1.31%). Additional lazy requests may offset savings. These are build
measurements, not browser timing acceptance. Pending-only splitting increased
summed gzip and was not selected. Existing Node externalization warnings were
identical across the previous successful build and failed candidate.

References: [TanStack supported splitting](https://tanstack.com/router/latest/docs/guide/automatic-code-splitting),
[viem custom-transport retry semantics](https://viem.sh/docs/clients/transports/custom).
[Vercel request lifetime](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil)
and the installed PostHog 5.39 SDK's native `waitUntil` option govern telemetry
flushing; no custom scheduler or per-request SDK shutdown is introduced.
No financial data/schema migration, cache of payment truth, provider failover,
allowance change, new credential or infrastructure subscription is included.

The first configured full gate passed 9,690 unit tests but exposed three
intermittent integration failures. Independent review traced real DNS/demo-host
traffic in two preexisting fixture files: a registered owner probe timed out,
and a scheduled probe outlived the isolation fixture's timer pump. Focused and
whole-integration reruns passed, but did not erase that failure. File-scoped DNS
and guarded-HTTP fixtures now supply deterministic unavailable responses while
retaining registered authorization/probe code, valid/invalid 402 assertions,
environment-isolation checks and empty purchase/payment tables. Scheduled work
is drained before restoring fixtures; no timeout is raised and no production
logic is bypassed. The owner outcome is asserted as `health_unhealthy`, its
actual domain refusal for the simulated HTTP 503. The corrected six cases pass.

### Remaining access and recovery boundaries

The supplied Sentry issue could not be accessed with available authorized tools.
A bounded current-deployment Vercel log query returned no entries; that does not
prove the historical issue fixed or establish its cause. Codex's browser plugin
is installed but its required execution tool is unavailable in this session;
Orca is not a substitute. Signed-in, two-Account and retained-browser acceptance
remain open, separately from source tests and HTTP probes.

The native AWS readback finds one private Multi-AZ PostgreSQL 16.13 RDS instance,
`ae-alpha-formance`, with 50 GB gp3 storage and current PITR. No disposable target
exists. The maintained joint restore needs an isolated temporary RDS target,
managed credential and scoped host-role permissions, plus a coherent writer
fence and Convex/storage/Formance cutoff. It cannot reuse the migration's Convex
archive with an unrelated current ledger baseline. Execution effects must stay
blocked; never overwrite production or resume Virginia.

For review only, official Sydney prices imply approximately US$0.45 for four
hours of Single-AZ db.t4g.medium, 50 GB storage and one prorated secret, before
CPU surplus, logs, KMS, transfer and tax. Maximum continuous surplus CPU would
add about US$0.60 over four hours. This is not a hard billing cap; approve exact
temporary resources, log bounds, permissions, cutoff and teardown before running
the drill. The existing no-new-spend/access restriction prevents execution now.
The obsolete `aws-foundation.md` link in the infrastructure README is replaced
with an explicit missing-gate warning and current authority/evidence links;
the historical production root is not authorized for replacement provisioning.

Pricing evidence: [RDS Sydney offer](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-southeast-2/index.json),
[CloudWatch Sydney offer](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonCloudWatch/current/ap-southeast-2/index.json),
[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/).

### Final source qualification

On 9 October, `npm run check` and the complete `npm run gate` passed using Node
22, npm 11.5.1, declared development/sandbox and four Vitest workers. The gate
passed 9,697 unit tests, 3,134 integration tests, type/import/security/SEO checks,
20 browser journeys, 20 accessibility checks and the installed CLI package.
The docs build verified 228 pages and 84 owner examples including emitted
resources. One unit test, 77 integration cases and 18 browser cases stayed
skipped; three integration TODOs remain. These exclusions are not acceptance
of authenticated, native-provider or hosted recovery behavior.

Independent Sol reviews cleared the final retry, cancellation, route-splitting,
Tool containment and telemetry changes. Real-SDK telemetry tests use a controlled
transport, without sending events. Earlier failed and interrupted runs remain
recorded, including restore-script timeouts during the workstation-disconnection
period; the final complete gate passes those tests without changing their limits.

Before release, native readback at 06:09–06:14 UTC confirmed default Sydney
production at source `7d4eba169` and Virginia's paused refusal. The candidate
was based on main `1a8457b604`. Private evidence, the owned-path patch, source
digests, retained failures and complete gate log are in the existing workspace's
`performance/health-followthrough-2026-10-09/`.

### Follow-through release and live verification

Joel authorized one temporary release branch, with deletion after merge.
[PR #378](https://github.com/CreasyBear/Agentic-Economy/pull/378) merged the
independently reviewed 24-file candidate as `40789ec3e`. Backend and web were
built from an immutable archive of `d3c9061f4297a5d56e2f84379c20cdf86572f56a`;
owned-file digests matched the gated candidate. The merge has the same runtime
tree. Sydney Convex deployed successfully before the web promotion. Its
`AE_RELEASE_SOURCE_REVISION` binding was read back as that exact revision.

The Vercel production candidate `dpl_2qcjc45uo7dZP3u8P1GrfiJ2fs28` was READY
in `syd1`, Node 22, before promotion. Read-only checks used the existing
automation access without creating or rotating a bypass. At 06:34 UTC the
public `app.aecon.ai` alias resolved to that deployment, `/api/v1/release`
returned the expected revision, and `/api/health` returned 200. `/api/ready`
returned 503 `payments_unavailable`, with configuration and Convex ready.
The original browser-recovery namespace is unchanged. At 06:36 UTC an
authenticated application query to Virginia still refused as paused. System
environment reads remain available on a paused deployment and cannot prove
application execution is enabled; anonymous application errors omit the reason.

Six bounded native HTTP rounds from the same Perth workstation returned 200
for all 24 requests. Warm response-start medians were 222 ms for Market,
265 ms for Tools, 454 ms for Providers and 453 ms for catalogue status. First
requests were 364 ms, 1,174 ms, 592 ms and 444 ms respectively. These are
connection-to-response diagnostics, not browser navigation, hydration, cold
isolation or p95 acceptance. The earlier misses remain in the cutover receipt.

The 06:38 UTC treasury readback includes the normal 06:29 and 06:34 cycles after
backend deployment: funding and reservations match, ledger/spending reads are available,
and chain, settlement receipts and cash attribution remain unavailable. No
forced audit or paid Call ran. These are scheduled-cycle observations, not
sustained payment health or a financial reconciliation pass.

Application-code rollback retains the previous Sydney web deployment
`dpl_DWQJGdALwj3BhFWiN21W6YUPoZkb` and runtime source
`7d4eba16926e870fbe5dda4ab0999b18d4b04b7c`. Verify backend compatibility before
promoting old code; if a backend correction is needed, use the existing Sydney
deployment. Never resume Virginia, restore financial data or repeat an accepted
purchase to roll back code. Financial correction remains append-only/fix-forward.

No provider allowance, credential, financial policy, AWS resource or audience
changed. Payment readiness, hosted browser/Account and retained-operation
qualification, hosted PostHog ingestion, historical Sentry attribution, joint
financial restore, host replacement and service-origin alert acknowledgment
remain open with their existing owners. This release does not close MM-004,
MM-041, MM-042 or authorize alpha invitations.
