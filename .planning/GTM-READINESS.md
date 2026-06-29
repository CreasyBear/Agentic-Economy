# GTM Readiness — Phases 1-5

**Purpose:** prevent marketing bloat and false launch claims.

Phase 1 is not launch-ready because tests pass. It is launch-ready when owner activation, channel attribution, abuse handling, copy claims, and discovery health are source-owned and measurable. Phases 2-5 extend the same rule: no inquiry, developer, action, or paid claim ships before source-owned evidence and support capacity exist.

## 90-day launch stages

| Stage | Time | Allowed channels | Readiness proof |
|---|---:|---|---|
| Internal founder-assisted alpha | Days 0-14 | founder outreach only | 5 friendly owners; instrumentation live; no unresolved P0 claim/publish/index/security failures |
| Closed owner beta | Days 15-30 | invite-only owner list, one borrowed advisor channel | 20 invites; >=10 published T0 pages; no-ABN publish measured; no unresolved impersonation/suppression incident |
| Public alpha | Days 31-60 | one owned channel + one borrowed channel | 50 published pages; >=95% channel attribution coverage; index/discovery health visible; copy register clean |
| Controlled public launch | Days 61-90 | owned site/email + one rented channel + selected borrowed channels | self-serve baseline known; index stale >24h is zero for eligible pages; manifest errors <1%; no P0 abuse/privacy/copy overclaim |

No paid ads, Product Hunt-style broad launch, developer launch, or protocol launch until activation baseline exists.

## ORB channel matrix

Owned:

- homepage,
- `/claim`,
- `/registry`,
- consented owner email/waitlist,
- changelog/blog.

Rented:

- founder LinkedIn/X,
- narrow HN/Reddit only after activation baseline exists.

Borrowed:

- local SMB advisors,
- web/SEO agencies,
- accountants/bookkeepers,
- chambers/community operators,
- vertical software consultants.

Every channel must define:

```text
destination URL
UTM/source scheme
allowed claims
owner
launch stage
kill rule
```

## Owner activation definition

An owner is activated only when all are true:

1. publish succeeded with at least one service row,
2. owner viewed status page/readback,
3. owner saw `publicStatus`, `indexStatus`, `discoveryStatus`, `trustTier`, `callable=false`, `paymentRequired=false`, and per-service capability health,
4. owner copied/shared public URL, service URL/anchor, or submitted consented interest for next capability,
5. channel attribution is recorded.

A published page alone is not activation.

## Funnel events

Required privacy-safe events:

```text
visitor_attributed
claim_cta_clicked
claim_started
auth_started
auth_completed
owner_interest_submitted
claim_submitted
slug_conflict
duplicate_suspected
publish_succeeded
service_added
capability_status_viewed
publish_failed
owner_status_viewed
share_url_copied
registry_search
service_registry_result_clicked
ucp_manifest_fetched
dispute_opened
suppression_applied
```

Each event includes:

```text
source/referrer/UTM/campaign
pseudonymous session
actor/business/claim IDs after auth
redacted payload
consent flag where follow-up is allowed
timestamp
correlation ID
```

Admin queries must show conversion by channel and stage, service/catalog completion, index/discovery failures, duplicate/suppression/dispute incidents, service catalog page shares, registry searches, service result clicks, and manifest/API fetches.

Durable event contract:

```text
funnelEvents
  eventType, source/referrer/UTM/campaign, pseudonymousSessionId,
  actorId?, businessId?, claimId?, redactedPayload, consentFlag,
  correlationId, createdAt

ownerActivationState
  businessId, stage, publishSeen, statusSeen, capabilityHealthSeen,
  sharedOrInterestSubmitted, attributionRecorded, lastEventAt
```

These may be stored as dedicated tables or as typed `auditEvents` variants only if the same query keys and privacy rules are explicit before PR02 lands.

## Claims register

All public assets must cite allowed claims. This includes landing pages, emails, social posts, partner pitches, SEO/AEO pages, launch listings, and developer-facing announcements.

