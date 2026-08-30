# Technology Stack

**Project:** Agentic Economy Maturity Rebaseline  
**Research dimension:** Stack  
**Researched:** 2026-08-26  
**Overall confidence:** MEDIUM — HIGH for the repository-locked baseline and accepted project constraints; MEDIUM for current behavior cross-checked in official docs through the available web-search fallback; LOW for registry-latest observations because the GSD confidence seam classifies direct npm lookups at that tier.

## Recommendation

Retain the existing TypeScript/Convex modular monolith. Mature it by composing one canonical Principal/Account adapter into explicit `convex-helpers` custom-function wrappers, keeping registered Convex endpoints thin, and using the existing Workpool plus durable Convex invocation/effect journals for asynchronous work. Do not add a second database, external authorization engine, general workflow engine, or bespoke alias/dataflow analyzer.

Use Clerk only to authenticate human external identities; AE's Convex-held Principal, Account, ownership, membership, Credential, workload and delegation facts remain authorization truth. Keep x402/provider HTTP 402 responses and authenticated settlement evidence as transactional truth for supported synchronous provider calls. Infisical Cloud remains a candidate implementation behind a replaceable `SecretStore`, not a platform dependency that leaks into domain contracts.

## Evidence Labels

- **FACT** — behavior or version directly supported by repository evidence or a primary/official source.
- **AE DECISION** — locked constraint from `PROJECT.md` or accepted rebaseline evidence.
- **AE INFERENCE** — prescriptive application of sourced behavior to AE; it still requires phase-specific design and acceptance.

## Recommended Stack

### Core Framework

| Technology | Retained version | Purpose | Recommendation and rationale | Confidence |
|---|---:|---|---|---|
| Node.js | 22.x | Server/runtime baseline | **AE DECISION:** retain. It is already the package engine and satisfies the candidate Infisical SDK's Node 20+ requirement. Do not combine runtime upgrades with authority migration. | HIGH |
| TypeScript | 5.9.3 | Domain types and strict compilation | **AE DECISION:** retain strict/no-emit checking. Authority and effect invariants still require runtime validators; TypeScript is not a trust boundary. | HIGH |
| Convex | 1.45.0 | Sole writable system of record, functions, transactions, scheduler, auth verification and components | **FACT:** repository and lockfile pin 1.45.0; the npm registry also reported 1.45.0 on the research date. **AE DECISION:** keep Convex as the only writable record and remain a modular monolith. | HIGH baseline / LOW registry-latest |
| `convex-helpers` | 0.1.123 | Custom function builders and optional database wrappers | **FACT:** repository resolves 0.1.123; registry reported 0.1.123. Use `customQuery`, `customMutation` and `customAction` as explicit, discoverable runtime authority seams. The helper adds/overrides context; it does not prove removal of raw capabilities, so AE must pass explicit least-privilege service objects into plain TypeScript domain code and test that exact registered path. | HIGH baseline / MEDIUM behavior |
| Zod | 4.4.3 | HTTP, MCP, provider and domain boundary contracts | **FACT:** exact repository version and registry current observation agree. Retain for non-Convex inputs and provider responses; use Convex `v` validators on every registered Convex function. | HIGH baseline / LOW registry-latest |
| React / TanStack Start / Router | 19.2.7 / 1.168.26 / 1.170.16 | Existing website, operator and HTTP adapter | **AE DECISION:** retain. The operator plane should consume the same Convex facts and commands; it must not become a separate authorization or persistence tier. Patch upgrades are separate maintenance work. | HIGH |

### Database

