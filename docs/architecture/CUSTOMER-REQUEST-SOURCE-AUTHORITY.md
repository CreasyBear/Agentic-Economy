# Customer Request source authority

The production path is owned by these TypeScript sources:

| Responsibility | Authority |
| --- | --- |
| Request and capability semantics | `src/modules/customer-request/public.ts` |
| Natural-language compilation | `src/modules/customer-request/compiler.ts` |
| Preparation and authority boundaries | `src/modules/customer-request/preparation.ts` |
| Neutral-kernel routing bridge | `src/modules/customer-request/kernel-router.ts` |
| Customer-facing states | `src/modules/customer-request/customer-projection.ts` |
| Authenticated application composition | `convex/customerRequestApplication.ts` |
| Durable Request and preparation state | `convex/customerRequests.ts` |
| Machine submit, facts, resume and preparation boundaries | `src/lib/server/customer-request-api.ts`, `src/lib/server/customer-request-facts-api.ts`, `src/lib/server/customer-request-inspect-api.ts`, `src/lib/server/customer-options-api.ts` |
| Human Request workspace | `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` |
| Registered provider protocol | `src/modules/routing-kernel/http-capability-binding.ts` |

`src/routes` contains thin transport or rendering wrappers. `examples`, `tools`, tests, fixtures, and planning artifacts may exercise this path but cannot define its domain objects, state transitions, routing decisions, or success semantics. `tests/imports/customer-request-source-completeness.test.ts` enforces this boundary.

## Public Request lifecycle

An authenticated caller keeps one opaque `requestRef` and uses four HTTP operations:

- `POST /api/requests` submits natural-language intent and initial facts.
- `POST /api/requests/:requestRef/facts` supplies only fields requested by the current durable Request revision.
- `POST /api/requests/:requestRef/options` starts or safely retries option preparation.
- `GET /api/requests/:requestRef` resumes and inspects without contacting providers.

Every successful operation returns the same `CustomerRequestView` with one of `needs_information`, `ready_to_compare`, `preparing_options`, `options_ready`, `unsupported`, or `needs_attention`. Options are unranked customer cards. Binding IDs, capability IDs, Plan graphs, digests, provider schemas, attempts, and recovery references never cross this boundary.

Caller idempotency material is namespaced by the authenticated principal, operation, and Request before persistence. Fact updates authorize ownership before interpreter use, accept only currently requested fields, and merge those fields with the durable Request; callers cannot replace identity, intent, routing, prior facts, Plan structure, or capability selection.
