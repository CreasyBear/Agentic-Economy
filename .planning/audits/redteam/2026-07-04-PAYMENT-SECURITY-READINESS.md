# Payment-services security readiness audit — 2026-07-04

## VERDICT

AE's current posture is a useful, boundary-honest foundation for a future PSP-hosted payment service, but it is **not ready for live PSP processing**: the safe path is never to custody funds, never to collect PAN/CVC, remain PSP-hosted / SAQ-A in architecture, and keep any payment rung behind an ADR-005 decision record plus deployed test-mode evidence. The headline gate is: **do not turn on live money until `06-LIVE-MONEY-EVIDENCE-DECISION.md` (ADR-005 D6) exists, the P1 blockers below are closed, deployed provider smokes prove the intended paths, and copy scans keep all booking/payment/dispatch claims future-scoped or absent.**

## CURRENT POSTURE — what is already right

| Posture strength | Current evidence path | Why it matters for a future PSP-hosted rung |
|---|---|---|
| PCI SAQ-A compatibility direction | `src/modules/business-action/internal/stripe-checkout.ts:126-142`, `src/modules/business-action/internal/stripe-checkout.ts:269-300`, `.env.example:28-29` | Reviewed code builds Stripe Checkout Session requests server-side, rejects mismatched live/test keys in the sampled proof path, and keeps Stripe secret/webhook placeholders server-side. That is compatible with hosted checkout if AE never adds first-party card fields or card-data storage. |
| No PAN/CVC storage seen in the reviewed payment-adjacent code | `src/modules/business-action/internal/stripe-checkout.ts:269-300`, `.env.example:28-29`, `local://redteam-cso.md` threat table | The CSO review found no first-party PAN/CVC capture in the sampled payment code. This must become a mechanical rule before any future live PSP work: card entry stays with the PSP. |
| Raw-body webhook signature verification exists | `src/routes/api.billing.webhook.ts:21-35`, `src/lib/server/billing-provider.ts:94-116`, `src/lib/server/billing-provider.ts:216-223`, `src/routes/api.business-actions.stripe-webhook.ts:55-80`, `src/modules/business-action/internal/stripe-checkout.ts:209-242`, `src/routes/api.notification.resend-webhook.ts:59-93`, `src/lib/server/notification-provider.ts:520-536` | Autumn/Svix, Stripe, and Resend paths show the correct pattern: preserve raw body, verify provider signature before trusting the payload, and return explicit status-coded errors. |
| Event idempotency/readback patterns are present | `src/modules/billing/internal/operations.ts:520-552`, `src/modules/business-action/internal/stripe-webhook-source.ts:246-294`, `.planning/adr/ADR-005-transactions-receipts.md:267-282` | Billing dedupes by provider + event id and rejects conflicting payload hashes; business-action Stripe events dedupe by computed idempotency key and hold payload conflicts. This is a strong seed, but not yet a uniform live-money standard. |
| Boundary-honest capability posture is explicit | `local://ae-orientation.md:3-15`, `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:3-24`, `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:218-235`, `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:426-448` | Current AE is business-supplied pages, assistant-readable discovery, and qualified inquiry for owner review. Payment, booking, dispatch, custody, and autonomous fulfilment stay future/speculative unless later gated and proved. |
| ADR-005 already names the live-money decision gate | `.planning/adr/ADR-005-transactions-receipts.md:267-282`, `.planning/adr/ADR-005-transactions-receipts.md:292-305` | ADR-005 requires a future live-money decision record, deployed test-mode smokes, reconciliation/dispute/refund proof, support/kill rules, and copy controls before live mode. This audit should be treated as input to that gate, not a substitute for it. |

## GAP REGISTER — P1 blockers and payment-adjacent gaps

