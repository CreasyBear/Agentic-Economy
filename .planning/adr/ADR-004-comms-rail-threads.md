---
# ADR-004: Communication rail — durable receipted agent↔business threads
Status: Proposed
Date: 2026-07-03
Scope: 4 — Communication rail (durable receipted agent↔business threads)

## Context

AE's communication is one-shot. The initiator (human or agent) submits a
qualified inquiry and receives a **fire-and-forget receipt** — a `threadId` +
a notification status — with no way to read the thread back
(`convex/inquiries.ts:120-144` `submitInquiryResult`; `inquiry.submit` is the
only assistant-exposed write, `src/modules/inquiries/inquiry.actions.ts:96-115`).
Initiators are anonymous at submit (`convex/authz.ts:40-45` returns
`kind:'anonymous'`), so there is no principal to hang a readback off. The
business side is human-only: owner reads/replies via Clerk-authed owner UI, and
the outbound channel is one-way notification email
(`src/modules/notification-outbox/public.ts`).

Yet the data model already **anticipates two-sided messaging**:
`InquiryThreadRecord` (`src/modules/inquiries/internal/schema.ts:161-177`),
`InquiryMessageRecord` with `sender:'customer'|'owner'` (schema.ts:179-189, 25),
and `InquiryNotificationRecord` with `recipientRole:'owner'|'customer'`
(schema.ts:191-203, 195). And AE already owns a durable dispatch/attempt/webhook
machine — `NotificationDispatchRecord` (retryCount/retryAfter/
providerIdempotencyKey/payloadHash, notification-outbox/internal/schema.ts:62-87),
`NotificationDispatchAttemptRecord` (89-102), `NotificationWebhookEventRecord`
(signatureStatus/providerEventId dedupe, 104-119) — reusable transport.

Scope 4 (`local://five-scopes.md:30-34`) closes the deficit: initiator-side
thread readback, wedge-agnostic typed message kinds, a business-side agent
responder over signed webhooks, and delivery/read receipts both sides. The
reference interaction grammar the user likes is oh-my-pi IRC
(`local://research-omp-irc.md`), but its in-process, ephemeral, implicitly-
trusted properties must be rejected for a durable cross-org rail.

Why now: scopes 1/2/3 give the missing substrate (deploy, business-hosted
endpoints, attributed identity). Scope 4 turns the trust kernel into a *rail*
without touching the AGENTS.md boundary — a quote in a thread is communication,
never a transaction.

## Grilling record

### Q1 — Thread model: extend inquiry tables vs new thread tables?
**Evidence.** `InquiryThreadRecord` already carries threadId/businessId/ownerId/
serviceId/capabilityKind/status(`unread|read|replied|closed`)/firstMessageId/
sourceHash/version/timestamps/origin (schema.ts:161-177). Convex tables
`inquiryThreads`/`inquiryMessages`/`inquiryNotifications`/`inquiryReadStates`
already exist and index by thread (convex-schema.ts:17-104). The bloat detector
forbids "placeholder module" and "one-implementation adapter for later"
(`.planning/ROADMAP.md:228-240`).
**Answer.** Extend the existing inquiry tables — the inquiry **is** thread-kind
#1. A parallel `thread`/`message` table set would be a second component system
for no new capability. Keep `inquiry*` names for now; a rename to generic
`thread` is deferred (Q8 ticket). Confidence: **high**.

