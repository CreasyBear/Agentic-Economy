# T47 — Agent WorkTree parity

Labels: `wayfinder:task`, `tdd:red`, `agent-surface`, `security`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T28, T33, T36.
Status: landed + verified at the source/local-smoke evidence boundary — descriptors, source adapters, discovery, HTTP route and Convex decide/auth edits are landed in `src/modules/work-tree/work-tree-agent.actions.ts`, `src/modules/work-tree/work-tree.functions.ts`, `src/modules/discovery/internal/agent-skill.ts`, `src/lib/server/work-tree-agent-api.ts`, `src/routes/api.v1.work-tree.$operation.ts`, `src/modules/actions/index.ts` and `convex/workTrees.ts`; `/SKILL.md` carries the WorkTree parity section at `src/modules/discovery/internal/agent-skill.ts:105-108`; source verification is green in `output/release/final-gate-2.log`; open: hosted setup/deployment evidence remains T51.

Blocked by: T45, T46.

## Outcome

A cold authenticated external agent can discover, create, inspect, elaborate/study/propose and decide on the same WorkTree a person sees, with the same authority, fencing, receipt and uncertainty semantics.

## Public seam

Registered `workTree.create`, `workTree.inspect`, `workTree.apply`, `workTree.decide` actions through the authenticated action/HTTP adapter. MCP stays inspect-only unless it supplies equivalent authenticated identity and authority.

## Red

Current agent HTTP covers Customer Request operations, not WorkTree. Anonymous MCP exposes registry/sandbox reads only. There is no machine-readable create/read/propose/decide parity contract.

## Minimal green

1. Define four action descriptors with exact Zod input/output schemas and exhaustive consequence/retry/authority/uncertainty/evidence metadata.
2. Route all hosts to the same source functions used by `/`; no host-owned business logic.
3. Bind agent key/service assertion and any mandate/grant to one principal and allowed action scope.
4. `workTree.apply` accepts only the three gardener verbs; `workTree.decide` accepts only Lock/Adjust/Park.
5. Return typed accepted/refused/unknown receipts and current readback links.
6. Publish actions through the existing catalog/assistant setup and authenticated HTTP path; do not weaken anonymous MCP admission.

## TDD tracer bullets

- discover descriptors → schemas/effects match runtime contract;
- agent create + human inspect → same project/revision;
- agent propose + human inbox → same decision item/digest;
- human Lock + agent inspect → same locked receipt;
- replay same key → same receipt; changed payload → conflict;
- stale fence, missing scope or wrong principal → typed refusal and no state change.

Tests invoke the registered action boundary and human public readback, never internal Convex functions directly.

## Adopted seams

Existing `defineAction`, agent tool descriptor projection, authenticated Customer Request agent API patterns, Clerk/agent-key/service assertion, Zod and Convex source-write admission. No new protocol or agent-only state store.

## Acceptance

- Human/agent semantic parity is demonstrated both directions.
- All writes require explicit principal and authority; transcript/session state grants nothing.
- Descriptors cannot claim effects the implementation cannot perform.
- Anonymous MCP exposure does not gain a write action.
- Receipts are byte-stable on identical retry.

## End condition

A cold external agent completes the same development BAS decision loop as T46 and the human reads its exact receipt.

## Source evidence

`src/modules/actions/index.ts`; `src/modules/common/action`; `src/lib/server/customer-request-agent-api.ts`; `src/routes/api.v1.requests*.tsx`; `src/lib/server/mcp-api.ts`; `tests/unit/actions/registry.test.ts`; ADR-010.
