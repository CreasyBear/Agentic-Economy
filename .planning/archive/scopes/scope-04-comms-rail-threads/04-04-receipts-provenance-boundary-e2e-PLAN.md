---
phase: scope-04-comms-rail-threads
plan: "04-04"
type: execute
wave: 3
depends_on: ["04-02", "04-03"]
files_modified:
  - src/modules/inquiries/route-readbacks.ts
  - src/modules/inquiries/inquiry.functions.ts
  - convex/inquiries.ts
  - src/components/ae/inquiries/AeInquiryMessage.tsx
  - src/components/ae/inquiries/AeInquiryThreadScroll.tsx
  - src/components/ae/inquiries/AeInquiryInboxPanel.tsx
  - src/lib/ui/contract-scans.ts
  - convex/devSeed.ts
  - src/routes/api.inquiry.demo-endpoint.ts
  - tests/copy/scope4-comms-rail-claims.test.ts
  - tests/copy/phase1-banned-copy.test.ts
  - tests/seo/scope4-comms-rail-claims.test.ts
  - tests/e2e/scope4-comms-rail-loop.spec.ts
autonomous: true
requirements: [D7, D8, D10, D12]
user_setup:
  - "Deployed dev/staging AE environment and at least one real networked developer/business-owned demo endpoint must be available. The endpoint must be explicitly enrolled, domain/URL pinned, scope-2 checked fresh, signed both ways, and labelled as a test/demo endpoint — not live booking, dispatch, payment, fulfilment, availability, or marketplace liquidity. Local Convex + vite + fixture may remain CI smoke only; it does not satisfy #28."
execution_scope: deployed_dev_staging_demo
production_executable: true
must_haves:
  truths:
    - id: s4-receipts-truthful
      statement: "Delivered (endpoint 2xx / provider accepted) and read (initiator/owner cursor advance) are distinct labels; absent a read signal the surface shows 'Delivered, not yet read'; business-agent read is shown per the #26 decision (UNKNOWN unless an explicit ack), never inferred from email opens."
    - id: s4-provenance-honest
      statement: "Every message surfaces sender + operatedBy; a business_agent reply is labelled 'Automated reply from {business}' on human surfaces and an assistant-submitted inquiry shows 'Sent via an assistant on behalf of a person', with no banned public vocabulary."
    - id: s4-quote-not-transaction
      statement: "A quote renders 'Proposed terms — not a booking or charge' with quotedValue as inert display text and no pay/book control; an acceptance renders 'Accepting these terms starts a separate, owner-approved step' (or the plainly-stated external next step) and emits a typed nextStep pointer into scope 5's checkpoint rail — scope 4 charges/books nothing."
    - id: s4-e2e-reconstructable
      statement: "An e2e drives attributed-agent submit -> real networked developer/business-owned test/demo endpoint signed quote reply -> initiator readback, and the whole thread is reconstructable from persisted messages + delivery receipts; the endpoint is explicitly enrolled, domain/URL pinned, signed both ways, and labelled test/demo with no fake availability or fake liquidity."
    - id: s4-copy-scans-green
      statement: "Copy/source/SEO scans reject booking/payment/dispatch/autonomous claims on scope-4 surfaces and add zero new positive-claim allowances; Astryx-only UI diff (no new bespoke Ae* primitives, no new CSS)."
  artifacts:
    - path: src/lib/ui/contract-scans.ts
      provides: "Scope-4 quote≠transaction + provenance + delivered/read copy drift rules and banned-vocab coverage."
    - path: src/routes/api.inquiry.demo-endpoint.ts
      provides: "Demo endpoint enrollment/route wiring that verifies AE's outbound signature, accepts only pinned developer/business-owned test/demo endpoints, and records signed structured quotes through inbound admission (per resolution of #28)."
    - path: tests/e2e/scope4-comms-rail-loop.spec.ts
      provides: "Full-loop reconstruction proof: submit -> signed dispatch -> signed reply -> readback -> receipts."
  key_links:
    - from: outbox attempt state (04-03)
      to: delivered receipt label
      via: "2xx / provider-accepted => 'delivered', distinct from 'read'."
    - from: initiator/owner read cursor (04-02)
      to: read receipt label
      via: "'read' only from a cursor advance; else 'Delivered, not yet read'."
    - from: acceptance message
      to: scope-5 checkpoint rail (or external next step)
      via: "typed nextStep pointer; scope 4 emits intent, never executes."
