# Phase 4 validation strategy

## Evidence rule

Each WP runs its literal focused command from `04A-INSTANCE-CONTRACTS.md`. A green parcel proves only its named source contract on the tested candidate. Only WP12 may aggregate the integrated programme into acceptance evidence. Unrelated baseline failures are recorded with their existing ownership and do not become parcel repair work.

Before dispatch, the parent pins one executable source revision/tree and
content-bound inherited overlay. A semantic RED must compile against an
existing or predecessor-integrated public seam, fail for the named behavioral
reason, and assert source state before and after hostile substitution. A
missing file/import is not an accepted RED.

## Dependency-ordered falsifiers and literal commands

### WP1 — membership, responsibility and Ownership

RED if additive permissions create Ownership, the last active owner can be
removed/demoted/suspended, invite/transfer/remove authority is inferred from a
preset label, or a human and scoped agent resolve different account authority
from the same source.

```text
npm exec -- vitest run tests/unit/business-account/contracts.test.ts tests/integration/business-account-membership.test.ts tests/integration/business-account-principal-resolution.test.ts
```

### WP2.1 — relationship and support

RED if private notes become customer-visible, support rewrites Work, or a
relationship/onboarding transition loses attributable source revision.

```text
npm exec -- vitest run tests/integration/business-account-relationship-support.test.ts
```

### WP2.2 — Commercial

RED if a Commercial label grants Work authority or creates operation-payment
truth, or an invoice/payment reference claims more than its named observation.

```text
npm exec -- vitest run tests/integration/commercial-account.test.ts
```

### WP2.3 — Usage and quota

RED if duplicate Usage counts twice; conflicting replay mutates history; two
concurrent last-unit reservations both succeed; an uncertain reservation is
reused; or `AuthorityUse`, supply observations or telemetry change quota.

```text
npm exec -- vitest run tests/integration/usage-ledger-quota.test.ts
```

### WP2.4 — pause, withdrawal and closure

RED if pause/closure erases history, accepts new work, drops a predecessor
schema export, skips a withdrawal step or cannot resume after partial failure.

```text
npm exec -- vitest run tests/integration/business-account-export-closure.test.ts
```

### WP3 — profile, services and domain-owned availability

RED if shared fields require appointment slots, dispatch zones/capacity, or
digital delivery windows; if publication means availability; if one domain can
overwrite another domain's facts; or if the paid-information seed has no
durable operation-owned result/reconciliation truth after evaluator records
are excluded.

```text
npm exec -- vitest run tests/integration/business-account-profile-services.test.ts tests/integration/paid-information-operation-result.test.ts tests/unit/availability/horizontal-contract.test.ts
```

### WP4.1 — integrations, readiness and publication

RED if one Integration cannot power many offerings, one offering cannot use
many Integrations, account-wide identity/payment/notification Integrations
require an offering, stale readiness appears current, registration is mistaken
for reachability, or Phase 3 evaluator records become Business Account supply.

```text
npm exec -- vitest run tests/integration/business-account-integrations.test.ts tests/integration/capability-supply-onboarding.test.ts
```

### WP4.2 — reachable operation ingress

RED if a substituted account/principal/readiness/material input can create an
attempt, Usage event or Work reference; registration alone becomes
reachability; the one-unit bounded-mandate fixture widens its material; or the
operator test route claims real provider execution.

```text
npm exec -- vitest run tests/integration/business-operation-ingress.test.ts
```

### WP5 — bounded projections and attention deduplication

RED if deleting a projection deletes source truth or changes entitlement/Usage;
if rebuilt period summaries differ from the ledger; if 1,000/10,000 unrelated
Work or Usage records change a page's query count; if a conversation/Work link
counts twice on Home; or if Home competes with Work and Inbox as a third queue.

```text
npm exec -- vitest run tests/integration/business-account-dashboard-query.test.ts tests/integration/business-account-work-query.test.ts tests/integration/business-account-portfolio-query.test.ts
```

### WP6 — shell, current-business context and redirects

RED if a protected route guesses a business, switching leaves stale account facts, `/owner/**` renders a second workspace, the visible shell exposes internal control-plane nouns, or a role shortcut points somewhere other than the canonical Integrations route.

```text
npm exec -- vitest run tests/unit/operator-navigation.test.ts && npm exec -- playwright test tests/e2e/business-account-shell.spec.ts
```

### WP7.1 — human Work list and detail

RED if Work truth is copied into UI state, a transport response implies success, possible release permits retry rather than reconcile, forbidden states enumerate another account, or reload loses the only safe continuation.

```text
npm exec -- vitest run tests/unit/business-account/work-ui.test.tsx tests/integration/business-account-work-detail.test.ts tests/integration/business-account-work-link.test.ts && npm exec -- playwright test tests/e2e/business-account-work.spec.ts
```

