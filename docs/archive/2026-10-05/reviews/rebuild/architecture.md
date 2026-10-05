> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Architecture and size

**Date:** 29 September 2026
**Checkout:** `d104a8009`
**Lens:** where ~283k lines and 111 Convex tables go, whether a mature team would build or buy each subsystem, and what a 10× smaller alpha looks like.
**Evidence:** line counts and `defineTable` keys in this checkout. Product intent is `START_LINE.md` and [ADR 0001](../../../../adr/0001-principal-reseller-commercial-topology.md). Deeper readings of the same checkout sit beside this note: [money](money.md), [supply](supply.md), [agent surfaces](agent-surfaces.md), [admin](admin-ops.md), [product](product.md), [process](process.md).

## Answer

The application is **280,743** lines of non-test TypeScript in `src/` and `convex/`, across **2,294** files, and **111** Convex tables. That is the ~283k figure. The generated route tree is another 3,525 lines. In-tree `*.test.*` files are another 13,411. `src/` on its own is about 205k once those tests and the route tree are put back, which is the figure in the [process review](process.md). A separate `tests/` tree is **210,388** lines and is not in the 280,743.

The lines are several products on one Convex deployment. Supply and admission is the largest, at **79,467**. The Call the start line specifies — quote, reserve, pay, capture or hold — is the purchase runtime next to it, at **36,273**. Search is smaller than both.

Alpha keeps Convex, Clerk, Stripe Checkout, Formance as the balance, `@x402` and the Coinbase CDP SDK, Sentry, PostHog, and one machine adapter over the action registry. It does not keep a provider operating system, an OAuth authorization server, a chat product, an admin console, a crawled directory as the way inventory is published, or a Stripe Connect payout company beside an x402 payment that has already happened. Design budget for that shape: on the order of **25–30k** lines and about ten tables. Replacing Convex is not the cut.

## How the lines were counted

Physical lines of `*.ts` and `*.tsx` under `src/` and `convex/`. Excluded: `convex/_generated/**`, `src/routeTree.gen.ts`, and filenames containing `.test.` or `.spec.`. Non-blank lines in that corpus are 263,400. `tools/ae` (the CLI, **7,850** lines, 46 files) is outside the corpus and is counted with adapters.

Each file is assigned once, first match wins:

| Order | Bucket | What matched |
| --- | --- | --- |
| 1 | Admin | `adminConsole`, `components/ae/admin`, `src/lib/operator`, admin routes, `admin-authority` |
| 2 | Observability | `observability`, Sentry, PostHog, health and ready routes |
| 3 | Chat | `modules/chat`, chat Convex modules, chat routes, model gateway |
| 4 | Agent access | `agent-access`, `agentAccess`, `routes/oauth`, OAuth well-known routes, agent-key UI |
| 5 | Money | `modules/money`, `convex/lib/money`, Stripe, Formance, x402 payment attempts, funding routes |
| 6 | Purchase | `capability-execution`, `action-execution`, the provider-consequence journal, call routes |
| 7 | Supply | `capability-supply`, capability contracts, secrets, supply and offerings UI, source-write admission |
| 8 | Registry / search | registry, market, discovery, catalog, decision engine, x402 directory, market UI |
| 9 | Identity | principal account, authority, security, Clerk, settings, interactive session |
| 10 | Adapters | `modules/actions`, MCP host, `src/lib/http`, OpenAPI and `llms.txt` routes |
| 11 | Shell | whatever remains |

`src/components/ae/console` (7,040 lines) is the owner credit and agent console. Its paths do not contain `money` or `agent-access`, so those files were split by name: 4,028 into money, 3,012 into agent access. A few hundred lines could move the other way (billing settings still sit under identity). Tables are the 111 `defineTable` keys under `src/modules/**`, spread by `convex/schema.ts`. Names are unique.

## Where it goes

