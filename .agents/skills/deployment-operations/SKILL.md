---
name: deployment-operations
description: Inventory, deploy, diagnose and recover Agentic Economy using the canonical deployment map, declared topology and official provider tooling.
---

# Deployment Operations

A green web page does not prove matching identity, backend, financial authority
or recovery evidence. Apply this procedure to the actual affected services.
Existing task authorization carries forward; this skill does not add an approval
stop for a release already authorized by Joel.

## Sources and operating mode

1. Read `../../../PRODUCT.md` and `../../../AGENTS.md` for authority.
2. Use `../../../docs/operations/deployments.md` for current destinations and
   `../../../TODOS.md` for the active queue.
3. Read `../../../src/lib/deployment/manifest.ts` and relevant checked-in
   `../../../infra/package4/` topology for declared bindings and readiness rules.
4. Verify current resource identities through official provider CLI/API readback.
5. Use `../../../docs/production-readiness-plan.md` for dated acceptance and
   recovery evidence; `../../../docs/operations/journey-alerts.md` for alerts.

Choose inventory, change, recovery or credential lifecycle. Read only the
relevant operation's runbook/source. Live readback establishes current state;
old synthetic-release inventories do not override newer verified production
state or Joel's current authorization. Resolve material drift before mutation.
Do not recreate deleted registries or maintain duplicate status ledgers.

`scripts/deployment_snapshot.sh` is an optional read-only multi-provider census.
It requires explicit environment, app, Formance and Convex targets. Missing CLIs
are unverified sections, not evidence of provider failure. For a bounded web or
Convex release, use the corresponding native CLI and exact-reference probes;
do not make unrelated AWS/Stripe credentials a prerequisite.

## Target and release contract

Before mutation resolve and announce:

- environment and authority: development, approved synthetic or production;
- exact Git source, web project/deployment and backend project/deployment;
- identity host, financial ledger/gateway and custody mode when affected;
- bounded requested change, blast radius and rollback/fix-forward boundary.

Unverified identities remain explicitly unverified. Do not infer them from a
similar name or an ambient CLI project. For application deployment, verify
nonsecret bindings without dumping environment values and preserve the current
payment audience and policy revisions unless their change is authorized.

Run repository-required `check`, affected behavior tests and full `gate` on the
candidate before merging to main. Backend and web deployment are separate:
deploy the exact backend source, merge by matching head, then verify the web
alias and release endpoint. Read health, readiness and relevant signed-in
journeys independently. Match the deployed tree to the gated source.

A possible external submission is never retried blindly: read its durable
reference, or retain `outcome_unknown`. No last-good financial evidence may
replace a failed current check. After value-bearing transactions, corrections
are append-only and financial recovery is fix-forward. Code rollback does not
authorize restoring a ledger or database.

## Infrastructure and credentials

Use official provider CLIs and checked-in OpenTofu. Inspect a saved plan before
apply; do not query PostgreSQL as a product API or make unrecorded console-only
infrastructure changes. AWS account `197716152388` retains the existing private
single-host/Multi-AZ RDS footprint and USD 400 monthly ceiling. No second
permanent stack is approved. For AWS changes verify the exact non-root caller,
region and existing recovery boundary; use the declared role/profile appropriate
to the current stack. Console login/MFA is a human interaction; CLI readback proves
results. Old `package4-release` synthetic authority must never be promoted.

Never print, commit, diff, log or screenshot secrets. Inventory names, owners,
storage locations and generations only. Retrieve a required secret from its
owning provider at the last responsible moment into process memory or a mode-0600
temporary file; remove the file on exit. Do not dump process environments,
`convex env list`, downloaded Vercel environments or Terraform state for diagnosis.

Credential rotation is successor creation, dual validity where supported,
consumer binding, new-path proof, predecessor revocation and old-path refusal.
Do not rotate credentials outside scope just because a historical record names
a deferred exposure. New access, destruction, database replacement or crossing
a financial recovery boundary requires its own applicable authorization.

## Evidence and completion

Distinguish declared, deployed, verified and recoverable evidence. A skipped or
unavailable check is not a pass; a point-in-time pass is not sustained availability.
For treasury/readiness stability, observe normal scheduled cycles across the
relevant evidence expiry window and report remaining provider failures explicitly.

Update `../../../docs/operations/deployments.md` and the existing release PR or
readiness record with material provenance and acceptance. Update `TODOS.md` only
when the remaining queue changes. Retain exact rollback references and deliberate
recovery records; remove temporary task artifacts. Report outcome, relevant
commands/results, material limitations and working-tree state.
