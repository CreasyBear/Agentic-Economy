---
name: deployment-operations
description: Inventory, trace, change, recover, and assess Agentic Economy deployments using the repository's declared architecture and official provider tooling. Use for environment setup, deployment diagnosis, service linkage, credential rotation or revocation, release evidence, infrastructure handoff, or maturity assessment; not for application feature implementation.
---

# Deployment Operations

Operate the deployed system as one evidence-backed control plane. A green web
page is not proof that its identity, backend, financial authority, settlement,
and recovery dependencies are the intended instances.

## Sources of truth

Read these in order before acting:

1. `../../../PRODUCT.md` and `../../../AGENTS.md` for product and repository authority.
2. `../../../docs/operations/deployment-registry.yaml` for the last verified environment
   identities and links.
3. `../../../infra/package4/` and `../../../src/lib/deployment/manifest.ts` for declared topology,
   versions, required configuration, and readiness probes.
4. The official provider CLI/API readback for what exists now.
5. `../../../docs/operations/deployment-maturity.md` for the current evidence gaps.

Live provider readback outranks the registry. The registry is a dated snapshot,
not an authority for a consequential action. If live state and documentation
disagree, stop the change, report the drift, and update the documentation only
after the actual state is understood.

## Classify the request

Choose one operating mode before running commands:

- **Inventory:** read-only identity, topology, linkage, version, health, and
  credential-location checks.
- **Change:** plan/apply, application deploy, environment binding, or service
  configuration mutation.
- **Credential lifecycle:** create, bind, overlap-rotate, revoke, or investigate
  compromise.
- **Recovery:** outage diagnosis, exact-reference readback, restart, or restore.
- **Maturity:** compare declared, deployed, verified, recoverable, and
  production-ready evidence.

For inventory or maturity work, read
`../../../docs/operations/deployment-architecture.md` and run
`scripts/deployment_snapshot.sh` when its official CLIs are available. For a
change, read `../../../docs/operations/deployment-commands.md`. For any credential work,
read `../../../docs/operations/credentials-and-access.md`. For Package 4 financial
recovery, also read `../../../docs/guides/package-4-operations.md`.

## Target proof

Before a mutation, resolve and announce one target card:

```text
environment: <stable environment id>
authority: development | synthetic release | production
git revision: <full sha>
web project + deployment: <provider ids>
backend project + deployment: <provider ids>
identity instance: <provider id>
financial authority: <ledger + gateway host>
payment/custody mode: test | live
requested mutation: <one bounded change>
blast radius: <services/data/users affected>
rollback boundary: <before-value rollback or fix-forward>
```

Resolve every field from live readback or mark it `NOT VERIFIED`. Never infer a
missing identity from naming similarity.

## Execution rules

1. Use official provider CLIs and checked-in OpenTofu. Do not make an
   unrecorded console-only infrastructure change, write a custom cloud client,
   or query PostgreSQL as a product API.
2. Treat provider environment names such as `production` as provider labels,
   not AE production authority. The `package4-release` Vercel production target
   remains a synthetic release environment.
3. Inspect the full saved OpenTofu plan before apply. Never apply an unreviewed
   streaming plan.
4. Use exact environment/project/deployment identifiers. Do not rely on a CLI's
   ambient default project.
5. Read health and release identity after every change. For financial paths,
   also use exact Formance, Stripe, or Invocation references.
6. Possible external submission is never retried blindly. Read the durable
   reference; otherwise retain `outcome_unknown`.
7. Do not destroy, clear, import-replace, or restore over an authoritative
   environment without an explicit target-bound approval and fresh census.
8. After the first value-bearing Formance transaction, ledger correction is
   append-only and infrastructure rollback is fix-forward.

## Credential rules

- Never print, paste into chat, commit, diff, log, screenshot, or place a secret
  in a command argument when an official environment/file/stdin mechanism exists.
- Inventory credential **names, owners, storage locations, generations, and
  last-verified times**—never values.
- Retrieve secrets only from their owning provider at the last responsible
  moment. Use a mode-`0600` temporary file or process-local variable, and remove
  it on exit.
- Rotation is successor creation → dual validity where supported → bind all
  consumers → prove new path → revoke predecessor → prove fail-closed old path.
- Root users, long-lived access keys, shared credentials, missing owners, and
  credentials with no tested revocation are release blockers.
- Never use `convex env list`, Vercel environment downloads, Terraform state,
  or secret-manager reads as general diagnostics because they can disclose
  values. Use name-only or metadata-only commands.

## Evidence and maturity

Classify each capability independently:

- `DECLARED`: represented in source/IaC.
- `DEPLOYED`: live resource identity verified.
- `VERIFIED`: intended success and failure behavior observed.
- `RECOVERABLE`: restart/restore/rotation exercised within its target.
- `PRODUCTION_READY`: owner, alerts, backups, access, runbook, and release gate
  are current; external approvals are active where required.

Do not average these into a reassuring score. The environment maturity is the
lowest state of any critical path needed for the requested operation. A skipped
or unavailable check is `NOT VERIFIED`, never a pass.

After work, update all three together:

- `../../../docs/operations/deployment-registry.yaml` with observed identities and time;
- `../../../docs/operations/deployment-maturity.md` with evidence and open blockers;
- the relevant release-evidence document with durable references, not secrets.

Commit only reviewed operational files or exact hunks. Report the commands run,
their outcomes, remaining unverified behavior, and whether the working tree is
clean.

## Required stop conditions

Stop before mutation when the target is ambiguous, the identity is root or
unexpected, the plan includes an undeclared resource, live and declared
environments conflict, a required backup cannot be verified, value-bearing data
was not censused, a secret would be exposed, or the action crosses the stated
rollback boundary.
