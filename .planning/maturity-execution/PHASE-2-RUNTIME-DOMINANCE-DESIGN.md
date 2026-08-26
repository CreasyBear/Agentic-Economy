# Phase 2 authority-entry architecture migration

Status: `REVIEWED — NOT CLEARED; SOURCE PAUSED; ALL MIGRATION/PROOF/RE-REVIEW GATES RED`
Scope: Phase 2 source/runtime authority only. No production edit is authorized by
this document until the final read-only verifier accepts its stable hash.

The existing 27-sink suite was projected over 207 protected runtime surfaces. A
shared downstream sink does not prove entry identity or dominance. The correction
is not another TypeScript analyzer: it is a migration to unavoidable, documented
framework authority seams plus actual registered-handler evidence.

## Non-negotiable decisions

1. CodeQL is ineligible. This public repository has no detected OSI license,
   default CodeQL setup or evidenced paid Code Security entitlement. Do not
   download, install or run CodeQL.
2. No hand-written CFG/dataflow/dominance engine, parallel evaluator, generic auth
   helper, test-only production seam or bespoke runtime harness is allowed.
3. The existing Agentic Economy Principal + Account + resource/workload + current
   generation/revocation/server-time contract is unchanged and remains the only
   authorization authority. Framework adapters call it; they do not reinterpret it.
4. Entry middleware proves only entry dominance. Delayed, scheduled and external
   consequences must revalidate at their actual registered consequence boundary or
   stay red.
5. Existing handler checks remain during this migration. Phase 2 adds unavoidable
   entry closure; it does not delete consequence-time defense in depth.

Authority is resolved in this order: project
`convex/_generated/ai/guidelines.md`; actual registrations and canonical project
contracts; installed `convex-authz`/`convex-verify`; installed types/runtime; primary
framework docs. The supporting research is
`.planning/maturity-execution/PHASE-2-RUNTIME-PROOF-MECHANISMS-RESEARCH.md`.

Pinned installed runtime facts: `convex` 1.45.0, `convex-helpers` 0.1.123,
`convex-test` 0.0.56, `@tanstack/react-start` 1.168.26,
`@modelcontextprotocol/sdk` 1.30.0, TypeScript 5.9.3 and Vitest 4.1.9. The lockfile
also resolves different TanStack core package patch versions, so the exact lockfile
is authoritative.

## Two inventories that must never be conflated

### Syntax registration baseline

A TypeScript AST pass over exported top-level registrations finds **298 raw Convex
declarations across 52 files**:

| Namespace | Public | Internal | HTTP | Total |
|---|---:|---:|---:|---:|
| Generated ordinary builders | 73 (`query` 29, `mutation` 34, `action` 10) | 134 (`internalQuery` 35, `internalMutation` 81, `internalAction` 18) | 1 `httpAction` | 208 |
| Generic builders | 46 (`queryGeneric` 23, `mutationGeneric` 23) | 38 (`internalQueryGeneric` 18, `internalMutationGeneric` 20) | 6 `httpActionGeneric` | 90 |
| **Total** | **119** | **172** | **7** | **298** |

The earlier `203` observation is rejected: it omitted five typed ordinary
declarations. The later `208` observation is also not the migration total: it
omitted all 90 Generic declarations. Alias/factory forms are a separate discovery
obligation; any unresolved form is red.

The parser-confirmed per-file baseline is frozen below. The first read-only gate
must emit the same exact declaration names, kinds, source spans and symbol IDs to
`phase-2-convex-registration-migration.json`, then reconcile every row as
`protected`, `public_exemption`, `narrow_system_exemption`, or `dev_only`. A count
without exact identities is not acceptable.

| File | Rows | Builder counts |
|---|---:|---|
| `convex/actionInvocationControl.ts` | 14 | q5 m2 iQ5 iM2 |
| `convex/agentAccessOAuth.ts` | 7 | q3 m3 iM1 |
| `convex/agentAccessPolicy.ts` | 7 | q1 m2 iQ2 iM2 |
| `convex/agentAccessPrincipals.ts` | 3 | m1 iQ1 iM1 |
| `convex/authorityBoundary.ts` | 1 | m1 |
| `convex/capabilityContractDocuments.ts` | 2 | m1 iQ1 |
| `convex/capabilityOperationInvocationWorker.ts` | 3 | iA3 |
| `convex/capabilityOperationInvocations.ts` | 29 | q1 m1 a7 iQ6 iM14 |
| `convex/capabilityOperationX402AuthorizationExpiry.ts` | 1 | iM1 |
| `convex/capabilityProviderApprovals.ts` | 4 | iQ3 iM1 |
| `convex/capabilityProviderConnectionCleanup.ts` | 2 | iM1 iA1 |
| `convex/capabilityProviderConnections.ts` | 29 | qG2 mG5 iQG11 iMG11 |
| `convex/capabilityProviderConsequenceJournal.ts` | 6 | iQG1 iMG5 |
| `convex/capabilitySupply.ts` | 13 | qG3 mG1 iQG5 iMG4 |
| `convex/capabilitySupplyOperations.ts` | 8 | qG7 iQG1 |
| `convex/capabilitySupplyOwnerFunnel.ts` | 6 | qG1 mG5 |
| `convex/capabilitySupplyOwnerSupply.ts` | 2 | a2 |
| `convex/capabilitySupplyReadiness.ts` | 2 | iA2 |
| `convex/catalog.ts` | 9 | qG3 mG6 |
| `convex/chatAdmission.ts` | 1 | m1 |
| `convex/chatAnonymous.ts` | 1 | hA1 |
| `convex/chatExecute.ts` | 1 | iA1 |
| `convex/chatGenerate.ts` | 1 | iA1 |
| `convex/chatMessages.ts` | 4 | q1 m1 iQ1 iM1 |
| `convex/chatShares.ts` | 4 | q2 m2 |
| `convex/chatThreads.ts` | 6 | q3 m3 |
| `convex/devSeed.ts` | 2 | iM2 |
| `convex/discovery.ts` | 2 | qG2 |
| `convex/facilitatorDiscovery.ts` | 1 | iM1 |
| `convex/facilitatorDiscoveryAction.ts` | 1 | iA1 |
| `convex/interactiveAuthority.ts` | 4 | m1 iQ2 iA1 |
| `convex/interactiveCredentialLifecycle.ts` | 3 | iM3 |
| `convex/marketAggregateBackfill.ts` | 1 | iM1 |
| `convex/marketExternalRefresh.ts` | 1 | iA1 |
| `convex/marketExternalRegistry.ts` | 9 | q1 iQ3 iM5 |
| `convex/marketExternalRegistryRefresh.ts` | 1 | iA1 |
| `convex/marketExternalSnapshots.ts` | 2 | q1 iM1 |
| `convex/marketListingEvidence.ts` | 3 | q1 m1 iM1 |
| `convex/marketPresence.ts` | 1 | iM1 |
| `convex/marketRegistryGraduation.ts` | 2 | iA2 |
| `convex/moneyLedger.ts` | 44 | q9 m12 a1 iQ4 iM18 |
| `convex/moneyX402PaymentAttempts.ts` | 12 | iQ4 iM8 |
| `convex/providerConsequenceHttp.ts` | 5 | hAG5 |
| `convex/qualifiedUse.ts` | 3 | q1 iQ1 iM1 |
| `convex/rateLimit.ts` | 2 | iM1 mG1 |
| `convex/recoveryBreakGlass.ts` | 2 | m2 |
| `convex/registry.ts` | 3 | qG3 |
| `convex/secretLifecycleHttp.ts` | 1 | hAG1 |
| `convex/secretLifecycleOperations.ts` | 6 | iM6 |
| `convex/security.ts` | 7 | qG2 mG5 |
| `convex/sourceWriteAdmission.ts` | 1 | iM1 |
| `convex/workloadCron.ts` | 13 | iQ2 iM7 iA4 |

