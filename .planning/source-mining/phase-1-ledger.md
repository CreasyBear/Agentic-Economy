# Phase 1 Source-Mining Ledger

**Source mine:** `../Agentic-Economy-Backup`
**Rule:** concept extraction only. No copied folders. No direct imports.

| Fresh module / PR | Backup evidence | Keep | Cut | Fresh seam | Test to write | Banned imports/symbols |
|---|---|---|---|---|---|---|
| PR02 business contracts | `convex/claimPublishing.ts`, backup claim routes, `PRODUCT.md` owner posture | no-ABN T0 publish; source-owned claim/publish states; public facts needed for owner demand readiness | route-local authority; ABN-first copy; hidden index failures; generic directory profile | `claimBusiness`, `publishBusiness`, `getPublicBusiness`, `suppressBusiness` via Convex/module seam | no-ABN claim; wrong-owner publish rejected; idempotent publish; suppressed absent | backup route imports, `phase35`, `wallet`, `payment`, `skills` |
| PR02 lifecycle contract | `src/lib/registry/lifecycle/*`, Phase 35 lifecycle README/tests | `held_money`, `external_authority`, `time_bound`, `proof_gap` primitives; one reference descriptor | runtime workflow engine; protected actions; vertical construction/property workflows | descriptor-only lifecycle module with tuple unions and type tests | primitive descriptor tests; UCP emits descriptors only | `proposeAction`, workflow runtime, settlement/execution symbols |
| PR03 security/admin | backup admin membership/source-owned standards | source-owned admin role/state/grant/revoke/break-glass audit; public allowlists | env-only admin; route-only guards; DB-row public spreads | `requireAdmin`, `assertCsrf`, `rateLimitClaim`, `detectDuplicateClaim`, `openDispute` | active/revoked/support admin tests; CSRF tests; private-field leak tests | env-only role checks, raw owner/contact projection |
| PR06 registry/search | `src/lib/registry/directory/*`, `src/lib/search/meilisearch.ts`, Phase 35 validation | generated registry projection; visible index gap; retryable projection | Meilisearch-first dependency; warning-only sync; route direct writes | `syncBusinessProjection`, `retryRegistryProjection`, `searchRegistry`, `getIndexStatus` | forced adapter failure; retry/rebuild; suppressed/unpublished absent | direct route search writes, global search singleton |
| PR07 discovery | `src/lib/registry/discovery/ucpManifest.ts`, `src/routes/$slug.ucp.ts`, `tests/seo/discovery-files.test.ts` | generated UCP-shaped manifest; UCP version pin; route header/cache/CORS tests | `payment_handlers`; placeholder MCP/OpenAPI/schema URLs; `.well-known` overclaim; callable language | `buildUcpManifest`, `regenerateDiscoveryManifest`, `buildLlmsTxt` | valid/degraded/suppressed manifest; dead-link test; prompt-injection fixture | `payment_handlers`, `buildMcpToolDefinitions`, MCP/OpenAPI/API-key fields |
| PR05/PR08 SEO/copy | `src/lib/seo/localBusiness.ts`, backup SEO tests, `PRODUCT.md` anti-overclaim posture | canonical/noindex/schema invariants; private URL exclusion; public copy honesty | ratings/offers/payment schema; fake verification; protocol-first owner copy | `buildPublicBusinessSeo`, claims-register scan | JSON-LD escape; noindex; sitemap/robots/llms copy scan | `AggregateRating`, `Offer`, `paymentAccepted` without source evidence |
| PR02/PR08 observability | Phase 35 validation and logger split | Convex-safe redaction; typed audit; visible operational gaps | Node builtin in Convex graph; generic optional actor audit events | `emitAuditEvent`, `redactLogValue`, `readOperationalGaps`, `operatorControls` | redaction scan; Convex-safe import; audit required-field test | Node-only imports in Convex-safe code, optional actor/target on consequential events |

## PR gate

Each implementation PR appends or confirms the relevant row and includes the exact source file lines read. If a source file is mined but absent from this ledger, the PR fails `test:source-mining` until the row is added.