| Subsystem | Lines | Files | Tables | Alpha |
| --- | ---: | ---: | ---: | --- |
| Supply and admission | 79,467 | 513 | 18 | One endpoint, one payee proof. Not a publisher platform. |
| Purchase runtime | 36,273 | 221 | 9 | Build the Call. Drop the second workflow log. |
| Registry and search | 32,800 | 278 | 21 | A list of tools the buyer can purchase. The Bazaar is already the catalogue. |
| Money | 31,959 | — | 24 | Checkout, Formance, one x402 attempt. No Connect payouts. |
| App shell, site, platform | 29,656 | — | 0 | Keep the kit. The seed shrinks with the schema. |
| Identity and authority | 22,562 | 217 | 24 | Clerk and one account. |
| Agent access and OAuth | 19,896 | — | 7 | One API key. The authorization server can wait. |
| Admin | 12,303 | 152 | 0 own | Convex, Stripe, and Sentry dashboards. |
| Chat | 9,543 | 101 | 3 | Do not ship it for the first purchase. |
| Observability | 3,148 | 47 | 5 | Sentry and PostHog. One audit table for money. |
| Adapter layer in `src/` | 3,136 | 27 | 0 | One projection of the action registry. |
| **Product total** | **280,743** | **2,294** | **111** | |

Money, agent access, and the shell show "—" for files because the console split moves lines without a second file tally. The line totals are the ones that add to 280,743.

The eight subsystems in the brief (registry, supply, money, agent access, chat, admin, adapters, observability) are **192,252** lines. Purchase, identity, and the shell are the other **88,491**.

`src/lib/server` plus `src/routes` is **19,304** lines of HTTP. Most of it was counted with its domain (agent access 3,464, money 3,142, purchase 1,760, registry 1,134). The 3,136-line adapter bucket is the shared registry, the MCP host, and the protocol edges. The CLI is a third client on top.

## Supply and admission — 79,467 lines, 18 tables

**Build a payee binding for one endpoint. Buy nothing here, and do not build the rest yet.**

`src/modules/capability-supply` is 38,520 lines. `convex/lib/capabilitySupply` is 20,343. Supply and offerings UI is about 10,700. The module's mass is a provider funnel, route and transport projection, x402 seller onboarding, publication, CDP seller wiring, OpenAPI import, eligibility, and a tool ledger. Convex adds connections, attempts, an owner funnel, canary funding, probes, offboarding, and staging drafts.

Tables: 13 supply tables (`capabilityPublications`, `capabilitySupplyAdmissionCases`, `capabilityProviderConnections`, `capabilityProviderConnectionAttempts`, `capabilityProviderConnectionLeases`, `capabilitySupplySourceDrafts`, `capabilityProviderApprovals`, offboarding cases and targets, offerings, transport bindings, tool projections, `registeredToolMappings`), plus `capabilityContractDocuments`, three secret tables, and `businesses`.

The [supply review](supply.md) is the product reading: the Coinbase Bazaar already lists on the order of 15–23k x402 resources, and buyer search already reads that directory. Publication is a different job — attach an Australian business and a payee to one endpoint Agentic Economy can resell. The owner form makes that job carry four source types, drafts, and a canary machine. Alpha's supply flow is: paste one x402 URL, prove control of `payTo` with the signature the 402 cannot provide, and publish that one tool. OpenAPI, MCP, Agent Plugin, connection OAuth, offboarding graphs, and a secret lifecycle journal are the self-serve platform. A vault or the host secret store holds the one credential that is not an x402 wallet.

## Purchase runtime — 36,273 lines, 9 tables

**Build this. It is the product. Borrow Convex workflow for durability.**

Capability execution, module plus `convex/lib/capabilityExecution`, is about 25k lines. Action execution is another 6,619. Recovery is about 4,600. Quote and procure are about 3,300. The provider-consequence journal is about 2,300. Call and activity UI is about 2,100.

Tables: `capabilityQuotes`, `capabilityCalls`, `capabilityCallProjections`, `purchaseResolutionRecords`, `providerConsequenceJournal`, `sellerOnboardingCanaryRearmAudits`, and `actionExecutionControls`, `actionExecutionAttempts`, `actionExecutionHistory`.

This is the merchant-of-record Call from [ADR 0001](../../../../adr/0001-principal-reseller-commercial-topology.md) and `START_LINE.md`: bind a quote to an x402 challenge, reserve AUD before any signature, pay once from the corporate wallet, capture or release, and refuse a blind retry when the outcome is unknown. Stripe does not do that. The x402 SDK does not do that.

The repo already depends on `@convex-dev/workflow` and `@convex-dev/workpool`. The three `actionExecution*` tables are a second attempt log. Procure and the seller-onboarding canary audit are outside the one-tool proof. Keep quote, call, one consequence ticket, and an explicit unknown state.