Legend: q/m/a = public query/mutation/action; iQ/iM/iA = internal; G = Generic;
hA = HTTP action. `devSeed.ts` is not silently discarded: its two declarations
must receive an explicit `dev_only` classification and import/reachability proof.

### Runtime surface baseline

The distinct runtime-candidate contract remains an observed baseline:

| Family | Rows |
|---|---:|
| TanStack Start server functions | 47 (38 currently protected) |
| Public Convex exports | 119 |
| Convex HTTP actions | 7 |
| Convex HTTP route registrations | 7 |
| Crons | 10 |
| Callback/continuation/job/reconciliation/worker families | 52 (49 protected) |
| **Total** | **242: 207 protected, 35 exemptions** |

The syntax namespace reconciles exactly to 119 public Convex registrations, but
the 172 internal declarations map into cron/background/call-chain rows; they do not
add 172 runtime rows or substitute for the 52 background rows. The current live
classification is red at `runAdmittedAction@652`, so 242 is not forced during
regeneration. Emit semantic added/removed/replaced/registration-changed deltas.
All 207 currently labeled protected rows are treated as unproven/red during this
migration; the old map's `207 proved / 0 red` projection has no authority.

The frozen 39 HTTP, 14 MCP and 12 CLI contracts are a third edge namespace. Every
entry must map through its real runtime composition to exactly one applicable
runtime row. Counts alone never pass.

## Property after migration

For every protected registered entry:

1. the framework registration necessarily invokes a reviewed adapter/middleware;
2. that seam calls the unchanged canonical authority resolver before `next()` or
   the handler and supplies only server-derived Principal/Account/resource/
   workload/generation context;
3. the handler cannot be registered raw, select a caller-shaped authority mode or
   bypass the derived context;
4. an authority/pre-admission denial produces no protected business effect;
5. every delayed/external consequence revalidates current durable authority at its
   own registered target/effect boundary; and
6. actual framework execution preserves valid results and proves negative isolation.

Post-admission failure is not authorization denial. `saveOwnerOfferingServer`, for
example, may save details before returning `partialRefusal`. Runtime outcomes are:
`authority_denied` (zero protected effect), `authorized_success`,
`authorized_partial`, `authorized_unknown`, and `system_failure_before_admission`.
Prior partial/unknown effects are allowed only when each was separately authorized,
current, idempotent and attributed, the response exposes recovery state, and no
unauthorized later effect occurs.

## Narrow artifact seam

```text
syntax inventory ----+
runtime registries ---+--> joiner --> completeness/identity/version/digest only
edge manifests -------+       |
framework executions -+       +--> surface/case evidence

framework adapter/middleware --> canonical existing authority --> handler
                                                            |
                                  delayed target/effect revalidation
```

- Framework adapters own unavoidable entry order.
- Existing canonical functions own authority semantics.
- Real frameworks own registration/execution evidence.
- The joiner owns schema, completeness, one-to-one identity, version and digest
  checks only. It cannot traverse graphs, infer dominance, evaluate policy or
  manufacture events.

## Migration architecture by family

### A. Convex query/mutation/action registrations

Create `convex/lib/authorityRegistrars.ts` as the only production module allowed to
import ordinary or Generic raw query/mutation/action builders. It composes installed
`convex-helpers/server/customFunctions` 0.1.123 with finite mode-specific adapters:

- interactive Principal/Account/resource;
- agent credential/delegation generation;
- signed source/callback provenance;
- durable workload authority;
- explicit public read exemption; and
- explicit narrow-system/dev-only exemption.

Each protected adapter calls an existing canonical resolver and only then supplies
its checked context to the handler. Adapter choice is a literal import, never a
caller-provided option. Public/narrow-system adapters are separate exports and
cannot construct a protected function. No `getAuthUserId`, row-level-security
replacement or new membership model is allowed. Preserve exported names, args,
returns, validators, transaction boundaries and handler bodies.

