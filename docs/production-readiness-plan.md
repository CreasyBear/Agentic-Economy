# Production readiness: from diagnosis to live money (30 September 2026)

## Honest status
We have diagnosed and designed. We have not yet built or provisioned what live money needs.
- **Real:** the money code paths exist (AUD ledger in Formance, CDP custody signing, x402 payment, 2-RPC settlement verification, receipts) and the chat journey is built in source. None of it has run with real money. No paid Call has been proven end to end, even on testnet.
- **Unsafe:** production isolation has 10 P0 findings (`docs/reviews/rebuild/2026-09-30-production-isolation-audit.md`).
- **Unprovisioned:** the last production env snapshot (`.vercel/prod-debug.env`, 4 August 2026) contains **no** Stripe, Formance, CDP, RPC or Sentry configuration. It still carries legacy integrations (Autumn billing, Meilisearch, Novu, Resend) and `AE_SANDBOX_PROVIDER_KEY`. The browser build loads Clerk **development** keys.

## Operating-model concerns still open
1. **Where Formance runs.** The manifest declares a *private Formance community stack* behind a Cloudflare Access gateway, with managed PostgreSQL (`manifest.ts:224`). In production that means a solo founder operating a financial database: uptime, upgrades, backups, point-in-time recovery. Options:
   - (a) Formance Cloud (managed).
   - (b) Self-host on a managed platform with managed Postgres and point-in-time recovery, behind Cloudflare Access.

   Decide before M2. If Formance is down, no Quote can reserve and no top-up can credit.
2. **Legacy integrations in production.** Autumn (billing), Meilisearch, Novu and Resend are present. Decide for each: keep (for example, Resend for receipt email) or remove. Autumn in particular must not coexist with the credits model.
3. **Secrets live in several places:** Vercel env, Convex env, Formance, CDP, Stripe. Adopt one secret manager as the source of truth. Infisical is already integrated in code (the secret-isolation tests), with named holders and rotation.
4. **Two deployments only.** *Development* (local plus a Convex dev deployment, sandbox money) and *production* (real money). No staging with real money, and no production data in development.
5. **Release process without CI minutes:** local `npm run gate` → deploy to a Vercel preview against the Convex dev deployment → promote to production. GitHub Actions minutes return on 1 October; re-enable the gate workflows then.
6. **One operator.** Everything in M2 needs a runbook: float low, drift, Formance down, Stripe webhook failures, CDP outage, sanctions hit.

## Infrastructure: target state
| Component | Alpha (promo credit, Joel-funded float) | Open beta (card funding) | Status | Owner |
|---|---|---|---|---|
| Web (Vercel, TanStack Start) | Production project on the domain | Same | Project exists; env stale | Joel provisions, E wires |
| Convex | Production deployment, backups on, restore drill done | Same | Deployment exists (`CONVEX_DEPLOYMENT` present); backups unverified | Joel, E |
| Clerk | **Production instance** (live keys, domain, MFA) | Same | Dev keys in use | Joel |
| Formance (AUD ledger) | Production ledger (decision 1), point-in-time recovery | Same | Not provisioned | Joel decides, E wires |
| CDP custody | Separate production project, server wallet and policies; funded by Joel | Company-funded; hot/reserve split | Not provisioned | Joel |
| Base RPC | 2 independent HTTPS providers (`AE_X402_RPC_URLS_JSON`) | Same | Not provisioned | Joel |
| FX feed | Coinbase public USDC/AUD (built; refreshes) | Same | Working | — |
| Sanctions screening | OFAC data plus a screening API key | Same | Not built | E, Joel (vendor account) |
| Stripe | Not needed | Live restricted keys, webhook, GST rate; **written pre-approval** | Not provisioned | Joel |
| Sentry | Production DSN, alerts wired | Same | Absent from the production env | Joel, E |
| Secrets | Infisical as the source of truth | Same | Partial | Joel, E |
| Email | Receipts and alerts (Resend, if kept) | Same | Present (legacy) | Joel |

## Critical path to the first real Call
Two tracks run in parallel; the join points are marked ⇄.

**Engineering track (no dependency on provisioning):**
1. **M1 isolation:**
   - `AE_DEPLOYMENT_ENVIRONMENT`: required, fail closed.
   - Delete `hosted_alpha`, `standard` and the synthetic profile.
   - Close the 10 P0 doors.
   - The isolation test goes into the gate.
2. **Money rules:**
   - Charge on a settled 2xx (paid-200); write off seller errors.
   - Release unbroadcast authorizations after `validBefore`.
3. **Alpha features:**
   - Promotional credit grant (admin action, drawn first, expiry).
   - "Report this answer" refunds with the daily limit.
4. **Payment safety:**
   - Screen `payTo` before signing.
   - aecon-side caps per Call, per rolling day and per payee.
5. **Treasury:**
   - Deposit booking from observations.
   - The reconciler.
   - `/admin/treasury` (read-only first, then pause and thresholds).
6. **Readiness:**
   - The manifest requires the production groups.
   - The readiness panel is pass/fail.
   - Boot fails closed on a mismatch.
7. **Prove the loop on the development deployment:** one full paid Call on Base Sepolia (M0 exit).

**Joel track:**
1. Formance hosting decision (concern 1).
2. Clerk production instance and domain.
3. CDP production project, wallet and policies; fund the alpha float.
4. Two Base RPC providers.
5. Sentry production DSN.
6. Secrets into Infisical.
7. Legacy integration decisions (concern 2).

⇄ **Join 1:** wire the production env, the readiness panel goes green, the restore drill (M2 exit).

⇄ **Join 2:** Joel's account makes 20 real Calls across at least 5 listings, reconciled to the cent, and the failure drills pass (M3 exit).

Then: the trust centre and credits terms page, and alpha invites (20 users, A$10 each).

**Beta-only track (starts now, blocks nothing in alpha):**
- The Stripe pre-approval request.
- Lawyer and accountant engagements with the fixed questions in `docs/operating-model.md`.

## What should make us comfortable, and what shouldn't yet
- **Comfortable:** the model is coherent (principal, OpenRouter-style credits, own float). The regulatory posture is defensible. Alpha exposure is capped at about A$200 of seller payments. Every money path already refuses when config is missing, rather than guessing.
- **Not yet:**
  - Nothing has run with real money.
  - Isolation is unsafe.
  - Formance hosting is undecided and it is the money authority.
  - Production config is absent.
  - One operator with no runbooks.
  - The first alpha user must not arrive before the Join 2 exit.
