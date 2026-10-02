#!/usr/bin/env bash

set -euo pipefail

source_namespace="${1:?source namespace required}"
source_ledger="${2:?source ledger required}"
drill_name="${3:?drill name required}"
confirmation="${4:-}"

if [[ ! "$source_namespace" =~ ^[a-z][a-z0-9-]{2,30}$ ]]; then
  printf 'refusing invalid source namespace\n' >&2
  exit 1
fi
if [[ ! "$source_ledger" =~ ^[a-z][a-z0-9-]{2,62}$ ]]; then
  printf 'refusing invalid source ledger\n' >&2
  exit 1
fi
if [[ ! "$drill_name" =~ ^${source_namespace}-restore-[0-9]{8}$ ]]; then
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

# A previous attempt may have removed the namespace before Settings or Versions.
# Exact named deletes can safely finish that attempt even when the namespace is gone.
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
  remaining_namespace="$(kubectl get namespace "$drill_name" --ignore-not-found -o name)"
  if [[ -z "$remaining_namespace" ]]; then
    break
  fi
  sleep 5
done
if [[ -n "$remaining_namespace" ]]; then
  printf 'drill namespace still exists: %s\n' "$drill_name" >&2
  exit 1
fi

curl --fail --silent --show-error "http://${source_gateway_ip}:8080/_healthcheck" >/dev/null
curl --fail --silent --show-error \
  "http://${source_gateway_ip}:8080/api/ledger/v2/${source_ledger}/transactions?pageSize=1" >/dev/null

printf 'drill_namespace=%s\n' "$drill_name"
printf 'source_namespace=%s\n' "$source_namespace"
printf 'source_ledger=%s\n' "$source_ledger"
printf 'source_verification=PASS\n'
printf 'cleanup=PASS\n'