| Technology or pattern | Version | Purpose | Recommendation and rationale | Confidence |
|---|---:|---|---|---|
| Convex application tables | 1.45.0 runtime | Canonical Principal, Account, delegation, Connection, invocation, effect, reconciliation and audit facts | **AE DECISION:** sole writable system of record. Component state is still within Convex, but application truth needed for support/recovery must live in AE-owned tables rather than only in component TTL/status records. | HIGH |
| One canonical Convex Principal/Account adapter | AE-owned plain TypeScript + Convex queries | Resolve authenticated source to Principal, Account and current authority facts | **AE DECISION:** exactly one integration-owned adapter. It derives human identity from server-verified Clerk claims and machine identity from admitted Credential/workload evidence, then resolves current ownership/membership and delegation. Registered endpoints and delayed work may not reconstruct this chain locally. | HIGH |
| Explicit custom builders | `convex-helpers@0.1.123` | Pre-handler authentication, authorization and checked-context injection | **FACT:** official Convex guidance recommends custom functions as explicit type-safe middleware. **AE INFERENCE:** define a small vocabulary by trust source and capability, not eight speculative modes: authenticated human, admitted machine/workload, signed internal bridge, and scheduled/reconciliation entry. Every builder validates concrete resource intent before invoking domain code. | MEDIUM |
| Thin registered functions | Convex public/internal/query/mutation/action/http action builders | Discoverable public boundary and server-only continuation boundary | **FACT:** Convex public functions are exposed to clients; internal functions narrow that surface but still need validation. **AE INFERENCE:** registered handlers validate inputs, invoke the canonical adapter, call one domain service and project a bounded result. They must not contain duplicated identity parsing, policy engines or provider orchestration. | MEDIUM |
| Optional database wrapper with `defaultPolicy: "deny"` | `convex-helpers@0.1.123` | Defense in depth for stable row-local rules | **FACT:** the official helper supports default-deny RLS wrappers. **AE INFERENCE:** use only where a row has a stable, local access rule. Do not make generic RLS the Principal/Account/delegation engine; those checks require current business context and explicit endpoint intent. | MEDIUM |

### Infrastructure

| Platform | Version posture | Purpose | Recommendation |
|---|---:|---|---|
| Convex Cloud | Managed; client 1.45.0 | Writable record, function runtime, components, scheduling, health and backup | Retain as the only stateful platform. Confirm plan-level log-stream, backup, support and limit capabilities during the operations phase. |
| Vercel Node output | Existing TanStack/Vite/Nitro deployment | Website, HTTP adapters and request-scoped OIDC bridge | Retain. Bind frontend, server output and Convex deployment to one exact release revision and evidence manifest. |
| Clerk | Hosted; SDK 1.4.9 | Human authentication | Retain for humans only; keep hosted JWT/session evidence separate from source tests. |
| Convex Workpool component | 0.4.10 | Bounded background execution | Retain one mounted component and make retry policy explicit per effect class. |
| Coinbase CDP / x402 facilitators and providers | Hosted external systems; SDKs pinned below | Payment signing, verification, settlement and resource effects | Retain behind ports. Their receipts and responses are external evidence; AE remains responsible for durable authority, history and reconciliation. |
| Infisical Cloud | Candidate hosted system | JIT secret storage | Do not make it mandatory until the SecretStore phase closes OIDC, availability, plan, audit and recovery gates. |

### Authentication and Delegation

| Technology or pattern | Version | Purpose | Recommendation and rationale | Confidence |
|---|---:|---|---|---|
| Clerk TanStack React Start SDK | 1.4.9 locked; 1.5.8 registry observation | Human authentication and JWT issuance | **FACT:** the official Convex integration uses `ClerkProvider` with `ConvexProviderWithClerk`, `auth.config.ts`, and `ctx.auth.getUserIdentity()`. **AE DECISION:** Clerk authenticates a human external identity only; it is not Account, ownership, membership or delegation authority. Upgrade separately after hosted auth regression testing. | HIGH baseline / MEDIUM behavior / LOW registry-latest |
| Convex JWT verification | Convex 1.45.0 | Validate issuer/audience and expose server identity | **AE DECISION:** all human entry paths use server-derived identity; never accept a caller-supplied user/principal/account identifier for authorization. `tokenIdentifier` is an external-binding input to the canonical adapter, not a resource owner ID. | HIGH |
| AE `DelegationService` pattern | Plain TypeScript, no new package | Multi-hop narrowing, cycle rejection, generation revocation and attribution | **AE DECISION:** do not introduce SpiceDB, OPA, Casbin, Auth0 FGA or another authorization database. Selectively review/re-land the existing candidate domain service behind injected Convex stores. **AE INFERENCE:** store immutable grant ancestry and generation in Convex, evaluate with current server time, and re-admit at consequence/reconciliation time. | HIGH decision / MEDIUM implementation pattern |
| Function argument/runtime validators | Convex `v` + Zod 4.4.3 | Validate every trust boundary | **FACT:** internal functions reduce exposure but do not make arguments or invariants trustworthy. Scheduled functions do not inherit caller auth. Every internal, callback, cron, job, worker and reconciliation entry must validate its durable context and then re-resolve authority. | MEDIUM |

### Durable Effects and Reconciliation

