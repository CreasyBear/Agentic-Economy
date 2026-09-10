# Well 3 — Environment startup and readiness truth closeout

Requirement (source: `docs/reviews/catalogue-infrastructure-stress.md` §"Proposed next
package", row 1): one documented start path produces a working app, backend, test Account,
connection, spending policy and money dependencies; a diagnostic identifies the first missing
operator or customer action; diagnostics distinguish discovery, quoting and purchase readiness;
test authority and funding are explicit.

Acceptance model (Joel): no Playwright investment. CI proves startup only. Agents use the
product and report papercuts.

## Outcome

Local start path rebuilt and proven live. Agent swarm ran against the live stack: 49 papercuts
found, 26 fixed same day, 23 filed to owning wells. Hosted cutover not deployed — Joel's call.

## Correction (2026-09-10)

The Well 3 live proof listed the seeded sandbox Tool because the seed wrote its readiness observation directly. That was fabricated state; the hourly readiness probe later marked the Tool degraded and the qualifier excluded it. Wells 1+2 removed the seed's readiness write, pointed the Tool at a real in-app counterparty (`/api/v1/sandbox-reference`), and kept the SSRF guard untouched, so on loopback the Tool is not listed by design. Well 3's exit criterion 1 is therefore restated: fresh checkout proves discovery pass, connect, and funding diagnostics; quoting is `skipped` on loopback and provable on a hosted origin.

## What changed

### Launcher (`tools/dev/local-dev.mjs`)

Staged x402-era launcher, own flags separated from Vite passthrough, each stage fails hard with
the exact fix:

- Precedence-aware env: process env beats dotenv files (was inverted); `convex dev` owns
  `.env.local`.
- Effective-URL probe names the stale file on a port mismatch.
- Stages: identities → authority → guarded directory scan → sandbox Tool → Vite → `ae doctor`
  at the end.
- Reuses a running backend instead of restarting it.
- Release identity set from `git rev-parse HEAD`.
- Anonymous-mode Clerk placeholder for a fresh checkout with no Clerk config.
- Local backend startup timeout raised to 180 s default (Convex's own 30 s was too short for a
  grown local database).
- Fix lines are chosen from Convex's own output, not invented.
- Vite v8 ready detection reads through ANSI escape codes.
- Prints the auth mode in use.

### `connect:local`

Buyer and `--provider` modes. Approves through the bypass consent endpoint in
`spending_policy` mode. Refuses Clerk's hosted handshake outright and names the two ways
forward, rather than hanging.

### Seeds (`convex/devSeed.ts`)

- `publishSandboxTool`: calls the real publish command (not a fixture writer) for exactly one
  named sandbox Tool. One price constant feeds both the publication and the catalogue revision
  (previously two stores that could disagree). Readiness is re-asserted every boot. The search
  document is (re)written every boot.
- `seedSandboxSpendingPolicy`: provisions the bypass owner's canonical identity and
  legal-customer binding.
- `ae connect`: creates the canonical agent identity, grant and spending policy in one
  transaction.

### Doctor

Groups checks as discovery / quoting / purchase. `catalogue` and `quote` checks added.
`skipped` never rolls up as `pass`. A funding-only refusal (`insufficient_balance`) is quoting
`warn`, not fail — funding is Well 2. Loopback-aware next commands.

### Gate

One script, `npm run gate` (`test:all` and `gate:release` deleted). Node version guard added on
`dev:local` and `gate`.

### Env contract

`.env.example` is rendered from `src/lib/deployment/manifest.ts` + `convex/convex.config.ts`,
with a drift test in the gate. 27 names present in neither schema are pinned in an Unclassified
section rather than silently dropped.

### CI

- CLI tarball is built at deploy time, not committed; `scripts/test-cli-package.mjs` asserts a
  reproducible pack (two packs, equal digest).
- New `fresh-checkout-proof` job: anonymous backend, `connect:local`, `ae doctor --json`
  uploaded as an artifact; accepts quoting `warn`, fails on any missing/skipped/failed quote
  check.

### Deleted

- `backfillSearchText` (the one-off migration) — hosted rows predating `searchText` must be
  republished, not backfilled.
- `seed:dev` script and its fixture seeder.
- README/AGENTS rewritten: `--base-url` on every local example, freshness stamps added.

## Live proof (this machine, 2026-09-10)

Fresh boot:

| Check | Result |
| --- | --- |
| Convex ready | 5 s (warm) |
| Stages | idempotent (`created: false` on repeat) |
| Directory scan | skipped (catalogue already complete) |
| Vite | ready |
| Doctor | Next → `connect:local` |

After `connect:local`:

| Check | Result |
| --- | --- |
| Connection | `connected`, `spending_policy`, `ready_to_buy` |
| Doctor discovery | pass (origin, server, mcp 4 tools, readiness, release `851e1454…`, catalogue fresh) |
| Doctor quoting | warn (quote reached the funding gate: `insufficient_balance` → `ae fund`) |
| Doctor purchase | warn |
| Search | finds the sandbox Tool |
| Describe | v3, AUD 1.000000 |
| Business page | shows AUD 1.00 |
| `/api/businesses/search?q=sandbox` | returns it |

After the maintenance sweep (`capabilitySupplyProjection:rebuildAllBusinessSupplyProjections`),
`ae-development-provider` is searchable too.

## Gate

`npm run gate` green except `tests/e2e/developer-discovery.spec.ts:33` against the live backend,
caused by legacy businesses lacking search documents. Fixed by the sweep.

Final `npm run gate` (2026-09-10, after the projection sweep and hot-path fix): exit 0. Deployment manifest, env drift check, conformance, anonymous codegen, release integrity, architecture, lint, typecheck, unit 495 files, integration 122 files (1 skipped), types, imports, ts-standards, seo, ui-contract, e2e and a11y against the live local backend, CLI package reproducible, build.

## Deviations from the reviewed plan

- D3 superseded: no Playwright investment; acceptance is the agent swarm.
- D4 C shortcut, then superseded by D9 A (sandbox spending-policy grant through the existing
  issuer).
- Quoting exit criterion restated: a funding-only refusal is quoting `warn`, not fail. Funding
  itself is Well 2.
- T6 renderer imports the manifest's exported constants instead of parsing the file.
- The maintenance sweep drops the programmable-provider skip that the shared publish helper had.
- The publish hot path is bounded, not skipped, for programmable providers.

## Root causes found by real use

- Shared publish helper skipped programmable providers, so x402 providers were never
  searchable. Fixed on the hot path (bounded) plus a maintenance sweep
  (`capabilitySupplyProjection:rebuildAllBusinessSupplyProjections`).
- Two price stores: publication vs. catalogue revision. Now one constant feeds both.
- Registry cursor detector regex never matched Convex's actual message (a sibling 500).
- Redaction placeholders leaked into CLI failure output as literal `"<redacted>"` text.
- `describe`/`compare` mislabelled schema version `v2` while `search` reported `v3` for the same
  tool.
- `convex/convex.config.ts` typed env: none of the 36 names could be marked required.
- `CLERK_JWT_ISSUER_DOMAIN` read via raw `process.env` with a throwing `requiredEnv()`,
  bypassing the typed env contract entirely.
- Dotenv precedence in the launcher was inverted (dotenv beat process env).
- Vite's ready pattern didn't match its actual (ANSI-coded) v8 output.
- Convex's local backend startup timeout (30 s) was too short once the local database had grown.
- The seeded principal id (`clerk_api_key:ak_local_e2e_owner`) could never match the canonical
  `prn_` authority Quote resolves against.

## Swarm findings

6 personas (buyer via CLI, buyer via MCP, developer via HTTP, provider, operator, newcomer
following only README), each filing a structured field report against the live stack. Full
triage: [`well-3-swarm-triage.md`](well-3-swarm-triage.md).

| Severity | Count | Fixed 2026-09-10 | Filed |
| --- | --- | --- | --- |
| P1 | 13 | — | — |
| P2 | 21 | — | — |
| P3 | 15 | — | — |
| **Total** | **49** | **26** | **23** |

Verdicts, verbatim:

- **buyer-cli**: "No — with only discovery commands, this persona could fully understand the
  tool, its exact price (AUD 1.00), and its terms, but could not get any closer to an actual
  purchase than the `insufficient_balance` refusal, and the CLI's own guidance at that exact
  moment (in both human and JSON mode) does not make the real next step (fund via the owner
  browser surface) discoverable without already knowing to run `ae doctor` first."
- **buyer-mcp**: "An agent that reads and follows the server's `initialize.instructions` (not
  just `tools/list`) and already holds a scoped API key could plausibly complete a
  quote-to-call purchase without a human — but an agent that relies on `tools/list` alone would
  never discover that purchasing is possible, and every agent hits an unauthenticated 401 whose
  error shape differs from every other failure mode it will otherwise see from this server."
