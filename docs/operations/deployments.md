# Current deployments

Verified source baseline and production observation: **5 October 2026**.
This is the canonical deployment map. [TODOS.md](../../TODOS.md) owns the current
queue; [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256) owns
alpha decisions. Detailed historical evidence remains in the
[readiness record](../production-readiness-plan.md).

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

## Consolidated release

`main` is the single merged source baseline. Vercel automatically builds web;
Convex must be deployed separately when backend contracts change.

[PR #353](https://github.com/CreasyBear/Agentic-Economy/pull/353) repairs historical
snapshot cutoffs and bounded retry after booked checkpoint advancement.
[PR #354](https://github.com/CreasyBear/Agentic-Economy/pull/354) integrates usage
metering and accepts independently verified empty finalized chain ranges without
rewriting the booked history. Quorum, freshness, transfer completeness and exact
balance checks remain mandatory. A self-transfer with zero net movement is not
an empty range.

PR #354 backend source `9ecb85f021fd81d6aa723a4cc28dc70c0d87e6d3` deployed at
07:41:53 UTC. Web release readback confirms merge
`a1d9d2d09953681a99db7a4b729ffb77e2c667b7`; its tree matches the gated source.
The full gate passed: 8,952 unit and 3,024 integration cases, type/import boundaries,
31 SEO proofs, 16 browser journeys, 18 accessibility cases, installed CLI and public
build. Existing skipped/unfinished protected cases are not acceptance evidence.

[PR #355](https://github.com/CreasyBear/Agentic-Economy/pull/355) incorporates the
founder console; backend source `ab8b30e25281982b28dbf1981b82b371aa26759d` deployed
at 08:51:22 UTC. [PR #356](https://github.com/CreasyBear/Agentic-Economy/pull/356)
repairs the responsive Find Tools trigger. Its web merge
`0bcfebe4843f362824c5cb4b975fc7ece5f800dc` was verified on the production alias,
with Vercel deployment `dpl_9P1CSuvAGpN1mhP5ueSLzYfM9aB2` retained for recovery.
The founder [design contract](../designs/2026-10-01-founder-console.md) records
the preserved boundaries. Final subsequent source provenance belongs in the
release PR and the deployed `/api/v1/release` response.

The next chat repair covers the observed guest 404, draft recovery, compact
discovery cards, immediate comparison and invalid model control text. The
production Vercel `CONVEX_SITE_URL` binding is now the canonical
`https://cautious-zebra-473.convex.site`; this takes effect on the next web build.
The existing proxy secret and guest read-only admission remain unchanged. The
[walkthrough contract](../designs/2026-09-23-generative-commerce-chat-rfc.md#5-october-2026-walkthrough-repair)
defines this bounded repair; it does not activate the RFC's broader proposals.
Verify both the guest web proxy and signed-in journey after backend and web
deployment before calling this repair accepted.

Metering uses the existing Tool → Quote → Call and financial authority. It adds
exact unit measurements, complete-period reports, frozen close lineage, usage
statements, scoped credential reporting, forecasts and opt-in alerts. No historical
backfill has run; automatic monthly scheduling is inactive; external meter shadow
integration is disconnected. See the [implementation evidence](usage-metering-completion.md).

## What has actually been accepted

- Twenty real Base-mainnet payments across five published Tools through the
  authenticated CLI. Fully paginated readback joins original Calls, obligations,
  ledger and chain receipts. Gross buyer Charges were AUD 0.033209, refund
  AUD 0.001444, Provider payments USDC 0.023000. These were promotional-credit
  purchases, not verified paying-Customer traction.
- Pause/refusal, exact replay during pause and owner-MFA resume to Admin-only
  payments; live uncertain-payment recovery and unused-authorization release.
  Controlled failures use a real isolated native Formance ledger and explicitly
  mocked external boundaries. See [the precise scope](../production-readiness-plan.md#twenty-real-mainnet-payments).
- Production owner sign-in, MFA, signed webhook admission and real session
  revocation/re-sign-in; protected review and audit of a real paid Call.
- Native RDS and complete Convex/storage restores for recorded targets/cutoffs;
  versioned financial-evidence archive/readback and a retention drill. These do
  not establish a joint restore of the new mainnet purchases or continuous
  automated archive export.

## Current limits

The production payment audience is `admins`, revision 2. Screening is deliberately
`alpha_not_screened_v1`: payees are **not screened**. Existing custody limits remain
USDC 0.5 per Call, USDC 10 platform daily, USDC 2 per payee daily and USDC 0.5 for
first use of a payee. Funding does not expand authority.

Nine consecutive scheduled treasury checks after PR #354, from 07:44:37 to
08:24:28 UTC (39 minutes 51 seconds), match 44 cash records, 20 settlements and
21 reservations, with zero difference and no liability. This spans the 20-minute
evidence-expiry window.
A separate readiness probe still intermittently reports `treasury_chain_unavailable`;
the signed-in Admin page correctly withholds Ready during that failure. Do not
relax timeouts, quorum, freshness or evidence checks to obtain a green status.
Final sustained observations belong in the consolidation release's acceptance record.

[#288](https://github.com/CreasyBear/Agentic-Economy/issues/288) remains Joel's alpha
go/no-go. [#279](https://github.com/CreasyBear/Agentic-Economy/issues/279) retains the
separate paid Base Sepolia chat journey. Public `@aecon/cli` npm lookup returns 404
on 5 October; installed-package verification and real CLI use are distinct from
publication. No additional spending, user invitations or rollout of background
reporting is implied by this release.

## Release and recovery routine

Use Node 22 / npm 11.5.1 locally; retain Vercel's approved npm 11.19.1 install
command. Run `npm run check`, affected behavior tests and `npm run gate` on the
frozen candidate. Verify backend target/configuration through the native CLI,
deploy that exact source, merge by matching head, then verify the web alias and
release revision. Read health, readiness and relevant signed-in journeys separately.

Preserve the previous source and provider deployment references. Financial
correction is append-only; fix forward after value-bearing transactions. Never
restore a database or ledger merely to roll back application code. GitHub source
workflows remain manually disabled; Vercel build success alone is insufficient.

## Historical inventories

The [previous deployment map](https://github.com/CreasyBear/Agentic-Economy/blob/a1d9d2d09953681a99db7a4b729ffb77e2c667b7/docs/operations/deployments.md)
preserves retired project identities, earlier Arc release records and the staged
production setup. Its dated statements that custody is disabled, wallets are
unfunded or the production ledger is empty are superseded by the acceptance above.
Retained local recovery checkouts are not additional approved deployments.
