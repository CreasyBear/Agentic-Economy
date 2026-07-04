# Next Unlock Path
**Date:** 2026-07-03
**Frame:** Move from implementation proof to product proof
**Source inputs:** `COUNCIL_SYNTHESIS.md`, `.planning/STATE.md`, `.planning/GTM-READINESS.md`, `01-INTERNAL-ALPHA-READINESS.md`, `02-DEPLOY-SMOKE-BLOCKERS.md`

## The Next Unlock

The next unlock is **internal alpha earned by one real operating loop**, then scaled to five owner evidence rows.

```text
real owner -> published service page -> status/readback seen
-> public listing/registry/assistant discovery
-> deployed qualified inquiry -> owner read/reply/close
-> notification/provider readback -> admin reconstruction
```

This is the smallest proof that moves AE forward without expanding the narrative past the product. It proves the thing AE is allowed to be right now: a trust and discovery layer that can route a human first-contact inquiry for owner review.

## Why This Unlock

The council found the architecture is ahead of the market proof. The safe assistant contract is credible, but broad launch is blocked by missing owner and deployed inquiry evidence.

Current blockers:

- `.planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md` records `0/5` friendly-owner activation rows.
- `.planning/phases/02-human-inquiry-owner-inbox/02-DEPLOY-SMOKE-BLOCKERS.md` blocks final inquiry closeout until deployed support/provider smokes pass.
- `.planning/product-council/COUNCIL_SYNTHESIS.md` names qualified inquiry as the product hinge and real owner supply as the binding constraint.
- `.planning/GTM-READINESS.md` forbids broad launch before owner activation, attribution, support proof, and claims evidence are green.

## Product Posture Until Unlock

Allowed:

- "AE publishes checked local service pages that people and assistants can compare."
- "AE can route to a qualified inquiry when the listing supports it."
- "The business confirms timing, quote, availability, and whether to respond."
- "This is internal founder-assisted alpha proof."

Not allowed:

- Booking, payment, dispatch, guaranteed response, quote acceptance, job acceptance, autonomous fulfillment, marketplace liquidity, wallet, settlement, broad agentic commerce, or production payment/action claims.
- Public "verified" language unless a named standard exists and is met.
- Developer/protocol launch language around callable tools, MCP, SDK, mutation API, or payment/action descriptors.

## Workstream A - Owner Evidence

**Goal:** produce five friendly-owner activation rows, starting with one high-quality proof row.

Required row shape comes from `01-INTERNAL-ALPHA-READINESS.md`:

- pseudonymous owner label, source/channel, timestamp, and support owner
- activation readback with `businessId`, `stage`, `publishSeen`, `statusSeen`, `capabilityHealthSeen`, `sharedOrInterestSubmitted`, `attributionRecorded`, `lastEventAt`
- share or interest evidence: `share_url_copied` or `owner_interest_submitted`
- friction/failure note, or explicit `none_observed`
- no unresolved P0 claim/publish/index/security/copy/discovery issue
- claims register link showing public copy is supported by route/API/discovery/SEO/GTM evidence

Execution:

1. Pick one friendly owner and one narrow service category.
2. Run the owner through claim/publish/status/readback.
3. Capture share/interest and friction/failure.
4. Confirm public listing, registry result, API detail, `/llms.txt`, and agent JSON are route-live.
5. Repeat until five rows exist.

Exit criteria:

- `01-ALPHA-EVIDENCE.md` or successor evidence artifact records 5/5 rows.
- Internal alpha wording is allowed; public launch wording remains blocked.

## Workstream B - Deployed Inquiry Loop

**Goal:** make Phase 2 closeout proof pass on the deployed app with non-secret evidence.

Required sequence from `02-DEPLOY-SMOKE-BLOCKERS.md`:

1. Configure command-side smoke vars through an approved secret mechanism:
   - `DEPLOY_BASE_URL`
   - `SMOKE_PHASE2_BUSINESS_SLUG`
   - `AE_NOTIFICATION_OUTBOX_SECRET`
   - `SMOKE_NOTIFICATION_DISPATCH_ID`
   - `SMOKE_NOVU_NOTIFICATION_DISPATCH_ID`
2. Verify deployed server settings exist without recording values:
   - Convex URL
   - Clerk secret
   - Resend API key/from
   - Novu secret/workflow
   - matching outbox secret
3. Ensure deployed Convex source state has a published eligible service with a complete `human_inquiry_owner_inbox` support row.
4. Verify `/{slug}/inquiry` renders the human inquiry form, not unavailable state.
5. Create a real deployed inquiry through the public path.
6. Prove Resend and Novu dispatch IDs are source-owned and inquiry-created through `/admin/inquiries` or equivalent reconstruction.
7. Run:

```bash
npm run test:phase2-support-smoke
npm run test:provider-smoke:resend
npm run test:provider-smoke:novu
```

Exit criteria:

- `02-DEPLOY-SMOKE-EVIDENCE.md` records non-secret deployed evidence.
- Final `02-SUMMARY.md` and `02-UAT.md` may be created only after smokes are green.
- Product can claim deployed qualified inquiry proof for eligible services, not booking/payment/dispatch.

## Workstream C - Trust Red Lines

**Goal:** close the council's trust gaps before any public-facing alpha claim.