## Money — 31,959 lines, 24 tables

**Buy Stripe Checkout. Borrow Formance for the balance. Borrow `@x402` and CDP for the payment. The Connect payout machine is a second company.**

The [money review](money.md) is the authority on the spine. The customer buys a closed-loop AUD balance. Formance Ledger (schema v1.4.0, 14 templates) is the balance; Convex displays it. One Formance bulk reserves buyer AUD, commits treasury USDC, and accrues a provider obligation marked `ineligible_x402` before anything is signed. x402 on Base then pays the provider. Stripe Checkout only creates the credit, and only from a verified webhook.

`src/modules/money` is 10,226 lines, including the Formance client against the vendored SDK (`@formance/formance-sdk`). `convex/lib/money` is 10,484 lines of commands, projections, and rails. The largest Convex money directories are funding (2,191), x402 payment attempts (1,985), Stripe Connect (907), documents (779), and managed-call booking (732).

The money schema has **24** `defineTable` keys. The money review's list of 23 omits `moneyX402PaymentAttempts`, which is in the same object. The 24:

| Rail | Tables |
| --- | --- |
| Credit commands and caps | `moneyFundingCommands`, `moneyLegalCustomerBindings`, `moneyAutoRechargeSettings`, `moneyMonthlySpendBudgets`, `agentSpendingPeriods`, `moneySupplierPreferences`, `moneyUsageEvents`, `moneyReconciliationCases` |
| Policy and the rate observation | `moneyCommercialPolicies`, `moneyReferenceRates` |
| Stripe customer | `moneyStripeCustomerBindings`, `moneyCustomerTaxFacts`, `moneyStripeWebhookInbox`, `moneyStripeEvents` |
| Documents | `moneyDocuments`, `moneyDocumentSnapshotPages` |
| The x402 attempt | `moneyX402PaymentAttempts` |
| Treasury observation | `moneyTreasuryObservations` |
| A fiat payout path the Call never enters | `moneyProviderObligations`, `qualifiedUseReceipts`, `moneyConnectAccountCommands`, `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations` |

Stripe, `@x402/core`, `@x402/evm`, `@x402/extensions`, `@coinbase/cdp-sdk`, and `viem` are already dependencies. The attempt record is the commercial state machine those libraries do not own: one corporate payment, joined to one AUD hold, with an unknown outcome that stays unknown. That record is worth building.

Alpha money is Checkout, the Formance reserve/capture/release scripts, the rate observation, and `moneyX402PaymentAttempts`. Auto-recharge, monthly fences, tax-invoice issuance, saved-card portal, and the six payout tables are the surplus the money review tells the rebuild to drop. The owner console repeats the surplus in UI (credit top-up, auto-recharge, monthly ceiling): 4,028 of the lines in this bucket.

## Identity and authority — 22,562 lines, 24 tables

**Buy Clerk. One account row is the workspace.**

Clerk is already integrated (`@clerk/backend`, `@clerk/tanstack-react-start`). Beside it: principal-account resolution (about 5,500 lines under `convex/lib/principalAccount`), authority (3,259 in `src/modules/authority`), and the security module that is not admin-authority.

Principal-account tables (13): `principals`, `credentials`, `accounts`, `accountOwnerships`, `memberships`, `externalIdentityBindings`, `accountExternalOrganizationBindings`, `interactiveSessionSelections`, `interactiveOnboardingCompletions`, `accountSecurityPolicies`, `userNotificationPreferences`, `notificationDeliveries`, `principalNotificationEmails`.

Authority tables (6): `authorityDelegationGrants`, `authorityDelegationSnapshots`, `authorityDelegationSnapshotAncestors`, `consequenceProofUses`, `recoveryBreakGlassApprovals`, `recoveryBreakGlassAdmissions`.

Security tables (5), shared with admin: `adminMemberships`, `adminApprovalProposals`, `adminMembershipAuditEvents`, `disputes`, `sourceWriteNonces`.

Delegation snapshots, break-glass recovery, and notification delivery are a multi-tenant IAM product. Alpha is one Australian business, one Clerk organization, and one prepaid account. Agent spend limits are fields on the key, enforced again at the reservation, which the Call already has to do.

