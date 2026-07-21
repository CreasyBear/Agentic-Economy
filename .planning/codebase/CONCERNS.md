---
last_mapped_commit: 63a451f43edea453d0a1a8d8502504433acf76fb
---

# Codebase Concerns

**Analysis Date:** 2026-07-21

**Source Anchor:** commit `63a451f43edea453d0a1a8d8502504433acf76fb`, tree `16fee2f5321d7917f7f0bccd5d59e3d6a018be64`

**Decision supported:** Phase 4 should establish Business Account, Commercial, and Usage as separate source-owned concerns before adding provider checkout or broad account UI. The smallest coherent slice is one business account with human/agent parity, one commercial entitlement, one immutable usage event, and one bounded usage readback.

## Implemented Reusable Seams

**Business identity and ownership substrate:**
- Implemented: Clerk-backed owner identity, owner-to-business linkage, claim lifecycle, source-write admission, and indexed business ownership reads already exist in `src/modules/business/internal/schema.ts`, `src/modules/business/public.ts`, `convex/business.ts`, `src/lib/server/claim-owner-session.ts`, and `convex/authz.ts`.
- Reuse: Keep `owners`, `businesses`, and claims as business-listing facts. Add a distinct Business Account aggregate and memberships rather than widening `BusinessOwnerRecord` into an organization, billing customer, and usage bucket.
- Limit: `businesses.ownerId` is a single-owner foreign key and `owners.clerkUserId` represents one Clerk user; this is not yet a multi-principal Business Account contract.

**Consequential-operation control:**
- Implemented: Action Invocation provides immutable proposals, principal/caller attribution, optimistic versions, one-effect execution, uncertainty, reconciliation, and durable projections under `src/modules/action-invocation/`, `convex/actionInvocationControl.ts`, `convex/hostedPaidOperation.ts`, and `convex/hostedPaidOperationGateway.ts`.
- Reuse: Use these controls for consequential commercial actions such as changing a paid plan only when the action truly causes an external effect. Do not make Action Invocation the owner of account status, entitlements, invoices, or product usage.
- Limit: The hosted paid operation is an evaluator-only labelled-mock action. It does not prove account billing, subscription lifecycle, settlement, or production payment.

**Bounded mandate accounting:**
- Implemented: `StandingMandateScope` and `AuthorityUse` reserve spend, count, concurrency, and worst-case loss for an authorized external action in `src/modules/action-invocation/standing-mandate.ts` and `src/modules/action-invocation/standing-mandate-policy.ts`.
- Reuse: Preserve its atomic reservation and uncertainty rules for consequential effects.
- Limit: Mandate consumption is authority accounting, not SaaS usage metering or a customer entitlement ledger. Reusing it as “usage” would couple authorization truth to commercial reporting and produce incorrect balances.

**Commercial supply disclosure:**
- Implemented: capability offerings carry price and commercial-influence disclosures in `src/modules/capability-supply/public.ts`; published operations retain price and source-labelled `PublishedOperationUsageObservation` data in `src/modules/capability-supply/published-operation.ts`.
- Reuse: Keep provider price and comparison neutrality in capability supply.
- Limit: `PublishedOperationUsageObservation` is a rolling source observation of calls and distinct payers. It is not account-attributed, event-level, billable, reversible, or suitable as AE product usage truth.

**Human/agent continuity:**
- Implemented: paid Action Detail and structured-agent responses share one paid-operation projection and durable version in `src/lib/server/hosted-paid-operation-human-api.ts`, `src/lib/server/hosted-paid-operation-agent-api.ts`, `src/modules/action-invocation/paid-operation-human-handoff.ts`, and `src/routes/actions.paid.$invocationRef.tsx`.
- Reuse: A Phase 4 account read must project the same account, entitlement, current-period usage, and safe next action to both surfaces.
- Limit: Current parity is scoped to paid operations. It does not establish Business Account or commercial/usage parity.

## Tech Debt

