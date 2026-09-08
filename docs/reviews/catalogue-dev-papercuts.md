# Catalogue development QA — 2026-09-08

Scope: current uncommitted catalogue implementation, source contracts, browser exploration and public agent/CLI paths. Existing unrelated work was preserved. No commits or production deployment.

## Development target and evidence

Current worktree ran an isolated local Convex deployment at `http://127.0.0.1:3210` and Vite at `http://127.0.0.1:3025`. The pre-existing development stack on ports 3212/3024 belongs to the other checkout and was not changed. Node v22.22.0 and npm 11.5.1 were used.

`GET /api/ready` returned HTTP 200 with config and Convex ready. Platform workload and local owner identities were provisioned through the existing commands. The dev seed deliberately contains no catalogue fixtures; supply below came from live facilitator discovery. Initial search-text backfill completed (`done: true`, zero existing rows); subsequent publications write searchText as they are admitted. This is fresh-development proof, not an existing-database migration receipt.

Two fresh reviewers independently examined catalogue source and purchase contracts in wave 1. A new wave-2 agent spawn was rejected by the platform thread limit, so the catalogue reviewer performed a separate live HTTP/CLI verification pass while the parent explored the browser. Detailed reports: [source](catalogue-dev-wave1-source.md), [purchase](catalogue-dev-wave1-purchase.md), [live agent contracts](catalogue-dev-wave2-agent-contracts.md).

## Confirmed papercuts and corrections

| Finding | Correction and evidence |
| --- | --- |
| Sensitive search input bypassed existing rejection before Coinbase disclosure | Reused the existing shared input normalizer before native/external dispatch; focused integration regression asserts no SDK request. |
| External discovery ignored AE network filter | Bounded internal publication lookup enforces AE network identity independently of payment chain. |
| Location filter became case sensitive | Shared normalization restores trimmed lowercase comparison. |
| Small Coinbase pages generated unusable cursors | Live SDK rounds offsets to native 20-item boundaries. Adapter now requests that page and preserves position within it. Unit cases cover offsets 1, 19, 20 and a 12-item boundary crossing. Live cursors 1, 19, 20 returned successful pages advancing to 2, 20, 21. An empty admitted page retains continuation. |
| CLI source option was absent; list continuation discarded hard filters | Existing CLI parser and continuation builders now preserve source and filters. Live PayAI command and its emitted continuation both succeeded. |
| Garbage native cursor appeared as a retryable service outage | Convex retains opaque cursor validation; only observed cursor parsing/InvalidCursor failures map to query_invalid. Live public POST list with current source and garbage cursor now returns HTTP 200 unavailable/query_invalid; genuine failures still propagate. |
| Body-only x402 v2 challenge was Quote-admitted but unexecutable | Inspector now follows the pinned SDK header contract; body-only v2 refuses and successful fixtures use the encoded header. |
| Contract tab called the Provider USDC amount the buyer total | Admission material terms now distinguish listed Provider amount from the buyer total confirmed in AUD by a binding Quote. Uses the existing money formatter. |
| Contract copy described catalogue terms as exact authorization | Copy now identifies published terms and says the Quote confirms exact price and authorization. |
| “Balance loading” looked like a loading state | Renamed to “Top-up fee”. |
| “Next 12” promised a count not guaranteed after admission/filtering | Renamed to “Next page”; pagination behavior preserved. |

## Browser journeys exercised

- Home and Discover load live admitted supply with indicative AUD amounts.
- Browse to the second source page; it loads new capability groups with an onward continuation.
- Search for weather through the form; six admitted Tools appeared during this run.
- Open a capability group, inspect its Tool, and switch Overview/Contract.
- Select two weather Tools and compare them; both AUD indicative prices and current unverified health appear.
- Inspect search at 375px and restore desktop. No page-level horizontal overflow. The existing table layout requires horizontal table scrolling to see columns beyond the Tool name on mobile; no mobile redesign was undertaken.
- Browser console had only the deliberately probed nonexistent `/discover` URL's 404; actual Discover links correctly use `/market`.

## Limits

No real paid Provider Call, live custody settlement or Formance accounting transaction was performed. Purchase behavior is exercised through focused source tests with external boundaries controlled. The installed Coinbase SDK does not expose per-request AbortSignal/timeout through its misleading second parameter (it is an idempotency key); this pass did not introduce a global patch or bespoke SDK replacement. Availability and price remain checked per Quote, and production readiness is not claimed.

## Purchase corrections

- Matching consumed-Quote retries resolve the existing Call after current recovery-access checks, even after Quote expiry; they do not perform another Provider inspection.
- The financial preparation snapshot carries the commercial policy digest. Issuance refuses policy drift rather than attributing old tax calculations to a new policy.
- Failed fresh challenges record customer input as released after an HTTP response or unknown after a send exception, independently of payment-not-submitted.
- The inspection action revalidates its target snapshot and live agent authority immediately before sending, using existing authority machinery. Regression tests revoke the credential or withdraw the publication during DNS preparation and assert zero outbound sends.

The database check and HTTP send cannot be atomic. A change after the final checks can still race dispatch. Source changes before the inspection action starts are evaluated against the current authorized Tool; the earlier preparation snapshot is not an immutable network target authorization.

## Verification

