# Security Spec — Phase 1

**Status:** authority for claim/publish/admin/discovery security.

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
- future token/payment/custody evidence.

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
```

## P0 gates

1. Publish requires Clerk actor mapped to Convex owner binding. Request bodies never supply owner/admin IDs.
2. Session-cookie mutations require CSRF or same-site Origin enforcement.
3. Claim abuse controls exist before public exposure: actor/IP/device rate limit, slug collision policy, duplicate/impersonation fingerprint, typed rejection, audit event.
4. Suppression uses one fail-closed eligibility predicate consumed by page, registry, sitemap, `llms.txt`, UCP, and search sync.
5. Admin authority is source-owned: role, state, bootstrap, grant, revoke, break-glass, evidence refs, audit. No env-only admin authority.
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
