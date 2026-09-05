#!/usr/bin/env bash

set -euo pipefail

drill_name="${1:?drill name required}"
confirmation="${2:-}"
source_namespace="package4-release"
source_ledger="agentic-economy-release"

if [[ ! "$drill_name" =~ ^package4-release-restore-[0-9]{8}$ ]]; then
  printf 'refusing unexpected drill name: %s\n' "$drill_name" >&2
  exit 1
fi

if test "$confirmation" != "--confirmed-by-joel"; then
  printf 'cleanup requires Joel approval and --confirmed-by-joel\n' >&2
  exit 1
fi

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml

source_gateway_ip="$(kubectl -n "$source_namespace" get service gateway -o jsonpath='{.spec.clusterIP}')"
curl --fail --silent --show-error "http://${source_gateway_ip}:8080/_healthcheck" >/dev/null
curl --fail --silent --show-error \
  "http://${source_gateway_ip}:8080/api/ledger/v2/${source_ledger}/transactions?pageSize=1" >/dev/null
kubectl get namespace "$drill_name" >/dev/null

kubectl delete ledger "${drill_name}-ledger" --ignore-not-found --wait=true
kubectl delete gateway "${drill_name}-gateway" --ignore-not-found --wait=true
kubectl delete stack "$drill_name" --ignore-not-found --wait=true
kubectl delete settings \
  "${drill_name}-postgres" \
  "${drill_name}-caddy-image" \
  "${drill_name}-schema-enforcement" \
  --ignore-not-found --wait=true
kubectl delete versions "${drill_name}-pins" --ignore-not-found --wait=true

for _ in $(seq 1 120); do
  if ! kubectl get namespace "$drill_name" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
if kubectl get namespace "$drill_name" >/dev/null 2>&1; then
  printf 'drill namespace still exists: %s\n' "$drill_name" >&2
  exit 1
fi

curl --fail --silent --show-error "http://${source_gateway_ip}:8080/_healthcheck" >/dev/null
curl --fail --silent --show-error \
  "http://${source_gateway_ip}:8080/api/ledger/v2/${source_ledger}/transactions?pageSize=1" >/dev/null

printf 'drill_namespace=%s\n' "$drill_name"
printf 'source_namespace=%s\n' "$source_namespace"
printf 'source_verification=PASS\n'
printf 'cleanup=PASS\n'
