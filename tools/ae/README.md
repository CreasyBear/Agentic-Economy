# AE CLI

Exercise AE the way an external agent would through the canonical Operation
market loop.

```sh
npm run -s ae -- <command> [args] [flags]
```

## Canonical Operation commands

| Command | Transport | What it proves |
| --- | --- | --- |
| `npm run -s ae -- manifest` | in-process descriptors | The exact public Operation routes, action schemas, outcomes, recovery contracts, and command vocabulary. |
| `npm run -s ae -- search "<job>" [--limit <1-20>] [--cursor <cursor>] [--filters '<json>']` | `POST /api/v1/market-operations/search` | An anonymous caller can find current Operations for a job and continue with the canonical pagination cursor. |
| `npm run -s ae -- inspect <operationRef>` | `POST /api/v1/market-operations/detail` | One exact current Operation exposes inputs, terms, readiness, and consequences before authentication. |
| `npm run -s ae -- compare <operationRef> [operationRef ...]` | `POST /api/v1/market-operations/compare` | One to four exact references are compared without selecting or authorizing one. |
| `npm run -s ae -- inspect-plan <operationRef> [operationRef ...]` | `POST /api/v1/market-operations/inspect-plan` | One to four exact references are validated as a bounded, non-authorizing composition plan. |
| `npm run -s ae -- connect` | OAuth device flow plus authenticated validation | One owner-approved AE credential is issued, or an existing key is validated by the gateway. |
| `npm run -s ae -- invoke <operationRef> '<json>' --idempotency-key <key>` | `POST /api/v1/operations/call` | One AE key invokes through the canonical gateway with a required body replay identity. `/api/v1/operations/execute` continues to accept the same request. |
| `npm run -s ae -- status <invocationRef>` | `GET /api/v1/operations/<invocationRef>` | The same caller reads durable state, exact refs, usage, evidence, and the typed next action. |
| `npm run -s ae -- recover <invocationRef> '<evidence-json>' --idempotency-key <key>` | `POST /api/v1/operations/<invocationRef>/reconcile` | Evidence-bound reconciliation after a real uncertain outcome; it preserves the same stable identity and does not replay a known result. |

Cold path:

```text
manifest → search → inspect/compare/inspect-plan → connect → invoke → status/recover
```

Search returns the canonical `pagination.nextCursor` and `pagination.hasMore`
fields. When `hasMore` is true, pass that opaque cursor unchanged to a new
search with the same query and filters:

```sh
npm run -s ae -- search "reference lookup" --limit 3 --filters '{"availability":["routeable"]}' --json
npm run -s ae -- search "reference lookup" --limit 3 --cursor '<nextCursor>' --filters '{"availability":["routeable"]}' --json
```

`--filters` accepts the canonical `networkId`, `location`, `effects`,
`dataUse`, `availability`, `currency`, and `maximumPrice` fields. Search and
detail reject malformed successful responses rather than printing them as
trusted Operation evidence.

## Demand commands

Existing demand-side workflows have no root aliases:

```sh
npm run -s ae -- demand ask "<question>" [--thread-id <thread-id>]
npm run -s ae -- demand ask --thread-id <thread-id> --operation-ref <operation-ref> --candidate-digest <digest> '<input-json>'
npm run -s ae -- demand business <slug>
npm run -s ae -- demand discover
npm run -s ae -- demand enrich "<business name>" [--suburb X]
npm run -s ae -- demand import <websiteUrl>
npm run -s ae -- demand journey "<query>"
npm run -s ae -- demand request create "<text>"
npm run -s ae -- demand request get <requestRef>
npm run -s ae -- demand request options <requestRef>
npm run -s ae -- demand request confirm <requestRef> <optionRef>
```

## Advanced/operator commands

Operator and development commands are not part of the root cold path:

```sh
npm run -s ae -- advanced action <id> ['<json>'] [--allow-write]
npm run -s ae -- advanced actions
npm run -s ae -- advanced cancel <invocationRef> --idempotency-key <key>
npm run -s ae -- advanced doctor
npm run -s ae -- advanced eval ...
npm run -s ae -- advanced policy [test|refine|fidelity]
```

## Flags

- `--base-url <url>` targets the server; default `https://agentic-economy-phi.vercel.app` (env `AE_CLI_BASE_URL` or `AE_CANONICAL_BASE_URL`). Anonymous reads may use any valid HTTP(S) override.
- `AE_API_KEY` is the reusable caller credential for `invoke`, `status`, `recover`, and `advanced cancel`.
- `AE_API_KEY_ORIGIN` is required whenever `AE_API_KEY` is used and must be the exact origin of `--base-url`; credentialed requests require HTTPS except loopback `localhost`, `127.0.0.1`, or `::1` HTTP development.
- `--idempotency-key <key>` is required for `invoke`, `recover`, and advanced cancel; the CLI never generates or rotates one, and sends the key only in each request JSON body.
- `--wait` performs bounded invoke polling; timeout preserves the invocation reference and status continuation.
- `--json` emits the canonical result or typed problem envelope without a presentation wrapper; search preserves `pagination.nextCursor` and `pagination.hasMore`.
- `--limit <1-20>`, `--cursor <cursor>`, and `--filters '<json>'` apply only to search. The cursor is opaque and must be reused unchanged with the same query and filters.
- `--technical` adds operation refs, schema, navigation, and fact provenance to human `compare` output; JSON remains exact.
- `--thread-id <id>` lets `demand ask` continue a natural-language conversation in the same thread; the server loads continuation state for a follow-up query.
- `--operation-ref` plus `--candidate-digest` selects an exact operation for automation mode and still requires a JSON input object and `--thread-id`.
- `--allow-write` is required before a non-read-only advanced action runs.
- `--apply` is commit authority for `advanced policy refine`.
- `--help` prints the complete root and grouped vocabulary.

## Authenticated routes

`connect` uses the existing public OAuth registration/device authorization/token
endpoints. If `AE_API_KEY` is already set, it first validates the key against
the configured server only after checking `AE_API_KEY_ORIGIN`; a missing,
malformed, mismatched, or insecure origin is rejected locally before fetch.
With no existing key, connect may start against any valid base URL and its
issued credential output includes both `AE_API_KEY` and the exact
`AE_API_KEY_ORIGIN` to save.

`invoke`, `status`, `recover`, and `advanced cancel` require both
environment variables. AE resolves the provider, endpoint, supplier credential,
price, authority, and evidence server-side. `recover` is evidence-bound
reconciliation after a genuinely uncertain outcome, not replay of a known result.
A pending invoke result is distinct from status/recovery responses; `terminal` is
a status state, not an invoke result. Preserve the canonical invocation
reference, idempotency key, usage, evidence, and next command. `invoke --wait`
may return a status envelope.

## Evidence class

Everything this CLI prints from an HTTP command is **local execution** against
whatever `--base-url` points at. It never proves hosted behavior, provider
fulfilment, or customer value.
