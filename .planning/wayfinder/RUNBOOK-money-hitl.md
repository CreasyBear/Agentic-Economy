# HITL runbook — Stripe + production Clerk (10-minute human path)

Written 2026-07-30. Everything below is human-only; the dev slices (T3/T12) are implemented and tested behind injected ports. Do these in order; each step names its readback proof. No live-money claim may ship before every readback passes (`ae-agentic-payments-stack` ceiling).

## A. Stripe (test mode first — no live money)

1. **Create/confirm the Stripe account** (AU). Dashboard → activate **test mode** only.
2. **Enable Connect** → choose **Accounts v2** integration (NOT legacy Express; see `.planning/research/2026-07-30-marketplace-pattern-borrow.md` §3). Complete the platform profile/branding questionnaire.
3. **Keys**: Dashboard → Developers → API keys (test). Set in each deployment env (never in repo):
   - `STRIPE_SECRET_KEY=sk_test_…`
4. **Webhook**: Dashboard → Developers → Webhooks → add endpoint `https://<origin>/api/stripe/webhook` (route exists: `src/routes/api.stripe.webhook.ts`), events per T12 plan (checkout/payment success + payout/transfer events). Copy the signing secret:
   - `STRIPE_WEBHOOK_SECRET=whsec_…`
5. **Readback proof**: run the T12 top-up smoke against test mode (implementer wires the real port behind the same seam; the injected-port tests stay). A test-mode top-up must produce: Stripe payment succeeded → webhook received/verified → ledger `topup` entry with 5% fee line. Until this passes, `convex/moneyStripe.ts` stays in its explicit `stripe_setup_required` state — that is honest, do not bypass it.
6. **Rake/payout dry proof** (still test mode): one connected test account through Accounts v2 onboarding → KYC state readback → a test transfer with the 1000 bps application-fee split visible in the Dashboard.

## B. Production Clerk (dev instance is already verified)

Dev instance `ins_3FlYUMGVJfMaeiW1b9UaQhEeFeY`: User API Keys enabled; create/verify/revoke round-trip passed 2026-07-30. Production remainder:

1. Clerk Dashboard → **production instance** → enable **User API Keys** (same toggle as dev).
2. Confirm production domain/issuer matches deployment env `CLERK_JWT_ISSUER_DOMAIN`.
3. Set production deployment env: `CLERK_SECRET_KEY` (prod `sk_live_…`), `CLERK_PUBLISHABLE_KEY`/`VITE_CLERK_PUBLISHABLE_KEY` (prod `pk_live_…`), `AE_CONVEX_SERVER_FUNCTION_TOKEN`.
4. **Readback proof**: hosted `/oauth/device_authorization` → browser approval at `/agent-access/authorize?user_code=…` (signed-in prod user) → polled token returns a scoped key → `POST /api/v1/requests` with that key succeeds → revoke in `/agent-access` → same key 401s.

## C. Claim gates after readbacks

- After A5: copy may say "test-mode credit top-up works" internally; still NO public payment claim.
- After B4: public copy may claim the hosted consent journey (agent asks, human approves, scoped revocable key) — exactly that, nothing more.
- Live-money switch remains a separate founder decision with its own record (ADR-005 lineage: refunds, disputes, kill rule, support owner).
