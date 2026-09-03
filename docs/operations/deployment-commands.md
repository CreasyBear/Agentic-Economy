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

## Read-only environment snapshot

From the repository root:

```sh
AE_DEPLOYMENT_AWS_PROFILE=package4-release-deployer \
AE_DEPLOYMENT_STRIPE_WEBHOOK_ID=we_1UBYM070N4UjLqHtknl4R8Ep \
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
  ghcr.io/opentofu/opentofu:1.12.6 init -backend=false

docker run --rm -v "$PWD:/workspace" \
  -w /workspace/infra/package4/environments/package4-release \
  ghcr.io/opentofu/opentofu:1.12.6 validate
```

For a live plan, use external backend and variable files that contain only
non-secret values. Supply AWS and Cloudflare credentials through their official
environment/workload identity. Initialize the partial backend first, then save
and review the plan:

```sh
docker run --rm -it \
  -e AWS_PROFILE=package4-release-deployer \
  -e CLOUDFLARE_API_TOKEN \
  -v "$HOME/.aws:/root/.aws:ro" \
  -v "$PWD:/workspace" \
  -v "$AE_TOFU_INPUT_DIR:/operator-input:ro" \
  -w /workspace/infra/package4/environments/package4-release \
  ghcr.io/opentofu/opentofu:1.12.6 \
  init -backend-config=/operator-input/backend.hcl

docker run --rm -it \
  -e AWS_PROFILE=package4-release-deployer \
  -e CLOUDFLARE_API_TOKEN \
  -v "$HOME/.aws:/root/.aws:ro" \
  -v "$PWD:/workspace" \
  -v "$AE_TOFU_INPUT_DIR:/operator-input:ro" \
  -w /workspace/infra/package4/environments/package4-release \
  ghcr.io/opentofu/opentofu:1.12.6 \
  plan -out=/workspace/output/package4-release.tfplan \
  -var-file=/operator-input/package4-release.auto.tfvars
```

Do not run `apply` until the saved plan, target identity, blast radius, backups,
and rollback boundary have been reviewed. Apply only the saved plan file:

```sh
docker run --rm -it \
  -e AWS_PROFILE=package4-release-deployer \
  -e CLOUDFLARE_API_TOKEN \
  -v "$HOME/.aws:/root/.aws:ro" \
  -v "$PWD:/workspace" \
  -v "$AE_TOFU_INPUT_DIR:/operator-input:ro" \
  -w /workspace/infra/package4/environments/package4-release \
  ghcr.io/opentofu/opentofu:1.12.6 \
  apply /workspace/output/package4-release.tfplan
```

Do not use `-auto-approve` or regenerate the plan during apply.

## Vercel

Inspect project, deploy, then confirm the canonical alias and release SHA:

```sh
npx vercel@59.11.2 inspect \
  https://agentic-economy-package4-release.vercel.app \
  --scope creasybears-projects

npx vercel@59.11.2 deploy --prod --scope creasybears-projects

curl --fail --silent --show-error \
  https://agentic-economy-package4-release.vercel.app/api/v1/release
```

`vercel env ls` is acceptable for names and classifications. Do not pull or
print environment values as part of diagnosis. Change one named variable at a
time through Vercel's maintained command/UI, redeploy, and verify.

## Convex

Read `convex/_generated/ai/guidelines.md` and use the deployment guard before a
deployment-affecting command.

```sh
npm run check:convex-codegen
npm run generate:convex
npx convex deploy
```

The first two commands validate/generate against the configured target. The
third mutates the resolved deployment and requires the target to be announced
first. Use `npx convex run --prod` only for an explicitly approved production
function and exact arguments. Never discover by mutating multiple deployments.

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