## PR00 Evidence Read

Read on 2026-06-27 from source mine `../Agentic-Economy-Backup`. These are evidence anchors, not copy permission.

| Fresh module / PR | Backup line anchors | Keep | Cut |
|---|---|---|---|
| business claim/publish | `convex/claimPublishing.ts:49-80`, `:88-95`, `:97-187`, `:189-199`, `:203-205`, `:260-266` | required T0 name/category/slug/auth inputs; duplicate-owned response; owner membership creation; payload hash and audit write; publish result shape | route/server-token authority, browser-supplied `clerkUserId`, `ctx: any`, `trustTier: "live"`, `publicStatus: "active"`, chat URL fields, env token gate as admin/actor authority |
| registry/search | `src/lib/registry/README.md:7-25`, `:43-47`; `src/lib/registry/directory/registryData.ts:29-63`; `src/lib/registry/directory/registryProjection.ts:31-52`; `src/lib/search/meilisearch.ts:178-220`, `:226-266`, `:284-333` | claim -> publish -> index -> discoverability spine; source lookup timeout/read state; projection item idea; visible index failure/readback | callable path in Phase 1, Meilisearch-first dependency, best-effort publish sync without durable attempt state, route direct writes, payment/UCP coupling in registry projection |
| discovery | `src/lib/registry/discovery/ucpManifest.ts:1-13`, `:36-59`, `:69-107`, `:110-131`; `src/routes/$slug.ucp.ts:7-48` | version-pinned generated manifest idea; degraded manifest route behavior; content type, cache, CORS, nosniff headers | `.well-known/ucp` wording for AE-hosted fallback, `payment_handlers`, live OpenAPI service descriptors, MCP tool definitions, placeholder input schemas, owner/runtime claims unsupported in Phase 1 |
| lifecycle | `src/lib/registry/lifecycle/types.ts:1-14`, `:15-58`, `:70-98`, `:102-119`; `src/lib/registry/lifecycle/README.md:10-18`, `:37-48` | descriptor-only primitive contract; held money, external authority, time-bound gate; typed transition descriptors; proof-gap posture | runtime workflow engine, protected action execution, vertical workflow code, generic transport/callable coupling |
| security/admin | `convex/adminMemberships.ts:1-40`, `:103-206`, `:208-245`, `:264-323`; `convex/adminGuards.ts:1-57` | source-owned admin roles/states, grant/revoke/bootstrap audit shape, evidence refs and reason requirements | env migration as live authority path, backend-admin magic authority as sufficient admin proof, payout/security roles before Phase 1 needs |
| SEO/copy | `tests/seo/discovery-files.test.ts:14-65`, `:67-89`, `:91-128`, `:130-190`; `src/lib/seo/localBusiness.ts:37-85`; `PRODUCT.md:17-25`, `:35-48`, `:70-85` | sitemap/private-route exclusion tests; hosted HTTPS guard; robots/llms truth boundaries; JSON-LD escaping; optional ABR attribution; outcome-before-mechanism copy posture | chat URLs in sitemap, pricing/how-it-works launch claims before current Phase 1 evidence, protocol/router/callable copy on owner surfaces, non-null ABN assertion pattern |

## Banned Scan Seed

PR01 must turn this seed into executable `test:source-mining` / `test:imports` gates over runtime source:

```text
../Agentic-Economy-Backup
Agentic-Economy-Backup
phase35
payment_handlers
buildMcpToolDefinitions
MCP tool catalog
OpenAPI service descriptor
business-origin /.well-known/ucp
standard merchant-origin UCP
agent-callable
callable=true or executable callable/action claims
paymentRequired=true or payment-required/payment-handler claims
stripe
x402
wallet
credits
billing
protectedActions
proposeAction
actionGateway
request-market
requestMarket
skills
expert
hosted-agent
hostedAgent
voice
persona
benchmark
leaderboard
```

`callable: false` and `paymentRequired: false` are allowed only inside approved public DTO/manifest schemas and tests that assert unsupported capability. Runtime scans ban truthy/executable usage and public copy claims, not the explicit negative flags.
