# Deployment command catalog

These are approved operator entry points. They use official CLIs and the
checked-in deployment definition. Commands that mutate live state require a
target card, reviewed change, and authorization for that exact environment.

Use Node 22 for application commands:

```sh
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 22
```

Never put secret values on a command line. Avoid `set -x`. Use official login,
environment, stdin, or provider secret mechanisms.

## AWS session

Use Brave for the named human Console login and MFA. Renew the CLI and prove the
routine role before any AWS read or plan:

```sh
aws login --profile package4-release-user
aws sts get-caller-identity \
  --profile package4-release-deployer \
  --query '{Account:Account,Arn:Arn}' \
  --output json
```

The account must be `197716152388` and the ARN must contain
`assumed-role/Package4ReleaseOpenTofu`. Root or any other account is a hard
stop. The canonical gate sequence is in `aws-foundation.md`.

## Read-only environment snapshot

From the repository root:

```sh
AE_DEPLOYMENT_AWS_PROFILE=package4-release-deployer \
AE_DEPLOYMENT_CONVEX_DEPLOYMENT=fastidious-barracuda-66 \
AE_DEPLOYMENT_STRIPE_SNAPSHOT_DESTINATION_ID=we_1UBshw70N4UjLqHtRdcPu1FS \
AE_DEPLOYMENT_STRIPE_V2_DESTINATION_ID=ed_test_61VLGGSYypj7Fpg7S16UvBfU9V8SqsP28ZeVu4UQaVMO \
AE_DEPLOYMENT_CLOUDFLARE_ACCOUNT_ID=replace-with-account-id \
AE_DEPLOYMENT_STRICT=1 \
  .agents/skills/deployment-operations/scripts/deployment_snapshot.sh
```

Strict mode fails on missing checks, unhealthy public probes, unexpected
Formance exposure, or an AWS root identity. A skipped check is never release
evidence.

## Target identity

```sh
git branch --show-current
git rev-parse HEAD
git status --short

aws sts get-caller-identity \
  --profile package4-release-deployer \
  --output json

npx vercel@59.11.2 inspect \
  https://agentic-economy-package4-release.vercel.app \
  --scope creasybears-projects
```

For Convex, read `CONVEX_DEPLOYMENT` from the ignored environment file and
announce its class before any command. Do not run `convex env list` as a general
inventory command because it prints values.

## Application and edge probes

```sh
curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/health
curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/ready
curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/v1/release

curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  https://formance-release.aecon.ai/_healthcheck
```

The unauthenticated Formance request must return `401`. A `200` means the
financial authority is exposed and entry must be suspended.

## AWS inventory

```sh
aws ec2 describe-instances \
  --profile package4-release-deployer \
  --region ap-southeast-2 \
  --filters \
    Name=tag:Environment,Values=package4-release \
    Name=instance-state-name,Values=pending,running,stopping,stopped \
  --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Public:PublicIpAddress,Az:Placement.AvailabilityZone}' \
  --output json

aws rds describe-db-instances \
  --profile package4-release-deployer \
  --region ap-southeast-2 \
  --db-instance-identifier package4-release-formance \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Version:EngineVersion,MultiAZ:MultiAZ,Public:PubliclyAccessible,Encrypted:StorageEncrypted,DeletionProtection:DeletionProtection,LatestRestorableTime:LatestRestorableTime}' \
  --output json

aws cloudwatch describe-alarms \
  --profile package4-release-deployer \
  --region ap-southeast-2 \
  --alarm-name-prefix package4-release \
  --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}' \
  --output json
```

List secret metadata only:

```sh
aws secretsmanager list-secrets \
  --profile package4-release-deployer \
  --region ap-southeast-2 \
  --filters Key=name,Values=package4-release/package4 \
  --query 'SecretList[].{Name:Name,ARN:ARN,LastChanged:LastChangedDate}' \
  --output json
```

Do not use `get-secret-value` for inventory.

## OpenTofu validation and plan

Validation is isolated in the pinned official image:

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

Use the same isolated command for `account-baseline`, `recovery-drill` and
`environments/production`. The temporary data directory prevents a validation
run from reusing a live backend initialization in the checkout.

