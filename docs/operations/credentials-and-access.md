# Deployment credentials and access

This document records credential ownership, custody, consumers, and lifecycle.
It must never contain a credential value. Use the variable and provider object
names below to locate a secret through its owning system.

## Rules

- Humans use named identities, MFA, and short-lived sessions.
- Workloads use environment-specific service identities with the narrowest
  supported scope.
- A repository stores references, required names, policy, and rotation steps;
  it never stores secret values.
- Never diagnose by downloading every environment variable or printing secret
  manager payloads. Read metadata and names first.
- Rotation is incomplete until the successor works and the predecessor is
  proven rejected.
- A secret exposed in terminal output, chat, logs, screenshots, or CI is
  compromised even when no malicious use is known.

## Credential map

| Credential family | Owner and source | Runtime consumers | Repository contract | Rotation authority |
| --- | --- | --- | --- | --- |
| AWS human login | IAM user `joel-package4-deployer` | Human console and `aws login` only | `infra/package4/bootstrap/state-and-deployer.yaml` | AWS IAM |
| AWS deployment session | STS role `Package4ReleaseOpenTofu` | OpenTofu and read-only AWS CLI | Bootstrap role and local AWS profile | AWS STS after MFA |
| OpenTofu state | S3 bucket encrypted by KMS | OpenTofu only | `backend.hcl.example` | AWS S3/KMS |
| Cloudflare management token | Cloudflare API token | OpenTofu provider only | Provider environment; never a tfvars value | Cloudflare API Tokens |
| Cloudflare Tunnel token | Cloudflare remotely managed Tunnel | `cloudflared` replicas in private k3s | AWS Secrets Manager reference in module | Cloudflare Tunnels |
| Cloudflare Access client | Cloudflare Access service token | Convex Node Action/Formance client | `AE_FORMANCE_ACCESS_CLIENT_ID`, `AE_FORMANCE_ACCESS_CLIENT_SECRET` | Cloudflare Access |
| RDS master credential | RDS managed secret | Formance operator bootstrap/runtime | RDS secret ARN granted to k3s role | AWS RDS/Secrets Manager |
| Vercel deployment identity | Vercel login/OIDC | Vercel CLI and deployment | `.vercel/project.json`; ignored local token | Vercel |
| Convex deployment identity | Convex login/deploy key | Convex CLI and Vercel server calls | `.env.local`, `convex.json`, deployment manifest | Convex |
| Clerk application secrets | Clerk test instance | Vercel, Convex authentication, webhook verifier | Clerk variable names in deployment manifest | Clerk |
| Stripe API and webhook secrets | Stripe sandbox account | Vercel Checkout/webhook boundary | Stripe variable names in deployment manifest | Stripe |
| CDP custody credentials | Coinbase Developer Platform | Consequential x402 Node runtime only | CDP/x402 variable names in deployment manifest | CDP |
| Source-write key families | AE release environment | Narrow signed source-write scopes | `AE_SOURCE_WRITE_KEY_*` families | AE deployment operator |
| Server-function token | AE release environment | Vercel-to-Convex protected calls | `AE_CONVEX_SERVER_FUNCTION_TOKEN` | AE deployment operator |

Public keys, project IDs, deployment names, URLs, and secret ARNs are
identifiers, not authenticators. They may be recorded in the deployment
registry. Secret values and recovery material may not.

## Current access finding

At the 2026-09-03 capture:

- the local `package4-release` AWS profile resolves to the AWS account root and
  uses long-lived shared credentials;
- the intended `package4-release-deployer` profile cannot assume
  `Package4ReleaseOpenTofu`;
- the `package4-release-user` profile resolves to the named human IAM user.

The root profile is bootstrap-only and is not acceptable for routine operation.
Do not give it to a junior engineer or use it in automation. Repair the role
trust/permission path, prove MFA-backed assumption, then remove the root
credential from the local AWS credential store. This is a production blocker.

## Junior engineer operating boundary

Before a junior engineer operates the release environment, provide a named
identity, MFA, repository access, and read-only memberships for the exact
Vercel, Convex, Clerk, Stripe, Cloudflare, and AWS release resources. The
current bootstrap does not define a junior AWS role; create and review that
role before delegating AWS access. Do not share the founder/deployer login.

