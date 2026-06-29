# Security Spec — Phases 1-6

**Status:** authority for claim/publish/admin/discovery security and P2-P6 execution planning controls.

## Threat model

### Assets

- business slug and identity,
- owner binding,
- claim state,
- public business service catalog page/search/sitemap/llms/UCP projections,
- suppression state,
- admin authority,
- audit history,
- owner/contact PII,
- claimant evidence,
- provider URLs and future endpoint refs,
- future token/payment/custody evidence,
- Phase 6 business action cards, mandates, authorization checkpoints, guardrail decisions, external evidence events, result artifacts, and Action Receipts.

### Actors

- anonymous claimant,
- authenticated owner,
- wrong-owner claimant,
- malicious owner,
- competitor/bot,
- non-admin user,
- compromised admin,
- support admin with limited role,
- external agent consuming UCP/llms,
- future provider/webhook endpoint.

### Trust boundaries

```text
browser -> TanStack route/createServerFn
createServerFn -> Convex mutation/query/action
Convex auth -> owner/admin authority
module -> public projection
public projection -> internet/search/agents
admin route -> source-owned admin role
future provider URL -> internet
Hermes/Stripe/Link/NVIDIA evidence -> Phase 6 business-action admission/readback
```

## P0 controls

1. Publish requires Clerk actor mapped to Convex owner binding. Request bodies never supply owner/admin IDs.
2. Session-cookie mutations require CSRF or same-site Origin enforcement.
3. Claim abuse controls exist before public exposure: actor/IP/device rate limit, slug collision policy, duplicate/impersonation fingerprint, typed rejection, audit event.
4. Suppression uses one fail-closed eligibility predicate consumed by page, registry, sitemap, `llms.txt`, UCP, and search sync.
5. Admin authority is source-owned: role, state, preauthorized bootstrap, grant, revoke, break-glass, evidence refs, audit. No env-only admin authority and no arbitrary "first authenticated caller wins" path.
6. Consequential mutations write append-only typed audit events in the same logical operation.
7. Public/discovery projections are allowlisted builders, not DB row spreads.
8. Discovery emits no callable, payment, wallet, custody, settlement, or provider-handler descriptors.
9. No server-side fetch of owner-supplied URLs in Phase 1.
10. Idempotency covers claim publish, projection sync, discovery generation, suppression, unsuppression, and admin decisions.
11. Logs/audit/readbacks pass redaction scans.

## Required admin model

```text
adminMemberships
  clerkUserId
  role: owner_admin | support | reviewer
  state: active | revoked | suspended
  grantedBy
  grantedAt
  revokedBy?
  revokedAt?
  evidenceRef?

adminMembershipAuditEvents
  eventId
  eventType: membership_bootstrapped | membership_granted | membership_revoked | break_glass_used | action_denied
  actorRef
  targetRef
  reasonCode
  evidenceRefs
  correlationId
  createdAt
```

`requireAdmin` must read source-owned admin membership. Clerk/session state can identify the principal, not grant admin power by itself.

Bootstrap is allowed only for a principal explicitly named by source-owned local configuration or a one-time bootstrap grant, and only while no active `owner_admin` exists. Tests must prove an arbitrary authenticated first caller is denied before the authorized bootstrap succeeds, then every later bootstrap is denied and audited.

## Admin permission matrix

| Action | `owner_admin` | `support` | `reviewer` |
|---|---:|---:|---:|
| read admin queues/readbacks | yes | yes | yes |
| annotate non-public triage notes | yes | yes | no |
| grant/revoke/suspend admin membership | yes | no | no |
| use break-glass | yes | no | no |
| suppress/unsuppress/restore public visibility | yes | no | no |
| close disputes or change public status | yes | no | no |
| set operator controls | yes | no | no |

Every denied role/action pair emits `admin.action_denied` with actor, target, reason, evidence, and correlation ID.

## Required audit event union

```text
claim.created
claim.rate_limited
claim.duplicate_suspected
claim.publish_rejected
claim.published
business.suppressed
business.unsuppressed
dispute.opened
dispute.updated
dispute.closed
registry.sync_queued
registry.sync_succeeded
registry.sync_failed
registry.sync_stale
discovery.generated
discovery.degraded
discovery.unavailable
admin.membership_bootstrapped
admin.membership_granted
admin.membership_revoked
admin.break_glass_used
admin.action_denied
operator_control.changed
```

Every event carries:

```text
eventId
eventType
actorKind
actorRef or anonymousBucket
authSessionRef/orgRef where present
businessId/slug where applicable
targetType/targetRef
beforeState
afterState
idempotencyKey
correlationId
reasonCode
evidenceRefs for admin actions
redactedPayload
payloadHash
failureCode where applicable
createdAt
```

Optional actor/target on consequential events is rejected.

## Public projection allowlists

Public page/search/registry/sitemap/llms/UCP may expose only named public DTO fields:

```text
slug
name
category
suburb/serviceArea
primaryService
publicStatus
trustTier
indexStatus
discoveryStatus
firstRequestMode
firstRequestPublicDisclosure/publicChannel/noContactReason
approved public ownerMessage
approved sourceRefs labels, not secrets
```

Never expose:

```text
owner email/phone raw values
claimant contact raw values
Clerk IDs/session IDs
tokens/API keys/webhook secrets
raw dispute notes
raw provider payloads
internal admin reasons unless public-safe
private evidence refs
```

## CSRF/Origin coverage

Required on session-cookie mutations:

- claim submit/publish,
- business edit,
- suppress/unsuppress,
- dispute decision,
- admin membership grant/revoke,
- operator control change.

Tests cover missing token, foreign Origin, and same-site success.

## Public removal/dispute intake controls

`/privacy/remove-business` is a public-write safety valve, not an unbounded mailbox.

- Rate-limit by actor/session/IP/device fingerprint.
- Dedupe by target business/service plus contact hash and normalized evidence hash.
- Cap evidence length, file count, file type, and total payload bytes.
- Require CSRF/same-site Origin for session-bearing submissions.
- Store raw contact/evidence only behind private evidence refs; public/admin lists show redacted summaries and hashes.
- Emit idempotent `dispute.opened`/`dispute.updated` audit events with operation key and correlation ID.
- Never index removal evidence, owner notes, or claimant contact in page/search/API/sitemap/llms/UCP.

Tests cover empty, invalid, duplicate, oversized, rate-limited, CSRF-failed, contested, suppressed-target, and successful submission states.

## Provider URL / SSRF quarantine

Phase 1 performs no server-side fetch of owner-supplied endpoint URLs.

Future endpoint/provider verification must enforce:

- HTTPS only,
- no credentials in URL,
- no localhost/private/reserved/link-local/metadata IPs,
- DNS rebinding defense,
- redirect limit,
- timeout/body size cap,
- no raw response persisted in public state.

## Prompt-injection and agent safety

Owner-authored text is untrusted data.

- Do not place owner text in system/developer/tool instruction positions.
- Cap field lengths.
- Strip raw HTML/scripts.
- Redact private identifiers.
- For future prompt builders, wrap business content in data-only delimiters and test injection strings.

## Required abuse tests

- competitor squats known business slug and is rate-limited/flagged,
- mass-claim attempt creates typed rejection/audit,
- wrong owner cannot publish another business,
- CSRF publish/suppress/admin action rejected,
- suppressed business absent from page/search/sitemap/llms/UCP,
- non-admin cannot read or mutate admin routes,
- support/reviewer admins denied for suppression, membership changes, operator controls, and dispute-close transitions,
- admin suppression requires reason/evidence audit,
- owner/contact/token text absent from public outputs,
- prompt injection inert in manifest/llms,
- money/provider fields absent from Phase 1 core and discovery outputs.

## Redaction rules

- Email/phone/IP/contact fingerprints use keyed hash unless raw private-vault storage is explicitly needed.
- Never log Authorization, cookies, Clerk/session tokens, provider tokens, webhook secrets, API keys, payment secrets, raw provider payloads, raw owner notes, raw claimant contact.
- Audit stores payload hash plus redacted payload by default.

## P2-P5 security expansion

The sections above remain Phase 1 authority. Phases 2-6 add private inquiry, notification delivery, agent-readable discovery, protected-action authority, paid activation, and receipt-backed business-action evidence. Every phase extends the same source-owned model: Convex/domain state, idempotency, audit, redaction, operator readback, and explicit public projections. Provider events, dashboards, screenshots, emails, webhooks, model output, and agent traces are evidence, not authority.

### P2-P6 authority rules

1. Browser input never supplies owner, manager/delegate, admin, provider, price, entitlement, or action authority.
2. Routes adapt; phase modules own authorization, idempotency, provider binding, audit, and projection rules.
3. Session-cookie mutations require CSRF token or same-site Origin enforcement. Machine/provider endpoints do not use CSRF; they must authenticate with signed raw payloads or server secrets.
4. Public projections are allowlisted builders. No row spread, provider payload spread, or "temporary debug" projection may reach page/search/API/sitemap/llms/UCP/docs/SEO.
5. Provider success/failure can update only an admitted source-owned readback. It cannot create inquiry truth, action truth, or paid entitlement by itself.
6. Every retryable or consequential transition has `correlationId`, scoped idempotency key, payload hash, redacted payload, typed result/error, audit event, and operator next action.
7. Phase 6 buyer mandates, Hermes requests, Stripe/Link evidence, and NVIDIA/NeMo evidence never grant business authority. Business authority comes only from source-owned owner approval plus checkpoint admission.
8. Phase 6 pre-checkpoint guardrail allow/block decisions may be recorded as `GuardrailDecisionEvidence`. They are not downstream consequence, payment proof, endpoint proof, or authority.

### Additional assets

```text
inquiry body and claimant contact
owner replies, private owner notes, inquiry read state
notification outbox rows, Resend/Novu provider IDs, webhook events
P3 public docs/schema/examples/support matrix and optional read-only API keys
protected-action proposals, owner approvals/rejections, gateway admissions, attempts, receipts, proof gaps
Autumn/Stripe billing operations, provider events, receipts, refunds, disputes, cancellations, reconciliation rows
business action cards, buyer mandates, capability requests, authorization checkpoints, guardrail decisions, external evidence events, endpoint descriptors, JSON schemas, private provisioning/payment-gate refs, Action Receipts
provider secrets, webhook secrets, API keys, customer portal refs, invoice/receipt refs
```

### Additional trust boundaries