| Threat | Severity | Current-state evidence path | Required control before payments | Status |
|---|---:|---|---|---|
| Authenticated SSRF through `storefront.importDraft` can fetch arbitrary internal or metadata URLs from the AE server. | P1 | `src/routes/api.storefront.import-draft.ts:16-39`; `src/modules/storefront/internal/import-draft.ts:65-74`; `src/modules/storefront/internal/import-draft.ts:93`; `src/modules/storefront/internal/import-draft.ts:236-247`; `tests/unit/storefront/import-draft.test.ts:67-125` | Add URL egress allowlist/denylist with DNS resolution; block loopback, RFC1918, link-local, metadata, localhost aliases, and IPv6-mapped private ranges; re-check after redirects; cap redirects, response bytes, content type, and timeout; log/rate-limit abuse; test private-IP, redirect-to-private, DNS-rebind, oversize, and timeout cases. | **Open P1. Fix now regardless of future payments.** |
| Quiet-door write admission lacks durable one-time nonce/replay consumption and stronger request/body/method/path binding at AE's verification boundary. | P1 | `src/modules/clearance/internal/web-bot-auth.ts:96-117`; `src/modules/clearance/internal/web-bot-auth.ts:129-143`; `src/modules/clearance/internal/web-bot-auth.ts:218-240`; `src/routes/api.agent.tools.ts:175-226`; `src/modules/harness/approval-policy.ts:278-292`; `src/modules/security/source-write-admission.ts:106-129`; `convex/sourceWriteAdmission.ts:43-55` | Bind method, path, authority/origin, content digest, tool id, actor/principal, scope, operation, correlation, expiry, and nonce; persist server-side nonce consumption; ensure Convex does not fall back to caller-supplied operation/correlation values for money/protected actions; audit principal + mandate. | **Open P1 before any money/protected rung.** |
| Single `AE_SOURCE_WRITE_SECRET` spans money-adjacent scopes and becomes a broad bearer write capability. | P1 | `.env.example:7`; `src/modules/security/source-write-admission.ts:3-12`; `src/modules/billing/billing.functions.ts:386-390`; `src/modules/billing/billing.functions.ts:838-848`; `convex/businessActions.ts:959-999`; `convex/businessActions.ts:1111-1151` | Split per scope/environment/provider; add key ids and rotation; bind routes to allowed scopes; consume nonces; monitor/revoke; keep provider secrets separate; do not allow one leaked source-write key to mint admissions for billing, protected actions, and inquiry writes. | **Open P1. Split/key-id/rotate now.** |
| Live-money controls for refunds, disputes, chargebacks, reconciliation, support, and kill rules are absent as implemented production state. | P1 | `.planning/adr/ADR-005-transactions-receipts.md:267-282`; `src/modules/business-action/internal/stripe-checkout.ts:136-142`; `src/modules/business-action/internal/stripe-checkout.ts:171-173`; `package.json:28-33` | Write the ADR-005 D6 live-money decision record with owner/date; implement reconciliation state machine, refund/dispute/chargeback handling, webhook retry/outage paths, support owner, kill switch, alerting, retention, and rollback; prove them in deployed test mode before live mode. | **Open P1. Future gate only.** |
| Production dependency advisories include critical/high findings in the would-be provider/observability dependency graph. | P1 | `package.json:61-62`; `package-lock.json:5285-5286`; `package-lock.json:5346-5349`; CSO run of `npm audit --omit=dev --audit-level=moderate` reported 9 prod vulnerabilities including critical `protobufjs` arbitrary code execution plus OpenTelemetry W3C baggage advisories. | Upgrade/remove vulnerable transitive dependencies, pin/override where needed, or document risk acceptance only for unreachable paths; require `npm audit --omit=dev` clean enough for PSP-secret runtime before live provider events/secrets enter the process. | **Open P1. Fix now regardless of future payments.** |
| Webhook verification is strong in places, but replay protection is mostly event-id/idempotency rather than one uniform provider replay ledger and ordering policy. | P2 | `src/routes/api.billing.webhook.ts:21-35`; `src/lib/server/billing-provider.ts:94-116`; `src/lib/server/billing-provider.ts:216-223`; `src/routes/api.business-actions.stripe-webhook.ts:55-80`; `src/modules/business-action/internal/stripe-checkout.ts:209-242`; `src/modules/billing/internal/operations.ts:520-552`; `src/modules/business-action/internal/stripe-webhook-source.ts:246-294` | Standardize raw-body-first verification, timestamp tolerance, provider event ledger, conflict holds, retry-safe handlers, stale/out-of-order policy, and replay metrics/alerts across Stripe/Autumn/Resend/Novu. | Open; promote to P1 when a live PSP candidate is selected. |
| PCI boundary is not yet formalized as an enforceable SAQ-A-only rule. | P2 | `src/modules/business-action/internal/stripe-checkout.ts:126-142`; `src/modules/business-action/internal/stripe-checkout.ts:269-300`; `.env.example:28-29` | Document and test: no AE-hosted card fields, no PAN/CVC/full card storage, no card data in logs/Convex/analytics/support, no public `VITE_` PSP secrets, and no provider token exposure. | Open; must close before live PSP. |
| Payment-adjacent PII retention/redaction is partial. Inquiry body is stored by default. | P2 | `src/modules/inquiries/internal/schema.ts:179-189`; `src/modules/inquiries/internal/schema.ts:191-238`; `convex/inquiries.ts:798-813`; `convex/inquiries.ts:865-890`; `tests/unit/inquiries/inquiry-flow.test.ts:505-570` | Define retention TTL, purge/tombstone automation, encryption posture, operator access, DSAR/export/delete process, log/analytics redaction, notification redaction, and consent copy before combining inquiry PII with payment state. | Open; required before payment-adjacent PII exists. |
| Future payment/protected mutations must not be exposed as broad direct public Convex mutation paths. | P2 | `convex/inquiries.ts:825-843`; `convex/inquiries.ts:865-890`; `convex/inquiries.ts:936-984`; `src/modules/billing/billing.functions.ts:352-390`; `convex/businessActions.ts:919-947`; `convex/businessActions.ts:831-880`; `convex/businessActions.ts:959-999`; `convex/businessActions.ts:1111-1151` | Route-only provider raw-body adapters; explicit actor auth, tenant/resource ownership, source-write scope, clearance mandate, operation idempotency; no direct client access to provider event args. | Open; needs hardening before future money writes. |
| Provider API base URLs are environment-configurable and could exfiltrate bearer secrets if production env is poisoned or misconfigured. | P2 | `.env.example:25`; `src/modules/billing/internal/provider-readback.ts:80-99`; `src/modules/business-action/internal/stripe-checkout.ts:296-310` | Fail closed in production unless provider base URLs match an allowlist; alert on non-provider hosts; keep test overrides isolated to test env. | Open; required before live provider secrets. |
| Prompt/content injection through inquiry text is bounded for inquiry, but cannot become payment authority. | P2 | `src/modules/inquiries/inquiry.actions.ts:112-130`; `src/modules/inquiries/internal/commands.ts:284-299`; `src/modules/actions/index.ts:23-29` | Treat natural language as data only; require typed amount/action/seller/expiry contracts, human/mandate confirmation, PSP readback, and no model-derived authority for future protected/payment actions. | Current inquiry posture acceptable; future rungs must not reuse message text as authorization. |
| Payment copy has general trust scans but no payment-specific negative-claim scan. | P2 | `local://ae-orientation.md:3-15`; `.planning/vision/2026-07-04-PLATFORM-ANATOMY.md:3-24`; `.planning/adr/ADR-005-transactions-receipts.md:292-305` | Add scan cases for PSP-hosted wording, refund/dispute language, PCI/custody claims, payment status wording, and any “verified payment” wording. | Open; required before public payment-related copy. |

