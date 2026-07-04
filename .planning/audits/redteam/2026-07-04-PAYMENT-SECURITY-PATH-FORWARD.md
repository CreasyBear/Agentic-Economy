# Payment-security path forward — 2026-07-04

## Verdict

The 2026-07-04 security fix wave closed the FIX-NOW payment-adjacent blockers, but it does **not** admit live money.

AE now has a stronger security foundation for the existing qualified-inquiry/storefront path. The payment rung remains **HORIZON** behind the 14-day bootstrap gate, ADR-005, `06-LIVE-MONEY-EVIDENCE-DECISION.md`, and deployed test-mode payment smokes.

Source evidence: `local://ae-wave-results.md`.

## DONE — FIX-NOW blockers resolved

| Blocker | Resolution | Gate evidence |
|---|---|---|
| SSRF in `storefront.importDraft` | RESOLVED. Import fetching now uses manual redirect handling with re-guarding on each hop, DNS/literal-IP private-range rejection, metadata/localhost blocks, timeout, 2 MiB streamed byte cap, HTML content-type enforcement, boundary-honest errors, and hermetic test seams. Connect-time-bound resolution: the actual connection resolves-and-validates atomically via a guarded undici Agent `connect.lookup` using the same private-range classifier as the pre-flight guard, so the validated resolution is the connection's resolution; the DNS-rebinding TOCTOU (public answer to the pre-check, private answer to the connect) is closed. `undici` is an explicit pinned dependency (`7.28.0`), rather than a transitive dependency, because it backs the SSRF security boundary. | `tests/unit/storefront/import-draft.test.ts` now includes guarded-lookup and rebinding-scenario coverage, with 24 importer tests. Orchestrator gate re-run green: `test:unit` 754 pass across 134 files, `test:integration` 101 pass, `tsc --noEmit` 0, `npm audit --omit=dev` 0, and `npm ci --dry-run` reproducible. |
| Production dependency vulnerabilities | RESOLVED. Sentry upgraded to `^10.63.0`, `promptfoo` to `^0.121.17`, and a minimal OpenTelemetry override moved the transitive protobufjs graph to fixed versions. | `npm audit --omit=dev` went from 9 vulnerabilities to 0; full `npm audit` went from 10 to 0; `npm ci --dry-run` was reproducible. |
| Single broad `AE_SOURCE_WRITE_SECRET` | RESOLVED. Source-write keys are split by family, carry `keyId`, support active/previous rotation, fail closed in production without explicit per-family `AE_SOURCE_WRITE_KEY_*`, and prevent provider secrets or public `VITE_` values from doubling as source-write keys. | Orchestrator gate: `tsc --noEmit` 0 errors, `check:convex-codegen` exit 0, unit/integration gates green. |
| Quiet-door / WBA replay and binding debt | RESOLVED. Source-write admissions bind the request body digest, Convex consumes durable nonces, WBA requires method/authority/path/signature-agent coverage plus content-digest coverage for bodied requests, and operation/correlation fallback self-attestation was removed. | Orchestrator gate: `test:integration` 101 pass across 27 files, `test:unit` 741 pass across 133 files, typecheck/codegen green. |

## Defensive addition landed

The wave added a payment-boundary copy negative scan. It fails closed on payment processing/charging claims, custody/escrow claims, PCI/SAQ-A overclaims, verified/guaranteed payment wording, booking + dispatch claims, payout claims, and public epistemic labels on public human surfaces.

Gate evidence: `test:copy` 109 pass, `test:seo` 23 pass, and `test:source-mining` 2 pass.

## Full authoritative gate result

From `local://ae-wave-results.md`:

| Gate | Result |
|---|---|
| `test:unit` | 741 pass across 133 files |
| `test:integration` | 101 pass across 27 files |
| `tsc --noEmit` | 0 errors |
| `check:convex-codegen` | exit 0 |
| `test:copy` | 109 pass |
| `test:seo` | 23 pass |
| `test:source-mining` | 2 pass |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `test:graph-freshness` | stale by design because the graph-relevant worktree is dirty; non-blocking and gated on commit decision |

## Ordered HORIZON sequence

The remaining work is ordered. Do not jump straight to payment controls before the provider/config and webhook/security foundation is finished.

### 1. Provider API base-URL fail-closed allowlist — immediate next

Recommended immediate next hardening:

- Fail closed in production unless provider API base URLs match allowed Stripe/Autumn provider hosts.
- Keep test overrides isolated to test environments.
- Alert on non-provider hosts or configuration drift.
- Cover `.env.example`, billing provider readback, and business-action Stripe checkout code paths in the implementation slice.

This was deferred from the fix wave **only** to avoid a `.env.example` edit collision with the secret-split work. It remains the first recommended follow-up before live provider secrets are treated as safe.

### 2. Unified webhook replay ledger

Standardize provider webhook handling across payment/notification/provider surfaces:

- raw body before parse,
- provider signature before trust,
- timestamp tolerance,
- event-id ledger,
- replay/duplicate/conflicting-payload policy,
- stale/out-of-order policy,
- retry-safe handlers,
- replay/conflict metrics and alerts.

### 3. PCI SAQ-A-compatible architecture formalization

Document and mechanically enforce the PSP-hosted boundary:

- no AE-hosted card fields,
- no PAN/CVC/full-card storage in Convex/logs/analytics/support,
- no public PSP secrets,
- no custody, wallet, credits, balance, settlement, split payout, Connect, or x402 rail.

Wording must remain **SAQ-A-compatible**. No independent certification is claimed.

### 4. Payment-adjacent PII retention/redaction

Define and implement:

- retention TTL,
- purge/tombstone automation,
- operator access limits,
- DSAR/export/delete ownership,
- notification and observability redaction,
- receipt/readback replay without raw private message text.

### 5. Direct public mutation hardening

Payment/protected mutations must be route-only through trusted adapters, not broad direct client/provider-event Convex mutation paths. Required controls:

- explicit actor and tenant/resource ownership,
- source-write scope,
- clearance/mandate checks where applicable,
- operation idempotency,
- no direct public mutation args for provider events or money state transitions.

### 6. Live-money rung — gated last

The live-money/payment rung remains HORIZON until all of the following hold:

1. The 14-day bootstrap gate in `.planning/scopes/scope-14day-bootstrap-gate/` passes with source-owned evidence.
2. ADR-005 is completed with owner and date reversing the current defer posture.
3. `.planning/scopes/scope-14day-bootstrap-gate/06-LIVE-MONEY-EVIDENCE-DECISION.md` is complete.
4. Refunds, disputes, chargebacks, reconciliation, support owner, kill switch, alerts, rollback, and deployed test-mode payment smokes are implemented and proven.
5. Copy scans continue to prevent public claims that AE books, charges, dispatches, custodies, settles, pays out, verifies payment without a named standard, or auto-fulfils.

## Links

- ADR: `.planning/adr/ADR-005-transactions-receipts.md`
- Live-money checklist: `.planning/scopes/scope-14day-bootstrap-gate/06-LIVE-MONEY-EVIDENCE-DECISION.md`
- Active gate: `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md`
- Payment readiness audit: `.planning/audits/redteam/2026-07-04-PAYMENT-SECURITY-READINESS.md`
- Cross-lens red-team register: `.planning/audits/redteam/2026-07-04-REDTEAM-REGISTER.md`
