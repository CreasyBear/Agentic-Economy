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
2. **Production binding gap:** Vercel Production has no
   `AE_DEPLOYMENT_ENVIRONMENT` declaration, while
   `AE_FORMANCE_ENVIRONMENT=sandbox` and the configured gateway is
   `https://formance-alpha.aecon.ai`. These bindings cannot be called a
   production money environment or fixed by relabeling the existing ledger.

Next is [#286: wire production and pass readiness](https://github.com/CreasyBear/Agentic-Economy/issues/286):
Joel confirmed that production Formance is not provisioned yet;
[#285](https://github.com/CreasyBear/Agentic-Economy/issues/285) is the next setup
step. Complete the actual production Formance, custody, RPC, screening, alert and
backup/restore prerequisites, bind one coherent production environment, and
deploy matching web/backend source. Then [#287](https://github.com/CreasyBear/Agentic-Economy/issues/287)
proves the authorized real Calls and failure drills before
[#288](https://github.com/CreasyBear/Agentic-Economy/issues/288) permits launch.

The local `npm run gate` remains the source release gate. The normal Kernel
release gate and React Doctor GitHub workflows remain manually disabled as
previously configured. A Vercel build success is only build evidence; release,
readiness and the actual supported journeys must be checked separately.