## ORDERED GO/NO-GO CONTROLS

1. **Fix the non-payment blockers now:** close `storefront.importDraft` SSRF, remediate critical/high production dependency advisories, and split/key-id/rotate `AE_SOURCE_WRITE_SECRET` so future money scopes do not share one broad bearer capability.
2. **Freeze the PCI posture before design work starts:** document and test SAQ-A-only integration; PSP-hosted checkout only; no AE card forms; no PAN/CVC/full card data in Convex, logs, analytics, support, or public runtime; no public PSP secrets.
3. **Make quiet-door and source-write admissions payment-grade:** bind method/path/authority/origin/body/tool/principal/scope/operation/correlation/expiry/nonce; consume nonces server-side; audit principal/mandate; remove Convex fallback to caller-supplied expected operation/correlation for protected/payment actions.
4. **Standardize provider webhook handling:** raw body before parse, signature verification, timestamp tolerance, provider event ledger, conflict holds, idempotent retry-safe handlers, ordering/stale-event policy, and alerts across future Stripe/Autumn/notification surfaces.
5. **Write and approve ADR-005 D6 before live money:** create `06-LIVE-MONEY-EVIDENCE-DECISION.md` with named owner/date, exact PSP binding contract, no-custody rule, refund/dispute/chargeback/reconciliation/support/kill-rule/copy controls, and explicit no-go triggers.
6. **Implement live-money operations in deployed test mode:** refunds, disputes/chargeback simulation where provider supports it, reconciliation mismatch handling, webhook replay/invalid-signature/conflicting-payload tests, provider outage path, support owner, kill switch, alerting, and rollback.
7. **Prove deployed smokes, not local-only proofs:** run `test:provider-smoke:business-action-stripe`, Autumn billing smoke, relevant Resend/Novu webhook paths, replay/invalid-signature/conflict tests, reconciliation readbacks, and the deployed agent-experience gate against a non-local target.
8. **Harden authorization for payment/protected mutations:** route-only provider mutations, explicit actor + ownership checks, source-write + clearance mandate checks, one operation idempotency key per action, and no broad direct public mutation path for money events.
9. **Define payment-adjacent PII policy:** retention TTL, purge/tombstone automation, encryption posture, operator access, DSAR/export/delete ownership, redacted notification/observability payloads, and audit-safe receipts.
10. **Run copy/SEO/source scans after wording changes:** keep any payment, booking, dispatch, PSP, refund, or dispute language internally marked as future/speculative until the 14-day gate and ADR-005 live-money decision record approve a payment rung.

