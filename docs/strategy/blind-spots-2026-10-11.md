# What aecon is missing

Date: 11 October 2026. Scope: the basics that sit around the product, checked before paid calls open to everyone. Method: a domain-by-domain sweep of the platform repo (origin/main), the site repo and the live sites. Legal and tax points are checklist items from reference knowledge, not advice. Each needs a professional.

Statuses: confirmed means the evidence held up on a second look. Disputed means a verifier disagreed or could not reproduce it, so check before acting (section 5). Three items were refuted and dropped (listed in section 5).

## 1. The ten blind spots that matter most

Ranked by risk to customers, money and the company.

### 1. No written Stripe approval and no legal opinion for prepaid AUD credit (owner: Joel)
- Why it matters: if Stripe or a regulator decides stored credit is a restricted or licensed activity, the account can be frozen with customer money inside.
- Evidence: the operating model (docs/archive/2026-10-05/operating-model.md:63-70) says virtual credits need written Stripe pre-approval and marks the AUSTRAC position as [confirm]. The whitepaper (AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md:274-281) analyses non-cash payment facility status. No approval or counsel sign-off exists in either repo.
- Smallest fix: send Stripe the funds flow, checkout wording, credit terms and refund policy and get approval in writing. Book one session with a fintech lawyer. File both outcomes in docs/.

### 2. Chargebacks are not handled at all (owner: build)
- Why it matters: a disputed top-up would sit unseen while the credit it bought is still spent, and the dispute deadline would pass.
- Evidence: only checkout.session.completed, async_payment_succeeded, async_payment_failed and expired are handled (convex/moneyLedgerValues.ts:72-75). No charge.dispute literal exists in code. Refund events are handled (convex/lib/money/funding/stripeRefundPipeline.ts).
- Smallest fix: subscribe the Stripe endpoint to charge.dispute.created, updated and closed, and route them through the existing stripeEventPipeline to freeze the credit and write a ledger hold, mirroring the refund pipeline.

### 3. Nothing stops card testing or free-credit farming (owner: both)
- Why it matters: bots testing stolen cards raise Stripe dispute rates and get the account restricted. Sign-up farming drains trial credit.
- Evidence: no Radar, 3DS or request_three_d_secure anywhere in convex/ or src/. The credit Checkout call (src/lib/server/stripe-checkout-evidence.ts:58-62) has no fraud parameters. No limit on checkout creation in convex/lib/platform/rateLimit.ts:35-69. Trial credit is granted on sign-up (convex/lib/adminConsole/actions/trial.ts) and no captcha is integrated.
- Smallest fix: Joel confirms Radar is on in live Stripe and enables Turnstile in Clerk. Build adds request_three_d_secure automatic, a first top-up cap, a rateLimiter call on checkout creation (about 5 per hour per account) and a per-account trial grant limit.

### 4. Two conflicting terms and privacy pages, no entity name, no recorded acceptance (owner: both)
- Why it matters: customers could be bound by terms that say they are a draft, and you could not prove who accepted what.
- Evidence: aecon.ai/terms is the full 15-section version dated 6 September. app.aecon.ai/terms is labelled "draft for review" dated 1 October and says the legal entity must be confirmed. The same split exists for privacy. Sign-up has only a passive link (SignUpLegalFooter.tsx). No termsAccepted or termsVersion field exists anywhere. The legal name appears on neither site's legal pages.
- Smallest fix: Joel confirms the entity (Agentic Economy Technologies Pty Ltd, ABN 98 700 838 115) and a legal contact. Build serves one copy of terms and privacy from the site, points the app routes at it, removes the draft banner, adds a version string, and adds an unticked checkbox at sign-up and first funding that stores termsVersion and acceptedAt and blocks the first load until set.

### 5. The funding and refund schedule does not exist, and the money-holding answer is missing (owner: Joel)
- Why it matters: the terms say refund eligibility, fees and expiry follow an "accepted funding schedule" that nobody has written, and customers cannot be told where their AUD sits.
- Evidence: aecon.ai/terms sections on AUD credit and refunds point to the schedule. public/pricing.md says it will be "published separately before access begins". aecon.ai/refunds is 404. No document states where prepaid AUD is held and by whom.
- Smallest fix: write a one-page schedule (load fee, GST on fee, purchased credit refundable, promo credit not, expiry, closure and residual balance handling) and one paragraph on custody. Lawyer and accountant review both. Link from the funding screen, terms, pricing page and trust page.

