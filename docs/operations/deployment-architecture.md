# Agentic Economy deployment architecture

This is the operating map for engineers changing or diagnosing Agentic
Economy environments. It describes the intended boundaries. The dated live
identities are in `deployment-registry.yaml`; current evidence and gaps are in
`deployment-maturity.md`. The account baseline, recovery proof and production
gate are in `aws-foundation.md`.

The checked-in source uses the current Tool/Quote/Call contracts described below.
That source fact does not establish hosted route availability, installed-client
compatibility or production readiness.

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
  │  Account + Principal + authority + Quote + Call + recovery
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
| Product policy, Quote, Call, recovery | Convex | Vercel response projections |
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

### Managed Tool Call

1. Search returns compact candidate Tools.
2. `tool.quote` resolves Account, Agent Principal, authority, live price,
   Formance capacity, x402 requirement, and policy into an expiring Quote.
3. `tool.call` consumes only the `quoteRef` and idempotency key.
4. Convex prepares the durable Call.
5. Formance atomically decides the AUD/USDC reservations.
6. Convex persists the possible-submission fence before CDP signing.
7. Official x402/CDP code makes the paid Provider request.
8. Settlement, release, or `outcome_unknown` is finalized by the durable `callRef`.

### Recovery

Search and authoritative readback remain available when new financial entry is
suspended. Formance writes recover by exact transaction reference. Possible
x402 submission recovers through the existing Call and never offers a new
`tool.call` action.

## Deployment definition

`infra/package4/modules/release-environment` owns the reusable AWS/Cloudflare
module. Four roots divide authority so an environment change cannot silently
become an account-wide or recovery change:

| Root | Authority |
| --- | --- |
| `account-baseline` | Account-wide audit, safe defaults, detection, flow logs, alert subscription and budgets |
| `environments/package4-release` | Synthetic release infrastructure and telemetry |
| `recovery-drill` | One isolated point-in-time restore with its own dated state |
| `environments/production` | Fresh production boundary; declared and hard-gated, not deployed |

`infra/cloudflare/account-baseline` is a fifth, provider-specific root. It owns
only the account-wide Tunnel-health and service-token-expiry notification
policies. Tunnel, DNS and Access runtime resources remain in the environment
root, so alert maintenance cannot rotate or replace runtime credentials.

The reusable environment module declares:

- private Sydney VPC application and database subnets;
- an ARM64 Ubuntu 24.04 k3s host reachable through AWS Systems Manager;
- private encrypted Multi-AZ PostgreSQL 16 with PITR;
- a nightly encrypted backup copy to Melbourne;
- Formance Community Gateway, Ledger API, and worker only;
- an outbound Cloudflare Tunnel and service-token-only Access application.

The deployment intentionally excludes Formance Payments, Auth, Console,
Wallets, Flows, Webhooks, and Reconciliation.

## Stripe event boundary

The snapshot endpoint accepts only Checkout completion/async outcome and refund
events. The Accounts v2 endpoint accepts only the five thin account lifecycle
events. Each destination has its own signing secret. After signature
verification, both routes write a normalized event to
`moneyStripeWebhookInbox`, enqueue the dedicated four-wide Workpool, and
acknowledge; Stripe readback and Formance/Connect mutation happen only in the
worker. Raw request bodies are never persisted.

Exact event replays reuse the original work. Conflicting evidence for an event
ID is acknowledged and held for reconciliation. Exhausted work remains visible
and blocks the strict snapshot.

Every AWS provider is restricted to account `197716152388`. The production
root also requires an explicit, one-plan `foundation_gates_passed` acknowledgment
after the live criteria in `aws-foundation.md` are evidenced. It does not bind
application traffic.

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
