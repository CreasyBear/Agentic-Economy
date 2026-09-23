# Variant B: Triage inbox

## Organising idea

Work arrives; the operator clears a single ordered inbox without searching for what to do.

## IA

1. **Existing application:** Market · Agents · Calls · Credit | Provider: Tools · Earnings | Settings · Support · Status.
2. **Admin:** Inbox · Global search · Purchase resolutions · Providers · Action flow · Audit · Support handoff.
3. Inbox comes first because the daily job is exception handling, not administration by object type.
4. Global search is secondary and available with Cmd/Ctrl+K for a known reference or customer clue.
5. Purchase resolutions get one focused queue because delivery and money truth demand more evidence than other exceptions.
6. Calls and Providers keep mutations on the object. Raw rows and function runs link to Convex Dashboard.
7. Clerk owns user ban, lock, sessions, MFA reset and impersonation. Stripe owns payout onboarding and remediation.

## Five primary interactions

1. **Clear the next exception:** Open Inbox → choose Needs decision → Assign next to me → open the oldest row in the right sheet → record a reason → complete fresh-MFA step-up → choose a disposition → write an audit event. Assignment, presence, unified feed, fva step-up and triage state are marked **ABSENT**.
2. **Decide a Purchase resolution:** Select a Purchase resolution → inspect Call, Quote, x402 attempt, delivery, payment and Provider-obligation evidence without leaving the list → Accept, Refuse, Refund, Snooze or Ask for evidence → require reason and audit preview → require a second owner_admin for Refund → outcome returns to the queue. Open-case queue, SLA policy and second approval are marked **ABSENT**.
3. **Prevent duplicate work:** See assignee and “someone else is viewing” before deciding → submit against the case version → on 409 already-decided, preserve the draft reason and reload the new decision and audit line. Assignment, presence and the 409 contract are marked **ABSENT**.
4. **Suppress a Business:** Open Provider → Suppress Business → supply implemented `reasonCode` and `evidenceRefs` → verify `owner_admin` and fresh fva → obtain a different owner_admin approval → review `business.suppressed` audit fields → suppress. The mutation and audit event exist; fva and two-person approval are marked **ABSENT**.
5. **Receive a support handoff:** Buyer selects “Get help with this Call” on the receipt → support arrives at `/support?callRef=` with the exact Call reference → sees joined Workspace, Agent, Tool, Provider and Credit context → adds a triage note or requests an owner decision → Clerk, Stripe or Convex open in their own dashboards → note and handoff are audited. The Call URL exists; the support case record is marked **ABSENT**.

## Role behaviour

The role toggle uses the verbatim `owner_admin | support | reviewer` matrix from `src/modules/security/internal/admin-authority.ts`.

- `owner_admin` can use every declared admin permission.
- `support` can read admin readbacks and annotate triage; disposition, commercial-policy and suppression controls are disabled.
- `reviewer` is read-only; annotation and every mutation are disabled.
- Break-glass and kernel-incident controls are not drawn because their implementation bypasses the admin-authority seam.

## Exception sources

- Purchase resolutions: record exists; open-case admin feed **ABSENT**.
- Removal requests: `disputes` exists; admin feed **ABSENT**.
- Provider source-authority reviews and admission cases: case data exists; admin feed **ABSENT**.
- Uncertain Calls: `outcome_unknown` exists; age threshold and admin feed **ABSENT**.
- Failed payouts: payout states and Stripe references exist; admin feed **ABSENT**.
- APP 12/13 access and correction requests: whole workflow **ABSENT**; 30-calendar-day clock shown.
- Credit reconciliation: cases exist; delta and admin feed **ABSENT**.

## Best and worst

**BEST at:** one owner_admin clearing a day’s exceptions in one sitting. The list, evidence sheet, assignment, viewer presence, snooze and version-conflict behaviour minimise context switching and duplicate decisions.

**WORST at:** exploratory investigations and marketplace trend analysis. Search is intentionally subordinate, object pages are compact, and only three operational numbers appear on Home.

## References borrowed

- Stripe Connect “Accounts to review” for state-first queues and actionable account requirements: <https://docs.stripe.com/connect/dashboard/review-actionable-accounts>
- Stripe Radar for assignment, evidence beside the review and a decision timeline: <https://docs.stripe.com/radar/transaction-reviews>
- Linear Triage for explicit Accept, Decline and Snooze dispositions without leaving the queue: <https://linear.app/docs/triage>
- Intercom Inbox for assignee, live viewers, snooze-return time and a side preview: <https://www.intercom.com/help/en/articles/6258745-the-inbox-explained>
- GitHub sudo mode, impersonation reasons and two-person bypass review for action guards: <https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode> and <https://docs.github.com/en/code-security/how-tos/secure-your-secrets/manage-bypass-requests/review-bypass-requests>
- Plain customer cards for joined customer and object context beside support work: <https://www.plain.com/docs/customer-cards>
- OAIC APP 12 and APP 13 guidelines for the 30-calendar-day access and correction clock: <https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-12-app-12-access-to-personal-information> and <https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-13-app-13-correction-of-personal-information>

## Cognitive-load argument

The operator sees one focal point: the oldest actionable exception. Three metrics answer only “how much,” “how old,” and “how late.” State tabs reduce the first choice to five familiar work states; source chips are optional filters rather than competing navigation. Each row exposes four decision inputs: object, age versus SLA, one-line evidence and assignee. The right sheet keeps those inputs visible while progressively disclosing dispositions and guards. Search, full object history, raw rows and external dashboards stay one level deeper, so working memory is spent on the decision rather than navigation.

## Open questions

1. What SLA applies to Purchase resolutions, removal requests, source-authority reviews and admission cases?
2. Which exact `outcome_unknown` age creates an uncertain-Call exception?
3. Is assignee ownership exclusive, or advisory with an optimistic case version?
4. Which dispositions map to existing mutations, and which require new domain commands?
5. Should support be allowed to Snooze and Ask for evidence under `annotate_triage`, or only add notes and assignment?
6. Which owner_admin actions require a second owner, and how long can an approval remain valid?
7. Is the APP 12/13 workflow needed for alpha, and which systems contribute to the disclosure export?
8. What is the canonical Credit reconciliation delta source when Formance is the balance authority?