### 6. Provider side is not ready for paid providers (owner: both)
- Why it matters: paying third parties without an agreement, tax facts or a working payout path creates tax and dispute exposure from the first sale.
- Evidence: terms say providers need an accepted provider agreement, but none exists in either repo. No provider ABN or GST capture exists (customer-only taxFactsUpsert.ts). The earnings card says "Payout not yet observed". Lifecycle map row 33a says provider payout is not wired. hasUnresolvedPayouts is a stub that always returns false (convex/lib/capabilitySupply/providerOffboarding/caseState.ts:82-84), so offboarding can finish with money owed.
- Smallest fix: Joel drafts a short provider agreement and gets the accountant's GST answer. Until signed, restrict to invited providers. Build adds a versioned accept step, a supplier tax-facts record, implements hasUnresolvedPayouts against providerObligations, and runs one manual payout end to end.

### 7. No tested restore for either database, and no incident runbook (owner: both)
- Why it matters: if the ledger or Convex data is lost or corrupted mid-launch, there is no rehearsed way back and no written first step.
- Evidence: Formance has PITR and an AWS Backup copy plus a recovery drill script (infra/package4/), but no drill receipt exists. No Convex export or restore is documented (disputed, see section 5). docs/operations has no incident or kill-switch runbook, and the money crons in convex/crons.ts have no documented failure response. No NDB breach plan exists.
- Smallest fix: run the Formance drill once and file the receipt. Confirm Convex backup plan and do one import into dev. Write docs/operations/incident-runbook.md (symptom, first check, payments-off switch, who to tell, how to resume, breach assessment clock) and rehearse the kill switch on dev.

### 8. No insurance and no second person with access (owner: Joel)
- Why it matters: a customer claim, a breach or Joel being unreachable could end the company, and there is no cover or backup person.
- Evidence: no mention of insurance in any repo. Git history shows one main author. No second admin is named for Vercel, Convex, Clerk, Stripe, Cloudflare, AWS, Resend or the Base treasury wallet, and no access register is committed.
- Smallest fix: get tech PI, cyber and public liability quotes and ask the broker to confirm cover for prepaid credit and USDC payouts. Write a non-secret access register, add a second owner to each service, and test one break-glass login.

### 9. Alarms exist on paper but nothing reaches Joel (owner: both)
- Why it matters: a failed payment path or outage would be found by customers first.
- Evidence: no external uptime monitor. docs/operations/journey-alerts.md says "Until delivery and a test notification are verified, the rule is not operational", and no rule is shown live. Reconciliation mismatches do not email Joel (the digest is a stalled-work digest). No vendor spend ceilings are set (disputed, see section 5). /status covers website and catalogue probes, not Stripe, Formance or settlement.
- Smallest fix: add a free external monitor on aecon.ai, app.aecon.ai/api/health and the Convex site URL with SMS to Joel. Set SENTRY_DSN in prod, create one alert per journey, send a test notification to Joel's phone and record it. Route reconciliation failure to Joel's address.

### 10. No automated checks on main, no secret or dependency scanning (owner: build)
- Why it matters: with payments live, a bad merge or a leaked key ships straight to production.
- Evidence: platform workflows are cli-release.yml plus two disabled workflows. The full gate (npm run gate) runs by hand. Branch protection returned 403 on a private repo. No dependabot.yml, npm audit or gitleaks step. The site repo already has check.yml and dependabot.yml.
- Smallest fix: add one ci.yml on pull_request running npm run check and test:unit, copy the site dependabot.yml, and add one job running gitleaks and npm audit --omit=dev --audit-level=high. Joel upgrades the GitHub plan or records the local-only gate decision.

## 2. Joel's list

Grouped by who to ask. Questions are written to paste into an email.

### Lawyer (Australian fintech and privacy)
1. Stored value: "Does selling prepaid AUD credit, spendable only on aecon, need an AFSL, a non-cash payment facility exemption or any ASIC relief? Does aecon holding AUD and buying USDC for its own suppliers make it a designated service under the AML/CTF Act?" (blocks paid launch)
2. Funds custody: "Must customer prepaid funds sit in a trust or separate account, or can they be held in the operating account?"
3. Terms: "Please review the terms, the funding and refund schedule, the chargeback hold clause and the agent-authority clause. Who bears a loss when a customer's agent overspends within or beyond its controls?"
4. Liability: "The whitepaper says our contract caps liability under s64A. The terms have no cap. Should we add a business-only cap with a consumer carve-out, or remove the claim?"
5. Provider agreement: "Please draft a short provider agreement covering seller of record, fees, payout timing, failed-work and refund allocation, delisting and data duties."
6. Privacy: "Confirm the overseas recipients wording (APP 8 and APP 5) once I list processor countries. Do we need a DPA at alpha, or should we say none is offered?"
7. Screening and thresholds: "Are unscreened payees acceptable at public launch? What cumulative top-up or payout figure should trigger an identity check?"
8. Breach plan: "Review my one-page notifiable data breach runbook."
9. Disclosure policy: "Wording for a good-faith safe harbour on the security page."
10. Dispute scheme: "Do funded balances mean we should join an external dispute resolution scheme?"