Installed `convex-helpers` does **not** pass arbitrary handler args to a
customization input; it sees only `customization.args`. Therefore no shared adapter
may pretend it can authorize `businessId`, resource, workload or generation fields
that it never received. Before migrating any declaration, freeze a per-entry row in
`phase-2-authority-entry-selectors.json` containing:

Installed-source evidence is
`node_modules/convex-helpers/server/customFunctions.ts:494-505`: it selects only
customization `inputArgs` and merges `finalCtx = { ...ctx, ...added.ctx }`, so raw
ctx capabilities survive unless explicitly overwritten.

- exact existing wire args/validator digest and return-validator digest;
- the authority-bearing selector fields moved into `customization.args` with the
  same validators;
- the canonical resolver and fixed authority mode;
- the checked selector values/server-derived Principal/Account/generation returned
  to the handler;
- post-composition wire args/validator digest, required byte/equivalence match;
- empty-selector rationale where authority comes entirely from server identity; and
- handler capability class and runtime test refs.

Use `customCtxAndArgs` to consume the exact selector fields and return only checked
or server-derived replacements. Caller-supplied Principal, Account, authority mode,
generation or provenance never reaches the handler unchanged. If the composed
validator/wire args differ, or the existing canonical resolver cannot operate from
that builder context, the row remains red.

Before the 52-file migration, runnable spikes must cover ordinary public and
internal q/m/a builders, Generic public q/m and internal q/m builders, a typed
declaration, empty args, resource/account selector, workload selector and stale
generation. Each spike must typecheck, codegen, expose the same generated function
ref/wire validators and pass real-ref positive/negative `convex-test` calls.

Entry order is paired with a structural capability contract in
`phase-2-handler-capabilities.json`. Per declaration it freezes:

- context fields available after admission and fields replaced/removed;
- allowed raw Convex capabilities (`db` read/write, `runQuery`, `runMutation`,
  `runAction`, `scheduler`, `storage`) and exact registered target refs/effect kinds;
- checked args/resources the handler may consume; and
- local handler/closure location that the bounded rule can inspect.

The adapter replaces all authority-shaped args with checked values and adds a
branded immutable `authority` context. The bounded rule rejects access to a raw
capability absent from the row allowlist, caller-shaped authority fields, casts
that erase the checked types, imported/escaped handlers it cannot inspect, and
dispatch to a target absent from the row. An allowed raw capability executes only
after successful adapter admission; it is not an alternative authority path.
Imported Generic handlers must be wrapped in a locally inspectable closure that
receives only checked args/context without changing behavior, or remain red. This
is capability closure over the existing authority result, not a new row-security
or authorization evaluator.

No generic raw capability (`db`, `runQuery`, `runMutation`, `runAction`, scheduler
or storage) may cross an uninspected/imported/escaped call boundary. Cross-boundary
helpers receive only plain checked data or a target-specific/effect-specific
closure whose fixed target and implementation are locally visible to the bounded
rule and listed in the row capability contract. If an imported helper requires a
generic ctx/capability, move no semantics to a parallel wrapper: keep the row red
until the helper can be structurally bounded through a separately reviewed
same-file composition.

The bounded ESLint adaptation enforces a fail-closed supported-syntax grammar; it
does not infer authority or capability flow. Protected registrations use a literal
named registrar import and an inline function handler. Inside that handler, raw
capabilities appear only as direct `ctx.db.<literal operation>`,
`ctx.runQuery(<static ref>)`, `ctx.runMutation(<static ref>)`,
`ctx.runAction(<static ref>)`, `ctx.scheduler.<literal operation>(..., <static
ref>)`, or the separately declared direct network expression. Each capability and
static registered target must be present in the row manifest. Local aliases,
destructuring, casts, conditional/logical registrar expressions, registrar
namespaces, non-inline handlers, dynamic targets, global/aliased network calls and
passing `ctx` or a raw capability to another function are unsupported syntax and
receive one rejection diagnostic. A migration worker must refactor such a row into
the supported local shape or leave it red. The rule performs no cross-file
inference, recursive alias tracking or general data/control-flow analysis.

Migrate all ordinary and Generic q/m/a/iQ/iM/iA declarations. Each of the 298 rows
must be classified; the seven HTTP declarations use section B. Raw registrars are
then forbidden everywhere except `authorityRegistrars.ts` and the exact HTTP files.
All old in-handler checks stay until a later independently reviewed simplification.

Entry wrappers do not make long actions safe forever. Provider/JIT, x402, payout,
Stripe, cleanup, settlement, workpool and reconciliation effects stay red until an
existing canonical current-time boundary is invoked immediately before the effect.

An exemption is structural, not a seven-example waiver. A public-data Convex
exemption must be a query/read-only framework class, receive a manifest-restricted
read capability, and return only an allowlisted public projection. A narrow-system
mutation/action must have a literal registered caller/target, no caller-shaped
identity, an allowlisted effect set and target-time provenance. A cross-file
delegate, unrestricted `db`/run*/scheduler capability, protected-table read or
unbounded external call makes the exemption red. Public Start/MCP/HTTP exemptions
likewise require a structurally read-only/public-data handler or stay red. Runtime
examples complement but do not replace this restriction.

### B. Convex HTTP actions/routes

Convex has no documented HTTP middleware and `customFunctions` does not wrap
`httpAction`. The anonymous chat exemption must be behaviorally proved read-only/
public. The six protected HTTP actions/routes (five provider-consequence handlers
and one secret-lifecycle handler) remain red until each registered HTTP action is a
thin adapter that performs its existing signed callback/workload/agent authority
boundary before any body-dependent consequence and delegates unchanged.

Drive the actual `convex/http.ts` route with
`backend.fetch(path, { method: 'POST', ... })`; separately assert
`HttpRouter.lookup(path, 'POST')` resolves the expected handler. Never call
`_handler` or hand-build `ActionCtx`.

### C. TanStack Start server functions/routes

