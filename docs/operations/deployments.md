# Current deployments

Verified against Vercel and GitHub on **2 October 2026**. This is the current
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

## Production is not money-ready yet

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
   backend. The existing Formance binding remains `sandbox` at
   `https://formance-alpha.aecon.ai`; production correctly refuses it. The
   declaration does not establish production money readiness.

Stage 43 also enables Clerk authenticator/backup-code support, stores the
production identity and authority settings in Infisical, aligns the Vercel
authority bindings, and creates an isolated, unfunded CDP production project.
Stage 46 creates its unfunded wallet and verifies the approved signing policies;
removing temporary policy-management access and binding custody remain pending.
Stage 47 separates signed Clerk callback admission from incomplete money setup;
deployed callback acceptance remains pending.

The existing AWS Formance footprint is `ae-alpha`: one private host and a
Multi-AZ RDS database, with nightly Melbourne backup copies. Repairing the
CloudWatch Agent configuration restored disk/memory observations and all eight
alarms are currently OK. The restored email subscription is confirmed. A
controlled CloudWatch alarm delivered one SNS notification with zero failures,
and metric evaluation restored OK after 102 seconds. Inbox receipt and an
actual restore remain unproved.
Joel selected one production-only AWS footprint on 2 October: reuse the existing
host, RDS and Formance service; retain an independent sandbox backup and prove
restore before retiring the sandbox ledger. Production receives a clean ledger,
with no test balances carried forward. Stage 46 upgrades the existing engine to
Ledger 2.4.14, creates the clean production ledger and verifies an actual local
restore of the final source archive, including original-command replay. The
operator, worker, external tunnel and reconciliation timer are healthy. A new
production-only Cloudflare Access credential replaced sandbox access and is
verified in the production vault and existing AWS secret. Application runtime
binding remains pending.
Sandbox retirement and the actual cloud restore rehearsal remain pending.
No second permanent AWS stack is approved.

Next is [#286: wire production and pass readiness](https://github.com/CreasyBear/Agentic-Economy/issues/286):
Joel selected the existing AWS self-hosted Formance route; the production ledger
is provisioned but not yet bound to the application.
[#285](https://github.com/CreasyBear/Agentic-Economy/issues/285) tracks the remaining
foundation setup. Complete the production Formance binding, custody, RPC, screening, alert and
backup/restore prerequisites, bind one coherent production environment, and
deploy matching web/backend source. Then [#287](https://github.com/CreasyBear/Agentic-Economy/issues/287)
proves the authorized real Calls and failure drills before
[#288](https://github.com/CreasyBear/Agentic-Economy/issues/288) permits launch.

The local `npm run gate` remains the source release gate. The normal Kernel
release gate and React Doctor GitHub workflows remain manually disabled as
previously configured. A Vercel build success is only build evidence; release,
readiness and the actual supported journeys must be checked separately.
