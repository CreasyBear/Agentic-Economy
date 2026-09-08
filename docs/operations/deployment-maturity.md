# Deployment maturity and gaps

## Current operating override — 6 September 2026

At Joel's request the synthetic AWS financial stack is paused for the
vocabulary refactor. EC2 `i-063c00d935d85d74f` is confirmed stopped; RDS
`package4-release-formance` and retained drill `package4-release-restore-20260904`
are both confirmed stopped at `2026-09-06T01:48:50Z`. No data or resource was
deleted, no refactor source was deployed and no non-AWS provider binding changed.
Hosted money operations are intentionally unavailable. The capability assessment
below remains historical evidence, not a current availability claim.

The pre-stop strict snapshot exited 1 with six explained release gaps: forecast
history unavailable, two absent local restricted Stripe keys, two staged Stripe
destinations still disabled, and unavailable Cloudflare alert inspection. AWS
identity, resources, controls, metrics and completed primary/regional backups
were verified; Stripe inbox stalled/failed/reconciliation-required counts were
all zero. Cost Explorer now provides USD `18.5614214555` month-to-date unblended
cost, but not a forecast.

Storage, backups, NAT/public IPv4 and account services remain chargeable. RDS
automatically restarts after seven days: AWS reports `2026-09-13T01:44:38.220Z`
for the drill and `2026-09-13T01:48:37.882Z` for the main database. Revisit before
13 September, 09:44 Perth. No automatic re-stop was scheduled. The post-stop
request snapshot showed the same six release gaps and no new failure; final
provider readback confirmed both database stops. Resume is not yet verified.
The [pause evidence and resume procedure](aws-foundation.md#refactor-pause--6-september-2026)
preserve the existing identities and require application/ledger verification
after restart.

## Assessment baseline — 4 September 2026

Captured 2026-09-04 from live provider readback and source revision
`8621ef3f3017a0e2ebe19c6277da98f7d5488909`. The working tree was dirty and
preserved; this revision identifies the checkout baseline, not a claim that
uncommitted infrastructure or application work is deployed.

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
| Vercel application | `VERIFIED` | Canonical alias remains on ready deployment `dpl_4eu4Fnn5EydfJybpixbY7t7h4QyZ`; isolated Stripe candidate `dpl_BHhR2rMv3oWkAzWZw3BXNvMGUX95` includes the restricted command-key and destination-secret bindings, built successfully, and remains unpromoted. | Install and prove the Convex readback key, then promote and repeat health/readiness and black-box protocol journeys. |
| Convex release backend | `VERIFIED` | Dedicated `fastidious-barracuda-66` deployment serves the authenticated owner/funding path. | Final managed-call, recovery, document, and protocol gates. |
| Clerk identity | `VERIFIED` | Dedicated test instance and authenticated owner journey completed. | Recovery/session operational evidence for production instance later. |
| Stripe funding | `DEPLOYED` | Hosted Checkout remains proven; the durable inbox/worker is deployed to `fastidious-barracuda-66`; the restricted command key is present in a ready Vercel candidate; and exact disabled snapshot (`we_1UBshw70N4UjLqHtRdcPu1FS`) and Accounts v2 destinations are staged with their signing-secret bindings. | Install and prove the separate readback key, promote the candidate, enable both replacements, then run replay/Connect canaries and prove no stranded work. |
| Cloudflare edge | `DECLARED` | Protected Tunnel remains proven; a separate validated OpenTofu root declares account-wide Tunnel-health and service-token-expiry alerts. | Create the narrow Notifications token, apply the two-policy plan, and prove delivered health alert plus connector recovery. |
| AWS network and k3s | `VERIFIED` | MFA-backed `Package4ReleaseOpenTofu` role, private running `t4g.large`, no public IP, SSM Online, centralized 30-day logs, live memory/disk metrics, and four actionable host alarms. | Narrow the bootstrap `PowerUserAccess` policy after seven days of CloudTrail evidence. |
| RDS PostgreSQL | `VERIFIED` | PostgreSQL 16.13, Multi-AZ, encrypted, private, deletion protection, seven-day PITR, four actionable alarms, completed isolated restore and exact schema/transaction/balance proof. RTO passed at 2,998 seconds; RPO missed by eight seconds at 308 seconds. | Repeat the drill at RPO <=300 seconds, then remove the retained drill after approval. |
| Formance financial authority | `VERIFIED` | Community stack versions pinned; live hosted funding produced exact Formance-backed `AUD 5.000000`. | Remote restart/restore, managed x402 contention/recovery, daily close. |
| CDP/x402 | `DECLARED` | Runtime variables and official package boundaries are deployed. | Deterministic live journey and separately reported Base Sepolia canary. |
| Operations/alerting | `VERIFIED` | Confirmed SNS subscription to `joel@agentic-economy.ai`, one delivered test notification, eight actionable alarms with datapoints, backup-failure routing, and US$20/US$400 budgets. | Cost Explorer must finish ingestion and produce the observed monthly forecast. |
| Backups/disaster recovery | `VERIFIED` | Completed Sydney backup and Melbourne copy; isolated PITR restored the current environment and Formance verified schema, transaction and balance digests plus idempotent replay. A fresh native Convex export of `dev:fastidious-barracuda-66` completed with archive integrity checks and file storage included. | Demonstrate isolated Convex restoration and repeat the infrastructure drill within the strict five-minute RPO; current RDS result was 5m08s. |
| Human deployment access | `VERIFIED` | Named human login, MFA-backed role assumption, expected STS identity, root MFA, and zero root access keys were read live. | Reduce deployment permissions after CloudTrail supplies a seven-day usage trace. |
| Package 4 release | `DEPLOYED` | Dedicated linked environment and first real sandbox funding work. | All original refund, managed Call, recovery, document/close, parity, restore, and canary gates. |

**Overall:** deployed synthetic release system; not release-closed and not
production-ready.

## Blocking findings

### High — Cost Explorer has not ingested the new account

Both budgets and anomaly detection are active, but `GetCostAndUsage` still
returns `DataUnavailable` and the forecast has insufficient history. Production
capacity and runway cannot be derived from credits or estimates. Wait for live
ingestion, then record actual month-to-date cost and the AWS forecast.

### High — recovery missed the strict RPO by eight seconds

The isolated restore is functional: schema `v1.3.0`, transaction and balance
digests, a known transaction reference, and idempotent replay all matched. RTO
passed at 2,998 seconds. The restored point was 308 seconds old at request time,
so the five-minute RPO gate failed by eight seconds. Keep the environment below
`RECOVERABLE` until a repeat drill meets both thresholds.

### Accepted synthetic-release risk — Tunnel token

The current Tunnel token was exposed during local operator evidence capture.
The user accepted continued use only for the synthetic release. Do not display
or retrieve it for inventory. Rotate it, force-disconnect old connections, and
rebind both replicas before any production environment or sensitive data.

The recovery-drill RDS credential was also exposed during diagnostics. The
source RDS credential was rotated and Formance health reproved; rotation of the
isolated drill credential is deferred at the user's direction. Do not retrieve,
reuse or rotate it during stabilisation. Destroy the exact drill after evidence
approval; it is never eligible for production use.

### Critical — Stripe durable ingestion is not live yet

The code and deployment guardrails are implemented, and the durable Convex
inbox/worker is deployed. A ready unpromoted Vercel candidate contains the
restricted command key and both destination-specific signing secrets, but the
separate Convex readback key is not installed and the active snapshot
destination is still unversioned with `checkout.session.expired`. Exact,
disabled snapshot and Accounts v2 replacements are staged for a tight cutover.
Production stays locked until the Vercel route, restricted keys, snapshot
cutover and replay/Connect canaries pass.

### Infisical is authenticated but not an approved custody boundary

The official CLI is authenticated, but the only discovered vault is an
`Example Project` containing sample secrets. Do not place platform, customer,
Stripe or Cloudflare credentials there. Continue provider-managed custody until
the separate platform and customer projects, environments, non-root paths and
workload identities are established by the Package 5 access work.

### High — Cloudflare alert root is not applied

The existing local Cloudflare management token is not accepted by the API.
Create the narrow Notifications Read/Write token, apply only the account alert
root, and verify email delivery before calling Cloudflare operations observable.

### Package 4 remains open

Hosted Stripe funding is now proven, but duplicate event replay, full refund,
managed x402 completion/refusal/recovery, Calls/Usage/Spend documents, signed
daily close, black-box HTTP/MCP/CLI/HTTPS-chat parity, current-environment
restore, and Base Sepolia evidence remain.

## Order of operations

1. Deploy and canary the durable Stripe boundary with restricted keys.
2. Apply and prove the two Cloudflare account alerts.
3. Wait for Cost Explorer ingestion and capture observed spend and forecast.
4. Repeat the isolated restore early enough to meet RPO <=300 seconds; retain
   the current drill only until evidence cleanup is approved.
5. Rotate Cloudflare Access and prove old-token denial; defer the separately
   accepted Tunnel rotation only within the synthetic environment.
6. Use seven days of CloudTrail evidence to narrow the deployment role.
7. Finish the original Package 4 commercial and protocol journeys.
8. Run the Base Sepolia canary and final release gate.
9. Apply the declared production root only after the gates pass, using fresh identities, empty
   ledger, managed controls, and active Australian approvals.

Every item needs a provider reference and observed result. A document update or
passing unit test alone cannot advance a live capability state.

## Vocabulary generation preflight — 5 September 2026, 09:10 UTC

A narrow fresh readback confirmed the existing synthetic test app's health and
readiness (200), its unchanged release revision `6593dbe7b4b8f75304caeed5b468acc497b720f4`,
the protected Formance edge (401), and zero stalled, failed or
reconciliation-held Stripe inbox rows. The existing snapshot remained
**incomplete with five skipped checks**: AWS, local restricted command key,
local restricted readback key, Stripe destinations and Cloudflare alerts were
not verified in this narrow session. This does not replace the dated full
assessment above or resolve the separate pending funding records.

Native Convex codegen dry-run against `fastidious-barracuda-66` exited 0 without
changing generated files. It provides a non-deploying source-analysis route for
the refactor; it is not backup/restore, deployed refactor or live journey proof.
Exact procedure and limitations are in the
[generation issue](../../.scratch/vocabulary-rationalisation/issues/22-regenerate-shared-artifacts.md).
No maturity state, release status, deployment or data was changed.

## Vocabulary backup capture — 5 September 2026, 10:21 UTC

The installed official Convex CLI `1.45.0` captured one fresh native export
from the exact non-production selector `dev:fastidious-barracuda-66` after a
successful target readback. Node `v22.22.0` and npm `11.5.1` were used. The
process blanked ambient deployment keys, deployment tokens, self-hosted
selectors and verbose logging variables. The native export included file
storage and completed at `2026-09-05T10:21:44Z`.

The private archive is
`/Users/joelchan/.codex/backups/agentic-economy/convex-native-20260905-102139/snapshot_fastidious-barracuda-66_1788603701438628839.zip`.
Its containing directory is mode `0700`; the archive is mode `0600`, 229,603
bytes, SHA-256
`14a276d8b2d05caede5f155367cd0a8feffd8192d21c775fa5a721a38c3a9cbe`.
Native export completion, `unzip -tq` and `zip -T` all exited 0. Metadata-only
inspection found 355 archive members, 182 `documents.jsonl` members and 23
file-storage members. No rows, file contents, credentials or provider payloads
were emitted or retained in the repository.

The export is deployment-wide. The CLI exposes `--include-file-storage` but no
export-specific component selector; 11 component mounts are declared in the
current source. Component data is therefore not independently selectable or
restore-proven by this receipt. The native Convex backup contract excludes
code/configuration, environment variables and pending scheduled functions.
This is backup-integrity evidence only, not database restoration, callback,
queue or runtime proof. The exact private receipt and the unexecuted isolated
restore proposal are in
[`vocabulary-cutover-preflight.md`](vocabulary-cutover-preflight.md).

The restoration target is unresolved, so the capability remains `VERIFIED` for
backup capture but cannot advance to `RECOVERABLE`. Ticket 31 remains open
pending an approved isolated target, restoration/component/queue comparison,
reconciliation of the 20 pending funding commands (18 externally referenced),
and callback/job isolation evidence. The five skips in the 09:10 snapshot remain
explicit and unchanged: AWS, local restricted command key, local restricted
readback key, Stripe destinations and Cloudflare alerts.