```text
public inquiry form -> inquiry module
owner inbox route -> source-owned owner access
notification outbox -> Resend/Novu APIs
Resend/Novu webhook -> raw-body signature verification -> durable notification readback
developer docs/schema route -> public projection builder
optional API key -> read-only public route allowlist
owner approval route -> protectedAction policy/gateway
protectedAction gateway -> provider/internal attempt boundary
billing start route -> Autumn/Stripe hosted flow
Autumn/Stripe webhook -> raw-body signature verification -> billing reconciliation
Hermes/NVIDIA/Stripe/Link evidence -> business-action checkpoint/evidence adapter -> Action Receipt verifier
```

### CSRF, Origin, and authorization matrix

| Phase/surface | CSRF/Origin requirement | Authorization requirement | Source-owned result |
|---|---|---|---|
| P2 public inquiry submit | Same-site Origin for browser POSTs; CSRF token when a session cookie is present. | Anonymous or authenticated submitter may only target source-eligible, published, non-suppressed service/business rows. Abuse buckets gate IP/device/contact/business/service. | Creates inquiry thread/message/audit before notification dispatch; duplicate or invalid submits return typed failures. |
| P2 owner inbox list/detail/read | Read-only routes do not need CSRF but must not be public-cacheable. | Clerk principal must map to source-owned owner access for the target business. Manager/delegate access is absent unless a source-owned business-access seam exists. | Wrong-owner defaults to not-found to avoid enumeration; forbidden is allowed only when legitimate object context is already established. |
| P2 mark-read/reply/close | CSRF or same-site Origin required. | Same owner-access rule as inbox reads; revoked owners fail closed. | Writes inquiry state and audit in one logical operation; notification success/failure never mutates message truth. |
| P2 notification retry/no-repair/operator controls | CSRF or same-site Origin required. | `owner_admin` or explicit source-owned operator permission. Support/reviewer roles are read-only unless a later source-owned permission matrix grants more. | Bounded retry or terminal no-repair state with reason, next action, audit, and preserved readback. |
| P2 Resend/Novu webhooks | No CSRF. Raw-body provider signature verification is required before admission. | Provider identity comes only from verified signature/secret and bound provider refs. | Valid duplicates are no-ops; unbound events are held for operator; events never create inquiry/message truth. |
| P3 public docs/schema/examples/support matrix | Read-only; public-cacheable only for public artifacts. | Anonymous read of allowlisted public DTOs. | Generated from source state; withheld rather than published stale when parity/readback fails. |
| P3 private readbacks/config and API-key create/reveal/rotate/revoke if shipped | CSRF or same-site Origin required. | Source-owned owner/admin access for the owning business/account. | API keys are reveal-once, hash-at-rest, read-only scoped, rate-limited, revocable, audited, and denied for mutations. |
| P3 API-key authenticated reads if shipped | No CSRF for machine requests; API key must be in an authorization header, never query strings. | Hashed key lookup plus active/revoked/scope/rate-limit checks. | Read-only public allowlist response; mutation/payment/action routes reject even with a valid key. |
| P4 propose action | CSRF or same-site Origin for browser/session proposal. | Authenticated source-owned actor and target context; anonymous proposal is unavailable unless the chosen action decision record explicitly designs abuse controls. | Creates proposal/policy audit only; no provider/internal side effect. |
| P4 owner approve/reject | CSRF or same-site Origin required; approval pages require frame-ancestor/clickjacking protection. | Source-owned owner access to the exact business/action proposal; stale/revoked owners fail closed. | Writes visible owner decision/consequence-copy version/audit before any gateway admission. |
| P4 gateway consume/provider attempt | No browser CSRF path; gateway is internal. | Durable one-use admission bound to proposal hash, policy hash, contract hash, owner decision, expiration, and idempotency key. | Admission is atomically consumed before attempt; replay/concurrency becomes typed failure/readback. |
| P4 provider callbacks if any | No CSRF. Signed callback verification is required where the provider supports callbacks. | Bound to existing attempt/admission/provider refs. | Callback is evidence only; proof gaps and mismatches stay visible. |
| P4 retry/no-repair/operator controls | CSRF or same-site Origin required. | `owner_admin` or explicit source-owned operator permission. | Bounded idempotent retry or terminal no-repair with reason, next action, audit, and no provider-success overclaim. |
| P5 checkout/customer-portal start | CSRF or same-site Origin required. | Authenticated owner must bind to source-owned business, approved plan/offer, and source-controlled return/cancel URLs. | Creates pending billing operation/readback before provider redirect; client-supplied amount/currency/customer/provider IDs are ignored/rejected. |
| P5 billing webhooks/readbacks | No CSRF. Raw-body Autumn/Stripe signature verification is required before admission. | Provider identity comes only from verified signature/secret plus binding to pending operation or known provider object. | Invalid rejected, duplicate idempotent, unbound held; no direct entitlement from webhook alone. |
| P5 reconciliation retry/no-repair/operator controls | CSRF or same-site Origin required. | `owner_admin` or explicit source-owned billing operator permission. | Reconciliation can admit, repair, hold, retry, or mark no-repair with audit; original receipts remain append-only. |
| P6 action-card/admin setup | CSRF or same-site Origin required. | `owner_admin` or explicit source-owned operator permission; owner-authored card changes require source-owned owner access. | Creates immutable card versions/source hashes. Public discovery may expose only allowlisted card facts after enforcement exists. |
| P6 capability request | CSRF or same-site Origin for browser/session requests; machine requests require server-owned bearer or signed admission if shipped. | Buyer mandate can constrain request scope but cannot approve business consequence. Hermes is delegated requester only. | Creates request/readback only. No provider, payment, owner inbox, endpoint exposure, or external evidence consequence before accepted checkpoint. |
| P6 owner checkpoint | CSRF or same-site Origin required; approval pages require frame-ancestor/clickjacking protection. | Source-owned business owner approval for the exact business/card/request; wrong, stale, revoked, missing, or rejected owners fail closed. | `accepted`, `refused`, `clarification_required`, `proof_gap`, and `expired` all produce reconstructable readback/receipts. Only accepted can admit downstream evidence. |
| P6 guardrail decision evidence | No browser CSRF path when produced by server-side policy adapter. | Bound to request hash, policy hash, model/provider/version, private trace ref hash, idempotency key, and correlation ID. | Records allow/block/refusal policy evidence before or at checkpoint. It never creates downstream provider/payment/action consequence. |
| P6 external evidence events | No CSRF for provider callbacks; raw-body signatures or server-owned secrets are required where the provider supports them. | Bound to an accepted checkpoint, exact request/action/amount/currency when present, provider ref hash, payload hash, idempotency key, and correlation ID. | Invalid, unsigned, unbound, duplicate-conflicting, stale, decorative, or wrong-request evidence is rejected/held/proof-gap; it never mints authority. |