**No canonical Business Account aggregate:**
- Issue: The current model has Clerk users, owner records, and businesses, but no account identity with lifecycle, memberships, roles, account-to-business associations, or stable commercial principal.
- Files: `src/modules/business/internal/schema.ts`, `src/modules/business/public.ts`, `convex/business.ts`, `src/routes/_operator/owner.settings.tsx`
- Impact: Adding plans or usage directly to `owners` would bind commercial truth to one human login; adding them to `businesses` would bind customer identity to one listing. Either choice blocks teams, agent delegation, ownership transfer, and clean separation between a business record and the party paying for AE.
- Fix approach: Add a module-owned Business Account contract with immutable `accountRef`, lifecycle state, membership roles, principal bindings, and explicit business associations. Keep Clerk IDs at the identity adapter and keep listing ownership in the business module.

**Commercial policy has vocabulary but no owner:**
- Issue: The tree contains provider price, commercial-influence metadata, x402 operation payment, billing audit-event names, and old paid-activation copy, but no `src/modules/commercial/` or `src/modules/billing/` source owner.
- Files: `src/modules/capability-supply/public.ts`, `src/modules/capability-supply/published-operation.ts`, `src/modules/action-invocation/x402-payment-attempt.ts`, `src/modules/common/audit-events.ts`, `tests/copy/claims-register.test.ts`
- Impact: “Commercial” can incorrectly collapse four different facts: what a provider charges for an action, whether ranking is commercially influenced, what AE sells to a Business Account, and how an external payment is settled.
- Fix approach: Create a Commercial module that owns offer/version, entitlement grant, effective period, and account commercial state. Reference provider/action prices; do not copy them into the account plan. Keep payment attempts as evidence of payment events, not entitlement truth.

**Usage has an overloaded name and no ledger:**
- Issue: `PublishedOperationUsageObservation` stores rolling calls and distinct payers for supplied operations, while standing mandates count authority uses. Neither records immutable account-attributed AE product usage.
- Files: `src/modules/capability-supply/published-operation.ts`, `src/modules/action-invocation/standing-mandate.ts`, `src/modules/action-invocation/standing-mandate-policy.ts`
- Impact: A future quota or invoice could be derived from mutable observations or authority reservations, causing double counting, lost late events, and disagreement between billing, product UI, and agent readback.
- Fix approach: Add a Usage module with stable event identity, account, subject, metric, quantity, occurred/recorded timestamps, source, correction linkage, and idempotency key. Build bounded period summaries from that ledger; commercial policy consumes summaries but does not own events.

**Account-labelled UI is user-profile settings:**
- Issue: the owner settings page calls Clerk's `UserProfile` “Account” and links to listing/message settings, but exposes no Business Account identity, membership, commercial state, entitlement, or usage.
- Files: `src/routes/_operator/owner.settings.tsx`, `src/modules/settings/settings.functions.ts`, `src/lib/server/claim-owner-session.ts`
- Impact: Phase 4 can accidentally treat an existing label as account maturity and bolt commercial state onto notification preferences.
- Fix approach: Keep personal identity/security in Clerk profile. Add a Business Account projection with explicit account identity and separate Commercial and Usage sections backed by their source owners.

**Trial-specific paid-operation host is too broad to become the account host:**
- Issue: durable paid-operation persistence, Phase 3C proof headers, evaluator admission, child records, and readback coexist in `convex/hostedPaidOperation.ts` and `convex/hostedPaidOperationGateway.ts`.
- Files: `convex/hostedPaidOperation.ts`, `convex/hostedPaidOperationGateway.ts`, `src/modules/action-invocation/hosted-paid-operation-creation.ts`
- Impact: Reusing the host wholesale would couple Business Account maturity to sandbox providers, proof-packet history, and one paid-operation semantics version.
- Fix approach: Reuse the neutral Action Invocation application contracts and persistence patterns. Give Business Account, Commercial, and Usage their own schema fragments and thin Convex adapters.