## PCI

### Evidence

- The sampled Stripe proof creates a PSP Checkout Session and rejects client-supplied authority fields: `src/modules/business-action/internal/stripe-checkout.ts:126-142`, `src/modules/business-action/internal/stripe-checkout.ts:269-300`.
- Server-side Stripe placeholders appear in `.env.example:28-29`; no `VITE_` public Stripe secret placeholder is cited by the CSO review.
- The CSO review found no first-party PAN/CVC capture in the reviewed payment-adjacent paths.

### Required state

AE must remain SAQ-A style: all card entry hosted by the PSP, no first-party PAN/CVC/full-card storage, no card data in Convex/logs/analytics/support, no browser-exposed provider secrets, and no embedded/Elements approach unless a later PCI/AppSec review explicitly changes scope. A negative scan should fail on new card-field names in AE-owned forms before any future live PSP work.

## SECRETS

### Evidence

- `AE_SOURCE_WRITE_SECRET` appears as one server-only source-write secret in `.env.example:7`.
- Source-write scopes include `public_inquiry`, `owner_inquiry`, `protected_action`, `billing`, and `admin_operator`: `src/modules/security/source-write-admission.ts:3-12`.
- Billing and business-action persistence paths rely on source-write admissions: `src/modules/billing/billing.functions.ts:386-390`, `src/modules/billing/billing.functions.ts:838-848`, `convex/businessActions.ts:959-999`, `convex/businessActions.ts:1111-1151`.
- Provider secrets include Autumn/Stripe placeholders: `.env.example:20-29`.

