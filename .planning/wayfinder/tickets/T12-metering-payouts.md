# T12 — Metering, credit, rake, and payouts (the money rails)

Labels: `wayfinder:task` (plan AFK, rails HITL: Stripe account, rake %). Status: open, unclaimed. Extends the T2 decision (account credit / API-key metering) with the marketplace model from the 2026-07-30 grilling.

## Question

Implement the money loop: agent operator tops up prepaid credit → each paid service call decrements credit at the business-set price → business balance accrues → AE takes rake on paid calls only → business gets paid out. Decisions needed in the plan: metering ledger (Stripe Meters vs Lago/OpenMeter vs module-owned — prefer borrowed per research doc), payout rail (Stripe Connect Express + application_fee is the default candidate; AU availability verified), rake % (founder decision, informed by Gurley's rake framework in the flywheel research), free-call tier accounting, overage/insufficient-credit refusal semantics, and how billing identity binds to T3's scoped keys (`principalId: clerk_api_key:<id>`).

Constraints: project-owned payment boundaries — credentials server-side, exact amount/currency ceilings, outcome-unknown requires reconciliation, no customer-reachable-payment claim until the intended surface is proven. No crypto rail (inbound x402 rejected in T2).

## Resolution

Parameters decided 2026-07-30 (founder + model, `plans/T12-metering-payouts-PLAN.md` remains the execution spec):

- **Rake: 1000 bps (10%)** — founder decision, informed by the rake model (Gurley winners' band; "you keep 90%" supply copy; ~12%-of-GMS net under design B). Stays a config parameter (`rakeBps`), revisable.
- **Fee design B (OpenRouter model)**: ~5% fee charged at credit top-up covers processing; rake is separate. Margin is immune to top-up size (model: at $5–10 avg top-ups, absorbing processing costs $47–78 per $1,000 GMS).
- **Rail: Stripe-only** — Autumn stays parked (its leverage is subscription/plan billing; AE's flow is prepaid credits + Connect payouts, and the authorization ledger is AE-owned regardless). Revisit only if subscription plans appear.
- **Clerk dev instance verified live 2026-07-30**: User API Keys enabled; create (with `customer_requests:create`/`inspect_only` scopes) → verify → revoke → verify-fails round-trip passed against `ins_3FlYUMGVJfMaeiW1b9UaQhEeFeY`. Remaining Clerk HITL is production-only (prod feature toggle, deployment secrets, hosted readback).
- Remaining HITL: Stripe account/Connect setup; live webhook endpoints against real Stripe; production secrets.

## Provider status check (2026-07-30)

- **Autumn**: sandbox account provisioned (`.env.local` has a real `am_sk_test_…` key) but webhook secret/project/org IDs are placeholders and ALL integration code was removed with archived Phase 5 (`.planning/archive/phases/05-paid-activation-money-rails/`). No SDK, no routes in current source. Implementation fork to settle at T12 kickoff: Autumn for demand-side credit billing (Stripe-wrapper; prior art + audited webhook patterns exist in `.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-*`) vs Stripe-only per the current plan. Supply-side payouts + rake need Stripe Connect either way; the AE-owned authorization ledger is unaffected.
- **Clerk**: dev env fully keyed (`.env.local`); remaining HITL is Dashboard-side (enable User API Keys, confirm prod instance/issuer, deployment secrets) — founder available to pair on it.
- **Rake bps**: to be modeled (price distribution × volume scenarios × provider fees → net margin per rake level, Gurley modest band as prior), then founder decision.
