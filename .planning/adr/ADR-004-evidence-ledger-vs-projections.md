---
# ADR-004: Evidence ledger versus projection ownership
Status: Accepted
Date: 2026-07-14
Scope: Wave 2 entry gate; K3 and DECISION-REGISTER §4 ADR-4

## Context

R1 must retain what was authorized and dispatched while continuing to serve mutable thread, owner-inbox, customer-record, export, delivery, and privacy views. Treating one mutable inquiry row as both operational view and evidence authority makes those requirements conflict: status updates and redaction would rewrite the same object whose prior bytes must remain provable.

Current inquiry source already demonstrates both patterns.

- `submitInquiry` in `src/modules/inquiries/internal/commands.ts` appends message, notification, audit, funnel, and operation records while adding the thread. `replyToInquiry` appends later message/notification facts. These are fact-like collections.
- `replaceThread` in the same file replaces the current thread row; `markInquiryRead`, `replyToInquiry`, and `closeInquiry` update thread status/version/timestamps. `InquiryThreadRecord` in `src/modules/inquiries/internal/schema.ts` is therefore a mutable current-state projection, not immutable send evidence.
- `projectInquiry`, `customerRecordReadback`, `exportReadback`, `notificationProjections`, and `operatorReconstructionRow` in `commands.ts` deterministically assemble read models from source collections.
- `deleteInquiryPrivateContent` replaces private message content, sets `privateDeletedAt`, appends an `InquiryPrivacyTombstoneRecord`, and preserves audit/operation lineage. The distinction between erasable payload and durable lineage already exists, although it was not yet the governed-send receipt authority.
- `InquiryOperationRecord` stores a local `requestHash` and replay result references. ADR-007 classifies inquiry `stableHash` uses as internal-only; this operation row is not exact canonical governed-action evidence.

ADR-007 requires a governed-action receipt to preserve exact `canonicalBytesBase64`, `digest`, `algorithm`, `schemaVersion`, and `createdAt`, and requires readers to verify stored bytes directly rather than parse and re-canonicalize an old document.

The R1 adapter adds `GovernedSendReceiptRecord` in `src/modules/inquiries/internal/governed-send.ts`. The inquiry-owned Convex fragment in `src/modules/inquiries/internal/convex-schema.ts` adds the separate `governedSendReceipts` table. It stores one row per receipt rather than an unbounded array in an inquiry document.

## Decision

### 1. Consequential facts are appended; projections are replaceable

A command that changes externally consequential state MUST append a versioned fact before any customer or operator surface claims the change. Facts include authorization decisions, target-admission snapshots, dispatch attempts/observations, exact-byte governed-send receipts, business replies, failures/unknowns, withdrawal/closure decisions, privacy tombstones, and notification cessation observations.

Thread status, owner-inbox buckets, delivery labels, customer record, export, activity/history ordering, and operator reconstruction are deterministic projections. They may be rebuilt, cached, replaced, or versioned without changing the underlying facts. Direct writes that make a projection assert a fact absent from the ledger are prohibited.

### 2. Governed-send receipt authority

`GovernedSendReceiptRecord` is the append-only authority for an admitted R1 dispatch. Its required fields are:

- ADR-007 storage: `canonicalBytesBase64`, `digest`, literal `algorithm: 'sha256'`, digest-bound `schemaVersion`, and authoritative `createdAt`;
- command identity: `operationKey` and `threadId`;
- admission evidence: an admitted `r1-target-admitted:v1` proof snapshot;
- exact destination binding: `recipientRef`.

The Convex `governedSendReceipts` table in `src/modules/inquiries/internal/convex-schema.ts` owns durable persistence. `by_operationKey` supports one-use reconciliation; `by_threadId_and_createdAt` supports ordered record projection. A parsed envelope, `InquiryThreadRecord`, `InquiryMessageRecord`, `InquiryNotificationRecord`, or `InquiryOperationRecord` is not a replacement for this row.

Receipt creation proves that commit admission passed and dispatch was initiated/observed to the degree recorded by the dispatch facts. It does not prove business acceptance, availability, booking, confirmation, or real-world completion. Later delivery and reply observations append separately and never rewrite canonical bytes.

