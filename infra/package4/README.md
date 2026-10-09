# Package 4 release infrastructure

This directory is the reusable deployment definition for the private Formance
Community financial authority. `environments/package4-release` is the sandbox
release instance. `account-baseline` owns the account-wide audit and safety
controls, `recovery-drill` proves an isolated restore, and
`environments/production` declares the separate production boundary. The
release instance is never promoted in place.

## Deployed boundary

- AWS Sydney VPC with public NAT subnets, private application subnets and
  isolated database subnets across two availability zones.
- One private Ubuntu 24.04 ARM64 k3s host, administered through Systems Manager.
  It has no public address, SSH key or inbound security-group rule.
- Private encrypted Multi-AZ RDS PostgreSQL 16 with seven days of PITR,
  deletion protection and a final snapshot. Primary PITR is the five-minute
  recovery-point control.
- Nightly encrypted AWS Backup copy to Melbourne retained for seven days. This
  is regional disaster evidence; it is not represented as a five-minute copy.
- The official Formance operator installs Gateway, Ledger API and Ledger worker
  only. Images and component versions are immutable digests.
- A remotely configured Cloudflare Tunnel publishes Gateway. Cloudflare Access
  admits only the environment service token; direct origin access is absent.
- Multi-region CloudTrail with integrity validation, GuardDuty, Access Analyzer,
  account-level S3 blocking, default EBS encryption and S3-backed VPC Flow Logs.
- Thirty-day host and RDS logs, CloudWatch Agent disk/memory metrics and eight
  infrastructure alarms routed through the release SNS topic.

No Formance Payments, Auth, Console, Reconciliation, Wallets, Flows or Webhooks
module is deployed. PostgreSQL and Kubernetes APIs are not exposed publicly.

## Required operator inputs

OpenTofu state must already use a versioned, KMS-encrypted S3 bucket with native
state locking. Copy `backend.hcl.example` and the example variable file outside
the repository, then provide AWS and Cloudflare credentials through their
official environment variables or workload identity. Never place credentials
in a `.tfvars` file.

For a new standalone AWS account, create that boundary once with the checked-in
AWS CloudFormation bootstrap:

```sh
aws cloudformation deploy \
  --region ap-southeast-2 \
  --stack-name package4-release-bootstrap \
  --template-file infra/package4/bootstrap/state-and-deployer.yaml \
  --capabilities CAPABILITY_NAMED_IAM

aws iam update-account-password-policy \
  --minimum-password-length 16 \
  --require-symbols \
  --require-numbers \
  --require-uppercase-characters \
  --require-lowercase-characters \
  --allow-users-to-change-password \
  --password-reuse-prevention 24 \
  --no-hard-expiry
```

Run this only from a temporary root console-backed AWS CLI session. The retained
stack creates the encrypted, versioned state bucket, a console-only human user
with no access keys, AWS's maintained local-development sign-in policy and a
dedicated deployment role. Set the user's login profile and MFA outside
CloudFormation, then enroll MFA from AWS's **My security credentials** page at
`https://console.aws.amazon.com/iam/home#/security_credentials`. Do not use the
administrator-facing IAM Users detail page for self-enrollment; that page probes
account-wide IAM APIs the deployment user intentionally cannot access. The
user can manage only its own password and MFA devices. It cannot create or manage
access keys, roles, users or infrastructure directly.

Register two MFA devices: a passkey or security key for phishing-resistant
console sign-in, and a virtual TOTP device named
`joel-package4-deployer-cli` for MFA-protected STS role assumption. AWS does not
support FIDO MFA for CLI/API calls. After enrollment, use `aws login` as that
user and configure the role profile's `mfa_serial` to the virtual device ARN.
The CLI then prompts for one TOTP when it creates a cached temporary role
session. Use the emitted bucket, key ARN and role ARN for initialization and
the real plan;
do not run the release module as the root principal or the human user directly.

The apply identity needs bounded AWS permissions for the declared resources and
Cloudflare permissions for Tunnel, DNS and Access. A separate subscription must
be attached to the emitted alert-topic ARN. The state is sensitive because
Cloudflare returns service-token material to the provider; encrypted state is
part of the security boundary.

Validate with the pinned toolchain before planning:

```sh
docker run --rm -v "$PWD:/workspace" \
  -w /workspace/infra/package4/environments/package4-release \
  --entrypoint sh ghcr.io/opentofu/opentofu:1.12.6 -lc '
    export TF_DATA_DIR=/tmp/tofu-data
    tofu fmt -check -recursive .
    tofu init -backend=false -input=false >/dev/null
    tofu validate
  '
```

For a real plan, initialize with the external backend file and provide the
variable file outside the checkout. Review the complete saved plan before
applying. The module deliberately has no destroy shortcut: RDS deletion
protection and `prevent_destroy` require an explicit reviewed change.

When changing AWS-only resources in an existing environment, disable provider
refresh and pass the existing Tunnel token from Secrets Manager through the
sensitive `cloudflare_tunnel_token_override` environment variable. This keeps
the Cloudflare boundary frozen without placing the token in source, command
output or a variable file. New environments still require a valid Cloudflare
management credential and must not use the override as a bootstrap shortcut.