### Provider webhook and readback requirements

All provider webhooks share this standard:

- Preserve the exact raw request body bytes before JSON parsing.
- Verify the current official provider signature with the endpoint-specific secret and timestamp/replay tolerance where supported.
- Reject missing, malformed, expired, or invalid signatures before provider data is admitted. Record only redacted rejection/audit metadata.
- Dedupe durably by provider event ID plus logical object key and AE operation/dispatch ID where present. Same valid duplicate returns the stored result; same key with different body hash is held for operator.
- Bind every event to an existing source-owned object before it can affect readbacks. Unbound provider events go to `held_for_operator`.
- Persist provider family, provider event ID, stable provider object refs, signature status, normalized allowed fields, payload hash, redacted payload, duplicate/unbound status, and correlation ID.
- Discard raw provider payloads after signature verification, hashing, and normalization unless the owning phase has a private evidence-ref retention design.

Provider-specific requirements:

| Provider | Required verification | Dedupe/binding | Authority limit |
|---|---|---|---|
| Resend | Delivery webhooks use raw-body Svix verification with `svix-id`, `svix-timestamp`, `svix-signature`, and `RESEND_WEBHOOK_SECRET`. | Dedupe by `svix-id`, Resend message/event ref, AE notification dispatch ID, and payload hash. Bind to a queued dispatch. | May update delivery readback states such as sent/delivered/bounced/complained/delayed/failed/suppressed. Never creates or deletes inquiry/message state. |
| Novu | REST calls use server-only `Authorization: ApiKey <NOVU_SECRET_KEY>`. If Novu webhooks ship, implementation must verify the current official signed webhook mechanism against the raw body and configured webhook secret. | Dedupe by Novu event/workflow/transaction/message/subscriber refs plus AE dispatch ID and payload hash. `transactionId`/`Idempotency-Key` semantics are used for outbound trigger replay. | May update notification orchestration/readback only. If current Novu docs do not support verifiable signed webhooks for the selected path, do not expose a public Novu webhook; use authenticated polling/API readback and record the blocker. |
| Autumn | Autumn webhooks/readbacks use the current official raw-body signature mechanism and Autumn webhook secret. | Dedupe by Autumn event ID plus Autumn customer/subscription/checkout/entitlement/invoice refs, AE billing operation ID, and payload hash. | Autumn is billing/product-ops evidence under the money decision record; admitted events can propose paid-state changes only through AE billing rules and reconciliation. |
| Stripe | Direct Stripe webhook endpoints ship only when required for PSP evidence under Autumn or after an explicit Autumn blocker fallback. Verify `Stripe-Signature` against the exact raw body and endpoint secret. | Dedupe by `event.id` plus logical Stripe object IDs such as checkout session, customer, subscription, invoice, payment intent, charge, refund, dispute, and AE billing operation ID. | Stripe remains PSP evidence. A Stripe event alone never grants paid activation, plan access, wallet balance, settlement, or protected-action authority. |
| Phase 6 Stripe/Link | Direct Stripe/Link use for the paid-intake action requires `06-MONEY-EVIDENCE-DECISION.md` before implementation. Verify raw-body Stripe signatures for webhooks and bind Checkout Session/PaymentIntent/Payment Link/SPT/Link refs to the exact request/checkpoint/amount/currency/mandate. | Dedupe by provider event/object ID plus Phase 6 request/checkpoint/receipt refs and payload hash. | Evidence only. It never grants paid activation, subscription authority, wallet balance, custody, settlement, seller payout, or production payment claim. |
| Phase 6 Hermes/NVIDIA | Hermes/NVIDIA evidence must be server-admitted through source-owned adapters. NeMo/Nemotron evidence binds policy hash, request hash, model/provider/version, private trace ref hash, and correlation ID. | Dedupe by request/checkpoint/policy/trace refs and payload hash. | Evidence only. It cannot approve business consequence, prove Stripe truth, prove endpoint hosting, or claim OS/process sandboxing. |

