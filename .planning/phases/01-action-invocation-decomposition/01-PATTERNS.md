# Phase 1 — Codebase pattern / analog map

**Created:** 2026-07-17
**Persona:** Codebase Onboarding Engineer (+ Code Reviewer) — `msitarzewski/agency-agents/engineering/engineering-codebase-onboarding-engineer.md`, `.../engineering-code-reviewer.md` (both fetched 200 OK; no substitution).
**Scope:** Read-only. Maps each NEW design element for Action Invocation decomposition to its closest existing analog in the working tree, with `path:line`. Facts only — every row points at code actually inspected.
**Boundary:** No source edits. This is an onboarding map, not a change.

## 1-line summary

AE already owns every durable control an Action Invocation needs — preparation, a paused authority reservation, append-only attempts, idempotency, reconciliation with an explicit `unknown` outcome, and a historical-record adapter — but all of it is keyed to a Customer Request; the new work re-homes those same shapes behind a Request-optional seam.

## Null-presence confirmation (the genuinely new names)

A repository-wide search for the proposed identifiers returns nothing today, so these are net-new and cannot collide:

- `grep ActionInvocation|invocationRef|invocationOrigin|awaiting_authority|awaitingAuthority` over `src` + `convex` → **no matches**.

Everything below is therefore a *shape* analog (an existing record the new element resembles), not a name clash.

## Element → closest existing analog

| New design element | Plain-language meaning | Closest existing analog (`path:line`) | Why it is the analog | Gap the new element closes |
|---|---|---|---|---|
| `actionInvocation` control record | One durable record for a single independently-resumable call to one registered action | `customerRequestV2ActionAttempts` table `src/modules/customer-request/internal/convex-v2-schema.ts:928-935`; attempt value `:246-257` | Already the per-call execution record with a stable ref, action id, idempotency and resolution links | Attempt is keyed to `requestId`+`requestRevision` (non-optional, `:930`); the new record carries lineage as a discriminator instead of a required Request |
| `invocationOrigin` discriminator (`request_owned` \| `standalone`) | A tag saying whether the call came from a full Request or began on its own | `customerRequestV2StoredAggregateValue` union + legacy note `src/modules/customer-request/internal/convex-v2-schema.ts:715-720`; `ActionPreparationLineage` `src/modules/customer-request/action-preparation.ts:73-84` | The union-of-old-and-new format with an adapter for historical rows is exactly the discriminated-at-the-seam pattern ADR-009 asks for | Today lineage is implicit (a required `requestId`); the discriminator makes `standalone` a first-class, non-optional-Request case |
| Per-action authority reference | An approval bound to exactly one call's inputs, target, effect, limits, expiry | `ActionPreparationAuthorityReservation` `src/modules/customer-request/action-preparation.ts:137-154`; persisted table `.../internal/convex-v2-schema.ts:825-831` | Already an opaque `authorityReference` bound to lineage + `authorityScopeDigest` + approval digest, indexed for lookup | It binds a Request-scoped lineage; the new reference binds an invocation ref/version with no cross-call inheritance |
| Paused authority gate (`awaiting_authority` control state) | A call that has paused to ask a person/principal to approve before it acts | `DurableActionPreparation` `kind: 'needs_authority'` `src/modules/customer-request/action-preparation.ts:181`; refusal reasons `src/modules/customer-request/preparation-authority.ts:17-34` | The prepared-but-unapproved state and its refusal taxonomy already exist for Request-owned actions | The gate exists only inside the Request preparation path; the seam lifts it to any registered action, including the already-standalone inquiry |
| Four-dimension state projection (desired / observed / freshness / control) | Four separate readings kept apart, never one status word | observed: resolution state union `unknown_external_state\|succeeded\|failed` `.../internal/convex-v2-schema.ts:1045-1049`; freshness: `providerReconciliationUnknownReasonV2Value` `:414-418`; control: `preparationEgressStateV2Value` (`allocated\|dispatching\|released\|not_released\|uncertain`) `:455-458`; retry class `reconcile_before_retry` `.planning/adr/ADR-009-...md:218` | All four readings already exist as separate values in the Request execution path | They are not assembled into one invocation-scoped projection independent of the RoutePlan |
| In-memory eval adapter (first concrete artifact) | A memory-only stand-in used to test the interface before any database table | in-memory preparation store `src/modules/customer-request/preparation-authority.ts:238-334` (`createInMemoryPreparationDisclosureStore`) | The repo already ships an in-memory store exercising the real authority interface — the exact "in-memory adapter for evals" pattern spec §12 asks for | None new — this is a direct pattern to copy, not invent |

## Seam analogs (where a standalone call would attach)

| Concern | Existing seam (`path:line`) | Note |
|---|---|---|
| Single action registry | `src/modules/actions/index.ts:38-58` (array) + `:70-78` (`assertUniqueActionIds`) | The one place every host reaches an action; the seam extends this, does not fork it |
| Action definition shape | `src/modules/common/action.ts:88-102` (`ActionDefinition`); surfaces type `:26` | NOTE (Code Reviewer): source `ActionSurface = 'ui' \| 'http' \| 'agentJson' \| 'answerThread'` — the `ae-actions-and-modules` skill's `agentTools` wording is stale; cite source, not the skill |
| Source-adapter fan-out | `<module>.functions.ts` `*ThroughSource` pattern, e.g. `submitPublicInquiryThroughSource` used at `src/modules/inquiries/inquiry.actions.ts:215-216` | Every surface delegates to one `*ThroughSource` fn — the adapter attaches here |
| Request-ownership coupling (the thing being decomposed) | every customer-request action extends `requestRef`: `src/modules/customer-request/customer-request.actions.ts:36-38, 64-70, 118-120, 178, 197-199` | Standalone entry means an action with no `requestRef` in its boundary schema |
| Already-standalone action (no Request) | `submitInquiryAction` `src/modules/inquiries/inquiry.actions.ts:197-217` (schema `:210`, surfaces `:214`, no `requestRef`) | The natural first `standalone` origin — zero new coupling to remove |
| Convex schema-fragment composition root | `convex/schema.ts:20-37` spreads module `*Tables`; `customerRequestTables` chain `src/modules/customer-request/internal/convex-schema.ts:239-241` (`...customerRequestV2Tables`) | Any new table joins here as a module-owned fragment, per `ae-convex-guardrails` |

## Files inspected

`src/modules/common/action.ts`; `src/modules/actions/index.ts`; `src/modules/inquiries/inquiry.actions.ts`; `src/modules/inquiries/internal/commands.ts`; `src/modules/inquiries/internal/governed-send.ts`; `src/modules/inquiries/internal/schema.ts`; `src/modules/customer-request/agent-contract.ts`; `src/modules/customer-request/customer-request.actions.ts`; `src/modules/customer-request/action-preparation.ts`; `src/modules/customer-request/preparation-authority.ts`; `src/modules/customer-request/internal/convex-v2-schema.ts`; `src/modules/customer-request/internal/convex-schema.ts`; `convex/schema.ts`.

Not inspected (named but not required for the analog map): the 14 `src/lib/server/customer-request-*-api.ts` route files beyond their role listing, `route-mandate-admission.ts`, `route-mandate.ts` internals. RESEARCH covers the route-authority path.