1. **Rename or standardize "verified."**
   - Inspect `src/lib/ui/status-presentation.ts`.
   - Public default should be "Checked", "Published", "Last checked", or a named standard.
   - Add/adjust tests so public surfaces cannot show unsupported "Verified".

2. **Boundary-refuse first-turn booking/payment/dispatch intent.**
   - Inspect `src/modules/answer-thread/internal/follow-up-intent.ts`.
   - Add first-turn tests for "book now", "pay today", "dispatch tonight", "accept the quote", and similar.
   - Expected behavior: boundary response and safe next step, not search/model generation that implies action.

3. **Decide booking-shaped inquiry policy.**
   - Product decision needed: should "I would like to book if available" be rejected, or accepted only as a qualified inquiry with a receipt that says no booking occurred?
   - Until decided, keep assistant-facing `inquiry.submit` stricter than human inquiry copy.

4. **Broaden answer overclaim guard.**
   - Align `src/modules/answer/internal/copy-guard-patterns.ts` with `.planning/SECURITY-SPEC.md`.
   - Cover scheduling, quote acceptance, order placement, guaranteed response, direct execute, callable mutation, autonomous marketplace, wallet, checkout, payment rail, and unsupported verification language.

Exit criteria:

- Trust red-line tests pass.
- The council's "strong with watchpoints" boundary becomes launch-stable for alpha.

## Workstream D - Attribution And Evidence

**Goal:** know whether the loop works and where demand came from.

Minimum evidence chain:

- `visitor_attributed`
- `claim_started`
- `claim_submitted`
- `publish_succeeded`
- `owner_status_viewed`
- `share_url_copied` or `owner_interest_submitted`
- `registry_search`
- `service_registry_result_clicked`
- `inquiry_started`
- `inquiry_submitted`
- `owner_inbox_viewed`
- `owner_inquiry_replied` or `inquiry_closed`
- `notification_delivered` or `notification_failed`

Add assistant-specific attribution where possible:

- agent JSON opened
- `/llms.txt` fetched
- public API search/detail fetched
- quiet agent tool listed/invoked
- answer session opened
- answer provider card clicked
- inquiry started from answer/listing/API/agent route

Exit criteria:

- Admin/operator readback can show source/channel, owner activation state, inquiry path, provider delivery state, and reconstruction refs without raw private content.

## Recommended Sequence

### Slice 1 - Proof Row Prep

Timebox: 1-2 days.

- Decide the first owner/service target.
- Confirm claim/publish/status flow on current deployment.
- Verify the deployed slug can become public and inquiry-eligible.
- Create the support record and owner activation evidence template.
- Fix any public "Verified" vocabulary leak before capturing evidence.

### Slice 2 - First Real Loop

Timebox: 2-4 days, depending on provider/env access.

- Publish one real owner listing.
- Configure deployed support/provider settings.
- Send one real deployed qualified inquiry.
- Capture owner read/reply/close and provider readback.
- Run Phase 2 support, Resend, and Novu smokes.
- Record deploy evidence.

### Slice 3 - Five Owner Alpha Gate

Timebox: 1-2 weeks, founder-assisted.

- Repeat owner activation evidence until 5/5 rows exist.
- Capture friction/failure notes.
- Ensure no P0 claim/publish/index/security/copy/discovery issue remains.
- Update alpha readiness evidence.

### Slice 4 - Alpha Narrative

Timebox: 1 day.

- Update allowed public/internal wording.
- Keep broad launch blocked.
- Keep billing/business-action/protected-action language future-gated.
- Decide whether answer-first homepage remains primary or registry/claim should dominate until supply is dense.

## Do Not Spend The Next Sprint On

- More generic agent/action breadth.
- Public billing/payment narratives.
- Public protocol/developer launch.
- Broad SEO or paid acquisition.
- Cosmetic polish that does not improve owner activation, inquiry proof, or trust boundary clarity.

## Decision Log Needed

Before execution, record these decisions:

1. **Booking-shaped inquiry policy:** reject outright, or accept as inquiry-only with explicit no-booking receipt?
2. **Trust label:** "Checked" everywhere, or define a named standard for any "Verified" use?
3. **Homepage posture:** answer-first now, or registry/claim-first until owner density improves?
4. **Provider proof threshold:** are sandbox provider sends enough for alpha, or must they be real provider events on deployed source rows?
5. **Assistant write promotion:** what rate/replay/abuse proof is required before `/api/agent/tools` is externally promoted?

## The Actual Next Phase

Recommended next phase name:

```text
07-internal-alpha-qualified-inquiry-proof
```

Phase goal:

```text
Prove that one real owner listing can be published, discovered by a person or assistant,
receive a boundary-honest qualified inquiry on the deployed app, notify the owner,
and be reconstructed by an operator without claiming booking, payment, dispatch, or autonomy.
```

Must-haves:

- one real owner activation row
- one deployed support-ready inquiry slug
- one successful deployed support smoke
- one Resend provider smoke from inquiry-created dispatch
- one Novu provider smoke from inquiry-created dispatch
- admin reconstruction evidence with no raw private content
- trust red-line tests for verified vocabulary and action-intent refusal
- explicit note that internal alpha still requires 5/5 owner rows

After that, repeat the evidence loop to reach 5/5 owners and unlock internal founder-assisted alpha.