### Environment and secret classification

Planning docs may name intended env vars. `.env.example` is updated only in the implementation PR that first reads each provider secret or public-safe provider ref in source. That PR must add empty placeholders and classification comments, not real values. Server secrets must never use a `VITE_` prefix or any client-exposed prefix.

| Phase | Env/config family | Classification | Rule |
|---|---|---|---|
| P2 Resend | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | server secret | Server-only; never logged, audited raw, exposed to client, or copied into public docs. |
| P2 Resend | `RESEND_FROM`, sender/domain verification refs | operational config | Not client authority; include only redacted/readback-safe values in operator views. |
| P2 Novu | `NOVU_SECRET_KEY`, Novu webhook secret if webhooks ship | server secret | Server-only API/webhook credential; rotate on exposure; never client-exposed. |
| P2 Novu | `NOVU_APPLICATION_ID`, workflow IDs, API base/region | public-safe or operational config only when needed | Client exposure is allowed only for a deliberate client-side Novu Inbox/readback surface and only if the value grants no secret authority. Workflow/API-base config remains server-owned by default. |
| P3 API keys if shipped | API key material, hash pepper/signing secret | secret credential | Reveal once, hash at rest, prefix/last4 only in UI/logs, revoke/rotate/audit/rate-limit. |
| P4 selected provider/internal attempt | Provider API keys/webhook secrets for the one selected action | server secret | Names are added only with the selected action implementation. Egress is allowlisted; credentials and payloads are redacted. |
| P5 Autumn | Autumn secret key and webhook secret | server secret | Server-only; endpoint-specific webhook secret; rotate with money incident playbook. |
| P5 Autumn | Autumn project/org/environment/API base/dashboard/portal refs | operational config | Public only if explicitly harmless and needed by UI; otherwise server-owned and redacted in readbacks. |
| P5 Stripe | Stripe secret key and webhook secret | server secret | Server-only; no direct Stripe subscription authority unless an Autumn blocker decision record exists. |
| P5 Stripe | Stripe publishable key or dashboard refs if required by hosted flow | public-safe config | Client exposure only when the chosen hosted flow requires it and it cannot grant server authority. |
| P6 Stripe/Link | Stripe secret key, webhook secret, Link/SPT credentials if used | server secret | Server-only; direct test-mode evidence requires `06-MONEY-EVIDENCE-DECISION.md`; live mode requires a later production decision record. |
| P6 Hermes/NVIDIA | Hermes bearer/API secrets, NVIDIA/Nemotron/NeMo keys or trace credentials if used | server secret | Server-only; private traces may be referenced by hash/ref, never public raw prompt, raw trace, or unrestricted credential. |

Every provider secret requires a named owner, rotation path, local/dev/prod setup note, and deploy/readback smoke in the phase that first uses it. Secrets, webhook signing material, provider bearer tokens, cookies, Clerk/session tokens, API keys, raw payment credentials, and raw provider payloads are banned from logs, audit payloads, public docs, and copied support snippets.

### Data classification, redaction, and retention

| Data | Classification | Storage/read rule | Retention rule |
|---|---|---|---|
| Inquiry body/contact | private customer/owner data | Raw message/contact only in private inquiry storage or private evidence refs; public outputs get eligibility/status only; contact/fingerprints use keyed hashes outside private views. | P2 plan must define export/delete/tombstone behavior before launch. Redacted audit hashes may remain for reconstruction after raw content deletion. |
| Owner replies/notes/read state | private owner data | Owner/admin read only; never in registry/API/UCP/llms/sitemap/SEO/logs/public docs. | Same privacy/export/delete posture as inquiry content. |
| Notification payloads/provider readbacks | operational provider evidence | Persist redacted payload, normalized state, provider refs, dispatch ID, payload hash, retry state, and last redacted error. | Raw webhook body is discarded after verification/hash/normalization unless a private evidence ref with explicit TTL exists. |
| P3 docs/schema/examples/fixtures/support matrix | public projection | Generated only from public DTO allowlists and route-tested readbacks; withheld on parity failure. | Public artifacts may be cached; stale/degraded/unavailable state must be explicit. |
| P3 fetch telemetry | public-safe operational telemetry | Route, status, schema/cache version, freshness, bot class, public IDs, error code; no private P2/P4/P5 payloads. | IP/device/user-agent data is bucketed or keyed-hashed according to abuse telemetry policy. |
| API keys if shipped | secret credential | Key material never persists raw; hash at rest; prefix/last4 only; no query-string logging. | Usage/readback retained as redacted audit; revoked keys remain hashed for replay/abuse detection. |
| Protected-action proposals/approvals/receipts | private/high-consequence operational data | Owner/admin/operator projections with consequence copy; public artifacts may expose only source-readbacked support status. | Receipts/proof gaps remain reconstructable; raw provider evidence follows private evidence-ref retention if needed. |
| Protected-action provider/internal attempts | operational provider evidence | Egress allowlist, timeout/body caps, payload hash, stable refs, redacted error/result. | Raw downstream responses are discarded after hash/normalization unless private evidence retention is explicitly designed. |
| Billing/payment evidence | payment/provider evidence | Hosted provider flows only; no PAN, CVC, raw payment credentials, custody, stored value, or wallet balances. Store receipts, stable refs, normalized paid/refund/dispute/cancel fields, payload hash, and redacted payload. | Money decision record must define legal/tax/refund/dispute retention. Raw webhook bodies are not retained beyond verification/hash/normalization without private evidence design. |
| Business action cards/mandates/checkpoints | high-consequence operational data | Public projection may expose only allowlisted card labels/statuses after source enforcement exists; mandates and checkpoint internals stay owner/operator/admin scoped. | Action receipts remain reconstructable; expired/revoked/refused/proof-gap states preserve hashes and reason codes. |
| Guardrail decision evidence | private AI/tool-governance evidence | Store redacted allow/block/refusal decision, policy hash, request hash, model/provider/version, private trace ref hash, and payload hash. | Raw prompts/traces are discarded or stored only behind explicit private evidence refs with TTL/access policy. |
| Phase 6 external evidence/result artifacts | operational provider evidence | Store provider family, provider ref hash, payload hash, amount/currency when present, endpoint descriptor/schema/ref hashes, idempotency, correlation, and redacted payload. | Raw provider payloads are discarded after verification/hash/normalization unless a private evidence retention design exists. |
| Audit events | reconstruction spine | Common envelope with redacted payload and payload hash; no raw secrets or private bodies. | Long-lived append-only reconstruction is allowed; deletion requests remove/redact private payload refs while preserving lawful audit hashes and reason codes. |