| Technology or pattern | Retained version | Purpose | Recommendation and rationale | Confidence |
|---|---:|---|---|---|
| `@convex-dev/workpool` | 0.4.10 | Bounded parallelism, retry control, completion callback, reactive job status and pause/cancel admission | **FACT:** repository and registry agree on 0.4.10. Retain the mounted component. Its docs require idempotent actions for retries, run `onComplete` in a separate transaction, and say cancellation does not stop in-progress work. | HIGH baseline / MEDIUM behavior |
| Convex scheduler | Convex 1.45.0 | Atomic handoff from a mutation and durable delayed work | **FACT:** scheduling from a mutation is atomic with that mutation; scheduled mutations execute exactly once, while actions are at-most-once and are not automatically retried. Auth is not propagated. Use a mutation to durably reserve/admit an invocation and enqueue an internal worker in the same transaction. | MEDIUM |
| AE invocation/effect state machine | AE-owned Convex tables and plain TypeScript | Durable intent, attempt, possibly-submitted, observation, settlement and reconciliation truth | **AE DECISION:** keep the existing durable kernel, not component status, as product truth. Every attempt has stable invocation/attempt/effect-generation/idempotency identifiers, current authority decision, provider adapter/version and bounded evidence digests. Unknown additive or irreversible outcomes remain `reconciliation_required`; never infer failure from a timeout. | HIGH decision / MEDIUM composition |
| Per-effect retry policy | Workpool per-call `retry` option | Prevent duplicate external consequences | **AE INFERENCE:** change the effective default for consequential provider actions to no retry unless the adapter proves a provider idempotency key or an observation-before-retry protocol. The current global `retryActionsByDefault: true` is acceptable only for classified idempotent jobs; it must not silently cover every provider consequence. | MEDIUM |
| Workpool status | 0.4.10 | Operational queue view | **FACT:** status has configurable TTL (one day by default) and cancel only prevents future starts/retries. Use it for operations, not retention or commercial truth. Copy terminal outcomes and correlation into AE-owned durable records. | MEDIUM |

Do not add `@convex-dev/workflow@0.4.6` in the foundation. It is a maintained first-party option for new long-lived multi-step workflows with status/cancel/restart, but adopting it now would create a second orchestration model beside AE's existing invocation state machine. Reconsider only for a bounded operator workflow whose lifecycle cannot be expressed cleanly with the retained journal plus Workpool.

### x402 and Provider HTTP 402

| Technology | Retained version | Purpose | Recommendation and rationale | Confidence |
|---|---:|---|---|---|
| `@x402/core` / `@x402/evm` / `@x402/extensions` | 2.23.0 | x402 v2 wire types, HTTP representation, EVM exact scheme and extensions | **FACT:** package/lockfile and registry agree on 2.23.0. The x402 v2 specification defines the 402 requirements, signed payment payload, facilitator verify/settle flow and settlement response. Retain exact aligned versions; do not mix major/protocol versions across packages. | HIGH baseline / MEDIUM protocol behavior |
| `@coinbase/cdp-sdk` | 1.55.0 | Managed wallet/signing and CDP facilitator integration | **FACT:** repository and registry agree on 1.55.0. Keep it behind the existing provider/payment adapter and externalized from the Convex bundle as already configured. CDP identity, wallet and spend-control evidence do not replace AE Principal/Account or budget facts. | HIGH baseline / MEDIUM behavior |
| Viem / guarded Undici | 2.55.2 / 7.29.0 | Chain receipt verification and bounded outbound HTTP | **AE DECISION:** retain behind ports. All redirects, DNS targets, body sizes, timeouts, content types and runtime schemas stay fail-closed. | HIGH |
| Provider 402 evidence | Protocol response plus AE durable record | Synchronous transactional truth | **AE DECISION:** for supported synchronous calls, the authenticated provider `402`, selected requirements, signed payload digest, resource response and settlement response/transaction are transactional truth. **AE INFERENCE:** AE still owns authority, budget admission, idempotent invocation identity, durable history, unknown-outcome reconciliation, refunds/disputes and non-x402 adapters. Protocol replay defenses do not prove that an AE resource handler ran only once. | HIGH decision / MEDIUM protocol mapping |

Do not add Quote, Order or Offer resources merely to wrap synchronous x402. Add a new commerce lifecycle only if later requirements demonstrate state independent of the provider's challenge/payment/response transaction.

### Secrets

