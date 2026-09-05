#!/usr/bin/env bash

set -euo pipefail

environment="${AE_DEPLOYMENT_ENVIRONMENT:-package4-release}"
aws_profile="${AE_DEPLOYMENT_AWS_PROFILE:-}"
aws_human_profile="${AE_DEPLOYMENT_AWS_HUMAN_PROFILE:-package4-release-user}"
app_url="${AE_DEPLOYMENT_APP_URL:-https://agentic-economy-package4-release.vercel.app}"
formance_url="${AE_DEPLOYMENT_FORMANCE_URL:-https://formance-release.aecon.ai}"
stripe_snapshot_destination_id="${AE_DEPLOYMENT_STRIPE_SNAPSHOT_DESTINATION_ID:-${AE_DEPLOYMENT_STRIPE_WEBHOOK_ID:-}}"
stripe_v2_destination_id="${AE_DEPLOYMENT_STRIPE_V2_DESTINATION_ID:-}"
convex_deployment="${AE_DEPLOYMENT_CONVEX_DEPLOYMENT:-}"
cloudflare_account_id="${AE_DEPLOYMENT_CLOUDFLARE_ACCOUNT_ID:-}"
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
printf 'convex_deployment: %s\n' "${convex_deployment:-NOT_SET}"
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
    elif [[ "$identity_arn" != *":assumed-role/Package4ReleaseOpenTofu/"* ]]; then
      printf 'caller_safety: UNEXPECTED_NON_ROOT_IDENTITY\n'
      failures=$((failures + 1))
    else
      printf 'caller_safety: EXPECTED_ASSUMED_ROLE\n'
    fi
    instance_json="$(aws ec2 describe-instances --profile "$aws_profile" --region "$aws_region" \
      --filters "Name=tag:Environment,Values=$environment" 'Name=instance-state-name,Values=pending,running,stopping,stopped' \
      --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,Type:InstanceType,Private:PrivateIpAddress,Public:PublicIpAddress,Az:Placement.AvailabilityZone}' \
      --output json)"
    printf '%s\n' "$instance_json" | jq .
    instance_id="$(jq -r '.[0].Id // empty' <<<"$instance_json")"
    vpc_id="$(aws ec2 describe-instances --profile "$aws_profile" --region "$aws_region" \
      --instance-ids "$instance_id" --query 'Reservations[0].Instances[0].VpcId' --output text 2>/dev/null || true)"
    aws rds describe-db-instances --profile "$aws_profile" --region "$aws_region" \
      --query "DBInstances[?contains(DBInstanceIdentifier, \`$environment\`)].{Id:DBInstanceIdentifier,Status:DBInstanceStatus,Engine:Engine,Version:EngineVersion,MultiAZ:MultiAZ,Public:PubliclyAccessible,Encrypted:StorageEncrypted,BackupDays:BackupRetentionPeriod,DeletionProtection:DeletionProtection,LatestRestorableTime:LatestRestorableTime}" \
      --output json
    rds_arn="$(aws rds describe-db-instances --profile "$aws_profile" --region "$aws_region" \
      --db-instance-identifier "$environment-formance" --query 'DBInstances[0].DBInstanceArn' --output text 2>/dev/null || true)"
    aws cloudwatch describe-alarms --profile "$aws_profile" --region "$aws_region" \
      --alarm-name-prefix "$environment" \
      --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}' \
      --output json

    section "AWS alert delivery"
    alert_topic_arn="arn:aws:sns:${aws_region}:${aws_account_id}:${environment}-package4-alerts"
    subscriptions="$(aws sns list-subscriptions-by-topic --profile "$aws_profile" --region "$aws_region" \
      --topic-arn "$alert_topic_arn" --query 'Subscriptions[].{Endpoint:Endpoint,Protocol:Protocol,Status:SubscriptionArn}' \
      --output json 2>/dev/null || true)"
    printf '%s\n' "${subscriptions:-[]}" | jq .
    confirmed_subscribers="$(jq '[.[] | select(.Status != "PendingConfirmation" and .Status != "Deleted")] | length' <<<"${subscriptions:-[]}")"
    if [[ "$confirmed_subscribers" -lt 1 ]]; then
      not_verified "infrastructure SNS topic has no confirmed subscriber"
    fi

    section "AWS recovery points"
    if [[ -z "$rds_arn" || "$rds_arn" == "None" ]]; then
      not_verified "authoritative RDS ARN is unavailable"
    else
      latest_backup_state="$(aws backup list-backup-jobs --profile "$aws_profile" --region "$aws_region" \
        --by-resource-arn "$rds_arn" --query 'reverse(sort_by(BackupJobs,&CreationDate))[0].State' --output text 2>/dev/null || true)"
      latest_copy_state="$(aws backup list-copy-jobs --profile "$aws_profile" --region "$aws_region" \
        --query "reverse(sort_by(CopyJobs[?ResourceArn==\`$rds_arn\`],&CreationDate))[0].State" \
        --output text 2>/dev/null || true)"
      printf 'latest_backup: %s\n' "${latest_backup_state:-UNAVAILABLE}"
      printf 'latest_regional_copy: %s\n' "${latest_copy_state:-UNAVAILABLE}"
      if [[ "$latest_backup_state" != "COMPLETED" ]]; then failures=$((failures + 1)); fi
      if [[ "$latest_copy_state" != "COMPLETED" ]]; then failures=$((failures + 1)); fi
    fi

    section "AWS account baseline"
    if account_summary="$(aws iam get-account-summary --profile "$aws_profile" --query 'SummaryMap.{RootMFA:AccountMFAEnabled,RootAccessKeys:AccountAccessKeysPresent}' --output json 2>/dev/null)"; then
      account_summary_profile="$aws_profile"
    else
      account_summary="$(aws iam get-account-summary --profile "$aws_human_profile" --query 'SummaryMap.{RootMFA:AccountMFAEnabled,RootAccessKeys:AccountAccessKeysPresent}' --output json 2>/dev/null || true)"
      account_summary_profile="$aws_human_profile"
    fi
    if [[ -z "$account_summary" ]]; then account_summary='{}'; fi
    root_mfa="$(jq -r '.RootMFA // 0' <<<"$account_summary")"
    root_keys="$(jq -r '.RootAccessKeys // 0' <<<"$account_summary")"
    trail_logging="$(aws cloudtrail get-trail-status --profile "$aws_profile" --region "$aws_region" \
      --name agentic-economy-audit --query 'IsLogging' --output text 2>/dev/null || true)"
    trail_controls="$(aws cloudtrail describe-trails --profile "$aws_profile" --region "$aws_region" \
      --trail-name-list agentic-economy-audit --query 'trailList[0].{MultiRegion:IsMultiRegionTrail,Validation:LogFileValidationEnabled}' --output json 2>/dev/null || true)"
    guardduty_detector_id="$(aws guardduty list-detectors --profile "$aws_profile" --region "$aws_region" \
      --query 'DetectorIds[0]' --output text 2>/dev/null || true)"
    guardduty_status="$(aws guardduty get-detector --profile "$aws_profile" --region "$aws_region" \
      --detector-id "$guardduty_detector_id" --query 'Status' --output text 2>/dev/null || true)"
    active_analyzers="$(aws accessanalyzer list-analyzers --profile "$aws_profile" --region "$aws_region" \
      --query 'length(analyzers[?status==`ACTIVE`])' --output text 2>/dev/null || true)"
    ebs_encryption="$(aws ec2 get-ebs-encryption-by-default --profile "$aws_profile" --region "$aws_region" \
      --query 'EbsEncryptionByDefault' --output text 2>/dev/null || true)"
    s3_block_json="$(aws s3control get-public-access-block --profile "$aws_profile" --account-id "$aws_account_id" \
      --query 'PublicAccessBlockConfiguration' --output json 2>/dev/null || true)"
    if [[ -z "$trail_controls" ]]; then trail_controls='{}'; fi
    if [[ -z "$s3_block_json" ]]; then s3_block_json='{}'; fi
    s3_block_count="$(jq '[.[] | select(. == true)] | length' <<<"$s3_block_json")"
    printf 'root_mfa: %s\n' "${root_mfa:-0}"
    printf 'root_access_keys: %s\n' "${root_keys:-0}"
    printf 'account_summary_profile: %s\n' "$account_summary_profile"
    printf 'cloudtrail_logging: %s\n' "${trail_logging:-UNAVAILABLE}"
    printf 'cloudtrail_controls: %s\n' "${trail_controls:-UNAVAILABLE}"
    printf 'guardduty_status: %s\n' "${guardduty_status:-UNAVAILABLE}"
    printf 'active_access_analyzers: %s\n' "${active_analyzers:-UNAVAILABLE}"
    printf 'default_ebs_encryption: %s\n' "${ebs_encryption:-UNAVAILABLE}"
    printf 's3_public_block_controls: %s/4\n' "${s3_block_count:-0}"
    if [[ "$root_mfa" != "1" || "$root_keys" != "0" ]]; then failures=$((failures + 1)); fi
    if [[ "$trail_logging" != "True" ]]; then failures=$((failures + 1)); fi
    if [[ "$(jq -r '(.MultiRegion == true and .Validation == true)' <<<"$trail_controls")" != "true" ]]; then failures=$((failures + 1)); fi
    if [[ "$guardduty_status" != "ENABLED" ]]; then failures=$((failures + 1)); fi
    if [[ "${active_analyzers:-0}" -lt 1 ]]; then failures=$((failures + 1)); fi
    if [[ "$ebs_encryption" != "True" ]]; then failures=$((failures + 1)); fi
    if [[ "${s3_block_count:-0}" -ne 4 ]]; then failures=$((failures + 1)); fi

    flow_log_status="$(aws ec2 describe-flow-logs --profile "$aws_profile" --region "$aws_region" \
      --filter "Name=resource-id,Values=$vpc_id" \
      --query 'FlowLogs[0].FlowLogStatus' --output text 2>/dev/null || true)"
    flow_retention="$(aws s3api get-bucket-lifecycle-configuration --profile "$aws_profile" --region "$aws_region" \
      --bucket "agentic-economy-audit-${aws_account_id}-${aws_region}" \
      --query 'Rules[?ID==`vpc-flow-log-retention`].Expiration.Days | [0]' --output text 2>/dev/null || true)"
    audit_retention="$(aws s3api get-bucket-lifecycle-configuration --profile "$aws_profile" --region "$aws_region" \
      --bucket "agentic-economy-audit-${aws_account_id}-${aws_region}" \
      --query 'Rules[?ID==`bounded-audit-retention`].Expiration.Days | [0]' --output text 2>/dev/null || true)"
    printf 'vpc_flow_log_status: %s\n' "${flow_log_status:-UNAVAILABLE}"
    printf 'vpc_flow_retention_days: %s\n' "${flow_retention:-UNAVAILABLE}"
    printf 'audit_retention_days: %s\n' "${audit_retention:-UNAVAILABLE}"
    if [[ "$flow_log_status" != "ACTIVE" || "$flow_retention" != "14" || "$audit_retention" != "365" ]]; then failures=$((failures + 1)); fi

    section "AWS bounded log retention"
    log_groups="$(aws logs describe-log-groups --profile "$aws_profile" --region "$aws_region" \
      --query "logGroups[?starts_with(logGroupName, \`/agentic-economy/$environment/\`) || starts_with(logGroupName, \`/aws/rds/instance/$environment-formance/\`)].{Name:logGroupName,Days:retentionInDays}" \
      --output json 2>/dev/null || true)"
    printf '%s\n' "${log_groups:-[]}" | jq .
    invalid_retention="$(jq '[.[] | select(.Days != 30)] | length' <<<"${log_groups:-[]}")"
    required_log_groups="$(jq 'length' <<<"${log_groups:-[]}")"
    if [[ "$required_log_groups" -lt 5 || "$invalid_retention" -ne 0 ]]; then
      not_verified "required log groups are missing or have unbounded retention"
    fi

    section "AWS telemetry readiness"
    association_states="$(aws ssm list-associations --profile "$aws_profile" --region "$aws_region" \
      --query "Associations[?AssociationName==\`$environment-install-cloudwatch-agent\` || AssociationName==\`$environment-configure-cloudwatch-agent\`].{Name:AssociationName,Status:Overview.Status}" \
      --output json 2>/dev/null || true)"
    printf '%s\n' "${association_states:-[]}" | jq .
    successful_associations="$(jq '[.[] | select(.Status == "Success")] | length' <<<"${association_states:-[]}")"
    metric_start="$(node -e 'process.stdout.write(new Date(Date.now()-20*60*1000).toISOString())')"
    metric_end="$(node -e 'process.stdout.write(new Date().toISOString())')"
    disk_points="$(aws cloudwatch get-metric-statistics --profile "$aws_profile" --region "$aws_region" \
      --namespace "AgenticEconomy/$environment" --metric-name disk_used_percent \
      --dimensions "Name=InstanceId,Value=$instance_id" --start-time "$metric_start" --end-time "$metric_end" \
      --period 300 --statistics Average --query 'length(Datapoints)' --output text 2>/dev/null || true)"
    memory_points="$(aws cloudwatch get-metric-statistics --profile "$aws_profile" --region "$aws_region" \
      --namespace "AgenticEconomy/$environment" --metric-name mem_used_percent \
      --dimensions "Name=InstanceId,Value=$instance_id" --start-time "$metric_start" --end-time "$metric_end" \
      --period 300 --statistics Average --query 'length(Datapoints)' --output text 2>/dev/null || true)"
    actionable_alarms="$(aws cloudwatch describe-alarms --profile "$aws_profile" --region "$aws_region" \
      --alarm-name-prefix "$environment-" --query 'length(MetricAlarms[?length(AlarmActions) > `0`])' --output text 2>/dev/null || true)"
    printf 'disk_metric_datapoints: %s\n' "${disk_points:-0}"
    printf 'memory_metric_datapoints: %s\n' "${memory_points:-0}"
    printf 'actionable_alarms: %s\n' "${actionable_alarms:-0}"
    if [[ "$successful_associations" -lt 2 || "${disk_points:-0}" -lt 1 || "${memory_points:-0}" -lt 1 || "${actionable_alarms:-0}" -lt 8 ]]; then
      not_verified "CloudWatch Agent, metric datapoints, or alarm actions are not ready"
    fi

    section "AWS budgets and observed cost"
    aws budgets describe-budget --profile "$aws_profile" --account-id "$aws_account_id" \
      --budget-name 'My Monthly Cost Budget' --query 'Budget.{Name:BudgetName,Limit:BudgetLimit}' --output json \
      || not_verified "US$20 early-warning budget is unavailable"
    aws budgets describe-budget --profile "$aws_profile" --account-id "$aws_account_id" \
      --budget-name 'Agentic Economy USD 400 Runway' --query 'Budget.{Name:BudgetName,Limit:BudgetLimit}' --output json \
      || not_verified "US$400 runway budget is unavailable"
    runway_notifications="$(aws budgets describe-notifications-for-budget --profile "$aws_profile" \
      --account-id "$aws_account_id" --budget-name 'Agentic Economy USD 400 Runway' \
      --query 'Notifications[].{Type:NotificationType,Threshold:Threshold,Operator:ComparisonOperator}' --output json 2>/dev/null || true)"
    printf '%s\n' "${runway_notifications:-[]}" | jq .
    expected_runway_notifications="$(jq '[
      any(.[]; .Type == "ACTUAL" and .Threshold == 50 and .Operator == "GREATER_THAN"),
      any(.[]; .Type == "ACTUAL" and .Threshold == 80 and .Operator == "GREATER_THAN"),
      any(.[]; .Type == "ACTUAL" and .Threshold == 100 and .Operator == "GREATER_THAN"),
      any(.[]; .Type == "FORECASTED" and .Threshold == 100 and .Operator == "GREATER_THAN")
    ] | all' <<<"${runway_notifications:-[]}")"
    runway_subscriber_failures=0
    for notification in 'ACTUAL 50' 'ACTUAL 80' 'ACTUAL 100' 'FORECASTED 100'; do
      read -r notification_type notification_threshold <<<"$notification"
      subscriber_count="$(aws budgets describe-subscribers-for-notification --profile "$aws_profile" \
        --account-id "$aws_account_id" --budget-name 'Agentic Economy USD 400 Runway' \
        --notification "NotificationType=$notification_type,ComparisonOperator=GREATER_THAN,Threshold=$notification_threshold,ThresholdType=PERCENTAGE" \
        --query 'length(Subscribers[?SubscriptionType==`EMAIL` && Address==`accounts@agentic-economy.ai`])' --output text 2>/dev/null || true)"
      if [[ "${subscriber_count:-0}" -lt 1 ]]; then runway_subscriber_failures=$((runway_subscriber_failures + 1)); fi
    done
    printf 'runway_notification_set: %s\n' "$expected_runway_notifications"
    printf 'runway_notification_subscriber_failures: %s\n' "$runway_subscriber_failures"
    if [[ "$expected_runway_notifications" != "true" || "$runway_subscriber_failures" -ne 0 ]]; then
      not_verified "US$400 runway alert thresholds or subscribers do not match the baseline"
    fi
    cost_start="$(node -e 'const d=new Date(); process.stdout.write(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-01`)')"
    cost_end="$(node -e 'const d=new Date(Date.now()+86400000); process.stdout.write(d.toISOString().slice(0,10))')"
    forecast_end="$(node -e 'const d=new Date(); const n=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)); process.stdout.write(n.toISOString().slice(0,10))')"
    if ! aws ce get-cost-and-usage --profile "$aws_profile" --time-period "Start=$cost_start,End=$cost_end" \
      --granularity MONTHLY --metrics UnblendedCost --query 'ResultsByTime[0].Total.UnblendedCost' --output json; then
      not_verified "Cost Explorer has not completed initial ingestion"
    fi
    if ! aws ce get-cost-forecast --profile "$aws_profile" --time-period "Start=$cost_end,End=$forecast_end" \
      --granularity MONTHLY --metric UNBLENDED_COST --query 'Total' --output json; then
      not_verified "Cost Explorer cannot yet provide an observed monthly forecast"
    fi
  fi
fi

section "Stripe restricted keys"
stripe_command_key="${STRIPE_SECRET_KEY:-}"
stripe_readback_key="${STRIPE_READBACK_KEY:-}"
expected_stripe_key_prefix='rk_live_'
if [[ "$environment" == "package4-release" ]]; then expected_stripe_key_prefix='rk_test_'; fi
if [[ "$stripe_command_key" != "$expected_stripe_key_prefix"* ]]; then
  not_verified "STRIPE_SECRET_KEY is missing or is not the environment-scoped restricted command key"
else
  printf 'command_key_prefix: VALID_RESTRICTED_KEY\n'
fi
if [[ "$stripe_readback_key" != "$expected_stripe_key_prefix"* ]]; then
  not_verified "STRIPE_READBACK_KEY is missing or is not the environment-scoped restricted readback key"
else
  printf 'readback_key_prefix: VALID_RESTRICTED_KEY\n'
fi

section "Stripe event destinations"
if [[ -z "$stripe_snapshot_destination_id" || -z "$stripe_v2_destination_id" ]]; then
  not_verified "set both Stripe destination identifiers to inspect metadata"
elif ! need stripe || ! need node; then
  not_verified "Stripe CLI or Node.js is unavailable"
else
  snapshot_events='["checkout.session.async_payment_failed","checkout.session.async_payment_succeeded","checkout.session.completed","refund.created","refund.failed","refund.updated"]'
  thin_events='["v2.core.account.created","v2.core.account.updated","v2.core.account.closed","v2.core.account[configuration.recipient].updated","v2.core.account[configuration.recipient].capability_status_updated"]'
  if stripe webhook_endpoints retrieve "$stripe_snapshot_destination_id" --color off >"$tmp_dir/stripe-snapshot.json" 2>"$tmp_dir/stripe-snapshot.err"; then
    jq '{id,url,status,livemode,api_version,enabled_events}' "$tmp_dir/stripe-snapshot.json"
    if ! jq -e --argjson expected "$snapshot_events" '
      .status == "enabled"
      and .api_version == "2026-07-29.dahlia"
      and (.url | endswith("/api/stripe/webhook"))
      and ((.enabled_events | sort) == ($expected | sort))
    ' "$tmp_dir/stripe-snapshot.json" >/dev/null; then
      failures=$((failures + 1))
    fi
  else
    not_verified "Stripe snapshot destination metadata could not be read"
  fi
  if stripe v2 core event_destinations retrieve "$stripe_v2_destination_id" \
      --include webhook_endpoint.url --color off >"$tmp_dir/stripe-v2.json" 2>"$tmp_dir/stripe-v2.err"; then
    jq '{id,name,status,enabled_events,webhook_endpoint}' "$tmp_dir/stripe-v2.json"
    if ! jq -e --argjson expected "$thin_events" '
      .status == "enabled"
      and ((.enabled_events | sort) == ($expected | sort))
      and (.webhook_endpoint.url | endswith("/api/stripe/webhook/accounts-v2"))
    ' "$tmp_dir/stripe-v2.json" >/dev/null; then
      failures=$((failures + 1))
    fi
  else
    not_verified "Stripe Accounts v2 destination metadata could not be read"
  fi
fi

section "Stripe durable inbox"
if [[ -z "$convex_deployment" ]]; then
  not_verified "set AE_DEPLOYMENT_CONVEX_DEPLOYMENT to the exact release deployment"
elif ! need npx || ! need jq; then
  not_verified "Node package runner or jq is unavailable"
else
  stale_before="$(( $(date +%s) * 1000 - 300000 ))"
  if inbox_health="$(npx convex run moneyStripeWebhookInbox:readHealth \
      "{\"staleBefore\":$stale_before}" --deployment "$convex_deployment" 2>/dev/null)"; then
    printf '%s\n' "$inbox_health" | jq .
    if [[ "$(jq -r '(.stalled == 0 and .failed == 0 and .reconciliationRequired == 0)' <<<"$inbox_health")" != "true" ]]; then
      failures=$((failures + 1))
    fi
  else
    not_verified "Stripe inbox health could not be read"
  fi
fi

section "Cloudflare account alerts"
if [[ -z "$cloudflare_account_id" || -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  not_verified "set the Cloudflare account ID and narrow Notifications token"
elif ! need curl || ! need jq; then
  not_verified "curl or jq is unavailable"
else
  cloudflare_status="$(curl --silent --show-error --output "$tmp_dir/cloudflare-policies.json" --write-out '%{http_code}' \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/accounts/${cloudflare_account_id}/alerting/v3/policies" || true)"
  printf 'policy_read: HTTP %s\n' "${cloudflare_status:-FAILED}"
  if [[ "$cloudflare_status" != "200" ]]; then
    not_verified "Cloudflare notification policies could not be read"
  else
    jq '[.result[] | select(.alert_type == "tunnel_health_event" or .alert_type == "expiring_service_token_alert") | {id,name,alert_type,enabled,mechanisms}]' "$tmp_dir/cloudflare-policies.json"
    cloudflare_policy_set="$(jq -r --arg email 'joel@agentic-economy.ai' '
      [.result[] | select(
        .enabled == true
        and (.alert_type == "tunnel_health_event" or .alert_type == "expiring_service_token_alert")
        and any(.mechanisms.email[]?; .id == $email)
      ) | .alert_type] | unique | sort
      == ["expiring_service_token_alert","tunnel_health_event"]
    ' "$tmp_dir/cloudflare-policies.json")"
    if [[ "$cloudflare_policy_set" != "true" ]]; then failures=$((failures + 1)); fi
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
