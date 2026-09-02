# Package 4 Formance promotion requalification

**Result:** `PASS`

This record promotes the completed Formance decision spike into the Package 4
delivery branch. It does not activate any application caller.

## Locked component set

- Formance Stack `v3.2.10` (`892837f10b2b9f4a8aeb6a96fe7a9d6aa802b056`)
- Ledger `v2.4.12`
- Gateway `v2.3.1`
- Formance Operator `v3.9.6` (`7eca0ae56054064a1d8c47fd3a097368d1e1670c`)
- official-source TypeScript SDK `v7.0.0` (`c3b90dd5134ac91ee221f77b39992d617280098e`)
- PostgreSQL `16-alpine`
- Node.js 22

All runtime images are selected by multi-platform manifest digest. The
vendored Ledger standalone configuration remains unchanged; the overlay is the
only place that replaces the older example Gateway with the Stack release's
compatible Gateway.

## Refreshed evidence

The following evidence was refreshed before the inert application boundary is
installed:

1. supported exact-money matrix through the official SDK;
2. strict schema, named templates, lifecycle and append-only corrections;
3. atomic contention, idempotency and exact-reference recovery;
4. 10,000-transaction cursor pagination;
5. Gateway, Ledger, worker and PostgreSQL restart recovery;
6. PostgreSQL backup and restoration into a fresh stack;
7. Ledger `v2.4.11` to `v2.4.12` migration rehearsal;
8. official SDK execution in the supported Convex Node runtime;
9. official Kubernetes/operator packaging validation for Linux arm64;
10. bounded, secret-safe logs and cleanup restricted to named spike resources.

## Results

| Gate | Result | Evidence |
|---|---|---|
| Official SDK source reproduction | PASS | Commit `c3b90dd5134ac91ee221f77b39992d617280098e` rebuilt under Node `v22.22.0`; the tarball reproduced byte-for-byte at SHA-256 `8caab624bddecebc5fed54dd7a39116279ee7c29e782cb0923e4f9aa00174104`; packaged MIT license present; CycloneDX SBOM generation succeeded. |
| Bounded exactness | PASS | `1`, the current funding maximum and `Number.MAX_SAFE_INTEGER` round-tripped exactly. The committed out-of-range probes still demonstrate the known SDK limit. |
| Commercial lifecycle | PASS | Named-template funding, reservation, release, sale, adjustment, reversal, treasury, Provider accrual and Provider settlement read back exactly. |
| Contention | PASS | Exactly 10 of 100 reservations won; 90 lost atomically; warm exact-reference p95 `3.06 ms`; replay p95 `3.93 ms`. |
| Exact-reference recovery | PASS | Accepted-response loss, Ledger restart, replay and changed-command conflict recovered without metadata search or blind resubmission. |
| Pagination | PASS | 10,000 bookings traversed in 667 native cursor pages in `1.73 s`; schema, balance, reference and idempotency evidence remained exact. |
| Service restarts | PASS | Gateway, worker, Ledger and PostgreSQL restarted independently; the 10,000-booking proof passed after Ledger and PostgreSQL restarts. |
| Backup and restore | PASS | Official `pg_dump`/`pg_restore` rebuilt the disposable database; official Ledger migration ran; the 10,000-booking proof passed after restore. |
| Version migration | PASS | Ten bookings created on Ledger `v2.4.11` retained schema, balances, references and idempotency after official migration to `v2.4.12`. |
| Convex Node runtime | PASS | The isolated Node Action returned the exact `25000000000` funding maximum using the official SDK. Generated local deployment state was removed. |
| Kubernetes/operator packaging | PASS | The official Operator `v3.9.6` Helm chart installed on a disposable two-node Linux arm64 k3d cluster; the operator reached `1/1` ready. The chart's unsupported `operator.disableWebhooks` flag was not set; its default disabled webhook resources were retained. |
| Gateway health | PASS | Gateway `v2.3.1` reported Ledger `v2.4.12` healthy through `/versions`; direct Ledger and PostgreSQL ports remained private to the local topology. |
| Diagnostics | PASS | A bounded service-log scan found no authorization, bearer, Stripe, Cloudflare, wallet, signing or password material. |
| Cleanup | PASS | The upgrade stack and volume, Convex local state, and Kubernetes cluster were removed by exact name. The retained requalification stack is the named disposable local/CI fixture only. |

## Source discrepancy contained

Gateway `v2.3.1`'s root Caddyfile expresses version endpoints on one line, while
the same release's parser requires a nested service block. With the sample
syntax the Gateway reports three unhealthy endpoints even though routed Ledger
requests succeed. The checked-in requalification Caddyfile uses the parser's
implemented syntax and the Compose health check asserts `/versions`. This is a
declarative deployment correction, not a client or ledger fork.

## Disposition

PR 0 is cleared. The application root still has no Formance dependency and no
product write path reaches Formance. PR 1 may establish activation and operating
policy; PR 2 remains the first permitted application boundary.
