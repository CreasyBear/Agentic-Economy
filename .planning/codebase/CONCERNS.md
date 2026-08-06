# Concerns
**Analysis Date:** 2026-08-06

Frank, evidence-backed assessment of what could bite the Agentic-Economy codebase. Every finding cites the current on-disk file. Severity: **High / Medium / Low** + one-line impact. This document maps the **dirty working tree** (in-flight admission/engine/AI-SDK work), not the last commit.

---

## Technical Debt

- **[Medium] Raw environment-key custody for provider + payment credentials.** Credentials are stored in the DB as `env:NAME` refs and resolved straight from `process.env` on demand, with no vault/KMS, no encryption at rest, and no rotation envelope. Call sites: `convex/capabilitySupplyReadiness.ts:90-96`, `convex/customerRequestRouteTransportWorker.ts` (`credentialFromEnvironment`, reads `process.env` by `env:NAME`), `convex/customerRequestV2PreparationEgressActionPorts.ts`, `convex/customerRequestRouteCancellationWorker.ts:94-96`. Because the ref parser is `/^env:([A-Z][A-Z0-9_]{1,199})$/`, **any** stored ref can name **any** reachable env var — including `AE_CONVEX_SERVER_FUNCTION_TOKEN` or the x402 private key — which can then be shipped as a provider credential. The control plane is only by convention, not structural.
- **[Medium] x402 EVM signing key custodied as a plain env var.** `src/modules/capability-supply/internal/x402-payment-signer.ts` (`createEvmX402PaymentSignature`) treats `request.credential` as a raw `0x` + 64-hex private key (`privateKeyToAccount`). It is signed server-side in a Convex action (`convex/customerRequestRouteTransportWorker.ts`) and never persisted to a document (only the `credentialRef` name is) — but it is a long-lived EOA key in `process.env`, not a rotation-capable or scoped custody primitive.
- **[Medium] Node runtime source-vs-project discrepancy.** `package.json` `engines` declare `node >=22` and `vite.config.ts:64` pins the Nitro/Vercel functions runtime to `nodejs22.x`, while `.vercel/project.json` sets `nodeVersion: "24.x"` and `@types/node` is `24.10.2`. Runtime drift between what is tested (22) and what Vercel deploys (24) is a latent production risk.
- **[Medium] Nightly-pinned build dependency.** `devDependency "nitro": "npm:nitro-nightly@^3.0.1-20260628-090458-3df69609"` — a nightly alias pinned to a dated build, used as the Vercel adapter. Nightly provenance is a supply-chain/upgrade churn risk.
- **[Medium] Quarantined-by-convention node-only dependency.** `src/modules/capability-supply/internal/schema-deref.ts` imports `@apidevtools/json-schema-ref-parser`, which **cannot** be bundled into the convex-reachable graph (esbuild can't resolve `path/util`). The isolation is enforced by import-boundary convention (`admit_schema_deref_unavailable` refusal for convex callers), not structurally — a stray import reintroduces the Convex codegen failure.
- **[Low] Duplicated browser-guest session primitive.** `src/lib/server/browser-guest-session.ts` documents that a second `/api/requests`-scoped cookie in `customer-request-browser-api.ts` "should be rewired onto this primitive rather than a third copy being written." Third-copy drift risk.
- **[Low] Cross-table status-model mismatch risk.** `convex/capabilitySupply.ts` (owner funnel) filters `capabilityOfferings` by status `active`, while `businessOfferings` statuses are `draft|published|paused|retired` — a prior bug where the funnel read "No services yet" came from filtering on the nonexistent `active`. Fragile string-literal coupling between two tables.
- **[Low] Deliberate legacy-data tolerance.** `convex/capabilitySupplyProjection.ts` intentionally "keep[s] malformed legacy data for the strict public reader to reject," and `convex/action-invocation/internal/convex-schema.ts` + `durable-contracts.ts` carry `@deprecated` legacy-only fields (`message`, `acceptedAuthority`) still present in the durable schema. `convex/migrations.ts` backfills legacy `capabilityPublication` rows lacking `operationRef`/`sourceRevision`/`publisherRef`/`authorityMode`/`provenanceDigest`.
- **[Low] Scratch/debug files at repo root (uncommitted).** `__repro.mts`, `__detail_live.mts` (uses `type D = any`), and `playwright.answer-smoke.temp.config.ts` are untracked debug artifacts that should not ship; `src/routeTree.gen.ts` is generated `@ts-nocheck`/`eslint-disable`/`as any` noise (expected, not authored debt).
- **[Low] Two-phase session cookie.** `customer-request-browser-api.ts` uses a second copy of the guest-session cookie while a canonical `src/lib/server/browser-guest-session.ts` exists (see duplicate primitive above); consolidation reduces session-auth surface.
- **[Low] Stale documentation references.** `AGENTS.md` references `PAPERCUTS.md` via a `papercut` command and `STATE.md` references `PROJECT.md`, but neither file exists on disk (missing target).

---

## Known Bugs

- **[Medium] Readiness probe forwards non-public credentials — including the x402 EVM signing key — as a Bearer token.** `src/modules/capability-supply/internal/readiness-probe.ts` `probeRequest()` sets `Authorization: Bearer ${credential}` for any non-`PUBLIC_CREDENTIAL_REF` credential, and x402 probes pass the resolved credential in. This is the documented #1 open action item in `.planning/research/2026-08-02-agentic-market-executable-capability-evaluation.md`; **any key that passed through the readiness path should be treated as disclosed and rotated.** Severity Medium (no production keys were confirmed deployed as of this analysis).
- **[Medium] Fails-open on missing model key.** `src/modules/model-gateway/public.ts` `openRouterGatewayConfig` reads `OPENROUTER_API_KEY` and **omits `apiKey` (fails open)** when the value is missing/empty — a degraded, hard-to-observe runtime path rather than an explicit config error.
- **[Low] Non-constant-time secret comparison.** `convex/notificationOutbox.ts:901-911` `requireNotificationSystemAccess` compares `systemKey !== expected` with plain string equality against `AE_NOTIFICATION_OUTBOX_SECRET` (not a constant-time compare). Low exploitability (HMAC-style brute force is impractical) but inconsistent with the constant-time pattern used elsewhere (e.g. source-write admission).
- **[Low] Answer-turn rate limit not yet wired across the full thread write surface.** Only 8 named rate-limit buckets exist (`convex/rateLimit.ts`); answer/thread and catalog-offering mutations rely on `requireSourceWrite` + authz and are **not** pattern-limited (see Performance).
- **[Low] Prior fixed bug worth guarding:** owner funnel previously read "No services yet" from filtering on a nonexistent `active` status (`convex/capabilitySupply.ts`) — regression risk on the `capabilityOffering`/`businessOffering` status vocabularies.

---

## Security Concerns

- **Authz is a two-tier model; the weaker consumer tier authenticates purely from client-supplied identifiers.**
  - **[High] Arg-derived authorization on public money-ledger reads.** `convex/moneyLedger.ts` public queries (`readCreditAccount`, `listCreditActivity`, `readKeyUsage`) authorize from a client-supplied `principalId` arg (`ownerPrincipalAllowed`/`principalAllowed`), which also accepts a `clerk_api_key:<tokenIdentifier>` identity string. Reads keyed only by a caller-asserted identifier — anyone who guesses/observes a `principalId` can read that account's credit activity. The `charge`/`topup` mutations do check `getUserIdentity`, but the read surface is arg-derived.
  - **[High] Answer threads keyed by client-supplied session id.** `convex/answerThreads.ts` exposes `getPublicThreadProjection` as an **unauthenticated public `queryGeneric` keyed only by `threadId`**, and read/write paths (`getThreadTurns`, `getAnswerThread`, `readTurnToolCalls`, `listSessionThreads`) use a client-supplied `pseudonymousSessionId` as the sole ownership credential — no `requireIdentity`. Ownership is whatever the caller claims, and the threadId-keyed projection is reachable by anyone with the id (a deploy-smoke zigzag endpoint in `src/lib/server/`).
  - **[Medium] Bootstrap owner admin is powerful and hard-coded.** `convex/security.ts` `bootstrapOwnerAdmin` gates on `requireSourceWrite` plus a hard-coded `bootstrapPrincipalIds()` clerk-user allow-list; `grantAdminMembership`/`revoke` are gated by `resolveAdminAuthority`. The bootstrap root is inherently powerful; a leaked source-write secret or a tampered allow-list yields owner authority.
- **[High] Readiness probe credential disclosure (see Known Bugs).** Credentials (incl. x402 signing key) transmitted as Bearer to a provider-controlled endpoint during probing. Rotate anything that traversed the readiness path.
- **[Medium] Raw `env:NAME` credential indirection is a secret-addressability hole.** Because refs name arbitrary env vars, a compromised/abused admission path could resolve *unrelated* secrets (`AE_CONVEX_SERVER_FUNCTION_TOKEN`, `OPENROUTER_API_KEY`, outbox secret) as provider credentials. The `env:NAME` parser should be restricted to a designed credential namespace.
- **[Medium] Raw env-var custody, no vault/KMS, no rotation envelope** for provider keys, outbox secret, route-call signing secret, and x402 key (see Technical Debt). No real secrets were found committed in source (cred-like strings are fake test constants; `.env.example` is empty placeholders) — the risk is custody/rotation, not leakage.
- **[Low] Non-constant-time outbox-secret compare** (`convex/notificationOutbox.ts`).
- **Strengths worth preserving (not concerns):** source-write admission (`src/modules/security/source-write-admission.ts` + `convex/sourceWriteAdmission.ts`) uses scoped HMAC key families, constant-time compare, HKDF-derived non-prod keys, rejects `VITE_`-prefixed and provider-secret reuse, is production fail-closed, and defends replay via one-time nonces with 5m expiry + cleanup cron. Webhook bodies are byte-bounded and signature-verified (Resend via Svix HMAC in `src/lib/server/notification-provider.ts`; Stripe in `src/modules/money/internal/stripe-webhook.ts`). Admin surfaces gate on `resolveAdminAuthority` (`convex/authz.ts`, `src/modules/security/public.ts`), and the NL engine treats model output as untrusted through the deterministic eligibility gate (`src/modules/customer-request/application/interpret-compile/eligibility.ts`).

---

## Performance Issues

- **[Medium] N+1 fan-out in the public offering search query.** `convex/registry.ts` `searchPublicBusinessOfferingSupply` (lines 143-203) does up to 100 candidate slug lookups (`SEARCH_HYDRATION_BUSINESS_LIMIT=100`) then up to 100 `readOfferingSupplyForBusiness` calls, each with its own suppression check + snapshot read — a single public query can touch ~200+ docs. If the search index has no matches it falls back to a whole-ish `registrySearchDocuments` `.take(250)` + in-memory filter. **Not rate-limited.**
- **[Medium] Whole-state diff-and-writeback in the projection rebuild.** `convex/capabilitySupplyProjection.ts` (~144-160) reads all existing `registrySearchDocuments` for a business and `Promise.all`-deletes stale / `replace`s every current doc — a re-query-all-then-write-back pattern on every rebuild (bounded per business but rewrites the full set).
- **[Medium] Rate-limit coverage is uneven.** `convex/rateLimit.ts` exposes only 8 buckets (`public-read` 120/min, `public-mutation` 5/min, `oauth-issuance`, `answer-turn-submit`, `answer-follow-up-chips`, `answer-stream`, `inquiry-submit`, `dispute-open`). Catalog offering mutations (`createOffering`/`reviseOffering`/`changeOfferingStatus`/`upsertAccessPath`/`withdraw`/`publish`) and the public registry/catalog/health queries, `actionInvocationControl`, `studies`, and `externalRuns` are **not** pattern-limited. `public-mutation` at 5/min is very tight and is shared across all billed write paths — a hot legitimate path could trip it while a scrape path is unbounded.
- **[Low] Per-offering projection N+1.** `convex/capabilitySupplyProjection.ts` `rebuildBusinessSupplyProjectionSnapshotCommand` does per-offering `.unique()` revision reads + `take()` access-path reads inside a `Promise.all`, joined in memory. Bounded by `MAX_OFFERINGS_PER_BUSINESS`, but many round-trips.
- **[Low] Unbounded collects in the curated seed.** `convex/curatedProviders.ts` uses full `.collect()` on `capabilityPublications`, `registeredOperationMappings`, and `operationKeys` (~lines 279/315/359/368) — fine for a seed-time migration, but it must never run as a hot path.
- **[Low] Client-bundle weight at an API route.** `src/routes/api.answer.turn.ts` imports `createUIMessageStream` / `createUIMessageStreamResponse` from the `ai` (AI SDK) package directly at a route module (line 7), pulling the AI SDK into a served route chunk.
- **[Low] Project-lineage events never pruned.** `convex/projectSpine.ts` durably appends events with reads capped at `MAX_PROJECT_SPINE_EVENTS`, but events are intentionally uncapped for durability — `projectSpineEvents` grows unbounded per project.

---

## Fragile Areas

- **[High] Several multi-thousand-line, tightly-coupled Convex files.** `convex/catalog.ts` (2197), `convex/capabilitySupply.ts` (2035), `convex/security.ts` (1467), and `convex/customerRequestRouteExecution.ts` (1168) mix authority, validation, projection, and state-machine logic. Refactor risk is high: inline index patterns and reconciliation loops (`catalog.ts` ~1130-1255 does per-offering `.unique()` reads + whole-state diff bookkeeping; `capabilitySupply.ts` ~1406-1411 `resolveMappingAuthority` loops over every source publication).
- **[Medium] Single-file route-execution state machine.** `convex/customerRequestRouteExecution.ts` (1168 lines) combines transport, journaling, orchestrator, and cancellation; the surrounding sub-machines (`.planning` shows several `*ports.ts`, `*Machines.ts`) make cross-file protocol drift a real risk.
- **[Medium] Large model-facing module.** `src/modules/customer-request/semantic-interpreter.ts` (1064 lines) embeds a long `SYSTEM_INSTRUCTION` prompt + zod proposal schemas + JSON interpreter in one module; prompt changes are code changes (`SYSTEM_INSTRUCTION_VERSION`), and the model output must stay behind the deterministic eligibility/selection gate.
- **[Medium] One large route-transport runtime.** `src/modules/capability-supply/route-transport-runtime.ts` (981 lines) is the single chokepoint for HTTP/MCP/x402 dispatch, credential resolution, and cancellation — high blast radius for transport changes.
- **[Low] Deliberate legacy tolerances** in `convex/capabilitySupplyProjection.ts` and `@deprecated` durable fields (`acceptedAuthority`) mean malformed legacy rows are expected in prod — new strict readers must not assume clean data.

---

## Risks

- **[High] Production payment custody/readiness gap.** x402 readiness probes transmit the signing credential as a Bearer token, and the key is a long-lived raw env var with no rotation envelope. Any provider traffic touching that key, plus the open first-dollar money-gate/ledger integration, is the single biggest correctness/security risk before real x402 payments.
- **[Medium] Runtime mismatch (Node 22 source vs 24 deploy).** `vite.config.ts`/`engines` (22) vs `.vercel/project.json` (24) + `@types/node` 24.10.2.
- **[Medium] Nightly Nitro dependency** pinned to a dated nightly build — upgrade/churn risk on the Vercel adapter.
- **[Medium] Incomplete feature surface.** `.planning/STATE.md` records P5-AGENT unimplemented (no `POST /api/compare`), P5-COMPARE/P5-HUMAN partial, P5-EVIDENCE unmet, and issue #204 (hosted registry-to-engine + real keyless invocation evidence) open; `@convex-dev/agent` is blocked (published 0.6.4 peers `ai ^6.0.35` vs installed `ai@7.0.44`). These are exposed-but-unfinished paths.
- **[Medium] Quarantined dependency by convention.** `@apidevtools/json-schema-ref-parser` must stay out of the convex bundle; a stray import breaks codegen (see Technical Debt).
- **[Low] Closed, allow-listed provider catalog.** `convex/curatedProviders.ts` has a hard-coded `PROVIDER_SLUGS` allow-list (20 providers) / `CURATED_PROVIDER_PUBLICATIONS` — no self-serve admission, so a single wrong provider mapping affects the whole curated surface.
- **[Low] Unbounded project-lineage growth** (`convex/projectSpine.ts`) and unbounded mobile that is currently bounded only by per-business caps.

---

## TODO/FIXME Inventory

Scanned with the repo's built-in search across `src/`, `convex/`, `tests/`, `tools/`, `eval/` (current dirty tree). The codebase is notably **TODO/FIXME-clean**: zero matches for `TODO`, `FIXME`, `HACK`, `XXX`, `workaround`, `hack`, `@ts-ignore` in authored code. Debt is carried as typed-unsafe casts and data-model vocabulary instead of comments.

Counts by category (occurrences in authored files; generated files excluded):
- **TODO / FIXME / HACK / XXX:** 0 (`src`, `convex`, `tests`, `tools`, `eval`)
- **`as any`:** 1 `src` (generated `src/routeTree.gen.ts`, excluded), 2 `tools/dev/full-yolo-*.ts`, 7 `tests`
- **`as unknown`:** 9 `src`, 3 `convex`, 39 `tests` (mostly handler-cast patterns in tests, plus a few in `src/modules`)
- **`@ts-ignore`:** 0 — **`ts-expect-error`:** 3 (`tests`)
- **`@deprecated`:** 8 `src` (mostly the JSON-Schema `deprecated` keyword — not debt), 1 `tests`; durable `@deprecated` fields in `convex/action-invocation/internal/convex-schema.ts` and `durable-contracts.ts`
- **`legacy`:** 10 `src`, 4 `convex`, 43 `tests` — overwhelmingly legitimate domain vocabulary (retired status, legacy-row migrations/fixtures), not debt
- **`for now`:** 3-5 `src` (e.g. `src/components/ae/claim/ClaimFormSections.tsx` copy), 2 `tests`
- **`temporary` / `temp`:** 1 `src`, 2 `tests`, 3 `tools` (temp-key revocation in `customer-request-production-credential.ts` is intended)
- **`placeholder` / `stub` / `not implemented`:** intended test fixture data only, no shipped stubs
- **Skipped tests:** only 2 conditional `test.skip` in `tests/e2e` (Chromium-only flags in `paid-operation-development-surface.spec.ts`, `thread-first.spec.ts`) — no `xit`/`describe.skip`/`it.todo`

Categories with cancellable, actionable debt: **typed-unsafe casts** (`as any`/`as unknown`, concentrated in `tools/dev/full-yolo-*.ts` and `tests/`), **runtime-mismatch** (Node 22/24), **secret custody** (`env:NAME` raw env access), and **uncommitted scratch files** (`__repro.mts`, `__detail_live.mts`, `playwright.answer-smoke.temp.config.ts`).

---
*Concerns analysis: 2026-08-06*
