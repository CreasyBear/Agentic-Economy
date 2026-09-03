# Package 4 release infrastructure

This directory is the reusable deployment definition for the private Formance
Community financial authority. `environments/package4-release` is the sandbox
release instance. A future production root must call the same module with a
fresh state backend, database, ledger, hostname and credentials; the release
instance is never promoted in place.

## Deployed boundary

- AWS Sydney VPC with public NAT subnets, private application subnets and
  isolated database subnets across two availability zones.
- One private Ubuntu 24.04 ARM64 k3s host, administered through Systems Manager.
  It has no public address, SSH key or inbound security-group rule.
- Private encrypted Multi-AZ RDS PostgreSQL 16 with seven days of PITR,
  deletion protection and a final snapshot. Primary PITR is the five-minute
  recovery-point control.
- Nightly encrypted AWS Backup copy to Melbourne retained for seven days. This
  is regional disaster evidence; it is not represented as a five-minute copy.
- The official Formance operator installs Gateway, Ledger API and Ledger worker
  only. Images and component versions are immutable digests.
- A remotely configured Cloudflare Tunnel publishes Gateway. Cloudflare Access
  admits only the environment service token; direct origin access is absent.

No Formance Payments, Auth, Console, Reconciliation, Wallets, Flows or Webhooks
module is deployed. PostgreSQL and Kubernetes APIs are not exposed publicly.

## Required operator inputs

OpenTofu state must already use a versioned, KMS-encrypted S3 bucket with native
state locking. Copy `backend.hcl.example` and the example variable file outside
the repository, then provide AWS and Cloudflare credentials through their
official environment variables or workload identity. Never place credentials
in a `.tfvars` file.

The apply identity needs bounded AWS permissions for the declared resources and
Cloudflare permissions for Tunnel, DNS and Access. A separate subscription must
be attached to the emitted alert-topic ARN. The state is sensitive because
Cloudflare returns service-token material to the provider; encrypted state is
part of the security boundary.

Validate with the pinned toolchain before planning:

```sh
docker run --rm -v "$PWD:/workspace" \
  -w /workspace/infra/package4/environments/package4-release \
  ghcr.io/opentofu/opentofu:1.12.6 init -backend=false
docker run --rm -v "$PWD:/workspace" \
  -w /workspace/infra/package4/environments/package4-release \
  ghcr.io/opentofu/opentofu:1.12.6 validate
```

For a real plan, initialize with the external backend file and provide the
variable file outside the checkout. Review the complete saved plan before
applying. The module deliberately has no destroy shortcut: RDS deletion
protection and `prevent_destroy` require an explicit reviewed change.

## Application binding

After infrastructure health passes, bind the dedicated Vercel and Convex
release environments using supported provider interfaces:

- `AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE=synthetic_vps_fixture`
- `AE_FORMANCE_ENVIRONMENT=sandbox`
- `AE_FORMANCE_GATEWAY_URL` from the module output
- `AE_FORMANCE_LEDGER=agentic-economy-release`
- `AE_FORMANCE_REQUEST_TIMEOUT_MS=10000`
- the Cloudflare Access client ID and secret read from the emitted Secrets
  Manager ARN

Use a dedicated Clerk test instance and Stripe sandbox destination. Production
validation permits test credentials only when the synthetic release profile is
present; the ordinary production profile continues to require live credentials
and a production Formance environment.

The release profile is resolved only on the server and becomes part of the
commercial-policy digest already stored on every Commitment. Changing the
profile therefore invalidates older Commitments rather than silently changing
their infrastructure assumptions.

## Rotation and recovery

Set `cloudflare_access_secret_version` and
`previous_cloudflare_access_secret_expires_at` together to rotate with an
overlap window. Update Vercel and Convex from the new Secrets Manager version,
prove the old and new paths during the overlap, then expire the predecessor.
Revocation must cause Formance entry to fail closed.

Database recovery uses RDS PITR into an isolated instance followed by a fresh
Formance stack and exact schema, template, reference, balance and idempotency
verification. Never attach a restored database to the authoritative release
stack until the rehearsal evidence passes.
