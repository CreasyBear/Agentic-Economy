---
# ADR-007: Canonical governed-action wire format
Status: Accepted (K12 spike; integration not yet authorized)
Date: 2026-07-14
Scope: Wave 2 entry gate; KERNEL-CEILING C-1/C-2 and ECONOMY-THESIS E-1

## Context

K12 binds authorization, duplicate detection, and later evidence to the exact intent a principal reviewed. A digest over presentation JSON or a runtime-specific object rendering cannot be independently reproduced. `DECISION-REGISTER.md` §4 ADR-1 and `WEDGE-LADDER.md` §4.3b therefore require one versioned, vertical-neutral wire representation before the first persisted receipt.

The current repository has deterministic hashes, but none is this wire contract. `stableHash` is FNV-1a over a local serializer; `canonicalDigest` is SHA-256 over that same serializer. The serializer maps a missing property value to `null`, does not validate the I-JSON domain, and has no immutable wire-format registry. Existing preparation and execution records also hash each aggregate's own shape rather than the K12 envelope.

## Decision

### Canonicalization and implementation choice

AE adopts RFC 8785 JSON Canonicalization Scheme (JCS) over a deliberately restricted I-JSON input domain. The npm ecosystem has credible implementations: `canonicalize` 3.0.0 is the Erdtman/Rundgren implementation and `json-canonicalize` 2.0.0 is a maintained TypeScript implementation. Both are dependency-free and advertise JCS behavior. They canonicalize an already-materialized JavaScript value, however, so they cannot detect duplicate keys lost during ordinary `JSON.parse`, and AE would still need a complete restricted-domain validator for undefined, symbols/non-string keys, sparse arrays, invalid Unicode, and the stricter safe-integer rule.

The spike therefore uses the minimal internal implementation in `src/modules/governed-action/internal/jcs.ts`, following JCS's ECMAScript primitive serialization and UTF-16 code-unit property ordering. This avoids adding a package plus an equally large validation wrapper. The decision is guarded by language-neutral vectors and an independent verifier path; a future replacement may use a vetted library only if it reproduces every existing vector byte-for-byte. References: [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), [`canonicalize` npm metadata](https://registry.npmjs.org/canonicalize), [`json-canonicalize` npm metadata](https://registry.npmjs.org/json-canonicalize).

Accepted values are null, booleans, strings containing only valid Unicode scalar sequences, finite numbers, dense arrays, and plain objects with enumerable string keys, to a maximum nesting depth of 100. Integer-valued numbers must satisfy `Number.isSafeInteger` ($-(2^{53}-1)$ through $2^{53}-1$). The encoder returns typed refusals for non-finite numbers (including NaN and infinities), unsafe integers, undefined, sparse arrays, excessive depth, unsupported values, non-plain objects, non-enumerable properties, non-string/symbol keys, malformed JSON, duplicate raw-JSON keys, and invalid Unicode. Duplicate-key detection requires the strict raw-JSON entry point because a normal JavaScript object cannot retain a duplicate key. No Unicode normalization is performed: canonically equivalent NFC and NFD strings remain different byte sequences and digests.

### Hashed envelope

The only v1 hashed value is:

```text
{
  "wireFormat": "ae-governed-action:v1",
  "schemaVersion": <positive safe integer>,
  "actionClass": <non-empty string>,
  "payload": <opaque restricted-I-JSON value>
}
```

JCS produces the canonical JSON text; UTF-8 encoding of that text produces the canonical bytes. SHA-256 is encoded as lowercase `sha256:<64 hex characters>`. `schemaVersion` is inside the hashed bytes. The public verifier accepts only `(canonicalBytes, expectedDigest)` and has no AE-runtime dependency or need to parse/re-materialize the payload.

`GovernedActionIntent<Payload>` is generic over an opaque versioned payload. Its union has the implemented discriminator `commitmentKind: 'generic'`. The union seam is reserved for E-1 demand and supply commitment variants: both can retain this same envelope and digest algorithm by supplying their own versioned `actionClass` and payload schema. Adding them does not alter v1 canonicalization or historical bytes.

### Evolution policy

`ae-governed-action:v1` is immutable. Production integration must dispatch verification through a decoder registry keyed by the exact `wireFormat`; a decoder's accepted domain, canonicalization, envelope fields, and vectors never change after publication. A breaking change creates a new wire-format value and decoder. `schemaVersion` evolves the opaque action payload within the immutable outer format and remains digest-bound.

Stored canonical bytes are authoritative. Readers must never parse an old record and silently re-canonicalize it with a current encoder, because that substitutes newly materialized bytes for the evidence actually committed. Verification hashes stored bytes directly. Migration creates a new commitment linked to the old one; it never rewrites an old digest.

## Receipt storage contract (types only)

`GovernedActionReceiptStorage` records:

- `canonicalBytesBase64`: the exact canonical UTF-8 bytes, base64 encoded;
- `digest`: lowercase `sha256:<hex>`;
- `algorithm`: the literal `sha256`;
- `schemaVersion`: the digest-bound payload schema version;
- `createdAt`: the authoritative creation timestamp.