Create `src/lib/server/authority-entry-middleware.ts` with finite, mode-specific
`createMiddleware().server(...)` adapters that call the existing canonical resolver
and call `next()` only with server-derived authority context. Do not add a generic
caller-selected policy.

Every one of the 38 protected `createServerFn` entries must attach documented
`.middleware([fixedAuthorityMiddleware])` before `.handler`. Public/exempt entries
attach an explicit exemption middleware. Protected Start route methods use the
documented route/method middleware seam. Global Clerk/source-write middleware is
request hygiene, not resource/Account authorization.

Installed Start appends a server function's own validator after its declared
function middleware, so a fixed authority middleware placed first dominates that
validator. Do not generalize this to earlier layers. `src/start.ts`
`requestMiddleware` and any route/method middleware that precedes the authority
middleware must be frozen in
`phase-2-pre-authority-operational-effects.json`, with exact order, calls, data
read/written, failure behavior and a proof that it performs no protected business
effect. Current entries include request correlation, API boundary, observability,
security headers, agent content negotiation, CSRF, source-write admission and
Clerk. Correlation/header/CSRF/context construction may be classified as bounded
operational work. Observability/network telemetry is allowed before admission only
when it is scrubbed, bounded, contains no protected Account/resource payload and
cannot change business state. Any unclassified write, schedule, external release
or middleware-owned validator effect keeps all downstream protected rows red.

The current request order is explicit at `src/start.ts:93-102`; observability
performs external capture/flush at lines 41-57. Installed Start's
`createServerFn.ts:917-945` appends its validator after declared function
middleware, which is why a fixed first function middleware dominates that validator.

For protected routes, the manifest records the full global → route → method →
authority → handler order. The fixed authority middleware must be the first layer
after classified operational middleware; a prior route middleware with business
effects is prohibited.

Tests must use the compiled Start manifest/dispatcher and built server request.
Source-level `createServerFn` mocks do not prove registration identity. If the
compiled resolver cannot be observed without a new production seam, that row stays
red.

A clean detached HEAD worktree already builds and its compiled manifest maps exact
ID `2fa85…` to `readCanonicalBaseUrlServer`, but the actual dispatcher is red:
launch the generated Vercel Node handler named by
`.vercel/output/functions/__server.func/.vc-config.json`, then request
`GET /_serverFn/<full-manifest-id>` with `x-tsr-serverFn: true`. The observed result
is HTTP 500 before dispatch with
`ReferenceError: setErrorThrowerOptions is not defined` at
`_ssr/dist-CgNYPbvv.mjs:205`; the generated file calls the symbol without importing
it, while its definition exists only in the generated `_libs/@clerk/react...mjs`
chunk. Preserve the full ID/chunk names from each run in the probe artifact because
content hashes may change. This is a suspected Clerk/TanStack bundle-composition
defect, not authorization evidence. Do not repair it inside this design review.
It is owned by a separate serial Start/Clerk bundle-integration wave; generated
chunks are evidence, never hand-edited. The fix plan must identify the source/plugin/
dependency cause, add a clean-build regression that launches the `.vc-config`
entrypoint and asserts the canonical serverFn returns before any authority matrix,
and make that regression an early `test:release:source` gate. Until it passes, source
acceptance is blocked because no compiled Start handler can be demonstrated.

The installed Clerk SDK is 1.4.9. The current local E2E mode removes
`clerkMiddleware` and injects one fixed dev-seed owner/admin identity, so it is
inadmissible for multi-identity authority evidence. After the generated-bundle
defect is fixed, the strongest credential-free source evidence is: the built
dispatcher loads; production `clerkMiddleware` remains
present and ordered; unauthenticated and invalid-token requests fail closed;
canonical context cannot be supplied by request/header/body; every protected
handler uses the documented fixed middleware; and the local owner/member/workload/
wrong-Account/stale matrix below Clerk verification passes through actual Convex
refs. This can support `SOURCE_ACCEPTED_EVIDENCE_OPEN` only when every other source
invariant is green and genuine Clerk-issued-token evidence is the sole remaining
external gate.

The positive genuine Clerk session → `convex` template chain is HOSTED evidence
owned by existing gate `P9-01`, not this local source gate. That gate
must record exact development-instance setup, `@clerk/testing` owner, configured
dashboard template, candidate/deployed revision binding, session freshness and
owner/member identities. No fake/internal-sign token or local bypass is allowed.
Official `@clerk/testing` sign-in needs a Clerk development instance and keys;
`sessions.getToken('convex')` is a Backend API request requiring the dashboard
template, while `clerkMiddleware({ jwtKey })` only makes verification of an already
issued token networkless. The source gate therefore never claims local identity
issuance.
Missing `clerk-tanstack-patterns`/`clerk-testing` skills (AE-PAP-017) do not
authorize invented behavior.

### D. MCP

Preserve the single existing `McpServer.registerTool` callsite in
`createAeMcpServer`. `src/routes/mcp.ts` POST/DELETE → rate limiter →
`handleMcpRequest` → action admission → `createAeMcpServer` → SDK registered tool
callback → `action.run` is the exact seam. The callback receives only the
server-derived access context. A narrow rule forbids a second registration site.

`withHttpRateLimit` and request/observability telemetry can execute before the
protected action's canonical admission. Classify them in the same pre-authority
operational-effects contract. A permitted rate-limit effect is bounded abuse-state
only, keyed without protected business payload, and cannot grant authority or
mutate Account/business state. Permitted telemetry is scrubbed/bounded and contains
no secret, credential, protected payload or business mutation. Denial tests assert
only these declared operational effects may occur. Any rate-limit/telemetry path
that releases protected data, schedules work or mutates business state keeps all
affected MCP rows red.
The current pre-admission ordering is registered at `src/routes/mcp.ts:11-12`.

All 14 tools are invoked by real protocol requests through `/mcp`. Entry admission
does not prove downstream consequence-time authority; protected tools remain red
until their registered callback and downstream boundary pass all cases.

### E. CLI