P2-P5 public capability claims also require a source-owned evidence row before publication. Each row must name `claimId`, `phase`, `exactPublicCopy`, `publicAsset`, `requiredRoute`, `requiredReadback`, `requiredFunnelEvent`, `evidenceStatus`, `supportOwner`, and `validLaunchStage`. Draft, future, or planning-only claims may stay in phase docs, but public route copy, launch pages, SEO/AEO files, `llms.txt`, UCP, API docs, email/social/partner copy, and generated discovery assets cannot use an allowed phrase until the evidence row is live.

Allowed:

- claim and publish an AE-hosted public business service catalog,
- appear in AE registry/search when indexed,
- expose an honest AE-hosted discovery manifest,
- expose read-only public catalog JSON from the same source state,
- show claimed/indexed/discoverable/unavailable/service-capability status,
- show ABR/registry verification only when source evidence exists.

Banned:

- bookings/orders/payments,
- wallet/credits,
- autonomous agents,
- chat/owner inbox,
- guaranteed owner response,
- ABR verified by default,
- agent can call tools/actions,
- marketplace/liquidity/partners/provider integrations,
- MCP/API/SDK/standard merchant-origin UCP unless implemented,
- voice/skills/hosted agents,
- agent-native endpoint wording that implies Phase 3+ capability.

## Channel kill rules

Stop a channel if:

- attribution coverage <95%,
- claim-start to publish is unknown,
- abuse/suppression incidents are unresolved,
- channel copy violates claims register,
- support load exceeds owner/admin handling capacity,
- index/discovery stale gap >24h for eligible pages.
- public API search/detail routes are documented but dead or schema-incompatible.

## Phase 1 GTM proof

Phase 1 cannot be called launch-ready until:

- owner activation state exists,
- service/catalog funnel events are recorded and queryable,
- channel attribution events are recorded and queryable,
- claims register exists and copy scan covers marketing assets,
- at least internal alpha proof has passed,
- public launch stage proof is green before broad traffic,
- no banned claim appears in route copy, email/social copy, partner copy, SEO/AEO copy, API docs, or discovery files.

## P2-P5 GTM expansion

The 90-day launch stages above still apply. New capabilities expand allowed claims only after their owning phase has live behavior, source-owned readback, support coverage, and copy scans.

### Capability claim ladder

| Capability | Earliest phase | Allowed claim after evidence | Banned until separately implemented |
|---|---:|---|---|
| Human inquiry | P2 | Customers can submit a conservative inquiry for eligible services; owners can read/reply/close in AE; email delivery/readback is visible. | AI replies, booking, quote acceptance, guaranteed response, multi-channel support, marketplace inbox. |
| Builder/agent discovery | P3 | Builders/agents can read current public catalog docs/schema/examples/status generated from AE source state; optional read-only API keys only if the support matrix, source readback, and claim evidence register prove they shipped. | SDK, CLI, mutation API, API-key platform before proof, hosted MCP, Agent Router, callable tools/actions, payment/action descriptors. |
| Owner-approved action | P4 | One named non-money action can be proposed, owner-approved/rejected, attempted once, and reconstructed. | Autonomous execution, broad action catalog, provider marketplace, booking/payment movement, no-approval actions. |
| Paid activation | P5 | One selected paid activation rail can be started by an authorized owner and reconciled through Autumn/Stripe receipts/readbacks. | Wallet, credits/balance, custody, x402/crypto, Connect marketplace, split payouts, request-market settlement, direct Stripe subscription authority. |

### Additional funnel events

Required before claiming the corresponding capability:

```text
inquiry_available_seen
inquiry_started
inquiry_submitted
inquiry_rejected
owner_inbox_viewed
owner_inquiry_read
owner_inquiry_replied
inquiry_closed
notification_queued
notification_delivered
notification_failed
developer_docs_viewed
schema_downloaded
example_fixture_downloaded
discovery_health_viewed
protected_action_proposed
protected_action_policy_denied
protected_action_approved
protected_action_rejected
protected_action_attempted
protected_action_receipt_viewed
paid_activation_started
checkout_returned
checkout_cancelled
billing_provider_event_ingested
receipt_viewed
refund_or_dispute_recorded
billing_reconciliation_failed
billing_reconciliation_repaired
```

Each event keeps the Phase 1 privacy-safe envelope and adds capability, phase, public/private projection, provider family where relevant, and redacted failure code.

