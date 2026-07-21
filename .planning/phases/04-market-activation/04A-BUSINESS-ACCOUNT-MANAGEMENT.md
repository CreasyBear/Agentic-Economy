# Phase 4A — Business Account Management

## Executive contract

Phase 4A is not a listing wizard. It establishes the complete business-facing
application and the founder-facing customer-management console needed to
onboard, operate, support and offboard Business Accounts with confidence.

The canonical term **Business Account** means the ongoing relationship between
AE and a participating business. It is not the public `business` identity, a
demand-side customer, a Clerk user, a listing, or a routeable operation.

```text
person identity
  → business membership and role
  → business account relationship
  → profile, locations and contacts
  → services and registered operations
  → connections, readiness and routeability
  → enquiries, work and activity
  → support, commercial context and lifecycle controls
```

The founder must be able to create or adopt a Business Account, invite its
people, finish setup with them, see every blocker, support the relationship and
withdraw or close it without database edits. The business must be able to
return later and understand its account without the founder narrating the UI.

Real business adoption is not an engineering gate. Labelled fixtures and an
exact-revision hosted sandbox may prove the surface. They do not prove supply
quality, provider fulfilment, revenue or customer satisfaction.

## Source ownership

- `businesses` remains the canonical business identity and public lifecycle.
- `owners` remains a person/account compatibility record during the
  token-identifier migration; it does not represent a business team.
- new `businessMemberships` owns a person's role in a business. Roles are
  `owner | admin | operations | billing | viewer`.
- new `businessMemberInvitations` owns pending invitation state. Tokens are
  single-use, hashed, expiring and never stored in plaintext.
- new `businessRelationships` owns AE's lifecycle with the business:
  `prospect | onboarding | active | paused | at_risk | offboarding | closed`.
- business profile and service facts remain in `business` and `catalog`.
- capability contracts, offerings, bindings, publications and readiness remain
  in `capability-contract-registry` and `capability-supply`.
- enquiries, action results and billing/provider events remain with their
  source domains. Account views store references and summaries only.
- new business-success notes, tasks and support cases own only relationship
  work. They never authorize or rewrite business/provider truth.
- a removable account-activity projection joins source references for display.
  Deleting it cannot erase or change any source event.

## Business-facing information architecture

| Route | Customer job |
|---|---|
| `/owner` | See account health, current work, blockers and next actions |
| `/owner/business` | Manage identity, public profile, locations, contacts and visibility |
| `/owner/team` | Invite, change role, suspend or remove members |
| `/owner/services` | Manage the services customers can discover |
| `/owner/capabilities` | Manage registered operations and routeability |
| `/owner/connections` | Manage endpoint/adapter connections and readiness |
| `/owner/inquiries` | Receive and respond to human enquiries |
| `/owner/work` | See consequential and agent-originated work involving the business |
| `/owner/activity` | Review an attributable cross-account timeline |
| `/owner/commercial` | See the truthful plan/charge arrangement and billing contact |
| `/owner/support` | Open and continue support cases |
| `/owner/settings` | Personal security, notifications and account preferences |

The owner landing page is an operating dashboard, not a vanity metrics page.
It answers: what is live, what needs attention, what customers or agents are
waiting on, what AE will do next, and what the business can safely change.

If no paid arrangement exists, Commercial says **No paid plan applies**. It
does not fabricate invoices or leave a dead Billing link. Phase 4A records
`no_charge | manual | provider_managed` commercial mode and source references;
it does not implement charging, settlement or a Stripe product.

## Founder/customer-success information architecture

| Route | Founder job |
|---|---|
| `/admin/businesses` | Search/filter the complete portfolio and onboarding pipeline |
| `/admin/businesses/$businessId` | See relationship, people, profile, supply, work and blockers |
| `/admin/businesses/$businessId/onboarding` | Own milestones, tasks and next action |
| `/admin/businesses/$businessId/operations` | Inspect routeability and readiness without impersonation |
| `/admin/businesses/$businessId/support` | Manage support cases and accountable follow-up |
| `/admin/businesses/$businessId/commercial` | Record the truthful commercial arrangement and references |
| `/admin/businesses/$businessId/activity` | Review source-linked account history and audit evidence |

Founder assist issues explicit source-owned commands. It never impersonates a
business member, edits secrets, manufactures readiness or hides an unresolved
blocker. Internal notes are visibly private. Customer-visible support replies
are a distinct record.

## Required account capabilities

### Identity, membership and access

- derive the signed-in person from the server identity token;
- support multiple people and multiple businesses per person;
- invite by opaque delivery reference with expiry and single-use acceptance;
- enforce role-specific read/write permissions server-side;
- prevent removal, suspension or demotion of the last active owner;
- show active, invited, suspended and revoked membership truth;
- revoke future access without rewriting attributable history;
- provide a source-owned ownership-transfer ceremony.