The CLI is an untrusted client and never owns Phase 2 authority. Preserve
`tools/ae/cli.ts` argv → `parseArgs` → command descriptor/map → runner → HTTP/MCP
transport. Do not add Commander solely for evidence. Run the built/packaged CLI as
a subprocess against the same proven server endpoints and preserve help, JSON,
exit-code, stdout/stderr and credential-origin behavior for all 12 commands.

### F. Scheduled/background/external work

All 10 crons and 49 protected background rows begin red. Each row needs:

1. an authorized registered source/producer;
2. a durable canonical workload envelope/reference—not caller-shaped Principal or
   Account fields;
3. an exact registered target using the appropriate internal adapter;
4. target-time re-resolution of generation, revocation, expiry and Account before
   each consequence; and
5. actual scheduled/worker execution and effect evidence.

Auth is not propagated by Convex scheduling. `convex-test` may inspect
`_scheduled_functions` and drain scheduled work, but does not run crons. For a cron,
prove the exact `convex/crons.ts` schedule/name/target reference and manually invoke
that same internal target. Workpool/component tests reuse
`tests/helpers/convex-fixtures.ts` registrations. External calls are intercepted
only at existing provider/transport seams.

Seven callbacks, two continuations, 18 consequential jobs, 14 consequential
reconciliations and eight workers remain red until the source/target rules pass.
Reconciliation/domain aliases are not registrations; either map every real caller
without pre-call consequence, promote to an actual wrapped registration, or remove
the alias from the measured runtime namespace through reviewed regeneration.

## Bounded local enforcement, not a general analyzer

Add direct dev dependencies `eslint` 10.9.0 and `@typescript-eslint/parser` 8.68.0
after compatibility install succeeds. Add `eslint.config.mjs` and
`tools/eslint-rules/phase-2-authority-entry.mjs`. The rule may prove only:

- raw builder/registrar imports occur only in approved registration modules;
- every classified Convex declaration uses the fixed protected/exempt adapter;
- every protected Start server function/route declares its fixed middleware;
- MCP has exactly one `registerTool` site;
- within adapter/middleware functions, every path to `next()`/handler follows the
  canonical resolver and no declared local consequence occurs first; and
- parser identities/counts join to runtime/edge manifests.

Hostile rule fixtures cover early return, alternate branch, catch/finally, aliased
registrar, typed declaration, Generic builder, second registration site,
pre-boundary schedule/fetch/write and safe all-path wrapper. The rule may not infer
imports, traverse application call graphs or prove delegated consequences.
Semgrep CE is optional and omitted from the minimum blast radius.

## Run-produced evidence and provenance

Primary evidence is keyed by runtime `surfaceRef`, then case label. A sink summary
is derived navigation only. Each observation records `sourceKind`, exact source
reference/registration ID, observed record/function/route ID, value digest,
candidate commit, runner command and case ID.

- registration: generated Convex ref/module registry, router lookup, cron/workpool
  registration, compiled Start manifest/route object, MCP SDK registry or packaged
  CLI dispatch;
- handler: identity resolved by that real registration, never a test-authored name;
- authority: existing canonical return/refusal or durable attributed authority/audit
  record; if not observable, make no synthetic runtime claim;
- effects: durable before/after records, scheduled/work records, existing journals/
  receipts or existing provider/transport seam calls;
- audit: durable denial/audit rows; and
- outcome: actual return, response, thrown error or registered work result.

The joiner rejects free-form claims, invalid provenance kinds, missing IDs/digests,
mismatched commits and any trace not joined to its exact registration.

## Per-family actual-handler tests

Use `convex-verify` seed → multi-identity drive → positive/negative assert and the
existing fixtures. Seed two Accounts, owner/member identities, agent/workload
principals, current/stale generations and missing workload context.

| Family | Driver | Required assertions |
|---|---|---|
| Convex q/m/a/internal | generated `api`/`internal` refs through existing `convex-test` fixture | exact valid result/state; owner/member/workload policy; stranger/wrong Account/stale/missing refusal and no protected effect |
| Convex HTTP | `fetch(path,{method,...})` plus `lookup` | exact route/handler, signed provenance, denial/no effect, valid callback behavior |
| Start serverFn/route | built Start server/compiled dispatcher plus below-Clerk Convex matrix; hosted P9-01 separately | source: middleware identity/order, unauth/invalid fail-closed, no caller context, valid compatibility; hosted: genuine owner/member Clerk→Convex template chain |
| MCP | protocol request to built `/mcp` | exact tool/action, public vs protected admission, seven cases, downstream effects |
| CLI | packaged subprocess against built server | parser/descriptor/runner/endpoint identity, exact output/exit compatibility; server denial owns authority |
| Cron/scheduled/workpool | exact registration + manual target/drain | producer and target identity, durable envelope, target-time stale/revoked refusal, no duplicate effect |
| External/partial/reconciliation | existing true external seam + durable journals | per-effect current authority/idempotency/attribution, success/partial/unknown/recovery outcomes |

The seven labels are `owner`, `member`, `workload`, `missing_workload`, `stranger`,
`wrong_account`, `stale_generation`. Expected outcomes are binding-specific; labels
cannot be inert. The 35 exemptions also receive exact registered-handler behavior
tests and cross-Account no-effect/read-only assertions.

```text
actual registration
      |
fixed framework adapter/middleware
      |
canonical existing authority ---- denial --> audit allowed; no protected effect
      |
actual handler
      |
delayed/external effect? -- yes --> registered target/current-time revalidation
      |                                      |
      +---------------- valid effect <-------+
      |
run-produced outcome/effect provenance keyed by surface + case
```

## Integration gates

The migration is green only when all are true:

1. syntax-aware discovery reports every ordinary, Generic, typed, aliased and
   factory registration; the reviewed baseline begins at 298/52 and zero unresolved;
2. all 298 rows are classified and mapped; 119 public, 172 internal and seven HTTP
   declarations reconcile to the runtime namespace without omission/duplication;
