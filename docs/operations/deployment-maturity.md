# Deployment maturity and gaps

Captured 2026-09-03 from live provider readback and source revision
`79a24a309fe8e0a3ce02905caa9674cbd35db375`.

## Evidence states

| State | Meaning |
| --- | --- |
| `DECLARED` | Desired resource, version, ownership, and failure rule exist in source/IaC. |
| `DEPLOYED` | Exact live resource identity was read from its provider. |
| `VERIFIED` | Intended success and fail-closed behavior were observed. |
| `RECOVERABLE` | Rotation, restart, or restore was exercised in this exact environment. |
| `PRODUCTION_READY` | Owners, alerts, backups, access, runbooks, release gates, and external approvals are current. |

The environment inherits the lowest state of any critical path required for
the requested operation. There is no averaged maturity score.

## Current assessment

| Capability | State | Evidence | Missing to advance |
| --- | --- | --- | --- |
| Vercel application | `VERIFIED` | Ready deployment `dpl_HusZd4YE3huJEwzyeKaAypS4unjL`; health, readiness, and full source-SHA readback returned HTTP 200. | Repeat after final Package 4 commit and complete black-box protocol journeys. |
| Convex release backend | `VERIFIED` | Dedicated `fastidious-barracuda-66` deployment serves the authenticated owner/funding path. | Final managed-call, recovery, document, and protocol gates. |
| Clerk identity | `VERIFIED` | Dedicated test instance and authenticated owner journey completed. | Recovery/session operational evidence for production instance later. |
| Stripe funding | `VERIFIED` | Hosted Checkout, sandbox 3DS, signed settlement, and exact A$5 principal credit completed. | Official event resend, full refund/reversal, conflicting/partial-refund proof. |
| Cloudflare edge | `VERIFIED` | `formance-release.aecon.ai` resolves through Cloudflare; unauthenticated health returns 401; application-authenticated Formance funding succeeds. | Rotate accepted exposed tunnel token before production; verify Access service-token rotation/revocation. |
| AWS network and k3s | `DEPLOYED` | Private running `t4g.large`, no public IP, SSM Online, k3s status alarm OK. | Routine MFA role access, remote component restart proof, alert subscriber. |
| RDS PostgreSQL | `DEPLOYED` | PostgreSQL 16.13, Multi-AZ, encrypted, private, deletion protection, seven-day retention, current restorable time. | Wait for metrics, observe backup/copy jobs, rehearse isolated restore and meet RPO/RTO. |
| Formance financial authority | `VERIFIED` | Community stack versions pinned; live hosted funding produced exact Formance-backed `AUD 5.000000`. | Remote restart/restore, managed x402 contention/recovery, daily close. |
| CDP/x402 | `DECLARED` | Runtime variables and official package boundaries are deployed. | Deterministic live journey and separately reported Base Sepolia canary. |
| Operations/alerting | `DECLARED` | SNS topic, EventBridge backup-failure rule, and CloudWatch alarms exist. | Subscribe an owner/on-call endpoint; resolve missing-data alarms; prove alert delivery. |
| Backups/disaster recovery | `DECLARED` | Primary Sydney and DR Melbourne vaults plus nightly copy rule exist; RDS PITR has begun. | Observe successful jobs and restore the current release database into an isolated stack. |
| Human deployment access | `DECLARED` | Named IAM user and deployment role exist. | Repair MFA-backed `AssumeRole`; remove local root static key. |
| Package 4 release | `DEPLOYED` | Dedicated linked environment and first real sandbox funding work. | All original refund, managed Call, recovery, document/close, parity, restore, and canary gates. |

**Overall:** deployed synthetic release system; not release-closed and not
production-ready.

## Blocking findings

### Critical — routine AWS operator path is not usable

The intended `package4-release-deployer` profile cannot assume
`Package4ReleaseOpenTofu`, while a local `package4-release` profile resolves to
the AWS account root using long-lived credentials. Repair the role trust and
human permission path, prove MFA-backed STS, then remove the root credential.
No routine apply is mature until this is complete.

### High — alerts have no recipient

`package4-release-package4-alerts` has zero subscriptions. Two RDS alarms are in
`ALARM` because the new database has not emitted the expected metrics yet.
Attach an owned notification endpoint, wait for or diagnose metrics, and prove
one test notification before treating monitoring as operational.

### High — backup infrastructure exists but recovery is not yet evidence

The primary and Melbourne vaults and nightly copy rule exist. No completed
AWS Backup/copy job was visible at capture time. RDS reports a latest restorable
time, but the current release database has not been restored into an isolated
stack. Do not claim RPO/RTO until that rehearsal passes.

### Accepted synthetic-release risk — Tunnel token

The current Tunnel token was exposed during local operator evidence capture.
The user accepted continued use only for the synthetic release. Do not display
or retrieve it for inventory. Rotate it, force-disconnect old connections, and
rebind both replicas before any production environment or sensitive data.

### Package 4 remains open

Hosted Stripe funding is now proven, but duplicate event replay, full refund,
managed x402 completion/refusal/recovery, Calls/Usage/Spend documents, signed
daily close, black-box HTTP/MCP/CLI/HTTPS-chat parity, current-environment
restore, and Base Sepolia evidence remain.

## Order of operations

1. Repair the non-root AWS role path and delete the local root credential.
2. Subscribe and prove alerts; allow RDS metrics and first backup cycle to land.
3. Rotate Cloudflare Access and prove old-token denial; defer the separately
   accepted Tunnel rotation only within the synthetic environment.
4. Rehearse remote restart and isolated RDS restore.
5. Finish the original Package 4 commercial and protocol journeys.
6. Run the Base Sepolia canary and final release gate.
7. Create production later from the same module with fresh identities, empty
   ledger, managed controls, and active Australian approvals.

Every item needs a provider reference and observed result. A document update or
passing unit test alone cannot advance a live capability state.
