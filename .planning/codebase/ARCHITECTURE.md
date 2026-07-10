# Architecture

**Analysis date:** 2026-07-10

## System Overview

Agentic Economy is a single TypeScript application built with TanStack Start and React, backed by Convex as its durable source of truth. Human pages, JSON APIs, streaming answer endpoints, webhooks, and quiet agent-tool endpoints are all TanStack file routes in the same deployment; there is no separate application API service.

The dominant dependency direction is:

```text
browser / assistant / provider
  -> TanStack route (`src/routes/**`)
  -> domain boundary (`src/modules/<domain>/public.ts`, `*.functions.ts`, `*.actions.ts`)
  -> source transport (`src/lib/server/convex-source.ts`)
  -> Convex function (`convex/<domain>.ts`)
  -> module-owned table fragment (`src/modules/<domain>/internal/schema.ts`)
```

Pure domain operations live below each module's public seam and can be exercised with in-memory source-state objects in tests. Production-facing `*.functions.ts` files adapt those operations to Convex. Route and component code should consume the public seams rather than reproduce domain decisions.

## Application Entry and Request Lifecycle

- `src/start.ts` configures request middleware and is the outer server boundary for security, observability, Clerk, CSRF, and source-write admission concerns.
- `src/router.tsx` constructs the TanStack Router from the generated `src/routeTree.gen.ts`; the generated route tree is not an authored architecture seam.
- `src/routes/__root.tsx` owns the HTML document, global Astryx theme/link/layer providers, route progress, focus management, observability boot/error boundary, toast host, and conditional Clerk provider.
- `src/routes/_operator.tsx` is the shared layout route for owner, administrator, and developer workspace pages. Its route options are centralized in `src/lib/operator/route-options.ts`.
- `vite.config.ts` composes TanStack Start, React, Tailwind, Nitro, and optional Sentry upload plugins. Nitro targets Vercel Node serverless (`nodejs20.x`), which permits raw request-body webhook verification and Node/WebCrypto integrations.

TanStack file routes divide into four practical surfaces:

1. Public human routes such as `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/claim.tsx`, and public answer/request views.
2. Operator routes under `src/routes/_operator/`, partitioned by `owner.*`, `admin.*`, and `developers.discovery.tsx` filenames behind the shared authenticated layout.
3. Machine routes such as `src/routes/api.businesses.search.ts`, `src/routes/api.answer.turn.ts`, discovery files, notifications, and billing/business-action webhooks.
4. Assistant-facing routes such as `src/routes/api.agent.tools.ts`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, and `src/routes/SKILL[.]md.ts`.

Files beginning with `-` in `src/routes/` and `src/routes/_operator/` are route-local helpers/components excluded from route generation. They keep page-specific presentation and readback logic near the route without creating global components.

## Domain Module Architecture

`src/modules/` is the primary architectural center. A mature module generally uses these seams:

- `public.ts`: stable domain types and operations available to other domains.
- `<domain>.functions.ts`: TanStack/server adapters and Convex transport calls.
- `<domain>.actions.ts`: reusable typed Action definitions exposed on selected surfaces.
- `server.ts`: explicitly server-only helpers where needed.
- `internal/`: implementation details, validators, policy, projections, and schema fragments.

Key modules and their ownership:

- `src/modules/common/`: branded identifiers, result types, stable hashing, audit primitives, and the reusable action contract.
- `src/modules/actions/`: the explicit global action registry. `src/modules/actions/index.ts` imports domain actions, rejects duplicate IDs, and filters by declared surface.
- `src/modules/business/`: business identity, owner/claim records, visibility, suppression, and claim-state transitions.
- `src/modules/catalog/`: published business/service/capability catalog state and owner claim/publish flows.
- `src/modules/registry/`: public list/search/detail projections and inquiry-target resolution, with optional Meilisearch acceleration and Convex fallback.
- `src/modules/discovery/`: machine-readable discovery artifacts and manifest/source-state projections.
- `src/modules/inquiries/`: qualified inquiry submission, customer records, owner inbox/thread actions, replies, and delivery bindings.
- `src/modules/procurement/`: request-hub modeling and matching across registry and inquiry records.
- `src/modules/answer/` and `src/modules/answer-thread/`: grounded answer synthesis, model/tool orchestration, streaming turns, thread persistence, public projection, and final-answer safety gates.
- `src/modules/harness/`: action/tool contracts, approval policy, run loops, session journals, evidence envelopes, and replay/run-view projections.
- `src/modules/clearance/`: principals, signed payloads, mandates, Web Bot Auth, and source-backed authorization evidence.
- `src/modules/security/`: admin authority, rate limits, CSRF, duplicate/dispute handling, and source-write admission contracts.
- `src/modules/protected-action/`: owner-pending protected proposals, policy/gateway/retention behavior, and contact follow-up.
- `src/modules/business-action/`: receipt-backed business-action proposals and Stripe-backed execution evidence.
- `src/modules/billing/`: owner billing operations, provider readback, and billing evidence projections.
- `src/modules/notification-outbox/`: durable notification commands and redacted provider-delivery state.
- `src/modules/observability/`: audit/funnel/source-sync state and operator readbacks.
- `src/modules/settings/`, `src/modules/storefront/`, `src/modules/demand/`, `src/modules/capabilities/`, `src/modules/seo/`, `src/modules/lifecycle/`, and `src/modules/dev/`: bounded supporting contexts.

Cross-domain imports should target `@/modules/<domain>/public` or an explicit adapter seam. Direct route imports from `internal/` are forbidden by `tests/imports/route-boundary.test.ts` and `tests/imports/private-imports.test.ts`.

## Action and Agent Tool Architecture

`src/modules/common/action.ts` defines the shared Action contract: Zod input/output schemas, human-readable parameters and boundaries, read-only/write classification, selected surfaces, and a single async runner. Domain actions live beside their domain, for example `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, and `src/modules/storefront/storefront.actions.ts`.

The same domain adapter can therefore serve:

- React/server functions,
- HTTP JSON routes,
- agent JSON descriptors,
- the quiet agent-tools endpoint.

Registration and exposure are separate decisions. `src/modules/actions/index.ts` explicitly registers actions; `src/modules/harness/tool-contract.ts` applies pinned allowlists before an action reaches public agent-tool or answer-model surfaces. `src/routes/api.agent.tools.ts` is only the transport edge and must not become a second action implementation.

The answer pipeline is a deeper orchestration subsystem:

```text
answer/turn route
  -> `src/modules/answer-thread/internal/turn-orchestrator.ts`
  -> intent router + tool registry/runner
  -> registry read actions and evidence assembly
  -> answer gate / snapshot finalization
  -> Convex answer-thread records
  -> SSE/public thread projection
```

Evidence, tool input, worklog, and final public prose remain distinct records. Harness run reports and receipts are evidence projections; they are not independent authorization or policy authority.

## Data Architecture

Convex is the durable database and server-function runtime. `convex/schema.ts` is deliberately composition-only: it imports table maps from each owning module and spreads them into one `defineSchema` call. Schema ownership remains in files such as:

- `src/modules/business/internal/schema.ts`
- `src/modules/inquiries/internal/convex-schema.ts`
- `src/modules/answer-thread/internal/convex-schema.ts`
- `src/modules/observability/internal/schema.ts`
- `src/modules/procurement/internal/schema.ts`

Convex function files are organized by domain in `convex/`. They expose validated queries, mutations, and actions, adapt Convex documents to module DTOs, and enforce authority from server-derived identity. `convex/authz.ts` resolves owner/admin actors from Convex/Clerk identity rather than accepting browser-supplied authority claims.

`src/lib/server/convex-source.ts` is the shared transport seam. It provides typed function references plus public and Clerk-authenticated `ConvexHttpClient` transports. Public registry reads use public transport; owner/admin writes use an authenticated Clerk token template. Missing URL/auth produces typed source errors rather than silently elevating or inventing state.

Many public modules retain pure source-state functions and deterministic dev/evaluation fixtures. Production adapters call Convex first; selected public read paths may use bounded legacy/dev fallbacks (for example `src/modules/registry/registry.functions.ts`). Those fallback paths are projections for continuity/testing, not an alternate durable store.

Generated Convex bindings under `convex/_generated/` are build artifacts and must not be hand-edited. Node-runtime integrations must be isolated from default-runtime Convex queries/mutations; action-only files that import `node:*` require `"use node"`.

## UI Architecture

The UI uses Astryx as the authoritative design system, installed via `@astryxdesign/core` and `@astryxdesign/theme-neutral`. Global theme and link adapters are installed in `src/routes/__root.tsx`; `src/components/astryx/` contains router-specific integration components.

Reusable application UI is grouped by responsibility under `src/components/ae/`:

- `layout/`, `primitives/`, `forms/`, `feedback/`, `status/`
- `landing/`, `listing/`, `inquiries/`, `operator/`
- `chat/`, `artifacts/`, `harness/`, `readback/`, `motion/`

`src/components/ai-elements/` contains lower-level answer/message/reasoning primitives. Route-local components remain in `src/routes/-*.tsx` when their ownership is a single page or route group. Cross-cutting presentational mappings live in `src/lib/ui/`, while CSS tokens and global layers live in `src/styles/`.

Server state is generally loaded through route loaders/server functions and converted to explicit readback DTOs. The code includes dedicated pending, empty, not-found, unavailable, and error components rather than treating absence as success.

## Authentication, Authorization, and Trust Boundaries

- Clerk is the human identity provider. `src/routes/__root.tsx` installs `ClerkProvider` only for sign-in/sign-up and operator paths; server auth is read through Clerk's TanStack integration.
- Convex verifies and supplies server identity. Owner/admin authority is resolved in `convex/authz.ts` and domain mutations, never trusted from browser fields.
- `src/lib/server/source-write-admission.ts` and `src/modules/security/source-write-admission.ts` define shared admission checks for source mutations.
- `src/modules/clearance/` adds agent principal, signature, mandate, Web Bot Auth, and evidence-binding logic for assistant-origin requests.
- Webhooks in `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`, and notification webhook routes form external trust boundaries; provider signatures and raw bodies are handled server-side.
- `src/modules/storefront/internal/network-guard.ts` and the SSRF drift tests constrain outbound fetch surfaces.
- Local E2E bypasses are isolated in `src/lib/server/local-e2e-bypass.ts` and `src/lib/ui/local-e2e-bypass.ts`; they are explicit test-mode seams, not general auth fallbacks.

## Observability and Failure Handling

Client and server observability adapters live in `src/lib/observability/`, with PostHog and Sentry initialization separated by runtime. Durable product audit/funnel/source-sync records belong to `src/modules/observability/` and `convex/observability.ts`.

Failure posture is explicit at boundaries:

- Zod schemas validate action and HTTP inputs/outputs.
- Module results use discriminated success/failure states rather than throwing for expected domain outcomes.
- Readback adapters distinguish unavailable/degraded/not-found from empty success.
- Provider operations retain evidence references and redacted errors.
- Registry search can fall back from Meilisearch to Convex; the source catalog remains authoritative.
- Answer turns maintain safety/finalization gates before a public projection is emitted.

## Deployment and Runtime Boundaries

- The web application builds through Vite/TanStack Start and Nitro to Vercel Node serverless, configured in `vite.config.ts`.
- Convex functions deploy independently from the `convex/` graph and own persistence, scheduled work (`convex/crons.ts`), and backend execution.
- External providers are accessed only from server/module adapter seams; credentials are read from environment variables and should not reach client bundles.
- Optional Sentry source-map upload activates only when all required Sentry build variables are present.
- `packages/ae-sdk/dist/` and `packages/ae-cli/dist/` contain untracked/generated distribution output and are not wired as npm workspaces or imported by the shipped application. They are not current application architecture.

## Architectural Enforcement

The architecture is guarded by executable checks rather than documentation alone:

- `tests/imports/route-boundary.test.ts`: route dependency boundaries.
- `tests/imports/private-imports.test.ts`: private/internal import restrictions.
- `tests/imports/backup-imports.test.ts`: stale/backup file exclusion.
- `tests/unit/schema/convex-schema.test.ts`: composed schema expectations.
- `tests/unit/convex/node-runtime-boundary.test.ts`: Convex runtime isolation.
- `tests/unit/server/source-readback-truth.test.ts`: source/readback truth boundaries.
- `tests/unit/security/ssrf-surface-drift.test.ts`: reviewed outbound network surfaces.
- `tests/ui-contract/` and `tests/copy/`: UI/design and public-claim boundaries.

The current working tree contains extensive concurrent changes across routes, modules, Convex, tests, and design artifacts. This map describes the live filesystem on 2026-07-10, including uncommitted files, and should not be read as proof that every observed change has passed the release gate.