Safe unsupervised work:

- run the read-only deployment snapshot and application test gates;
- inspect bounded health, deployment metadata, alarms, and provider statuses;
- create and review an OpenTofu plan without applying it;
- update the registry, maturity record, runbooks, and evidence in a pull request;
- diagnose against redacted references without retrieving secret values.

Senior-reviewed or paired work:

- OpenTofu apply, Vercel or Convex release deployment;
- environment-variable changes and any credential lifecycle action;
- Stripe event resend/refund, Clerk configuration, or CDP signing policy;
- service restart, database restore, financial correction, or release closure.

Never delegate root credentials, direct PostgreSQL access, Terraform state
pull/push, force-unlock, broad secret-manager reads, destructive cleanup, or
blind retry of a possibly submitted financial command.

Onboarding is complete only when the engineer can draw the funding and managed
Call paths, identify every authority from live readback, detect an intentional
registry mismatch, produce a saved no-change plan, explain the rollback versus
fix-forward boundary, and execute a supervised recovery drill without viewing
a secret.

## Rotation patterns

### Cloudflare Access service token

Use the checked-in overlap inputs. Create the successor through OpenTofu by
advancing `cloudflare_access_secret_version` and setting
`previous_cloudflare_access_secret_expires_at`. Update every Vercel and Convex
consumer, prove authenticated Formance health, then allow the predecessor to
expire and prove it receives HTTP 401. Do not rotate only one consumer.

### Cloudflare Tunnel token

Cloudflare owns token refresh. For compromise, refresh the token through the
official Tunnel control, replace the AWS Secrets Manager version, update the
k3s `cloudflare-tunnel-token` Secret, restart both replicas, force-disconnect
old connections, and prove the protected hostname remains healthy. The current
synthetic release token has an explicitly accepted temporary exposure; it must
be rotated before production.

### Stripe

Create or roll the sandbox/live restricted key in Stripe, bind the successor to
the exact environment, deploy, run hosted Checkout plus signed webhook
readback, then revoke the predecessor. A webhook signing-secret change requires
updating the endpoint consumer before the old secret is removed. Never copy
PaymentMethod or card data into AE.

### Clerk

Rotate instance secrets and webhook signing secrets in the owning Clerk
instance. Bind Vercel and Convex independently, verify sign-in, server auth,
reverification, and one signed webhook, then revoke the predecessor. Never
replace Clerk with an AE password/MFA implementation.

### CDP/x402

Use CDP credential and wallet policy generations. Bind expected address,
account/project policy IDs, custody limits, and generation in the environment.
Prove Base Sepolia first. Revoke the predecessor only after the new generation
passes identity, balance, policy, signing, and redaction checks. Possible
payment submission is reconciled by existing Invocation reference.

### Source-write and server-function keys

Generate a successor with an approved cryptographic tool, store it directly in
the consuming provider environments, advance the derived key identity, prove
the narrow scope, and remove the predecessor after the overlap. Never reuse one
key across billing, protected, catalog, operator, repair, and session scopes.

## Compromise response

1. Identify the exact credential family, environment, consumers, and last known
   safe generation without displaying the value.
2. Suspend only the affected entry path. Preserve status and recovery.
3. Rotate through the owning provider's maintained mechanism.
4. Rebind all consumers and verify the successor.
5. Revoke or force-disconnect the predecessor.
6. Search bounded source, logs, build output, screenshots, and release evidence
   for the exposed form.
7. Record a redacted security event and update deployment maturity.

If the owning provider cannot invalidate the predecessor, treat the dependent
environment as compromised and replace the affected service identity or
environment boundary.

## Official references

- [AWS CLI role profiles and MFA](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html)
- [OpenTofu S3 state, locking, and authentication](https://opentofu.org/docs/language/settings/backends/s3/)
- [Cloudflare Tunnel token rotation](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/)
- [Cloudflare Access service-token rotation API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/service_tokens/methods/rotate/)
- [Clerk API-key rotation](https://clerk.com/docs/guides/secure/rotate-api-keys)
- [Stripe webhook operations](https://docs.stripe.com/webhooks?lang=node)
