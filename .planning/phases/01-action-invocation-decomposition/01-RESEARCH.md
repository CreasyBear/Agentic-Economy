**Owner:** ActionInvocationPlanner (design phase)
**Status:** Active
**Maturity:** Current evidence (source review) + Hypothesis (barrier claim)
**Question:** What is the lowest-blast-radius, source-grounded design that makes ADR-009 partial entry and ADR-010 one-action-plane buildable — one chosen answer per decision axis?
**Decision affected:** None yet (records a recommendation; changes no ADR status)
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

# Phase 1 — Action invocation decomposition: RESEARCH

Every material statement is tagged **OBSERVED** (cited source), **INFERRED**, **UNKNOWN**, or **HYPOTHESIS** per `.planning/records/README.md`.

**Personas adopted (all fetched 200 OK from `msitarzewski/agency-agents/engineering/`; no 404, no substitution):** Codebase Onboarding Engineer + Code Reviewer (current-source review); Software Architect (seam analysis); Backend Architect + reviewer lens (persistence); Minimal Change Engineer (blast-radius); API Platform Engineer (action surface); Technical Writer (glossary + naming discipline).

---

## A. Current-source review

### A.1 The Request-owned pipeline and where authority attaches

**OBSERVED.** Every consequential customer-request action requires a Customer Request at its boundary — each action input schema extends `requestRef`:

- confirm `src/modules/customer-request/customer-request.actions.ts:36-38`
- run / cancel `:64-70`
- report-problem `:118-120`, inspect-evidence `:178`, repeat-permission `:197-199`

**OBSERVED.** Route-level authority binds a **whole RoutePlan**, not one task:

- `customerRoutePlanSchema` (`src/modules/customer-request/agent-contract.ts:364-390`) describes an entire multi-business route: `businesses` (min 1), `steps`, `maximumTotalCost`, aggregate `dataUse`, `effects`, `evidence`, `recovery`.
- `customerRoutePlanDecisionSchema` (`:508-566`) is the approval surface: `confirm.createsAuthority: literal(true)` (`:540-543`) creates authority for the whole selected option; `nextBoundary` is `confirmation` for the route (`:565`).
- `customerRequestRepeatPermissionSchema` (`:793-812`) binds standing authority to `requestRef` + `routeRef` + `revision` with **cumulative** spend/data limits across the route (`limits.cumulativeSpend`, `limits.cumulativeDataAllocations`, `occurrences`). This is the whole-route granularity ADR-009/010 want to decompose.

**OBSERVED.** The step-level trust machinery already exists — but keyed to the Request:

- `ActionPreparationLineage` (`src/modules/customer-request/action-preparation.ts:73-84`) carries `requestId`, `requestRevision`, `principalId`, `delegatedAgentId`, `planRevisionId`, `planDigest`, `actionId`, `contractRef`, `selectionKey`, `semanticDigest`. Request identity is **required**, not optional.
- The paused authority gate is `DurableActionPreparation` `kind: 'needs_authority'` (`:181`); the granted form is `AuthorizedActionPreparation` with an `authorityReservation` (`:156-159`).
- `ActionPreparationAuthorityReservation` (`:137-154`) is an opaque `authorityReference` bound to `lineage`, `authorityScopeDigest`, `approvalDigest`, `reviewDigest`, `principalId`, and a verification block — a per-preparation **reservation record** with per-action shape. **[Validation correction 2026-07-17]** This is only the reservation record; the *enforced* grant `VerifiedPreparationAuthority` (`preparation-authority.ts:35-59`), checked by `validateAuthorityScope` (`:494-499`), is **request-scoped** — it binds `requestId`/`requestRevision`/fields/recipients/purposes but **not** `actionId`, invocation ref, or prepared-input digest. Per-action authority binding therefore does **not** exist at the enforcement layer today; the axis-(iv) bound fields are net-new grant fields + scope comparisons, not reuse (see `01-VALIDATION.md` VAL-04).
- The refusal taxonomy that would drive invalidation is `PreparationAuthorityRefusalReason` (`src/modules/customer-request/preparation-authority.ts:17-34`): `authority_request_mismatch`, `authority_request_revision_mismatch`, `authority_field_denied`, `authority_recipient_denied`, `authority_purpose_denied`, `authority_expired`, `authority_revoked`, `authority_state_conflict`, and capacity overruns.
- An **in-memory** authority store already ships: `createInMemoryPreparationDisclosureStore` (`:238-334`) — the "in-memory adapter for evals" pattern spec §12 step 2 names.

