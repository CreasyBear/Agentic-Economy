---
# ADR-002: Governed action, mandate, preparation, and route bounded contexts
Status: Accepted
Date: 2026-07-14
Scope: Wave 2 entry gate; KERNEL-CEILING C-1/C-2 and DECISION-REGISTER §4 ADR-2

## Context

The repository contains several authority-bearing aggregates created for different jobs. Without an explicit boundary, their similarly named digests and approvals can be mistaken for interchangeable authorization.

The neutral governed-action module defines the common committed subject. `GenericGovernedActionIntent` in `src/modules/governed-action/public.ts` contains only `commitmentKind`, `schemaVersion`, `actionClass`, and an opaque restricted-I-JSON `payload`. `encodeGovernedAction` produces the exact canonical bytes and SHA-256 digest; `verifyGovernedActionBytes` verifies those bytes without knowing the local domain. ADR-007 makes those bytes immutable evidence.

The existing authorities are narrower and have different owners:

- `ApprovalGrantV2` in `src/modules/customer-request/approval-grant-v2.ts` binds a principal, prepared-action revision, capability/supply facts, spend ceiling, disclosure/effect scope, evidence scope, recovery posture, issue time, and expiry. It authorizes an attempt within those limits; it is not the action payload.
- `ActionPreparationAuthorityScope`, `ActionPreparationDisclosureReview`, `ActionPreparationApprovalEvidence`, and `ActionPreparationAuthorityReservation` in `src/modules/customer-request/action-preparation.ts` govern which prepared fields may be disclosed, for what purpose and recipients, under bounded exposure counts. `AuthorizedActionPreparation.kind === 'ready_for_routing'` means preparation has the required reservation; it does not select or allocate a route.
- `VerifiedPreparationAuthority`, `PreparationDisclosureCommand`, and `PreparationDisclosureAllocation` in `src/modules/customer-request/preparation-authority.ts` enforce recipient/purpose/field allocation, operation-key replay checks, and bounded authority-use accounting. Allocation begins as `allocated` and is resolved separately to `released`, `not_released`, or `uncertain`. The current store does not reject every cross-operation reuse of `authorityUseKey`; this ADR does not treat that key as the governed send's one-use authorization.
- `RouteAuthorization` in `src/modules/routing-kernel/internal/model.ts` is issued by `authorize` in `src/modules/routing-kernel/internal/kernel.ts` after quote and epoch checks. The store in `src/modules/routing-kernel/internal/store.ts` derives budget and data-authorization records from it. It allocates routing resources; it is not customer consent or disclosure review.
- `R1TargetAdmission` and `evaluateR1TargetAdmission` in `src/modules/inquiries/internal/admission.ts` prove that the selected R1 destination is currently admitted. They do not authorize the customer's message.

The first R1 consumer now lives in `src/modules/inquiries/internal/governed-send.ts`. `buildGovernedSendIntent` maps inquiry vocabulary to an opaque `GenericGovernedActionIntent`; the neutral module imports no inquiry, business, or service types. `GOVERNED_SEND_CANONICAL_FIELDS` is the adapter's single ordered field declaration for review and payload construction.

## Decision

### 1. One committed subject

`GovernedActionIntent` is the only cross-context contract identifying what consequential action is being reviewed, authorized, dispatched, and evidenced. Every authority or allocation that permits progress MUST bind the digest produced from the exact canonical bytes of that intent. No local aggregate may substitute its own object hash as the governed-action digest.

The intent is deliberately not an authority. Possessing an intent or digest grants no right to execute it. The intent answers **what**; the surrounding bounded contexts answer **who may authorize**, **what may be disclosed**, **whether the target is admitted**, and **which resources may be allocated**.

### 2. Mandate context: principal authorization

A mandate or approval grant answers whether a named principal authorized this governed action within declared scope, limits, and time. In the current source, `ApprovalGrantV2` is the closest implemented aggregate: it binds actor identity, prepared-action lineage, spend/data/effect/evidence scopes, recovery, and expiry.

For R1 governed send, the one-use operation authorization MUST bind at least the governed-action digest, principal/subject posture, one recipient, purpose, expiry, and one-use operation key. Reuse of the same operation key with the same digest returns the original result. Reuse with a different digest returns `inquiry_digest_mismatch`. An authorization record never expands preparation or route scope.

### 3. Preparation context: disclosure narrowing

Preparation converts source facts into a candidate action and narrows what may leave AE. It owns field declarations, disclosure classifications, recipient/purpose constraints, review evidence, exposure limits, and release state. It may remove fields or refuse release; it MUST NOT add authority absent from the mandate or change the governed intent after review.

`ActionPreparationDisclosureReview` and `PreparationDisclosureAllocation` remain preparation records. Their digests protect their own formats. At the dispatch boundary they reference the governed-action digest rather than being reinterpreted as that digest.

