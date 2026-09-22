# Variant A: Search first

## Organising idea

**The object is the unit of work:** paste any known reference, land on one canonical object page, establish the facts, then act in that object's context.

## Direction

- **Archetype:** industrial, object-centred back office.
- **Density:** compact in queues and audit, comfortable on object pages.
- **Surface:** warm flat panels, one forest accent, almost no decorative chrome.
- **Type mood:** precise, calm, reference-heavy.
- **Do:** lead with money truth, keep references visible, preserve chronology, link related objects, separate danger actions.
- **Do not:** use dashboard charts, generic CRUD, decorative gradients, repeated metric cards, or raw-row editing.

## IA

1. Existing app navigation remains: Market, Agents, Calls, Credit; Provider; Settings, Support, Status.
2. **Admin: Search** is first because the dominant operator job starts with a reference from a customer, receipt, alert, Clerk, Stripe or a colleague.
3. **Saved queues** are saved global searches rather than a separate object model. Examples include `state:open kind:purchase_resolution` and `state:outcome_unknown kind:call`.
4. **Audit** is a global immutable event list with URL-persisted filters.
5. Business and Call pages are URL-addressable. Actions appear only on the affected object, with destructive actions at the bottom.
6. Convex Dashboard remains the raw-row and function-run surface. Clerk and Stripe remain the security and payout-onboarding systems of record.

This follows Stripe's resource search and direct object jump, GitHub Stafftools' resource-shaped administration and Danger Zone, and Dub's object-oriented admin route tree. It deliberately avoids a chart-first admin dashboard.

## Five primary interactions

1. **Investigate a reported Call**  
   Trigger: customer arrives through `/support?callRef=...` or an operator pastes a Call ref.  
   Screens: Support handoff → Call object → related Quote, Tool, Agent, Workspace, Business and x402 attempt.  
   Guard: read-only; unsafe retry is disabled while payment is unknown.  
   Outcome: money truth, delivery evidence, Purchase resolution and timeline answer “what happened?” without another lookup.  
   Audit: investigation itself does not mutate; any later action previews its event before execution.

2. **Suppress a Business**  
   Trigger: owner_admin opens the Business action menu or Danger Zone.  
   Screens: Business → reason and evidence → fresh MFA → second owner_admin approval → audit preview.  
   Guard: required reason, evidence reference, `fva`, distinct second approver. Step-up and second approval are marked `ABSENT` where the backend does not yet enforce them.  
   Outcome: Business changes from `discoverable` to `suppressed`; support and reviewer never see the control.  
   Audit: preview includes `business.suppressed`, actor, target, before/after state, reason, evidence, idempotency key and correlation ID.

3. **Work a Purchase resolution queue**  
   Trigger: select saved search `state:open kind:purchase_resolution`.  
   Screens: filtered results → evidence drawer → Call object.  
   Guard: queue is read-only for support/reviewer; owner actions remain object-bound.  
   Outcome: assignee, age/SLA and dispositions are shown as required design, but marked `ABSENT` where not backed.  
   Audit: each disposition must create a state transition event and preserve evidence refs.

4. **Trace a Provider problem**  
   Trigger: search Provider slug, Business ID or Stripe account ID.  
   Screens: Business → Tools and connections → Stripe or Clerk link-out.  
   Guard: AE does not rebuild Stripe onboarding or Clerk security actions.  
   Outcome: operator sees AE domain truth and moves to the owning vendor dashboard only for vendor-owned work.  
   Audit: AE actions remain in AE audit; vendor actions remain in their vendor logs.

5. **Review operator activity**  
   Trigger: open Audit or follow an object's event reference.  
   Screens: URL-persisted filters → infinite chronological list → canonical object.  
   Guard: all roles have `read_admin_readbacks`; only owner_admin receives mutation controls.  
   Outcome: actor, resource, state change, reason, evidence and correlation are explainable from one event.  
   Audit: the list is itself read-only and immutable.

## Best and worst

**Best at:** answering “what happened to my Call?” in under 10 seconds when the customer or alert includes a stable reference. The first screen is money truth, not a chart or a list of systems.

**Worst at:** broad operational discovery when the operator has no identifier and needs to notice a pattern across many Businesses, Tools or Calls. Saved searches help, but a queue-first console will be faster for shift work and bulk triage.

## Reference borrowing

- [Stripe Dashboard search](https://docs.stripe.com/dashboard/search): typed object filters, exact-ID jumps, grouped results and bookmarkable queries.
- [Stripe Connect account review](https://docs.stripe.com/connect/dashboard/review-actionable-accounts): actions required before history, state tabs and saved views.
- [Stripe refund timeline](https://support.stripe.com/questions/how-to-trace-a-refund-using-reference-numbers): chronological money events and trace references.
- [GitHub sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode): fresh authentication before sensitive work.
- [GitHub impersonation](https://docs.github.com/en/enterprise-server@3.20/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/impersonating-a-user): required reason, persistent accountability and Danger Zone placement.
- [Dub admin routes](https://github.com/dubinc/dub/tree/main/apps/web/app/%28ee%29/admin.dub.co/%28dashboard%29): resource-shaped administration rather than generic CRUD.
- [Plain customer cards](https://www.plain.com/docs/customer-cards): live product context beside support work.
- [OAIC APP 12](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-12-app-12-access-to-personal-information) and [APP 13](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-13-app-13-correction-of-personal-information): 30-day access/correction clock.

## Cognitive-load argument

The home view has one focal point: search. It asks the operator to recognise or paste what they already have, not choose among many dashboards. Recently viewed objects and saved searches externalise memory. The Call page keeps the stable ref visible and groups the investigation into four chunks: money truth, delivery evidence, Purchase resolution and timeline. Related objects sit in one rail, so the operator never has to remember IDs between screens. Privileged actions are progressively disclosed in the object menu, and destructive action is physically separated in a Danger Zone.

The trade-off is intentional: the expert interface remains information-dense, but only one object and one decision are foregrounded at a time.

## Open questions

1. Which exact admin read model will join Call → attempt/control → Quote → usage/x402 → receipt/obligation/resolution without exposing raw rows?
2. What are the promised response SLAs for Purchase resolutions, removal requests and critical support cases?
3. Who may become the second owner_admin approver, and when does approval expire?
4. Should every read be audited, or only exports, sensitive identity views and mutations?
5. Which user clues may global search accept without increasing personal-data exposure?
6. Is the APP 12/13 workflow needed at alpha, and who owns identity verification before export or correction?
7. Should saved searches be personal, shared, or both?
