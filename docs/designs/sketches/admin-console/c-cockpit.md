# Variant C: Cockpit

## Organising idea

Measure first, then act: Joel gets a three-minute morning scan where every number and alert opens one reusable filtered list, then an identity-first object page, and only there exposes a guarded action.

## IA

1. **Existing app:** Market · Agents · Calls · Credit
2. **Provider:** Tools · Earnings
3. **Admin:** Morning view · Global search · Drill-downs · Resolution queue · Reliability · Money · Status & incidents · Audit · Support handoff
4. **Existing utility:** Settings · Support · Status

Morning view comes first because it answers “is money leaking or anything broken?” before exposing administration. Global search is second for known-object work. Drill-downs are one shared list component for Calls, Tools, Providers, Workspaces and Purchase resolutions. Queues are saved drill-downs, not a separate CRUD model. Reliability and Money explain the two highest-cost alert families. Audit and Support stay visible but secondary.

## Source status of the dashboard

- **PRESENT:** active Provider projection in `marketActiveProviders`; active Tool projection in `marketActiveTools`; current audit latest-100 readback.
- **DERIVABLE:** paid Calls/day and success rate from Call projections; gross Call value from paid/refunded `moneyUsageEvents`; active Agents/Workspaces from Calls and identities; payout aging from payout state/timestamps; resolution count and age from `purchaseResolutionRecords`; error classes from terminal Call states and refusal causes.
- **ABSENT:** intent-event denominator for fill rate; canonical net revenue/take aggregate; total Business Credit liability vs cash and therefore reconciliation delta; p50/p95 latency and SLO/error-budget aggregates; support cases, assignment, SLA, macros and CSAT; cross-account joined search; searchable paginated Audit; incident drafting/publishing; second-owner approval.
- “Unavailable” never renders as zero. Example values are labelled illustrative wireframe data.

## Five primary interactions

1. **Morning anomaly:** triggered Call-success alert → filtered Calls list → Call object with money truth and timeline → any consequential disposition requires reason + fresh MFA → outcome recorded on the object → audit preview shows actor, action, target, reason, authentication and time.
2. **Known reference:** paste `operation-invocation:v1:…` → prefix recognition and direct Call object → follow Quote, Agent, Tool version, Workspace or literal x402 attempt → open support handoff if needed → any mutation remains object-local and guarded → Audit receives the resulting event.
3. **Resolution review:** alert or dashboard number → saved Purchase-resolution drill-down → state tab, age/SLA, assignee and evidence drawer → owner_admin chooses a disposition → reason + fresh MFA before closure → immutable outcome and audit event. Assignee and SLA are marked ABSENT.
4. **Business suppression:** Provider object → danger zone → reason → fresh-MFA indicator → second owner_admin approval → audit-line preview → suppress Business. The mutation exists; two-person orchestration is marked ABSENT, so the final button stays disabled.
5. **Incident response:** availability alert → Status & incidents → compare internal evidence with public `/status` → owner_admin drafts customer impact → reason + fresh MFA → save draft → audit event. Health readbacks and incident backend are ABSENT, so the wireframe does not claim a live status or publish.

## Role behaviour

The toggle uses the verbatim `owner_admin | support | reviewer` permission matrix. `owner_admin` sees guarded actions. `support` is routed to the preserved `/support?callRef=` context and may read readbacks and annotate triage only. `reviewer` is read-only. The matrix also warns that `use_break_glass` and `control_kernel_incidents` are declared permissions but currently bypass the authority seam, so those controls must not execute.

## Best and worst

**BEST at:** a founder-operator’s morning check. Reconciliation, outages and aging work are visually first; thresholds explain why an alert fired; every route from aggregate to evidence uses the same learned pattern.

**WORST at:** long-form casework and team coordination. A metric-led cockpit cannot replace Intercom/Plain-style conversation ownership, and the current source lacks the support case, SLA and assignment objects needed to make that credible.

## References borrowed

- Shopify overview dashboard for compact key metrics, comparisons and drill-down behaviour: [Shopify analytics overview](https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/using-the-overview-dashboard).
- PostHog for evidence-led debugging and session context, without rebuilding the replay product: [PostHog session replay](https://posthog.com/docs/session-replay/how-to-watch-recordings).
- Statuspage for public incident communication and system metrics: [Statuspage system metrics](https://support.atlassian.com/statuspage/docs/what-are-system-metrics/) and [incident communication](https://support.atlassian.com/statuspage/docs/incident-communication-tips/).
- Stripe for object timelines, finance reconciliation and action-required accounts: [Stripe refund timeline](https://support.stripe.com/questions/how-to-trace-a-refund-using-reference-numbers), [Stripe reports](https://docs.stripe.com/reports), [Stripe Connect review](https://docs.stripe.com/connect/dashboard/review-actionable-accounts).
- Linear for explicit queue dispositions: [Linear Triage](https://linear.app/docs/triage).
- GitHub for reasoned, reauthenticated sensitive actions and audit context: [sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode), [impersonation](https://docs.github.com/en/enterprise-server@3.20/admin/managing-accounts-and-repositories/managing-users-in-your-enterprise/impersonating-a-user), [audit log](https://docs.github.com/en/enterprise-cloud/latest/admin/concepts/security-and-compliance/audit-log-for-an-enterprise).

## Cognitive-load argument

The first viewport has one decision: investigate the headline blind spot or scan the ten numbers. Ten numbers are chunked into seven named business domains, so the operator scans groups instead of holding a flat metric set in memory. Eight alert rules externalise both current state and threshold, removing threshold recall. Detail is progressively disclosed through one repeated path: number → list → object → action. Related refs remain visible on the object, so support never has to remember IDs between screens. Raw storage, identity security and payout onboarding link out to Convex, Clerk and Stripe rather than adding competing control systems.

## Open questions

1. What canonical event represents an intentful Tool request for fill-rate denominator and deduplication?
2. What is the authoritative formula for Agentic Economy take, including refunds and Provider obligations?
3. Where can an admin read total Business Credit liability and cash/processor balances at one reconciliation cut-off?
4. Which durations and eligible-minute events should back p50/p95 and 99.9% SLO calculations?
5. Who may be the second owner_admin approver, what is the expiry, and may they amend the reason?
6. What published SLA applies to Purchase resolutions, removal requests and critical support cases?
7. Should incident drafting remain in the console while publishing is delegated to a hosted status provider?
8. What retention, pagination and export limits apply to Audit?
