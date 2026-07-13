# J7 · Machine entry

**Status:** deferred-until-J3-proven · Wave 5
**Promise:** “An assistant used the same contracts.”

## Identity

- **Journey ID:** J7
- **Canonical path:** `/for-agents` → shipped v1 discovery/request API → same J3 object graph → versioned `ConversationEnvelope` projection.
- **Parity rule:** machine entry uses the same task, mandate, record, refusal, and proof boundaries as human J3; it is not a second authority system.

## Status

- **Current:** deferred-until-J3-proven. This exception is the authoritative build gate, not a lifecycle synonym.
- **Entry:** a third-party agent has attributable identity plus separately verified principal/delegation authority for the exact action.
- **Exit:** J3 semantics complete with the same commit-time gates, record, and typed failures; the consumer renders proof boundaries without reinterpretation.

## Persona proof

- **Primary:** deferred to a third-party agent-surface blind walk after J3 passes.
- **Human baseline:** SkepticalShopper’s consent/readback proof sets the minimum parity bar.
- **Failure persona:** an authenticated assistant with missing, expired, revoked, wrong-subject, wrong-scope, or replayed delegation is refused without side effects.

## Ship test

A third-party agent discovers only shipped operations, prepares one business request, proves principal-bound delegation, presents or hands off AE’s exact current readback, commits once, and receives a versioned envelope whose receipt states `doesNotProve`; invalid delegation and replay attempts fail closed with typed refusals and no send.

## Pages & views

- `pages/for-agents.md` — public gateway, real endpoint inventory, access requirements, envelope semantics, and authenticated discovery handoff.
- `/developers/discovery` — authenticated diagnostic readbacks only; not the public onboarding route.
- Human AE review surface — mandatory handoff when the third party cannot render the exact current consequence readback.

## Stage map

1. Discover the canonical skill, catalog, request endpoints, signature directory, and exact current capability scope.
2. Attribute the caller; treat identity as attribution only.
3. Admit principal/delegation fail closed against subject, action, scope, revision, expiry, revocation, and one-use constraints.
4. Create or prepare the same J3 task and exact canonical readback.
5. Render that readback without paraphrase or hand the person to AE for review.
6. Commit with one-use nonce, digest, and atomic target/mandate recheck.
7. Return typed result/refusal plus versioned `ConversationEnvelope`; render provenance, authority scope, boundary text, and `doesNotProve`.

## Kernel dependencies

- **K11/K2:** delegation verification and mandate admission with principal, subject, action, scope, revision, expiry, revocation, replay, and typed refusal checks.
- **K12:** canonical serialization/content digest binding review, admission, record, and envelope projection.
- **K1/K3:** idempotent task admission and immutable evidence ledger shared with J3.
- **Public envelope:** `protocolVersion`, `schemaVersion`, `capabilities`, and items carrying `claimType`, `assertedBy`, `sourceRef`, `observedAt`, `authorityScope`, `doesNotProve`, `boundaryText`, optional canonical `contentDigest`, and payload.

## Open items

- Prove J3 before enabling or advertising machine write parity.
- Name the shipped envelope retrieval route, access policy, schema registry, fixtures, and readback test; do not invent an endpoint in the spec.
- Define delegation issuer/trust roots, revocation freshness, migration windows, and retirement threshold.
- Define exact typed refusals and idempotent replay evidence for every gate.

## Hedge & common-sense checklist

- Fail closed: attributable identity never implies principal authority; envelope possession, prior consent, or model output never authorizes action.
- Every receipt’s `doesNotProve` names business acceptance, booking, payment, and confirmed availability; it proves only AE’s recorded handoff.
- A business response is information only within the business’s asserted scope.
- Preserve the exact boundary: `Sent never means confirmed. AE never books, charges, or confirms. The business confirms.`
- State each load-bearing boundary once at the decision or evidence point; do not turn limitations into ambient gateway copy.

## Re-run gate

After J3 passes, run valid delegation, missing delegation, wrong subject/scope/revision, expired/revoked mandate, nonce replay, digest mismatch, unknown envelope item, and handoff-to-AE scenarios. Pass only with zero unauthorized writes, stable typed refusals, exact readback parity, graceful version handling, and visible `doesNotProve` semantics.
