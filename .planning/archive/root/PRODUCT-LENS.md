# Engineering Review Lenses

**Purpose:** force hard review decisions. This is not positioning copy.

Use this file during planning and PR review. If a proposed change cannot survive these lenses, cut it.

## `/ponytail full` lens

Question: what is the smallest correct thing we can ship without lying?

### Required cuts

- No future-phase folders.
- No interfaces with one implementation unless the external dependency actually varies in Phase 1.
- No adapter for a provider not called in Phase 1.
- No route for a surface that is not in the launch flow.
- No custom queue/cache/rate-limit/slug library until native/stdlib/existing dependency fails.
- No generated SDK, CLI, marketplace, or developer gallery until API demand exists.

### Acceptable laziness

- In-memory adapter in a unit test if the module interface is real.
- One deterministic slug suffix strategy before sophisticated name reservation.
- AE-hosted `/{slug}/ucp` fallback if standard origin discovery is clearly documented as not yet available.
- Lifecycle class as a type contract only; no runtime engine.

### Rejected laziness

- Skipping auth checks.
- Skipping index failure readbacks.
- Skipping suppression/dispute path.
- Shipping public copy that says a future phase is live.
- Skipping tests for trust-boundary mutations.

## Stripe senior SWE lens

Question: would this survive a payments/platform design review later?

### Patterns to require

- Stable IDs on every durable record.
- Idempotency for retryable mutations and projection writes.
- Append-only audit events for consequential transitions.
- Provider/rail-specific facts stay behind adapters.
- Failure states are modeled, queryable, and user/operator-visible.
- Billing/Checkout/Connect are future rails, not Phase 1 domain concepts.

### Anti-patterns to reject

- Payment readiness from env/config/screenshots.
- Manual billing loops or raw PaymentIntent/subscription semantics in domain code.
- Fake wallet/credits/balance fields.
- `stripeCustomerId` or `x402Wallet` leaking into `businesses` before money phase.
- Webhook directly granting entitlement without server-side readback and idempotency.
- Treating ABR verification, owner authority, and payment authority as one thing.

### Phase 1 Stripe-grade gate

Even with no payments, the code must be ready for future money by having clear ownership, audit, idempotency, and operator reconstruction. No money code is better than fake money code.

## Coinbase/protocol lens

Question: does the protocol projection describe real server-enforced capability?

### Patterns to require

- UCP/MCP/OpenAPI outputs generated from source-owned state.
- `available`, `degraded`, and `unavailable` are explicit states.
- Payment/callable descriptors appear only when enforcement/reconciliation exists.
- Principal/actor authority is separate from business identity.
- No custody language without regulated external holder/readback.

### Anti-patterns to reject

- x402/USDC/Base/Stripe becoming the domain model.
- Manifest fields hand-maintained in the DB as authority.
- `paymentRequired: true` before quote/authorize/settle/readback exists.
- `callable: true` before protected-action gateway exists.
- Protocol copy on owner pages.
- Generic standard-discovery claim when only AE-hosted fallback exists.

## Matt Pocock TypeScript lens

Question: are the types doing real work or decorating unsafe code?

### Patterns to require

- Literal unions for states.
- `satisfies Record<Union, ...>` for mappings.
- Zod/Convex validators at trust boundaries and inferred types inside.
- Typed result unions for expected failures.
- Tests through module interfaces.
- No global dumping ground for validators/types.

### Anti-patterns to reject

- `any` in domain modules.
- Routine `as` casts.
- Non-null assertions to skip state modeling.
- `string` statuses.
- Boolean soup: `isLive`, `isPublished`, `isVerified`, `isIndexed` fighting each other.
- Barrel exports hiding ownership.
- Tests that only prove mocks were called.

## Codebase-design lens

Question: does this module buy leverage and locality?

### Patterns to require

- Module has one external interface.
- Complexity hides behind the interface.
- Callers do not need to know implementation ordering details.
- Tests use the same interface as callers.
- One module owns each state machine.

### Anti-patterns to reject

- Pass-through modules.
- Service directories grouped by framework instead of behavior.
- Cross-module private imports.
- Shared utility extracted before the second real use.
- Abstraction added because a later phase might need it.

## Security lens

Question: what can an attacker or bad claimant do on day one?

Reject if:

- caller supplies owner ID,
- publish mutation trusts browser state,
- slug claim has no rate limit/collision handling,
- duplicate claim has no audit path,
- suppression does not remove public/search/manifest exposure,
- public projection leaks email/phone/token/private owner data,
- logs store raw sensitive payloads,
- admin route lacks explicit admin check.

## CEO/founder scope lens

Question: does this make Phase 1 more trusted by the launch ICP, or only bigger?

Reject if:

- the work serves builders/agents before owners can claim/publish/see health,
- the first ICP gets less specific,
- a one-way decision lacks owner, rollback path, and launch gate,
- lifecycle primitives are removed instead of carried as a contract,
- a route/table/nav item exists because a future phase might need it.

## SEO/AEO lens

Question: can crawlers and answer engines fetch, parse, and quote the truth without private leakage?

Reject if:

- published pages lack canonical/noindex/schema policy,
- sitemap includes private/unpublished/suppressed URLs,
- robots blocks intended public crawlers by accident,
- `llms.txt` claims unsupported capabilities,
- JSON-LD includes reviews, ratings, offers, payments, opening hours, or prices without source-owned evidence,
- public launch lacks rendered-route and external crawl/readback evidence.

## AI/protocol lens

Question: does agent-readable output describe only server-enforced facts?

Reject if:

- AE-hosted `/{slug}/ucp` is described as business-origin `/.well-known/ucp`,
- manifest advertises dead schema/service URLs,
- MCP/OpenAPI/API key/callable/payment fields appear in Phase 1,
- owner-authored text appears as agent instructions,
- suppressed/unpublished businesses remain discoverable.

## GTM lens

Question: is traffic being captured into owned, measurable owner activation?

Reject if:

- public launch happens before internal alpha and closed owner beta gates,
- a channel has no destination URL, UTM/source scheme, owner, stage, and kill rule,
- marketing assets do not cite the claims register,
- activation means only “page exists” rather than owner saw status and copied/shared URL or consented to next step,
- paid ads/Product Hunt/developer launch precede self-serve funnel data.

## Accessibility lens

Question: can a real owner complete the flow on a phone and keyboard?

Reject if:

- claim form lacks labels/errors,
- focus is invisible,
- loading/error/empty states are missing,
- primary controls are too small on mobile,
- status uses color only,
- route fails 375px smoke,
- reduced-motion is ignored where animation exists.

## Final review question

If this change vanished tomorrow, would the launch spine get simpler or weaker?

- Simpler: delete it.
- Weaker: keep it, but add a test at the seam.