### Required state

Before future live PSP work, secrets must be split per scope/environment/provider, carry key ids, rotate without downtime, live in a production secret manager, and fail closed on unexpected provider base URLs. `AE_SOURCE_WRITE_SECRET` should not be able to mint admissions across billing, protected-action, admin, and inquiry scopes with one leaked value.

## WEBHOOK

### Evidence

- Autumn billing route reads raw body before verification: `src/routes/api.billing.webhook.ts:21-35`.
- Autumn/Svix verifier checks signature and timestamp: `src/lib/server/billing-provider.ts:94-116`, `src/lib/server/billing-provider.ts:216-223`.
- Stripe business-action webhook reads raw body and verifies `stripe-signature`: `src/routes/api.business-actions.stripe-webhook.ts:55-80`, `src/modules/business-action/internal/stripe-checkout.ts:209-242`.
- Billing and business-action event handlers dedupe/conflict-hold events: `src/modules/billing/internal/operations.ts:520-552`, `src/modules/business-action/internal/stripe-webhook-source.ts:246-294`.

### Required state

Payment readiness requires one webhook standard: raw body first, signature before parse/persist, timestamp tolerance, provider event id ledger, conflict-hold semantics, retry-safe handlers, stale/out-of-order event policy, provider outage behavior, replay metrics, and deployed negative tests for invalid signature, replay, duplicate, and conflicting payloads.

## AUTHORIZATION

### Evidence

- `/api/agent/tools` verifies WBA identity, then resolves per-tool admission before allowing the write: `src/routes/api.agent.tools.ts:91-138`, `src/routes/api.agent.tools.ts:175-226`.
- WBA verification checks covered components and signer directory: `src/modules/clearance/internal/web-bot-auth.ts:96-117`, `src/modules/clearance/internal/web-bot-auth.ts:129-143`, `src/modules/clearance/internal/web-bot-auth.ts:218-240`.
- Inquiry action policy requires `agentToolAdmission` for public qualified writes: `src/modules/harness/approval-policy.ts:278-292`.
- Convex/source-write verification currently has fallback behavior around operation/correlation: `convex/sourceWriteAdmission.ts:43-55`.

### Required state

For any future money/protected action, identity is attribution, not authority. Authorization must be typed and bound: actor/principal, resource owner, seller/business, action/tool id, amount if relevant, expiry, scope, operation id, correlation id, method/path/body digest, mandate id, and single-use nonce. Direct public mutations must not accept provider event or money transition args; trusted route adapters should own raw bodies and admissions.

## PII

### Evidence

- Inquiry schema stores raw `body` plus hashes/redacted contact fields: `src/modules/inquiries/internal/schema.ts:179-189`.
- Audit/funnel/notification records include redacted payload/hash fields: `src/modules/inquiries/internal/schema.ts:191-238`.
- Owner export/delete functions and unit proof exist: `convex/inquiries.ts:798-813`, `convex/inquiries.ts:865-890`, `tests/unit/inquiries/inquiry-flow.test.ts:505-570`.

### Required state

Payment-adjacent PII requires a documented retention schedule, automatic purge/tombstone jobs, operator access limits, encryption posture decision, DSAR/export/delete process, redacted observability and notification payloads, and audit receipts that can be replayed without exposing private message text. Inquiry PII plus future payment status is higher sensitivity than inquiry text alone.

## NON-GOALS

- AE never touches card data: no PAN, CVC, full card numbers, bank details, or first-party card entry forms in AE-owned UI/runtime.
- AE never custodies funds, holds deposits, runs escrow, stores balances, splits payouts, or becomes a PSP/payment rail.
- Any payment rung stays **HORIZON** until the 14-day storefront → inquiry → correction gate passes and ADR-005 D6 has a signed live-money decision record.
- AE does not currently process payments, booking, dispatch, quote acceptance, or autonomous fulfilment; any future payment language must remain internal/speculative until gated evidence exists.
- This audit is internal readiness input, not PCI certification and not permission to enable live PSP mode.