| Technology or pattern | Version posture | Purpose | Recommendation and rationale | Confidence |
|---|---:|---|---|---|
| Replaceable AE `SecretStore` port | AE-owned interface | Fetch/create/delete a named generation without exposing material to domain code | **AE DECISION:** this is the stable boundary. Convex stores Connection metadata, secret references, generation pointers, validation/reconciliation facts and audit; it never stores provider secret material. | HIGH |
| Infisical Cloud | Candidate only | Hosted secret storage and machine-identity audit | **FACT:** Infisical supports scoped machine identities, OIDC token exchange, versioned secret retrieval, rotation and audit logs. **AE DECISION:** keep it a candidate adapter pending a hosted phase gate; no domain type may depend on Infisical IDs or response shapes. | MEDIUM |
| Vercel OIDC | `@vercel/oidc@3.2.0` locked; 3.8.5 registry observation | Obtain a short-lived workload identity token in the Vercel request context | **FACT:** Vercel supplies short-lived OIDC tokens and documents request-context retrieval. Use a tightly scoped issuer, audience, subject and environment/project claims, exchange at request time, and never persist the Vercel or Infisical token. Test 3.8.5 as a separate upgrade in the secret phase. | HIGH baseline / MEDIUM behavior / LOW registry-latest |
| Infisical REST adapter or official Node SDK | Existing bounded REST candidate; `@infisical/sdk@5.0.2` candidate | OIDC login and JIT secret retrieval | **AE INFERENCE:** do not add the SDK by default. First compare its OIDC support, response bounds, abort/timeout behavior and bundle/runtime compatibility with the existing guarded REST adapter. If selected, pin `@infisical/sdk@5.0.2` exactly behind `SecretStore`; v5 requires Node 20+, which Node 22 satisfies. | MEDIUM docs / LOW registry-latest |
| Generation-safe rotation | AE SecretPlane/Connection lifecycle pattern | Create, validate, switch and retire secret generations | **AE DECISION:** fetch JIT, keep bytes in memory only for the provider call, clear buffers where practical, validate the new generation against the target before atomically advancing the Convex pointer, and reconcile partial create/delete outcomes. Vault/auth/network failure blocks new consequential work. | HIGH |

Infisical audit logs are provider evidence, not AE's only audit trail; availability, retention and external streaming vary by plan. AE must durably record non-secret correlations and lifecycle outcomes in Convex.

### Observability and Operated Recovery

| Technology or pattern | Retained version | Purpose | Recommendation and rationale | Confidence |
|---|---:|---|---|---|
| Sentry | `@sentry/node` / `@sentry/react` 10.63.0 locked | Frontend/TanStack exceptions and Convex exception sink | **FACT:** Convex officially supports Sentry exception reporting and includes function, runtime, request, deployment and authenticated identity tags. Retain. Evaluate 10.71.0 separately; do not require it for the authority phase. Scrub secret/payment payloads before reporting. | HIGH baseline / MEDIUM behavior / LOW registry-latest |
| PostHog | node 5.39.0 / browser 1.398.2 locked | Existing analytics and supported Convex log-stream destination | **FACT:** Convex supports PostHog exception reporting/log streaming. **AE INFERENCE:** use it only if the existing deployment already owns the retention, access and alerting contract; otherwise select one operated sink in the observability phase. Do not dual-write critical business truth to analytics. | HIGH baseline / MEDIUM behavior |
| Convex dashboard, Health, Functions, Logs and Insights | Managed Convex | Immediate diagnosis, scheduler lag, failure rate, cache, conflict and limit inspection | **FACT:** official dashboards expose these signals. Bind runbooks to exact deployment and request IDs. Health dashboards are not durable evidence by themselves. | MEDIUM |
| Convex log streams | Managed Convex Pro feature | Historical function, scheduler, concurrency, audit and storage events | **FACT:** streams support Axiom, Datadog, PostHog and webhook destinations, but delivery is best effort and may drop or duplicate events. **AE INFERENCE:** stream structured non-secret telemetry with `invocationRef`, `attemptRef`, `effectGeneration`, `workId`, authority-decision reference and provider evidence reference; alert on lag, permanent failures and reconciliation age. | MEDIUM |
| AE durable audit/recovery journal | Convex application tables | Authoritative inspect/change/recover/escalate record | **AE DECISION:** every consequential denial, admission, delegation path, external attempt, observation, reconciliation and operator action is append-attributed or otherwise tamper-evident within Convex. Observability vendors receive projections, never sole truth. | HIGH |
| Convex backup/export/import plus exact-ref redeploy | Managed Convex + CLI | Disaster recovery and controlled rollback | **FACT:** backups are consistent data snapshots; restore is destructive; backups omit code, environment variables and scheduled functions; data import is beta. **AE INFERENCE:** pair backups with digest-bound code, schema, deployment, environment-name (not values), scheduled-work and evidence manifests. Take a pre-restore backup, rehearse restore into an isolated deployment, then re-admit/reconcile outstanding effects. | MEDIUM |

