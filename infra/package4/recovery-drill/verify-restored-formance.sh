#!/usr/bin/env bash

set -euo pipefail

drill_name="${1:?drill name required}"
drill_endpoint="${2:?drill database endpoint required}"
drill_secret_arn="${3:?drill database secret ARN required}"
baseline_path="${4:?recorded baseline path required}"
command_path="${5:?original command path required}"
restore_time="${6:?exact restored UTC timestamp required}"
aws_region="${7:-ap-southeast-2}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../../.." && pwd)"
forward_pid=""
forward_log=""
local_port="18082"
source_namespace="package4-release"
source_ledger="agentic-economy-release"

if [[ ! "$drill_name" =~ ^package4-release-restore-[0-9]{8}$ ]]; then
  printf 'refusing unexpected drill name: %s\n' "$drill_name" >&2
  exit 1
fi

test -r "$baseline_path"
test -r "$command_path"
baseline_path="$(realpath -- "$baseline_path")"
command_path="$(realpath -- "$command_path")"
test "$(jq -r '.restoreTime' "$baseline_path")" = "$restore_time"
test "$(jq -r '.summary.ledger' "$baseline_path")" = "$source_ledger"
test "$(node -p 'process.versions.node.split(".")[0]')" = "22"
test "$(npm --version)" = "11.5.1"
test -x "$repo_root/node_modules/.bin/tsx"

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

operator_namespace="formance-system"
operator_deployment="formance-operator"
operator_replicas="$(kubectl -n "$operator_namespace" get deployment "$operator_deployment" -o jsonpath='{.spec.replicas}')"
test "$operator_replicas" = "1"

source_gateway_ip="$(kubectl -n "$source_namespace" get service gateway -o jsonpath='{.spec.clusterIP}')"
curl --fail --silent --show-error "http://${source_gateway_ip}:8080/_healthcheck" >/dev/null

# A different Kubernetes namespace or loopback port cannot establish database
# isolation. Bind both supplied connection facts to the actual named RDS target
# before reading its secret or creating a workload that can access it.
drill_identity="$(aws rds describe-db-instances --region "$aws_region" \
  --db-instance-identifier "$drill_name" --query DBInstances --output json)"
source_identity="$(aws rds describe-db-instances --region "$aws_region" \
  --db-instance-identifier "${source_namespace}-formance" --query DBInstances --output json)"
if ! jq -en --argjson drill "$drill_identity" --argjson source "$source_identity" \
  --arg name "$drill_name" --arg source_name "${source_namespace}-formance" \
  --arg endpoint "$drill_endpoint" --arg secret "$drill_secret_arn" \
  --arg region "$aws_region" '
  ($drill | length) == 1 and ($source | length) == 1 and
  $drill[0].DBInstanceIdentifier == $name and $source[0].DBInstanceIdentifier == $source_name and
  $drill[0].DBInstanceArn == ("arn:aws:rds:" + $region + ":197716152388:db:" + $name) and
  $source[0].DBInstanceArn == ("arn:aws:rds:" + $region + ":197716152388:db:" + $source_name) and
  $drill[0].DBInstanceStatus == "available" and $drill[0].PubliclyAccessible == false and
  $drill[0].StorageEncrypted == true and $drill[0].Endpoint.Address == $endpoint and
  $drill[0].MasterUserSecret.SecretArn == $secret and
  ($drill[0].DbiResourceId | type) == "string" and ($drill[0].DbiResourceId | length) > 0 and
  ($source[0].DbiResourceId | type) == "string" and ($source[0].DbiResourceId | length) > 0 and
  $drill[0].DbiResourceId != $source[0].DbiResourceId and
  $drill[0].Endpoint.Address != $source[0].Endpoint.Address and
  $drill[0].MasterUserSecret.SecretArn != $source[0].MasterUserSecret.SecretArn
  ' >/dev/null; then
  printf 'restored database identity does not match the isolated drill; refusing connection\n' >&2
  exit 1
fi
unset drill_identity source_identity

database_secret="$(aws secretsmanager get-secret-value \
  --region "$aws_region" \
  --secret-id "$drill_secret_arn" \
  --query SecretString \
  --output text)"
database_username="$(jq -r '.username' <<<"$database_secret")"
database_password="$(jq -r '.password' <<<"$database_secret")"
database_uri="$(DB_USER="$database_username" DB_PASSWORD="$database_password" python3 - "$drill_endpoint" <<'PY'
import os
import sys
from urllib.parse import quote

print("postgresql://%s:%s@%s:5432/formance?sslmode=require" % (
    quote(os.environ["DB_USER"], safe=""),
    quote(os.environ["DB_PASSWORD"], safe=""),
    sys.argv[1],
))
PY
)"
unset database_secret database_username database_password

kubectl apply -f - <<YAML
apiVersion: formance.com/v1beta1
kind: Versions
metadata:
  name: ${drill_name}-pins
spec:
  gateway: 'v2.3.1@sha256:239926753312410ee9a602aa0bffe1e5c89cd340540a98a6df58694f3d6e4165'
  ledger: 'v2.4.14@sha256:9a2902d8d04c67c8a5f6270fc297f8ca5c6cf288f463dfad3984e5d376179c43'
---
apiVersion: formance.com/v1beta1
kind: Settings
metadata:
  name: ${drill_name}-postgres
spec:
  stacks: ['${drill_name}']
  key: postgres.ledger.uri
  value: "${database_uri}"