### 3. Exact bytes are immutable

Receipt rows are insert-only. Code MUST NOT patch, replace, delete, normalize, or re-canonicalize `canonicalBytesBase64`, `digest`, `algorithm`, `schemaVersion`, `createdAt`, `operationKey`, `threadId`, `admissionProof`, or `recipientRef`.

Verification decodes the stored base64 bytes and calls `verifyGovernedActionBytes` with the stored digest. Parsing may produce a view after verification, but the parsed object is not evidence authority. A wire or payload migration appends a new linked commitment/receipt; it does not rewrite historical bytes.

### 4. Idempotency and conflict

Before append, the command looks up the operation key:

- no matching receipt: continue through digest, mandate, admission, and dispatch checks;
- same operation key and same governed-action digest: return the original result and receipt without a second dispatch or append;
- same operation key and different digest: return `inquiry_digest_mismatch` with no dispatch and no receipt mutation.

`InquiryOperationRecord.requestHash` remains useful for existing local command replay, but it is not the ADR-007 digest and cannot decide governed-send byte identity.

### 5. Projection derivation

The canonical customer record at `/t/:threadId?k=#record`, owner views, exports, and delivery state are read models over receipt plus later facts. At minimum, a record projection obtains:

- exact submitted fields from verified stored canonical bytes;
- recipient and creation time from the receipt;
- admission/dispatch posture from the receipt and linked dispatch facts;
- current delivery label from the latest authoritative delivery observation;
- business replies from separately attributable reply facts;
- redaction/retention posture from content records and tombstones.

Projections MUST NOT independently assemble a field list and call it the sent payload, infer sent state from a mutable thread status, convert delivery acknowledgement into business acceptance, or mutate the receipt when a reply arrives.

A cache may store projection output only with an explicit projection version and source fact cursor/revision. Cache invalidation or rebuild never changes evidence.

### 6. Event and projection write ownership

Only the source-owned command path may append consequential inquiry facts. Route/UI code and read handlers do not write thread status, sent state, receipt fields, delivery facts, or reply facts directly. Convex orchestration persists the command result; it does not independently author a second version of the event.

Within a commit transaction, append facts and update/rebuild the current projection from those same facts. If the transaction cannot append the receipt, it MUST NOT expose a sent projection. If external dispatch is uncertain, append/retain an uncertainty fact and project status unknown; reconciliation appends a later observation.

### 7. Payload erasure and lineage tombstones

Evidence retention and private-content retention are separate policies.

Private message bodies, contact values, raw payload fields, and replies are field-separated content and may be erased or redacted under the declared retention policy. `deleteInquiryPrivateContent` and `InquiryPrivacyTombstoneRecord` implement that pattern only for the current message/thread content: message content is replaced/redacted, `privateDeletedAt` records removal, and a tombstone preserves thread/business/operation/correlation lineage and time. Current source spreads `governedSendReceipts` through unchanged, so it does **not** erase the customer data retained inside `canonicalBytesBase64`.

Governed receipt metadata and exact canonical bytes remain append-only authority; neither may be rewritten into a redacted substitute. Before public R1 release, canonical bytes MUST be envelope-encrypted with a receipt/content-scoped data-encryption key. A valid erasure destroys that scoped key, appends an erasure tombstone/lineage event, and leaves immutable evidence metadata (digest, algorithm, schema version, operation/thread/recipient references, admission snapshot, and timestamps) unchanged. After key destruction, projections MUST render the payload as erased and MUST NOT claim the original bytes remain reproducible or verifiable. The ciphertext may remain append-only, but it is no longer decryptable through AE's key authority.

This encrypted-erasure path is a public-release blocker. The current `GovernedSendReceiptRecord`/Convex table stores base64 bytes directly and the current `deleteInquiryPrivateContent` path neither envelope-encrypts them nor destroys a scoped key. A tombstone alone is insufficient while plaintext-equivalent base64 remains readable.

Legal hold, retention expiry, key destruction, and erasure are explicit events/states. Silent physical deletion, in-place receipt rewriting, re-canonicalization of a redacted object, or deletion success that leaves decryptable governed payload bytes is prohibited.

