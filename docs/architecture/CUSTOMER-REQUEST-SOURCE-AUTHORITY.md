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
| Machine submit and comparison boundaries | `src/lib/server/customer-request-api.ts`, `src/lib/server/customer-options-api.ts` |
| Human Request workspace | `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` |
| Registered provider protocol | `src/modules/routing-kernel/http-capability-binding.ts` |

`src/routes` contains thin transport or rendering wrappers. `examples`, `tools`, tests, fixtures, and planning artifacts may exercise this path but cannot define its domain objects, state transitions, routing decisions, or success semantics. `tests/imports/customer-request-source-completeness.test.ts` enforces this boundary.