No Convex table is added in this spike. A Convex document containing only the parsed envelope is insufficient evidence: a read re-materializes JavaScript values and property layout, not the exact byte sequence that was authorized. Future serializers, decoder bugs, number rendering, or accidental normalization could therefore yield different bytes. Persisting exact bytes makes replay and third-party verification independent of Convex's document representation.

## Migration inventory

No existing caller is migrated by this isolated spike. Before a receipt write, callsites are classified as follows.

### Wire-format-relevant — migrate at governed-action integration

- `src/modules/customer-request/action-preparation.ts`: `preparationDigest`, `projectedInputDigest`, approval/reservation, review, and authority-scope digests. These bind reviewed/prepared consequential material and are K12-adjacent.
- `src/modules/customer-request/preparation.ts` and `preparation-authority.ts`: preparation command/resolved-input/prepared-action digests and allocation digests are consequential admission inputs. The HMAC `protectedProjectionCommitment` is an authorization-secret commitment, not the public K12 digest, but its signed material must reference the eventual governed-action digest.
- `src/modules/customer-request/prepared-action-v2.ts`, `approval-grant-v2.ts`, and `action-attempt-v2.ts`: prepared action, approval grant, attempt, scope, exposure, and authority-budget digests are consequential lineage. The governed intent/attempt boundary must use this wire format; internal child integrity digests may remain separately versioned.
- `src/modules/customer-request/provider-execution-v2.ts` and `provider-reconciliation-v2.ts`: invocation-envelope/release/outcome and reconciliation digests cross an execution boundary. The invocation must carry the governed-action digest; provider-specific response/evidence hashes remain their own versioned formats.
- `convex/customerRequestV2PreparationEgressState.ts`: operation and preparation integrity checks persist and replay consequential egress state. Before this becomes receipt authority, it must persist the exact governed-action bytes plus digest rather than relying on re-materialized documents.
- `src/modules/customer-request/service-auth-envelope.ts` and legacy compiler/preparation command digests: wire-relevant only while those paths can authorize or dispatch consequential work; migrate or retire before the single-command-path gate opens.

### Separate machine-readable formats — do not silently migrate

- `src/modules/capability-contract/public.ts`, `capability-supply/public.ts`, `capability-supply/internal/transport-adapters.ts`, and their Convex audit uses: SHA-256 identities for capability contracts, schemas, registrations, eligibility, and adapter configuration. These are externally meaningful but are not governed-action intents. Keep their current versioned formats until dedicated ADRs/vectors authorize a migration.
- `src/modules/routing-kernel/internal/authority-digest.ts` and routing-edge/service HMAC envelopes: authority/transport formats with existing contracts. They may reference a K12 digest later but must not be reinterpreted as v1 governed-action bytes.

### Internal-only — retain, never expose as K12

- All `stableHash` uses in business/catalog/inquiries, notification outbox/providers, answer-thread/harness, discovery manifests, observability, dev fixtures, and Convex audit IDs. They create local identifiers, idempotency comparisons, redacted audit fingerprints, fixture IDs, or cache/projection identities. FNV `hash:<8 hex>` is explicitly not a wire digest.
- Remaining `canonicalDigest` uses in customer-request compilation/evaluation (candidate, fact, plan, requirement and projection identities), sandbox references, audit-event payloads, and internal integrity/deduplication comparisons. They remain internal unless a future boundary ADR names their exact bytes and vectors.

## Consequences

- C-1 holds: the new module has no vertical vocabulary or imports; payload semantics are opaque.
- C-2 holds at spike level: version and format are hashed, vectors are language-neutral, exact bytes are retained by contract, and byte verification is pure.
- The restricted safe-integer rule is stricter than RFC 8785's binary64 domain. Payload schemas needing larger integral values must encode them as explicitly typed strings in a future schema; they may not rely on lossy JSON numbers.
- The module uses `@noble/hashes`, already a runtime dependency, and contains no `node:*` import. The independent Node implementation exists only in the test file, so Convex-compatible import graphs remain safe.

## Exit-criteria evidence

- `src/modules/governed-action/vectors.json`: 13 valid vectors and 10 refusal vectors, including Unicode preservation, UTF-16 key ordering, safe integer boundaries, nesting, reordered keys with equal digest, revision mutation with different digest, non-finite numbers, unsafe integer, undefined-ish input, duplicate key, invalid Unicode, non-enumerable properties, excessive depth, and a constructed non-string key.
- `tests/unit/governed-action/canonical-wire-format.test.ts`: primary encoder plus pure byte verifier are checked against every vector. A separate minimal canonicalizer and Node `createHash('sha256')` path independently reproduce canonical bytes and digests for every valid vector.
- Focused verification on 2026-07-14: 25/25 vector tests passed and focused oxlint passed. Repository typecheck reported only the declared concurrent-session diagnostics in provider-integrations/shipping and its customer-request test; no diagnostic names `src/modules/governed-action` or its vector test.