No raw inquiry, provider, or payment payload may ship with "retain forever" as an implicit default. The owning phase execution plan must name the retention class, export/delete behavior, and private evidence access policy before raw private evidence exists.

### Audit event extension

P2-P5 must extend the same audit event union before implementation. The event names below are the required minimum; phase plans may add narrower typed events but must not create parallel logs.

```text
inquiry.submitted
inquiry.rejected
inquiry.rate_limited
inquiry.viewed
inquiry.read_marked
inquiry.replied
inquiry.closed
notification.queued
notification.triggered
notification.sent
notification.delivered
notification.bounced
notification.complained
notification.delivery_delayed
notification.failed
notification.suppressed
notification.retry_scheduled
notification.retry_attempted
notification.retry_exhausted
notification.no_repair_marked
notification.webhook_received
notification.webhook_duplicate
notification.webhook_rejected
notification.webhook_held
developer_discovery.generated
developer_discovery.withheld
developer_discovery.degraded
developer_discovery.parity_failed
developer_discovery.fetch_recorded
developer_discovery.cache_invalidated
api_key.created
api_key.revealed
api_key.used
api_key.denied
api_key.rotated
api_key.revoked
protected_action.proposed
protected_action.proposal_rejected
protected_action.policy_evaluated
protected_action.approved
protected_action.rejected
protected_action.expired
protected_action.gateway_admitted
protected_action.gateway_consumed
protected_action.gateway_replay_rejected
protected_action.attempted
protected_action.attempt_succeeded
protected_action.attempt_failed
protected_action.retry_attempted
protected_action.retry_exhausted
protected_action.receipt_recorded
protected_action.proof_gap_recorded
protected_action.no_repair_marked
protected_action.callback_received
protected_action.callback_rejected
billing.checkout_started
billing.portal_started
billing.return_recorded
billing.cancel_returned
billing.provider_event_ingested
billing.provider_event_duplicate
billing.provider_event_rejected
billing.provider_event_held
billing.receipt_recorded
billing.paid_state_changed
billing.refund_recorded
billing.dispute_recorded
billing.chargeback_recorded
billing.cancelled
billing.past_due_recorded
billing.reconciliation_started
billing.reconciliation_mismatch
billing.reconciliation_failed
billing.reconciliation_repaired
billing.no_repair_marked
business_action.card_versioned
business_action.mandate_recorded
business_action.request_proposed
business_action.checkpoint_recorded
business_action.guardrail_allowed
business_action.guardrail_blocked
business_action.evidence_ingested
business_action.evidence_held
business_action.result_artifact_recorded
business_action.receipt_recorded
business_action.proof_gap_recorded
business_action.no_repair_marked
```

Each event keeps the common envelope above and adds phase-specific fields only as redacted/allowlisted values:

```text
phase
capability
privacyClass
providerFamily where applicable
signatureStatus where applicable
providerEventId/providerObjectRefs where applicable
sourceObjectRefs
retentionClass
operatorNextAction
```

Webhook rejection, duplicate, unbound, held, retry-exhausted, and no-repair states are audit-worthy. Missing audit on those states is a production blocker for P2-P5 execution.

### Operator kill, retry, and no-repair controls

Controls are source-owned, audited by `operator_control.changed`, and never env-only. Disabling a control blocks new risky work but preserves readback, privacy export/delete, reconciliation, audit, and operator reconstruction.

