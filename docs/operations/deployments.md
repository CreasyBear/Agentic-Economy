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