**Stale future-state artefacts look implemented:**
- Issue: billing event vocabulary, billing admission key names, a Phase 5 Autumn/Stripe claims register, and a Phase 6 Stripe smoke remain despite no active billing module or Stripe/Autumn runtime dependency.
- Files: `src/modules/common/audit-events.ts`, `tests/helpers/source-write-admission.ts`, `tests/copy/claims-register.test.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `package.json`
- Impact: Plans can mistake reserved names and conditional harnesses for source ownership or reachable product behavior.
- Fix approach: Treat these files as compatibility/planning residue until a live route traces to an authoritative commercial transition. Supersede or quarantine stale phase artefacts when Phase 4 defines the new owner; do not design backward from their vocabulary.

## Known Bugs

**Exact-revision focused release gate has one stale response fixture:**
- Symptoms: the refreshed test map reports `npm run verify:phase3c:release-source` at the source anchor with 16/17 files and 187/188 tests passing; `humanHandoff` is present in the agent response but absent from one exact expected fixture.
- Files: `src/lib/server/hosted-paid-operation-agent-api.ts`, `src/modules/action-invocation/paid-operation-human-handoff.ts`, `tests/unit/server/hosted-paid-operation-agent-auth.test.ts`
- Trigger: Run `npm run verify:phase3c:release-source` at commit `63a451f43edea453d0a1a8d8502504433acf76fb`.
- Workaround: None for a clean Phase 3C source-gate claim. This mismatch is inherited by Phase 4 and should be recorded separately from new account work.

**No confirmed Phase 4 runtime bug:**
- Symptoms: Business Account commercial and usage behavior cannot fail at runtime because no such end-to-end behavior exists.
- Files: `src/modules/business/internal/schema.ts`, `src/routes/_operator/owner.settings.tsx`, `src/modules/capability-supply/published-operation.ts`
- Trigger: Attempt to trace an account plan or account usage read from a human or agent route.
- Workaround: None; this is missing ownership, not a defect to patch in a route.

## Security Considerations

**Human and agent account principals are not normalized:**
- Risk: human paid-operation auth uses Clerk `userId`, while agent auth prefers `orgId`, then `userId`, then token subject. The business owner schema binds only `clerkUserId`.
- Files: `src/lib/server/hosted-paid-operation-human-api.ts`, `src/lib/server/hosted-paid-operation-agent-auth.ts`, `src/modules/business/internal/schema.ts`
- Current mitigation: paid-operation records compare source-owned principal/caller references and refuse mismatches within that action lifecycle.
- Recommendations: Resolve both human sessions and API keys through one Business Account membership adapter before any account, entitlement, or usage read/write. Never infer account membership from a matching email, listing owner, API-key scope, or Clerk organization field alone.

**Commercial state must not authorize consequential actions:**
- Risk: an active plan or remaining quota could be treated as permission to spend, disclose data, call a provider, or execute an action.
- Files: `src/modules/action-invocation/standing-mandate.ts`, `src/modules/action-invocation/paid-operation-application-service.ts`, `src/modules/common/action.ts`
- Current mitigation: current consequential operations require exact source-owned authority and preserve attempt/effect generations.
- Recommendations: Keep entitlement admission and consequence authority as two checks with different refusal codes. An entitlement may permit product access; it never grants a mandate or approves an external effect.

**Future provider webhooks need independent admission:**
- Risk: adding checkout callbacks directly to Commercial state would let duplicate, reordered, unsigned, or ambiguous provider events overwrite account truth.
- Files: `src/routes/api.notification.resend-webhook.ts`, `src/modules/notification-outbox/`, `src/modules/action-invocation/reconciliation-evidence.ts`
- Current mitigation: analogous notification and paid-operation seams preserve signature verification, idempotency, uncertainty, and reconciliation patterns.
- Recommendations: When a provider is selected, ingest signed provider events into an append-only provider-event inbox, deduplicate by provider event identity, reconcile before changing entitlement, and retain the source event reference. No provider is required for the first source-owned Phase 4 slice.

## Performance Bottlenecks

**No bounded account-usage read model:**
- Problem: there is no account-period index, usage cursor, or bounded summary from which human and agent surfaces can read current usage.
- Files: `src/modules/capability-supply/published-operation.ts`, `convex/schema.ts`, `src/routes/_operator/owner.settings.tsx`
- Cause: existing usage data is an optional rolling observation embedded in a published operation, not an account event stream.
- Improvement path: index immutable usage events by `(accountRef, metric, occurredAt)` and idempotency identity; maintain bounded period summaries with explicit as-of and correction markers. Paginate detail reads.

**Business duplicate detection performs an unbounded collect:**
- Problem: a claim mutation collects all matching claim fingerprints before selecting the first match.
- Files: `convex/business.ts`
- Cause: `by_fingerprint_status` uses `.collect()` even though only one duplicate is consumed.
- Improvement path: replace with `.first()` or a deliberately bounded `.take(limit)` before Phase 4 adds more account/membership checks to claim paths.

**Generic source-state loading remains full-table:**
- Problem: compatibility source loading can call `.collect()` for entire tables.
- Files: `convex/source_state.ts`, `convex/business.ts`
- Cause: early source-state adapters materialize broad arrays for module transitions.
- Improvement path: new Business Account, Commercial, and Usage ports must be operation-specific and indexed. Do not extend `loadPhaseOneSourceState` with growing account or usage tables.

## Fragile Areas

**Business owner versus Business Account boundary:**
- Files: `src/modules/business/internal/schema.ts`, `src/modules/business/public.ts`, `convex/business.ts`, `src/lib/server/claim-owner-session.ts`
- Why fragile: owner, authenticated user, listing ownership, operator role, and future commercial principal are adjacent but not equivalent.
- Safe modification: add explicit IDs and association records; migrate one route at a time through a shared account resolver; keep old listing ownership readable until account membership parity is proven.
- Test coverage: claim and owner tests exist under `tests/unit/business/` and business/registry integration suites, but no account membership, transfer, multi-principal, or entitlement tests exist.

**Commercial versus action-payment boundary:**
- Files: `src/modules/capability-supply/public.ts`, `src/modules/action-invocation/x402-payment-attempt.ts`, `src/modules/action-invocation/paid-operation-semantics.ts`, `src/modules/common/audit-events.ts`
- Why fragile: all carry money-related fields but answer different questions: provider price, external effect payment, lifecycle semantics, and audit vocabulary.
- Safe modification: establish separate domain types and reference identities across boundaries. Never infer entitlement from an Action Receipt or infer provider settlement from active commercial status.
- Test coverage: paid-operation tests are extensive under `tests/unit/action-invocation/`; there are no Business Account commercial lifecycle tests.

**Human/agent projection parity:**
- Files: `src/lib/server/hosted-paid-operation-human-api.ts`, `src/lib/server/hosted-paid-operation-agent-api.ts`, `src/routes/_operator/owner.settings.tsx`, `src/routes/api.v1.paid-operations.$invocationRef.ts`
- Why fragile: current parity is operation-specific, while owner settings has only a human route and no account API projection.
- Safe modification: define one account-semantic projection and thin human/agent adapters. Both must expose the same account reference, entitlement state, usage as-of time, uncertainty, and safe continuation without sharing transport-specific navigation.
- Test coverage: Phase 3D proves labelled local paid-operation handoff only. No cross-surface account parity eval exists.

## Scaling Limits

**Single-user ownership model:**
- Current capacity: each business row has one `ownerId`, and each owner row has one `clerkUserId` in `src/modules/business/internal/schema.ts`.
- Limit: teams, role delegation, multiple businesses under one account, account transfer, and agent membership cannot be represented without overloading owner identity.
- Scaling path: use account memberships and account-business associations with indexed current-state reads; preserve owner/listing provenance separately.

**Usage event volume:**
- Current capacity: no production account usage event capacity or retention contract is encoded in `convex/schema.ts`.
- Limit: deriving totals by scanning raw events will exceed Convex read limits as accounts and periods grow.
- Scaling path: append idempotent events, increment bounded aggregates transactionally where safe, reconcile aggregates from paginated events, and retain explicit late/correction semantics.

## Dependencies at Risk

**Clerk organization semantics are present only at one adapter edge:**
- Risk: `orgId` is accepted by paid-operation agent auth, but Business records and human paid-operation auth remain user-based.
- Impact: adopting Clerk Organizations as the Business Account source by implication would create different principals across human and agent routes.
- Migration plan: make an explicit product decision whether Clerk organization is identity-provider metadata or the account authority. In either case, persist AE-owned account and membership references and map Clerk subjects/orgs through a tested adapter.

**Stripe and Autumn are absent runtime dependencies:**
- Risk: stale copy and smoke artefacts can cause Phase 4 to assume SDK behavior, webhook contracts, checkout sessions, or portal semantics that do not exist in `package.json` or live source.
- Impact: provider-first implementation would set the account model around one vendor before entitlement and usage meaning is stable.
- Migration plan: keep Phase 4 provider-neutral through the first account/commercial/usage loop. Add one provider adapter only after the source-owned lifecycle and reconciliation eval pass.

## Missing Critical Features

**Load-bearing Business Account owner:**
- Problem: no stable account aggregate, membership/role model, account lifecycle, or business association exists.
- Blocks: trustworthy commercial principal, human/agent parity, team access, transfer, account-scoped usage, and provider customer mapping.
- Files: `src/modules/business/internal/schema.ts`, `src/modules/business/public.ts`, `convex/schema.ts`

**Load-bearing Commercial owner:**
- Problem: no source-owned offer version, entitlement, effective period, commercial state transition, or provider-event reconciliation exists.
- Blocks: paid access, plan enforcement, explainable current state, and safe provider integration.
- Files: `src/modules/common/audit-events.ts`, `tests/copy/claims-register.test.ts`, `package.json`

**Load-bearing Usage owner:**
- Problem: no immutable account-attributed usage event or bounded period summary exists.
- Blocks: quotas, usage explanation, commercial enforcement, dispute reconstruction, and consistent human/agent readback.
- Files: `src/modules/capability-supply/published-operation.ts`, `src/modules/action-invocation/standing-mandate.ts`, `convex/schema.ts`

**Load-bearing account auth and route projection:**
- Problem: no route resolves a human or agent caller to a common Business Account and returns account/commercial/usage truth.
- Blocks: the Phase 4 customer loop and its parity eval.
- Files: `src/lib/server/hosted-paid-operation-human-api.ts`, `src/lib/server/hosted-paid-operation-agent-auth.ts`, `src/routes/_operator/owner.settings.tsx`, `src/routes/api.v1.paid-operations.ts`

**Optional breadth after the core loop:**
- Problem: checkout, billing portal, invoices, multiple tiers, proration, tax, discounts, team administration UI, usage dashboards, exports, and provider-specific metering are not implemented.
- Blocks: commercial breadth, but not the first account-entitlement-usage source loop.
- Files: `tests/copy/claims-register.test.ts`, `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `package.json`