The production root is declaration only until alert delivery, account audit,
cost ingestion and a passing recovery drill are all evidenced. It uses
`ae-production`, VPC `10.43.0.0/16`, a dedicated encrypted state bucket and KMS
key, Sydney primary and Melbourne recovery copy, and fresh Cloudflare and
database identities. It contains no application traffic binding. The root
refuses to plan unless `foundation_gates_passed=true`. Its former
`docs/operations/aws-foundation.md` gate is missing; do not set that flag or
provision a replacement stack from this historical declaration. The existing
production footprint and current release authority are recorded in
[Deployment operations](../../docs/operations/deployments.md#destinations-and-authority).
[MM-042](../../docs/operations/mercator-maturity-register.md#mm-042) retains the
unqualified joint restore, host replacement and alert-delivery requirements.

## Application binding

After infrastructure health passes, bind the dedicated Vercel and Convex
release environments using supported provider interfaces:

- `AE_DEPLOYMENT_ENVIRONMENT=development` in both Vercel and Convex
- `AE_FORMANCE_ENVIRONMENT=sandbox`
- `AE_FORMANCE_GATEWAY_URL` from the module output
- `AE_FORMANCE_LEDGER=agentic-economy-release`
- `AE_FORMANCE_REQUEST_TIMEOUT_MS=10000`
- the Cloudflare Access client ID and secret read from the emitted Secrets
  Manager ARN

Use a dedicated Clerk test instance and restricted Stripe test credentials in
the development environment. A production deployment declares
`AE_DEPLOYMENT_ENVIRONMENT=production` in both runtimes and requires production
Formance and matching restricted live Stripe credentials when Stripe is enabled.
Missing or mismatched declarations refuse new money operations. Development
uses the deterministic local fixture; the retired synthetic profile cannot
select an execution path. Existing policy evidence remains readable.

## Rotation and recovery

Set `cloudflare_access_secret_version` and
`previous_cloudflare_access_secret_expires_at` together to rotate with an
overlap window. Update Vercel and Convex from the new Secrets Manager version,
prove the old and new paths during the overlap, then expire the predecessor.
Revocation must cause Formance entry to fail closed.

Database recovery uses RDS PITR into an isolated instance followed by a fresh
Formance stack and exact schema, template, reference, balance and idempotency
verification. Never attach a restored database to the authoritative release
stack until the rehearsal evidence passes.

Use `recovery-drill` with an explicit source namespace and ledger, and a
dedicated state key for each source and drill date. Its
verification script runs through Systems Manager, retrieves the drill secret
on the host, creates a separate Formance namespace, compares the recorded
baseline with the restored state, and replays the original command and native
idempotency key without another posting. Formance binds its logical
database name to the Stack name, so the script briefly pauses the Formance
operator control loop and points only the isolated drill Ledger deployments at
the restored source database name. The source data-plane stays online and its
endpoint is never redirected. Do not destroy the drill until the evidence is
captured and Joel explicitly confirms cleanup. Run
`cleanup-restored-formance.sh` first so the exact drill-only Formance resources
and secret-bearing Settings are removed before the reviewed OpenTofu destroy
plan deletes their AWS backing resources.

## Financial evidence archive

The account baseline declares a separate private, versioned S3 bucket in Sydney
for financial evidence. It uses SSE-S3 encryption, TLS-only access and Object
Lock governance retention of 2,557 days. The existing CloudTrail retains all
management events and records reads and writes for this bucket. Existing VPC
flow-log delivery permissions remain in place. No application identity receives
archive access, and no automatic exporter or lifecycle deletion is configured.

The separate bucket avoids the audit bucket's 365-day/30-day expiry. SSE-S3 avoids
adding a KMS key, key policy, key-deletion risk and recurring key charge. The cost
is one bucket and its access, encryption, versioning and retention controls,
plus S3 data-event charges. Keep this boundary for the financial retention need;
full database backups and application payloads do not belong here.

**Requires:** an authorized operator, identified financial records, source
snapshot/version, approved retention policy and a unique export run ID.
**Ensures:** each accepted manifest names the bucket, key, exact S3 version ID,
source IDs, export time, SHA-256 and observed retain-until date; downloaded bytes
from that exact version match the digest. **Invariant:** missing, unreadable,
short-retained or unaccounted versions never count as archived. **On violation:**
preserve the source and incomplete-run evidence; retry under a fresh run ID
without overwriting previous evidence or claiming the close is archived.

Until an exporter exists, the operator performs a bounded daily export after
reconciliation and another after material corrections. Export only financial
transaction and business-document evidence, its necessary tax/commercial-policy
context and referenced financial attachments. Minimize fields at export time.
Exclude chat, prompts, Call input/output, Provider payloads, credentials,
unrelated Accounts and full database/file-storage backups. Content metadata is
included only when material to a documented dispute.

Use `financial/YYYY/MM/DD/<run-id>/` for table-scoped JSONL, attachments and a
manifest containing source snapshot, interval, row counts, identities, policy
revision and hashes. Upload without overriding the default retention; record
returned version IDs and read every exact version back. Reconcile counts to the
source and verify governance mode and at least 2,557 days of retention from the
upload before accepting the run. Repeated attempts use new keys; version IDs
remain mandatory even when a key is unique.

A legal hold is separate from retention. On a documented instruction, an
operator with existing authorized S3 access sets `ON` for each affected version,
reads it back with `GetObjectLegalHold`, and records authority, scope, version ID
and time. Only a separately authorized release sets it `OFF`; retention still
applies afterward. Routine governance bypass is denied for `financial/*`.
Account administrators can change policy, so this is governance protection,
not a compliance-mode guarantee against account administration.

Verify recovery and hold behavior with harmless `test/<unique-id>` fixtures,
explicitly overriding the bucket default with short governance retention.
Confirm exact-version digest readback and isolation across repeated uploads,
retention denial before expiry, and deletion denial while a legal hold remains
ON after retention expires. Remove the fixture hold and versions only as part
of the authorized drill. Verify a principal without archive rights is denied and
that CloudTrail captures the actual object and hold operations. Never upload a
seven-year disposable fixture or shorten retention on real financial evidence.
A configured bucket alone does not establish export completeness, an active
hold, a successful drill or a signed daily close.
