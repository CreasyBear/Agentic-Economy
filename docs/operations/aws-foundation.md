# AWS foundation

This is the canonical AWS operating contract for Agentic Economy. It covers
the bootstrapped foundation needed to keep the private financial authority
observable, recoverable and bounded in cost. Live resource identifiers remain
in `deployment-registry.yaml`; capability evidence remains in
`deployment-maturity.md`.

## Synthetic runtime retired — 13 September 2026

Joel approved preserving recovery snapshots and retiring the old synthetic AWS
runtime. The reviewed saved OpenTofu plans completed: five recovery-drill
resources and 19 main-runtime resources were deleted. The exact checked-in
drill cleanup first passed source verification before and after removal.

Live readback confirms both old RDS instances absent, EC2
`i-063c00d935d85d74f` terminated, its root volume absent, NAT
`nat-0aabc2385d7704d2d` deleted and its public IP released. The previous
seven-day database restart risk is resolved. Retained encrypted recovery points
are available:

- `package4-release-formance-retirement-20260913`
- `package4-release-restore-20260904-retirement`
- `package4-release-formance-final`
- EBS `snap-04e41acaa13daaf60`

Keep encryption key `5979d934-bd8d-4809-bd2e-5cf22092922e` enabled. State,
audit controls, logs, vaults, VPC/subnets and recovery evidence remain retained;
retention continues to incur storage and account-service costs. Snapshot
availability does not establish a new restore drill pass.

**Do not apply the old `environments/package4-release` or dated recovery-drill
root: an ordinary apply would recreate retired resources.** The fresh hosted
alpha uses `infra/package4/environments/alpha` and its separate state key.
Provisioning status is recorded in `deployment-registry.yaml`; alpha readiness
still requires runtime verification. The pause and resume commands below are
historical and must not be used against the retired runtime.

## Historical refactor pause — 6 September 2026

Joel requested a reversible AWS pause during the vocabulary refactor. This
operating state supersedes the running-state observations dated below; it does
not change the declared infrastructure or authorize teardown.

- Target: account `197716152388`, region `ap-southeast-2`, synthetic
  `package4-release`; routine role `Package4ReleaseOpenTofu` verified live.
- EC2 `i-063c00d935d85d74f`: **stopped**, confirmed before database stop requests.
- RDS `package4-release-formance` and `package4-release-restore-20260904`:
  stop requests accepted at approximately `2026-09-06T01:36Z`; both **stopped**,
  confirmed by provider readback at `2026-09-06T01:48:50Z`.
- Data, EBS/RDS storage, backups, recovery-drill evidence, credentials, network,
  audit controls and alert configuration are retained. No resource was deleted.
- Hosted Formance-dependent money operations are intentionally unavailable.
  Vercel, Convex, Clerk, Stripe and Cloudflare configuration was not changed;
  their independent work and charges are not suspended by this AWS pause.
- This is not zero cost: NAT `nat-0aabc2385d7704d2d`, its public IPv4 allocation,
  retained storage/backups and account services can continue charging.
- RDS automatically restarts after seven days. Revisit this pause before
  **13 September 2026, 09:44 Perth**; provider restart times are
  `2026-09-13T01:44:38.220Z` for the drill and `2026-09-13T01:48:37.882Z` for
  the main database. No automatic re-stop job was created. EC2 stays stopped
  until explicitly started. Existing alarms and scheduled backups can report
  the intentional outage; they have not been disabled.

### Evidence and resume

The pre-stop strict snapshot verified the AWS role, matching resource identities,
completed primary backup and regional copy, account controls, telemetry and
budgets. It exited 1 with six explained release gaps: unavailable cost forecast,
two missing local restricted Stripe keys, two disabled staged Stripe destinations
and unavailable Cloudflare alert inspection. These are not a clean release pass.
Cost Explorer now returned USD `18.5614214555` month-to-date unblended cost;
the historical statement that observed cost was unavailable is superseded.

The same strict snapshot was rerun after the stop requests while RDS shutdown
was completing. It showed EC2 stopped, the same six explained release gaps,
completed backups, preserved account controls and zero unhealthy Stripe inbox
counts. Subsequent exact database readback confirmed both stopped. Application
health/readiness still returned 200 because those probes do not establish
Formance availability; provider state is the pause evidence. Resume behavior has
not been exercised during this pause.

After explicit resume authorization, renew the named AWS login and verify the
same role/account. Read current status first, start only stopped resources, and
wait for both databases before starting the host:

```sh
aws rds start-db-instance --profile package4-release-deployer --region ap-southeast-2 --db-instance-identifier package4-release-formance --query 'DBInstance.{Id:DBInstanceIdentifier,Status:DBInstanceStatus}' --no-cli-pager
aws rds start-db-instance --profile package4-release-deployer --region ap-southeast-2 --db-instance-identifier package4-release-restore-20260904 --query 'DBInstance.{Id:DBInstanceIdentifier,Status:DBInstanceStatus}' --no-cli-pager
aws rds wait db-instance-available --profile package4-release-deployer --region ap-southeast-2 --db-instance-identifier package4-release-formance
aws rds wait db-instance-available --profile package4-release-deployer --region ap-southeast-2 --db-instance-identifier package4-release-restore-20260904
aws ec2 start-instances --profile package4-release-deployer --region ap-southeast-2 --instance-ids i-063c00d935d85d74f --query 'StartingInstances[].{Id:InstanceId,State:CurrentState.Name}' --no-cli-pager
aws ec2 wait instance-status-ok --profile package4-release-deployer --region ap-southeast-2 --instance-ids i-063c00d935d85d74f
```

