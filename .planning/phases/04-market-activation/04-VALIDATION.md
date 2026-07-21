# Phase 4 validation strategy

## Evidence rule

Each WP runs its literal focused command from `04A-INSTANCE-CONTRACTS.md`. A green parcel proves only its named source contract on the tested candidate. Only WP12 may aggregate the integrated programme into acceptance evidence. Unrelated baseline failures are recorded with their existing ownership and do not become parcel repair work.

## Dependency-ordered falsifiers and literal commands

### WP1 — membership, responsibility and Ownership

RED if additive permissions create Ownership, the last active owner can be removed/demoted/suspended, or invite/transfer/remove authority can be inferred from a preset label.

```text
npm exec -- vitest run tests/unit/business-account/contracts.test.ts tests/integration/business-account-membership.test.ts
```

### WP2 — relationship, support, commercial references, export and closure

RED if a commercial label creates payment/access truth, private customer-success notes become customer-visible, closure erases history or accepts new work, or WP2 drops a WP1 public export.

```text
npm exec -- vitest run tests/integration/business-account-lifecycle.test.ts tests/integration/business-account-support-commercial.test.ts tests/integration/business-account-export-closure.test.ts
```

### WP3 — profile, services and domain-owned availability

RED if shared fields require appointment slots, dispatch zones/capacity, or digital delivery windows; if publication means availability; or if one domain can overwrite another domain's facts.

```text
npm exec -- vitest run tests/integration/business-account-profile-services.test.ts tests/unit/availability/horizontal-contract.test.ts
```

### WP4 — integrations many-to-many and connection checks

RED if one integration cannot power many offerings, one offering cannot use many integrations, account-wide identity/payment/notification integrations require an offering, technical operators lack a canonical route, stale readiness appears current, or the relation duplicates canonical integration/offering ownership.

```text
npm exec -- vitest run tests/integration/business-account-integrations.test.ts tests/integration/capability-supply-onboarding.test.ts
```

### WP5 — bounded projections and attention deduplication

RED if deleting a projection deletes source truth, 1,000/10,000 unrelated records change a page's query count, a conversation/work link counts twice on Home, or Home competes with Work and Inbox as a third queue.

```text
npm exec -- vitest run tests/integration/business-account-dashboard-query.test.ts tests/integration/business-account-work-query.test.ts tests/integration/business-account-portfolio-query.test.ts
```

### WP6 — shell, current-business context and redirects

RED if a protected route guesses a business, switching leaves stale account facts, `/owner/**` renders a second workspace, the visible shell exposes internal control-plane nouns, or a role shortcut points somewhere other than the canonical Integrations route.

```text
npm exec -- vitest run tests/unit/operator-navigation.test.ts && npm exec -- playwright test tests/e2e/business-account-shell.spec.ts
```

### WP7 — Work list and detail

RED if Work truth is copied into UI state, a transport response implies success, possible release permits retry rather than reconcile, forbidden states enumerate another account, or reload loses the only safe continuation.

```text
npm exec -- vitest run tests/unit/business-account/work-ui.test.tsx tests/integration/business-account-work-detail.test.ts tests/integration/business-account-work-link.test.ts && npm exec -- playwright test tests/e2e/business-account-work.spec.ts
```

### WP8 — Inbox, conversation and Work linking

RED if ordinary text creates Work, uncertain send permits blind resend, a linked item owns two attention counts, the link cannot be reconstructed from source references, or conversation becomes an operational queue.

```text
npm exec -- vitest run tests/integration/business-account-inquiries.test.ts tests/integration/business-account-work-link-reconstruction.test.ts && npm exec -- playwright test tests/e2e/business-account-inquiries.spec.ts
```

### WP9 — Team, settings and Help

RED if UI visibility is treated as server authority, the last owner can be stranded, custom responsibility combinations create Ownership, private notes appear in Help, account-wide financial truth is invented, or closure has no safe pending-work continuation.

```text
npm exec -- playwright test tests/e2e/business-account-team-settings-support.spec.ts
```

### WP10 — Offerings and Integrations UI

RED if Integrations is canonically nested under Offerings; any of the four WP4 topology cases fails; appointment, dispatch or digital-information fields leak into shared views; or contextual links create duplicate integration records.

```text
npm exec -- vitest run tests/unit/business-account/offerings-integrations-ui.test.tsx && npm exec -- playwright test tests/e2e/business-account-offerings-integrations.spec.ts
```

### WP11 — founder/customer-success account detail

RED if founder tooling impersonates a member, grants itself protected Ownership, rewrites source-owned Work/messages/availability, exposes private technical evidence to customers, or collapses release control, feature access, permissions, publication and availability.

```text
npm exec -- vitest run tests/unit/business-account/admin-account-ui.test.tsx && npm exec -- playwright test tests/e2e/business-account-founder-operations.spec.ts
```

### WP12 — integrated programme acceptance

RED if a fresh evaluator cannot identify the current business, whether it can receive work and why, the next safe action, or the separation of Work/Inbox/Help; if keyboard order, persistent labels, visible focus, 44px targets, 320px reflow, 400% zoom, non-colour status, reduced motion or bounded live announcements fail; or if substituting any of the three domain shapes requires a new shared field, route or control plane.

```text
npm exec -- playwright test tests/e2e/business-account-acceptance.spec.ts && npm exec -- vitest run tests/eval/business-account-comprehension.test.ts tests/eval/business-account-horizontal-contract.test.ts
```

## Parcel hygiene

Each writer also runs `git diff --check -- <its exact allowlist>` and reports the candidate identity, focused result, changed paths, remaining liabilities and claim ceiling. Dependency-order writers; only independent read-only audits may overlap. No child substitutes a broad suite for its semantic falsifier or receives an open-ended “implement Phase 4” instruction.

## WP12 acceptance matrix

WP12 samples Home, Work list/detail, Inbox/conversation, Offerings/service detail, Availability, Integrations, Team/access, Business settings, Help/support and founder account detail across loading, empty, partial, stale, forbidden, conflict, uncertain, recovery and terminal states. Human-readable provenance names the source, observed time/currentness and a “Why this status?” path. Consequential continuations are source-created and never inferred from transport success.

The horizontal substitution set is:

1. a paid digital information operation;
2. an appointment/booking-shaped service;
3. an on-demand/dispatch-shaped service.

The shared shell may express offering identity, customer-safe status, currentness, domain discriminant, summary and permitted continuation. Domain scheduling, capacity, coverage, fulfilment, payment and result fields remain in their source-owned panels.

## Evidence ceiling

This programme can produce source inspection, focused fixtures, labelled local browser evidence and an exact candidate evidence packet. It does not prove customer usability or validation, accessibility in use, hosted behavior, provider fulfilment, demand, customer value, real payment or settlement, deployment, production safety, release maturity, or the future effectiveness of sales, incentive, liquidity or retention mechanisms.