### WP7.2 — scoped-agent account and Work surface

RED if a scoped agent cannot read the same account, relationship,
Commercial/Usage, Work and continuation semantics as the human surface; if a
cross-account or stale credential enumerates state; or if a digest is accepted
as authority.

```text
npm exec -- vitest run tests/integration/business-account-agent-surface.test.ts tests/integration/business-account-agent-parity.test.ts
```

### WP8 — Inbox, conversation and Work linking

RED if ordinary text creates Work, uncertain send permits blind resend, a linked item owns two attention counts, the link cannot be reconstructed from source references, or conversation becomes an operational queue.

```text
npm exec -- vitest run tests/integration/business-account-inquiries.test.ts tests/integration/business-account-work-link-reconstruction.test.ts && npm exec -- playwright test tests/e2e/business-account-inquiries.spec.ts
```

### WP9 — Team, settings and Help

RED if UI visibility is treated as server authority, the last owner can be
stranded, custom responsibility combinations create Ownership, Billing can act
on Work, private notes appear in Help, operation payment appears as AE account
billing, raw provider/payment material renders, or closure has no safe pending-
work continuation.

```text
npm exec -- vitest run tests/integration/business-account-settings-authority.test.ts && npm exec -- playwright test tests/e2e/business-account-team-settings-support.spec.ts
```

### WP10 — Offerings and Integrations UI

RED if Integrations is canonically nested under Offerings; any of the four
WP4.1 topology cases fails; appointment or dispatch fields leak into shared
views; or contextual links create duplicate integration records.

```text
npm exec -- vitest run tests/unit/business-account/offerings-integrations-ui.test.tsx && npm exec -- playwright test tests/e2e/business-account-offerings-integrations.spec.ts
```

### WP11 — founder/customer-success account detail

RED if founder tooling impersonates a member, grants itself protected
Ownership, rewrites Usage/Commercial/provider observations or source-owned
Work/messages/availability, exposes private evidence, or collapses release
control, feature access, permissions, publication and availability.

```text
npm exec -- vitest run tests/integration/business-account-admin-authority.test.ts tests/unit/business-account/admin-account-ui.test.tsx && npm exec -- playwright test tests/e2e/business-account-founder-operations.spec.ts
```

### WP12 — integrated programme acceptance

RED if the complete onboarding → reachable operation → possible release →
reconciliation → pause → partial withdrawal → resumed offboarding → retained
history loop fails; if a fresh evaluator cannot identify the current business,
whether it can receive work and why, Commercial/Usage currentness and the next
safe action; if human and scoped-agent semantics disagree; if keyboard order,
persistent labels, visible focus, 44px targets, 320px reflow, 400% zoom,
non-colour status, reduced motion or bounded live announcements fail; or if
appointment/dispatch substitution requires a shared field, route or control
plane.

```text
npm exec -- playwright test tests/e2e/business-account-acceptance.spec.ts && npm exec -- vitest run tests/eval/business-account-comprehension.test.ts tests/eval/business-account-horizontal-contract.test.ts tests/eval/business-account-agent-parity.test.ts && npm exec -- tsx tools/evidence/business-account/generate.ts && npm exec -- tsx tools/evidence/business-account/verify.ts
```

## Parcel hygiene

Each writer also runs `git diff --check -- <its exact allowlist>` and reports the candidate identity, focused result, changed paths, remaining liabilities and claim ceiling. Dependency-order writers; only independent read-only audits may overlap. No child substitutes a broad suite for its semantic falsifier or receives an open-ended “implement Phase 4” instruction.

## WP12 acceptance matrix

WP12 samples Home, Work list/detail, Inbox/conversation, Offerings/service detail, Availability, Integrations, Team/access, Business settings, Help/support and founder account detail across loading, empty, partial, stale, forbidden, conflict, uncertain, recovery and terminal states. Human-readable provenance names the source, observed time/currentness and a “Why this status?” path. Consequential continuations are source-created and never inferred from transport success.

The horizontal set is one operated seed plus two hostile substitutions:

1. a paid digital information operation;
2. an appointment/booking-shaped fixture that must not add shared fields;
3. an on-demand/dispatch-shaped fixture that must not add shared fields.

The shared shell may express offering identity, customer-safe status, currentness, domain discriminant, summary and permitted continuation. Domain scheduling, capacity, coverage, fulfilment, payment and result fields remain in their source-owned panels.

## Evidence ceiling

This programme can produce source inspection, focused fixtures, labelled local browser evidence and an exact candidate evidence packet. It does not prove customer usability or validation, accessibility in use, hosted behavior, provider fulfilment, demand, customer value, real payment or settlement, deployment, production safety, release maturity, or the future effectiveness of sales, incentive, liquidity or retention mechanisms.