### Accountant
1. Engagement: "Please act as accountant and bookkeeper. Should GST be on a cash or accrual basis, is BAS monthly or quarterly, and is Xero or MYOB the book of record?"
2. GST on load: "We charge a fee on loading credit. What is the GST treatment of the fee, of the credit itself, and of promo credit?" (blocks paid launch)
3. Liability: "Should prepaid credit sit as a customer-credit liability with the fee recognised when earned or at load?"
4. Tax invoice: "What must our load receipt and tax invoice show (ABN, GST amount, fee line)?"
5. Provider payouts: "Does GST apply to AE fees versus provider payouts? Do we self-bill or collect provider invoices? Any withholding for AU or overseas providers?"
6. BAS: "Please confirm the mapping for G1, 1A and 1B from our ledger CSV."
7. USDC: "Tax treatment of holding and spending a USDC float."

### Stripe
1. Approval: "We sell prepaid AUD credit, usable only on our platform. Please confirm in writing this is allowed under the Australian Services Agreement. Here are the funds flow, checkout wording, terms and refund policy."
2. Fraud: "Confirm Radar is on for the live account and enable the card-testing rules."
3. Live mode: "Confirm live keys, the webhook endpoint for app.aecon.ai, the dispute event subscriptions and the AU GST-inclusive tax rate in live mode."
4. Roles: "Add a second owner."

### Insurer or broker
1. "Quote tech professional indemnity, cyber and public liability. Confirm cover for prepaid customer credit, the Stripe funding flow and USDC payouts, and for a runaway customer agent."

### Business actions (no one to ask, only you)
- Confirm entity name, trading name, registered address and a named privacy officer.
- Pick one support address, make sure it is monitored, and set a response promise you can keep (for example, 2 business days).
- Create the uptime monitor account and set vendor spend alerts (OpenRouter limit, Vercel, Convex, Stripe).
- Set Clerk bot protection and MFA, check Clerk recovery settings and Vercel Preview env points to staging Convex.
- Contract a blockchain screening provider for x402 payees, or record the decision to launch without it.
- Write the USDC float policy, log retention periods (for example 30 days operational, 7 years financial) and a Monday five-number review.
- Collect two or three consented alpha quotes, book five customer interviews, run an IP Australia search for aecon and Agentic Economy (classes 9, 36, 42).
- Submit to the official MCP registry and one directory.
- Read two weeks of DMARC reports and move to quarantine.

## 3. Build list

Atomic, ordered. Complete 1 to 8 before paid calls open.

### Money and abuse
1. Subscribe to charge.dispute.created, updated, closed and route through stripeEventPipeline to freeze credit and write a ledger hold.
2. Add request_three_d_secure automatic and a first top-up cap in creditSessionCreateParams.
3. Add a rateLimiter entry for credit checkout creation (convex/lib/platform/rateLimit.ts).
4. Rate-limit the trial grant per account and per fingerprint (convex/lib/adminConsole/actions/trial.ts).
5. Wire the screening provider call into x402 spendAdmission and confirm AE_X402_PAYEE_SCREENING_POLICY in the prod manifest.
6. Gate large top-ups on an identity check above the threshold Joel sets.
7. Add a read query that returns the call records for a charge as a dispute evidence bundle.

### Legal surfaces and consent
8. Serve one terms and one privacy page, add the version string, entity name, ABN and address, delete the draft banners and the "need confirmation" footers.
9. Add the acceptance checkbox and store termsVersion and acceptedAt on the principal record.
10. Publish the funding and refund schedule, sub-processor table, and "where your money is" paragraph; link them from terms, privacy, pricing and the add-credit panel.
11. Fix the 404 legal links on app.aecon.ai (/legal/terms, /legal/trust).

### Provider
12. Implement hasUnresolvedPayouts against providerObligations, plus a test.
13. Add a versioned provider agreement accept step and a supplier tax-facts record.
14. Define the payout state machine, run one manual payout, wire the payout email.
15. Add a Calls tab to the provider workspace reading supplyCallsListing.
16. Enforce required listing fields at publish.
17. Provider FAQ topics in help.contracts.ts; send the verification-failed email.