| Control | Blocks when disabled | Must continue |
|---|---|---|
| `inquiries_enabled` | New public inquiry submissions and public inquiry availability claims. | Owner/admin readback, close, privacy/export/delete, audit. |
| `inquiry_owner_replies_enabled` | New owner replies and reply-triggered notifications. | Inbox read, close, audit, existing delivery readbacks. |
| `notification_dispatch_enabled` | New Resend/Novu dispatch attempts and manual retries. | Outbox readback, webhook rejection/holding, no-repair marking. |
| `notification_webhooks_enabled` | Admission of provider notification events as readback changes. | Signature rejection logs, held event hashes, operator investigation. |
| `developer_discovery_publish_enabled` | Regeneration/publication of docs/schema/examples/support artifacts. | Current artifact readback, stale/degraded/unavailable marking. |
| `discovery_api_keys_enabled` | API-key create/reveal/rotate/use if keys ship. | Revoke, audit, readback, denied-key telemetry. |
| `protected_actions_enabled` | New action proposals and public/action discovery claims. | Existing queue readback, reject/close/no-repair, audit. |
| `protected_action_attempts_enabled` | Gateway consumption, provider/internal attempts, and retries. | Proposal/approval readback, receipt/proof-gap/no-repair reconstruction. |
| `paid_activation_enabled` | New checkout/customer-portal starts and paid public claims. | Receipt/status reads, refunds/disputes/cancellations, reconciliation, rollback readback. |
| `billing_webhooks_enabled` | Admission of provider billing events as state transitions. | Signature rejection logs, held event hashes, manual reconciliation readback. |
| `billing_reconciliation_enabled` | Automated or manual repair/retry transitions. | Read-only mismatch visibility and no-repair marking. |
| `business_actions_enabled` | New Phase 6 action cards, capability requests, and public/demo business-action claims. | Existing request/checkpoint/receipt readback, refusal/proof-gap/no-repair, audit, and private evidence redaction. |
| `business_action_attempts_enabled` | Accepted-checkpoint downstream evidence admission, endpoint/result artifact recording, and retries. | Card/request/checkpoint readback, guardrail decision evidence, receipt/proof-gap/no-repair reconstruction. |

Retry rules:

- Retry only from typed retryable states with bounded attempt count, backoff/retry-after, idempotency key, same-body hash, and preserved previous result.
- Same idempotency key with different body hash is a conflict/held state, not a retry.
- No-repair requires actor, reason, evidence/ref, operator next action, and terminal state. It never deletes provider evidence or rewrites source state to match a provider dashboard.
- Kill switches must not hide historical failures. Readbacks still show disabled, held, failed, retry-exhausted, proof-gap, disputed, cancelled, and no-repair states.

### Public projection allowlists and copy/claim safety

The Phase 1 public projection allowlist remains the default. P2-P6 may add only the public fields below after route behavior and source-owned readback exist:

| Phase | Public projection allowlist after evidence | Never public |
|---|---|---|
| P2 inquiry | `inquiryAvailable`, eligible public service target, conservative inquiry CTA/status copy, submitted receipt/correlation safe token if shown to the submitter, public-safe disabled reason. | Inquiry body, claimant contact, owner replies/notes, owner read state, notification payloads, provider IDs, provider errors, webhook status, guaranteed-response wording. |
| P3 discovery | Support matrix status, route health, schema/cache version, freshness/degraded/unavailable reasons, public DTO examples/fixtures, AE-hosted fallback label. | Private inquiry/action/billing fields, mutation descriptors, tool-call authority, payment/action descriptors, API-key secrets, merchant-origin UCP claims without readback. |
| P4 protected action | One selected action class name only after evidence, `ownerApprovalRequired`, proposal-only/owner-pending status, proof-gap honesty where public-safe. | Proposal details, owner decision details, provider payloads, direct-execute/callable/autonomous wording, provider-success guarantees, payment movement. |
| P5 paid activation | Selected paid activation availability, public offer/pricing copy approved by the money decision record, and public-safe paid-state facts explicitly approved for discovery after route/readback proof. | Owner-only billing center links/status, customer portal refs, receipts, invoices, provider customer/subscription/payment IDs, PAN/CVC/payment credentials, wallet/credits/balance/custody/settlement fields, direct Stripe authority claims. |
| P6 business action receipt | One selected action label, `proposal_only`, owner approval required, receipt required, checkpoint status, public-safe receipt/verifier labels/hashes/timestamps, and proof-gap honesty after card/checkpoint/receipt enforcement exists. | Buyer mandate internals, owner decision details, raw prompts/traces, private endpoint/provisioning refs, provider payloads, Stripe/Link object IDs, payment credentials, autonomous/direct-execute claims, wallet/custody/settlement/product marketplace claims. |

Public copy, route labels, SEO/AEO files, `llms.txt`, UCP, docs/schema/examples, API docs, email/social/partner copy, and launch assets must pass positive allowlist and negative-claim scans before each capability is called live.

Allowed claim floor:

- P2 may claim only human inquiry submission and owner-managed reply/close after live source readback.
- P3 may claim only read-only builder/agent discovery generated from current public source state.
- P4 may claim only one named non-money owner-approved action with approval-required/reconstruction posture.
- P5 may claim only one selected Autumn/Stripe paid activation rail with hosted flow, receipts, reversal/dispute/cancel handling, and reconciliation readback after money-decision and provider smoke evidence.
- P6 may claim only one receipt-backed autonomous business operation proof after source-owned card, mandate, checkpoint, guardrail evidence, external evidence, concrete result artifact, receipt verifier, support/kill rules, and copy scans agree. Hackathon spike copy must not imply production support.