- **developer-http**: "Yes, I would build on this: the self-description layer (UCP manifest,
  RFC 9727 linkset, RFC 9457 problem envelopes, consistent Tool identity/price across every read
  surface) is unusually mature for a sandbox, and worth the day it would take to route around
  the broken business/service search and the registry-vs-market-tools split before shipping
  anything load-bearing."
- **newcomer**: "For a competent engineer following only README.md and AGENTS.md: confirming
  the stack is healthy takes minutes once you know to add `--base-url`, but the docs' own
  copy-pasteable commands (search/describe/call and even `doctor`) default to the hosted origin
  and fail or silently do the wrong thing as literally written — that trap, plus the zero doc
  guidance on where price logic or route wiring live, means a genuinely new contributor should
  budget 45–75 minutes from a cold clone to landing a first trivial, correct change (e.g., a new
  `/api/v1/*` route returning real price data), most of it spent on jargon absorption and the
  origin-default trap rather than on the actual code change."
- **operator**: "Time-to-diagnosis: under 10 minutes (doctor alone gets there in under 1
  minute; a careful human triple-checking every surface takes ~9), and the single next action it
  names — `ae fund --base-url http://127.0.0.1:3024` — is correct. But the diagnostics would
  only get a tired human there reliably if they knew to skip `/api/ready` and `/status` and go
  straight to `ae doctor`; anyone trusting the two most obvious health-check surfaces first
  would be actively misled for several minutes."