### Q2 — Message envelope v1: typed kinds over free text; wedge-agnostic?
**Evidence.** Current message body is untyped free text (schema.ts:179-189).
Standing veto (memory + `local://five-scopes.md:32`): no local-services
job-request fields (urgency/jobSuburb); generic commerce verbs only. Existing
`CapabilityKindValues` (`src/modules/catalog/internal/catalog-model.ts:31-37`)
ARE services-shaped (`emergency_callout_interest`) — the envelope must NOT
inherit that shape. Money-rail quarantine bans rail/amount primitives in core
domain (`.planning/ROADMAP.md:201`).
**Answer.** A zod discriminated union `messageEnvelopeV1` on `kind`:
`question | clarification | quote | acceptance`. All carry `body` (prose) +
optional `inReplyTo` (correlation, Q5). `quote` carries `terms:{summary,
quotedValue?, validUntil?}` where `quotedValue` is a **free-text display label**
(e.g. "AUD 1,200 fixed"), never a money primitive — keeping it out of the
quarantine. `acceptance` references the quote via required `inReplyTo` and is
communication only (Q9). All four are generic commerce verbs — a software
factory quotes a build, a content agency a deliverable — none carry
service/area/urgency. Wedge-agnostic: **passes**. Confidence: **high**.

### Q3 — Initiator readback: attributed identity vs capability token vs both?
**Evidence.** The first owned loop is a **human** first-contact inquiry
(`PRODUCT.md:28-40`); those initiators are anonymous (authz.ts:40-45). Scope 3
provides attributed *agent* identity, not human identity. Owner readbacks are
keyed to `ownerId` and require Clerk auth (research-ae-seams §c). If readback
required attributed identity, anonymous humans — the primary loop — could never
read their own thread.
**Answer.** **Both, by principal type.** An attributed agent (scope 3) reads
back keyed to its verified principal (mirrors owner keying). An anonymous human
initiator reads back via a high-entropy, single-thread **readback token** minted
only at submit — the honest analog of a "check your inquiry" link without
requiring email. Token contract after #22: 32 random bytes (256 bits), keyed
hash-only storage, seven-day TTL, no refresh or reply-time reissue, denial on
expiry/mismatch/privacy tombstone/owner close, and only the initiator's thread,
messages, delivery state, cursor, next step, and redacted submitted contact are
returned. Mandatory magic-link is rejected for v1 because contact may be
phone-only/no-email. Confidence: **high**.

### Q4 — Business-side responder: signed webhook dispatch + admission path?
**Evidence.** Outbox has the full machine (dispatch/attempt/webhook records,
retry/backoff, idempotency, provider dedupe — notification-outbox/internal/
schema.ts:62-119; commands at public.ts:53-59) but only for one-way email
providers `resend`/`novu` (schema.ts:16) — a *notification* rail, not a live
message transport (research-ae-seams:126). Route-verifies-then-store-trusts-hash
signature pattern already exists (Stripe webhook
`api.business-actions.stripe-webhook.ts:116-140`, HMAC-SHA256 over
`${ts}.${body}`, 300s tolerance, constant-time). Source-write scopes are a
closed enum gated hard (source-write-admission.ts:3-15).
**Answer.** Reuse the outbox record shapes/patterns but add a distinct provider
family `business_endpoint` with its own adapter enforcing the external-URL
security envelope. **Outbound (AE→business):** AE is the signer — POST the
message only after a scope-2 preflight accepts a checked `business_endpoint`
capability. Current scope-2 code exposes only `{originUrl, manifestUrl,
schemaRef}` (`BusinessEndpointCapabilityDescriptor`), so 04-03 is blocked until
scope 2 adds the missing private dispatch contract: a normalized HTTPS
`dispatchUrl`, an AE-held outbound signing-key ref, and a business verification
key/ref for inbound replies. `dispatchUrl` must be same-origin with the
domain-control-proved `originUrl`, and the latest `ae-endpoint-check:v1` result
must be `checked` + fresh. Header: `Ae-Signature: v1,t=<ts>,sig=<hmac>` over
`${ts}.${bodyHash}` with AE's per-business secret; idempotency via existing
`providerIdempotencyKey`; retry/backoff via existing `retryCount`/`retryAfter`;
dead-letter to `retry_exhausted`/`no_repair` only for actual POST attempts. The
preflight guard never POSTs, redirects, or creates a network attempt when
endpoint trust is stale/contradicted/unsupported/missing. **Inbound
(business→AE):** business POSTs its reply to `POST /api/inquiry/endpoint-webhook`
(mirrors resend-webhook route); route verifies the business signature and
dedupes via `providerEventId`; the reply is admitted through **source-write
admission** under a scope (existing vs new `business_agent_reply` — Q3 ticket),
validated + redacted, and written as an `InquiryMessageRecord` with
`sender:'business_agent'`. Confidence: **high** on adapter shape; **blocked** on
the missing scope-2 dispatch/key fields.

