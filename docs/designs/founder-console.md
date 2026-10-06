# Founder console

Consolidated 5 October 2026 from founder source `8cd35d5be` and current main.
The [original design and implementation record](https://github.com/CreasyBear/Agentic-Economy/blob/8cd35d5be35ecc02def79bebbdc192b4e309b8a0/docs/designs/2026-10-01-founder-console.md)
preserves earlier decisions and licensed Arc provenance. This document is the
active bounded contract, not another product roadmap.

## Purpose and scope

The founder can see activity, recognize a material exception and open its
purchase or Account without memorizing identifiers. Preserve the Tool → Quote →
Call chain, existing commands, financial authority and AE shell. No additional
service, reporting engine or payment authority is introduced.

Overview prioritizes current readiness, purchases needing attention, funding-aware
activity and recent purchases. Exact-reference search and recent-record history
are disclosed on demand. Activity preserves paginated purchase evidence; Accounts
provides scoped investigation. Existing provider/audit/exception details, treasury
controls and Alpha learning remain available.

## Contracts

**Admin read boundary**

- Requires current Admin readback authority and a declared deployment environment.
- Ensures bounded native pagination, redacted Account summaries and references to
  original purchase records; unavailable or incomplete evidence remains explicit.
- Invariant: identity, Customer/Agent roles, funding, buyer Charges, Provider
  obligation, delivery and purchase resolution remain distinct.
- On violation: refuse the read. No financial or provider side effect is reachable.

**Marketplace metrics**

- Requires versioned daily snapshots, exact integer money units and established
  funding attribution. Purchased, promotional, refunded and unclassified activity
  are separate; purchased credit alone does not prove external Customer traction.
- Ensures complete-period totals only with complete coverage, deduplicated Account
  counts and gaps for missing daily observations. Every money inspection label
  uses the canonical exact formatter, including values beyond safe Number precision.
- Invariant: Number conversion is chart geometry only. No money, authority or
  original purchase record is changed by reporting.
- On unavailable/inconsistent evidence: withhold totals/comparisons, retain
  inspectable daily evidence and expose uncertainty rather than inventing zero.

**Refresh and recovery**

The existing nightly workload refreshes at most 90 days, overlaps two days and
continues after bounded groups of eight pages. Atomic daily replacement makes
replay safe; it never adds/subtracts financial postings. Protected reads and UI
render failures cannot authorize a retry of a purchase. Readiness expires from
source clocks and preserves the approved explicit screening deferral.

## Structure and interaction decisions

The existing Arc metrics dashboard also serves owner and treasury presenters.
The founder chart block has an incompatible data contract. Keeping a scoped
`arc/blocks/marketplace-dashboard` block adds two files and one data interface;
it preserves those existing callers and isolates funded-chart changes. Both
blocks have real callers. A union-prop compatibility wrapper would couple the
unrelated contracts and is rejected. The unused incoming LiquidTabBar is removed.

Current main's tables retain exact BigInt sorting, controlled sorting, evidence
drawers, native keyboard/selection behavior and focus restoration. Founder table
needs add only readonly inputs, compact density and an optional horizontal mobile
layout. Current shared Alert, filters and SearchField remain authoritative.

Four headline metric choices share one period selector. Operational Call metrics
remain in a labelled disclosure; they are not confused with customer-funded
activity. Three supporting comparisons each answer a named question. Evidence
links preserve exact underlying references. Mobile controls retain touch targets;
closed investigation panels leave keyboard navigation immediately.

## Verification

Focused coverage checks Admin denial and Account redaction; scoped native paging;
funding classification and refresh replay; unknown/missing days and withheld totals;
exact six-decimal labels beyond safe integer precision; CSV links; range changes
without stale values; keyboard navigation and focus; copy refusal; independent
Alpha-learning failure/retry; approved screening deferral and readiness expiry.

The consolidation source also runs `npm run check` and the full `npm run gate`.
Final source counts, backend/web identities and hosted desktop/mobile observations
belong to its release PR and [deployment map](../operations/deployments.md).
Historical isolated-branch test runs do not establish the combined release.

## Approved trial access

Joel approved both email invitations and public signup with manual grants on
6 October 2026: A$10 per trial, expiring 30 days after activation. Public signup
does not grant credit. An invitation is an offer to a verified email address,
not an Account or an Admin membership. Existing Accounts can receive the same
trial through an explicit Admin command.

**Approval and claim contract.** Requires the existing owner-Admin permission,
source-write admission, fresh MFA, evidence and applicable second approval.
Ensures one immutable offer per email/environment and at most one trial per
Account/environment across both routes. The reviewed command explicitly approves
both promotional funding and temporary purchase access; neither is inferred from
the other. An invitation claim requires a current canonical personal Account
owner and a primary email verified by Clerk's backend. The browser supplies no
email, user identity, amount, duration or Account authority. On mismatch, expiry,
inactive ownership or conflicting prior claim, refuse without creating credit.

**Money and access contract.** Activation atomically binds the offer to the
Account, current owner, one promotional grant and a frozen 30-day expiry. A$10 is
10,000,000 AUD ledger units. The existing Formance grant, allocation, refund and
expiry workers remain authoritative; credit becomes available only after a
confirmed posting. Trial grants retain their original approved-offer authority,
never a synthesized promotional-grant Admin command. Duplicate/concurrent claims
and worker retries preserve the same grant and posting reference. Missing or
altered authority refuses booking. The expiry does not extend on retry. Temporary
purchase access ends at that same expiry and cannot survive an ownership change.
Global payment pauses, current readiness, canonical Agent delegation, Spending
policies and ordinary purchase authorization continue to apply. A generic credit
grant does not open purchase access.

**Delivery and recovery contract.** Clerk application invitations use the
existing Clerk service and the application's sign-up route, returning to a small
trial-activation page. Approval, email delivery, activation and confirmed credit
are separate facts. Record the send attempt before contacting Clerk; an uncertain
send may only reconcile the matching invitation, never blindly send again.
Provider rejection/unknown delivery remains visible to Admins. The recipient can
also sign in through the public route and activate an approved email offer; email
delivery itself is not funding authority. No automatic public-signup credit and
no recipient Admin role are introduced.

**Structure decision.** Keep one additive offer table, one Admin command and
bounded trial handlers. This adds persisted approval/claim/delivery states and
Clerk action boundaries, but removes the need for fake Accounts, duplicated
balances, global payment access or forged Admin receipts. Existing command sheets,
ledger workers and payment admission remain the real callers. A second ledger,
new email service, generic entitlement framework and signup webhook are rejected.

**Interaction decision.** Accounts shows one email field with fixed A$10/30-day
terms; the Account detail shows the same fixed grant action. Existing Admin review
supplies evidence and approval. Trial status shows delivery, activation, booking
and expiry directly, avoiding remembered references or implicit success. The
recipient sees one activation action and its actual result, with a balance link
after booking. Signup without an offer explains that credit requires approval.

**Verification.** Exercise verified and unverified claims, public signup without
approval, stale ownership, cross-Account/environment attempts, simultaneous
manual/invite claims, repeated grants, altered approval receipts, lost posting
acknowledgements, delivery uncertainty, expiry and global pause/readiness refusal.
UI checks cover recipient/terms review, fixed amounts, denied Admin actions and
pending/error results. External delivery and real ledger writes require separate
hosted evidence; mocked provider responses prove only local boundary behavior.

Production Clerk environment readback on 7 October AWST confirms public signup
and no allowlist restriction. No Clerk setting change was needed. The trial
entry preserves `/trial` through sign-in/signup, keeps session middleware and
private caching, and renders its public explanation without a Convex client.
Real invitation delivery and a production grant remain untested because no
recipient was selected for this implementation request.
