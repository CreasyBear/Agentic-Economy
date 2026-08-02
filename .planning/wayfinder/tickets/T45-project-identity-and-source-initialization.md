# T45 — Project identity and source initialization

Labels: `wayfinder:task`, `tdd:red`, `security`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T26, T33, T36.
Status: landed + verified at the source/local-smoke evidence boundary — create/inspect and optional guest-assertion verification are covered by `convex/workTrees.ts`, `convex/workTrees.test.ts`, `src/modules/work-tree/work-tree.functions.ts` and `src/lib/server/browser-guest-assertion.ts`; the source gate and local WorkTree smoke are green in `output/release/final-gate-2.log` and `output/release/work-tree-smoke.json.log`; open: atomic guest→Clerk claim rotation remains unavailable because no existing host/claim seam.

Blocked by: T44.

## Outcome

A person or authenticated agent receives one durable project/WorkTree reference that survives reload, re-entry and later claim without conflating browser thread, Clerk user, Customer Request or provider identity.

## Public seam

`workTree.create` and `workTree.inspect`, called by the root host and authenticated action/HTTP host.

## Red

`convex/workTrees.ts` exposes read/apply only and tests seed rows directly. Legacy decision-map authoring uses `threadId` as `projectId`. No source initializer or durable principal/claim contract exists.

## Minimal green

1. Add a source-owned create-or-resume operation accepting Customer-Request-owned or standalone lineage from ADR-009.
2. Generate opaque project identity server-side; bind owner/principal through current Clerk/agent-key/service-assertion contracts.
3. For anonymous human start, issue a signed, expiring claim secret stored in a secure cookie; claiming while authenticated rotates/revokes the anonymous binding atomically.
4. Initialize one `ae.work-tree:v1` with generation/revision, root node, authority reference and append-only creation event.
5. Register inspect-only `workTree.inspect` and bounded `workTree.create` actions with exhaustive effect metadata.
6. Make retries idempotent; collision, conflicting lineage and unauthorized read fail closed.

## TDD tracer

First failing vertical test: call the public create action twice with one idempotency key, reload through public inspect as the same principal, then attempt inspect as another principal. Expected: one project/creation receipt, stable identity/readback, and a typed forbidden refusal for the other principal. Do not assert raw tables.

## Adopted seams

Existing `defineAction`/Zod contracts, Convex source-write admission, Clerk identity, agent-key/service-assertion envelopes, canonical digest and nanoid. Custom code is limited to the project initializer and claim binding.

## Acceptance

- No UI/test caller seeds `workTrees` directly except narrow migration fixtures.
- Human and agent identities map to explicit principals; a browser thread is never identity.
- Create/resume/retry/claim/forbidden outcomes are durable and inspectable.
- Source event cap and generation/revision invariants hold from creation.

## End condition

Every later tracer can acquire a WorkTree only through this seam; direct create writes are absent.

## Source evidence

`convex/workTrees.ts:121-224`; `src/modules/work-tree/internal/contract.ts`; `src/modules/security/internal/identity-principal-map.ts`; ADR-009; ADR-010; `src/modules/answer-thread/internal/turns/proposal.ts` legacy project assignment.