## Test Coverage Gaps

**Business Account lifecycle and membership:**
- What's not tested: account creation, duplicate mapping, member invite/removal, role refusal, business association, transfer, suspended account, and cross-account isolation.
- Files: `tests/unit/business/`, `tests/integration/`, `src/modules/business/internal/schema.ts`
- Risk: identity-provider subjects, listing owners, and commercial principals can be conflated without detection.
- Priority: High

**Commercial and Usage separation:**
- What's not tested: an immutable usage event changing a bounded usage summary without directly changing entitlement; a commercial transition consuming that summary without owning or rewriting the event; late, duplicate, correction, and wrong-account events.
- Files: `src/modules/capability-supply/published-operation.ts`, `src/modules/common/audit-events.ts`, `tests/unit/action-invocation/`
- Risk: incorrect quota, billing, or access decisions can become unreconstructable.
- Priority: High

**Human-agent account parity:**
- What's not tested: one human session and one scoped agent credential resolving to the same account projection and seeing the same entitlement, usage total, as-of time, refusal, and continuation.
- Files: `src/lib/server/hosted-paid-operation-human-api.ts`, `src/lib/server/hosted-paid-operation-agent-auth.ts`, `src/routes/_operator/owner.settings.tsx`
- Risk: one surface can appear active or under quota while the other is refused or stale.
- Priority: High

**Provider reconciliation:**
- What's not tested: signed duplicate/out-of-order provider events, ambiguous checkout return, refund, dispute, provider outage, and reconciliation repair for an account entitlement.
- Files: `tests/deploy-smoke/phase6-business-action-stripe-smoke.spec.ts`, `src/modules/action-invocation/reconciliation-evidence.ts`
- Risk: provider state could overwrite source-owned account truth or silently grant/revoke access.
- Priority: Medium until a provider adapter enters scope; High at that boundary.

## Evidence Ceiling

- Evidence class: source inspection of exact commit `63a451f43edea453d0a1a8d8502504433acf76fb` and tree `16fee2f5321d7917f7f0bccd5d59e3d6a018be64`, plus the six refreshed codebase maps in `.planning/codebase/`.
- Verification performed: no tests, browser run, provider call, deployment, schema mutation, or hosted readback was run by this concerns mapping task.
- Maximum claim: the map identifies implemented source seams, missing Phase 4 source owners, stale artefacts, and likely blast radius. It does not prove Phase 4 behavior, provider billing, real payment, production readiness, customer value, or hosted human-agent parity.

---

*Concerns audit: 2026-07-21 (commit 63a451f43edea453d0a1a8d8502504433acf76fb)*