`api_key_created` and `api_key_revoked` are conditional P3 launch evidence only if the P3 API-key gate accepts source-owned evidence and the P3 plan ships an API-key surface; they are not required base Phase 3 funnel events.

### Support capacity requirements

Before broad traffic for a capability, there must be named owner/admin/operator handling for:

- P2: spam, wrong recipient, owner cannot find/reply, email bounce/complaint, provider outage, suppression, privacy request.
- P3: stale docs/schema, route parity failure, accidental private data exposure, bot abuse/rate limits, key revoke/rotate if keys ship.
- P4: owner claims action was unauthorized, provider attempt failed, proof gap, reversal/dispute posture, no-repair state.
- P5: checkout failure, cancelled return, duplicate webhook, unbound provider event, receipt mismatch, refund/dispute/cancellation, reconciliation no-repair.

Support load exceeding owner/admin handling capacity stops the channel or capability claim until capacity exists.

### Paid launch and pricing posture

P5 marketing may mention paid activation only after the money decision record and provider smoke evidence are complete.

Required before paid public copy:

```text
offer/pricing object approved
what remains free documented
Autumn/Stripe responsibility split recorded
AUD/GST/tax/legal/refund/terms posture recorded
billing support owner named
checkout start/return/cancel smoke passed
webhook receipt/reconciliation smoke passed
rollback/disable posture documented
copy scan rejects wallet/credits/custody/x402/Connect/settlement/direct-Stripe claims
```

### Launch limits

- Product Hunt, broad developer launch, paid ads, and partner campaigns remain off until Phase 1 activation and the claimed phase's own readbacks are green.
- Developer-channel launches wait for P3. Founder/manual customer outreach may mention P2 only as a human inquiry flow once P2 evidence exists.
- Paid-channel copy waits for P5 provider evidence and support posture. Do not pre-sell wallet/marketplace/agent automation.
- Claims about AI assistants should say they can read public catalog/discovery artifacts only when those artifacts exist. Do not imply AE runs autonomous agents or AI workflows.

### P2-P5 claim acceptance

No capability can be called launch-ready until:

- route behavior exists in production-like deployment,
- source-owned readback reconstructs the customer/owner/admin/operator story,
- funnel events are queryable,
- copy scan covers route copy, SEO/AEO files, llms/UCP/discovery files, generated docs/schema/API assets, email/social/partner copy, API docs, launch assets, and the claim evidence register,
- security/privacy acceptance for the capability has passed,
- support owner and kill rule are explicit,
- no banned claim for that capability appears anywhere public.

### Phase 4 selected claim row

| Field | Value |
|---|---|
| claimId | `p4_contact_follow_up_owner_approved` |
| phase | P4 |
| exactPublicCopy | Owner-approved customer contact follow-up can be proposed, approved or rejected, attempted once through the source-owned follow-up outbox, and reconstructed with a receipt or proof gap. |
| publicAsset | Owner/admin route copy and developer/discovery copy only when source readback permits. |
| requiredRoute | `/owner/actions`, `/owner/actions/:proposalId`, `/owner/actions/:proposalId/receipt`, `/admin/protected-actions`, `/admin/protected-actions/:proposalId` |
| requiredReadback | Proposal, policy, owner decision, gateway admission, attempt, receipt/proof gap, retention redaction, support load, and no-repair reconstruction for `contact-follow-up`. |
| requiredFunnelEvent | `protected_action_proposed`, `protected_action_approved`, `protected_action_rejected`, `protected_action_attempted`, `protected_action_receipt_viewed`, `protected_action_retry_exhausted`, `protected_action_no_repair_marked` |
| evidenceStatus | Source/local only in 04-01. No deployed Phase 4 proof claimed. |
| supportOwner | founder-owner with founder-operator backup in `defaultContactFollowUpSupportRecord`. |
| validLaunchStage | internal founder-assisted alpha only until deployed smoke and support capacity are proven. |

P4 banned claim list for this selected action: autonomous protected execution, direct execute, broad action catalog, provider marketplace, booking guarantee, physical-world proof guarantee, payment movement, wallet, credits, balance, checkout, settlement, Stripe, Connect, x402, request market, hosted agents, MCP/OpenAPI/SDK mutation authority.