3. no raw Convex builder remains outside the approved registrar/HTTP files;
4. every Convex row has wire-equivalent selector/customArgs and structural
   capability contracts; representative builder spikes pass; no handler can receive
   unchecked authority fields or use an unlisted raw capability/target;
5. every protected Convex and Start entry uses its fixed adapter/middleware, every
   pre-authority operational effect is classified/bounded, and the bounded ESLint
   rule/hostile fixtures pass;
6. all 39 HTTP, 14 MCP and 12 CLI entries drive their actual runtime composition and
   map to exact runtime rows;
7. every protected runtime row has seven actual-handler cases; exemptions have
   structural read-only/bounded-system restrictions plus exact behavioral cases;
   valid commercial/chat/market/money results are preserved;
8. every authority denial has no protected business effect (only declared bounded
   operational effects); every authorized partial/unknown result
   accounts for separately authorized/idempotent/attributed effects and blocks
   unauthorized later work;
9. all 10 cron and 49 protected background rows prove both source and target plus
   target-time durable authority, or remain individually red;
10. protected HTTP, Stripe, JIT/provider, x402, payout, cleanup, settlement,
   workpool and reconciliation chains prove their immediate consequence boundary,
   or remain individually red;
11. production evidence counts actual surface/case traces and never computes
    `protected × 7` from sink representatives; and
12. a fresh verifier accepts the final design/implementation evidence with zero red
    rows before Phase 2 status changes.

## Staged implementation and disjoint ownership

Implementation remains paused. After design acceptance, use atomic waves. Workers
must not share production files within a wave and must not revert existing dirty
standards repairs.

1. **Inventory/foundation (serial):** AST manifest/join schemas, adapter types,
   bounded ESLint rule/fixtures. No domain handler changes.
2. **Convex migration (parallel by disjoint file groups):**
   - Group A owns `actionInvocationControl`, `agentAccess*`, `authorityBoundary`,
     `capabilityContractDocuments`, `capabilityOperation*`, `capabilityProvider*`.
   - Group B owns `capabilitySupply*`, `catalog`, `chat*`, `discovery`,
     `facilitator*`, `interactive*`.
   - Group C owns `market*`, `money*`, `qualifiedUse`, `rateLimit`,
     `recoveryBreakGlass`, `registry`, `secretLifecycleOperations`, `security`,
     `sourceWriteAdmission`, `workloadCron`, and explicitly classified `devSeed`.
   - HTTP adapters (`chatAnonymous`, `providerConsequenceHttp`,
     `secretLifecycleHttp`, `convex/http.ts`) are a separate serial high-risk wave.
3. **Start migration:** middleware module plus protected server functions/routes,
   disjoint from Convex groups.
4. **MCP/CLI:** preserve central composition; tests/manifests only unless a proven
   entry defect requires a separately amended blast radius.
5. **Background/external:** one consequence family at a time after its source/target
   map is accepted; money/JIT/provider/Stripe work never shares a worker.
6. **Consumer/release (serial):** evidence join, production consumer, scanners,
   exact release.

Shared files are driver-owned and never edited by domain workers:

| Shared file(s) | Sole serial owner/responsibility |
|---|---|
| `convex/http.ts` | HTTP registration driver after all handler refs are stable |
| `convex/crons.ts` | cron registration driver after source/target maps are stable |
| `convex/_generated/**` | codegen driver only; generated command output, never hand edits |
| `src/start.ts` | Start composition driver; operational-effect order and Clerk presence |
| `package.json`, lockfile, `eslint.config.mjs`, `tools/eslint-rules/**` | tooling driver; pinned dependencies/commands/rule |
| CI/workflow files | release driver after focused commands and budgets are proven |
| `src/modules/authority/recovery/production-evidence.ts` and evidence contracts | evidence-join driver only after all producer schemas settle |
| production-evidence integration/security tests | evidence-join driver; no domain fixture ownership |

Domain workers submit required registration/manifest deltas to the sole driver;
they do not edit these shared files themselves. The Start/Clerk bundle defect is a
separate serial owner and cannot overlap the Start authority-middleware wave.

No worker may create a new production seam, change canonical semantics or edit an
unowned file. Integration-driver-only files are:

- `tests/integration/drivers/phase-2-convex-runtime.ts` using existing fixtures;
- `tests/integration/drivers/phase-2-start-runtime.ts` using the built server;
- `tests/integration/drivers/phase-2-mcp-runtime.ts` using protocol requests; and
- `tests/integration/drivers/phase-2-cli-runtime.ts` spawning the packaged CLI.

They orchestrate real registrations; they do not implement authority or handlers.

## Blast radius

Expected authorized categories after final design acceptance:

- all 52 manifest-listed Convex registration files, `convex/http.ts`, the new
  `convex/lib/authorityRegistrars.ts`, and generated Convex API/type output;
- 38 protected Start server-function declaration files, protected Start route
  files, and `src/lib/server/authority-entry-middleware.ts`;
- manifest/evidence contracts for syntax registration, runtime registration,
  outcome policy, surface cases and authz reconciliation;
- the four integration drivers, focused maturity/integration/security tests;
- `eslint.config.mjs`, the narrow rule/fixtures, `package.json` and lockfile;
- `production-evidence.ts` and its two existing consumer tests; and
- exact CI/package-command files named by the final amendment.

This broad list is not permission to edit all files at once. The per-file migration
manifest must attach adapter mode, runtime rows, tests, owner group and rollback
commit before a file enters a wave. Any unlisted helper, schema, public API,
generated route tree, UI, provider/business/money behavior or documentation is a
blast-radius expansion requiring re-review.

## Compatibility, rollback and failure recovery

- Preserve function/export names, args, validators, returns, HTTP paths/methods,
  MCP tool names/schemas, CLI outputs/exit codes, transaction boundaries,
  idempotency and authorized outcomes.
- Run Convex codegen after each wave and byte-review generated API changes. Type
  inference changes from custom builders are expected; public wire shapes are not.