## Ownership matrix

| Artifact | Authority | Mutation rule | Examples |
|---|---|---|---|
| Governed action bytes and digest | Evidence ledger | Append once; verify stored bytes | `GovernedSendReceiptRecord`, `governedSendReceipts` |
| Admission at commit | Evidence ledger snapshot | Append with receipt; never recalculate history | `R1TargetAdmissionVersion`, `AdmissionProofClass` |
| Dispatch/delivery/reply observations | Evidence ledger | Append new observations | inquiry notifications, messages, audit facts |
| Current thread lifecycle | Projection | Replace/rebuild from facts | `InquiryThreadRecord`, `replaceThread` |
| Owner inbox/customer record/export | Projection | Deterministic read; cache may rebuild | `projectInquiry`, `customerRecordReadback`, `exportReadback` |
| Private message/contact/reply content | Field-separated content store | Redact/erase by policy | `InquiryMessageRecord.body`, `redactedContact`, `privateDeletedAt` |
| Governed receipt payload confidentiality | Envelope-encrypted append-only bytes + scoped key authority | Destroy scoped key on valid erasure; never rewrite receipt bytes/metadata | `canonicalBytesBase64` (current plaintext-equivalent storage is release-blocking) |
| Erasure lineage | Evidence ledger | Append tombstone/key-destruction fact | `InquiryPrivacyTombstoneRecord` pattern; governed-receipt erasure event remains to implement |
| Command replay helper | Operational ledger | Append; local hash only | `InquiryOperationRecord` |

## Consequences

- Mutable inquiry rows are explicitly not Wave-2 receipt authority.
- Exact authorized bytes survive projection code changes and can be checked independently.
- Customer, owner, export, and operator views cannot drift into competing sources of truth if all derive from the same facts.
- Replies and delivery changes remain attributable later events rather than edits to the sent record.
- Existing privacy deletion removes field-separated message/thread content but not governed receipt bytes. Public release is blocked until receipt envelope encryption, scoped key destruction, and append-only erasure lineage are implemented end to end; proof claims cease after key destruction.
- Receipt storage grows by append. It uses a child table, indexes, bounded reads, and retention policy rather than an unbounded array in a Convex document.

## Rejected alternatives

### Make `InquiryThreadRecord` the receipt

Rejected because thread rows are replaced as read/reply/close state changes. A mutable lifecycle row cannot prove historical exact bytes.

### Store only the parsed canonical envelope in Convex

Rejected by ADR-007: parsing and later serialization do not preserve the exact authorized UTF-8 bytes.

### Store only the digest

Rejected because a digest without the committed bytes cannot reproduce the reviewed payload or distinguish loss of evidence from successful verification.

### Rewrite one record as delivery and replies arrive

Rejected because it destroys event attribution and allows later observations to alter what the customer authorized.

### Delete all lineage with private content

Rejected because it prevents honest reconstruction of whether an event occurred and breaks idempotency/audit obligations. The tombstone must preserve minimal lineage without retaining erased content.

## Verification anchors

- Exact-byte contract and verifier: `src/modules/governed-action/public.ts` — `GovernedActionReceiptStorage`, `verifyGovernedActionBytes`.
- R1 receipt type and refusal: `src/modules/inquiries/internal/governed-send.ts` — `GovernedSendReceiptRecord`, `GovernedSendRefusalCode`.
- Module-owned persistence: `src/modules/inquiries/internal/convex-schema.ts` — `inquiryTables.governedSendReceipts`.
- Mutable source/projection types: `src/modules/inquiries/internal/schema.ts` — `InquiryThreadRecord`, `InquirySourceState`, `InquiryPrivacyTombstoneRecord`.
- Append/replace/projection behavior: `src/modules/inquiries/internal/commands.ts` — `submitInquiry`, `replaceThread`, `projectInquiry`, `customerRecordReadback`, `exportReadback`, `deleteInquiryPrivateContent`.
- Admission proof: `src/modules/inquiries/internal/admission.ts` — `R1TargetAdmissionVersion`, `evaluateR1TargetAdmission`.