### Q5 — Which omp IRC semantics transfer; which are rejected?
**Evidence.** Transfer table + "do-not-transfer" list
(`local://research-omp-irc.md` §transfer, 122-146).
**Answer — TRANSFER:** wake == the signed webhook POST (offline endpoint =
queue + retry); receipts == deliveryAttempt rows (2xx delivered / 4xx-5xx-
timeout failed) **but with retry+backoff** — IRC's "peer gone, do not retry" is
wrong for a durable rail; `replyTo` == `inReplyTo`/`correlationId`; inbox ==
durable rows + read cursor (existing `inquiryReadStates` for owner; add
initiator cursor); `from`-filter/`drainPending` == query predicate on
(threadId, sender, afterCursor). **REJECTED:** ephemerality (persist every
message + attempt — audit/non-repudiation); in-process implicit trust (require
signed webhooks + mutual identity + idempotency + replay window + rate limits);
direct object hand-off (serialize-only over untrusted HTTP);
**auto-reply-on-behalf** (AE MUST NEVER fabricate a business reply — drop the
`irc-autoreply` mechanism entirely; async pending + timeout instead);
sessionFile revival (stateless cold start via inbound POST); synchronous
`await:true` coupling (async + subscription; bounded sync wait only as a thin
readback over the persisted thread, never the primary contract). Confidence:
**high**.

### Q6 — Read receipts: what is truthfully claimable?
**Evidence.** Attempt state yields `sent`/`delivered`/`failed`
(notification-outbox/internal/schema.ts:22-49); owner read tracked by
`inquiryReadStates` + `markCurrentOwnerInquiryRead` (research-ae-seams §c).
Email open-tracking is unreliable.
**Answer.** Claim only what state proves: **delivered** = the endpoint returned
2xx / the email provider accepted (delivered to the *destination*, not read);
**read** ONLY from an actual readback advancing a read cursor — owner via
`inquiryReadStates`, initiator via a new initiator cursor. NEVER infer "read"
from email opens. Business-agent "read" is **UNKNOWN** unless the endpoint posts
an explicit received/read ack event (Q5 ticket). Copy shows "Delivered, not yet
read" — never conflates the two. Confidence: **high**.

### Q7 — Provenance: honest disclosure when the business side is an agent?
**Evidence.** Sender enum needs a `business_agent` value; AGENTS.md bans
internal vocab and requires boundary-honest copy (AGENTS.md:14-19, 90-92); scope
3 attributes assistant-operated inquiries.
**Answer.** Every message carries `sender` (`customer`/`owner`/`business_agent`)
**and** an `operatedBy` provenance (`human`/`assistant`) so the initiator side
discloses person-vs-assistant separately from party. Human-surface copy for a
`business_agent` reply: "Automated reply from {business}" (owner/JSON surfaces
may be more explicit). Assistant-submitted inquiries surface "Sent via an
assistant on behalf of a person" in the owner inbox. No banned words
(source-owned/manifest/capability/gateway/callable/autonomous). Confidence:
**high**.

### Q8 — Abuse/rate: per-identity thread caps?
**Evidence.** Phase 1 rate-limit helper `rateLimitClaim`
(`src/modules/security/public.ts:310`; `AbuseRateLimitBucketRecord` 118-126;
`RateLimitClaimInput`/`RateLimitDecision` 155-171); inquiry already has
`inquiryAbuseBuckets` + `abuseWindowMs`/`abuseMaxSubmissionsPerWindow` controls
(convex-schema.ts:81-90; schema.ts:109-110).
**Answer.** Reuse `rateLimitClaim` + `inquiryAbuseBuckets` with per-identity
keys: anonymous initiator → existing anonymous bucket; attributed agent →
per-principal quota (scope 3 supplies limits); business_agent inbound replies →
per-endpoint burst cap (flooding endpoint → held/`no_repair`). Add bucket keys
`thread_message:{threadId}` (per-thread message cap) and
`initiator_thread:{principal}` (new-thread cap per window). Confidence: **high**.