## Agent access and the OAuth server — 19,896 lines, 7 tables

**Build a hashed API key. Borrow an authorization server later, if a harness cannot hold a key.**

Tables: `agentAccessPrincipals`, `agentAccessGrants`, `agentAccessProviderRevocations`, `agentAccessOAuthClients`, `agentAccessOAuthGrants`, `agentAccessOAuthRefreshFamilies`, `agentAccessOAuthRefreshTokens`.

Files with `oauth` in the path are **5,907** lines of this bucket. Routes: `oauth.authorize`, `oauth.token`, `oauth.device_authorization`, `oauth.register`, `oauth.revoke`, and the two OAuth well-known documents. `src/lib/server/agent-access-oauth/protocol.ts` parses authorization-code and device-code grants, including authorization details that carry per-call, daily, and monthly spend. `oauth4webapi` is a protocol library. The server, refresh families, and dynamic client registration are local. The CLI `connect` command (408 lines) exists to drive the device flow.

`START_LINE.md` asks for a replaceable credential that resolves the customer, the account, and the spending policy without the agent passing an `accountRef`. A hashed bearer key issued in the owner UI does that. Device-code OAuth is the right follow-on for harnesses that expect it, and then the team borrows an authorization server instead of owning refresh-token reuse. The [agent-surfaces review](agent-surfaces.md) shows the other half of this surface: HTTP, MCP, and CLI already disagree on names. Adding a custom OAuth dialect makes a fourth spelling.

The rest of the bucket is grants, sandbox versus production policy, and agent UI, including the connect-agent wizard.

## Registry and search — 32,800 lines, 21 tables

**Build the list of tools this business can buy. Borrow the Bazaar for browsing. Borrow a search index only when the admitted list needs one.**

`src/modules/registry` is 5,651 lines. Market is 4,848, discovery 4,619, catalog about 3,500 across the module and `convex/lib/catalog`, the Jev decision engine 698, market UI and the command panel about 6,100. `convex/lib/market` is 2,917.

Tables: `registrySearchDocuments`; three catalogue tables (`businessOfferings`, `businessOfferingRevisions`, `offeringAccessPaths`); `marketDemandSignals`; and 16 market tables. Most of the 16 are a stored external directory and a flow tape: generation state, entries, search rows, facets, category stats, evidence, categories, ratings, active tools, active providers, and four `marketFlow*` tables. `marketSavedTools` is the other one.

Ranking is lexical, then an optional rerank through `@typesafe-ai/sdk` (`src/modules/registry/tool-reranker.ts`). The CLI's `--source` flag offers `current`, `coinbase`, or `payai`. The [supply review](supply.md) records that native directory pages are observations: admission does not control their visibility. That split is correct. Persisting generations, facets, and category stats is how a directory browser becomes a schema. Alpha search returns one to three candidates the buyer can actually purchase, which is the start line's 3 KB budget. A filter on one `tools` table does that. Typesense or Meilisearch is the borrow once admitted inventory is large. Jev, saved tools, demand signals, and the flow tape are not that filter.

## Chat — 9,543 lines, 3 tables

**Borrow the model SDK. Do not ship a chat product in front of the first purchase.**

Tables: `chatThreads`, `chatTurns`, `chatThreadShares`. Generation uses `@convex-dev/agent` and the Vercel AI SDK through `modules/model-gateway` (OpenRouter, default `deepseek/deepseek-v4-flash`). UI is 3,453 lines in `components/ae/chat`, plus a CLI chat command and anonymous chat on the Convex HTTP router.

`ai`, the OpenRouter provider, and the Convex agent component are the purchased parts, and they are small. Threads, shares, anonymous sessions, and generative UI are a human assistant. The day-one job in the [product review](product.md) is an agent the business already uses. That agent speaks MCP, not `chatTurns`.

## Admin — 12,303 lines, no tables of its own

**Operate from the dashboards. Keep two audited writes.**

This pass counts 12,303 lines because it includes `src/lib/operator` and admin-authority. The [admin review](admin-ops.md) measures the console itself at about 11,000 production lines, plus about 4,800 lines of tests: twelve pages, a metrics warehouse, a dual-control inbox, and a command sheet. `components/ae/admin` is 5,763 lines in this count. `convex/lib/adminConsole` is 3,283. Admin identity reuses `adminMemberships` and the proposal and audit tables under security.

