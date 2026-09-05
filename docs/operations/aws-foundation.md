# AWS foundation

This is the canonical AWS operating contract for Agentic Economy. It covers
the bootstrapped foundation needed to keep the private financial authority
observable, recoverable and bounded in cost. Live resource identifiers remain
in `deployment-registry.yaml`; capability evidence remains in
`deployment-maturity.md`.

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
