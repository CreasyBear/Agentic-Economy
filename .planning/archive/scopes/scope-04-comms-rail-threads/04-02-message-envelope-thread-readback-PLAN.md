---
phase: scope-04-comms-rail-threads
plan: "04-02"
type: execute
wave: 2
depends_on: ["04-01"]
files_modified:
  - src/modules/inquiries/internal/schema.ts
  - src/modules/inquiries/internal/convex-schema.ts
  - src/modules/inquiries/internal/commands.ts
  - src/modules/inquiries/inquiry.functions.ts
  - src/modules/inquiries/inquiry.actions.ts
  - src/modules/inquiries/public.ts
  - src/modules/actions/index.ts
  - convex/inquiries.ts
  - src/routes/api.inquiry.thread.ts
  - tests/unit/inquiries/message-envelope.test.ts
  - tests/unit/inquiries/thread-readback.test.ts
  - tests/types/domain-contracts.test.ts
  - tests/integration/inquiry-thread-readback.test.ts
autonomous: true
requirements: [D1, D2, D3]
user_setup:
  - "Local Convex dev must accept schema changes: `npx convex dev --once --typecheck=disable --codegen=disable` then `npm run check:convex-codegen`. No deployed env required for source/local proof."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s4-envelope-wedge-agnostic
      statement: "messageEnvelopeV1 is a zod discriminated union on kind (question|clarification|quote|acceptance) with body + optional inReplyTo; quote.terms.quotedValue is a free-text display label, never a money primitive; no service/area/urgency fields and it does not inherit CapabilityKind."
    - id: s4-inquiry-is-thread-kind-1
      statement: "The qualified inquiry remains thread-kind #1 on the existing inquiry* tables; existing free-text first messages read as kind 'question'; no parallel thread/message tables are created."
    - id: s4-readback-by-principal
      statement: "inquiry.readThread is read-only, refuses booking/payment/dispatch, and serves both an attributed agent (keyed to its scope-3 principal) and an anonymous human (via the #22-decided readback mechanism), returning only the initiator's own thread + own redacted contact."
    - id: s4-initiator-cursor
      statement: "An initiator read cursor advances only on an actual readback, and 'read' is claimed only from a cursor advance — never inferred."
  artifacts:
    - path: src/modules/inquiries/internal/schema.ts
      provides: "messageEnvelopeV1 union, widened InquiryMessageSenderValues (+business_agent), operatedBy provenance, message kind/inReplyTo/terms fields, initiator read cursor record."
    - path: src/modules/inquiries/inquiry.actions.ts
      provides: "inquiry.readThread action contract (read-only, boundary-honest summary, agentTools + token surfaces)."
    - path: src/routes/api.inquiry.thread.ts
      provides: "Token/attributed readback route calling the module server function; thin adapter, no Convex/internal imports."
  key_links:
    - from: messageEnvelopeV1 zod union
      to: InquiryMessageRecord persisted kind/inReplyTo/terms
      via: "validator-inferred type equals exported domain type (type test)."
    - from: inquiry.readThread action
      to: readback route + agentTools
      via: "one action fans out to the public token route and the quiet agent door."
    - from: readback token / attributed principal (resolution of #22)
      to: own-thread-only readback
      via: "principal-typed authority resolved inside the Convex/server boundary, not from browser payload."
---

<objective>
Add the typed, wedge-agnostic message envelope and initiator-side thread readback the data model already anticipates. Extend the existing inquiry* tables (the inquiry is thread-kind #1), widen the message record with kind / inReplyTo / redacted terms / operatedBy and a `business_agent` sender, and ship `inquiry.readThread` keyed by principal type (attributed agent vs the #22-decided anonymous-human mechanism) plus an initiator read cursor.

Purpose: close the initiator-readback gap and give the thread a typed grammar the boundary can enforce.
Output: schema/validator widening, envelope union + type tests, readThread action + route + initiator cursor, integration readback test.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-04-INDEX.md`), load the skills named in `<skill_usage>` first, then execute this plan's tasks in order; TDD where marked. Run `<verify>` after each task. On completion, write the SUMMARY.md named in `<output>`.
</how_to_execute>

<context>
@.planning/adr/ADR-004-comms-rail-threads.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/ARCHITECTURE.md
@src/modules/inquiries/internal/schema.ts
@src/modules/inquiries/internal/convex-schema.ts
@src/modules/inquiries/inquiry.actions.ts
@src/modules/inquiries/public.ts
@convex/inquiries.ts
@src/modules/catalog/internal/catalog-model.ts
@src/modules/common/action.ts
@src/modules/common/convex-literals.ts
</context>

<standards>
- TypeScript hard spec (ENGINEERING-STANDARDS.md §TS hard spec): no `any`/`as any`/`as unknown as`/non-null assertions/`v.any()`; no broad `string` statuses; const-tuple unions with `Values`/`Schema` suffix; `satisfies Record<Union,...>` for maps; discriminated result unions for expected failures. Envelope kinds and sender/operatedBy are const tuple unions.
- Validator/source-of-truth pattern (§Validator/source-of-truth; CONVENTIONS.md Types): export `*Values as const` + zod `*Schema`; Convex validator via `literalUnion` from `@/modules/common/convex-literals`; add a type test proving validator-inferred type equals the exported domain type.
- Module seams (CONVENTIONS.md Module Design): new behavior lands in `internal/`, is surfaced via `inquiries/public.ts`; routes import only `public.ts`/`*.functions.ts`, never `internal/`; the readback route is a thin adapter.
- Action contract (ARCHITECTURE.md Action Contract; AGENTS.md:30-53): `inquiry.readThread` uses `defineAction` with strict `schema`/`outputSchema`, `readOnly: true`, boundary-honest `summary`, explicit `boundaries` (refuses booking/payment/dispatch), and is registered exactly once in `src/modules/actions/index.ts`.
- Convex standards (§Convex): validators on every function; auth/principal derived inside the Convex/server boundary (convex/authz.ts), never from browser payload; indexes for every readback query path; codegen after schema change; public queries return allowlisted DTOs only.
- exactOptionalPropertyTypes (CONVENTIONS.md Code Style): add optional keys (inReplyTo, terms, operatedBy) with conditional spreads, never `= undefined`.
- /ponytail full: extend existing tables/records; no new module, no parallel thread system.
</standards>

<antipatterns>
- Parallel `thread`/`message` tables (ADR alt rejected; bloat detector "placeholder module", ROADMAP.md:233). Catch: `npm run test:imports` + the schema diff touches only `inquiryThreads`/`inquiryMessages`; reviewer confirms no new table set.
- Envelope inheriting services-shaped CapabilityKind or adding urgency/jobSuburb (standing veto, five-scopes.md:32; ADR Q2). Catch: `npm run test:copy` banned-term + a unit assertion that envelope kinds ⊂ {question,clarification,quote,acceptance} and carry no service/area/urgency keys.
- `quotedValue` as a money primitive (money quarantine, ROADMAP.md:201). Catch: `npm run test:source-mining` (no stripe/autumn/wallet/credits/paymentHandler/amount rail fields) + a type test that `terms.quotedValue` is `string`.
- Broad `string` sender/kind or `v.any()` in the widened validator (§TS hard spec). Catch: `npm run test:ts-standards`.
- Readback returning more than the initiator's own thread/contact, or inferring 'read' without a cursor advance (ADR Q3/D7). Catch: `tests/integration/inquiry-thread-readback.test.ts` asserts own-thread-only + cursor-gated read.
- Route importing Convex schema/internal (CONVENTIONS.md Routes; test:imports route-boundary). Catch: `npm run test:imports`.
</antipatterns>

<skill_usage>
- Task 1: `domain-modeling` (message envelope as a deep, wedge-agnostic domain contract) + `convex-schema-validator` (dual TS/Convex validator sync) + `convex-migration-helper` (widening closed enums / adding fields to existing tables safely) + `tdd`.
- Task 2: `convex-best-practices` (indexed readback query, auth-derived principal, allowlisted DTO) + `convex-realtime` (initiator read cursor + reactive readback shape) + `clerk-tanstack-patterns` (attributed-principal keying) + `tanstack-router-best-practices` (thin token route) + `tdd`.
- Task 3: `convex-realtime` + `codebase-design` (readback seam through `public.ts`) + `product-design` (boundary-honest readThread summary/boundaries copy) + `tdd`.
- All tasks: `/ponytail full` and `code-review` on the closed-enum diff before finalizing.
</skill_usage>

<preflight_gates>
- resolution of #22 (initiator readback auth) and resolution of #25 (wait transport) from 04-01 MUST be recorded before Task 2; the readback mechanism + wait shape come from those decisions, not this plan.
- resolution of #27 (thread lifecycle: derive vs widen) MUST be recorded before Task 1 touches thread status handling; if #27 chose derive-only, do NOT widen `InquiryThreadStatusValues`.
- Local Convex codegen must succeed (`npm run check:convex-codegen`) — this is source/local proof, not deployed proof.
</preflight_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: messageEnvelopeV1 union + message record widening</name>
  <files>src/modules/inquiries/internal/schema.ts, src/modules/inquiries/internal/convex-schema.ts, src/modules/inquiries/public.ts, tests/unit/inquiries/message-envelope.test.ts, tests/types/domain-contracts.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D2, D8), src/modules/inquiries/internal/schema.ts:22-26,179-189, src/modules/inquiries/internal/convex-schema.ts:40-52, src/modules/common/convex-literals.ts, resolution of #27</read_first>
  <action>Add `MessageEnvelopeKindValues = ['question','clarification','quote','acceptance'] as const` + type + `messageEnvelopeV1` zod discriminated union on `kind`, each carrying `body` (prose) + optional `inReplyTo`; `quote` carries `terms: { summary: string; quotedValue?: string; validUntil?: number }` where `quotedValue` is a free-text display label (never a money primitive). Widen `InquiryMessageSenderValues` to include `business_agent`; add `MessageOperatedByValues = ['human','assistant'] as const` provenance. Extend `InquiryMessageRecord` with `kind`, optional `inReplyTo`, optional redacted/hashed `terms`, and `operatedBy` (exactOptionalPropertyTypes: conditional spreads). Mirror into `inquiryMessages` Convex table via `literalUnion` and add the fields to the validator; existing free-text first messages default to `kind: 'question'`. Surface new types through `inquiries/public.ts`. Write unit tests (envelope parses/rejects per kind; acceptance requires inReplyTo; no service/area/urgency keys) and a type test proving validator-inferred type equals the exported domain type.</action>
  <verify>npx vitest run tests/unit/inquiries/message-envelope.test.ts tests/types/domain-contracts.test.ts && npm run test:ts-standards && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - messageEnvelopeV1 parses each kind, requires inReplyTo on acceptance, and rejects service/area/urgency fields.
    - Sender union includes business_agent; operatedBy union is human|assistant; both are const tuple unions.
    - quote.terms.quotedValue is typed string (display label), with no money-rail fields on the record.
    - Convex validator and exported domain type are equal (type test) and codegen passes.
  </acceptance_criteria>
  <done>The typed, wedge-agnostic message envelope persists on the existing inquiry tables.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: inquiry.readThread action + initiator read cursor</name>
  <files>src/modules/inquiries/inquiry.actions.ts, src/modules/inquiries/inquiry.functions.ts, src/modules/inquiries/internal/commands.ts, src/modules/inquiries/internal/schema.ts, src/modules/inquiries/internal/convex-schema.ts, convex/inquiries.ts, src/modules/actions/index.ts, tests/unit/inquiries/thread-readback.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D3, D7), src/modules/inquiries/inquiry.actions.ts:96-115, convex/inquiries.ts:612-691,826-863 (submit + owner read/markRead cursor pattern), convex/inquiries.ts:1655-1699 (thread/message row mappers), resolution of #22, resolution of #25</read_first>
  <action>Define `inquiry.readThread` via `defineAction`: schema `{ threadId, readToken? }`, `readOnly: true`, surfaces `agentTools` + a public token route, boundary-honest summary and `boundaries` that refuse booking/payment/dispatch; register it in `src/modules/actions/index.ts`. Add an initiator read-cursor record + Convex table/index mirroring `inquiryReadStates` (owner) for the initiator side; a readback advances the cursor. Implement the module server function + Convex query that resolves the principal INSIDE the boundary — attributed agent keyed to its scope-3 principal (per resolution of #22), anonymous human validated via the #22-decided readback mechanism — and returns `{ thread, messages[], deliveryState, lastReadCursor, nextStep? }` restricted to the initiator's own thread + own redacted contact. Never infer 'read'; claim it only on cursor advance. Unit-test principal-typed authority, own-thread-only scoping, refusal of unsafe intents, and cursor advance semantics.</action>
  <verify>npx vitest run tests/unit/inquiries/thread-readback.test.ts && npm run test:ts-standards && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - inquiry.readThread is read-only, registered once, and refuses booking/payment/dispatch in its boundaries.
    - Attributed-agent and anonymous-human readback both return only the initiator's own thread + own redacted contact.
    - The initiator read cursor advances on readback; 'read' is never inferred without a cursor advance.
    - Principal/authority is derived inside the Convex/server boundary, not from browser payload.
  </acceptance_criteria>
  <done>Initiator-side thread readback exists for both principal types with a truthful read cursor.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Token/attributed readback route + integration proof</name>
  <files>src/routes/api.inquiry.thread.ts, src/modules/inquiries/route-readbacks.ts, tests/integration/inquiry-thread-readback.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D3), src/routes/api.agent.tools.ts (action-invoke route pattern), src/modules/inquiries/route-readbacks.ts:1-40, resolution of #25 (wait/poll shape)</read_first>
  <action>Add `src/routes/api.inquiry.thread.ts` (new) as a thin adapter that validates `{ threadId, readToken? }`, calls the inquiry module server function (never Convex/internal directly), and returns the readback JSON with no-store/JSON headers; shape the polled/reactive wait per resolution of #25. Add any route-readback helper in `route-readbacks.ts` for a token-bearing human "check your inquiry" surface. Write an integration test driving submit → readThread that proves: an anonymous human with a valid token reads back only their own thread + own redacted contact; an invalid/expired/foreign token is refused; and the cursor advance flips delivery/read state truthfully.</action>
  <verify>npx vitest run tests/integration/inquiry-thread-readback.test.ts && npm run test:imports && npm run test:copy</verify>
  <acceptance_criteria>
    - The readback route imports only module public/functions seams (route-boundary scan green).
    - Integration test proves own-thread-only readback, token refusal on invalid/expired/foreign token, and truthful read-cursor advance.
    - No booking/payment/dispatch affordance or banned public vocabulary appears in the readback surface.
  </acceptance_criteria>
  <done>The initiator can read their thread back through a boundary-honest route, proven end to end locally.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/inquiries/message-envelope.test.ts tests/unit/inquiries/thread-readback.test.ts tests/types/domain-contracts.test.ts tests/integration/inquiry-thread-readback.test.ts
- [ ] npm run test:ts-standards
- [ ] npm run test:imports
- [ ] npm run test:source-mining
- [ ] npm run test:copy
- [ ] npm run check:convex-codegen
- [ ] npm run typecheck
</verification>

<success_criteria>
- messageEnvelopeV1 is typed, wedge-agnostic, and persisted on the existing inquiry tables; existing first messages read as 'question'.
- inquiry.readThread serves both principal types, returns only own thread + own redacted contact, and refuses unsafe intents.
- 'read' is claimed only from a cursor advance; no money-rail or services-shaped fields entered the schema.
- All scans (ts-standards, imports, source-mining, copy) and Convex codegen are green (source/local proof; not deployed).
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-04-comms-rail-threads/04-02-SUMMARY.md`.
</output>