### A.2 The action registry (the single seam)

**OBSERVED.** `src/modules/actions/index.ts:38-58` is the one registry array; `assertUniqueActionIds` (`:70-78`) fails fast on duplicate `id` at import. `ActionDefinition` (`src/modules/common/action.ts:88-102`) is the shape; `defineAction` returns its argument typed (`:109-113`). `ActionContext` (`:54-65`) already carries `agentIdentity` "for attribution/quota/audit only; never write authority" (`:61-62`) and `harnessApproval` (`:63-64`).

**OBSERVED — Code Reviewer note.** The live surface union is `ActionSurface = 'ui' | 'http' | 'agentJson' | 'answerThread'` (`src/modules/common/action.ts:26`). The `ae-actions-and-modules` skill still documents an `agentTools` surface and a `PublicQuietAgentToolIds` allowlist; that is **stale relative to source**. Design and any future public-door claim must be grounded in `action.ts:26`, not the skill. (The owner-only rule the skill states — owner-authenticated operations stay off agent-facing surfaces — still holds and is honored.)

**OBSERVED.** `submitInquiryAction` (`src/modules/inquiries/inquiry.actions.ts:197-217`) is a registered write (`readOnly: false` `:213`) whose input schema (`agentToolInquirySubmitSchema` `:210`) carries **no `requestRef`** and whose surfaces are `['agentJson']` (`:214`). It is already a standalone action. Its boundaries explicitly refuse booking, payment, dispatch, autonomous execution (`:203-209`). It delegates to `submitPublicInquiryThroughSource` (`:215-216`).

**OBSERVED — attributable delivery in the inquiry path.** `governed-send.ts` gives every dispatch an append-only receipt: `GOVERNED_SEND_ACTION_CLASS = 'inquiry.send:v1'` (`src/modules/inquiries/internal/governed-send.ts:24`), `GovernedSendReceiptRecord` "Append-only evidence for one admitted dispatch; mutable projections must not replace it" (`:138-149`), plus an HMAC integrity commitment (`:160-171`). Delivery state is `InquiryNotificationStatusValues = ['queued', 'sent', 'failed', 'held']` (`src/modules/inquiries/internal/schema.ts:51`). There is **no `unknown` delivery value** — the inquiry path cannot itself represent an uncertain external effect.

### A.3 Persistence: the existing durable records

**OBSERVED.** `customerRequestV2Tables` (`src/modules/customer-request/internal/convex-v2-schema.ts:722-1069`) is the module-owned fragment, spread into `customerRequestTables` (`.../internal/convex-schema.ts:239-241`, `...customerRequestV2Tables`) and into the composition root `convex/schema.ts:26` (imported `:7`). Candidate reuse targets and their **non-optional** Request keys:

- `customerRequestV2ActionAttempts` — `requestId: v.string(), requestRevision: v.number()` (`:928-931`).
- `customerRequestV2ApprovalGrants` — `requestId, requestRevision` (`:912-916`).
- `customerRequestV2PreparationAuthorityReservations` — `authorityReference` indexed, lineage-bound (`:825-831`).
- `customerRequestV2ActionAttemptResolutions` — `state: v.union(v.literal('unknown_external_state'), v.literal('succeeded'), v.literal('failed'))` (`:1045-1049`) — the observed-resolution-including-unknown analog, keyed `requestId`/`requestRevision`.
- `customerRequestV2ProviderReconciliationObservations` — `providerReconciliationObservationV2Value` (`:1035-1043`); unknown reasons `providerReconciliationUnknownReasonV2Value` = `provider_pending | evidence_invalid | provider_identity_mismatch | provider_echo_mismatch | provider_output_invalid | terminal_evidence_missing` (`:414-418`).

**OBSERVED.** A historical-record adapter already exists: `customerRequestV2StoredAggregateValue = v.union(customerRequestV2AggregateValue, legacyCustomerRequestV2AggregateValue)` with the comment "Retained historical format: new commands cannot write it, but existing signed ancestry remains readable" (`:715-720`). This is the discriminated-lineage-with-adapter pattern ADR-009 mandates (`.planning/adr/ADR-009-...md:65-74`).

**INFERRED.** Because every reuse candidate above hard-codes `requestId`/`requestRevision`, reusing any of them for a `standalone` invocation would force those Request fields optional — which ADR-009 (`.planning/adr/ADR-009-...md:73-74`) and spec §4 (`.planning/specs/ACTION-INVOCATION-ENGINEERING-SPEC.md:173-174`) forbid. That is precisely the condition under which ADR-009 permits a new table.