Alpha needs the writes that bind a human decision to a publication digest (source-authority verification, suppress / unsuppress), and an audit row when they happen. Checkout, webhook delivery, function logs, and uncaught errors already have homes: Stripe, Convex, Sentry. Custody top-up is the CDP console. The browsers, the investor metrics, and the approval inbox are an internal product.

## Observability — 3,148 lines, 5 tables

**Buy Sentry and PostHog. One audit table when money moves.**

`src/lib/observability` (1,651) wires `@sentry/node`, `@sentry/react`, `posthog-node`, and `posthog-js`. `modules/observability` (558) adds `auditEvents`, `operationKeys`, `marketplaceMetricDays`, `marketplaceMetricBuilds`, and `marketplaceEntityDays`.

Error reporting and product analytics are bought. An append-only audit of funding and Call commands is worth keeping, because replay without a second credit is part of the proof. Daily marketplace rollups are a warehouse. Alpha does not have the volume.

## CLI, MCP, and HTTP — 3,136 in `src/`, plus 7,850 of CLI

**Keep the action registry. Ship one public shape.**

`src/modules/actions` (1,085 lines) is the right seam: one action id, one Zod input, one `run`. `src/lib/server/mcp-api.ts` (about 870 lines) hosts it on `@modelcontextprotocol/sdk` at `/mcp`. MCP tool names are the only mechanical projection (`ae_` plus the action id). The [agent-surfaces review](agent-surfaces.md) shows HTTP paths and CLI verbs as two further hand-written vocabularies, and the CLI as an HTTP client with its own command manifest (693 lines in `tools/ae/commands/manifest.ts`). `tools/ae` overall is 7,850 lines: argument parsing, journey continuation, a call-recovery journal, chat, supply management, saved tools, and market requests. `packages/cli` is a package shell around that program.

Alpha's public shape is the registry projected once. MCP is the one that matches "an agent the business already uses." HTTP can be the same actions if a client cannot speak MCP. The CLI becomes a thin generated client later, the way the Stripe CLI is generated from one API, or it waits. `curl` against four routes is enough to prove the start line.

Also outside this corpus: `tools/dev` is 12,725 lines and `tools/release` is 8,091. They track the same subsystems. They shrink when the subsystems do.

## App shell and platform — 29,656 lines

What remains after the owner console moved to money and agent access:

| Piece | Lines | Notes |
| --- | ---: | --- |
| Shared server helpers | 3,209 | Convex access, readiness, exports |
| UI helpers | 2,888 | presentation and contract scans |
| Layout | 2,813 | app chrome |
| Routes not claimed above | 1,792 | marketing and business pages |
| Website | 1,771 | public site |
| Dev seed | 1,719 | `convex/lib/dev` |
| `modules/common` | 1,299 | ids, digests, search text |
| Platform crons | 979 | `convex/lib/platform` |
| Deployment manifest | 833 | `src/lib/deployment` |
| Component kit | ~4,800 | `src/components/ui` |

The kit and the marketing pages are ordinary, and they are already built. The [product review](product.md) is why the information architecture still fails: `/` opens the catalogue, and Market, For agents, and For providers have equal rank, while fund, authorise, and the receipt are not the primary path. That is a navigation cut, not a reason to keep 30k of shell. The dev seed and the deployment manifest are large because the schema they describe is large.

## Build, borrow, or buy

| Concern | Already depended on | What was built beside it | Alpha |
| --- | --- | --- | --- |
| Database and functions | Convex | 111 tables, a custom attempt log, custom crons | Keep Convex. About ten tables. |
| Human login | Clerk | Principals, memberships, delegation, break-glass | Clerk and one account. |
| Agent credential | `oauth4webapi` (a library) | An OAuth server, refresh families, dynamic registration | One hashed API key. |
| Card funding | `stripe` | Checkout, portal, tax facts, Connect, payouts | Checkout and one webhook. |
| Balances | Vendored Formance SDK | 24 Convex money tables, six of them a payout product | Formance stays the book. Drop Connect. |
| Provider payment | `@x402/*`, CDP SDK, `viem` | Attempt record, seller onboarding, canaries | SDKs plus one attempt row. |
| Model calls | `ai`, OpenRouter, `@convex-dev/agent` | Threads, shares, anonymous chat | Leave the SDK. Skip chat. |
| Finding tools | Coinbase directory APIs, `@typesafe-ai/sdk` | Stored generations, facets, flow tape, Jev rerank | Read the Bazaar live. Filter admitted tools locally. |
| Machine API | MCP SDK, the action registry | A second HTTP vocabulary and a 7,850-line CLI | One projection of the registry. |
| Errors and funnels | Sentry, PostHog | Five observability tables | Both vendors. One money audit table. |
| Durable work | `@convex-dev/workflow`, workpool | `actionExecution*` | The Convex components. |
| Provider secrets | — | Pointer, command, and lifecycle journal | The host secret store, plus the payee signature. |