---

## 2026-07-04 RESOLUTION NOTES — FIX-NOW blocker closure

These notes append to the original audit record and do not rewrite the findings above. Authoritative
fix-wave evidence: `local://ae-wave-results.md`. Path-forward synthesis:
`.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-PATH-FORWARD.md`.

### SSRF in `storefront.importDraft` — RESOLVED

Resolution: importer fetches are now hardened with manual redirect handling, DNS/literal-IP
private-range rejection, metadata/localhost blocks, timeout, 2 MiB streamed byte cap, HTML
content-type enforcement, boundary-honest errors, and hermetic test seams.

Connect-time-bound resolution: the actual connection resolves-and-validates atomically via a
guarded undici Agent `connect.lookup` using the same private-range classifier as the pre-flight
guard, so the validated resolution is the connection's resolution; the DNS-rebinding TOCTOU
(public answer to the pre-check, private answer to the connect) is closed. `undici` is an explicit
pinned dependency (`7.28.0`), rather than a transitive dependency, because it backs the SSRF
security boundary.

Evidence pointer: `tests/unit/storefront/import-draft.test.ts` now includes guarded-lookup and
rebinding-scenario coverage, with 24 importer tests. Orchestrator gate re-run green: `test:unit`
754 pass across 134 files, `test:integration` 101 pass, `tsc --noEmit` 0, `npm audit --omit=dev`
0, and `npm ci --dry-run` reproducible.

### Production dependency vulnerabilities — RESOLVED

Resolution: Sentry was upgraded to `^10.63.0`, `promptfoo` to `^0.121.17`, and the OpenTelemetry /
protobufjs graph was moved to fixed versions through a minimal override.

Evidence pointer: `local://ae-wave-results.md` records `npm audit --omit=dev` 9 vulnerabilities → 0,
full `npm audit` 10 vulnerabilities → 0, and `npm ci --dry-run` reproducible.

### Single broad `AE_SOURCE_WRITE_SECRET` — RESOLVED

Resolution: source-write secrets are split into scoped key families, admissions carry `keyId`,
production fails closed without explicit per-family `AE_SOURCE_WRITE_KEY_*`, non-production can
derive per-family keys from the legacy secret, and provider/public secret misuse is guarded.

Evidence pointer: `local://ae-wave-results.md` records the secret-split implementation and the
orchestrator gate records `tsc --noEmit` 0 errors, `check:convex-codegen` exit 0, and green
unit/integration gates.

### Quiet-door / WBA replay and binding debt — RESOLVED

Resolution: source-write admission now binds request body digest, Convex consumes durable nonces,
WBA requires method/authority/path/signature-agent and content-digest coverage for bodied requests,
and operation/correlation self-attestation fallback was removed.

Evidence pointer: `local://ae-wave-results.md` records the WBA/source-write hardening and the
orchestrator gate records `test:integration` 101 pass across 27 files, `test:unit` 741 pass across
133 files, and typecheck/codegen green.

### Live-money controls — OPEN / HORIZON

The P1 live-money gap remains explicitly **OPEN**. Refunds, disputes, chargebacks, reconciliation,
support owner, kill switch, alerts, rollback, and deployed test-mode payment smokes are not admitted
by the FIX-NOW wave. The governing defer decision is ADR-005
(`.planning/adr/ADR-005-transactions-receipts.md`), backed by
`.planning/scopes/scope-14day-bootstrap-gate/06-LIVE-MONEY-EVIDENCE-DECISION.md`; reversal requires
the 14-day bootstrap gate to pass and the live-money checklist to be completed with owner/date.