### 4. Admission context: counterparty eligibility

Admission answers whether the exact target is eligible at commit time. `evaluateR1TargetAdmission` reads authoritative inquiry state and returns versioned `R1TargetAdmission`. A successful send stores the admitted proof snapshot in `GovernedSendReceiptRecord`. Admission may refuse a previously reviewed action after state drift. It cannot authorize an unreviewed payload or repair a changed authorization.

### 5. Route context: resource allocation

Route authorization begins only after intent, mandate, preparation, and target admission are valid. `RouteAuthorization` owns quote selection, epoch checks, budgets, and data-allocation references. It may allocate or refuse resources within upstream bounds. It MUST NOT widen the recipient set, payload, disclosure scope, principal authority, or expiry.

A route record references the governed-action digest and upstream authority references. It does not become the receipt authority and does not prove dispatch or external outcome.

### 6. Adapter ownership and dependency direction

Local adapters own local vocabulary. `src/modules/inquiries/internal/governed-send.ts` owns the R1 field declaration and mapping. `src/modules/governed-action/public.ts` remains vertical-neutral and treats `payload` as opaque. Dependency direction is local adapter → governed-action public API; the governed-action module MUST NOT import inquiries, business, catalog, customer-request, preparation, or routing modules.

The canonical field declaration is versioned with `GOVERNED_SEND_SCHEMA_VERSION`. Changing its key set or semantics requires a new payload schema version and a fresh review/digest. Presentation labels may change only if they do not alter which exact value is verified; keys and payload meaning do not silently change.

### 7. No aggregate impersonation

The following substitutions are prohibited:

- preparation approval or allocation as the customer mandate;
- target admission as authorization to send;
- route authorization as authorization to disclose;
- a local `stableHash`/`canonicalDigest` as the ADR-007 governed-action digest;
- a parsed or projected record as the committed intent bytes;
- delivery evidence as external acceptance or outcome evidence.

## Commit ordering

A consequential commit MUST, in one source-owned transaction where persistence is involved:

1. reconstruct the intent from the adapter's declared field contract;
2. encode it with `encodeGovernedAction` and compare it with the reviewed digest;
3. reconcile the one-use operation key (same key/same digest replays; same key/different digest refuses);
4. verify the mandate/approval is current and digest-bound;
5. re-evaluate `R1TargetAdmission` for the exact target;
6. verify preparation disclosure is a subset of the reviewed payload and authorized scope;
7. allocate/claim the route without widening upstream bounds;
8. append dispatch and exact-byte receipt evidence;
9. derive customer/operator projections from the appended facts.

Failure before dispatch appends no sent fact. An unknown dispatch result is recorded as unknown and reconciled; it is never promoted to success.

## Consequences

- One digest names the reviewed consequential action across contexts, while each context retains its own state machine and evidence format.
- C-1 holds because local vocabulary is confined to adapters and the neutral governed-action payload remains opaque.
- Review, mandate, admission, preparation, routing, dispatch, and outcome are independently inspectable; none overclaims another.
- Existing preparation and routing digests remain valid for their documented internal formats, but integrations must link them to the governed-action digest before they authorize a Wave-2 action.
- A schema or recipient change invalidates review and requires a new governed intent and authorization; it cannot be patched into a prior receipt.

## Rejected alternatives

### Three authority aggregates treated as equivalent

Rejected because preparation, principal authorization, and route allocation have different actors, invariants, expiry, and failure modes. Equivalence would allow a narrower record to confer authority it never captured.

### Put local-service fields in the governed-action module

Rejected because it violates C-1 and couples the wire contract to the first consumer. The generic payload seam already supports adapter-owned schemas.

### Let route authorization be the root authority

Rejected because route selection occurs after customer review and disclosure decisions and cannot reconstruct principal intent. It would invert the authority chain.

### Hash each aggregate independently without a shared digest

Rejected because review, commit, and receipt could bind different material while every local hash remained internally consistent.

## Verification anchors

- Neutral wire types and encoder: `src/modules/governed-action/public.ts` — `GenericGovernedActionIntent`, `encodeGovernedAction`, `verifyGovernedActionBytes`.
- R1 adapter: `src/modules/inquiries/internal/governed-send.ts` — `GOVERNED_SEND_CANONICAL_FIELDS`, `buildGovernedSendIntent`, `GovernedSendReceiptRecord`.
- Commit-time admission: `src/modules/inquiries/internal/admission.ts` — `R1TargetAdmissionVersion`, `evaluateR1TargetAdmission`.
- Preparation authority: `src/modules/customer-request/action-preparation.ts` and `preparation-authority.ts`.
- Principal grant: `src/modules/customer-request/approval-grant-v2.ts` — `ApprovalGrantV2`.
- Route allocation: `src/modules/routing-kernel/internal/model.ts`, `kernel.ts`, and `store.ts` — `RouteAuthorization` and derived budgets.