The local half is justified where it knows something the vendor does not: AUD credit is not USDC, the hold precedes the signature, and an unknown Call is not a new Call. The local half is not justified where it repeats Connect, OAuth, chat, directory storage, or a second workflow engine.

## A 10× alpha

```
Clerk session     owner: top up, paste one x402 URL, prove payTo, copy an API key
API key           MCP: search, quote, call, status
                       │
                       ▼
                    Convex
                    account, apiKey, tool, quote, call,
                    fundingCommand, stripeEvent, x402Attempt, auditEvent
                       │
         ┌─────────────┼──────────────┐
         ▼             ▼              ▼
  Stripe Checkout   Formance      @x402 + CDP
  AUD top-up        the balances  corporate USDC to the provider
```

About ten tables. One public machine shape. Formance remains the balance, as the money review describes it, so Convex does not grow a second set of available/held/spent numbers.

| Leave out of alpha | Lines in this map | Why it can wait |
| --- | ---: | --- |
| Publisher platform beyond one URL and a payee proof | most of 79,467 | The Bazaar is the inventory. Resale needs one binding. |
| Directory warehouse, facets, flow tape, Jev | most of 32,800 | Search is one to three tools the buyer can purchase. |
| Connect, payouts, auto-recharge, tax invoices, extra caps | the surplus inside 31,959 | Checkout and Formance are the funding proof. |
| Identity beyond Clerk and one account | most of 22,562 | One business, no delegation chain. |
| OAuth server | ~5,900 named, inside 19,896 | A bearer key is the credential. |
| Admin browsers and metrics | most of 12,303 | Stripe, Convex, Sentry, CDP. |
| Chat | 9,543 | The buyer's agent already has a harness. |
| CLI as a third vocabulary | 7,850 | MCP covers the proof. |
| `actionExecution*` beside Convex workflow | ~6,600 | The workflow component is already a dependency. |
| Metric rollups | most of 3,148 | Sentry and PostHog are wired. |

The design budget for what remains is **25–30k** lines: the Call and its unknown-outcome path, the Formance reserve and capture, a Checkout webhook, one x402 attempt, one tool row, a payee signature, and an MCP adapter over the action registry. That is about a tenth of 280,743. It is a budget for a rewrite, not a subset of today's files. Today's purchase runtime is already 36k because recovery, procure, canaries, and a second attempt log grew up inside the Call.

`src/modules/module-boundaries.ts` already draws a platform: discovery depends on registry, supply, execution, agent access, money, market, and SEO. Alpha has three modules — catalogue, call, money — and one adapter. The arrow worth keeping is the one in that file's header: execution depends on supply and money, and money does not depend on chat.

## What the cut must not lose

The buyer's AUD and the provider's USDC stay separate legs. The reservation posts before the signature. An unknown outcome does not offer a fresh `tool.call`. The same idempotency key replays the same credit, the same x402 payment, and the same charge. Those rules are why the Call is built in-house.

Convex stays. The schema is wide; the platform is the right place for functions, schedules, and Clerk. Moving 111 concepts to Postgres would keep the architecture and change the database.

The action registry stays the only public machine contract. Search, quote, call, and status are four actions. Supply management, saved tools, market requests, and chat turns are how the surface grew a 7,850-line CLI.

The `tests/` tree will not survive a cut that the product does not. Supply unit tests alone are 26,373 lines, and `tests/unit/convex` is 39,517. Keeping the suite while deleting the subsystems preserves the size this map is trying to explain.