### Supporting Libraries

| Library | Retained version | Use |
|---|---:|---|
| `@modelcontextprotocol/sdk` | 1.30.0 | Canonical MCP transport; it carries the same Operation contracts and authority context as HTTP/CLI, not a separate business API. |
| Viem | 2.55.2 | EVM encoding and independent receipt inspection behind the x402 adapter. |
| Undici | 7.29.0 | Explicit outbound HTTP primitives behind AE's guarded network policy. |
| `@noble/curves` / `@noble/hashes` | 1.9.1 / 1.8.0 | Existing cryptographic primitives; use reviewed protocol helpers and domain-separated inputs rather than inventing payment or identity schemes. |
| `openapi-fetch` | 0.17.0 | Admitted OpenAPI provider transport behind runtime response validation. |
| Sentry / PostHog clients | Versions below | Sanitized error, product and operational projections; never authoritative invocation/audit storage. |

### Verification Stack

Retain Vitest 4.1.9, `convex-test` 0.0.56, Playwright 1.61.1, Oxlint and existing parity suites. Their role changes from broad interface coverage to exact vertical-slice evidence:

1. Drive the actual registered Convex/API/MCP/CLI reference.
2. Prove valid Principal/Account resolution and all denial/no-effect paths.
3. Re-enter through the actual scheduled/workpool target with current authority.
4. Exercise production provider and SecretStore adapters at a separately classified hosted gate.
5. Bind evidence to exact source ref, lockfile digest, deployed revision, tool version and freshness window.

Static lint may restrict raw Convex builder imports and enforce local literal categories. It must not infer aliases, dataflow, dominance, escaped capabilities or runtime authority.

## Version Posture

The repository lockfile is the phase baseline. Registry observations below are currency signals, not authorization to upgrade.

| Package | Locked | Registry observation on 2026-08-26 | Posture |
|---|---:|---:|---|
| `convex` | 1.45.0 | 1.45.0 | Retain |
| `convex-helpers` | 0.1.123 | 0.1.123 | Retain |
| `@convex-dev/workpool` | 0.4.10 | 0.4.10 | Retain |
| `@clerk/tanstack-react-start` | 1.4.9 | 1.5.8 | Separate hosted-auth upgrade spike |
| `@coinbase/cdp-sdk` | 1.55.0 | 1.55.0 | Retain |
| `@x402/core`, `@x402/evm`, `@x402/extensions` | 2.23.0 | 2.23.0 | Retain aligned exact versions |
| `@vercel/oidc` | 3.2.0 | 3.8.5 | Separate SecretStore/OIDC compatibility spike |
| `@sentry/node`, `@sentry/react` | 10.63.0 | 10.71.0 | Separate observability maintenance |
| `posthog-node` / `posthog-js` | 5.39.0 / 1.398.2 | 5.51.2 / 1.420.0 | Separate observability maintenance |
| `@infisical/sdk` | absent | 5.0.2 | Candidate only; no install before adapter ADR |
| `@convex-dev/workflow` | absent | 0.4.6 | Do not add to foundation |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|---|---|---|---|
| Authorization runtime | Convex custom builders + one AE adapter + explicit domain services | Bespoke alias/dataflow analyzer | Already failed on ordinary JavaScript forms and would become a second load-bearing platform. Keep lint locally decidable only. |
| Authorization store | Convex canonical facts | SpiceDB, OPA, Casbin, Auth0 FGA or another policy database | Violates the sole-writable-record/modular-monolith default, adds distributed consistency, and does not remove AE-specific Principal/Account/delegation semantics. Reconsider only after measured extraction triggers. |
| Human identity | Clerk JWT to canonical external binding | Treat Clerk user/org as AE Principal/Account truth | Collapses authentication into authorization and excludes autonomous-agent/workload ownership. |
| Durable work | Existing Convex scheduler + Workpool + AE journal | Temporal, BullMQ/Redis, generic event bus | Adds infrastructure and another execution truth without an evidenced need. Workpool already supplies bounded concurrency and completion; AE's journal owns commercial/effect state. |
| Multi-step workflows | Existing state machine | Add `@convex-dev/workflow` now | Duplicates orchestration semantics during the highest-risk rebaseline. Evaluate later for a clearly bounded new workflow. |
| Secrets | Replaceable `SecretStore`; Infisical Cloud candidate via OIDC | Direct Infisical types throughout domain, self-hosted vault, environment-only secrets | Vendor coupling prevents replacement; self-hosting is out of scope; static environment secrets cannot satisfy JIT generation-safe lifecycle. |
| x402 commerce | Provider challenge/payment/response truth plus AE history/reconciliation | Speculative Quote/Order/Offer hierarchy | Adds state not required by supported synchronous protocol calls and risks conflicting truth. |
| External retries | Observation/reconciliation first; retry only with proven idempotency | Global automatic retry of every action | Workpool explicitly requires idempotent actions. A timeout after an irreversible provider call is an unknown outcome, not a safe retry signal. |
| Observability | Durable Convex audit + Sentry/one log sink projections | Logs/analytics as transaction truth | Convex log streams are best effort and may duplicate/drop events. |
| Recovery | Backup + code/config/scheduled-work manifest + rehearsal | Backup alone | Convex backups exclude code, environment variables and scheduled functions; restore is destructive. |
| Data architecture | Convex modular monolith | Microservices or second writable database | No measured extraction trigger; would add distributed authority and reconciliation failure modes. |

