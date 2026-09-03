# Deployment operations

Start here when operating or handing off an Agentic Economy environment.

| Document | Use it for |
| --- | --- |
| `deployment-architecture.md` | Understand service boundaries, authority, request flows, and environment lifecycle. |
| `deployment-registry.yaml` | Find the last verified environment IDs, links, versions, credential custody, and blockers. |
| `credentials-and-access.md` | Identify key ownership, safe custody, rotation, revocation, and compromise response. |
| `deployment-commands.md` | Run approved read, plan, deploy, health, and recovery entry points. |
| `deployment-maturity.md` | See what is declared, deployed, verified, recoverable, and still blocking production. |
| `../guides/package-4-operations.md` | Recover Package 4 financial and managed-x402 failures. |
| `../guides/package-4-release-evidence.md` | Review the Package 4 release gate and durable evidence. |

Codex operators should use the repository skill at
`.agents/skills/deployment-operations/SKILL.md`. Human operators can follow the
same target-proof, secret-handling, evidence, and stop conditions in these
documents.

## First five minutes

1. Confirm the repository path, branch, full Git SHA, and clean/dirty state.
2. Read `deployment-registry.yaml`; treat its timestamp as an expiry warning,
   not proof of current state.
3. Run the read-only deployment snapshot with an MFA-backed non-root AWS role.
4. Compare live identities and health with the registry and requested target.
5. Resolve any drift before planning or running a mutation.

No junior engineer should be asked to infer an environment from a hostname,
reuse a root profile, retrieve all environment values, operate from Terraform
state directly, or retry a possibly submitted financial command.
