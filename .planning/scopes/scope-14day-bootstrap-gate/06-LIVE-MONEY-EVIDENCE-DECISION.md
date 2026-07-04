# Live-money Evidence Decision

**Created:** 2026-07-04
**Status:** NOT-STARTED / gated by ADR-005 and the 14-day bootstrap gate
**Decision owner:** NOT-STARTED
**Decision date:** NOT-STARTED
**Linked ADR:** `.planning/adr/ADR-005-transactions-receipts.md`
**Gate:** `.planning/scopes/scope-14day-bootstrap-gate/`

## Decision posture

Live-money/payment processing remains **HORIZON** and is not admitted by this record.

ADR-005 currently accepts only the defer decision: the FIX-NOW security foundation has landed, but AE may not enable a live-money/payment rung until every go/no-go item in this file is complete, reviewed, and linked back to ADR-005 with owner and date.

This record is internal planning evidence only. It is not an independent compliance assessment, not a live-mode approval, and not permission to advertise payment, booking, dispatch, charge, custody, settlement, payout, or autonomous fulfillment.

## Current evidence from the 2026-07-04 fix wave

Source: `local://ae-wave-results.md`.

### Security foundation landed

| FIX-NOW blocker | Status | Evidence summary |
|---|---|---|
| SSRF in `storefront.importDraft` | RESOLVED | Hardened importer with manual redirect handling, DNS/literal-IP private-range rejection, metadata/localhost blocks, timeout, 2 MiB streamed byte cap, HTML content-type enforcement, boundary-honest errors, and 20 unit tests. |
| Production dependency vulnerabilities | RESOLVED | `@sentry/node`/`@sentry/react` upgraded to `^10.63.0`, `promptfoo` upgraded to `^0.121.17`, OpenTelemetry/protobufjs graph fixed through a minimal override; `npm audit --omit=dev` and full `npm audit` both report 0 vulnerabilities. |
| Broad `AE_SOURCE_WRITE_SECRET` | RESOLVED | Source-write secrets split into scoped key families; admissions carry `keyId`; production requires explicit per-family `AE_SOURCE_WRITE_KEY_*`; non-production can derive per-family keys from the legacy secret; provider secrets and public `VITE_` exposure are guarded. |
| Quiet-door / WBA replay and binding debt | RESOLVED | Source-write admission binds `bodyDigest`; Convex persists and consumes nonces; WBA now requires method, authority, path, signature-agent, and content-digest coverage for bodied requests; operation/correlation self-attestation fallback removed. |

### Gate results from the wave

| Gate | Result |
|---|---|
| `test:unit` | 741 pass across 133 files |
| `test:integration` | 101 pass across 27 files |
| `tsc --noEmit` | 0 errors |
| `check:convex-codegen` | exit 0 |
| `test:copy` | 109 pass |
| `test:seo` | 23 pass |
| `test:source-mining` | 2 pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `test:graph-freshness` | stale by design because the graph-relevant worktree is dirty; non-blocking and gated on commit decision |

### Defensive addition landed

The wave also added a payment-boundary copy negative scan that fails closed on payment processing/charging, custody/escrow, PCI/SAQ-A overclaims, verified/guaranteed payment wording, booking + dispatch claims, payout claims, and public epistemic labels on public human surfaces.

## Reversal gate — ALL required before live money can be admitted

