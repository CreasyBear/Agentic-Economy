# Agentic Economy deployment architecture

This is the operating map for engineers changing or diagnosing Agentic
Economy environments. It describes the intended boundaries. The dated live
identities are in `deployment-registry.yaml`; current evidence and gaps are in
`deployment-maturity.md`.

## System boundary

```text
Human or Agent
  │
  ├── Clerk authentication / Agent credential
  │
  ▼
Vercel Node application
  │  public routes, hosted UI, Stripe webhook boundary
  │
  ▼
Convex deployment
  │  Account + Principal + authority + Commitment + Invocation + recovery
  │
  ├── Stripe ── settlement evidence for Account AUD funding
  ├── CDP/x402 ── custody, signing, paid Provider call, settlement evidence
  │
  └── Cloudflare Access service token
         │
         ▼
      Cloudflare Tunnel
         │ outbound-only origin connection
         ▼
      private AWS k3s
         │ Gateway → Ledger API + worker
         ▼
      private Multi-AZ RDS PostgreSQL
```

## Authority map

| Fact | Authoritative system | AE may cache |
| --- | --- | --- |
| Human identity, session, factors | Clerk | Canonical Principal and Account binding |
| Agent identity and delegated grant | Clerk key plus Convex authority records | Redacted use evidence |
| Product policy, Commitment, Invocation, recovery | Convex | Vercel response projections |
| AUD/USDC balances, reservations, postings, reversals | Formance | Timestamped display snapshots and references |
| Funding settlement | Stripe | Verified event and command evidence |
| x402 submission and settlement | CDP/x402 plus Provider evidence | Submission fence and durable readback |
| Documents and signed close | Convex immutable snapshot linked to Formance references | Rendered file |
| Infrastructure desired state | OpenTofu and pinned bootstrap source | Provider state/readback |
| Infrastructure health | AWS, Cloudflare, Formance, Vercel and Convex | Release evidence |

No Convex balance, document value, UI state, or cached snapshot may authorize a
financial action. No provider error message or metadata search is proof that an
external write did or did not occur.

## Environment lifecycle

| Environment | Purpose | Money mode | Promotion rule |
| --- | --- | --- | --- |
| Local/development | Fast product development and deterministic tests | Fixtures only; non-authoritative | Never promoted |
| `package4-release` | Persistent synthetic release qualification | Stripe sandbox, fixture Formance value, Base Sepolia | Never promoted in place |
| Production | Future real operation | Fresh identities, empty ledger, live providers | New module instance after every production gate passes |

The Vercel target named `production` for `package4-release` is a hosting target,
not AE production. AE authority comes from the environment profile, service
identities, policy digest, and release evidence together.

## Critical request paths

### Account funding

1. An authenticated owner requests an exact AUD principal.
2. Vercel creates a Stripe-hosted Checkout Session.
3. Stripe performs card collection and SCA on its hosted page.
4. The browser return triggers readback only.
5. A verified Stripe webhook advances the existing Convex funding command.
6. The Convex Node Action books the named Formance funding transaction.
7. Exact Formance reference readback finalizes the Account projection and
   document work.

### Managed Operation call

1. Search returns compact candidate Operations.
2. Inspection resolves Account, Agent Principal, authority, live price,
   Formance capacity, x402 requirement, and policy into an expiring Commitment.
3. Invoke consumes only the Commitment reference and idempotency key.
4. Convex prepares the durable Invocation.
5. Formance atomically decides the AUD/USDC reservations.
6. Convex persists the possible-submission fence before CDP signing.
7. Official x402/CDP code makes the paid Provider request.
8. Settlement, release, or `outcome_unknown` is finalized by durable reference.

### Recovery

Search and authoritative readback remain available when new financial entry is
suspended. Formance writes recover by exact transaction reference. Possible
x402 submission recovers through the existing Invocation and never offers a
new invoke action.

## Deployment definition

`infra/package4/modules/release-environment` owns the reusable AWS/Cloudflare
module. `infra/package4/environments/package4-release` is its synthetic release
instance. It declares:

- private Sydney VPC application and database subnets;
- an ARM64 Ubuntu 24.04 k3s host reachable through AWS Systems Manager;
- private encrypted Multi-AZ PostgreSQL 16 with PITR;
- a nightly encrypted backup copy to Melbourne;
- Formance Community Gateway, Ledger API, and worker only;
- an outbound Cloudflare Tunnel and service-token-only Access application.

The deployment intentionally excludes Formance Payments, Auth, Console,
Wallets, Flows, Webhooks, and Reconciliation.

## Change contract

Before a change, verify the full Git SHA, provider project/deployment IDs,
identity instance, Stripe mode, Formance ledger, AWS account/region, and
Cloudflare hostname. Save and review an OpenTofu plan. State the blast radius
and rollback boundary.

After a change, verify application health, release identity, protected Formance
edge behavior, provider-specific health, and the narrow affected journey. Then
update the registry, maturity record, and release evidence in the same commit.

Live readback outranks this document. A discrepancy is drift to investigate,
not permission to force the live system to match stale prose.
