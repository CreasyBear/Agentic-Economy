# S2-G2 endpoint-check threat fixture pack

**Status:** required before 02-03 check-engine implementation.  
**Scope:** source-local fixtures/tests for `ae-endpoint-check:v1`; no live endpoint proof and no dispatch.

## Required fixture matrix

| Case | Input shape | Expected trust/check state | Required assertion |
|---|---|---|---|
| Private IPv4 | `http://10.0.0.1/...`, `172.16.0.0/12`, `192.168.0.0/16` | refused / unsupported | No fetch consequence; reason records private network. |
| Loopback | `127.0.0.1`, `localhost`, `::1` | refused / unsupported | No fetch consequence; no dispatch. |
| Link-local / metadata | `169.254.169.254`, link-local IPv6 | refused / unsupported | No fetch consequence; metadata URL never reached. |
| DNS rebind | public hostname resolves to private/loopback on second check | refused / contradicted | Resolution is pinned/validated; rebind fails closed. |
| Redirect to unsafe host | 30x from safe URL to private/foreign host | refused / unsupported | Redirect policy blocks or revalidates target; no unsafe body read. |
| Oversize body | body exceeds cap | stale/unsupported or refused by cap | Body cap enforced; no unbounded memory. |
| Bad content type | HTML/binary where JSON expected | unsupported | Parser does not infer success from text. |
| Schema mismatch | JSON missing required fields or wrong literals | contradicted/unsupported | No partial capability acceptance. |
| Stale freshness | timestamp older than accepted window | stale | Listing visibly degrades; no checked/fresh state. |
| Contradicted facts | business-supplied facts conflict with AE-held public facts | contradicted | AE-held public facts win; no silent override. |
| Unreachable/timeout | DNS failure, connection refused, timeout | unavailable/stale | Fail-loud attempt record, no dispatch. |
| Unsupported action kind | manifest advertises unsupported write/action/payment | unsupported | Unsupported is surfaced as unavailable/unsupported, not callable. |
| Valid checked endpoint | same-origin/domain-controlled, schema valid, fresh | checked | Produces checked+fresh readback only; still does not authorize Scope-4 POST. |

## Invariants

- `ae-endpoint-check:v1` is a check standard, not a public `verified` claim.
- Human wording uses `checked`, `last checked`, `needs confirmation`, or `business-supplied` unless a named verification standard and evidence row exist.
- No fixture may introduce service-shaped fields such as urgency, job suburb, service area, hours, emergency, or local-trades-only schema into the core capability model.
- The check engine never performs dispatch or action execution. Scope 4 owns message delivery after separate gates.

## Verification target

Future 02-03 tests should assert the full matrix above before any deployed/domain-controlled proof is attempted. Missing deployed env or host allowlist remains a blocker, not a skipped pass.

## Source-local fixture test

- `tests/unit/capabilities/endpoint-check-threat-fixtures.test.ts` encodes the matrix as data-only fixtures and asserts refusal shape, bounded read/no-fetch consequences, no dispatch, and checked/stale/contradicted/unsupported state mapping.
- The fixture pack is not an endpoint engine and does not claim deployed provider proof. The next implementation dependency is the 02-03 engine seam that consumes these fixtures with host allowlist, DNS pin/revalidate, redirect revalidation, body caps, strict JSON schema parsing, freshness, and contradiction checks.