For a live plan, use external backend and variable files that contain only
non-secret values. Supply AWS and Cloudflare credentials through their official
environment/workload identity. Initialize the partial backend first, then save
and review the plan:

```sh
(
  eval "$(aws configure export-credentials \
    --profile package4-release-deployer --format env)"
  docker run --rm -it \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_SESSION_TOKEN \
    -e CLOUDFLARE_API_TOKEN \
    -v "$PWD:/workspace" \
    -v "$AE_TOFU_INPUT_DIR:/operator-input:ro" \
    -w /workspace/infra/package4/environments/package4-release \
    --entrypoint sh ghcr.io/opentofu/opentofu:1.12.6 -lc '
      tofu init -reconfigure -input=false \
        -backend-config=/operator-input/backend.hcl
      tofu plan -input=false \
        -out=/workspace/output/package4-release.tfplan \
        -var-file=/operator-input/package4-release.auto.tfvars
    '
)
```

The subshell carries only the current temporary role session into the
container and discards it on exit. Do not print the exported environment.

Do not run `apply` until the saved plan, target identity, blast radius, backups,
and rollback boundary have been reviewed. Apply only the saved plan file:

```sh
(
  eval "$(aws configure export-credentials \
    --profile package4-release-deployer --format env)"
  docker run --rm -it \
    -e AWS_ACCESS_KEY_ID \
    -e AWS_SECRET_ACCESS_KEY \
    -e AWS_SESSION_TOKEN \
    -e CLOUDFLARE_API_TOKEN \
    -v "$PWD:/workspace" \
    -v "$AE_TOFU_INPUT_DIR:/operator-input:ro" \
    -w /workspace/infra/package4/environments/package4-release \
    ghcr.io/opentofu/opentofu:1.12.6 \
    apply /workspace/output/package4-release.tfplan
)
```

Do not use `-auto-approve` or regenerate the plan during apply.

### Root-specific gates

- `account-baseline`: plan before environment changes so account safeguards are
  known-good.
- `package4-release`: synthetic only; never promote it or copy its state.
- `recovery-drill`: use a unique dated backend key; retain it until evidence is
  approved.
- `production`: planning is intentionally blocked while
  `foundation_gates_passed=false`. Set it true only after every live criterion
  in `aws-foundation.md` is recorded for that reviewed plan. A Cloudflare token
  or passing syntax validation is not gate evidence.

For AWS-only changes to an existing environment, freeze the Cloudflare boundary
as described in `infra/package4/README.md`; do not refresh it with a known-invalid
management credential.

## Vercel

Inspect project, deploy, then confirm the canonical alias and release SHA:

```sh
npx vercel@59.11.2 inspect \
  https://agentic-economy-package4-release.vercel.app \
  --scope creasybears-projects

npx vercel@59.11.2 deploy --prod \
  --project agentic-economy-package4-release \
  --scope creasybears-projects

curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/v1/release
```

`vercel env ls` is acceptable for names and classifications. Do not pull or
print environment values as part of diagnosis. Change one named variable at a
time through Vercel's maintained command/UI, redeploy, and verify.

### Stripe webhook rollout order

1. Keep the Accounts v2 thin destination disabled and narrow it to the five
   declared events and `/api/stripe/webhook/accounts-v2`.
2. Install `STRIPE_V2_WEBHOOK_SECRET` in Vercel and
   `STRIPE_READBACK_KEY` in the target Convex deployment without printing them.
3. Deploy Convex first, then Vercel. Verify the new route is present.
4. Pin the snapshot destination to `2026-07-29.dahlia`, remove
   `checkout.session.expired`, and enable the thin destination.
5. Complete Checkout replay and Accounts v2 canaries. Only then delete disabled
   stale destinations with no outstanding deliveries.

### Cloudflare account alerts

Use `infra/cloudflare/account-baseline` with a dedicated API token limited to
Notifications Read/Write. The reviewed plan must contain exactly two account-
wide policies and no Tunnel, DNS or Access changes. Apply the saved plan, then
restart only the synthetic connector through Systems Manager to prove alert
delivery and recovery.

