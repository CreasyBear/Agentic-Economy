#!/usr/bin/env bash

set -euo pipefail

drill_name="${1:?drill name required}"
drill_endpoint="${2:?drill database endpoint required}"
drill_secret_arn="${3:?drill database secret ARN required}"
aws_region="${4:-ap-southeast-2}"
source_namespace="package4-release"
source_ledger="agentic-economy-release"
probe_ledger="${drill_name}-probe"

if [[ ! "$drill_name" =~ ^package4-release-restore-[0-9]{8}$ ]]; then
  printf 'refusing unexpected drill name: %s\n' "$drill_name" >&2
  exit 1
fi

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

operator_namespace="formance-system"
operator_deployment="formance-operator"
operator_replicas="$(kubectl -n "$operator_namespace" get deployment "$operator_deployment" -o jsonpath='{.spec.replicas}')"
test "$operator_replicas" = "1"

source_gateway_ip="$(kubectl -n "$source_namespace" get service gateway -o jsonpath='{.spec.clusterIP}')"
curl --fail --silent --show-error "http://${source_gateway_ip}:8080/_healthcheck" >/dev/null

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
  ledger: 'v2.4.12@sha256:4d72bd5cbf0a83a0cce9b37ea96a376ba33197517e40b97d16c43c36753727df'
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
restore_on_exit() {
  local script_status=$?
  trap - EXIT
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
# Existing source data-plane workloads remain online throughout.
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

drill_gateway_ip="$(kubectl -n "$drill_name" get service gateway -o jsonpath='{.spec.clusterIP}')"
source_base="http://${source_gateway_ip}:8080/api/ledger/v2/${source_ledger}"
drill_base="http://${drill_gateway_ip}:8080/api/ledger/v2/${source_ledger}"

curl --fail --silent --show-error "http://${drill_gateway_ip}:8080/_healthcheck" >/dev/null

source_schema_versions="$(curl --fail --silent --show-error "$source_base/schemas" | jq -Sc '[.cursor.data[].version] | sort')"
drill_schema_versions="$(curl --fail --silent --show-error "$drill_base/schemas" | jq -Sc '[.cursor.data[].version] | sort')"
source_transactions="$(curl --fail --silent --show-error "$source_base/transactions?pageSize=1000" | jq -Sc '.cursor.data | map({id,reference,postings,metadata}) | sort_by(.id)' | sha256sum | cut -d' ' -f1)"
drill_transactions="$(curl --fail --silent --show-error "$drill_base/transactions?pageSize=1000" | jq -Sc '.cursor.data | map({id,reference,postings,metadata}) | sort_by(.id)' | sha256sum | cut -d' ' -f1)"
source_balances="$(curl --fail --silent --show-error "$source_base/aggregate/balances" | jq -Sc '.balances' | sha256sum | cut -d' ' -f1)"
drill_balances="$(curl --fail --silent --show-error "$drill_base/aggregate/balances" | jq -Sc '.balances' | sha256sum | cut -d' ' -f1)"
first_reference="$(curl --fail --silent --show-error "$drill_base/transactions?pageSize=1" | jq -r '.cursor.data[0].reference // "none"')"

test "$source_schema_versions" = "$drill_schema_versions"
test "$source_transactions" = "$drill_transactions"
test "$source_balances" = "$drill_balances"

probe_create_status="$(curl --silent --show-error \
  --output /dev/null \
  --write-out '%{http_code}' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"metadata":{"purpose":"recovery-drill-idempotency"}}' \
  "http://${drill_gateway_ip}:8080/api/ledger/v2/${probe_ledger}")"
case "$probe_create_status" in
  200|201|202|204|409) ;;
  *) printf 'unexpected probe-ledger create status: %s\n' "$probe_create_status" >&2; exit 1 ;;
esac

probe_payload="$(jq -nc --arg reference "${drill_name}-idempotency" '{metadata:{purpose:"recovery-drill"},reference:$reference,postings:[{source:"world",destination:"recovery:probe",asset:"AUD/6",amount:1}]}')"
for _ in 1 2; do
  probe_post_status="$(curl --silent --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request POST \
    --header 'Content-Type: application/json' \
    --header "Idempotency-Key: ${drill_name}-idempotency" \
    --data "$probe_payload" \
    "http://${drill_gateway_ip}:8080/api/ledger/v2/${probe_ledger}/transactions?force=true")"
  case "$probe_post_status" in
    200|201|202|204|409) ;;
    *) printf 'unexpected idempotency probe status: %s\n' "$probe_post_status" >&2; exit 1 ;;
  esac
done
unset probe_payload probe_post_status

probe_count="$(curl --fail --silent --show-error "http://${drill_gateway_ip}:8080/api/ledger/v2/${probe_ledger}/transactions?pageSize=100" \
  | jq --arg reference "${drill_name}-idempotency" '[.cursor.data[] | select(.reference == $reference)] | length')"
test "$probe_count" = "1"

printf 'drill_namespace=%s\n' "$drill_name"
printf 'schema_versions=%s\n' "$drill_schema_versions"
printf 'transaction_digest=%s\n' "$drill_transactions"
printf 'balance_digest=%s\n' "$drill_balances"
printf 'known_transaction_reference=%s\n' "$first_reference"
printf 'idempotent_replay_count=%s\n' "$probe_count"
printf 'verification=PASS\n'

trap - EXIT
restore_operator
