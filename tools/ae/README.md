# AE CLI

Exercise AE the way an external agent would: over the public machine surfaces,
and in-process over the real action registry.

```
npm run ae -- <command> [args] [flags]
```

## Commands

| Command | Transport | What it proves |
| --- | --- | --- |
| `search <query> [--location X] [--mode near_me\|whole_catalogue]` | `GET /api/businesses/search` | A cold caller can find published businesses. |
| `business <slug>` | `GET /api/businesses/<slug>` | The detail record carries a service and a what-to-do-now path. |
| `discover` | discovery + request-contract schemas | What a caller can learn without a human. |
| `import <websiteUrl>` | `POST /api/storefront/import-draft` | Website import drafts facts and keeps them unconfirmed. |
| `enrich "<name>" [--suburb X]` | `POST /api/storefront/enrich` | One web-search-grounded call drafts a profile with source URLs. |
| `ask "<question>"` | `POST /api/answer/turn` (SSE) | The answer surface responds. |
| `request create\|get\|options\|confirm` | `/api/v1/requests` lifecycle | The authority boundary is legible from the refusal itself. |
| `actions` | in-process | Every registered action with its declared surfaces and contract. |
| `action <id> ['<json>']` | in-process | Generic dispatch by name; no server, no per-action code. |
| `journey "<query>"` | chained HTTP | Whether each next call is derivable from the previous body. |

## Flags

- `--base-url <url>` target server, default `http://127.0.0.1:3000` (env `AE_CLI_BASE_URL`)
- `--json` machine-readable output
- `--allow-write` required before a non read-only action runs
- `--help`

## Write safety

`ae action` refuses any action whose `readOnly` is false unless `--allow-write`
is passed, and prints the action's declared boundaries, consequence class, and
authority requirement before it runs anything.

## Authenticated routes

`enrich` (and `import`) are Clerk gated because they spend real budget. Against
a plain local server they return `401`. For local testing only, set
`VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` (see
`src/lib/server/local-e2e-bypass.ts`, which throws if the flag is set while
`NODE_ENV=production`). `enrich` also needs `OPENROUTER_API_KEY` on the server;
without it the route returns a discriminated `unavailable` result rather than
failing.

## Evidence class

Everything this CLI prints from an HTTP command is **local execution** against
whatever `--base-url` points at. It never proves hosted behavior, provider
fulfilment, or customer value.
