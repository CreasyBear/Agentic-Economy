# Customer Request source authority

The production path is owned by these TypeScript sources:

| Responsibility | Authority |
| --- | --- |
| Request and capability semantics | `src/modules/customer-request/public.ts` |
| Natural-language compilation | `src/modules/customer-request/compiler.ts` |
| Action preparation and exact route authority | `src/modules/customer-request/action-preparation.ts`, `src/modules/customer-request/prepared-action-v2.ts`, `src/modules/customer-request/route-mandate.ts` |
| Neutral-kernel routing bridge | `src/modules/customer-request/kernel-router.ts` |
| Customer-facing states | `src/modules/customer-request/customer-projection.ts` |
| Authenticated application composition | `convex/customerRequestApplication.ts` |
| Durable V2 Request aggregate | `convex/customerRequestV2.ts` |
| Durable preparation and exact RouteMandate state | `convex/customerRequestV2Preparation.ts`, `convex/customerRequestV2PreparedAction.ts`, `convex/customerRequestRouteMandate.ts` |
| Machine submit, message refinement, facts, resume, comparison, and preparation-authorization boundaries | `src/lib/server/customer-request-api.ts`, `src/lib/server/customer-request-messages-api.ts`, `src/lib/server/customer-request-facts-api.ts`, `src/lib/server/customer-request-inspect-api.ts`, `src/lib/server/customer-options-api.ts`, `src/lib/server/customer-request-authorization-api.ts` |
| External-agent admission and service assertion | `src/lib/server/customer-request-agent-auth.ts`, `src/lib/server/customer-request-agent-api.ts`, `src/modules/customer-request/service-auth-envelope.ts` |
| Human Request workspace | `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` |
| Registered provider protocol | `src/modules/routing-kernel/http-capability-binding.ts` |

`src/routes` contains thin transport or rendering wrappers. `examples`, `tools`, tests, fixtures, and planning artifacts may exercise this path but cannot define its domain objects, state transitions, routing decisions, or success semantics. `tests/imports/customer-request-source-completeness.test.ts` enforces this boundary.

The legacy V1 Customer Request tables remain in the Convex schema only so an exact indexed lookup can return `historical_request_resubmit_required`. No deployed Convex function may create, compile, evaluate, prepare, authorize, or advance a V1 Customer Request.

The V2 ApprovalGrant, ActionAttempt, provider-release, outcome, and reconciliation tables also remain schema-readable only as historical lineage and migration evidence. Their production domain modules, Convex functions, HTTP routes, application actions, and public exports are retired. New authority must use the exact RouteMandate lifecycle and its downstream admission boundary.

## Public V2 Request lifecycle

An authenticated caller keeps one opaque `requestRef`. The human surface exposes these HTTP operations:

- `POST /api/requests` submits natural-language intent and initial facts.
- `POST /api/requests/:requestRef/messages` refines the request through natural-language conversation.
- `POST /api/requests/:requestRef/facts` supplies only fields requested by the current durable Request revision.
- `POST /api/requests/:requestRef/options` compares registered eligible options.
- `POST /api/requests/:requestRef/authorization` authorizes disclosed preparation.
- `GET /api/requests/:requestRef` resumes and inspects without contacting providers.

Request operations return the same `CustomerRequestView` vocabulary, including information, comparison, authorization, outcome, completion, and recovery states. Customer option sets declare whether their cards are unranked or carry an evidence-bound recommendation. Binding IDs, capability IDs, Plan graphs, digests, provider schemas, attempts, and recovery references never cross this boundary.

Human sessions use `/api/requests`. External agents use the parallel versioned surface at `/api/v1/requests` with a Clerk API key carrying `customer_requests:create`. The server accepts only the `api_key` token type, derives the durable principal from the immutable key ID, and records the owning Clerk user or organization separately. It never forwards the API key to Convex.

The TanStack server signs each verified agent command with a 30-second HMAC assertion bound to the operation, complete command digest, key principal, owner, credential ID, scopes, and issue time. Convex verifies that assertion before reading or writing, records the principal-to-owner relationship, and then calls the same CustomerRequest application used by human sessions. The shared service key never crosses the boundary or appears in the assertion.

Caller idempotency material is namespaced by the authenticated principal, operation, and Request before persistence. Fact updates authorize ownership before interpreter use, accept only currently requested fields, and merge those fields with the durable Request; callers cannot replace identity, intent, routing, prior facts, Plan structure, or capability selection.