## Installation

No baseline dependency change is recommended. Reproduce the accepted graph with:

```bash
npm ci
```

Only if the SecretStore ADR selects the official SDK after a hosted OIDC/runtime spike:

```bash
npm install --save-exact @infisical/sdk@5.0.2
```

Do not install `@convex-dev/workflow`, an external authorization engine, Redis/queue infrastructure, or an additional database for this rebaseline.

## Phase-Level Research Questions

### Authority wrapper and canonical adapter phase

- What exact checked context does each wrapper expose, and which raw Convex capabilities remain reachable after `convex-helpers` merges context?
- Which four trust-source families cover every actual registered HTTP, MCP, CLI, UI, callback, cron, job, worker and reconciliation reference without speculative registrar modes?
- How are Account selection, ambiguous membership, autonomous Account ownership, Credential/workload provenance and current server time resolved in exactly one adapter?
- What exact registered-reference adversarial tests prove substitution, destructuring and direct-builder bypasses cannot reach an effect?

### Delegation phase

- Which preserved `DelegationService` code is safe to re-land, and what storage indexes/transaction boundaries are required for multi-hop ancestry, monotonic narrowing, cycle rejection and generation revocation?
- What is the maximum supported chain depth and evaluation cost, based on measured Convex transaction limits rather than an arbitrary constant?
- Which facts are snapshotted for attribution and which must be re-read at consequence and reconciliation time?

### Durable effect and x402 phase

- Which current actions are genuinely idempotent, and where must `retry:false` override the existing Workpool default?
- What provider idempotency, receipt lookup or status API exists for each adapter; what exact states distinguish not-submitted, possibly-submitted, observed-failed, settled and reconciliation-required?
- Do deployed providers and CDP return x402 v2 fields exactly compatible with 2.23.0, and which settlement response fields are independently verified on-chain?
- How are cancellation requests represented when Workpool/scheduler cannot stop an in-progress external call?

### SecretStore phase

- Can Infisical Cloud validate Vercel's team-scoped issuer, exact project/environment subject and audience without broad globs, in every target deployment?
- Does the official Node SDK expose the required OIDC flow with equal or better timeout, abort, response-size, redirect and memory behavior than the guarded REST adapter?
- What Infisical plan supplies required audit retention/streaming, availability and regional endpoint, and what is the fail-closed operational response to vault outage?
- What hosted proof demonstrates create-new, validate, atomic pointer advance, old-generation retirement and partial-failure reconciliation without secret material entering Convex/logs/evidence?

### Observability and recovery phase

- Which single historical log destination is operationally owned, what are its retention/access/redaction rules, and does the Convex plan include log streams and periodic backups?
- What SLOs and alerts derive from scheduler lag, Workpool start lag/permanent failure, reconciliation age, authority denials, vault failures and provider unknown outcomes?
- What durable audit retention is required independently of Workpool's status TTL and Convex's scheduled-function result window?
- Can a drill restore an exact backup into an isolated deployment, redeploy the exact source/config manifest, reconstruct outstanding work, and reconcile external effects without blind replay?

