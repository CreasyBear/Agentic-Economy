# Project research record: External literature validation of ADR-009/ADR-010 architectural bets

**Owner:** Engineering
**Status:** Active
**Maturity:** Current evidence (external primary sources, 2024–2026)
**Question:** Do ADR-009's partial-entry/durable-execution model and ADR-010's one-action-plane model match the current state of the art, and did the ADRs use their cited procurement literature faithfully?
**Decision affected:** ADR-009 / ADR-010 acceptance (both remain `proposed`); Phase 1/2 execute-phase backlogs
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

Three independent web-research passes (read-only scouts; primary sources only; every claim carries a URL). Verdicts: **durable execution = ALIGNED-WITH-GAPS**, **procurement literature use = FAITHFUL**, **one-action-plane bets = 4/4 SUPPORTED, 0 contradicted**.

## A. Durable execution & exactly-once patterns — ALIGNED-WITH-GAPS

The spec's model (stable `invocationRef`; per-attempt `attemptRef` + idempotency identity + monotonic effect generation; expiring worker leases with explicit takeover; CAS on version/generation; stale worker may record attributable observations but cannot make them current; three retry classes; reconcile-before-retry for uncertain external effects; append-only records + current projection) sits squarely on 2024–2026 state of the art. **OBSERVED** mappings:

- **Reconcile-before-retry is an established pattern**, not novel: payments/durable-execution literature universally treats timeout ≠ failure as an ambiguous outcome that must be resolved against provider truth before retry (Stripe idempotency docs; DBOS; Kleppmann). The spec's contribution is naming it a first-class retry class and forbidding generic workers from converting unknown→failure — a standard-conformant hardening.
- **Generation fences + leases are the canonical stale-worker defense**: Kleppmann's fencing-token argument (https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) is exactly "monotonic generation + CAS + stale owner may record but not make current"; leases (Gray & Cheriton 1989) provide liveness only — the spec correctly rests **safety** on the generation CAS, not lease-timer accuracy.
- **Three retry classes map 1:1 to industry categories**: replayable ≈ idempotent/safe-to-repeat (Temporal activity idempotency, https://docs.temporal.io/activity-definition; https://temporal.io/blog/idempotency-and-durable-execution); attributable_retry ≈ at-least-once-visible communication (SQS at-least-once); reconcile_before_retry ≈ payments "ambiguous outcome" reconciliation. The tripartite naming is spec-original [INFERRED]; each class is established.

**Gaps the literature treats as load-bearing (fold into the execute-phase backlog):**
1. **Transactional outbox** at the commit-attempt→invoke-provider dispatch seam — the spec does not name it; the literature treats it as the standard answer to "record intent and dispatch atomically."
2. **Idempotency-key retention / dedup-window policy** — providers prune operation tables; the spec never states a retention contract.
3. **Lease heartbeat-renewal cadence/timeout detail** — renewal/takeover is named but not specified.
4. **Bind the prepared-input digest to the idempotency identity itself** (same key + different payload ⇒ reject), not only to the authority reference.

## B. Procurement lifecycle standards (ADR-009's crosswalk) — FAITHFUL

Verified the internal crosswalk's load-bearing claims against primaries:

- **OCDS 1.1.5** (https://standard.open-contracting.org/latest/en/primer/how/): stages joined by an OCID — an *identifier* joining independently published releases, **not a gating parent object**. OCDS is the one standard with a whole-process umbrella, so the crosswalk's broadest "no lifecycle owner" framing is mildly OVERREAD for OCDS — but ADR-009's narrower claim survives. [OBSERVED]
- **UBL 2.3 Quotation** (https://docs.oasis-open.org/ubl/os-UBL-2.3/mod/summary/reports/UBL-Quotation-2.3.html): a standalone document whose `RequestForQuotation_DocumentReference` has **cardinality 0..1 — a quotation can legally exist with no parent RFQ/procurement**. The strongest single external datapoint for standalone entry; the ADR actually undersells it. [OBSERVED]
- **Peppol BIS Order Agreement 42** (https://docs.peppol.eu/poacc/upgrade-3/2025-Q4/profiles/42-orderagreement/): purchases may originate in web shops/phone/physical visits and be fed in afterwards; the seller *commits*, the buyer *records and verifies* — the best external analog of ADR-009's "imported commitments remain attributable claims." [OBSERVED]
- **Peppol BIS Invoice Response 63** (https://docs.peppol.eu/poacc/upgrade-3/profiles/63-invoiceresponse/): transport acks split from business responses; one business status at a time; may begin at a later status. Supports partial entry as normal practice. [OBSERVED]
- **US FAR Subpart 46.5** (https://www.acquisition.gov/far/subpart-46.5): acceptance is a bounded act by an authorized role, delegable via 42.202(g); inspection distinct from acceptance. [OBSERVED] (FAR Part 49 / 52.246-12 anchors not re-fetched line-by-line: UNVERIFIED, corroborated indirectly.)

**Answers:** (1) Yes — all four standards decompose into separately referenced, independently meaningful documents/acts. (2) **No standard requires a parent "whole procurement" object before a quotation exists** — supports ADR-009's standalone entry. (3) "Imported claims stay attributed to source" has no single named standard concept but is realized by sender-assigned IDs + named issuing parties + document references + Peppol seller-commit/buyer-verify [INFERRED, faithful].

## C. One action plane, generative UI, per-action authority — 4/4 SUPPORTED

- **Same registered actions for every host = the industry-convergent shape.** MCP servers expose one tool surface (`tools/list`/`tools/call`) consumed by any host (https://modelcontextprotocol.io/docs/learn/architecture); OpenAI Apps SDK builds human-clickable components on the same MCP tool calls (https://developers.openai.com/apps-sdk/build/mcp-server); SWE-agent's ACI thesis treats the tool surface as a first-class designed interface (https://arxiv.org/abs/2405.15793). [OBSERVED] Note: MCP does not *forbid* host-side logic — ADR-010's "adapters may not implement business rules" is its own discipline, consistent with but not enforced by the protocol.
- **Generative UI as select-and-populate registered components = dominant practice.** Vercel AI SDK connects tool results to pre-built components — the model selects, never authors (https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces); Apps SDK: render from `structuredContent`, authoritative data in backend, component-local state not durable (https://developers.openai.com/apps-sdk/plan/components). Documented failure modes are exactly ADR-010's named state-divergence risk. **MIXED nuance:** the tooling *permits* free-form generation — invent-nothing is a convention AE must self-enforce (matches Phase 2 VAL-203's required subset validator). [OBSERVED]
- **Structured non-visual equivalents + resumable human approval = shipping precedents.** Apps SDK's `structuredContent` JSON is the non-visual equivalent of every component (fallback prescribed when a component can't render); LangGraph `interrupt()`/`Command(resume)` is a durable paused approval resumable by human OR agent from the same checkpoint (https://docs.langchain.com/oss/python/langgraph/interrupts) — a production precedent for ADR-010 gates 3/4/7/9. Caveat worth importing: LangGraph re-executes pre-interrupt node code on resume — reinforcing "business inputs come from durable records, never recomputation." [OBSERVED]
- **Per-action authority separated from journey authority = exactly where 2026 agentic commerce landed.** Google AP2 splits Intent / Cart / Payment mandates; the Payment Mandate binds a hash of the exact checkout (`transaction_id` = hash of `checkout_jwt`), expiry, budget/recurrence limits, and a delegate-chain reference (https://ap2-protocol.org/ap2/payment_mandate/) — **a field-for-field analog of ADR-010's authority reference (prepared-input digest, expiry, invalidation on material change)**. x402 is per-request/stateless authorization (https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works); ACP delegates payment per-checkout (https://developers.openai.com/commerce/specs/payment) [ACP internals INFERRED from spec index]. [OBSERVED]

## Implications

1. The ADRs' architecture is **externally corroborated**; nothing in the literature contradicts a load-bearing bet. AP2's mandate design is the single strongest external validation of the per-action authority binding.
2. Fold the four §A gaps (outbox, dedup retention, heartbeat spec, digest-bound idempotency identity) into the Phase 1 execute-phase backlog before Task 3/4 are built.
3. The invent-nothing subset validator (Phase 2 VAL-203) is confirmed necessary by §C: no framework enforces it for you.
4. The crosswalk's one OCDS overread does not propagate into ADR-009; no ADR text change needed.

---
*Sources verified via live web fetch 2026-07-17; no fabricated citations. Read-only; no ADR edited.*