- **provider**: "No — a real business could not self-serve from 'I have an endpoint' to 'it's
  listed and quotable' without an engineer reading the source: the CLI's own first step
  (`supply preview`) cannot be invoked at all, the fee structure is undocumented outside a
  hidden debug flag, and the product surfaces at least five overlapping, unreconciled
  vocabularies for 'is it live yet.'"

## Smells register

Carried from the reviewed plan (§10), plus what real use added:

- 235+ unpushed commits; CI green was ten days stale.
- Committed build artifact hash-gated in the release chain (CLI tarball) — now built at deploy
  time instead.
- e2e passed with no backend; 7/8 specs asserted shell only. Not a validation model.
- Unversioned machine-local pre-commit hook.
- Two env files disagreed on the local Convex port; later file won silently.
- `readiness` said ready while a Quote could not succeed.
- One-off migration (`backfillSearchText`) unwired; seed path skipped `searchText`.
- Plan-recovery agent paraphrased a non-existent finding; verified sources only from here on.
- Launcher forwarded all argv to Vite; `--flags` would crash it.
- `seedOfferingSupply` swept every business despite the invariant stated three lines above it.
- `convex/auth.config.ts` read `CLERK_JWT_ISSUER_DOMAIN` via raw `process.env` with a throwing
  `requiredEnv()`, bypassing the typed env contract.
- Quote resolved canonical agent authority before reading the grant; the pre-seeded local id
  could never match it.
- `.env.example` had 27 names declared in neither schema; now pinned in an Unclassified section
  by the drift test.
- `npm run seed:dev` still exposed the retired fixture seeder (empty list); deleted with this
  closeout.