### A.4 What does not exist today

**OBSERVED.** `grep ActionInvocation|invocationRef|invocationOrigin|awaiting_authority|awaitingAuthority` over `src` + `convex` returns **no matches**. There is no Request-optional durable control record, no origin discriminator, no invocation-scoped four-dimension projection.

---

## B. Blast-radius comparison of the three seam options

**Persona:** Minimal Change Engineer. Scoring is files×callsites touched for slice one, reversibility (two-way vs one-way door), and reuse/spec-§12 conformance ("in-memory adapter for evals first", `.../ACTION-INVOCATION-ENGINEERING-SPEC.md:289-294`). Lower is better.

| Option | Slice-one files touched | Callsites disturbed | Reversibility | Reuse of existing handlers/registry | Spec §12 "in-memory adapter first" fit | Verdict |
|---|---|---|---|---|---|---|
| **(i) Adapter over existing handlers, discriminated `invocationOrigin`** | ~1 new adapter file + 0 edits to `submitInquiryAction` (already standalone, `inquiry.actions.ts:214`); an in-memory adapter behind the registry seam | Near-zero: reuses `src/modules/actions/index.ts:38-58` and the `*ThroughSource` fan-out (`inquiry.actions.ts:215`) | **Two-way door** — delete the adapter, nothing else changed | High — extends `defineAction`/registry, reuses inquiry action verbatim | Direct: the in-memory eval adapter IS the artifact | **CHOSEN** |
| (ii) New `action-invocation` module | New module (`public.ts`, `<m>.functions.ts`, `<m>.actions.ts`, `internal/`) before any eval | Registry import + new module wiring; parallel-registry risk | One-way-ish — a new public module seam is costly to retract; trips ROADMAP bloat detector "one-implementation adapter for later" (`.planning/ROADMAP.md:242`) | Medium — parallels rather than reuses the customer-request handlers | Indirect: builds module scaffolding before proving the interface | Rejected |
| (iii) Extracted shared step-core | Refactor of `src/modules/customer-request/` handlers + the **12** `src/lib/server/customer-request-*-api.ts` route files to call a shared core | Every Request-owned callsite in the 12 route files | **One-way door** — a broad refactor of production Request lineage before task-level evidence exists (ADR-009 "narrowing… rather than loosening", `.planning/adr/ADR-009-...md:190-191`) | Highest theoretical reuse, highest risk | Violates §12: persistence/refactor before the interface eval | Rejected |

**Conclusion (OBSERVED + INFERRED).** Option (i) is the lowest-blast-radius, only-two-way-door choice and the only one that matches spec §12's ordering. It also exploits the single most useful source fact: the first `standalone` action already exists with no Request coupling to unwind (`inquiry.actions.ts:214`).

---

## C. First-standalone-action evidence (feeds PLAN axis ii)

**OBSERVED.** `submitInquiryAction` satisfies three of spec §12's four conditions directly:
1. already standalone (no `requestRef`, `inquiry.actions.ts:210,214`);
2. attributable delivery (`governed-send.ts:24,138-149`);
3. no booking/payment/dispatch/fulfilment (`inquiry.actions.ts:203-209`).

**OBSERVED — the deciding gap.** The paused authority gate is not in the inquiry contract today (it is a one-shot write; the `needs_authority` gate lives only in the Request preparation path, `action-preparation.ts:181`), and the inquiry cannot represent an uncertain external effect (`schema.ts:51` has no `unknown`).

**INFERRED / decision input.** The Action Invocation adapter adds the `awaiting_authority` control wrapper around the existing communication-class action (spec §2 `:139`, §7 `:211-213`) — this does not make the inquiry book or fulfil. Per spec §12 (`:280-284`), the uncertain-effect / reconcile-before-retry fault path is supplied by a **provider simulator**, reusing the Request path's already-modelled `unknown_external_state` (`convex-v2-schema.ts:1048`) and reconciliation unknown reasons (`:414-418`). PLAN axis (ii) therefore selects inquiry + provider simulator for the fault path only, without expanding any public claim.

---

## D. ADR-amendment recommendation (recorded here, NOT applied)

Per `.planning/records/README.md:109-119`, a conclusion that would change an ADR is recorded as a recommendation, never an ADR edit. This phase changes **no** ADR `status` and closes **no** issue.