- Catalogue normalization: three focused files, 45 tests passed; integration rerun 5/5.
- CLI parsing/continuations: two focused files, 63 tests passed, plus live PayAI continuation.
- Parent `npm exec -- vitest run tests/unit/capability-supply/facilitator-discovery-ingest.test.ts tests/unit/routes/tool-detail-route.test.tsx`: 28 passed.
- Parent `npm exec -- vitest run tests/unit/market/market-page.test.tsx tests/integration/tool-catalog-native-search.test.ts tests/unit/convex/capability-tool-catalog.test.ts`: 28 passed.
- Parent `npm exec -- vitest run tests/integration/facilitator-discovery.test.ts tests/integration/managed-x402-inspection.test.ts tests/unit/capability-supply/x402-committed-request.test.ts --no-file-parallelism`: 13 passed.
- Purchase reviewer: five focused files, 118 tests passed (exact command and typecheck in purchase report).
- `npm run lint`, `npm run check:convex-codegen`, and `git diff --check`: passed. Local backend watcher accepted the changed functions.

Browser evidence retained in `output/catalogue-dev-qa/`: `tool-detail.png` (before terminology correction), `contract-corrected.png` (corrected buyer terms), `search-mobile.png` (375px search). The isolated development environment is left running for exploration.

Final `npm run typecheck`: passed after purchase and SDK fixture corrections. No new dependency, hosted service or public storage schema was introduced by this QA pass.

Final purchase reruns: Quote 12/12, committed-request 5/5, and typecheck passed. Data-release evidence also survives later refusals after the successful unpaid challenge (including signer unavailability).

## x402 directory correction — 2026-09-08

Joel clarified that every x402 endpoint is a Tool. The product charter and domain
vocabulary now state this explicitly. Import/publication records support AE
execution; they no longer determine visibility in the normal web catalogue.

The home preview and default `/market` route now use the installed Coinbase SDK's
native list/search results directly. All source entries remain visible regardless
of AE request-format or payment support. The catalogue preserves upstream counts,
offsets and search partial-results information. Legacy exact-Tool and comparison
links retain their existing behavior. The machine Tool API still uses existing AE
Tool references; this change does not claim raw-directory parity for every agent
surface.

Selecting an endpoint automatically resolves its existing AE Call reference. It
uses the server-retrieved source record, with no Provider probe, manual publishing
step or readiness gate during browsing. `ae call` already performs Quote and Call
within one command. Unsupported inputs or payment profiles remain explicit when
resolution fails; the Tool stays visible.

Path parameters now use the existing HTTP request serializer and official Bazaar
route validation. Discovery reuses the existing schema dereferencer for ordinary
input unions. All 20 captured first-page entries translate successfully; this is
request translation evidence, not proof that every endpoint will deliver.

Live development checks at `http://127.0.0.1:3025/market`:

- First page showed all 20 entries and an upstream total around 14,450 (changing
  during the session). Second page showed positions 21–40, including other
  providers, with native previous/next offsets.
- Weather search displayed all nine source matches in the observed response.
- ENS path endpoint resolved to an AE call command after refreshing the local
  backend; the initial attempt exposed an older deployed importer.
- Seven focused test files passed, 41 tests total: directory read, selection UI,
  resolution, return context, home catalogue, path requests and Bazaar regressions.
- `npm run typecheck`, `npm run lint`, and `git diff --check` passed before the
  final presentation-only endpoint label addition; final typecheck/lint repeated.

No paid Call, AUD top-up, custody settlement or production deployment was made.
The complete AUD-funded purchase remains runtime proof to establish separately.

## Actual CLI Call attempts — 2026-09-08

Scope: exercise real `ae` requests against the isolated development application,
reach the actual refusal, and remove workflow blockers without funding a Call.

Fixed during the run:

- A valid buyer credential was rejected by `ae connect`: the CLI required every
  scope requested at registration, although the approved account correctly exposed
  `market_tools:call`. Buyer validation now requires the actual buyer scope;
  Provider validation still requires its own scope.
- Ordinary connections defaulted to sandbox with no CLI option for the production
  environment used by discovered mainnet Tools. `ae connect --environment
  production` now sends the existing OAuth authorization details through normal
  owner consent. The consent showed production spending disabled by the zero
  default. No spending limit or balance was increased.
- A stale credential's Quote 401 now gives an origin-bound reconnect command.
  An invalid-input refusal now gives an origin-bound `ae describe` command.
- Environment mismatch retains `tool_unsupported` but explains both environments
  and is no longer marked retryable. Commercial-policy refusals preserve the
  underlying configuration reason.

Actual attempts through `npm run --silent ae -- ... --base-url
http://127.0.0.1:3025 --json`:

| Tool | Input | Result after connecting for production |
| --- | --- | --- |
| OneSource ENS | `{"pathParams":{"input":"vitalik.eth"}}` | `commercial_policy_unavailable` |
| OneSource block number | `{}` | `commercial_policy_unavailable`, reason `commercial_policy_missing` |
| OneSource ERC20 balance | Public address plus USDC `contract` address, as specified by `ae describe` | `commercial_policy_unavailable` |

ERC20 initially used `token` instead of required `contract`, producing the correct
`input_invalid` refusal. A further `{}` attempt verified the new executable
`ae describe` continuation. These requests stopped in financial preflight before
Provider inspection, Quote issuance, Call dispatch or payment.

Reproduce the simplest attempt with the saved development connection:

```sh
npm run --silent ae -- call operation:v1:bffd8267d2dc84f9fc38841c574b7904f649786221c7e0f6ef9e9f07a67777ca --input '{}' --base-url http://127.0.0.1:3025 --json
```

For a fresh connection, run `ae connect --environment production --base-url
http://127.0.0.1:3025 --json` and approve the displayed development consent.
This is the local application; no hosted deployment or live financial approval
was changed. Local test credentials are process-bound and need reconnecting after
restarting the development server.

Verification: Call/connection regression files 23/23, Quote handlers 12/12; the
broader CLI run also passed cold-loop and Provider tests (the sole failure was a
new test's incorrect route literal, corrected to the canonical constant).
`npm run typecheck`, `npm run lint`, and `git diff --check` passed.