### Q9 — Boundary: quote ≠ transaction; where acceptance hands to scope 5?
**Evidence.** `local://five-scopes.md:33`; AGENTS.md:14-19; money quarantine
`.planning/ROADMAP.md:201`; the checkpoint/receipt rail is P4/P5/P6.
**Answer.** A `quote` is communicated terms — never a charge, booking, or
availability guarantee; displayed as text with no pay/book affordance. An
`acceptance` records agreement-in-principle and executes nothing; its readback
surfaces a typed `nextStep` pointer: if the business has a scope-5 action card,
"Accepting starts a separate owner-approved step" routes into scope 5's
checkpoint rail (scope 5 owns execution); otherwise state the external next step
plainly. The thread/message schema carries NO autumn/stripe/wallet/credits/
paymentHandler fields. Confidence: **high**.

## Decisions

- **D1.** Extend the existing inquiry tables; the qualified inquiry is thread-kind
  #1. No parallel thread/message tables. Keep `inquiry*` naming for now.
- **D2.** Add `messageEnvelopeV1` = zod discriminated union on `kind`
  `question | clarification | quote | acceptance`, each with `body` + optional
  `inReplyTo`; `quote.terms = {summary, quotedValue?(free-text label),
  validUntil?}`. Persist `kind` + `inReplyTo?` + redacted/hashed `terms?` on
  `InquiryMessageRecord`. Existing free-text first messages read as `question`.
  No service/area/urgency fields — wedge-agnostic, generic commerce verbs only.
- **D3.** Ship initiator readback both ways by principal type: attributed agents
  (scope 3) key to their verified principal; anonymous humans use a high-entropy,
  single-thread readback token minted only at submit. New read action
  `inquiry.readThread` — schema `{threadId, readToken?}`; surfaces `agentTools`
  (attributed) + a public route readback (token); read-only; returns
  `{thread, messages[], deliveryState, lastReadCursor, nextStep?}`; refuses
  booking/payment/dispatch. Token contract: 32 random bytes (256 bits),
  store only a keyed cryptographic hash, scope to exactly one thread, expire after
  seven days, do not refresh/re-mint from replies, and deny if expired, privacy-
  tombstoned, owner-closed, or mismatched. The token never grants owner-only
  projections or raw contact/provider evidence.
- **D4.** Add outbox provider family `business_endpoint`: AE signs outbound POSTs
  (`Ae-Signature: v1,t=<ts>,sig=<hmac>` over `${ts}.${bodyHash}`, per-business
  secret, idempotency + retry/backoff + dead-letter reusing existing dispatch
  fields) only after a scope-2 `business_endpoint` preflight accepts a checked +
  fresh endpoint. 04-03 is blocked until scope 2 exposes the missing dispatch
  contract fields (normalized same-origin `dispatchUrl`, outbound signing-key ref,
  inbound verification-key ref); current descriptor has only `originUrl`,
  `manifestUrl`, and `schemaRef`. Preflight refusals for missing/stale/
  contradicted/unsupported/unreachable endpoints suspend dispatch before any POST
  or outbox network attempt; accepted POSTs use a 5s timeout, 16KiB serialized
  body cap, and 64KiB response cap. Reuse dispatch/attempt/webhook records for
  accepted POSTs; add
  `sender:'business_agent'` and (for the initiator side)
  `operatedBy:'human'|'assistant'`.
