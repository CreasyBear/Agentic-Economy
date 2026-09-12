# Convex Observability Setup

Date: 2026-09-12

## Purpose

The 2026-09-12 platform maturity sprint converted ~133 bare `} catch {` blocks in `convex/` to `degradeBackend()` (`src/lib/observability/degrade-backend.ts`), which emits a single structured line:

```
console.error('[ae.degraded]', JSON.stringify({ operation, reason, cause }))
```

Convex's native Sentry integration only reports THROWN exceptions, so these caught-and-degraded incidents reach Sentry only via Log Streams. This runbook wires both. Both features require a Convex Pro plan (confirmed in use).

## Two mechanisms, different jobs

| Mechanism | Catches | Configure at | Notes |
| --- | --- | --- | --- |
| Convex exception reporting (Sentry) | Thrown, uncaught exceptions in Convex functions | Convex Dashboard -> Deployment Settings -> Integrations -> Sentry | Auto-attaches tags `func`, `func_type`, `func_runtime`, `request_id` which cannot be overridden. Stack traces included. Mark the Sentry project platform as Node.js. |
| Convex Log Streams | `console.*` output including `[ae.degraded]` lines, plus function_execution events | Convex Dashboard -> Deployment Settings -> Integrations -> log stream destination | Destinations: Axiom, Datadog, or a custom webhook. |

## Important constraint

Sentry does NOT currently ingest Convex log drains — tracked at https://github.com/getsentry/sentry/issues/92705. So the practical split recommended by the Convex team is: **Sentry for thrown exceptions, Axiom (or Datadog) for logs**. Do not expect `[ae.degraded]` lines to appear in Sentry.

## Setup steps

1. Sentry exception reporting: Convex Dashboard -> Deployment Settings -> Integrations -> Sentry card -> supply the Sentry DSN. Optionally add extra tags. Do this for each deployment (development and production) separately.
2. Log stream to Axiom: Integrations -> select Axiom -> supply dataset + API token. Repeat per deployment.
3. Verify the stream: trigger any degraded path, then query the destination for `[ae.degraded]`.

## Querying the degraded signal

- In Axiom, filter to log events where topic is `console`, then match message content containing `[ae.degraded]`.
- The JSON payload fields are `operation` (the enclosing function name, chosen to be searchable), `reason` (one of `source_unavailable`, `timeout`, `not_found`, `forbidden`, `invalid_response`), and `cause` (serialized name/message/stack).
- Convex's `request_id` is the correlation key between a client-side error and the backend log line. The app threads its own correlation ref via `src/lib/server/request-correlation.ts`; note both exist and are different identifiers.
- To replicate the Convex dashboard view, filter to logs where topic is `console` or `function_execution`.
- `function_execution` events also carry `error_message`, `user_execution_time_ms`, `mutation_retry_count` and `occ_info` (write conflicts) — useful when investigating a degraded path that correlates with contention.

## Why this is not optional

Convex retains only a limited number of logs and logs can be erased during internal maintenance or upgrades. Without a log stream, the `[ae.degraded]` signal is transient and unqueryable after the fact. Server-side errors visible in the dev console are hidden in production to avoid leaking server state.

## Alert candidates (starting set)

- Any `[ae.degraded]` with `reason: 'invalid_response'` on a money path — indicates upstream contract drift.
- A rate increase in `operation: claimAutomaticReconciliationCandidate` or `finishAutomaticReconciliation` — these previously dropped reconciliation work silently and are the reason the sweep prioritised `convex/capabilityCallWorker.ts`.
- Any `[ae.degraded]` from `convex/moneyX402PaymentAuthorization.ts` operations.

## Related

- `./app-maturity-audit.md` — the census that motivated this
- `./platform-maturity-sprint.md` — the sprint plan
- `src/lib/observability/degrade-backend.ts` — the emitter
- `tests/imports/bare-catch-ratchet.test.ts` — prevents regrowth
