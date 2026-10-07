# Deployment map

**Last verified:** 6 October 2026, after PR #366. This is a dated inventory;
resolve current provider identities and source revisions before mutations.
[TODOS.md](../../TODOS.md) owns work; [readiness](../production-readiness-plan.md)
owns acceptance and its limits.

## Destinations and authority


| Purpose | Address | Provider identity | Authority |
| --- | --- | --- | --- |
| Marketing | <https://aecon.ai> | Vercel `agentic-economy-website`; separate repository | Public website |
| Production app | <https://app.aecon.ai> | Vercel `agentic-economy`, project `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`; Convex `cautious-zebra-473` | Explicit production declaration; Admin-only payments |
| Isolated staging | <https://staging.aecon.ai> | Same Vercel project, `staging` environment; Convex `courteous-finch-213` | Development declaration, sandbox payments; staging inventory last verified 2 October |
| Production ledger | <https://formance-alpha.aecon.ai> | Formance Ledger 2.4.14, ledger `agentic-economy-production`, existing AWS `ae-alpha` footprint | Production financial authority |
| Production identity | <https://clerk.aecon.ai> | Existing Clerk production instance | Signed identity, owner MFA and revocation checks |

Production and staging are separate environments within one Vercel project. A
branch Preview is not a separate application project. The existing AWS topology
is one private host and Multi-AZ RDS with independent backups; no second permanent
stack is approved. Resolve provider identities afresh before mutations.

## Accepted application release

The following acceptance evidence is dated 6 October 2026.

| Surface | Verified source / identity |
| --- | --- |
| Production web | `/api/v1/release` reports `31a06382c0644dfd0c66a794edf221fcbe606596`; Vercel `dpl_74cZ5bj8Za5pHjK8UHZsfxYRhXy8` after PR #366 |
| Production Convex | `cautious-zebra-473`; deployed PR #366 candidate `23d9dbb6c438eaf8cd67344d69919a1a06400c7b`, identical tree to merged source `31a06382c0644dfd0c66a794edf221fcbe606596`; release revision read back after deployment |
| Chat/MCP acceptance baseline | PR #359 runtime tree `bf8e246d28121e3753ade6dad12421f6ab10d2b1`; web `81124766527c30f0cf3b6ee941a9ad7f2088e163` and Vercel `dpl_3xt4Wjed5sfTMg8gASAVTJE2xUS4` |
| CLI distribution | Hosted and npm 0.3.1 archives verified byte-for-byte after PR #363, including installed CLI smoke. PR #364 prepares 0.3.2 with optional product feedback; its release PR records deployment and registry readback. |
| Plan ledger | Additive v1.7.0 installed/read back at 03:55:24 UTC; digest `sha256:c47ed17051aecfc2b0ad86bbeabc385d841a04774667098528ed5ffb1ff740a4` |

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

Production payments remain `admins`, observed launch-control revision 2.
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
