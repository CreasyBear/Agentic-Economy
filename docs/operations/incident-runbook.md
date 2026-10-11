# Incident runbook

One page. Operator contact is the `OPERATOR_EMAIL` Convex env var (never write addresses here). Append-only money: fix forward, never restore a database or ledger (see [deployments.md](deployments.md), Release and recovery routine).

## Payments-off switch

Mechanism: the `platformLaunch.paymentsOpenTo` row per environment, read by `readPaymentsAudience` and enforced in `readFundingStartRefusal` (`convex/lib/money/treasury/paymentAdmission.ts`, called at `convex/lib/money/funding/ownerReserve.ts:59`).

- Production default is `admins` (only Admins can start funding). Set it with the Admin command `set_payments_audience` (`convex/adminTreasuryCommands.ts:setPaymentsAudience`, reason `launch_close`) to `admins`. New funding by non-admins then refuses with `payments_admins_only`.
- The reader also refuses with `payments_paused` when the audience is `none`, but no command sets `none` (command accepts only `admins` or `everyone`).
- `payments_not_ready` follows production readiness (`productionMoneyManifestReady`, `src/lib/deployment/env-schema.ts`); that is a readiness check, not a switch. Do not break the manifest on purpose.

Resume: run `set_payments_audience` to `everyone` (reason `launch_open`) only after the cause is closed and Joel approves.

## Symptom table

| Symptom | First check | Action | Who to tell | How to resume |
|---|---|---|---|---|
| Stripe webhook failing | Stripe dashboard webhook attempts; `moneyStripeWebhookInbox` rows stuck | Close funding to `admins`; confirm signing secret env matches Stripe; fix, then let Stripe retry (events are idempotent) | Operator (`OPERATOR_EMAIL`) | Failed events drained, inbox empty, then reopen audience |
| Dispute opened | Stripe dispute notice; owner account state | Follow the T2-T4 dispute freeze (account hold) and the operator email; do not refund or move funds by hand | Operator; affected owner via support | Freeze lifted only by the dispute outcome and an Admin command |
| Formance or reconciliation mismatch | Open `moneyReconciliationCases` (`convex/moneyReconciliationCases.ts`) | Owner locked on the case; close funding to `admins`; resolve via `resolveOwnerCase`, append-only correction | Operator | All cases resolved, owner unlocked, reconciliation clean |
| Convex outage | Convex status page; `/health` and readiness | Nothing to write; do not redeploy mid-outage; funding refuses by itself | Operator | Provider recovered, readiness green, spot-check one funding path |
| Provider or search failure | Provider status; readiness output | Degrade: leave search/provider paths failing closed; no manual ledger edits | Operator | Provider healthy and readiness green |
| Suspected key leak | Which key, where exposed | Close funding to `admins`; rotate the key at the provider and in the Convex/Vercel env per [deployments.md](deployments.md); revoke old; review recent usage | Operator; start breach assessment below | New key live, readiness green, old key confirmed dead |

## Notifiable data breach

Lawyer review pending.

Under the Privacy Act NDB scheme, if a breach of personal information is suspected, an assessment must finish within 30 days of suspicion (OAIC Notifiable Data Breaches guidance). When serious harm is likely and cannot be remedied by action, notify the OAIC and the affected individuals. Start the 30-day clock when suspicion is first recorded; write the date and time in the incident record.

## Gaps

- No `none` (full pause) command: `readFundingStartRefusal` supports `payments_paused` but `set_payments_audience` cannot set it. Closing to `admins` is the strongest existing switch.
- Dispute freeze (T2-T4) is referenced, not yet documented here; link it once merged.
- Legal review of the breach section is pending.