---
apiVersion: formance.com/v1beta1
kind: Settings
metadata:
  name: ${drill_name}-caddy-image
spec:
  stacks: ['${drill_name}']
  key: caddy.image
  value: 'docker.io/library/caddy:2.7.6-alpine@sha256:2e1d4592f1718bb47645da5a83a846fe19094f18e6c921fdf56d174f05c63213'
---
apiVersion: formance.com/v1beta1
kind: Settings
metadata:
  name: ${drill_name}-schema-enforcement
spec:
  stacks: ['${drill_name}']
  key: ledger.schema-enforcement-mode
  value: strict
---
apiVersion: formance.com/v1beta1
kind: Stack
metadata:
  name: '${drill_name}'
spec:
  versionsFromFile: ${drill_name}-pins
  disabled: false
---
apiVersion: formance.com/v1beta1
kind: Gateway
metadata:
  name: ${drill_name}-gateway
spec:
  stack: '${drill_name}'
---
apiVersion: formance.com/v1beta1
kind: Ledger
metadata:
  name: ${drill_name}-ledger
spec:
  stack: '${drill_name}'
  dev: false
  debug: false
YAML
unset database_uri

for _ in $(seq 1 120); do
  kubectl get namespace "$drill_name" >/dev/null 2>&1 && break
  sleep 5
done
kubectl get namespace "$drill_name" >/dev/null

for deployment in gateway ledger ledger-worker; do
  for _ in $(seq 1 120); do
    kubectl -n "$drill_name" get deployment "$deployment" >/dev/null 2>&1 && break
    sleep 5
  done
  kubectl -n "$drill_name" rollout status "deployment/$deployment" --timeout=10m
done

restore_operator() {
  local restore_status=0
  kubectl -n "$operator_namespace" scale deployment "$operator_deployment" --replicas="$operator_replicas" >/dev/null || restore_status=$?
  if test "$operator_replicas" != "0"; then
    kubectl -n "$operator_namespace" rollout status "deployment/$operator_deployment" --timeout=5m >/dev/null || restore_status=$?
  fi
  return "$restore_status"
}
stop_forward() {
  if [[ -n "$forward_pid" ]]; then
    kill "$forward_pid" 2>/dev/null || true
    wait "$forward_pid" 2>/dev/null || true
    forward_pid=""
  fi
  if [[ -n "$forward_log" ]]; then rm -f -- "$forward_log"; fi
}
restore_on_exit() {
  local script_status=$?
  trap - EXIT
  stop_forward
  if ! restore_operator; then
    printf 'failed to restore the Formance operator; keep financial entry suspended\n' >&2
    exit 1
  fi
  exit "$script_status"
}
trap restore_on_exit EXIT

# Formance uses STACK as the PostgreSQL data selector and does not expose a
# separate recovery override. Pause only the operator control loop while the
# isolated drill workloads read the source selector inside the restored DB.
# Source writers were quiesced for baseline capture and the recorded backup cutoff.
# This later verification does not read or change source financial state.
kubectl -n "$operator_namespace" scale deployment "$operator_deployment" --replicas=0 >/dev/null
kubectl -n "$operator_namespace" rollout status "deployment/$operator_deployment" --timeout=5m >/dev/null
kubectl -n "$drill_name" set env deployment/ledger deployment/ledger-worker \
  "STACK=${source_namespace}" \
  "POSTGRES_DATABASE=${source_namespace}-ledger" >/dev/null
for deployment in ledger ledger-worker; do
  kubectl -n "$drill_name" rollout status "deployment/$deployment" --timeout=10m
  test "$(kubectl -n "$drill_name" get deployment "$deployment" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="STACK")].value}')" = "$source_namespace"
  test "$(kubectl -n "$drill_name" get deployment "$deployment" -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="POSTGRES_DATABASE")].value}')" = "${source_namespace}-ledger"
done

# Only this isolated namespace is forwarded. The CLI refuses reuse of the source
# loopback endpoint saved in the baseline. No database credential reaches Node.
forward_log="$(mktemp)"
kubectl -n "$drill_name" port-forward --address 127.0.0.1 service/gateway "$local_port:8080" >"$forward_log" 2>&1 &
forward_pid=$!
for _ in $(seq 1 30); do
  kill -0 "$forward_pid" 2>/dev/null || { printf 'isolated gateway forward failed\n' >&2; exit 1; }
  if grep -q "^Forwarding from 127.0.0.1:${local_port} ->" "$forward_log" \
    && curl --fail --silent --show-error "http://127.0.0.1:${local_port}/_healthcheck" >/dev/null 2>&1; then break; fi
  sleep 1
done
kill -0 "$forward_pid" 2>/dev/null
grep -q "^Forwarding from 127.0.0.1:${local_port} ->" "$forward_log"
curl --fail --silent --show-error "http://127.0.0.1:${local_port}/_healthcheck" >/dev/null

verification_output="$(
  cd "$repo_root" || exit 1
  npm exec --no -- tsx tools/release/formance-restore.ts verify \
    --gateway "http://127.0.0.1:${local_port}" \
    --baseline "$baseline_path" \
    --command-file "$command_path" \
    --restore-time "$restore_time"
)"

printf 'drill_namespace=%s\n' "$drill_name"
printf 'restore_time=%s\n' "$restore_time"
stop_forward
restore_operator
trap - EXIT
printf '%s\n' "$verification_output"