---

<objective>
Render the rail truthfully and prove the loop. Ship delivery/read receipts that never conflate delivered with read (D7, per resolution of #26), sender + operatedBy provenance labels (D8), and the quote≠transaction boundary with a typed nextStep handoff to scope 5 (D10) — all as an Astryx-only owner-inbox + thread diff. Then wire a deployed dev/staging, real networked developer/business-owned test/demo endpoint (resolution of #28) and an e2e that reconstructs the full loop from persisted receipts, and lock scope-4 copy/source/SEO scan gates so no surface can drift into a booking/payment/dispatch claim.

Purpose: make the receipted rail honest on every surface and demonstrate the scope-4 done-e2e.
Output: receipt readback + provenance/boundary copy + owner inbox UI, demo endpoint, full-loop e2e, and copy/source/SEO scan gates.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-04-INDEX.md`), load the skills named in `<skill_usage>` first, then execute this plan's tasks in order; TDD where marked. Run `<verify>` after each task. On completion, write the SUMMARY.md named in `<output>`.
</how_to_execute>

<context>
@.planning/adr/ADR-004-comms-rail-threads.md
@AGENTS.md
@.planning/GTM-READINESS.md
@DESIGN.md
@src/modules/inquiries/route-readbacks.ts
@src/components/ae/inquiries/AeInquiryMessage.tsx
@src/components/ae/inquiries/AeInquiryInboxPanel.tsx
@src/lib/ui/contract-scans.ts
@tests/copy/phase1-banned-copy.test.ts
@convex/devSeed.ts
</context>

<standards>
- Boundary posture (ADR §Boundary posture; AGENTS.md:14-28): quote renders "Proposed terms — not a booking or charge"; acceptance renders "Accepting these terms starts a separate, owner-approved step" and never says booked/paid/confirmed; delivered and read are distinct labels; no money/rail fields anywhere.
- Banned public vocabulary (AGENTS.md:90-92): human surfaces free of source-owned/readback/manifest/capability/gateway/operator/MCP/OpenAPI/callable/autonomous/agent-native/DTO/fixture; epistemic labels (KNOWN/UNKNOWN/…) stay off public human surfaces (AGENTS.md:67-72).
- UI standard (AGENTS.md:79-87; CONVENTIONS.md UI; DESIGN.md): Astryx (`@astryxdesign/core` + theme-neutral) first, Tailwind as layout glue only; NO new bespoke `Ae*` presentation primitives, shadcn/radix/cva wrappers, handwritten CSS, fontsource fonts, gradient CTAs, glassmorphism, blobs; existing `AeInquiry*` components compose Astryx.
- Theatre detector (ENGINEERING-STANDARDS.md §Theatre detector): "verified" only against a named standard; no payment-ready/marketplace/autonomous claim without the named gate.
- Testing standards (§Testing): copy scans via `contract-scans.ts` + `tests/copy`; SEO via `tests/seo`; e2e via Playwright `tests/e2e`; the class-scan (`tests/ui-contract`) rejects raw colors/transition-all/generic shadows.
- Honesty (ADR honesty rules): the demo endpoint is a real networked developer/business-owned test/demo endpoint in dev/staging, explicitly enrolled and labelled test/demo (no live booking/dispatch/payment/fulfilment/availability, no fake liquidity); local fixture proof is CI smoke only and cannot close #28 — the SUMMARY states deployed dev/staging proof and any remaining live-customer blockers plainly.
- /ponytail full: reuse existing `AeInquiry*` components and route-readback shapes; add labels/copy, not a parallel UI.
</standards>

<antipatterns>
- A quote/acceptance rendering a pay/book/confirm affordance or "booked/paid/confirmed" copy (ADR D10; AGENTS.md:16). Catch: `tests/copy/scope4-comms-rail-claims.test.ts` + `tests/ui-contract` assert no pay/book control and the exact boundary copy; e2e asserts acceptance only emits a nextStep pointer.
- Conflating delivered with read, or inferring read from email opens (ADR D7). Catch: copy scan requires distinct labels + "Delivered, not yet read"; unit/e2e assert read only on cursor advance.
- Money-rail fields (autumn/stripe/wallet/credits/paymentHandler/amount) reaching the thread/nextStep schema (money quarantine, ROADMAP.md:201). Catch: `npm run test:source-mining`.
- New bespoke `Ae*` primitive / new CSS file / gradient CTA / raw color (AGENTS.md:82-87; DESIGN.md). Catch: `npm run test:ui-contract` class-scan + reviewer confirms Astryx-only diff.
- Banned public vocabulary or public KNOWN/UNKNOWN labels leaking onto human surfaces (AGENTS.md:67-72,90-92). Catch: `npm run test:copy` banned-copy + `tests/copy/scope4-comms-rail-claims.test.ts`.
- A new positive marketing/claim allowance to make copy pass (GTM-READINESS claims register). Catch: `tests/copy/claims-register.test.ts` stays green with zero new allowances; SEO test rejects production autonomous/payment phrasing.
- The demo endpoint implying live availability, booking/dispatch/payment/fulfilment, marketplace liquidity, or an unregistered endpoint (ADR honesty; #28). Catch: e2e + copy scan assert test/demo labelling, explicit enrollment, pinned URL/domain, and no fake availability/liquidity claim.
- Marketplace/settlement/autonomous-fulfilment relapse in acceptance handoff copy (five-scopes.md:39). Catch: acceptance nextStep points to scope-5 checkpoint rail or a plainly-stated external step only.
</antipatterns>

<skill_usage>
- Task 1: `convex-realtime` (delivery/read receipt readback from cursor + attempt state) + `product-design` (truthful per-state copy) + `tdd`.
- Task 2: `impeccable` + `make-interfaces-feel-better` (owner inbox provenance UI polish, states, hierarchy) + `product-design` (boundary-honest quote/acceptance copy + nextStep affordance) + `ui-craft` (Astryx-first, anti-slop) + `tdd`.
- Task 3: `playwright` (full-loop e2e) + `security-best-practices` (demo endpoint verifies AE signature, returns signed quote) + `domain-modeling` (minimal reconstructable transcript per resolution of #28) + `tdd`.
- Task 4: `seo-audit` + `ai-seo` (SEO/AEO claim tests) + `code-review` (Standards + Spec axes on the scan gate) + `grilling` (adversarial claim phrasing).
- All tasks: `/ponytail full` (labels/copy over new UI) and `react-doctor` on touched components before finalizing.
</skill_usage>

<preflight_gates>
- 04-02 (message envelope + readThread + initiator cursor) and 04-03 (dispatch + inbound admission + rate caps) MUST be merged; this plan renders and proves their state.
- resolution of #26 (read-receipt honesty: ack vs unknown) MUST be recorded before Task 1 fixes receipt copy; render exactly the #26-decided claimable set.
- resolution of #28 (demo endpoint shape + honest labelling + minimal transcript) MUST be recorded before Task 3 builds the demo endpoint.
- The e2e requires a deployed dev/staging AE environment plus at least one explicitly enrolled, real networked developer/business-owned test/demo endpoint; local Convex + vite + seeded fixture may stay as CI smoke only and does not satisfy #28.
</preflight_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: delivery/read receipt readback (delivered ≠ read)</name>
  <files>src/modules/inquiries/route-readbacks.ts, src/modules/inquiries/inquiry.functions.ts, convex/inquiries.ts, tests/copy/scope4-comms-rail-claims.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D7), convex/inquiries.ts:770-796 (delivery readback), src/modules/inquiries/route-readbacks.ts:1-40, resolution of #26</read_first>
  <action>Extend the thread/delivery readback (initiator readThread from 04-02 and owner delivery readback) to expose a truthful receipt state per message: `delivered` from outbox attempt 2xx / provider-accepted, `read` ONLY from an initiator/owner read-cursor advance, `not_yet_read` otherwise, and business-agent read rendered per resolution of #26 (UNKNOWN unless an explicit ack event, never inferred from email opens). Return these as a typed union on the readback, not broad strings. Add the copy-rule seeds in the scope-4 claims test asserting "Delivered, not yet read" and distinct delivered/read wording. Unit-cover the delivered/read/not-yet-read/unknown mapping.</action>
  <verify>npx vitest run tests/copy/scope4-comms-rail-claims.test.ts && npm run test:ts-standards && npm run check:convex-codegen</verify>
  <acceptance_criteria>
    - Receipt state is a typed union; delivered and read are distinct and read is cursor-gated.
    - Absent a read signal the readback yields not_yet_read; business-agent read follows the #26 decision.
    - No read is inferred from email opens.
  </acceptance_criteria>
  <done>Both sides read truthful, cursor-gated delivery/read receipts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: provenance labels + quote/acceptance boundary UI (Astryx-only)</name>
  <files>src/components/ae/inquiries/AeInquiryMessage.tsx, src/components/ae/inquiries/AeInquiryThreadScroll.tsx, src/components/ae/inquiries/AeInquiryInboxPanel.tsx, src/modules/inquiries/route-readbacks.ts, tests/copy/scope4-comms-rail-claims.test.ts, tests/copy/phase1-banned-copy.test.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D8, D10, §Boundary posture), AGENTS.md:14-28,90-92, src/components/ae/inquiries/AeInquiryMessage.tsx, DESIGN.md</read_first>
  <action>Render sender + operatedBy provenance on each message: a `business_agent` reply shows "Automated reply from {business}" on human surfaces; an assistant-submitted inquiry shows "Sent via an assistant on behalf of a person" in the owner inbox. Render a `quote` as "Proposed terms — not a booking or charge" with `quotedValue` as inert display text and NO pay/book control; render an `acceptance` as "Accepting these terms starts a separate, owner-approved step" (or the plainly-stated external next step) and surface a typed `nextStep` pointer into scope 5's checkpoint rail when the business has a scope-5 action card, otherwise the external step. Keep the diff Astryx-only (compose primitives, no new bespoke Ae* component, no CSS). Add copy assertions for every label and banned-vocab coverage.</action>
  <verify>npx vitest run tests/copy/scope4-comms-rail-claims.test.ts tests/copy/phase1-banned-copy.test.ts && npm run test:copy && npm run test:ui-contract</verify>
  <acceptance_criteria>
    - Every message shows sender + operatedBy with the exact D8 human-surface copy.
    - Quote shows the "not a booking or charge" label with no pay/book control; acceptance shows the owner-approved-step copy and emits a typed nextStep pointer.
    - No banned public vocabulary; class-scan (ui-contract) green; Astryx-only diff (no new bespoke primitive/CSS).
  </acceptance_criteria>
  <done>The rail is provenance-honest and enforces quote≠transaction on every human surface.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: live demo endpoint enrollment + full-loop e2e (covers #28)</name>
  <files>src/routes/api.inquiry.demo-endpoint.ts, convex/devSeed.ts, tests/e2e/scope4-comms-rail-loop.spec.ts</files>
  <read_first>.planning/adr/ADR-004-comms-rail-threads.md (D12), src/routes/api.business-actions.stripe-webhook.ts:116-144 (signature verify), convex/devSeed.ts (seed pattern/CI fixture only), resolution of #28, resolution of #23, resolution of #24</read_first>
  <action>Add the minimal demo endpoint enrollment/route support needed for deployed dev/staging proof: an explicitly enrolled, domain/URL-pinned developer/business-owned test/demo endpoint verifies AE's outbound `Ae-Signature`, acknowledges dispatch/readback, and emits a signed structured `quote` reply through `/api/inquiry/endpoint-webhook` so inbound admission (04-03) stores the `business_agent` message. Keep any AE-operated local fixture labelled as CI smoke only. Write the Playwright e2e: attributed-agent submit -> AE dispatches signed message to the enrolled networked demo endpoint -> endpoint emits signed quote through inbound webhook -> initiator reads it back through `inquiry.readThread` -> assert the full thread (messages + delivery/read receipts) is reconstructable and the boundary copy holds (quote label, acceptance nextStep).</action>
  <verify>npx playwright test tests/e2e/scope4-comms-rail-loop.spec.ts</verify>
  <acceptance_criteria>
    - The networked test/demo endpoint verifies AE's signature and emits a signed structured quote through the inbound admission path.
    - The endpoint is explicitly enrolled, pinned, labelled test/demo, and makes no live availability, booking/dispatch/payment/fulfilment, real-business, or fake-liquidity claim.
    - The e2e reconstructs the full loop from persisted messages + receipts and the quote≠transaction copy holds.
  </acceptance_criteria>
  <done>The scope-4 done-e2e runs in deployed dev/staging against a real networked developer/business-owned test/demo endpoint.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: scope-4 copy/source/SEO scan gates (zero new allowances)</name>
  <files>src/lib/ui/contract-scans.ts, tests/copy/scope4-comms-rail-claims.test.ts, tests/seo/scope4-comms-rail-claims.test.ts</files>
  <read_first>.planning/GTM-READINESS.md, .planning/phases/06-agentic-business-action-receipts/06-06-copy-source-smoke-gates-PLAN.md (scan pattern), src/lib/ui/contract-scans.ts, tests/copy/phase1-banned-copy.test.ts</read_first>
  <action>Extend `contract-scans.ts` with scope-4 drift rules: scope-4 human surfaces must render the quote/acceptance boundary copy and the distinct delivered/read labels; they must FAIL on booking/payment/dispatch/autonomous-fulfilment phrasing, on "booked/paid/confirmed" for a quote/acceptance, on money-rail terms, and on banned public vocabulary. Add SEO/copy tests proving scope-4 surfaces never claim production autonomous/payment/marketplace capability and add ZERO new positive-claim allowances to the claims register. Confirm the acceptance handoff copy points only to scope-5's checkpoint rail or a plainly-stated external step (no settlement/marketplace/autonomy claim).</action>
  <verify>npx vitest run tests/copy/scope4-comms-rail-claims.test.ts tests/seo/scope4-comms-rail-claims.test.ts && npm run test:copy && npm run test:seo && npm run test:source-mining</verify>
  <acceptance_criteria>
    - Scope-4 copy/SEO scans reject booking/payment/dispatch/autonomous/marketplace phrasing and money-rail terms.
    - The claims register gains zero new positive-claim allowances.
    - The acceptance handoff copy routes only to scope-5 checkpoint rail or a plainly-stated external step.
  </acceptance_criteria>
  <done>Scope-4 public truth is scan-protected against transaction/autonomy drift.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/copy/scope4-comms-rail-claims.test.ts tests/copy/phase1-banned-copy.test.ts tests/seo/scope4-comms-rail-claims.test.ts
- [ ] npm run test:copy
- [ ] npm run test:seo
- [ ] npm run test:source-mining
- [ ] npm run test:ui-contract
- [ ] npm run check:convex-codegen
- [ ] npm run typecheck
- [ ] npx playwright test tests/e2e/scope4-comms-rail-loop.spec.ts (deployed dev/staging AE + real networked demo endpoint required for #28; local fixture is CI smoke only)
</verification>

<success_criteria>
- Delivered and read are distinct, cursor-gated labels; "Delivered, not yet read" shows absent a read signal; business-agent read follows #26.
- Provenance (sender + operatedBy) and quote≠transaction boundary copy render on every human surface with no pay/book control and no banned vocabulary.
- The full loop runs in deployed dev/staging against a real networked developer/business-owned test/demo endpoint, with signing/webhook/readback exercised end-to-end and reconstructable from receipts (closes #28).
- Copy/source/SEO/UI-contract scans are green with zero new positive-claim allowances; Astryx-only UI diff; SUMMARY states deployed dev/staging proof and names any remaining production/live-customer blockers.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-04-comms-rail-threads/04-04-SUMMARY.md`.
</output>
