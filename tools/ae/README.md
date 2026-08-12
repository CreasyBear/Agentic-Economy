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
| `npm run -s ae -- search "<job>"` | `POST /api/v1/market-operations/search` | An anonymous caller can find current Operations for a job. |
| `npm run -s ae -- inspect <operationRef>` | `POST /api/v1/market-operations/detail` | One exact current Operation exposes inputs, terms, readiness, and consequences before authentication. |
| `npm run -s ae -- compare <operationRef> <operationRef> [...]` | `POST /api/v1/market-operations/compare` | Exact references are compared without selecting or authorizing one. |
| `npm run -s ae -- connect` | OAuth device flow plus authenticated validation | One owner-approved AE credential is issued, or an existing key is validated by the gateway. |
| `npm run -s ae -- invoke <operationRef> '<json>' --idempotency-key <key>` | `POST /api/v1/operations/execute` | One AE key invokes through the canonical gateway with a required body replay identity. |
| `npm run -s ae -- status <invocationRef>` | `GET /api/v1/operations/<invocationRef>` | The same caller reads durable state, exact refs, usage, evidence, and the typed next action. |
| `npm run -s ae -- recover <invocationRef> '<evidence-json>' --idempotency-key <key>` | `POST /api/v1/operations/<invocationRef>/reconcile` | An uncertain invocation is recovered with canonical evidence and the same stable identity. |

Cold path:

```text
manifest → search → inspect/compare → connect → invoke → status/recover
```

## Demand commands

Existing demand-side workflows have no root aliases:

```sh
npm run -s ae -- demand ask "<question>"
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
- `--json` emits the canonical result or typed problem envelope without a presentation wrapper.
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
price, authority, and evidence server-side. Pending and terminal results
preserve the canonical invocation reference, idempotency key, usage, evidence,
and next command.

## Evidence class

Everything this CLI prints from an HTTP command is **local execution** against
whatever `--base-url` points at. It never proves hosted behavior, provider
fulfilment, or customer value.
