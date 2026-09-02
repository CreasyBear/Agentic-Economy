# PR 1 evidence — official SDK exactness

**Executed:** 2026-09-02

**Result:** `FAIL`

## Runtime

| Component | Observed |
|---|---|
| Node | `v22.22.0` |
| Ledger | `v2.4.12` |
| Gateway | `v2.0.31` |
| TypeScript SDK | `v7.0.0` |
| PostgreSQL | `16-alpine` |
| Schema enforcement | `strict` |
| Numscript runtime | stable `machine` |
| SDK automatic retry | disabled |

The official Gateway was added after explicit user approval because SDK v7
targets `/api/ledger/...` routes while standalone Ledger exposes `/v2/...`.
The Gateway used the official standalone Caddyfile and was loopback-only.

The SDK release was built and packed from immutable official commit
`c3b90dd5134ac91ee221f77b39992d617280098e` using its own build scripts because
npm does not contain the tagged `7.0.0` version. Source remained unmodified.

## Exactness matrix

All writes used the named `EXACT_DEPOSIT` schema template, schema
`v1.0.0`, stable references and idempotency keys, fixed monetary strings,
closed digest-only metadata, the stable `machine` runtime, no `force`, and
no SDK retry.

| Case | Expected | SDK value | Exact |
|---|---:|---:|---|
| One unit | `1` | `1` | yes |
| Current funding maximum | `25000000000` | `25000000000` | yes |
| `Number.MAX_SAFE_INTEGER` | `9007199254740991` | `9007199254740991` | yes |
| `Number.MAX_SAFE_INTEGER + 1` | `9007199254740992` | `9007199254740992` | yes, incidentally representable |
| Current 30-digit ceiling | `999999999999999999999999999999` | `1000000000000000019884624838656` | **no** |
| Cumulative balance above safe integer | `9007199254740993` | `9007199254740992` | **no** |

The default generated SDK silently rounded both failing values.

## Product risk horizon

Package 4 uses six-decimal AUD and USDC units. The safe JavaScript integer
ceiling is therefore `9,007,199,254.740991` whole currency units. AE's current
funding maximum is `25,000.000000` AUD, about 360,288 times smaller, so a normal
single funding or managed Call does not approach the boundary.

The earlier operational boundary is cumulative volume on shared accounts. The
SDK exposes lifetime `input` and `output` volumes in transaction and account
responses. Those totals can exceed the safe boundary while each posting and
the current balance remain small. Platform-wide treasury, revenue, tax, and
control accounts therefore approach the limit with cumulative platform flow,
not with one user's balance.

| Annual cumulative flow through a hot account | Approximate time to boundary |
|---:|---:|
| A$1 million | 9,007 years |
| A$10 million | 901 years |
| A$100 million | 90 years |
| A$1 billion | 9 years |
| A$10 billion | 0.9 years |

Changing AUD precision, ignoring response fields, rotating ledgers, or
partitioning hot accounts would weaken the locked Package 4 contract or add
new coordination and reconciliation machinery. None is an approved workaround.

## Official bigint-as-string option

The same SDK request was sent with:

```text
Formance-Bigint-As-String: true
```

Ledger returned HTTP 200 with exact strings, but the SDK returned
`ResponseValidationError` because its generated inbound posting and volume
models require JSON numbers. The test did not access `rawResponse`, install an
interceptor, patch a generated model, or parse JSON itself.

Ledger issue `#1320` tracks documenting this header for generated clients.
Ledger pull request `#1663` is approved but remained open and unmerged on
2026-09-02. Its OpenAPI change is a prerequisite, not a delivered TypeScript
SDK fix. The exactness matrix must be rerun against the first official SDK
release generated from a Ledger contract that models string bigint responses.

## Stopping rule

The official SDK cannot round-trip every required Package 4 amount exactly.
That is the plan's hard rejection gate. Consequently these stages were not run:

- Convex Node Action bundle/runtime probe;
- native Package 4 booking semantics;
- zero/negative and scarcity refusal matrix;
- contention and crash recovery;
- pagination, backup/restore, upgrade, and pricing comparison.

Continuing would only evaluate a candidate already disqualified by the
authoritative exact-money requirement.
