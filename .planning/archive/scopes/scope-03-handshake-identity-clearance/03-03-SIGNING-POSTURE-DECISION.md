# 03-03 Signing Posture Decision — #21

**Status:** resolved for source/local Scope 3.
**Date:** 2026-07-04

## Decision

AE-issued clearance records use `local_hmac` for the two record kinds in Scope 3:

| Record kind | `signaturePosture` | `keyIdentityRef` policy | Why |
|---|---|---|---|
| `greenlight` | `local_hmac` | active clearance signing key identity, e.g. `clearance-hmac:v1` | A one-use admission needs tamper-evident, source-owned proof before P4/P6 consume it. Unsigned greenlights would collapse replay/refusal proof into database trust only. |
| `receipt` | `local_hmac` | active clearance signing key identity, e.g. `clearance-hmac:v1` | Receipt reconstruction must prove the exported record matches AE source state and the selected signing key without exposing credentials. |
| future authority certificate / third-party credential proof | `unverified` until separately admitted | none | Scope 3 does not issue public authority certificates or third-party credential attestations. A later decision must define the provider, key custody, signature algorithm, verifier, and deployed readback before any stronger posture is allowed. |

`unsigned` is rejected for Scope 3 greenlights and receipts because it would weaken the evidence chain that Scope 4/6 already built around source hashes, one-use admission, and reconstruction. `external_signature` is rejected for now because there is no admitted external signer or deployed provider proof. `unverified` remains a typed proof-gap posture for future record classes that have not been admitted.

## Key storage

Use a dedicated clearance signing secret, not `AE_SOURCE_WRITE_SECRET`.

- Secret env name: `AE_CLEARANCE_SIGNING_SECRET`.
- Key identity env/name: `AE_CLEARANCE_SIGNING_KEY_ID`, defaulting in local tests to a non-secret identity such as `clearance-hmac:v1`.
- The secret is server-only and must never use a `VITE_` prefix or appear in public JSON, evidence artifacts, logs, issue comments, or copy.
- `AE_SOURCE_WRITE_SECRET` remains only the origin/source-write admission secret. Reusing it for clearance signing would couple CSRF/source-write admission to receipt proof and make rotation unnecessarily dangerous.
- If a Convex function reads the clearance signing secret, `convex/convex.config.ts` must declare the env value and the function must read typed `env` from `./_generated/server` per `convex/_generated/ai/guidelines.md`. Until a Convex function actually reads this key, the pure helper accepts injected secret material so unit tests and server callers can fail closed without adding a Convex config file.

## Fail-closed behavior

Missing or blank signing secret is a typed proof gap:

```text
{ kind: "proof_gap", reason: "missing_clearance_signing_secret", signaturePosture: "local_hmac", keyIdentityRef }
```

Missing or blank key identity is also a typed proof gap:

```text
{ kind: "proof_gap", reason: "missing_clearance_key_identity", signaturePosture: "local_hmac", keyIdentityRef }
```

Verification with missing key material rejects with `missing_clearance_signing_secret`; verification of mismatched payload/signature rejects with `invalid_clearance_signature`. No fallback signs with `unsigned`, no fallback reuses the source-write secret, and no failure object includes the secret value.

## Rotation

Rotation is additive and key-identity-bound:

1. Create a new secret value and key identity, for example `clearance-hmac:v2`.
2. New greenlights and receipts sign with the active key identity only.
3. Verifiers retain old key identities for historical receipt retention and reconstruction windows.
4. Old records are never rewritten only to change signatures; reconstruction must continue over their original `keyIdentityRef`, `signedAt`, payload hash, and signature.
5. Emergency compromise response disables new signing with the compromised key, marks affected readbacks as proof-gap where verification cannot be trusted, and records an operator evidence note without leaking the secret.

## Scope-1 authz dependency

Scope 1's `tokenIdentifier` canonicalization remains a human-owner/admin authorization prerequisite. It does not change this signing decision. The signing key authenticates AE-issued clearance records; it does not identify a human owner or authorize a verb. Owner/admin authority still comes from server-side authz, P4/P6 owner decision records, mandate/checkpoint state, one-use consumption, and source-write admission.

## Source-local implementation evidence

- Implemented `src/modules/clearance/internal/signing.ts` with canonical stable-stringified HMAC-SHA256 payloads bound to `version`, record `kind`, `signaturePosture`, `keyIdentityRef`, `signedAt`, and record payload.
- Exposed the helper through `src/modules/clearance/public.ts`; later P4/P6 work must import through that seam.
- Added `tests/unit/clearance/signing.test.ts` for deterministic signing of `greenlight` and `receipt`, missing/blank secret proof gaps, missing key identity proof gaps, accepted verification, tamper rejection, and missing-secret verification rejection.
- Fixed the existing module-boundary violation in `src/modules/registry/registry.functions.ts` by importing `buildDevSeedCatalogState` from `@/modules/dev/public` instead of the dev internal fixture.

Commands run on 2026-07-04:

```text
npx vitest run tests/unit/clearance/signing.test.ts
PASS — 1 file, 10 tests

npm run typecheck
PASS — tsc --noEmit

npm run test:ts-standards
PASS — tests/imports/ts-standards.test.ts, 1 test

npm run test:imports
PASS — backup-imports/private-imports/route-boundary, 3 tests
```

Full `03-03-SUMMARY.md` is intentionally not written yet: `03-03-clearance-module-convex-store-PLAN.md` Tasks 3–4 still own ConvexProtocolStore, reusable mandate model, P4/P6 reshaping, and the D7 reshape/freeze path.

## Boundary

This is source/local proof only. No deployed signer proof, booking, payment, dispatch, or autonomous fulfillment is claimed. The public and agent-facing surfaces must not expose Handshake/kernel/greenlight/clearance/mandate/gateway/ActionContract vocabulary as new capability copy.