### Profile and service management

- edit business name, category, description, contacts, locations, service area,
  hours, photos and public visibility through revision-checked drafts;
- add, edit, order, pause and retire multiple services;
- preview public information before publication;
- distinguish saved, published, under review, rejected and conflicted states;
- preserve historical source/evidence references and public revision identity;
- make no profile field sufficient for routeability.

### Operations and connections

- support zero-to-many registered operations per business;
- expose contract revision, connection mode, readiness, publication and exact
  blockers in ordinary language;
- support open and founder-provisioned managed-reference connections;
- recheck, pause, withdraw, repair and republish without erasing history;
- remove routeability immediately when any canonical prerequisite fails.

### Work, communications and activity

- keep the existing inquiry inbox and thread behavior;
- show bounded current/completed action work without copying action results;
- display unread/needs-reply/uncertain/blocked counts from source projections;
- join account events by source reference with cursor pagination;
- never require browser storage or a transcript to resume.

### Support and customer-success operations

- create, assign, prioritize, reply to, resolve and reopen support cases;
- maintain founder-owned onboarding tasks with due date, assignee and status;
- maintain private relationship notes distinct from customer-visible messages;
- record lifecycle reason/evidence for pause, at-risk, offboarding and closure;
- offer business data export and closure requests without permanent deletion;
- closing a relationship withdraws future work and access while retaining
  attributable commercial, action and audit history.

### Commercial context

- show commercial mode, status, plan label, billing member, effective period
  and external evidence references when they exist;
- distinguish no-charge, manual and provider-managed arrangements;
- never infer paid, current, past due or cancelled from UI input alone;
- never manufacture invoices, receipts, settlement or provider events;
- hide or replace every navigation destination that has no source-backed route.

## Data and query contract

New source tables are bounded and indexed for intended access:

- `businessMemberships`: by business/state/updated time and by token identifier;
- `businessMemberInvitations`: by business/status/expiry and by token digest;
- `businessRelationships`: by business and by lifecycle/updated time;
- `businessSuccessTasks`: by business/status/due time and assignee/status;
- `businessSuccessNotes`: by business/created time, admin-only;
- `businessSupportCases`: by business/status/updated time and assignee/status;
- `businessSupportMessages`: by case/created time with bounded pages;
- `businessCommercialAccounts`: exactly one current row per business plus
  source references;
- `businessAccountActivityItems`: removable projection by business/event time.
- `businessAccountSummaryItems`: removable portfolio/dashboard projection with
  `businessId`, relationship revision/status, assigned admin token identifier,
  `health`, attention reason codes, bounded source counts and `updatedAt`.

Exact summary indexes:

- `by_businessId`;
- `by_relationshipStatus_and_updatedAt`;
- `by_assignedAdminTokenIdentifier_and_relationshipStatus_and_updatedAt`;
- `by_health_and_updatedAt`.

Owner dashboard reads use one bounded account summary plus cap-plus-one lists;
they do not issue one query per service, operation, member or case. Admin list
filters use indexed lifecycle, assignee, health and updated-time fields. At
1,000 and 10,000 unrelated Business Accounts, one page has the same declared
query/read budget. Portfolio reads perform at most one summary query and read at
most 51 summary rows to return 50 plus continuation. Dashboard reads perform at
most six queries: one summary and five section queries. Each section reads at
most 11 rows to return 10 plus continuation; larger totals come from summary
counts, never extra hydration.

## Required mature states

Every major view implements loading, empty, populated, partial, stale,
permission-denied, validation-error, conflict and source-unavailable states.
Mutations have pending, accepted-readback and rejected-readback behavior.

The dashboard must represent at least:

- new prospect with no claimed business;
- onboarding business with incomplete profile and no team invite accepted;
- active business with multiple services and one routeable operation;
- active business with expired readiness and an unanswered enquiry;
- at-risk business with an open support case;
- paused business retaining history;
- offboarding business with future work withdrawn;
- closed relationship with read-only retained evidence.

## Phase 4A completion

4A closes when a fresh evaluator can, using labelled sandbox accounts:

1. establish a Business Account and assign an accountable founder;
2. invite a second member and prove role boundaries plus last-owner protection;
3. complete/edit/preview/publish a business profile and multiple services;
4. configure, check, publish, pause and repair registered operations;
5. receive/respond to an enquiry and inspect related work/activity;
6. open and resolve a support case with private and customer-visible records;
7. read the truthful commercial arrangement without fake billing;
8. pause, export and close the relationship without losing attributable truth;
9. find the account from the founder portfolio at constant page read budget;
10. resume every state from a direct URL after reload.

This establishes a credible Business Account product ready for founder-led
onboarding. It does not establish real adoption, revenue or provider quality.