- **REC-01 (documentation, non-blocking).** ADR-009 lists the durable projection and the three retry classes but does not name the four state **dimensions** (desired / observed / freshness / control) as a single required tuple; ADR-010 names three (`.planning/adr/ADR-010-...md:90-96`) and omits an explicit `control` dimension in that block though it uses `awaiting_authority` elsewhere (`:75`). Recommend, at ADR review on 2026-08-17, aligning both ADRs on the same four-dimension vocabulary the PLAN defines. **Owner:** Founder (ADR decision owner). No status change now.
- **REC-02 (source-fact correction, non-blocking).** The `ae-actions-and-modules` skill documents an `agentTools` surface + `PublicQuietAgentToolIds` allowlist that does not match source (`action.ts:26` has `answerThread`, not `agentTools`). Recommend refreshing the skill; not an ADR change. Flagged so no downstream plan cites the stale surface.
- **No supersession recommended.** ADR-009 and ADR-010 remain accurate; the design fits inside their gates. Option (i) specifically honors ADR-009's instruction to prefer narrowing/reuse over loosening guardrails (`.planning/adr/ADR-009-...md:190-197`).

---

## E. Barrier claim status

**HYPOTHESIS.** "Whole-route approval is too high a barrier, so callers should authorize individually useful tasks one at a time" (ADR-009 §Product journey; SPEC R6). Named per `.planning/records/README.md:122-131`:
- **Decision it could change:** whether AE invests in per-action authorization ahead of whole-route confirmation.
- **Population:** callers (human + external agent) entering a consequential first task.
- **Comparison:** per-action authorization vs whole-route approval (the two experiment arms in PLAN axis vi).
- **Measurement / falsifier:** see PLAN §Barrier experiment (predeclared metric + threshold).
- **Evidence owner:** Founder. **Review by:** 2026-08-17.
- **Status note:** designed-only in this phase; running it needs live-funnel changes and separate authorization.

---

## F. Citation index (all verified to resolve at 2026-07-17)

1. `src/modules/customer-request/customer-request.actions.ts:36-38` — confirm action extends `requestRef`.
2. `src/modules/customer-request/agent-contract.ts:364-390` — `customerRoutePlanSchema` (whole route).
3. `src/modules/customer-request/agent-contract.ts:508-566` — `customerRoutePlanDecisionSchema`; `confirm.createsAuthority` at `:540-543`.
4. `src/modules/customer-request/agent-contract.ts:793-812` — repeat-permission cumulative route authority.
5. `src/modules/customer-request/action-preparation.ts:73-84` — `ActionPreparationLineage` (Request required).
6. `src/modules/customer-request/action-preparation.ts:137-154` — `ActionPreparationAuthorityReservation`.
7. `src/modules/customer-request/action-preparation.ts:181` — `needs_authority` paused gate.
8. `src/modules/customer-request/preparation-authority.ts:17-34` — refusal/invalidation taxonomy.
9. `src/modules/customer-request/preparation-authority.ts:238-334` — in-memory authority store.
10. `src/modules/actions/index.ts:38-58` — single registry array.
11. `src/modules/common/action.ts:26` — `ActionSurface` (source truth vs stale skill).
12. `src/modules/common/action.ts:88-102` — `ActionDefinition` shape.
13. `src/modules/inquiries/inquiry.actions.ts:197-217` — `submitInquiryAction` (standalone, no `requestRef`).
14. `src/modules/inquiries/internal/governed-send.ts:24,138-149` — attributable dispatch receipt.
15. `src/modules/inquiries/internal/schema.ts:51` — notification status (no `unknown`).
16. `src/modules/customer-request/internal/convex-v2-schema.ts:928-935` — ActionAttempts (non-optional Request keys).
17. `src/modules/customer-request/internal/convex-v2-schema.ts:1045-1049` — resolution `unknown_external_state|succeeded|failed`.
18. `src/modules/customer-request/internal/convex-v2-schema.ts:414-418` — reconciliation unknown reasons.
19. `src/modules/customer-request/internal/convex-v2-schema.ts:455-458` — control-state analog values.
20. `src/modules/customer-request/internal/convex-v2-schema.ts:715-720` — historical-record adapter union.
21. `src/modules/customer-request/internal/convex-schema.ts:239-241` — fragment composition (`...customerRequestV2Tables`).
22. `convex/schema.ts:7,26` — composition root spreads `customerRequestTables`.

*(22 citations; requirement was ≥10.)*