- Both release journey runners reject `127.0.0.1` and non-HTTPS origins, so the sandbox-capable
  Package 5 runner can never be exercised locally; the 76-check stress exercise left no script
  behind.
- **Sandbox Tool health reads degraded**: the publish path schedules a readiness probe against
  the fixture's unreachable endpoint; only a reseed re-asserts readiness.
- **Duplicated stop-word lists**: `convex/registry.ts:366` vs.
  `src/modules/registry/internal/search-documents.ts`.
- `output/` artefacts are gitignored, so swarm reports live outside history — the triage doc is
  the durable record.
- Pre-commit hook deleted locally (unversioned; not in git history either way).
- This machine's `.env.development.local` sets the Clerk bypass OFF (a legitimate real-Clerk
  setup), so `connect:local` cannot approve here without
  `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`.
- A Vercel OIDC token in the env expired in July; Vite warns on every start.
- `docs/operations/vocabulary-cutover-preflight.md:208` still names `seed:dev`.

## Follow-ons by well

| Well | Follow-on |
| --- | --- |
| Well 2 | Funding step guidance beyond the next command; fee disclosure (10% platform rake is undocumented outside `--technical`); AUD pricing/terms docs. |
| Well 4 | Protected MCP tools invisible in anonymous `tools/list` + 401 shape inconsistent with other failures; two catalogues/pagination idioms (`/api/v1/registry` vs `/api/v1/market-tools/*`); five overlapping status vocabularies for "is it listed"; duplicated stop-word lists; dual price stores (publication vs. catalogue revision); the maintenance sweep as a proper scheduled workload; schema-version families incl. `registry-tools:v1` lineage. |
| Well 6 | `/api/ready` sellability semantics (blanket "ready" with no commercial-capability scope); `/status` and `/owner/supply` are client-hydrated skeletons over curl; provider Quote/Call visibility (aggregate-only earnings today); logs discoverability; glossary/`PRODUCT.md` onboarding for jargon (Tool/Quote/Call/x402 used before definition). |
| Well 5 | Baseline unchanged from Well 0's measurement; no new input from this well. |

See [`well-3-swarm-triage.md`](well-3-swarm-triage.md) for the full per-item routing.

## Hosted cutover runbook

Not deployed. Requires Joel's go — production deploy from unpushed local `main`.

```
1. Deploy code + schema via the project's normal hosted deploy path.

2. npx convex run --prod capabilitySupplyProjection:rebuildAllBusinessSupplyProjections '{}'
   # run once, so hosted business search matches CLI/describe results immediately

3. Set nothing for the sandbox deployment profile — unset is a valid value.

4. Expect ae doctor quoting: warn until the Account is funded (Well 2).
```

## Commits

Range `02101a9b2..HEAD`:

| Commit | Message |
| --- | --- |
| `12e673ff2` | feat: rebuild dev:local as a staged x402-era launcher |
| `bb7bb3f11` | feat: seed one sandbox Tool and the owner-side authority a local Quote needs |
| `4489fa4b1` | feat: group ae doctor into discovery, quoting and purchase with a real Quote check |
| `f50af8f1a` | feat: render .env.example from the two configuration schemas with a drift test |
| `769508248` | feat: one gate script, deploy-time CLI artifact, and a fresh-checkout CI proof |
| `8cf351ae4` | chore: delete the one-off searchText backfill and document the staged start path |
| `1c05107ea` | fix: detect Vite v8 readiness through ANSI codes and absorb the local backend startup timeout |
| `01a904155` | feat: connect:local binds explicit test authority through the local Clerk bypass |
| `1b769f454` | fix: process env beats dotenv files in the launcher, and connect:local names a Clerk-bypass-off server |
| `6b874021c` | fix: a Quote refused only for funding is quoting warn, and CI accepts it |
| `2d008a786` | fix: close the product defects the agent swarm found on the live stack |
| `66b32ef5d` | fix: make the CLI's guidance at the funding wall and on errors actionable |
| `82f56e534` | feat: connect:local --provider binds a provider credential through the local bypass |