## Convex

Read `convex/_generated/ai/guidelines.md` and use the deployment guard before a
deployment-affecting command.

```sh
npm run check:convex-codegen
npm run generate:convex
npx tsc --noEmit
CONVEX_DEPLOYMENT=dev:fastidious-barracuda-66 \
  npx convex dev --once --typecheck disable --codegen enable --tail-logs disable
```

The first three commands validate/generate against the configured target. The
fourth explicitly mutates the synthetic development deployment that Package 4
currently serves. Its internal typecheck is disabled only because the preceding
repository typecheck is authoritative and the Convex compiler omits browser
DOM types used by an unrelated client-only read model. Do not use
`npx convex deploy` here: it targets the separate
`resilient-octopus-968` production deployment. Use `npx convex run --prod` only
for an explicitly approved production function and exact arguments. Never
discover by mutating multiple deployments.

## Stripe

Capture the official response into a protected temporary file and retain only
bounded metadata:

```sh
stripe_tmp="$(mktemp)"
chmod 0600 "$stripe_tmp"
trap 'rm -f "$stripe_tmp"' EXIT

stripe webhook_endpoints retrieve \
  we_1UBYM070N4UjLqHtknl4R8Ep --color off >"$stripe_tmp"
node -e '
  const fs = require("node:fs")
  const x = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  console.log(JSON.stringify({
    id: x.id,
    url: x.url,
    status: x.status,
    livemode: x.livemode,
    enabled_events: x.enabled_events,
  }))
' "$stripe_tmp"
```

Use the same pattern for Checkout Sessions, retaining only ID, status, payment
status, mode, currency, exact total, PaymentIntent reference, and timestamps.
Never retain customer, PaymentMethod, card, or provider payloads. Use Stripe's
official resend/refund interfaces for release journeys; AE accepts only
verified webhook evidence.

## Private k3s through Systems Manager

Use an SSM session or bounded Run Command against the exact instance. Confirm
the instance ID from live tags first. Read-only health examples inside the host:

```sh
sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml \
  kubectl -n package4-release get deployments,pods
sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml \
  kubectl -n package4-release rollout status deployment/gateway --timeout=5m
sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml \
  kubectl -n package4-release rollout status deployment/ledger --timeout=5m
sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml \
  kubectl -n package4-release rollout status deployment/ledger-worker --timeout=5m
```

Do not print Kubernetes Secrets, environment values, database URIs, or pod
descriptions containing secret references. Restart one component at a time and
verify exact Formance readback after each restart.

## Recovery drill cleanup

Cleanup is destructive and is deliberately split in two. Only after Joel
approves the recorded evidence, run the exact-name Formance cleanup on the k3s
host. Transfer the checked-in script unchanged through the bounded Systems
Manager session or Run Command, verify its digest, then invoke that host copy:

```sh
sudo /tmp/cleanup-restored-formance.sh \
  package4-release-restore-YYYYMMDD --confirmed-by-joel
```

The script rejects any other target and proves the authoritative source before
and after removal. Then generate and review a saved destroy plan for the same
dated recovery root. Apply that exact plan only after confirming it contains no
source database, source role, or source network deletion. Never destroy AWS
first: that can leave secret-bearing Formance Settings in the cluster.

## Application release gates

```sh
npm run lint
npm run typecheck
npm run check:convex-codegen
npm run test:imports
npm run test:ui-contract
npm run test:e2e:authenticated:required
npm run build
```

Add the focused Package 4, real Formance, protocol-parity, restore, and Base
Sepolia gates required by the current Package 4 release plan. Missing
credentials or provider access are failures to produce release evidence, not
test skips.

## Official references

- [OpenTofu S3 backend and locking](https://opentofu.org/docs/language/settings/backends/s3/)
- [AWS CLI role profiles and MFA](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html)
- [Vercel deployment inspection](https://vercel.com/docs/cli/inspect)
- [Stripe webhook delivery and resend](https://docs.stripe.com/webhooks?lang=node)
- [Cloudflare Tunnel token lifecycle](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/)
