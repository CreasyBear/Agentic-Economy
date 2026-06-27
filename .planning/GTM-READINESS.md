# GTM Readiness — Phase 1

**Purpose:** prevent marketing bloat and false launch claims.

Phase 1 is not launch-ready because tests pass. It is launch-ready when owner activation, channel attribution, abuse handling, copy claims, and discovery health are source-owned and measurable.

## 90-day launch stages

| Stage | Time | Allowed channels | Gate |
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

## Phase 1 GTM gate

Phase 1 cannot be called launch-ready until:

- owner activation state exists,
- service/catalog funnel events are recorded and queryable,
- channel attribution events are recorded and queryable,
- claims register exists and copy scan covers marketing assets,
- at least internal alpha gate has passed,
- public launch stage gate is green before broad traffic,
- no banned claim appears in route copy, email/social copy, partner copy, SEO/AEO copy, API docs, or discovery files.
