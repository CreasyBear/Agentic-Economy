# AE CLI

Exercise AE the way an external agent would: over the public machine surfaces,
and in-process over the real action registry.

```
npm run -s ae -- <command> [args] [flags]
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

## Market-terminal commands (in-process; live keyless execution, no server)

Built around the `operation.execute` capability-execution seam. The feed catalog
is **fully derived from what is onboard** — never hardcoded. Source of truth is
Convex (`listKeylessExecutable`) when reachable; otherwise it projects the
curated seed through the same admission machinery (`normalizeCapabilityPublication`),
keeping only keyless `http-json:v1` GET operations and excluding x402 listings.
Adding or removing an onboard keyless GET operation changes what the terminal
sees with no CLI edit. Execution returns real provider data where the feed is
keyless-executable.

| Command | What it does |
| --- | --- |
| `manifest [--json]` | Machine-readable self-description: commands, the live feed catalog, the registered-action toolset, and the evidence ceilings. The external-agent handshake (Hermes/Claude/Codex/DeepSeek read this first). |
| `feeds [--json]` | List the onboard keyless data feeds the agentic economy can serve live, with keyless/executable status and provenance. |
| `run <feed-id> [key=value ...]` | Execute an onboard keyless feed live → a verifiable value + `sha256` evidence hash. Fail-closed: keyed/x402/non-HTTPS/invalid-input refuse without a network hit. |
| `compare [--feeds=a,b] [k=v ...]` | Pull the same inputs across several feeds in parallel and table live results side by side. |
| `study "<question>" [k=v ...]` | Research workflow: find relevant feeds, execute them, attribute each finding to a feed + evidence hash, mark unknowns, and refuse honestly when nothing is relevant. |
| `policy [test\|refine\|fidelity]` | Capability-admission governance, modeled on Amazon Bedrock Automated Reasoning policy refinement: `test` runs the suite (VALID/INVALID/TRANSLATION_AMBIGUOUS), `refine` diagnoses failures and proposes rule edits through a **human review gate** (`--apply` is commit authority — the engine only suggests), `fidelity` scores coverage/accuracy/per-rule grounding. |

The policy is persisted to `.ae-cli/policy.json` (defaults to the fail-closed
keyless-only policy when absent).

## Flags

- `--base-url <url>` target server, default `http://127.0.0.1:3000` (env `AE_CLI_BASE_URL`)
- `--json` machine-readable output
- `--allow-write` required before a non read-only action runs
- `--feeds=a,b` feed subset for `compare`
- `--apply` commit authority for `policy refine` (review gate)
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