### Accounts and support
18. Handle user.deleted in api.clerk.webhook.ts: block while balance is non-zero, then run eraseAccountJourney. Disable Clerk self-delete or route it through this.
19. Add tax invoice sandbox run, then enable taxInvoiceIssuance. Add ABN, GST and fee line to the receipt.
20. Add 6 to 8 FAQ entries to /support (loading credit, how a call is charged, refunds, receipts, can't sign in) and the response promise.
21. Add the AUD-and-settlement line to the add-credit panel and receipt.

### Operations and platform
22. Add ci.yml (check and test:unit), dependabot.yml, and a gitleaks plus npm audit job. Mirror the dependabot and audit steps in the site check.yml.
23. Write docs/operations/incident-runbook.md and docs/security/incident-response.md.
24. Route reconciliation mismatch or treasury failure to Joel's address.
25. Make /status read real health and add Stripe webhook, Formance, x402 settlement and Convex rows with last-checked time.
26. Report the Convex deployment id from /api/v1/release so previews can be checked in one request.
27. Write the secrets rotation runbook and the vendor dependency table (what breaks if each is down).

## 4. Soon and later

### Legal and trust
- Soon: DPA decision, disclosure policy and safe harbour at /security, aecon.ai/security redirect to the trust page, incident history page, third-party disclosure on the site, support response target and complaints route, one source for legal text across the two repos.
- Later: investor update and data room.

### Payments and finance
- Soon: customer sanctions screening at first top-up, BAS report from ledger postings, monthly Stripe to ledger reconciliation, customer-credit liability account in the Formance plan, provider payable account and monthly provider statements, month-end close checklist and bundled export, USDC float policy wired into health check.
- Later: Xero integration.

### Security
- Soon: remove unsafe-inline from app script-src, add default-src to the site CSP, HSTS includeSubDomains, security.txt and SECURITY.md in the platform repo, per-IP limits on unsubscribe and Resend webhook routes, secrets rotation dates.
- Later: bug bounty.

### Ops and platform
- Soon: error triage routine, log retention decision, scripted release with SHA readback, flag table generated from manifest.ts, migration checklist, clear the 24 unclassified env names, secrets matrix per environment, staging kept current.
- Later: Datadog (ADR 0005 stays proposed until needed).

### Growth and product
- Soon: pricing page with fee, GST and a worked example, per-tool URLs in the app sitemap, PostHog funnel and a single North Star, finish UTM capture on the site through to the first journey event, social proof, MCP well-known and registry listing, session and device page check, MFA prompt, accessibility check in CI, DMARC to quarantine, weekly review, customer interviews, trademark.
- Later: changelog, RSS feed, referral programme, provider analytics, empty states and mobile polish.

## 5. Disputed items to check

A verifier disagreed or could not reproduce these. Check before treating as gaps.
- Liability cap: whether the whitepaper claim or the terms should change is a lawyer call.
- Agent overspend terms: whether terms match the spending-policy semantics.
- Vulnerability disclosure policy (scope, safe harbour): exists elsewhere?
- Convex backups: a scheduled export or Pro-plan backup may exist outside the repo. Check the Convex dashboard.
- Vendor cost alerts: limits may be set in vendor dashboards, which the repo cannot show.
- Abuse report path for paid calls: may be covered by the existing removal-dispute queue.
- Provider help channel: provider FAQ may exist on /for-providers.
- Tax receipts: the accountant's required fields are not yet sourced.
- Accountant engagement: Joel may already have one, the repo would not show it.
- Sitemap per-tool URLs: may be intentionally excluded.
- Account closure and erasure: Clerk self-delete behaviour needs a live test.
- Accessibility: manual checks may exist outside CI.
- Public status page scope: whether payment probes belong on a public page or only internal.
- Month-end close: pieces exist, a checklist may be enough.

Refuted and dropped: webhook route authentication (handlers are signed), USDC float policy as missing (a policy is referenced), analytics dashboards as missing (journey and PostHog wiring exists).

## 6. What is already in good shape

- Acceptable use policy, cookie and analytics consent, commercial email consent with unsubscribe (Spam Act), GST tax invoice code on load (the issuance flag is still off).
- USDC custody caps (0.5 per call, 10 per day, 2 per payee per day), refund flow for top-ups and calls, treasury reconciliation to the ledger, provider dispute and refund reversal.
- Admin access controls and audit trail, public security report channel and security.txt on the site, security headers with an enforcing CSP and HSTS on the app.
- Status page and in-product contact from receipts and recovery states, error pages, account settings, team roles, agent API key management, notification preferences, data export, tax profile.
- Canonical, Open Graph and structured data, llms.txt, waitlist and CRM capture, an about page naming the founder.
- Rollback path, journey analytics and error monitoring wiring, Formance backups and restore tooling (needs the drill), legal pages and a security contact live.