- **D5.** Inbound business replies arrive at `POST /api/inquiry/endpoint-webhook`,
  route-verified (business signature) + deduped (`providerEventId`), admitted via
  a new source-write scope `business_agent_reply`, validated + redacted, written
  as `business_agent` messages. Implementation must add `business_agent_reply` to
  `SourceWriteAdmissionScopeValues`; Convex `sourceWriteAdmissionArg` derives from
  that literal union. Route signature proves the business endpoint; source-write
  admission proves AE's webhook route verified it before any Convex write. AE
  NEVER auto-generates a business reply.
- **D6.** Transfer omp IRC semantics as: wake=webhook, receipt=attempt row (with
  retry/backoff), replyTo=inReplyTo/correlationId, inbox=durable rows + read
  cursor, wait=bounded poll/long-poll through the read-only action
  `inquiry.readThread`. Reject: ephemerality, in-process trust, direct hand-off,
  callback webhooks, SSE as the v1 contract, reply-on-behalf, sessionFile revival,
  and sync `await` coupling.
- **D7.** `Delivered` means a dispatch attempt got a provider/business-endpoint
  2xx or provider delivery webhook; it never means read. `Read` means an explicit
  receiving-side signal only: owner/customer readback cursor advance, or an
  optional signed `business_endpoint` ack event with status `read`. Without that
  signal, business-agent read is UNKNOWN.
- **D8.** Provenance: every message carries `sender` + `operatedBy`; human copy
  discloses "Automated reply from {business}" and "Sent via an assistant on
  behalf of a person" with no banned vocabulary.
- **D9.** Per-identity rate caps reuse `rateLimitClaim` + `inquiryAbuseBuckets`
  with `thread_message:{threadId}` and `initiator_thread:{principal}` keys.
- **D10.** A quote is communication, an acceptance records intent and emits a
  typed `nextStep` pointer into scope 5's checkpoint rail (or an external step);
  scope 4 never charges/books; no money-rail fields enter the schema.
- **D11.** Do not widen thread status to `awaiting_*`. Keep source status
  `unread|read|replied|closed`; add `expiresAt` and `closedReason` (including
  `expired`) for terminal clarity. A scheduled source-owned expiry job marks
  threads `closed` with `closedReason:'expired'` at the seven-day readback TTL;
  no owner/business/initiator writes are accepted after expiry. Owner inbox
  buckets stay derived: `unread` from unread incoming messages, `needs_reply`
  from last message by initiator and not closed/expired, `resolved` from a
  business-side reply or any closed/expired thread. Awaiting-business vs
  awaiting-initiator is a derived read-model phase from last message sender +
  delivery/readback state, with public copy "Waiting for business reply" /
  "Waiting for customer reply." Expired copy: initiator token path returns "This
  conversation link has expired. Start a new inquiry if you still need help";
  owner side shows "Expired — replies are closed."
- **D12.** Scope-4 demo proof must run against real networked developer/
  business-owned demo endpoint(s) in dev/staging, not a local-only AE fixture.
  Local fixtures may stay as deterministic CI smoke, but they do not satisfy
  the demo criterion. Each endpoint is explicitly enrolled, domain/URL pinned,
  scope-2 checked fresh, and labelled as a test/demo endpoint — not live
  booking, dispatch, payment, fulfilment, availability, or marketplace
  liquidity. AE verifies outbound and inbound signatures; inbound replies arrive
  as signed `business_agent` `quote` messages through
  `POST /api/inquiry/endpoint-webhook`, with the dispatch response used only as
  ack/readback, never as the reply source of truth. The e2e verifier must
  reconstruct: attributed submit, customer message, outbound dispatch+attempt,
  endpoint ack/signature hash, inbound webhook event, business_agent quote
  message, initiator `inquiry.readThread` cursor, delivery/read receipts, and
  audit/operation hashes — no raw secrets, private contact, fake availability,
  or fake-liquidity claim.

## Consequences

**Positive.** Reuses proven durable transport (outbox) instead of a new rail;
closes the initiator-readback gap the data model already anticipated; keeps the
inquiry loop wedge-agnostic; every message + delivery attempt is persisted and
reconstructable (audit/non-repudiation); the boundary (quote≠transaction) is
enforced in schema and copy, so scope 5 is a clean handoff, not a leak.