Negative scans must fail on unproven claims including:

```text
AI reply/agent reply/autonomous response
booking/scheduling/quote acceptance/order placement
guaranteed response or guaranteed owner action
multi-channel/SMS/WhatsApp/Slack/voice/push
SDK/CLI/plugin/developer platform/API-key platform unless source-readbacked
MCP mutation/tool invocation/callable action/direct execute
autonomous action/provider marketplace/broad action catalog/hosted agents
paymentRequired before P5 proof
wallet/credits/balance/stored value/custody/x402/crypto/Connect/split payout/request-market settlement
direct Stripe subscription authority unless an Autumn blocker decision record exists
merchant-origin UCP/.well-known standard claims without merchant-origin readback
generic executeAction/arbitrary action marketplace/provider other
receipt-backed autonomous business operation before P6 source-owned proof
agent checkout/instant purchase/self-approving agent/unbounded autonomous spend
product marketplace/generic API marketplace/production autonomous payment support
```

Provider evidence cannot satisfy a public claim by itself. A claim ships only when source-owned state, route behavior, audit/readback, support owner, kill rule, and copy scan all agree.

### Phase-specific security acceptance

P2:

- Owner inbox defaults to owner-only. Manager/delegate access requires a source-owned business-access seam and tests before use.
- Abuse controls include IP/device/contact/business/service buckets, duplicate fingerprint hashes, content length caps, malformed contact rejection, mass-inquiry/spam paths, and no attachments unless separately designed.
- Email privacy must define raw-address visibility, reply-to behavior, bounce/complaint suppression, unsubscribe/transactional rationale, and complaint handling.
- Redaction scans cover inquiry body, claimant contact, owner notes, notification IDs/payloads, provider error text, and webhook secrets.

P3:

- Generated artifacts must fail scans for secrets, private inquiry content, mutation descriptors, payment descriptors, and protected-action descriptors unless those capabilities are source-readbacked and allowlisted above.
- Public docs/schema may be cacheable; private readbacks/key-auth responses must not be public-cacheable or wildcard-credentialed.
- If merchant-origin fetches ever ship, SSRF quarantine above is mandatory first.

P4:

- Owner approval pages require frame-ancestor/clickjacking protection and visible consequence copy.
- Gateway admission is durable, expiring, one-use, policy-hash/contract-hash-bound, and atomically consumed before any attempt.
- Provider/internal attempts use an egress allowlist, no owner-supplied URL fetch, timeout/body caps, credential redaction, and signed callback/readback verification where callbacks exist.
- Receipt schema separates proposal, policy decision, owner approval, gateway admission, downstream result, proof gap, and emitted receipt.
- Phase 4 plan 04-01 selects `contact-follow-up` only. The provider/internal boundary is `source_owned_follow_up_outbox`; it may record source-owned receipt or proof-gap evidence for a saved Phase 2 inquiry/source message, but it cannot book work, charge money, guarantee customer response, or authorize future actions.
- The selected action support gate requires `protected_actions_enabled`, `protected_action_attempts_enabled`, a `contact-follow-up` support record, support-load thresholds, retention/delete posture, and copy-scan proof before public/developer `approval required` claims can render.

P5:

- `.env.example` is updated only in the implementation PR that first reads Autumn/Stripe provider secrets or public-safe provider refs; planning docs may name variables earlier, but no secret placeholder is required before code uses it.
- Checkout/customer-portal start requires authenticated owner/business binding, source-owned plan/quote, idempotency, correlation, and source-controlled return/cancel URLs.
- Webhook ingest requires raw-body signatures, durable dedupe, unbound-object hold, and no direct entitlement.
- Refund/dispute/chargeback/cancellation handling preserves original receipts and records reversal/debt/hold/next-action state.
- Money decision records must include AUD/GST/tax, terms/refund/legal review, provider credential ownership/rotation, incident/rollback owner, and proof that hosted flows keep AE out of custody/stored-value scope.

P6:

- Phase 6 implementation requires `06-CONTEXT.md`, a verified `06-*-PLAN.md`, and a plan-level preflight table naming P4/P5 evidence status, spike exceptions, commands, files, and stop conditions.
- Direct Stripe/Link test-mode evidence requires `06-MONEY-EVIDENCE-DECISION.md`; live mode requires a later production decision record.
- Business Action Cards are source-owned immutable versions for `provision-paid-intake-endpoint` only. No `| string`, `provider: "other"`, generic `executeAction`, broad action registry, or product/API marketplace shape is allowed.
- Buyer mandates constrain request scope but do not grant owner/business authority. Accepted checkpoint requires source-owned owner approval unless the plan labels a spike proof-gap.
- Guardrail allow/block/refusal evidence is recorded separately from post-checkpoint external evidence and never admits downstream consequence by itself.
- Success requires endpoint descriptor, JSON schema, and private endpoint/provisioning/payment-gate ref; owner inbox item, report, screenshot, model output, payment event, or status label alone is not success.
- Public verifier output exposes only public-safe labels, statuses, hashes, timestamps, and non-sensitive refs. Raw prompts, private traces, provider payloads, payment credentials, customer identifiers, and private endpoint refs stay private.