- Keep adapters server-only. Run import and route-client bundle scanners after the
  first Start/Convex wave, not only at release.
- Do not feature-flag a security bypass or maintain raw/wrapped dual registrations.
  Each wave is an atomic commit; rollback is `git revert` of that wave after its
  generated artifacts and manifest row versions are restored.
- A failed negative test, unresolved registration, unsupported framework seam or
  changed valid result makes the exact row red and stops that wave. It is never
  reclassified away to make counts pass.
- Capture `git status --short` plus hashes of all pre-existing dirty out-of-scope
  files before every wave; compare afterward. Never reset or clean user work.

## Performance and release pre-mortem

- Establish cold/warm ESLint, codegen and matrix baselines before migration.
- Parse syntax once; join with maps keyed by declaration/runtime/edge identity;
  sort once. No quadratic surface×case/effect join.
- Deterministically shard actual-handler cases by framework and stable surfaceRef;
  isolated fixtures, exact union/duplicate checks, no retries/shared mutable state.
- Record p50/p95 per family, peak memory and total wall time; subsequent focused CI
  may regress no more than 25% without reviewed evidence.
- Fix the verified `--discover-refs` truncation: await buffered stdout rather than
  `process.stdout.write(...); process.exit(0)`; hostile-test output above 64 KiB.

Named commands to add in the accepted implementation:

- `test:phase2:registrations` — AST/symbol inventory, classification and join check;
- `test:phase2:authority-entry` — bounded ESLint rule and hostile fixtures;
- `test:phase2:runtime-matrix` — deterministic actual-handler cases/traces;
- `test:phase2:runtime-parity` — smaller local Convex/built Start parity suite;
- `test:phase2:dominance:check` — non-writing completeness/identity/version/digest
  join only; and
- `test:phase2:authz-scan` — executable four-shape scan using the same bounded AST/
  ESLint registration infrastructure plus manual AE reconciliation; it makes no
  interprocedural claim.

Release order: focused registration/rule fixtures → one migrated family runtime
matrix → typecheck/codegen → `test:ts-standards` → `test:imports` → route-client
bundle safety → SSRF drift → production-evidence tests → full matrix/parity →
`test:maturity:coverage` → unchanged `npm run test:release:source` in a dedicated
clean worktree at the exact candidate commit. Hash and preserve the current dirty
worktree; never describe it as hermetic.

Before any Start wave, repeat the clean-build Vercel handler probe above and retain
manifest ID, `.vc-config` entrypoint, request/response and generated chunk/import
evidence. The present missing `setErrorThrowerOptions` failure blocks Start runtime
tests before authority assertions; it cannot be waived by a source-level unit test.

## NOT in scope

- changing canonical Principal/Account/generation semantics;
- deleting current in-handler consequence checks;
- new schemas, public wire contracts, UX, commercial/chat/market/money behavior;
- a generic auth framework, CodeQL, Semgrep Pro, custom analyzer or test harness;
- claiming local tests as hosted/vendor evidence; or
- repairing a business defect found by the migration without a separate bounded
  semantic plan.

## Unresolved red gates

1. **298-row classification/join:** exact symbol-resolved aliases/factories,
   protection/exemption/dev status, runtime row(s), adapter mode and owner group are
   not yet frozen in the machine-readable migration manifest.
2. **Selector/customArgs and canonical adapter feasibility:** every row needs exact
   wire-equivalent selector composition, and each finite interactive/agent/signed/
   workload adapter must call an existing canonical resolver from its real context.
   Ordinary/Generic public/internal q/m/a representative spikes are not yet run.
3. **Structural capability closure — RED:** the per-row checked args, replaced/
   removed context, allowed raw capabilities/targets and locally inspectable handler
   closures are not yet frozen or hostile-tested; unsupported rows stay red.
4. **TanStack built dispatcher — RED:** clean build maps a real manifest ID but
   `GET /_serverFn/<id>` fails before dispatch with missing
   `setErrorThrowerOptions`. Diagnose through a separate bounded build/bundle plan;
   no Start identity or behavior claim passes until the unchanged reproducer does.
5. **Start source/hosted evidence split — RED:** credential-free source invariants
   are blocked by gate 4. Genuine Clerk two-identity/template issuance remains a
   separately owned hosted evidence gate; no fake token or local bypass is allowed.
6. **Pre-authority operational effects — RED:** Start request/route middleware and
   MCP rate-limit/telemetry order/data/effects are not yet frozen and bounded.
7. **Unsupported families/exemptions:** six protected Convex HTTP routes, Stripe provenance,
   10 crons, 49 protected background rows, all delayed/external chains, protected
   MCP tools, CLI endpoint mappings and all structurally unrestricted/cross-file
   exemptions remain red until the family-specific conditions above pass.
8. **Live inventory drift:** `runAdmittedAction@652` remains unreconciled; no fixed
   242 acceptance or regeneration is permitted.
9. **Fresh re-review:** after exact manifests/adapter feasibility/driver paths and
   remaining blast-radius files are amended, a fresh verifier must accept the final
   stable hash before implementation.

## Review findings and adopted decisions

