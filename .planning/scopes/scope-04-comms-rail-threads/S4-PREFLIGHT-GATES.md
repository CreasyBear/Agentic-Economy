# S4 preflight gates

**Status:** required before Scope 4 implementation beyond planning reconciliation.

## S4-G2 endpoint dispatchability matrix

Only an exact registered, same-origin/domain-controlled, checked+fresh business reply channel may be considered for Scope 4 delivery. Stale, contradicted, unsupported, unreachable, redirected, private/loopback/link-local/DNS-rebound, or non-registered URLs refuse before dispatch.

## S4-G3 outbox status-model fixture

Required state assertions before adapter work:

- endpoint/provider 2xx means delivered to the configured channel, not read;
- provider/webhook read or explicit receiver cursor is required for read;
- failures retry/backoff/dead-letter without losing the message;
- `triggered` and `sent` are not rendered as read;
- terminal close/expiry blocks further writes with typed reasons.

## S4-G4 readback-token leak tabletop

Required scenarios:

- token mint stores only a hash and expiry;
- URL delivery uses no-store/no-referrer posture;
- foreign thread/token mismatch refuses;
- cursor advance is own-thread-only;
- tombstone/close/expiry hide or redact private content;
- logs/referrers do not leak raw contact, token, or private thread state.

## S4-G5 copy/provenance fixture

Fixture rows must cover:

| Scenario | Required public meaning | Forbidden implication |
|---|---|---|
| Human owner reply | A person at the business replied. | Automated fulfillment, booking, dispatch. |
| Business-operated reply channel | The business configured a reply channel and the reply was received. | AE spoke for the business. |
| AE-operated demo reply path | Demo/source-local only; not a real provider. | Real marketplace liquidity or live availability. |
| Assistant-submitted inquiry | Sent on behalf of a person for owner review. | Booking or confirmed service. |
| Quote message | Communication with quoted terms. | Payment request, checkout, or final transaction. |
| Intent to continue | Next-step request / buyer intent. | Payment, booking, dispatch, or acceptance consequence. |

Every fixture must pass PM-05 terms and keep public copy free of internal `readback`, `endpoint`, `capability`, protocol, or unqualified `verified` language.