## Sources

### Repository and accepted evidence — HIGH

- [`PROJECT.md`](../PROJECT.md) — locked product, authority, data, secret, commerce and execution defaults.
- [`codebase/STACK.md`](../codebase/STACK.md) — established package and runtime baseline.
- [`codebase/ARCHITECTURE.md`](../codebase/ARCHITECTURE.md) and [`codebase/INTEGRATIONS.md`](../codebase/INTEGRATIONS.md) — current component and provider seams.
- [`forensics/report-20260826-190606.md`](../forensics/report-20260826-190606.md) — accepted/rejected evidence boundary and mandatory rebaseline rules.
- [`phase-2-foundation-checkpoint-assessment.md`](../maturity-execution/reviews/phase-2-foundation-checkpoint-assessment.md) — independent decision to use runtime seams, one adapter and actual-reference slices.
- [`package.json`](../../package.json), [`package-lock.json`](../../package-lock.json), and [`convex/_generated/ai/guidelines.md`](../../convex/_generated/ai/guidelines.md) — exact local versions and project-specific Convex rules.

### Official and primary documentation — MEDIUM through available research seam

- [Convex authentication overview](https://docs.convex.dev/auth/overview), [Convex with Clerk](https://docs.convex.dev/auth/clerk), and [TanStack Start with Clerk](https://docs.convex.dev/client/tanstack/tanstack-start/clerk).
- [Convex authorization in practice](https://stack.convex.dev/authorization), [custom functions](https://stack.convex.dev/custom-functions), and [row-level security](https://stack.convex.dev/row-level-security).
- [Convex internal functions](https://docs.convex.dev/functions/internal-functions), [scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions), and [actions](https://docs.convex.dev/functions/actions).
- [Convex Workpool primary repository](https://github.com/get-convex/workpool) and [Convex Workflow primary repository](https://github.com/get-convex/workflow).
- [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md), [x402 primary repository](https://github.com/x402-foundation/x402), and [Coinbase x402 network/package examples](https://docs.cdp.coinbase.com/x402/network-support).
- [Infisical machine identities](https://infisical.com/docs/documentation/platform/identities/machine-identities), [OIDC Auth](https://infisical.com/docs/documentation/platform/identities/oidc-auth/general), [Node.js SDK](https://infisical.com/docs/sdks/languages/node), [secret rotation](https://infisical.com/docs/documentation/platform/secret-rotation/overview), and [audit logs](https://infisical.com/docs/documentation/getting-started/concepts/audit-logs).
- [Vercel OIDC federation](https://vercel.com/docs/oidc) and [OIDC helper reference](https://vercel.com/docs/oidc/reference).
- [Convex log streams](https://docs.convex.dev/production/integrations/log-streams), [exception reporting](https://docs.convex.dev/production/integrations/exception-reporting), [deployment health](https://docs.convex.dev/dashboard/deployments/health), and [function metrics](https://docs.convex.dev/dashboard/deployments/functions).
- [Convex backup and restore](https://docs.convex.dev/database/backup-restore), [data import](https://docs.convex.dev/database/import-export/import), and [production deployment](https://docs.convex.dev/production/overview).

### Registry currency observations — LOW per GSD confidence seam

Direct `npm view <package> version` observations were taken on 2026-08-26 for the version-posture table. These observations are used only to identify upgrade candidates; no upgrade recommendation depends on them without official changelog and compatibility research.

## Gaps and Confidence Notes

- Context7 was selected by the research-plan seam for library questions but was unavailable in this agent runtime; the documented fallback used primary official web sources. The confidence classifier therefore returned MEDIUM for cross-checked web findings.
- No hosted Clerk, Convex production, Vercel OIDC, Infisical Cloud, CDP facilitator, provider, Sentry or PostHog environment was accessed. Hosted behavior remains a separate phase gate.
- Infisical plan entitlements, regional endpoint, availability commitment and audit retention are not established here.
- The x402 specification establishes protocol messages and facilitator semantics; it does not establish AE operation-level exactly-once execution. That remains an AE state-machine and reconciliation responsibility.
- Current package currency does not establish upgrade safety. Security-critical dependency changes require their own lockfile diff, changelog review, hosted smoke and rollback evidence.
