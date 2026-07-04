# 03-04 Evidence Binding Map — P4/P6 receipt chains

**Status:** resolved for source/local Scope 03-04 Task 1.  
**Issue:** [#18](https://github.com/CreasyBear/Agentic-Economy/issues/18) — map kernel evidence into P4/P6 receipt hash chains.  
**Proof boundary:** source/local only. This does **not** claim deployed P4/P6 clearance rows, live signer proof, booking, payment, dispatch, autonomous fulfilment, production readiness, or third-party credential custody.

## Decision

AE receipt reconstruction remains the tamper oracle. Clearance/kernel outputs are **bound evidence**, not authority.

The binding uses one shared internal evidence-ref helper in `src/modules/clearance/internal/evidence-binding.ts` and one neutral domain field in P4/P6 receipt payloads:

```ts
boundEvidenceRefHashes: readonly SourceHash[]
```

Public readbacks may describe the count/status as `checked evidence`; public human surfaces and agent JSON/tool payloads must not expose internal protocol vocabulary or raw evidence records.

Do **not** overload P6 `ExternalEvidenceEvent.checkpointId` or `externalEvidenceRefHashes[]` with clearance/kernel records. Those fields stay reserved for provider/outside evidence (`hermes`, `stripe_test_mode`, `link_cli_test_mode`, `endpoint_host`) that is bound to an accepted P6 checkpoint. Clearance/kernel records are AE-owned admission evidence and enter `boundEvidenceRefHashes[]` instead.

Why: using `externalEvidenceRefHashes[]` for internal clearance records would make AE admission evidence look like provider evidence and would blur `unbound_provider_event` semantics. `unbound_provider_event` should continue to mean a provider event is attached to the wrong request/checkpoint.

## Current source evidence

- 03-03 stores greenlights/receipts/proof gaps in `handshakeRecords`; no separate `handshakeGreenlights` table exists (`03-03-D4-STORE-SHAPE-AMENDMENT.md`).
- `ClearanceProtocolRecord` fields are `recordId`, `recordKind`, `principalId`, `actionClass`, `actionRef`, optional `mandateId`/`requestRef`/`greenlightRef`, `idempotencyKey`, `payloadHash`, `signaturePosture`, `keyIdentityRef`, `status`, timestamps, optional `signature`, `proofGapReason`, `consumedAt`, and `consumedByRef` (`src/modules/clearance/internal/convex-protocol-store.ts`).
- Signed greenlight payloads bind version, record kind, principal, action class/ref, mandate, request, idempotency key, issue/expiry, and payload hash (`src/modules/clearance/internal/signed-payload.ts`).
- Signed receipt payloads bind version, record kind, principal, action class/ref, mandate, request, greenlight ref, receipt ref, idempotency key, outcome, issue time, payload hash, and optional previous receipt hash (`src/modules/clearance/internal/signed-payload.ts`).
- P4 currently hashes proposal, policy, owner decision, gateway admission, attempt readback, and receipt payload (`src/modules/protected-action/internal/contact-follow-up.ts`).
- P6 currently hashes request, checkpoint, provider external evidence, guardrail evidence, result artifact, signature ref, and receipt payload (`src/modules/business-action/internal/business-action.ts`).

## Bidirectional term map

| AE term | Current AE source | Kernel/clearance term | Binding rule |
|---|---|---|---|
| P4 selected action contract | `ContactFollowUpProposal.canonicalContractHash` | `ActionContract` / action ref | Included in P4 greenlight payload hash and P4 admission hash. |
| P4 proposal | `ContactFollowUpProposal.proposalHash` | request/input commitment | Included in P4 admission hash and greenlight payload hash. |
| P4 policy | `ContactFollowUpPolicyDecision.policyHash` | `PolicyDecision` | Included in P4 admission hash before any greenlight can bind. |
| P4 owner decision | `ContactFollowUpOwnerDecisionRecord.decisionHash` | human checkpoint / authorization decision | Included in P4 admission hash and used as the P4 `mandateId` surrogate until the reusable mandate is fully threaded. |
| P4 gateway admission | `ContactFollowUpGatewayAdmission.admissionHash` | `Greenlight` request payload | One consumed `handshakeRecords(recordKind='greenlight')` row binds to it. |
| P4 provider attempt | `ContactFollowUpAttempt.attemptHash` | `VerifiedGatewayCheck` + execution attempt | Attempt hash must include the consumed greenlight evidence ref and the readback hash. Optional gateway-check evidence is included when present. |
| P4 receipt/proof gap | `ContactFollowUpReceipt.payloadHash`, `ContactFollowUpPrivateEvidenceRef.payloadHash` | `Receipt` / `ProofGap` | Receipt payload must include `boundEvidenceRefHashes[]`. The post-receipt clearance receipt record binds back to the AE receipt payload hash; it is not an input to the same payload hash. |
| P6 action card | `BusinessActionCard.sourceHash` | `ActionContract` / capability definition | Already included through request hash and receipt payload; no separate external evidence event. |
| P6 mandate | `BuyerMandate.mandateHash` and 03-03 `ClearanceMandate.sourceHash` | mandate / authorization scope | Existing P6 `mandateHash` remains in request/receipt. The clearance greenlight record also carries `mandateId`. |
| P6 capability request | `CapabilityRequest.requestHash` | request/input commitment | Included in checkpoint greenlight payload and receipt payload. |
| P6 owner checkpoint | `AuthorizationCheckpoint.checkpointHash` | `PolicyDecision` + `Greenlight` request payload | One consumed `handshakeRecords(recordKind='greenlight')` row binds to accepted checkpoints. Refused/proof-gap checkpoints bind as receipt outcomes, not as write authority. |
| P6 provider evidence | `ExternalEvidenceEvent.payloadHash` with `checkpointId` | external provider evidence, not kernel evidence | Stays in `externalEvidenceRefHashes[]` only when `requestId`, `checkpointId`, and `status='accepted'` match. |
| P6 guardrail evidence | `GuardrailDecisionEvidence.decisionHash` | safety evidence | Stays in `guardrailEvidenceRefHashes[]`; not a substitute for greenlight/receipt evidence. |
| P6 result artifact | `BusinessActionResultArtifact.artifactHash` | result/proof material | Stays in the receipt payload as `resultArtifactHash`. |
| P6 action receipt | `ActionReceipt.payloadHash` and `signatureRefHash` | `Receipt` | Receipt payload includes consumed greenlight refs. The post-receipt clearance receipt record signs the AE receipt payload hash and is checked by reconstruction/readback, avoiding a circular hash. |
| Refusal | P4 policy/owner/gateway errors; P6 checkpoint refusal/mandate refusal | `Refusal` / rejected record | Bound as a terminal status/reason hash when a record exists; never authorizes an action. |
| Proof gap | P4 proof-gap readback/private ref; P6 proof-gap result/artifact/record | `ProofGap` | Bound as a proof-gap record/ref and maps to `proof_gap`, not success. |

## Bound evidence ref format

Each bound ref hash is `stableHash(...)` over a **redacted canonical view**. Raw signatures, raw WBA headers, raw JWKS keys, server secrets, full private payloads, and raw provider payloads are never inputs directly; only hashes/refs/statuses enter.

### Shared canonical fields

All bound refs include:

```ts
{
  version: 'ae-bound-evidence:v1',
  source: 'clearance_record' | 'gateway_check' | 'isolation_state',
  actionClass: 'contact_follow_up' | 'business_action',
  actionRef: string,
  principalId: string,
  requestRef: string | null,
  mandateId: string | null,
  idempotencyKey: string,
  payloadHash: SourceHash,
  status: string,
  createdAt: number,
}
```

### Greenlight ref

Required for every new P4 attempt and every new accepted P6 receipt:

```ts
{
  ...shared,
  source: 'clearance_record',
  recordKind: 'greenlight',
  recordId,
  greenlightRef: recordId,
  signaturePosture,
  keyIdentityRef,
  expiresAt: expiresAt ?? null,
  consumedAt: consumedAt ?? null,
  consumedByRef: consumedByRef ?? null,
  signedAt: signedAt ?? null,
  signatureHash: signature === undefined ? null : stableHash({ recordId, signature }),
  proofGapReason: proofGapReason ?? null,
}
```

Acceptance rule:

- New successful P4/P6 paths require `recordKind='greenlight'`, matching `principalId`, matching `actionClass`, matching `actionRef`, matching `requestRef`, `status='consumed'`, non-expired, and the expected `consumedByRef`.
- `status='accepted'` but not consumed is insufficient because one-use replay safety has not been proven.
- `status='proof_gap' | 'rejected' | 'expired'` binds a failure/proof-gap outcome, never success.

### Gateway-check ref

Optional until the runtime gate starts committing it, but deterministic when present:

```ts
{
  ...shared,
  source: 'gateway_check',
  checkId,
  status: 'accepted' | 'rejected' | 'proof_gap',
  sourceHash,
  checkedAt,
}
```

Acceptance rule:

- `accepted` may accompany success.
- `rejected` maps to refused/rejected outcome.
- `proof_gap` maps to proof-gap outcome.
- Absence is allowed for current source/local rows because 03-03 has the table/store but P4/P6 wrappers do not yet require a committed gateway-check row.

### Receipt record ref

The clearance receipt record is a **dependent attestation** over the AE receipt, not an input to the same AE receipt payload hash.

```ts
{
  ...shared,
  source: 'clearance_record',
  recordKind: 'receipt',
  recordId,
  receiptRef,
  greenlightRef,
  outcome,
  signedAt: signedAt ?? null,
  signatureHash: signature === undefined ? null : stableHash({ recordId, signature }),
  previousReceiptHash: previousReceiptHash ?? null,
  proofGapReason: proofGapReason ?? null,
}
```

Acceptance rule:

- P6 `recordBusinessActionReceiptClearance` must produce `recordId = clearance:receipt:${receipt.id}` whose payload hash binds the already-created AE `receipt.payloadHash`.
- Verification/readback checks this record exists and matches; it does not include the receipt record hash inside the same AE `payloadHash`, avoiding circularity.
- Future multi-receipt chains use `previousReceiptHash` in the signed receipt payload and the AE receipt's existing `previousReceiptHash` field.

## P4 binding contract

### P4 greenlight payload input

Existing wrapper payload (`convex/protectedActions.ts`) already hashes:

```ts
{
  actionRef: ContactFollowUpActionSlug,
  admissionHash,
  contractHash,
  ownerDecisionHash,
  proposalHash,
  proposalId,
}
```

This is the correct P4 greenlight payload base. `ContactFollowUpGatewayAdmission.admissionHash` remains a **pre-greenlight source hash** over proposal/policy/contract/owner-decision/expiry. It must not include the greenlight ref, because the greenlight payload already hashes `admissionHash`; adding the greenlight back into the admission hash would create a circular two-phase admission model.

### P4 receipt/attempt payload inputs

For new rows, compute:

```ts
boundEvidenceRefHashes = sort([
  greenlightBoundRefHash(consumedGreenlightRecord),
  ...optionalGatewayCheckBoundRefHashes,
  ...proofGapOrRefusalBoundRefHashes,
])
```

Then include `boundEvidenceRefHashes` in:

1. `ContactFollowUpAttempt.attemptHash` always, alongside the pre-greenlight `gatewayAdmissionHash` and `readbackHashValue(...)`.
2. `ContactFollowUpReceipt.payloadHash` by replacing the raw `readback.payloadHash` assignment with a canonical receipt payload hash that includes `attemptHash`, `gatewayAdmission.admissionHash`, `readbackHashValue(...)`, and `boundEvidenceRefHashes`.
3. `ContactFollowUpPrivateEvidenceRef.payloadHash` remains the private readback payload hash; it is referenced by the receipt hash but not expanded publicly.

No P4 path may skip: proposal exists, policy permits owner decision, owner approved with consequence acknowledgement, P4 admission exists with its historical/pre-greenlight hash, the matching greenlight record hashes that admission, and the greenlight is consumed once before attempt/receipt success.

## P6 binding contract

### P6 checkpoint greenlight payload input

Existing wrapper payload (`convex/businessActions.ts`) hashes:

```ts
{
  requestId,
  requestHash,
  checkpointId,
  checkpointHash,
  decision,
  ownerDecisionRef: ownerDecisionRef ?? null,
  reasonCode,
  expiresAt,
}
```

This is the correct P6 checkpoint greenlight payload base.

### P6 receipt payload inputs

For new receipts, compute:

```ts
boundEvidenceRefHashes = sort([
  greenlightBoundRefHash(consumedCheckpointGreenlightRecord),
  ...optionalGatewayCheckBoundRefHashes,
  ...proofGapOrRefusalBoundRefHashes,
])
```

Then include `boundEvidenceRefHashes` in `receiptPayloadHashValue(...)` beside the existing fields:

- `requestId`
- `actionSlug`
- `outcome`
- `cardHash`
- `cardVersion`
- `mandateHash`
- `requestHash`
- `checkpointHash`
- `resultArtifactHash`
- `externalEvidenceRefHashes`
- `guardrailEvidenceRefHashes`
- `signatureRefHash`
- `reconstructionStatus`
- `recordedAt`

`externalEvidenceRefHashes[]` continues to be exactly:

```ts
state.externalEvidenceEvents
  .filter(event =>
    event.requestId === receipt.requestId &&
    event.checkpointId === checkpoint.id &&
    event.status === 'accepted'
  )
  .map(event => event.payloadHash)
```

`guardrailEvidenceRefHashes[]` continues to be request-scoped guardrail `decisionHash` values.

## Failure outcome table

| Scenario | Bound evidence state | P4 result | P6 reconstruction result |
|---|---|---|---|
| Success | Consumed greenlight matches principal/action/request/ref and receipt payload; provider/readback hashes match. | `receipt_recorded` with `readbackStatus='receipt_recorded'`. | `complete`. |
| Owner refused | No consumed success greenlight; owner decision/checkpoint is refusal. | `owner_rejected` / no attempt. | `refused_no_consequence` when checkpoint decision is `refused`. |
| Clarification required | No consumed success greenlight for execution. | Await owner/admin next step; no provider attempt. | `incomplete` unless a later accepted checkpoint/result exists. |
| Proof gap | Proof-gap record/ref or proof-gap readback/result; no complete result. | `proof_gap` / retry or operator review. | `proof_gap`. |
| Expired mandate/checkpoint/admission | Greenlight expired or mandate inactive/expired. | `contact_follow_up_gateway_expired` or `stale`/operator review. | `expired_mandate` for mandate expiry; stale/expired checkpoint remains non-complete. |
| Replay | Greenlight already consumed with a different `consumedByRef` or idempotency conflict. | `contact_follow_up_gateway_replay_rejected`. | `evidence_mismatch` or idempotency conflict before receipt; never `complete`. |
| Tamper | Any bound ref hash, signature hash, payload hash, request/checkpoint/result hash changes. | Reconstruction/readback becomes disputed/operator-review once tests add the tamper case. | `tampered` when receipt fields diverge from recomputed refs. |
| Unbound provider event | Provider evidence payload hash exists but request/checkpoint does not match. | Not applicable to P4 provider boundary. | `unbound_provider_event`; do not report as clearance failure. |
| Missing clearance evidence on new row | No consumed greenlight/proof-gap/refusal record where new contract requires one. | `contact_follow_up_gateway_required` / proof gap. | `evidence_mismatch` or `proof_gap`, not `complete`. |
| Receipt signing proof gap | AE receipt payload exists but clearance receipt record is unsigned/proof-gap. | Source receipt may exist, but audit/readback must show proof gap. | Source receipt can reconstruct its own fields; clearance attestation status is proof-gap and must be exposed only as redacted checked-evidence status. |

## Historical-row behavior

03-03 selected reshape-in-place because no deployed P4/P6 clearance-bearing rows are claimed. Therefore:

1. New source/local rows created after 03-04 must use `boundEvidenceRefHashes[]`.
2. Existing source fixtures may be regenerated instead of silently grandfathered.
3. If Scope 1 deploys P4/P6 clearance-bearing rows before 03-04 lands, switch to freeze-and-supersede:
   - old rows verify through their old receipt contract version,
   - new rows use `boundEvidenceRefHashes[]`,
   - no historical `payloadHash` is rehashed in place,
   - summary must state deployed proof is still not claimed unless the deployed smoke is run.
4. Any compatibility fallback must be explicit via a receipt contract version or stored historical marker. Do not treat missing bound evidence as success by default.

## Privacy and redaction rules

Never persist or return these in public readbacks or agent JSON/tools/boundaries copy:

- raw WBA signature headers,
- raw JWKS or key material,
- `AE_CLEARANCE_SIGNING_SECRET`,
- raw local-HMAC signatures,
- raw private provider payloads,
- private endpoint/payment-gate refs,
- internal protocol payload JSON,
- private trace refs except as hashes.

Allowed public/agent-facing readback shape:

```ts
{
  checkedEvidenceCount: number,
  checkedEvidenceStatus: 'complete' | 'needs_review' | 'proof_gap',
  hashes: { ...existing source hashes }
}
```

Do not expose `boundEvidenceRefHashes[]` unless the route is owner/admin/operator evidence readback. Even there, expose hashes and statuses only, not raw private payloads.

## Test implications

Task 2/3 should add tests proving:

1. One shared helper produces deterministic `boundEvidenceRefHashes[]` independent of insertion order.
2. P4 and P6 both use the shared helper; there is no duplicated term map.
3. A consumed matching greenlight allows success only when P4/P6 source-owned prerequisites also pass.
4. A greenlight without owner approval/checkpoint still refuses; bound evidence is not authority.
5. A consumed greenlight with wrong principal, action class/ref, request ref, mandate, or consumed-by ref refuses or reconstructs as mismatch.
6. A proof-gap/rejected/expired clearance record binds to proof-gap/refusal/expiry, never success.
7. Tampering with any bound ref hash changes P4 attempt/receipt hash and P6 `ActionReceipt.payloadHash`/verification outcome.
8. P6 provider `externalEvidenceRefHashes[]` still detects `unbound_provider_event` independently from bound clearance evidence.
9. Clearance receipt records bind to AE receipt payload hashes without a circular dependency.
10. Public/agent readbacks contain only neutral checked-evidence copy and hashes/counts; D9 vocabulary and raw secrets stay absent.

## Resolution for #18

The exact answer to #18 is:

- Hash **consumed greenlight records** into P4 attempt/receipt and P6 receipt payloads as `boundEvidenceRefHashes[]`.
- Hash **gateway-check records** into the same array when they exist; until wrappers commit them, absence is allowed for source/local rows.
- Hash **proof-gap/rejected/expired clearance records** into the same array for failure receipts/readbacks.
- Do **not** hash the post-receipt clearance receipt record into the same AE receipt payload because that creates a circular dependency. Instead, the clearance receipt record signs/hashes the AE receipt payload and reconstruction/readback verifies that dependent record.
- Do **not** place clearance/kernel records in `ExternalEvidenceEvent.checkpointId` or `externalEvidenceRefHashes[]`; those remain provider evidence only.
- All public copy/readbacks use neutral `checked evidence` wording and redacted hashes/counts only.
