# Phase 1 Premortem — Failure Register

**Mode:** assume the fresh repo fails 90 days after launch. Name why before code exists.

## Verdict

Most likely failure: bloat relapse plus silent projection failure.

The system can look cleaner than the backup while still failing if claim/publish/discovery are not source-owned, repairable, and launch-honest.

## Failure register

| Priority | Failure | Trigger | Detection | User impact | Prevention | Test/gate | Owner |
|---|---|---|---|---|---|---|---|
| P0 | Bad/impersonated claim becomes public | Competitor claims known business | claim/dispute queue, duplicate fingerprint, public projection diff | Wrong owner controls public front door | rate limit, duplicate detection, contention state, emergency suppression | publish -> suppress -> page/search/sitemap/llms/UCP disappear; one audit event | security/business |
| P0 | Runtime incident but no kill-switch | index/discovery/copy/security bug after launch | admin health shows breach but no control exists | deploy/manual DB edit needed | source-owned `operatorControls` | toggle claims/publish/registry/discovery/copy-safe-mode and assert safe degradation | observability/security |
| P0 | Unauthorized publish/admin | caller supplies owner/admin, CSRF, route-only auth | auth tests, audit anomaly | attacker claims/suppresses business | Convex-derived actor/admin, CSRF, source-owned admin role | anonymous/wrong-owner/foreign-origin/revoked-admin tests | security |
| P0 | Suppressed business leaks | page/search/sitemap/llms/UCP check different predicates | projection diff after suppression | bad listing remains visible | single `isPubliclyDiscoverable`/eligibility predicate | suppression hides all public outputs | business/registry/discovery |
| P0 | Manifest overclaims | placeholder payment/callable/MCP/OpenAPI copied | manifest/copy scan | agents infer unsupported actions/payments | AI-SPEC support matrix, generated manifests only | no unsupported fields; dead-link test | discovery |
| P0 | Private data leaks | public DTO spreads DB rows | projection privacy tests | PII/token leak | allowlist projection builders | seed private text and assert absent everywhere | security/observability |
| P0 | Public copy lies | GTM/SEO/social imports backup claims | claims register scan | trust loss, support burden | source-owned claims register | copy scan across routes and marketing assets | product/GTM |
| P1 | Publish succeeds but not indexed | adapter failure after publish | projection attempt failed/stale | owner has invisible page | projection outbox + retry/rebuild | forced failure -> failed readback -> retry success | registry |
| P1 | UCP/llms/sitemap stale | edit/suppress/version bump not invalidating cache | sourceHash/version mismatch, stale age | agents consume old facts | freshness/invalidation policy | suppress cached business; all discovery outputs update/degrade | discovery/registry |
| P1 | Owner account contention | lost Clerk account, duplicate claimant, sale | multiple claim cases | true owner locked out | `contested`/ownership case + admin transfer | two actors claim; admin transfers; audit reconstructs | business/security |
| P1 | Source-mine relapse | backup folder copied with tentacles | banned import/source scan | fresh repo inherits coupling | PR00 source-mining ledger | copied banned import fails scan | architecture |
| P1 | Admin readbacks no action | status dashboard without repair/runbook | failed/stale rows linger | failures normalize | every readback has threshold, owner, next action | seeded gaps grouped with actions | observability |
| P1 | Retry/idempotency under-specified | double click/retry on mutation/projection | duplicate audit/projection rows | confusing state, future money unsafe | operation keys per retryable operation | same key returns same result and one transition | business/registry/discovery |
| P1 | Lifecycle moat lost | only generic directory descriptor ships | review finds no primitives/tests | product becomes directory | descriptor-only lifecycle primitives | held_money/external_authority/time_bound/proof_gap tests | lifecycle |
| P1 | SEO/AEO discoverability broken | sitemap/robots/schema/noindex wrong | route/schema/fetch baseline | pages not indexed/cited | SEO-AEO-SPEC | published page canonical/indexable; private excluded | SEO |
| P1 | GTM outruns product | broad launch before owner activation known | funnel/claims gate missing | vanity traffic, abuse, bad promises | GTM-READINESS gates | internal alpha before public launch | GTM/product |
| P2 | ABN-first copy regression | form/copy says verify to publish | copy/form scan | owners abandon | no-ABN e2e + copy gate | no-ABN claim reaches public business service catalog page | product/UI |
| P2 | TypeScript debt returns | `any`, broad strings, `v.any`, casts | ts-standards scan | invalid states pass compile | type tests/source scan | seeded bad fixtures fail | engineering |
| P2 | Agent prompt injection | owner text emitted as instructions | injection fixture | downstream agents obey malicious text | data-only manifest/llms handling | injection remains inert | AI/security |

## No-launch gates

Do not launch if any are true:

- source-mining ledger missing,
- no-ABN claim/publish fails,
- claim/publish lacks auth, CSRF, rate limit, duplicate detection,
- admin authority is env-only or route-only,
- suppression does not hide all public outputs,
- publish/index/discovery failure is invisible or unrepairable,
- UCP/llms/sitemap contains unsupported callable/payment/verified/standard-origin claims,
- public/marketing copy violates claims register,
- private data appears in public projection,
- runtime kill-switches absent,
- deployment/readback smoke absent,
- required gates not green.

## Runtime kill-switches

Required source-owned controls:

```text
claims_enabled
publish_enabled
registry_enabled
discovery_enabled
public_copy_safe_mode
```

Each switch stores:

```text
key
value
actor
reason
expiresAt?
createdAt
correlationId
auditEventId
```

Each switch is visible in admin health and covered by a behavior test.

## Repair loops

Every readback must have a repair action or explicit no-repair decision.

Required repair actions:

- retry registry projection,
- rebuild registry projection from Convex source,
- regenerate discovery manifest,
- suppress business,
- unsuppress after review,
- transfer ownership after contention,
- turn on public-copy safe mode,
- pause claims/publish.

## Bloat relapse drill

Every PR answers:

```text
1. Which spine link does this strengthen?
2. Which backup source file was mined, and what was rejected?
3. What source-owned user-visible claim was added or protected?
4. What failure is now detectable and repairable?
5. What did /ponytail delete, inline, or defer?
```

Weak answers block the PR.

## Launch rehearsal

Before public launch, run this cold-path rehearsal:

```text
owner -> no-ABN claim -> publish -> page visible -> registry visible -> manifest fetch -> index health visible -> suppress -> page/search/sitemap/llms/UCP hidden -> audit reconstructs all steps -> retry/rebuild projection -> recovery visible
```

This rehearsal is the Phase 1 product.
