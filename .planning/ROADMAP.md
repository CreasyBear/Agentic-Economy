# Roadmap — Fresh Agentic Economy

**Status:** technical phase map.

## Roadmap rule

A phase exists only when it unlocks a source-owned capability.

A phase does not exist for narrative, protocol completeness, marketplace surface area, or backup-folder preservation.

## Decision-door register

| Decision | Door | Phase | Rule |
|---|---|---:|---|
| Fresh repo over backup | One-way | 0 | Backup is source mine only. |
| Launch ICP = AU urgent/local services | Two-way after Phase 1 | 1 | Start narrow; expand only if fields/copy still fit unchanged. |
| Convex source of truth | One-way for M1 | 1 | No planning/runtime or UI-authority state. |
| AE-hosted fallback UCP | One-way for Phase 1 copy | 1 | Do not claim standard business-origin UCP. |
| Lifecycle moat as descriptor contract | One-way | 1 | Keep primitives now; no runtime engine. |
| Admin authority source-owned | One-way | 1 | No env-only admin authority. |
| Search adapter | Two-way | 1 | Convex first; external search only after evidence. |
| Money rails | One-way later | 5 | Requires decision record before code. |

## Phase graph

```text
P1 Spine Foundation
  claim/publish/page/projection/discovery/health
      |
      +--> P2 Human Inquiry
      |      customer inquiry + owner response + notification readback
      |
      +--> P3 Standard Agent/Builder Discovery
      |      read-only public business API, business-origin UCP strategy later,
      |      maybe MCP/OpenAPI read projections only after route-tested demand
      |
      +--> P4 Owner-Pending Protected Actions
      |      propose -> policy -> owner approve/reject -> receipt/audit
      |
      +--> P5 Paid Activation
             Stripe Billing/Checkout first; Connect/x402 only after authority/readback decision record
```

P2 and P3 may run in either order after P1. P4 requires enough human/discovery context to propose actions safely. P5 requires authority, receipts, and operator reconstruction.

## Phase 1 — Ten-Star Spine Foundation

**Objective:** a launch-ICP owner can claim, publish, see visibility/discovery health, and expose truthful AE-hosted discovery without future-surface claims.

**Ship:**

```text
/claim
/[slug]
/registry
/[slug]/ucp
/api/businesses
/api/businesses/search
/api/businesses/{slug}
/llms.txt
/sitemap.xml
/robots.txt
/admin/claims
/admin/index-health
/admin/audit-events
/privacy/remove-business
```

**Source-owned state:** see `PROJECT.md` durable model.

**Success:** one seeded launch-ICP business can be claimed by an authenticated owner, publish a no-ABN public business service catalog page with workflow-critical facts, see separate `publicStatus`, `indexStatus`, `discoveryStatus`, `trustTier`, service/capability status, `callable=false`, `paymentRequired=false`, and next recovery action, and have an operator reconstruct claim -> publish -> index -> manifest from audit events.

The public business service catalog page must explain demand risk and next owner action in one screen, pass banned-claim copy scan, and state unavailable capabilities explicitly.

Manifest/llms/sitemap gates are engineering readbacks, not owner-facing success.

**Owner activated:** publish succeeded, owner viewed status/readback, owner copied/shared URL or submitted consented next-capability interest, and attribution exists.

**Cut:** payments, wallet, protected actions, request market, skills, expert profiles, hosted agents, voice, persona UI, benchmarks, native mobile, API keys, MCP/OpenAPI tools, developer platform.

**Exit gate:** all Phase 1 plan gates green, GTM internal-alpha gate green, deployment/readback smoke green.

## Phase 2 — Human Inquiry + Owner Inbox

**Objective:** one conservative customer inquiry path.

**Engineering gate:** `firstRequestMode` may expose inquiry only when contact/consent policy, durable message state, owner read/reply, notification readback, abuse controls, and copy tests exist.

**Ship:**

```text
customer inquiry
owner inbox
owner reply
single notification adapter
durable message/audit state
```

**Cut:** autonomous replies, AI handling, booking, payment, action execution, multi-channel support bloat.

**Exit gate:** customer message persists, owner sees it, owner can reply, notification failure is visible and does not lose the message.

## Phase 3 — Standard Agent/Builder Discovery

**Objective:** extend readonly discovery only after P1 truth exists and public list/search/detail APIs have shipped.

**Engineering gate:** builder/agent discovery must be read-only until documented public facts, tested caching, schema parity, unsupported-action flags, and operational readback exist. API keys, MCP, and OpenAPI remain read-only unless a later phase ships server-enforced action capability.

**Ship candidates:**

```text
business-origin /.well-known/ucp strategy if deployable
read-only API keys only if public quotas/private readbacks require them
MCP/OpenAPI read projections only after route-tested support matrix
schema fixtures/evals
```

**Cut:** invocation, tools/actions, payment descriptors, SDK/CLI/plugin unless demand proven.

**Exit gate:** builder can discover public facts and unsupported/degraded capabilities through documented, valid, cached outputs; no P3 surface duplicates the P1 public catalog without adding source-owned capability.

## Phase 4 — Owner-Pending Protected Actions

**Objective:** consequential actions start as proposals and end in owner-approved receipts.

**Engineering gate:** protected actions may be advertised only as owner-pending; every action requires policy check, owner approval/rejection, provider attempt state, receipt, audit, and dispute/reversal posture.

**Ship:**

```text
proposeAction
policy check
owner approve/reject
provider attempt/proof gap
receipt/audit reconstruction
```

**Cut:** autonomous protected execution.

**Exit gate:** every action reconstructs actor, policy, approval, provider attempt, outcome, receipt, and dispute/reversal posture.

## Phase 5 — Paid Activation + Money Rails

**Objective:** add money only after authority and receipt posture.

**Engineering gate:** payment may be advertised only when a concrete rail has provider readback, idempotency, receipt, reversal/dispute, reconciliation, and operator reconstruction.

**Default:** Stripe Billing + Checkout Sessions for subscriptions. Connect Accounts v2 only with explicit controller responsibilities and one charge model. x402/crypto rails remain adapters.

**Money rail quarantine:** no `stripe*`, `x402`, `wallet`, `credits`, `balance`, `paymentHandler`, or rail-specific fields in `business`, `registry`, or `discovery` before Phase 5 decision record.

**Exit gate:** provider readback, idempotent ledger/receipt, reversal/dispute, reconciliation, operator reconstruction.

## Bloat relapse detector

Stop if a PR introduces:

- future nav item,
- placeholder module,
- one-implementation adapter for later,
- protocol-first owner copy,
- payment/provider field in core domain,
- best-effort write without readback/repair,
- boolean state soup,
- backup source copied without source-mining ledger.

## Every phase plan must list

1. source-owned tables/functions/modules,
2. routes shipped,
3. exact non-goals,
4. user-visible states,
5. failure modes and readbacks,
6. repair/runbook actions,
7. tests/commands,
8. no-overclaim copy checks,
9. bloat cuts compared with backup,
10. deployment/readback evidence.
