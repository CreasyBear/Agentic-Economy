#!/usr/bin/env bash

set -euo pipefail

environment="${AE_DEPLOYMENT_ENVIRONMENT:-package4-release}"
aws_profile="${AE_DEPLOYMENT_AWS_PROFILE:-}"
app_url="${AE_DEPLOYMENT_APP_URL:-https://agentic-economy-package4-release.vercel.app}"
formance_url="${AE_DEPLOYMENT_FORMANCE_URL:-https://formance-release.aecon.ai}"
stripe_webhook_id="${AE_DEPLOYMENT_STRIPE_WEBHOOK_ID:-}"
aws_region="${AE_DEPLOYMENT_AWS_REGION:-ap-southeast-2}"
strict="${AE_DEPLOYMENT_STRICT:-0}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

failures=0
skips=0

section() {
  printf '\n## %s\n' "$1"
}

not_verified() {
  printf 'NOT VERIFIED: %s\n' "$1"
  skips=$((skips + 1))
  if [[ "$strict" == "1" ]]; then
    failures=$((failures + 1))
  fi
}

need() {
  command -v "$1" >/dev/null 2>&1
}

section "Target"
printf 'environment: %s\n' "$environment"
printf 'application: %s\n' "$app_url"
printf 'repository: %s\n' "$(git rev-parse --show-toplevel)"
printf 'revision: %s\n' "$(git rev-parse HEAD)"
printf 'branch: %s\n' "$(git branch --show-current)"
if [[ -n "$(git status --porcelain)" ]]; then
  printf 'working_tree: DIRTY\n'
else
  printf 'working_tree: CLEAN\n'
fi

section "Application probes"
if ! need curl; then
  not_verified "curl is unavailable"
else
  for endpoint in health ready v1/release; do
    output="$tmp_dir/${endpoint//\//-}.json"
    status="$(curl --silent --show-error --output "$output" --write-out '%{http_code}' "$app_url/api/$endpoint" || true)"
    printf '%s: HTTP %s ' "$endpoint" "${status:-FAILED}"
    valid_json=0
    if [[ -s "$output" ]] && need node; then
      if node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(JSON.stringify(value))' "$output"; then
        valid_json=1
      fi
    fi
    printf '\n'
    if [[ "$status" != "200" || "$valid_json" != "1" ]]; then failures=$((failures + 1)); fi
  done
fi

section "Formance edge"
if need curl; then
  status="$(curl --silent --show-error --output "$tmp_dir/formance-unauthenticated" --write-out '%{http_code}' "$formance_url/_healthcheck" || true)"
  printf 'unauthenticated_gateway: HTTP %s (expected 401)\n' "${status:-FAILED}"
  if [[ "$status" != "401" ]]; then failures=$((failures + 1)); fi
else
  not_verified "curl is unavailable"
fi

section "AWS"
if [[ -z "$aws_profile" ]]; then
  not_verified "set AE_DEPLOYMENT_AWS_PROFILE to an MFA-backed role profile"
elif ! need aws; then
  not_verified "AWS CLI is unavailable"
else
  identity_arn="$(aws sts get-caller-identity --profile "$aws_profile" --query Arn --output text 2>/dev/null || true)"
  if [[ -z "$identity_arn" || "$identity_arn" == "None" ]]; then
    not_verified "AWS profile cannot obtain caller identity"
  else
    printf 'caller_arn: %s\n' "$identity_arn"
    aws_account_id="$(aws sts get-caller-identity --profile "$aws_profile" --query Account --output text)"
    if [[ "$identity_arn" == *":root" ]]; then
      printf 'caller_safety: BLOCKED_ROOT_IDENTITY\n'
      failures=$((failures + 1))
    else
      printf 'caller_safety: NON_ROOT\n'
    fi
    aws ec2 describe-instances --profile "$aws_profile" --region "$aws_region" \
      --filters "Name=tag:Environment,Values=$environment" 'Name=instance-state-name,Values=pending,running,stopping,stopped' \
      --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType,Private:PrivateIpAddress,Public:PublicIpAddress,Az:Placement.AvailabilityZone}' \
      --output json
    aws rds describe-db-instances --profile "$aws_profile" --region "$aws_region" \
      --query "DBInstances[?contains(DBInstanceIdentifier, \`$environment\`)].{Id:DBInstanceIdentifier,Status:DBInstanceStatus,Engine:Engine,Version:EngineVersion,MultiAZ:MultiAZ,Public:PubliclyAccessible,Encrypted:StorageEncrypted,BackupDays:BackupRetentionPeriod,DeletionProtection:DeletionProtection,LatestRestorableTime:LatestRestorableTime}" \
      --output json
    aws cloudwatch describe-alarms --profile "$aws_profile" --region "$aws_region" \
      --alarm-name-prefix "$environment" \
      --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}' \
      --output json
    aws sns list-subscriptions-by-topic --profile "$aws_profile" --region "$aws_region" \
      --topic-arn "arn:aws:sns:${aws_region}:${aws_account_id}:${environment}-package4-alerts" \
      --query 'Subscriptions[].{Protocol:Protocol,Status:SubscriptionArn}' \
      --output json || not_verified "alert subscription could not be read"
  fi
fi

section "Stripe webhook"
if [[ -z "$stripe_webhook_id" ]]; then
  not_verified "set AE_DEPLOYMENT_STRIPE_WEBHOOK_ID to inspect metadata"
elif ! need stripe || ! need node; then
  not_verified "Stripe CLI or Node.js is unavailable"
else
  if stripe webhook_endpoints retrieve "$stripe_webhook_id" --color off >"$tmp_dir/stripe.json" 2>"$tmp_dir/stripe.err"; then
    node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); console.log(JSON.stringify({id:x.id,url:x.url,status:x.status,livemode:x.livemode,enabled_events:x.enabled_events},null,2))' "$tmp_dir/stripe.json"
  else
    not_verified "Stripe webhook metadata could not be read"
  fi
fi

section "Result"
if [[ "$failures" -eq 0 ]]; then
  if [[ "$skips" -eq 0 ]]; then
    printf 'snapshot: PASS\n'
  else
    printf 'snapshot: INCOMPLETE_WITH_%s_SKIP(S)\n' "$skips"
  fi
else
  printf 'snapshot: FAIL (%s blocking finding(s))\n' "$failures"
  exit 1
fi