Then verify SSM and the existing Formance deployments, exact ledger readback,
queued financial work, and the strict deployment snapshot. Starting instances
alone is not application recovery proof. Do not deploy refactor source as part
of resume or change the environment profile, secrets or commercial identities.

AWS references: [RDS stop and seven-day restart](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html),
[EC2 stop behavior](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/how-ec2-instance-stop-start-works.html),
[NAT and IPv4 charges](https://aws.amazon.com/vpc/pricing/).

## Current position — 4 September 2026

The synthetic `package4-release` environment is private, monitored and backed
up. Account-level S3 public blocking, default EBS encryption, multi-region
CloudTrail, GuardDuty, Access Analyzer and VPC Flow Logs are active. Alert
delivery was proven, and USD 20 early-warning plus USD 400 runway budgets exist.

The foundation is not production-ready for two reasons:

- Cost Explorer has not finished ingesting the new account, so observed spend
  and forecast are unavailable.
- The isolated restore proved data integrity and a 2,998-second RTO, but the
  restored point was 308 seconds old. The five-minute RPO failed by eight
  seconds and must be repeated.

The recovery drill remains isolated and retained for evidence. Its exposed
credential is an accepted temporary risk at Joel's direction. Do not retrieve,
display or rotate it during stabilisation; destroy the exact drill after
evidence approval, using the checked-in cleanup path first.

## Startup constraints

- One founder operates AWS through supervised tooling.
- Monthly AWS ceiling is USD 400; credits do not increase the ceiling.
- `package4-release` contains synthetic data and is never promoted.
- Production receives fresh state, network, database, ledger, tunnel and
  credentials; no synthetic identities or data are copied.
- Preserve the current private k3s host and Multi-AZ RDS design while usage is
  unknown. Do not add EKS, extra application nodes, a second NAT gateway,
  multi-account management or more regions without measured need.
- Root is break-glass only. Routine work uses the MFA-backed deployment role.

## Owned roots

| OpenTofu root | Responsibility | Current status |
| --- | --- | --- |
| `infra/package4/account-baseline` | Audit, safe defaults, detection, flow logs, alert subscription and budgets | Deployed; no-change plan |
| `infra/package4/environments/package4-release` | Synthetic private Formance environment and observability | Deployed; no-change plan |
| `infra/package4/recovery-drill` | Exact isolated point-in-time restore evidence | Deployed and retained; no-change plan |
| `infra/package4/environments/production` | Separate `ae-production` boundary | Declared only; hard-gated |

Each root is pinned to AWS account `197716152388`. A different account is a
hard stop, not a new target to infer.

## Every AWS session

1. Use Brave to sign in as `joel-package4-deployer` when Console or MFA is
   needed.
2. Renew the CLI with `aws login --profile package4-release-user`.
3. Confirm `package4-release-deployer` resolves to account `197716152388` and
   `assumed-role/Package4ReleaseOpenTofu`.
4. Run the strict deployment snapshot before diagnosis or change.
5. Resolve drift before continuing. Never use root, an unexpected identity, or
   an unavailable backup.
6. For a change, save the OpenTofu plan, review the complete artifact, and apply
   that exact plan only.
7. Rerun the strict snapshot and record live readback in the registry, maturity
   record and relevant evidence document.

The Console is for navigation and MFA. AWS CLI and provider API readback are
the evidence of what exists.

## Production gate

The production root must remain locked against a creatable plan and unapplied
until all of these are true:

- strict snapshot has no failures or skipped critical checks;
- infrastructure and budget alert delivery is confirmed;
- Cost Explorer provides observed month-to-date spend and a monthly forecast;
- CloudTrail, GuardDuty, Access Analyzer, S3 blocking, EBS encryption and log
  retention remain active;
- all critical metrics have datapoints and actionable alarms;
- Sydney backup and Melbourne copy are complete;
- a fresh isolated drill proves RPO at most 300 seconds and RTO at most 3,600
  seconds;
- all three deployed OpenTofu roots show no unexplained drift;
- the synthetic and production boundaries remain fully separate.

Only after those facts are recorded may `foundation_gates_passed` be set true
for one reviewed production plan. That acknowledgment is not durable permission
for later plans; recheck the baseline each session. Application traffic binding
is a separate decision and is not part of the AWS foundation apply.

## Next actions

1. Wait for Cost Explorer ingestion, then record actual spend and forecast.
2. Repeat the isolated restore with a recovery point age of 300 seconds or
   less; keep the authoritative endpoint unchanged throughout.
3. After Joel approves evidence cleanup, remove only the exact drill Formance
   resources, prove the source remains healthy, review a destroy plan, and
   remove the drill AWS resources.
4. After seven days of CloudTrail evidence, replace bootstrap
   `PowerUserAccess` with a narrower deployment policy and prove an unchanged
   plan before detaching the broad policy.
5. Create production only after the hard gate passes. Do not bind customer
   traffic as part of that infrastructure action.

## Deferred deliberately

AWS Config, Security Hub, Control Tower, Organizations, EKS, detailed EC2
monitoring, RDS Enhanced Monitoring and additional regional/application
capacity remain out of scope. Revisit them only when compliance, incident or
measured usage evidence justifies their cost and operator load.