| Severity | Finding | Adopted decision |
|---|---|---|
| P0 | 27 sink tests were projected over 207 protected surfaces. | Surface/case-keyed real registration evidence; sinks derived only. |
| P0 | Custom program analysis was prohibited and CodeQL is ineligible. | Framework entry architecture plus bounded ESLint/local inventory only. |
| P0 | `203` and `208` missed typed/Generic declarations. | Parser/symbol inventory baseline 298/52; aliases/factories red until resolved. |
| P0 | Entry-only rules contradict delayed/current-time authority. | Registered target/effect revalidation for every delayed/external consequence. |
| P0 | Zero-effect-on-error contradicted valid partial progress. | Distinguish denial from authorized partial/unknown with per-effect proof. |
| P1 | Convex raw builders have no unavoidable common authority seam. | Migrate ordinary and Generic q/m/a/internal registrations to custom functions. |
| P1 | 38 protected Start server functions lack per-entry middleware. | Documented fixed per-function/route middleware plus built-runtime tests. |
| P0 | The clean built Start dispatcher fails before handler dispatch on a missing Clerk-generated symbol. | Preserve exact Vercel-handler reproducer; separate bounded bundle diagnosis; keep Start red. |
| P1 | Convex HTTP has no custom-function middleware. | Thin registered adapters or red; real `fetch`+`lookup` proof. |
| P1 | MCP/CLI/background aliases were counts, not compositions. | Exact `/mcp` SDK loop, packaged CLI endpoint chain, source/target registration maps. |
| P1 | Trace checksums could manufacture evidence. | Field-level framework/durable/seam provenance; joiner cannot create events. |
| P1 | Public exemptions can delegate to effects. | Exact runtime behavior and read-only/no-cross-Account evidence for all 35. |
| P1 | Migration blast radius could collide across 52 files. | Disjoint domain ownership, high-risk serial waves, atomic rollback commits. |
| P2 | Current CLI output can truncate at 64 KiB. | Await/flush output and hostile large-result test. |
| P2 | New wrappers can change inference/bundles/codegen. | Early codegen/type/import/bundle gates and wire-compatibility assertions. |
| P2 | Full matrix can dominate CI. | Deterministic isolated shards, linear join and measured regression budget. |
| P0 | `customFunctions` input cannot see arbitrary handler args. | Per-entry `customization.args` selector contract, wire-validator parity and representative builder spikes. |
| P0 | A handler could ignore derived authority and use raw capabilities/caller args. | Per-row checked-arg/context/capability/target contract plus locally inspectable closure enforcement; otherwise red. |
| P1 | Start request/route middleware can run before function authority. | Exact operational-effect order/classification; validator ordering based on installed source; unclassified effects red. |
| P1 | Exemptions with unrestricted DB/delegation are not structurally public. | Read-only public projection or bounded literal system capability plus runtime evidence; otherwise red. |
| P1 | MCP rate-limit/telemetry precedes action admission. | Bound as scrubbed non-business operational effects and assert denial behavior. |
| P1 | Shared registration/config/codegen files lacked exclusive ownership. | Serial driver-only ownership table; domain workers submit deltas and never edit shared files. |
| P0 | Restricted-looking ctx could leak generic capabilities into an imported helper beyond local inspection. | Generic capabilities never cross uninspected boundaries; pass checked data or locally fixed target/effect closures, otherwise red. |

## Review record

- Independent runtime proof: `FAIL`.
- Prior design verifier on CodeQL draft: `FAIL`; that architecture is superseded.
- Refreshed primary-source research: framework migration recommended; CodeQL
  definitively rejected.
- Fresh read-only verifier on substantive design hash `8a31262a…`: `PASS` for the
  bounded migration design only; nine implementation/source gates remain red.
- Final plan engineering review: `DESIGN PASS / IMPLEMENTATION NOT CLEARED`.
- Implementation authorization: `WITHHELD`.

## Completion summary

- Scope challenge: retained Phase 2 semantics; widened from checker patch to the
  exact authority-entry migration demanded by the real registration inventory.
- Architecture: 14 issues; 9 red gates remain.
- Code quality: 4 issues; bounded local enforcement and artifact seam specified.
- Tests: coverage diagram and 22 hostile/runtime gaps specified.
- Performance: 3 issues; sharding/linear joins/baseline budgets specified.
- NOT in scope / What exists / failure recovery / parallelization: written.
- `TODOS.md`: 0 updates; tasks remain in skill-owned artifacts.
- Failure modes: 9 critical implementation/source gates remain explicit.
- Parallelization: 6 staged lanes; three disjoint Convex domain groups and Start
  can prepare in parallel after the serial foundation, while HTTP/high-risk/shared
  drivers and consumer/release remain serial.
- Lake Score: 23/23 recommended corrections chose the complete option; spawned
  session skipped lake prompts.
- Outside voice: `[running under Codex — nested codex passes skipped; set GSTACK_FORCE_CODEX_REVIEW=1 to force]`.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | NOT RUN | No product direction change; this is a source authority migration. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | SKIPPED | Running under Codex; nested pass skipped. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | DESIGN PASS / ISSUES OPEN (PLAN) | 43 section issues: 14 architecture, 4 code quality, 22 test gaps, 3 performance; 23 corrections folded; fresh verifier PASS on bounded design. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | NOT REQUIRED | No UI scope. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | NOT RUN | Tooling impact is specified inside the engineering migration. |

**VERDICT:** BOUNDED DESIGN PASSED — implementation remains withheld until all nine source/migration gates resolve.

**UNRESOLVED DECISIONS:**

- Freeze the symbol-resolved 298-or-more registration/classification/join manifest, including aliases/factories, runtime rows, adapter modes and owners.
- Prove wire-equivalent per-entry selector/customArgs composition and existing canonical adapter feasibility with ordinary/Generic public/internal q/m/a spikes.
- Freeze and enforce per-row checked args, context replacement and raw capability/target closure; generic capabilities may not cross uninspected boundaries.
- Diagnose and repair the clean built Start `setErrorThrowerOptions` pre-dispatch failure through a separate bounded source/plugin/dependency plan and real-handler regression.
- Complete credential-free Start source invariants; keep genuine Clerk two-identity/template issuance in hosted gate P9-01 with revision/freshness binding.
- Freeze and prove Start request/route plus MCP rate-limit/telemetry pre-authority operational effects.
- Resolve or keep red every unsupported HTTP, Stripe, cron, background, delayed/external, MCP, CLI and structurally unrestricted exemption row.
- Reconcile live `runAdmittedAction@652` identity drift without forcing the 242 baseline or modifying unrelated dirty source.
- Obtain fresh implementation/evidence re-review after the exact manifests, feasibility spikes, driver paths and remaining blast radius are frozen.
