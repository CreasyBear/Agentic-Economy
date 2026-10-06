# Deployment map

**Last verified:** 6 October 2026, after PR #362. This is a dated inventory;
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

| Surface | Verified source / identity |
| --- | --- |
| Production web | `/api/v1/release` reports `df0d360cbc1951ed84a5bf68f4f434a23235baa0`; Vercel `dpl_BTM3VpsW3Ppayx8Gzbe1RbXP1YE4` after PR #362 |
| Production Convex | `cautious-zebra-473`; source `5d4e32c04ccf17790a411b089e0fad91f6f1c742`, deployed 6 October at 03:59:41 UTC |
| Chat/MCP acceptance baseline | PR #359 runtime tree `bf8e246d28121e3753ade6dad12421f6ab10d2b1`; web `81124766527c30f0cf3b6ee941a9ad7f2088e163` and Vercel `dpl_3xt4Wjed5sfTMg8gASAVTJE2xUS4` |
| CLI distribution | Hosted 0.3.0 archive verified byte-for-byte for paid Plan acceptance; 0.3.1 source repairs bounded watch recovery. Registry publication/readback is recorded separately in the release PR. |
| Plan ledger | Additive v1.7.0 installed/read back at 03:55:24 UTC; digest `sha256:c47ed17051aecfc2b0ad86bbeabc385d841a04774667098528ed5ffb1ff740a4` |

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

## Historical inventories

The [prior deployment map](../archive/2026-10-05/operations/deployments.md) retains
earlier releases and observations. The [archive index](../archive/README.md)
locates older inventories and local recovery context. Retained checkouts and
retired projects are not additional approved deployments.
