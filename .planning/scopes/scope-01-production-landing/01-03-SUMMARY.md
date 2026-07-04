# 01-03 Summary — Convex authority and source invariants

## Source changes

- Widened admin authority records to carry `tokenIdentifier` while retaining the legacy subject field for the deploy-safe dual-read window:
  - `src/modules/security/internal/schema.ts` adds optional `tokenIdentifier` and `by_tokenIdentifier_state` on `adminMemberships`.
  - `src/modules/security/public.ts` and `src/modules/security/internal/admin-authority.ts` carry optional `tokenIdentifier` through admin membership commands/results.
  - `convex/authz.ts` resolves active admin membership by `identity.tokenIdentifier` first, then falls back to `identity.subject` only when the identity issuer matches the pinned `CLERK_JWT_ISSUER_DOMAIN`; wrong-issuer subject fallback is denied.
  - `convex/authzMigration.ts` provides the idempotent internal backfill mutation for `${issuer}|${clerkUserId}`.
- Locked the quiet agent door surface in `tests/unit/actions/agent-tools-surface.test.ts`:
  - exactly `registry.search`, `registry.detail`, and `inquiry.submit` expose `agentTools`.
  - `registry.list` is explicitly excluded.
  - `inquiry.submit` is the only assistant-callable write.
  - the answer-thread tool runner rejects non-read tools.
- Removed silent source-state upsert fallback behavior:
  - `convex/source_state.ts` now throws when an `UpsertSpec` has no indexed lookup or misses a lookup field.
  - `sourceStateUpsertLookupCoverage()` exposes the spec coverage for tests.
  - `tests/unit/convex/source-state-index-guard.test.ts` snapshots every indexed source-state lookup, including the dual admin-membership lookups and `registrySearchDocuments:documentId`.
- Guarded the registry read-model path:
  - `convex/registry.ts` emits the `registry.search.fallback_used` metric only when the bounded published-business fallback scan is exercised.
  - `tests/unit/registry/registry-fallback.test.ts` now seeds `registrySearchDocuments` for the catalog query and asserts no fallback metric is emitted for the seeded happy path.
- Fixed two wave-wide TypeScript standards violations uncovered during verification:
  - `src/components/ae/chat/session-journey.ts` renamed the freeform UI sentence field from `status` to `statusText`; `src/components/ae/chat/AeSessionJourney.tsx` and `tests/unit/chat/session-journey.test.ts` were updated.
  - `src/routes/about.tsx` types `offerSteps` as a non-empty tuple and removes the non-null assertion.

## Local/source proof

- `npx vitest run tests/unit/convex/authz.test.ts` — passed: 1 file, 6 tests.
- `npx vitest run tests/unit/actions/agent-tools-surface.test.ts` — passed: 1 file, 3 tests.
- `npx vitest run tests/unit/convex/source-state-index-guard.test.ts tests/unit/registry/registry-fallback.test.ts` — passed: 2 files, 8 tests.
- `npx vitest run tests/unit/chat/session-journey.test.ts` — passed: 1 file, 9 tests.
- `npm run check:convex-codegen` — passed; dry-run reported the generated `convex/_generated/api.d.ts` delta as expected after schema/type changes.
- `npm run typecheck` — passed after the `statusText` test updates.
- `npm run test:ts-standards` — passed.

## Wave-wide verification

- `npm run test:source-mining` — passed after the source-owned public-worklog/audit-event exceptions were added to the contract scan allowlist.
- `npm run test:all` — passed end-to-end: typecheck, Convex codegen dry-run, unit, integration, types, imports, source-mining, ts-standards, copy, SEO, UI-contract, and build.

## Deferred production step

- The D5 narrow step is not complete here. Dropping subject fallback waits until 01-04 proves one deployed dual-read window with the backfill landed. Production authz-narrow proof is not claimed in this source/local summary.
