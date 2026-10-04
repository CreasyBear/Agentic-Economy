# Current deployments

Production application acceptance updated on **4 October 2026, 15:05 UTC**;
the wider deployment inventory below dates from 2 October. This is the current
deployment map. [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256)
owns the real-money alpha work; [the readiness record](../production-readiness-plan.md)
holds the implementation and release evidence.

## Keep these destinations

| Purpose | Address | Vercel project / environment | Backend |
| --- | --- | --- | --- |
| Marketing website | `https://aecon.ai` | `agentic-economy-website` / Production | Separate website repository |
| Production application | `https://app.aecon.ai` | `agentic-economy` / Production | Configured for Convex `cautious-zebra-473` |
| Isolated staging application | `https://staging.aecon.ai` | `agentic-economy` / `staging` | Convex `courteous-finch-213`; development declaration and sandbox payments |

Production and staging use **one Vercel project with separate environments**.
A branch Preview is a deployment within that project, not another application
project. Vercel's “Production” label does not establish real-money readiness.
The website is a separate application and repository.

`main` is the merged source baseline. Vercel automatically builds its web
deployment. **That does not deploy Convex**: a release that changes backend
contracts needs the matching backend release and verification.

## Latest production acceptance — 4 October 2026

Frontend update verified on **5 October 2026 Perth**: [PR #344](https://github.com/CreasyBear/Agentic-Economy/pull/344)
is live on READY Vercel deployment `dpl_6NZpfPB2EuFtrsKVXjsZ4XfXWHBV` in
project `prj_dK5mDpjBYuAXMwvLr0pWO0h8DoH9`. The `app.aecon.ai` alias and release
endpoint confirm `e310e1e111260a2b38cfecb6f8d7a79520880075`, whose tree equals
the gated source. Health is HTTP 200; readiness currently returns HTTP 503 /
`payments_unavailable`, with config and Convex ready. The Arc Agent setup update
changes frontend presentation/navigation only. It does not redeploy Convex or
establish native OAuth or financial acceptance. The exact gate and preservation
evidence is in the [Arc protocol](../designs/arc-ui-refactor/protocol.md).
The preceding READY frontend `dpl_FdLPCJgNiYMVyga5MJ2f9n9cXvdo` is retained as
the rollback point. The financial acceptance below remains dated evidence.

[PR #339](https://github.com/CreasyBear/Agentic-Economy/pull/339) is deployed to
Convex `cautious-zebra-473` and Vercel Production. The application release
endpoint confirms `2fe3a0dd90e0b80b60dc8da70d449794ccfdd2c1`, matching the backend
deploy completed at 14:54:54 UTC. The merged tree equals the gated tree.
Node 22/npm 11.5.1 `npm run check` and `npm run gate` pass: 8,516 unit tests,
2,891 integration tests, 16 browser journeys, 18 accessibility cases,
type/import/SEO checks, CLI packaging and the public build. Existing skips and
todos remain outside this proof.

**Twenty real mainnet payments are reconciled across five Tools.** The connected
CLI completes the purchases; native Formance and both RPC providers verify every
original settlement and transfer. An earlier expired unused authorization is
excluded from the 20. Gross Provider spend is USDC 0.023000, leaving USDC 9.882153
in the wallet: USDC 9.382153 available plus the protected USDC 0.500000 buffer.
Buyer Charges total AUD 0.033209; one AUD 0.001444 report refund leaves net use
of AUD 0.031765 and promotional credit of AUD 4.968235. All holds and signing
liability are zero. The credit expires 5 October at 12:45 Perth time.

The deployed automatic treasury audit matches all 20 settlements, 44 cash
records and 21 reservations at 14:55 UTC with zero cash difference. An ordinary
readiness refresh passes at 14:57 UTC after a separate transient RPC failure.
The later scheduled 15:04:51 audit and readiness refresh also pass.
Both RPC providers, confirmation requirements, source stability and audit
bounds remain enforced. Readiness is point-in-time: RPC failures can still
refuse new purchases, and the observed CLI recovery path takes 72–132 seconds
for the final nine Calls.

The live pause drill passes after owner MFA: new Quotes refuse and completed-key
replay returns the original receipt. Fresh owner MFA completes resume at
15:05:03 UTC, restoring only the saved `admins` audience. Both state transitions
have exact native audit records. No alpha invitations or audience
expansion are authorized by this record. The test Agent retains AUD 1 per Call,
AUD 5 daily and AUD 20 monthly authority; custody limits remain unchanged.

Protected founder review, manual close and usefulness feedback are proved on
a real paid Call with native audit readback. Nine failure scenarios pass against
native Formance with controlled Provider/custody/RPC fixtures; live evidence
separately covers uncertain-payment recovery, expired unused authorization,
same-key replay, pause/resume and the owner report/refund flow. The induced failure
fixtures are not described as live mainnet Provider failures.

The earlier model-credential blocker is repaired. Paid chat completion and the
separate Base Sepolia development journey remain unverified. Screening remains
explicitly deferred under `alpha_not_screened_v1`; this is not a screened result.
The founder's alpha go/no-go remains open. Stage 68 of the readiness record holds
the exact proof and limitations.

The 30-day application-content policy, protected review and 90-day content-free
learning signals are deployed. Isolated native cleanup proves eligible content
and embedding deletion while preserving pending Calls and financial records.
The private financial archive has verified 2,557-day governance retention,
governance-bypass refusal, legal-hold behavior, access isolation and signed
Account-close/policy readback. The actual RDS and Convex/storage restore drills
pass for their recorded historical cutoffs; they do not restore these new
mainnet payments. Independent Provider retention remains outside AE's control.

## Retired in this cleanup

- `agentic-economy-sandbox-tools`: obsolete Package 5 reference-provider fixture.
  Its configured root, `tools/release/package5-reference-provider`, was deleted
  from source. This caused the separate failed GitHub/Vercel deployment check.
- `agentic-economy-package4-release`: old synthetic release web application.
  Its web project had no attached Marketplace resources or customer domain.
- `deepsec-agentic-economy-829691ff`: empty temporary security project, with no
  deployment target, environment variables or repository connection.
- 22 GitHub branches whose exact heads are ancestors of `main`.
- Four empty GitHub environments for sandbox-tools / package5-reference-provider.
- Five historical one-time production workflows whose files no longer exist
  on `main` were disabled. Their run history is retained.

This retirement removed web projects and obsolete GitHub references. Convex
data, Formance ledgers, custody wallets, provider credentials and backups were
not deleted. The Package 4 AWS/ledger footprint requires its own current census
before retirement; deleting its Vercel frontend does not decommission it.

## Retained work and older sites

- [Founder console PR #290](https://github.com/CreasyBear/Agentic-Economy/pull/290)
  now targets `main`; it remains open and unmerged.
- PRs [#226](https://github.com/CreasyBear/Agentic-Economy/pull/226),
  [#239](https://github.com/CreasyBear/Agentic-Economy/pull/239) and
  [#242](https://github.com/CreasyBear/Agentic-Economy/pull/242) contain unmerged
  commits. Their branches and PRs remain intact pending disposition.
- Active local worktrees, Arc work, the backup branch and the backup repository
  remain intact. A remote branch's removal does not remove its local worktree.
- `the-agentic-economy` still serves `agentic-economy.ai` and
  `www.agentic-economy.ai`. `routing-provider` is an older live provider with a
  possible discovery binding. Neither was treated as a disposable fixture.
- RENOZ, Easel and Handshake projects are outside this cleanup.

## Historical baseline — 2 October 2026

The following records the earlier setup and recovery sequence. The latest
production acceptance above supersedes its deployment, funding and readiness
status; recovery evidence remains limited to the exact targets and cutoffs below.

The 2 October inventory found two distinct failures:

1. **Server bundle failure:** the main web deployment built successfully but
   every diagnostic request returned HTTP 500 because of an undefined
   `ssr_exports` export. The bundled Rolldown dependency was 1.2.5. The cleanup
   change updates it within the existing dependency range and checks emitted
   server modules as part of every build. Acceptance is recorded in Stage 42
   of the readiness record.
2. **Production binding gap:** the initial inventory had no
   `AE_DEPLOYMENT_ENVIRONMENT` declaration. Stage 43 sets it to `production`
   in Vercel Production and Convex `cautious-zebra-473`, and deploys the current
   backend. Stage 48 deploys the historical-environment safeguards and binds
   the clean `agentic-economy-production` ledger at
   `https://formance-alpha.aecon.ai`. Native backend health and complete empty
   ledger readback pass; this does not establish full money readiness.

Stage 43 also enables Clerk authenticator/backup-code support, stores the
production identity and authority settings in Infisical, aligns the Vercel
authority bindings, and creates an isolated, unfunded CDP production project.
Stage 46 creates its unfunded wallet and verifies the approved signing policies;
temporary policy-management access is now removed and native readback still
verifies the wallet and policies. Stage 48 binds those credentials and all four
approved custody limits to Convex and Vercel Production. Signing remains disabled
and the wallet unfunded.
Stage 47 separates signed Clerk callback admission from incomplete money setup;
the provider-native production example now returns HTTP 200 accepted/ignored
through the actual Svix verifier and Convex assertion. This does not prove a real
bound-user revocation or owner MFA enrollment.

The existing AWS Formance footprint is `ae-alpha`: one private host and a
Multi-AZ RDS database, with nightly Melbourne backup copies. Repairing the
CloudWatch Agent configuration restored disk/memory observations and all eight
alarms are currently OK. The restored email subscription is confirmed. A
controlled CloudWatch alarm delivered one SNS notification with zero failures,
and metric evaluation restored OK after 102 seconds. Inbox receipt remains
unproved. The actual cloud restore rehearsal passes for
the selected historical Formance ledger, as recorded below.
Joel selected one production-only AWS footprint on 2 October: reuse the existing
host, RDS and Formance service; retain an independent sandbox backup and prove
restore before retiring the sandbox ledger. Production receives a clean ledger,
with no test balances carried forward. Stage 46 upgrades the existing engine to
Ledger 2.4.14, creates the clean production ledger and verifies an actual local
restore of the final source archive, including original-command replay. The
operator, worker, external tunnel and reconciliation timer are healthy. A new
production-only Cloudflare Access credential replaced sandbox access and is
verified in the production vault and existing AWS secret. Stage 48 binds it to
the production application and verifies native ledger health through Convex.
Stage 51 restores the historical alpha ledger from a native RDS point-in-time
restore at `2026-10-02T06:50:34.185Z`. Its 45 transactions, 53 accounts and two
schemas match the recorded baseline, and original-command replay leaves those
digests unchanged. Request-to-verification time is 39 minutes 21 seconds. This
proves the selected ledger at that cutoff; it does not prove a current-production
RPO or a complete Convex/storage restore. Authorized cleanup is complete: native
readback at 13:02 UTC confirms the temporary database, backups, snapshots,
network rules, policy, log group, managed secret, transfer object and host
runtime are absent. The source database and its seven-day backups remain intact.
Sandbox retirement remains pending.
No second permanent AWS stack is approved.

Next is [#286: wire production and pass readiness](https://github.com/CreasyBear/Agentic-Economy/issues/286):
Joel selected the existing AWS self-hosted Formance route. The production ledger
is provisioned, bound and verified empty. Backend `cautious-zebra-473` runs
Stage 55 revision `485ac3b4d65cdb7c759ef12fca53f6fd20e2bb12`, including financial
document attachment recovery. Vercel Production `dpl_C5ZxzNDDUUAzLNjCcWu5mkaR8xHp`
serves the same revision from [PR #307](https://github.com/CreasyBear/Agentic-Economy/pull/307).
This retains explicit owner bootstrap, commercial-policy review, protected chat
admission, enforced Clerk CSP and canonical HTTPS admission behind Vercel TLS
termination. Native release verification passes; release and health return HTTP 200. Readiness
remains HTTP 503 with custody disabled and the remaining money prerequisites
incomplete. The readiness record holds the source gate and native acceptance
evidence.
[#285](https://github.com/CreasyBear/Agentic-Economy/issues/285) tracks the remaining
foundation setup. Complete custody enablement/funding, two compatible RPCs,
screening, commercial policy, treasury, identity and backup/restore acceptance.
Infura and Alchemy now pass the actual Base-mainnet treasury observation,
including an agreed finalized checkpoint, balance and 2,000-block transfer range.
Joel completed Alchemy Pay As You Go setup; the US$1 account-wide monthly usage
cap is verified. Both endpoints are bound to the production vault, Convex and
Vercel setting; the Stage 55 production deployment consumes the updated setting.
Custody remains disabled and the wallet unfunded. Joel's selected owner identity is
verified and allowlisted, and real sign-in at 11:57 UTC is recorded in Security
activity. The first explicit Admin bootstrap was refused at web admission;
Stage 52 corrects Vercel's HTTP reconstruction after TLS termination without
relaxing same-origin checks. After Stage 53, the previously authorized owner
activation succeeds at 14:45 UTC and the production Admin dashboard opens.
Commercial policy and screening remain pending. Clerk's native readback at 13:18 UTC verifies
owner authenticator MFA and backup codes. The live session-revocation drill at
13:24 UTC records exactly one matching application audit event, revokes all
40 older interactive credentials for that owner, and returns the browser to
sign-in. The fresh MFA sign-in is observed at 13:31 UTC. Stage 53 replaces the
missing-token-claim assumption with a durable revocation cutoff and signed
session evidence checks. Production Profile, Chat and Admin access now pass;
all 40 original revoked credentials remain revoked and one current credential
is active. Native readback at 14:49 UTC confirms that web and backend identities
both select production and `cautious-zebra-473`. The web configuration check still
fails with `deployment_manifest_invalid`; its umbrella readiness error must not
be interpreted as proof of a backend mismatch. Then
[#287](https://github.com/CreasyBear/Agentic-Economy/issues/287)
proves the authorized real Calls and failure drills before
[#288](https://github.com/CreasyBear/Agentic-Economy/issues/288) permits launch.

The local `npm run gate` remains the source release gate. PR #304 removes all
pull-request workflow triggers. Kernel release gate retains release-tag and
manual triggers; React Doctor is manual only. Both remain manually disabled in
GitHub. The public CLI release workflow is unchanged. A Vercel build success is only build evidence; release,
readiness and the actual supported journeys must be checked separately.