| Requirement | Status | Required evidence |
|---|---|---|
| 14-day bootstrap gate passes | NOT-STARTED | `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md` records 30–50 source-backed profiles, 10 recruited providers, 100 attributable sessions over 14 days, ≥10 qualified inquiries, ≥5 voluntary provider corrections/listing requests, zero boundary overclaim, and a GO verdict under `SCOPE-14DAY-INDEX.md`. |
| ADR-005 owner/date completion | NOT-STARTED | `.planning/adr/ADR-005-transactions-receipts.md` is updated with a named owner, decision date, and explicit reversal of the current defer decision. |
| Live PSP binding contract | NOT-STARTED | Exact provider, mode, credential owner, request/checkpoint/receipt refs, metadata keys, idempotency keys, correlation IDs, and public/private redaction contract are documented before implementation. |
| SAQ-A-compatible architecture formalized | NOT-STARTED | PSP-hosted checkout/card entry only; no AE-hosted PAN/CVC/full-card forms; no PAN/CVC/full-card storage in Convex, logs, analytics, notifications, support tools, or public runtime; no browser-exposed PSP secrets. This is SAQ-A-compatible by design only, not independently certified. |
| Provider base-URL fail-closed allowlist | NOT-STARTED | Production provider API base URLs fail closed unless they match the allowed Stripe/Autumn provider hosts; test overrides are isolated to test environments; misconfiguration alerts are defined. |
| Unified webhook replay ledger | NOT-STARTED | Provider raw-body signature verification, timestamp tolerance, event-id ledger, conflict holds, retry-safe handling, stale/out-of-order policy, replay metrics, and alerts are standardized across provider webhook surfaces. |
| Direct public mutation hardening | NOT-STARTED | Payment/protected writes are route-only through trusted raw-body/source-write adapters with explicit actor, ownership, mandate, scope, operation idempotency, and no direct client/provider-event mutation args. |
| Payment-adjacent PII policy | NOT-STARTED | Retention TTL, purge/tombstone automation, operator access, DSAR/export/delete ownership, observability/notification redaction, and receipt replay without raw private text are defined and implemented. |
| Refunds | NOT-STARTED | Refund state machine, provider readback, idempotency, support workflow, and deployed test-mode smoke are implemented. |
| Disputes | NOT-STARTED | Dispute webhook/readback handling, status transitions, support owner, evidence retention/redaction, and deployed test-mode smoke are implemented. |
| Chargebacks | NOT-STARTED | Chargeback handling, provider event mapping, operator escalation, reconciliation effect, and deployed test-mode smoke are implemented where the provider supports simulation. |
| Reconciliation | NOT-STARTED | Reconciliation state machine covers `matched`, `missing`, `mismatched`, `provider_unavailable`, `retry_available`, `retry_exhausted`, and `no_repair`; mismatch never grants authority. |
| Support owner | NOT-STARTED | Primary and backup support owners, escalation channel, SLA/thresholds, customer/provider messaging rules, and incident review cadence are named. |
| Kill switch | NOT-STARTED | Operator-owned fail-closed kill switch disables new payment attempts without losing readback, receipt, refund/dispute, support, or reconciliation visibility. |
| Alerts | NOT-STARTED | Alerts exist for provider webhook failures, replay/conflict holds, reconciliation mismatch, refund/dispute/chargeback events, kill switch activation, credential/config drift, and copy-scan regression. |
| Rollback | NOT-STARTED | Rollback plan preserves audit/readback, disables live attempts, keeps support/refund/dispute/reconciliation paths available, and names no-go triggers. |
| Deployed test-mode payment smokes | NOT-STARTED | Deployed non-local smokes prove happy path, invalid signature, replay/duplicate, conflicting payload, refund, dispute/chargeback where supported, reconciliation mismatch, provider outage, kill switch, alerting, and public/private redaction. |
| Copy and claims gate | NOT-STARTED | Copy/SEO/source scans pass after any payment wording changes; public copy remains clear that AE does not book, charge, dispatch, custody funds, settle payouts, or auto-fulfil. |

## Explicit no-go triggers

Live-money remains blocked if any of the following is true:

1. The 14-day bootstrap gate is absent, ADAPT, STOP, or not source-owned.
2. ADR-005 lacks owner/date completion for the live-money reversal.
3. Any live-money control above remains NOT-STARTED, partial, local-only, or undocumented.
4. Deployed test-mode smokes are absent, local-only, or fail to cover replay, refund/dispute/chargeback, reconciliation, support, kill switch, alerting, rollback, and redaction.
5. Public copy implies AE books, charges, dispatches, custodies funds, settles payouts, verifies payment status without a named standard, or auto-fulfils.
6. Any implementation would require AE-hosted card entry, PAN/CVC/full-card storage, wallet/credits/balance, custody, Connect/x402 settlement, split payouts, or broad marketplace payment authority.

## Immediate next hardening before this record can move

Follow `.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-PATH-FORWARD.md`:

1. Provider API base-URL fail-closed allowlist.
2. Unified webhook replay ledger.
3. PCI SAQ-A-compatible architecture formalization.
4. Payment-adjacent PII retention/redaction.
5. Direct public mutation hardening.
6. Only then reconsider the live-money rung through this record and ADR-005 after the 14-day gate passes.