**Negative.** Extending `sender`/adding `operatedBy`/`kind`/`terms` + provider
family `business_endpoint` + (possibly) a source-write scope touches closed
enums in both TS and Convex validators (migration + validator churn). The
readback token is a new PII-bearing surface to secure. Keeping `inquiry*` names
means the eventual generic-thread rename is deferred churn.

**Risks.** (a) `business_endpoint` introduces AE→external-URL egress — a new
trust radius and SSRF surface; mitigated by dispatching only to scope-2-checked
endpoints, never arbitrary URLs — this is message *delivery*, not proxy/execute
(stays inside scope 2's "read+describe, never proxy/execute" boundary). (b) A
misbehaving/looping business endpoint could flood; mitigated by per-endpoint
caps + dead-letter. (c) If scope 3 identity slips, the attributed-agent readback
path can't ship; the token path degrades gracefully and is scope-4-native.

## Alternatives considered

- **New `thread`/`message` tables (generic from day one).** Rejected: a second
  component system for no new capability; the inquiry tables already have the
  shape; bloat detector forbids placeholder modules (.planning/ROADMAP.md:228).
  Revisit only when a non-inquiry thread kind actually exists (Q8 ticket).
- **Free-text messages, no typed kinds.** Rejected: the scope's value is typed,
  wedge-agnostic envelopes (quote/acceptance) that let a thread progress and that
  the boundary can enforce; free text can't gate quote≠transaction copy.
- **Attributed-identity-only readback.** Rejected: the primary loop is anonymous
  humans (PRODUCT.md:28-40); they'd be locked out of reading their own thread.
- **Reuse resend/novu for business dispatch.** Rejected: those are trusted email
  provider SDKs; POSTing to an arbitrary business URL is a different security
  radius that must not share the email adapter's trust assumptions.
- **Synchronous `await`-style live wait (IRC parity).** Rejected: couples caller
  latency to an external endpoint's responsiveness; async + readback/subscription
  is the durable contract, with any sync wait a thin bounded convenience.
- **AI/auto-reply on the business's behalf when its endpoint is silent.**
  Rejected outright: AE would fabricate a business's words — a direct trust-
  contract violation. Silence stays silence; timeout + delivery state instead.

## Boundary posture

Stays inside the AGENTS.md trust contract: AE **reads, compares, summarizes,
routes, and submits qualified inquiries** — scope 4 adds *delivering* messages
between the two parties and *reading them back*, which is still routing +
messaging, not booking/charging/dispatching. Exact copy rules:
- A `quote` renders as "Proposed terms — not a booking or charge"; `quotedValue`
  is display text with no pay/book control.
- An `acceptance` renders "Accepting these terms starts a separate,
  owner-approved step" (or the plainly-stated external next step); it never says
  booked/paid/confirmed.
- A `business_agent` reply is labelled "Automated reply from {business}" on human
  surfaces; assistant-submitted inquiries show "Sent via an assistant on behalf
  of a person."
- No banned public vocabulary (source-owned/readback/manifest/capability/
  gateway/operator/MCP/OpenAPI/callable/autonomous/agent-native/DTO) on human
  surfaces; those live only in JSON/owner/admin surfaces (AGENTS.md:67-72,90-92).
- "Delivered" and "read" are distinct labels. Generic owner/customer delivery
  with no read signal shows "Delivered, not yet read." Business endpoint delivery
  with no signed ack shows "Delivered to business endpoint; read status unavailable."
- No money/rail fields (autumn/stripe/wallet/credits/paymentHandler) enter the
  thread/message schema (money quarantine .planning/ROADMAP.md:201).
- **Proposed decision-door note** (does not silently violate the register): "AE
  may POST signed messages to a business-registered, scope-2-checked endpoint; it
  never POSTs to arbitrary URLs and never proxies/executes business logic —
  outbound dispatch is message delivery only, the machine analog of the owner
  notification email." Recommend recording alongside the Handshake door
  (.planning/ROADMAP.md:23) when scope 4 implementation is admitted.

## Open questions → tickets

- Decide initiator readback auth: bearer token vs magic-link vs attributed-only.
  Resolution (#22): keep D3's dual path. Attributed agents read by verified
  scope-3 principal. Anonymous humans read by a submit-time bearer readback token
  only: 32 random bytes, hash-only storage, one thread, seven-day TTL, no refresh,
  revoked/denied on privacy tombstone or owner close, and returns only the
  initiator's thread with redacted submitted contact plus thread messages. A
  mandatory magic-link is rejected because inquiry contact may be phone-only/no
  email and would break the anonymous-first loop.
- Fix business_endpoint SSRF and endpoint-trust envelope from scope 2 model.
  Resolution (#23): dispatch source is not the current scope-2 descriptor; 04-03
  must first add a private dispatch contract for `business_endpoint` capabilities:
  normalized HTTPS same-origin `dispatchUrl`, AE-held outbound signing-key ref,
  inbound business verification-key ref, and latest `ae-endpoint-check:v1` readback
  showing `checked` + fresh. Preflight guard list: exact normalized URL match to
  the registered dispatch URL, HTTPS only, no userinfo/query/fragment unless
  explicitly registered, no redirects, block IP literals and DNS results in
  loopback/private/link-local/multicast/reserved ranges (including IPv4-mapped
  IPv6), pin DNS-to-connect or use a hardened egress helper, 5s timeout,
  serialized POST body cap of 16KiB (body bytes only; headers excluded), and
  64KiB response cap. Missing/stale/contradicted/unsupported/unreachable endpoint
  trust suspends dispatch before POST and surfaces as owner/operator repair-readback
  state; outbox retry/dead-letter statuses apply only after this preflight passes
  and an actual POST attempt occurs.
- Decide source-write scope for business-agent reply admission.
  Resolution (#24): create new source-write scope `business_agent_reply`; do not
  reuse `public_inquiry` (human/assistant first contact) or `owner_inquiry`
  (owner-auth UI operations). Implementation must add the scope to
  `SourceWriteAdmissionScopeValues` so the Convex `sourceWriteAdmissionArg`
  validator accepts it. Bind operation keys as
  `business_agent_reply:${threadId}:${providerEventId}` and correlation to the
  original thread/dispatch correlation. Route verification and source-write are
  separate proofs: the webhook verifies the business signature and stores only
  hashed/redacted evidence; source-write admits the already-verified route into
  Convex and prevents direct client mutation bypass.
- Prototype initiator wait transport: poll vs SSE vs Convex subscription.
  Resolution (#25): expose the wait path as the read-only action
  `inquiry.readThread`, registered through the action registry rather than a
  one-off route. Inputs: `{threadId, cursor?, waitMs?}` plus either a verified
  scope-3 agent principal from request context or the anonymous readback token
  from #22. V1 transport is poll with optional bounded long-poll
  (`waitMs` clamped to 0-20s); no callback webhook and no SSE contract. The
  token-bearing human page also uses this action-backed polled readback, not
  Convex reactivity, so anonymous-token and external-agent semantics stay one
  contract. A timeout returns `unchanged` with `cursor`, `expiresAt`, and
  `retryAfterMs`; it creates no durable pending wait row. Expiry/denial comes
  from the token TTL, thread close/tombstone, principal mismatch, or rate cap.
- Decide business-side read-receipt honesty: ack event vs unknown.
  Resolution (#26): 2xx from `business_endpoint` dispatch is claimable only as
  "delivered to the business endpoint" / "endpoint accepted delivery"; it is not
  human read, business read, or reply intent. Admit optional signed ack events on
  the inbound webhook with kinds `received` and `read`, referencing thread,
  message/dispatch, and provider event id, with no message body and the same
  signature/dedupe/redaction rules as replies. If no ack exists, render "Delivered
  to business endpoint; read status unavailable." If `received`, render
  "Endpoint acknowledged receipt." If `read`, render "Business endpoint marked
  the message read." Owner-human read remains separate copy: "Owner opened this
  thread."
- Decide thread lifecycle/TTL state-machine widening.
  Resolution (#27): do not add `awaiting_business`/`awaiting_agent` statuses.
  Keep source status `unread|read|replied|closed`; add `expiresAt` and
  `closedReason` (`owner_closed|expired|privacy_tombstone`) so expiry is explicit
  without creating a parallel lifecycle enum. A scheduled source-owned expiry job
  closes threads at the seven-day readback TTL with `closedReason:'expired'`;
  all reply/ack/acceptance/write paths refuse expired threads. Owner inbox buckets
  remain projections: `unread` from unread incoming messages; `needs_reply` when
  the last message is from the initiator and the thread is not closed/expired;
  `resolved` after a business-side reply or any closed/expired state. Awaiting
  endpoint vs human owner is private read-model detail from last sender +
  dispatch target, rendered publicly as "Waiting for business reply" or "Waiting
  for customer reply." Expired initiator copy: "This conversation link has
  expired. Start a new inquiry if you still need help"; owner copy: "Expired —
  replies are closed."
- Prototype seeded demo business-agent endpoint(s) for the e2e loop.
  Resolution (#28): real deployed demo proof is required in dev/staging against
  networked developer/business-owned endpoint(s). A local AE fixture is allowed
  only for deterministic CI smoke and cannot close the demo criterion. Each demo
  endpoint must be explicitly enrolled, domain/URL pinned, scope-2 checked fresh,
  and clearly labelled test/demo — not live booking, dispatch, payment,
  fulfilment, availability, or marketplace liquidity. It verifies AE's outbound
  `Ae-Signature` (timestamp/bodyHash, tolerance, constant-time compare), then
  emits a signed inbound `business_agent` `quote` through the same
  `/api/inquiry/endpoint-webhook` route as production endpoints. The dispatch
  response may acknowledge receipt/readback, but is not the message source of
  truth. The deployed e2e transcript/verifier must show: attributed agent
  submit, customer message, outbound dispatch+attempt+delivery copy, endpoint
  verification/ack hash, inbound webhook event, stored business_agent quote,
  initiator `inquiry.readThread` cursor/read receipt, operation/audit hashes,
  and no raw secrets/private contact/fake availability/fake-liquidity claim.

## References

- `local://five-scopes.md:30-34,43` — scope 4 definition + sequencing
- `local://research-omp-irc.md` — IRC grammar + transfer/do-not-transfer analysis
- `local://research-ae-seams.md` — initiator-readback gap (§c splice iv),
  route-verifies signature pattern, closed source-write scope enum
- `AGENTS.md:14-28,67-72,90-92` — trust contract, epistemic vocab, banned words
- `PRODUCT.md:28-40,44-57` — first owned loop, trust states
- `.planning/ROADMAP.md:23,201,228-240` — Handshake door, money quarantine,
  bloat detector
- `src/modules/inquiries/internal/schema.ts:161-203,262-277` — thread/message/
  notification records + source state
- `src/modules/inquiries/internal/convex-schema.ts:17-105` — Convex tables
- `convex/inquiries.ts:120-144` — fire-and-forget submit receipt
- `src/modules/inquiries/inquiry.actions.ts:96-115` — `inquiry.submit`
- `convex/authz.ts:40-45` — anonymous initiator resolution
- `src/modules/notification-outbox/internal/schema.ts:16,22-119` — dispatch/
  attempt/webhook records + statuses + provider families
- `src/modules/notification-outbox/public.ts:53-59` — reusable commands
- `src/routes/api.business-actions.stripe-webhook.ts:116-140` — signature pattern
- `src/modules/security/source-write-admission.ts:3-15,25-33` — scope enum, nonce
- `src/modules/security/public.ts:118-126,155-171,310` — rate-limit helper
- `src/modules/catalog/internal/catalog-model.ts:31-37` — services-shaped
  CapabilityKind (what the envelope must NOT inherit)
