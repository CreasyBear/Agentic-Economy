# User, Organization & Application Ergonomics Register

**Date:** 18 September 2026  
**Status:** ACTIVE REFINEMENT REGISTER (Step-by-Step Subagent Protocol)  
**Operating Protocol:** `docs/operations/user-and-org-ergonomics-protocol.md`  
**Functional Baseline Reference:** `docs/operations/user-and-org-maturity-register.md`  
**Design Standards:** Emil Kowalski Design Engineering, Impeccable Craft, Stripe Developer UX, Linear Interaction Polish

---

## 1. Progress & Census Scorecard

*Refinement in Progress via 3-Phase Subagent Protocol*

| Wave | Workflows | Scope | Verified | In Review | Pending | Target Status |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: Buyer Onboarding & Developer Launchpad** | 6 | `W-01`, `W-02`, `W-25`, `W-26`, `W-27`, `W-29` | 6 | 0 | 0 | **VERIFIED** |
| **Wave 2: Financial Peace-of-Mind & Spend Observability** | 8 | `W-20`, `W-21`, `W-22`, `W-23`, `W-24`, `W-38`, `W-39`, `W-40` | 8 | 0 | 0 | **VERIFIED** |
| **Wave 3: Supplier Monetization & Testing Playground** | 8 | `W-30`, `W-31`, `W-32`, `W-33`, `W-34`, `W-35`, `W-36`, `W-37` | 8 | 0 | 0 | **VERIFIED** |
| **Wave 4: Team Operations, Identity & Tactile Standards** | 22 | `W-03`–`W-09`, `W-10`–`W-19`, `W-28`, `W-41`–`W-44` | 22 | 0 | 0 | **VERIFIED** |
| **Total** | **44** | **All 44 Standard Workflows** | **44** | **0** | **0** | **VERIFIED** |

---

# Wave 1: Buyer Onboarding & Developer Launchpad

### W-01: Sign-In with Multiple Auth Methods
- **Surfaces:** `src/routes/sign-in.$.tsx`, `src/components/ae/website/AeSiteAuthPanel.tsx`, `src/components/ae/website/clerk-appearance.ts`
- **Incumbent Baseline:** Standard Clerk `<SignIn />` widget mounted inside centered card.
- **Ergonomic Gap:** Input lacks automatic focus on desktop; transition between auth modes has minor layout jump; no indicator of which social provider was previously used.
- **Target Ergonomic Spec:**
  - Auto-focus email field on page load for immediate keyboard entry.
  - Smooth layout animation on auth option toggle using CSS transitions.
  - Clear visual affordances and semantic visual tokens matching AE theme.
- **Subagent Assignment:** Grok (Scout: `ad192b94-570b-4ccf-9d1f-fc1a0427e110`) $\rightarrow$ Composer (Craft: `7c4b76c0-f1b1-4c18-98ba-7c06547acf65`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-02: Sign-Up with Post-Registration Workspace Setup
- **Surfaces:** `src/routes/sign-up.$.tsx`, `src/routes/onboarding.tsx`, `convex/interactiveOnboarding.ts`
- **Incumbent Baseline:** Functional 2-step onboarding form with role selection radio buttons and workspace name input.
- **Ergonomic Gap:** Text-heavy role selection; manual company naming; no visual dopamine or celebration upon workspace creation.
- **Target Ergonomic Spec:**
  - Visual role selection cards: "Buyer / Agent Operator" vs "Supplier / Tool Provider" with keyboard shortcuts (`1` / `2`).
  - Auto-extract suggested workspace name with sanitized company fallback.
  - Instant optimistic workspace creation with celebratory welcome toast: *"Workspace Acme created. Let's make your first Call."*
- **Subagent Assignment:** Grok (Scout: `6af0f291-522a-477a-a659-f1fb82ffb629`) $\rightarrow$ Composer (Craft: `4b79191e-5e49-4eca-a0c8-901c464ed0fc`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-25: Multi-Harness Connect Agent Wizard
- **Surfaces:** `src/components/ae/console/AeConnectAgentWizardDialog.tsx`, `src/components/ae/console/AeKeyRevealDialog.tsx`, `src/modules/agent-access/config-snippets.ts`, `src/components/ae/data/AeCopyCommand.tsx`
- **Incumbent Baseline:** 3-step modal with environment selection, spending limits, and plain key generation.
- **Ergonomic Gap:** Key is generated in isolation; developer must figure out how to configure their specific client environment; no direct copyable snippets for Cursor, Claude Code, Python, or cURL.
- **Target Ergonomic Spec:**
  - Step 1: 620px dialog, tactile Label-wrapped environment and authority cards, reserved spend limit slot with tabular A$ amounts, live name counter, Rule 4 error triplets.
  - Step 2: Multi-Stack Developer Launchpad with destination guides for Cursor, Claude, Python, and cURL, tab-specific copy hints, and clean non-prompt formatting for JSON/Python.
- **Subagent Assignment:** Grok (Scout: `2c984b5d-212d-4453-9ed0-dd757c77cf23`) $\rightarrow$ Composer (Craft: `861b596f-9320-4a34-8d7c-ee1fb63de359`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-26: Granular Spending Policy Control
- **Surfaces:** `src/components/ae/console/AeAgentSpendingLimitsForm.tsx`, `src/modules/agent-access/agent-operator-view-model.ts`
- **Incumbent Baseline:** Numeric input fields for daily and monthly spend limits with save button.
- **Ergonomic Gap:** Hard to visualize what a daily/monthly limit represents relative to real agent usage; no feedback on current burn rate or remaining daily quota.
- **Target Ergonomic Spec:**
  - Tabular monospace numbers everywhere (`tabular-nums font-mono`).
  - Persistent monthly settled quota gauge with `<Progress />` bar (`Monthly settled: A$12.50 / A$100.00 (12.5%)`).
  - Tactile preset chips: Conservative (`A$2/A$10/A$50`), Balanced (`A$5/A$25/A$100`), Intensive (`A$20/A$100/A$500`).
  - Amount-aware toasts on save, pause, and resume.
  - Reserved diagnostic slot with human-readable Rule 4 triplets (no raw codes).
  - Zero-CLS consistent layout and commercial pause cues (`A$0.00 new spend authorized`).
- **Subagent Assignment:** Grok (Scout: `2a907ccb-4bb5-4023-a082-e41b8018d621`) $\rightarrow$ Composer (Craft: `b3d6d27b-02a1-4194-a0bd-fff069dec276`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-27: One-Time API Key Reveal Modal
- **Surfaces:** `src/components/ae/console/AeKeyRevealDialog.tsx`, `src/components/ae/data/AeCopyCommand.tsx`
- **Incumbent Baseline:** Dialog displaying generated secret key string with copy button.
- **Ergonomic Gap:** Secret is exposed in plain text by default; copy button gives basic feedback; dismissal warning is small text.
- **Target Ergonomic Spec:**
  - Monospace secret display with masked toggle (`••••••••••••••••` / eye toggle) and single-line zero-CLS well.
  - Secret copy copies full secret even when masked, with 2000ms checkmark transition and inline confirmation status.
  - Snippets show redacted bullets when masked while preserving full secret in clipboard on copy.
  - Security guardrail banner: *"This secret will never be shown again. Store it securely."*
  - Requires explicit checkbox confirmation before modal can be dismissed; attempts to close trigger a warning ring and prompt without silent failure.
- **Subagent Assignment:** Grok (Scout: `2be458c7-d9ed-4991-ab30-f1a6ec99e9cd`) $\rightarrow$ Composer (Craft: `adf95465-161c-4b10-bc1c-6202dd5361d7`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-29: Contextual Quickstart Snippets
- **Surfaces:** `src/modules/agent-access/config-snippets.ts`, `src/components/ae/console/AeKeyRevealDialog.tsx`, `src/components/ae/data/AeCopyCommand.tsx`
- **Incumbent Baseline:** Static code string templates in helper functions.
- **Ergonomic Gap:** Not integrated with syntax highlighting; no 1-click `.env` or `mcp.json` file download option.
- **Target Ergonomic Spec:**
  - Theme-aware code card with monospace typography and tactile copy button.
  - 1-click *"Download mcp.json"* (Cursor) and *"Download .env"* (general/Python) with full secret embed and destination toast.
  - Inline Connection status radar with animated ping dot (*"Waiting for first Call from {displayName}..."*) and static verified state (*"First request received"*).
  - Zero-CLS reserved slots for destination, snippet, download, and radar regions.
- **Subagent Assignment:** Grok (Scout: `5e5eb93d-7eeb-45c7-ba88-6819794f64a9`) $\rightarrow$ Composer (Craft: `930c935f-02c7-4d2b-b88e-b673f2e78df0`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

# Wave 2: Financial Peace-of-Mind & Spend Observability

### W-20: Prepaid Credit Top-Up Console
- **Surfaces:** `src/routes/_operator/owner.credit.tsx`, `src/components/ae/console/AeCreditTopUpPanel.tsx`, `src/components/ae/console/AeOwnerCredit.tsx`, `src/components/ae/console/credit-top-up-format.ts`
- **Incumbent Baseline:** Basic input field with Stripe checkout redirection.
- **Ergonomic Gap:** User must manually calculate GST or guess common refill amounts; no instant post-payment balance verification.
- **Target Ergonomic Spec:**
  - Tactile denomination chips (`+A$5.00`, `+A$10.00`, `+A$25.00`, etc.) with pill styling, monospace tabular figures, and keyboard navigation.
  - 4-row live Australian GST breakdown (Credit added, Platform fee, Australian GST 10%, Total payable) with explanatory footnote.
  - Zero-CLS reserved quote shell (`min-h-[13.5rem]`) and constraints skeleton.
  - Instant celebratory confirmation toast upon return from checkout and updated available credit messaging.
  - Rule 4 failure and status playbooks stating money safety and explicit next steps.
- **Subagent Assignment:** Grok (Scout: `b11ccd1e-ee09-45d4-99ba-5a3522c305c5`) $\rightarrow$ Composer (Craft: `74ab4eda-b4ba-49b2-89d7-14126746e726`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-21: Auto-Recharge Trigger & Safety Controls
- **Surfaces:** `src/components/ae/console/AeAutoRechargeCard.tsx`, `src/components/ae/console/auto-recharge-copy.ts`, `src/components/ae/console/AeOwnerCredit.tsx`, `convex/moneyAutoRecharge.ts`
- **Incumbent Baseline:** Toggle switch with threshold and recharge amount inputs.
- **Ergonomic Gap:** Unclear trigger logic; operator cannot see when auto-recharge last triggered or whether it succeeded.
- **Target Ergonomic Spec:**
  - Dynamic plain-English trigger statement in reserved `min-h-[2.75rem]` slot: *"When balance dips below A$20.00, automatically add A$50.00 using your default payment method."* (or disabled status).
  - Quick setup preset chips (Conservative, Standard, Intensive) with tactile press physics and `aria-pressed` states.
  - Monospace tabular numbers on all money inputs (`font-mono tabular-nums`) with clear range helper text.
  - Reserved `min-h-[5.5rem]` status slot displaying pulsing indicator for pending top-ups, mandate requirements, and Rule 4 diagnostic triplets on refusal.
  - Amount-aware `toast.success` affirming active standing orders and A$0.00 safety reassurance.
  - Zero-CLS loading skeleton in owner credit console.
- **Subagent Assignment:** Grok (Scout: `f664de54-3639-47a5-be12-4096f24d5294`) $\rightarrow$ Composer (Craft: `9b118d29-8d5c-4d56-96f6-a42df320b18b`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-22: Stored Payment Methods & Stripe Customer Portal
- **Surfaces:** `src/components/ae/console/AeSavedPaymentMethodsCard.tsx`, `src/lib/server/stripe-customer-portal.ts`
- **Incumbent Baseline:** External Stripe portal redirect button.
- **Ergonomic Gap:** User cannot see their current default card brand, last 4 digits, or expiry date without leaving the application.
- **Target Ergonomic Spec:**
  - Card brand well glyph (`V`, `MC`, `AX`, `EF`, etc.) with semantic badges and `Default` status indicator.
  - Masked PAN formatted as `•••• 4242` with `font-mono tabular-nums`.
  - Expiry date display with automated `Expired` or `Expires next month` status badges.
  - Persistent PCI trust reassurance line: *"Stored securely by Stripe, never touches our servers."*
  - Clear portal intent helper explaining Stripe hosted management of payment cards.
  - External link affordance with Emil Kowalski press physics on action buttons.
  - Reserved diagnostic slot with Rule 4 triplet and toast error on portal generation failure.
  - Complete skeleton height parity to eliminate CLS.
- **Subagent Assignment:** Grok (Scout: `35970f03-ae22-49d6-912d-4e8c08a8b616`) $\rightarrow$ Composer (Craft: `e6d0c3b5-9dd0-4d52-9d68-05817815b21d`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-23: Organization Monthly Hard Ceiling
- **Surfaces:** `src/components/ae/console/AeMonthlySpendCeilingCard.tsx`, `src/components/ae/console/monthly-spend-ceiling-copy.ts`, `src/components/ae/console/AeOwnerCredit.tsx`, `convex/moneyMonthlySpendBudget.ts`
- **Incumbent Baseline:** Basic text input and save button.
- **Ergonomic Gap:** Static number gives zero context on whether the workspace is about to hit its ceiling.
- **Target Ergonomic Spec:**
  - High-trust textual summary with tabular figures: `A$145.20 spent of A$500.00 monthly cap (29%)` in reserved `min-h-[2.75rem]` slot.
  - Clear reassurance when disabled explaining calls are bounded only by prepaid credit and agent spending policies, with no surprise overage charges.
  - Velocity progress gauge with semantic utilization color mapping (`bg-success`, `bg-warning`, `bg-destructive`).
  - Reserved `min-h-[5.5rem]` alert slot displaying approaching limit warning (≥90%), limit reached danger alert (≥100%), and spend data status.
  - Modal dialog with tactile preset chips (A$100, A$250, A$500, A$1,000) and live natural language consequence preview.
  - Rule 4 diagnostic alert and `toast.error` for invalid inputs or revision conflicts; `toast.success` confirming cap status.
  - Zero-CLS loading skeleton in owner credit console.
- **Subagent Assignment:** Grok (Scout: `5127474d-a6e9-49a8-9c67-6b7fcd5360ce`) $\rightarrow$ Composer (Craft: `d9ad5b19-295b-4e44-9a40-f26e631e2e10`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-24: ATO Tax Invoice Generation & Itemized GST
- **Surfaces:** `src/components/ae/console/AeInvoiceHistoryTable.tsx`, `src/components/ae/console/AeOwnerCredit.tsx`, `src/routes/_operator/owner.credit.tsx`, `tests/unit/components/invoice-history-table.test.tsx`
- **Incumbent Baseline:** Table listing invoices with external links.
- **Ergonomic Gap:** Invoices cannot be searched by number; tax facts cannot be updated inline; no batch download for accounting.
- **Target Ergonomic Spec:**
  - Table loading skeleton matching 5-column layout to prevent layout shift on load.
  - Dedicated structured empty card explaining receipt and ATO tax invoice preservation.
  - Itemized Australian GST breakdown (`A$X.XX GST included`) alongside gross amount in tabular numbers.
  - Semantic status badges (`Paid` secondary badge, `Reversed` outline badge).
  - Tactile action buttons with icons (`Download` icon for Tax Invoices, `ExternalLink` for Stripe receipts).
  - Contextual tax withhold guidance linking directly to `/owner/workspace` for ABN setup.
  - Enhanced 8-column RFC 4180 CSV export with gross, GST, and net AUD columns and celebratory success toast.
  - Rule 4 playbooks and toast error handling for invoice/receipt download failures.
- **Subagent Assignment:** Grok (Scout: `7b169543-75f4-49a4-8815-1a1c091d147c`) $\rightarrow$ Composer (Craft: `314d4ffc-fd54-43bc-ab39-af15052b5a69`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-38: Consolidated Call Activity Log & Filtering
- **Surfaces:** `src/routes/_operator/activity.tsx`, `src/lib/export/csv-export.ts`, `tests/unit/components/ae-activity-filters.test.tsx`
- **Incumbent Baseline:** Table of Calls with basic agent filter.
- **Ergonomic Gap:** Lacks multi-criteria filtering; execution latency and cost breakdown are not scannable; no date range picker.
- **Target Ergonomic Spec:**
  - Separate Status (delivery state) and Purchase status (commercial resolution) badge columns with payment status cues.
  - Reserved `min-h-[3rem]` filter bar with date-scoped live count chips (All, Completed, Refused, Needs Attention).
  - Sentence-case date range chips (All time, Today, 7d, 30d) with tactile active press and `aria-pressed` states.
  - 1-click dismissible Agent filter pill directly integrated into the filter bar.
  - Zero-CLS queue empty states preserving section geometry when filters match 0 calls.
  - Enhanced 9-column RFC 4180 CSV export with gross, GST, and net AUD columns and celebratory success toast.
  - Rule 4 playbooks and money-safety alerts ("A$0.00 affected") for pagination and summary recovery.
- **Subagent Assignment:** Grok (Scout: `62e2290e-3513-45be-9789-5ce77041e51d`) $\rightarrow$ Composer (Craft: `cf05390a-7b4c-405b-800c-05ce18604e36`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-39: Actionable Call Receipt Diagnostic Playbooks
- **Surfaces:** `src/routes/_operator/calls.$callRef.tsx`, `src/components/ae/call-receipt/CallStatusViews.tsx`, `src/components/ae/call-receipt/CallReceiptPrimitives.tsx`, `src/components/ae/call-receipt/CallRecoveryPanel.tsx`, `src/modules/capability-execution/call-receipt-view.ts`
- **Incumbent Baseline:** Accordion modal showing receipt stages.
- **Ergonomic Gap:** Text-heavy stages; raw machine error codes on failure; lacks clear commercial resolution summary.
- **Target Ergonomic Spec:**
  - Standardized Diagnostic Playbook card with 4 labeled sections: What happened, Financial impact, Automatic, What you can do.
  - Plain-English error code translations and alias normalizations without machine jargon.
  - Explicit A$ financial peace-of-mind lines (*"A$0.00 charged — your prepaid balance is unaffected"* or *"Reserved credit was released back to your balance"*).
  - Prominent 1-click copy for Call reference with 2000ms checkmark transition and destination toast cues.
  - Aligned Zero-CLS skeleton geometry mirroring the loaded 5-region receipt shell.
  - Tactile active press physics on all recovery actions (Try again, Check status, Submit reconciliation evidence).
- **Subagent Assignment:** Grok (Scout: `767115bc-f925-4b52-96ee-56a2bb18502a`) $\rightarrow$ Composer (Craft: `ccb2a78d-b734-466c-930e-7b63bcc9ea7e`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-40: Multi-Format Data Export (CSV, JSON)
- **Surfaces:** `src/lib/export/csv-export.ts`, `src/routes/_operator/activity.tsx`, `src/components/ae/console/AeInvoiceHistoryTable.tsx`, `tests/unit/export/csv-export.test.ts`
- **Incumbent Baseline:** Button triggering browser download of CSV string.
- **Ergonomic Gap:** No export options; cannot filter export by date or outcome; lacks visual feedback during file generation.
- **Target Ergonomic Spec:**
  - Multi-format data export engine supporting RFC 4180 CSV with Excel UTF-8 BOM (`\uFEFF`) and pretty-printed JSON envelopes.
  - Reserved toolbar cluster with dynamic preview statement (*"Exporting 12 records"* or *"Exporting 12 loaded records"*).
  - Tactile format triggers (`CSV` and `JSON`) with Download icons and Emil Kowalski press physics.
  - Count-aware celebratory toasts (*"Exported 12 records to CSV"* / *"Exported 12 records to JSON"*).
  - Rule 4 playbooks and toast error handling for export failures (*"A$0.00 charged — your account data is unaffected"*).
  - Zero-CLS loading skeleton toolbar matching loaded cluster dimensions.
- **Subagent Assignment:** Grok (Scout: `fddb3598-c8ad-46eb-8feb-10b925ad7cf6`) $\rightarrow$ Composer (Craft: `96c44b81-2a8a-4bdd-9cc5-5c63e4a0e064`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

# Wave 3: Supplier Monetization & Testing Playground

### W-30: Supplier Activation & Guided Onboarding
- **Surfaces:** `src/components/ae/supply/AeSupplierOnboardingWizard.tsx`, `src/components/ae/offerings/AeProviderWorkspace.tsx`, `tests/unit/components/ae-supplier-onboarding-wizard.test.tsx`
- **Incumbent Baseline:** 3-step profile form and Connect redirect.
- **Ergonomic Gap:** Stepper looks like static text; estimated completion times not provided; provider lacks clarity on KYC requirements.
- **Target Ergonomic Spec:**
  - Interactive stepper navigation (`<nav aria-label="Supplier activation">`) with tactile buttons, `aria-current="step"`, and completion checkmarks.
  - Duration chips (`~2 mins`, `~3 mins`, `~1 min`) establishing clear time expectations per step.
  - Reassurance copy for Australian banking (Stripe Express KYC, BSB + Account Number direct credit, AE never stores bank numbers).
  - Live ABN input formatting (`XX XXX XXX XXX`) with tabular monospace digits (`font-mono tabular-nums`).
  - Zero-CLS shell (`min-h-[28rem]`) with reserved diagnostic slot (`min-h-[3rem]`, `aria-live="polite"`).
  - Rule 4 diagnostic triplets for validation and network errors with explicit `A$0.00 affected — profile was not updated` financial reassurance.
  - Celebratory feedback via `toast.success('Provider profile saved')` upon completion.
  - Semantic payout status badges (`Ready` / `Action Required`) with tactile action buttons.
- **Subagent Assignment:** Grok (Scout: `eb766448-175d-4a01-b5df-93bdef95cef9`) $\rightarrow$ Composer (Craft: `b5070776-1c39-4977-8932-dc6c9acd09b8`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-31: Stripe Express Dashboard SSO Portal
- **Surfaces:** `src/components/ae/supply/AeSupplyEarningsCard.tsx`, `tests/unit/ui/supply-funnel-earnings.test.tsx`
- **Incumbent Baseline:** Link generating Stripe Express SSO login URL.
- **Ergonomic Gap:** User doesn't know what they will find in the Express dashboard; lacks fallback if account is in pending verification.
- **Target Ergonomic Spec:**
  - Dedicated always-mounted status well (`min-h-[7.5rem]`) with semantic badges (`Stripe Express Account Active`, `Verification Pending`, `Action Required`).
  - Account reference display with masked account id (`acct_••••{last4}`).
  - 1-click tactile action *"View Bank Payouts on Stripe"* with `ExternalLink` icon and focus return handler after tab switch.
  - State-specific guidance: *"Manage bank account details, view payout transfer receipts, and download annual tax statements"*.
  - Australian banking reassurance: *"Direct AUD bank credits are managed directly in Stripe Express. Agentic Economy never stores bank account credentials."*
  - Rule 4 diagnostic alert triplet and `toast.error` for SSO link generation and pop-up blocker failures with `A$0.00 affected — your earnings and payout configuration remain safe.`
  - Zero-CLS reserved diagnostic slot (`min-h-[5.5rem]`) and button row (`min-h-touch`).
- **Subagent Assignment:** Grok (Scout: `38f6e711-8c8b-4ad7-8c47-dea2d3b7b5b5`) $\rightarrow$ Composer (Craft: `163f3456-bb7b-48bb-9967-4e99928a77d7`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-32: Predictable Payout Policy & Frequency Preferences
- **Surfaces:** `src/components/ae/supply/AePayoutPolicyForm.tsx`, `src/components/ae/supply/payout-policy-copy.ts`, `src/components/ae/offerings/ProviderWorkspacePayoutPolicyPanel.tsx`, `tests/unit/components/ae-payout-policy-form.test.tsx`
- **Incumbent Baseline:** Radio buttons for payout frequency.
- **Ergonomic Gap:** Supplier cannot see when their next payout will actually land or what balance has accumulated.
- **Target Ergonomic Spec:**
  - Tactile frequency selector cards: `Weekly on Monday` (*"Transferred every Monday 10:00 AM AEST"*), `Monthly on the 1st` (*"Transferred on the 1st of each month"*), or `Manual Approval` (*"Funds accumulate until you review and trigger payout"*).
  - Live projection schedule statement (*"Next scheduled payout: Monday 10:00 AM AEST"* / *"1st of next month"* / *"Payouts paused until manual review"*) in reserved status slot.
  - Formatted preset threshold chips (`A$10.00 (Min)`, `A$50.00 (Standard)`, `A$100.00`, `A$500.00`) with tactile press physics and `aria-pressed` states.
  - Live threshold summary line (*"Transfers will trigger when accumulated balance reaches A$50.00."*) with `font-mono tabular-nums`.
  - BECS direct credit reassurance copy regarding Australian bank settlement timing.
  - Rule 4 diagnostic alert triplets and toasts for below minimum, invalid amount, concurrent conflict, and network failure (`A$0.00 affected`).
  - Zero-CLS reserved shell (`min-h-[26rem]`), reserved diagnostic slot (`min-h-[3rem]`), and skeleton parity (`min-h-[26rem]`).
- **Subagent Assignment:** Grok (Scout: `0bd2f9f4-075a-4c6d-9770-eca7a4a73f5c`) $\rightarrow$ Composer (Craft: `ffe3edf8-6438-4aa4-ab7a-9a6aeec6128d`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-33: Connect Return Poller & Health Monitor
- **Surfaces:** `src/components/ae/supply/AeConnectReturnPoller.tsx`, `src/components/ae/supply/connect-return-poller-copy.ts`, `src/components/ae/offerings/AeProviderWorkspace.tsx`, `tests/unit/components/ae-connect-return-poller.test.tsx`
- **Incumbent Baseline:** Alert banner polling readiness on return.
- **Ergonomic Gap:** Static polling text; if verification fails or requires additional documents, the user is left guessing.
- **Target Ergonomic Spec:**
  - Animated radar pulse indicator (*"Verifying your payout setup with Stripe..."*) replacing generic spinner.
  - Celebratory success card (*"Payouts enabled. Your tools are now ready to monetize."*) with tactile primary action (*"Add your first Tool"*) linking to `/owner/operations/new`.
  - Single-shot celebratory toast (`toast.success('Payout setup verified', ...)`) guarded against poll re-renders.
  - Labelled Rule 4 diagnostic playbooks for restricted/missing KYC documents and processing timeouts (`A$0.00 affected`).
  - Tactile action buttons (*"Resume Stripe verification"*, *"Update verification documents"*, *"Check again"*).
  - Wired `onResumeVerification` in `AeProviderWorkspace.tsx` to open earnings and focus section.
  - Zero-CLS shell parity with `min-h-[11rem]` across all four poller states.
- **Subagent Assignment:** Grok (Scout: `214bd4b7-44f2-483c-8885-80fb35dbc5ed`) $\rightarrow$ Composer (Craft: `ce24da75-f4ce-4832-afc4-254d3537ca2d`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-34: Tool Performance & Catalog Inventory Table
- **Surfaces:** `src/components/ae/offerings/AeOwnerOfferings.tsx`, `src/components/ae/offerings/provider-workspace-projection.ts`, `tests/unit/components/ae-owner-offerings-inventory.test.tsx`, `tests/unit/ui/offering-surfaces.test.tsx`
- **Incumbent Baseline:** Table showing tool name, status, price, and call count.
- **Ergonomic Gap:** Column sorting is basic; lacks tool protocol icons (`MCP`, `OpenAPI`, `x402`); no quick-action toolbar.
- **Target Ergonomic Spec:**
  - High-density table presentation with dedicated visual badges: Protocol (`OpenAPI`, `MCP`, `x402`), Availability / Health with status dots (`Operational`, `Degraded`, `Checking`), and Lifecycle (`Published`, `Draft`, `Updating`, `Retired`).
  - Usage / Calls count formatted with Australian locale grouping and `font-mono tabular-nums` (e.g. `1,420 calls`).
  - Quick action toolbar / links per row: `Test Run` (linking to tool operations playground) and `Activity` (linking to logs) with `TACTILE_PRESS_CLASS`.
  - Unified search matcher across name, summary, protocol, offeringRef, slug, lifecycle, and availability labels.
  - Zero-CLS filter empty states: desktop preserves table chrome with `No tools match '{query}'`, compact renders a reserved empty container with a tactile `Reset filter` button.
- **Subagent Assignment:** Grok (Scout: `69a563b8-e5a0-43a7-a551-5a99c76cb36f`) $\rightarrow$ Composer (Craft: `3a75d767-ec62-4033-85f5-65d2a70cfae4`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-35: Intelligent Source Ingestion Scanner (Preflight Wizard)
- **Surfaces:** `src/components/ae/supply/SupplySourceTypeSection.tsx`, `src/components/ae/supply/supply-source-native-start-presentation.ts`, `tests/unit/ui/supply-source-native-start.test.tsx`
- **Incumbent Baseline:** URL input form with protocol validation.
- **Ergonomic Gap:** No pre-parse feedback; user has to submit before seeing whether their OpenAPI or MCP endpoint was recognized.
- **Target Ergonomic Spec:**
  - Real-time preflight URL format validation across OpenAPI, MCP server, and x402 endpoints (`Valid HTTPS endpoint format`, `Insecure HTTP URL detected...`, `Enter a valid HTTPS URL...`).
  - Real-time JSON format and schema preflight validation on `plugin.json` and `mcp.json` file uploads (`Valid JSON payload`, `JSON syntax is invalid`, `JSON is missing required fields`).
  - Gated discovery with Rule 4 diagnostic triplets for insecure HTTP and malformed JSON payloads (`A$0.00 affected — endpoint discovery blocked`).
  - Zero-CLS preflight reserved well (`min-h-[2.5rem]` with `aria-live="polite"`).
  - Tactile press physics (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out`) across source controls, radio cards, and Discover button.
- **Subagent Assignment:** Grok (Scout: `3848f1d8-fb17-4331-be78-b9714c82f559`) $\rightarrow$ Composer (Craft: `2abed63f-d9f2-426e-9152-523ec37617bc`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-36: Postman-Grade Dry-Run Testing Playground
- **Surfaces:** `src/components/ae/supply/AeToolTestPlayground.tsx`, `tests/unit/components/ae-tool-test-playground.test.tsx`
- **Incumbent Baseline:** Form with input arguments textarea and synthetic response preview.
- **Ergonomic Gap:** Arguments must be written by hand; no schema auto-fill; output lacks syntax formatting and execution latency.
- **Target Ergonomic Spec:**
  - Prominent zero-cost guarantee banner (*"Simulation Mode: Zero credit deducted. Sandbox dry-run probes never create Quotes, Charges, or debits."*).
  - 1-click *"Load Example Arguments"* auto-populated from tool's JSON schema with success toast feedback and *"Reset to defaults"* action.
  - Prominent *"Send Test Invocation"* trigger with execution latency badge (`⚡ 142ms` in `font-mono tabular-nums`) and semantic HTTP response status badges (`200 OK`, `502 Bad Gateway`).
  - 1-click *"Copy response"* action with tactile feedback, checkmark icon, and accessible label.
  - Zero-CLS reserved geometry: always-mounted response well (`min-h-[12rem]`) and diagnostic slot (`min-h-[2.5rem]`).
  - Structured Rule 4 diagnostic playbooks for syntax errors, schema mismatches, and probe execution failures (`A$0.00 affected`).
  - Tactile press physics (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out`) across all action buttons.
- **Subagent Assignment:** Grok (Scout: `ae6fb137-3c20-4bc4-a79f-9dd6ff2ae8f1`) $\rightarrow$ Composer (Craft: `98168851-c44c-46d6-b390-846c447e6064`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-37: Transparent Pricing Revision Modal
- **Surfaces:** `src/components/ae/supply/AePriceUpdateModal.tsx`, `tests/unit/components/ae-price-update-modal.test.tsx`
- **Incumbent Baseline:** Modal updating price in cents.
- **Ergonomic Gap:** No price comparison visualization; doesn't clarify what happens to in-flight quotes.
- **Target Ergonomic Spec:**
  - Side-by-side comparison card: *"Current Price: A$0.10 $\rightarrow$ New Price: A$0.15"* with live delta calculation (`+A$0.05`, `No change`) and `font-mono tabular-nums`.
  - Live Australian 1/11th GST itemization (Base price, GST 10%, Total buyer consideration) recalculated live on input.
  - Prominent in-flight quote reassurance callout: *"Existing quotes locked by agents remain valid until their 15-minute expiration. New pricing applies only to subsequent quote requests."*
  - Tactile preset chips: percentage adjustments (`+10%`, `+25%`, `-10%`) and common tiers (`A$0.05`, `A$0.10`, `A$0.25`, `A$0.50`).
  - Structured Rule 4 diagnostic playbooks for invalid/zero prices and publish failures (`A$0.00 affected`).
  - Zero-CLS reserved geometry: comparison & GST slot (`min-h-[8.5rem]`) and diagnostic slot (`min-h-[2.5rem]`).
  - Tactile press physics (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out`) across all buttons and chips.
  - Amount-aware success toast (`toast.success('Pricing revision published', ...)`) on publish completion.
- **Subagent Assignment:** Grok (Scout: `c78492d6-fa79-4ee9-88e3-b18e79caf94b`) $\rightarrow$ Composer (Craft: `75d97239-a8e8-4b46-bdbc-486c987de207`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

# Wave 4: Team Operations, Identity & Tactile Standards

### W-03 to W-09: User Profile, Preferences & Security Hub
- **Surfaces:** `src/components/ae/settings/OwnerNotificationSettings.tsx`, `src/components/ae/settings/OwnerSettingsSections.tsx`, `src/components/ae/settings/AeCompromiseRecoveryChecklist.tsx`, `src/components/ae/settings/AeAccountSecurityHistory.tsx`, `src/components/ae/settings/AeSecurityHistoryTable.tsx`
- **Incumbent Baseline:** Profile view, notification checkboxes, and session list.
- **Target Ergonomic Spec:**
  - Granular notification controls with Emil Kowalski spring toggles (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out`).
  - Tactile threshold preset chips (`A$10.00`, `A$25.00 (Default)`, `A$50.00`) with monospace tabular digits (`font-mono tabular-nums`).
  - Live threshold projection statement in reserved `min-h-[2.5rem]` slot: *"Alert sent when balance drops below A$25.00."*
  - Structured Rule 4 diagnostic playbooks for preference save / query failures (`A$0.00 affected — existing preferences remain active.`) with `toast.error` and amount-aware `toast.success`.
  - Security command center and compromise recovery checklist with explicit financial reassurance (`A$0.00 affected — opening this list does not revoke sessions, Agents, or payouts.`) and structured Rule 4 unavailable/pagination failure playbooks.
  - Zero-CLS reserved geometry: `min-h-96` well for Clerk `<UserProfile />`, `min-h-[2.5rem]` diagnostic slots, and fixed button geometry.
- **Subagent Assignment:** Grok (Scout: `84afecec-be5d-4c5c-bddf-404a6dc09033`) $\rightarrow$ Composer (Craft: `57ff9299-be91-4a09-a0e2-60066fdc7fb6`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-10 to W-14: Command-Grade Workspace Management
- **Surfaces:** `src/components/ae/layout/AeOrganizationSwitcher.tsx`, `src/routes/_operator/owner.workspace.tsx`, `src/components/ae/settings/TaxProfileForm.tsx`, `src/components/ae/settings/TaxProfileFormSection.tsx`, `src/components/ae/settings/WorkspaceDangerZone.tsx`
- **Incumbent Baseline:** Simple workspace switcher and profile forms.
- **Target Ergonomic Spec:**
  - Zero-CLS switcher rail well (`h-8 w-full min-w-0`, collapsed: `size-8 p-0`) with tactile press physics (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out`) across both collapsed and expanded variants, with Clerk create-org theme harmonization.
  - Three-tier `/owner/workspace` composition: (1) Clerk general profile in `min-h-96` well, (2) Billing & tax with live 11-digit ABN formatting (`formatAbnDisplay`), `font-mono tabular-nums`, and (3) Workspace danger zone.
  - Live ABN and billing validation with reserved `min-h-[2.5rem]` Rule 4 diagnostic slots (`A$0.00 affected — tax profile not saved.`) and amount-aware `toast.success`.
  - Command-grade workspace decommission safety: always-mounted `min-h-[28rem]` shell, explicit money badges (`A$0.00 active obligations`), human-readable fence copy, dual confirmation dialogs (close & transfer) disclosing financial peace-of-mind (`A$0.00 moved until confirmed`), and stable idempotency keys.
- **Subagent Assignment:** Grok (Scout: `94baae34-1250-400f-837c-ea6939245f82`) $\rightarrow$ Composer (Craft: `3349a7fd-160b-43fa-b147-149e827d6d6a`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-15 to W-19: Faceted Team Roster & Frictionless Invitations
- **Surfaces:** `src/components/ae/settings/AeTeamDirectoryTable.tsx`, `src/routes/_operator/owner.team.tsx`, `convex/workspaceInvitations.ts`
- **Incumbent Baseline:** Member table and invite form.
- **Target Ergonomic Spec:**
  - Instant client-side search across both display name and email address with zero input layout jump.
  - Tactile role filter pills (**All**, **Owner**, **Admin**, **Member**) with Emil Kowalski press physics (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out`), `aria-pressed`, and live count badges (`font-mono tabular-nums`) from the unfiltered roster.
  - Stable layout geometry: `min-h-[3rem]` filter bar, `min-h-4` status count (`Showing X of Y`), `min-h-[18rem]` table wrapper, and `min-h-[14rem]` filter-empty well with tactile "Reset filters" button.
  - 1-click email copy with tactile physics, 2000ms checkmark transition, and toast confirmation (`toast.success('Copied email to clipboard')`).
  - Zero-CLS loading skeleton (`min-h-[18rem]`, 5 matching headers, 4 skeleton rows, `aria-busy="true"`) replacing dummy rows, and reserved `min-h-96` Clerk `<OrganizationProfile />` well anchored at `#invite`.
- **Subagent Assignment:** Grok (Scout: `730dfd59-52c3-44d8-b972-57b58fec19d2`) $\rightarrow$ Composer (Craft: `48c72f2c-f76f-4b03-a9ec-f407daf9b32d`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-28: Safe Agent Revocation with Graceful Drainage
- **Surfaces:** `src/components/ae/console/AeAgentOperatorConsole.tsx`, `src/components/ae/feedback/AeConfirmDialog.tsx`
- **Incumbent Baseline:** Direct delete button.
- **Target Ergonomic Spec:**
  - Dual revocation choices: (1) **Graceful Drain** (default: new admissions stop immediately, in-flight Calls allowed to finish within 30s) vs (2) **Immediate Freeze** (halts immediately, new Calls refused).
  - Explicit financial peace-of-mind disclosure: *"A$0.00 unreleased holds remain protected — in-flight calls finish or release immediately"* with `font-mono tabular-nums`.
  - Dynamic confirm actions per mode: *"Drain then remove"* vs *"Remove immediately"*, *"Drain then revoke"* vs *"Revoke immediately"*, *"Drain then disconnect"* vs *"Disconnect immediately"*.
  - Full Emil Kowalski tactile physics (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out`) across mode cards, confirm buttons, cancel actions, and operator triggers.
  - Success toasts (`toast.success('Agent access revoked')`) and structured in-dialog Rule 4 diagnostic playbooks on failure with `toast.error` and financial safety reassurance (`A$0.00 affected — agent remains active`).
  - Zero-CLS geometry: reserved dialog description (`min-h-[4.5rem]`), mode card well (`min-h-[7.5rem]`), financial well (`min-h-[2.75rem]`), and diagnostic slot (`min-h-[4.5rem]`).
- **Subagent Assignment:** Grok (Scout: `32af3dfb-61c6-4400-a613-b98481934e4c`) $\rightarrow$ Composer (Craft: `cc2bf291-4073-469e-b053-4bf9ed3b46c0`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`

---

### W-41 to W-44: Design Engineering, Layout Stability & Tactile Physics
- **Surfaces:** `src/components/ae/call-receipt/CallReceiptSkeleton.tsx`, `src/components/ae/feedback/AeEmptyState.tsx`, `src/components/ae/feedback/AeTableEmptyState.tsx`, `src/components/ae/layout/ThemeToggle.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/lib/theme/theme-mode.ts`
- **Incumbent Baseline:** Basic pulse divs, plain empty states, and standard theme toggle.
- **Target Ergonomic Spec:**
  - **Zero-CLS Skeletons (W-41):** `CallReceiptSkeleton` perfectly matches the loaded `CallStatusFoundView` shell with five uncarded/carded regions: summary (fact rows + mono buyer amount), playbook (`p-4`, 4 labeled rows, reserved financial well), money Before/After stacks, recovery strip (`pt-section`, `min-h-[4.5rem]`), and technical record summary bar (`min-h-touch`).
  - **Inspiring Zero-State Accelerators (W-42):** `AeEmptyState` and `AeTableEmptyState` export standard `TACTILE` token, fixed `size-16` decorative illustration well, always-reserved `min-h-touch` action well, optional tactile 1-click recipe accelerator chips (`recipes`), optional financial reassurance slot (`A$0.00 charged — nothing to reconcile yet.`), and action feedback toast hook.
  - **Flicker-Free Theme Toggle (W-43):** Early HTML boot script registers `document.documentElement.dataset.appearancePreference` before paint so `ThemeToggle` matches stored/system preference on the very first client hydration frame without icon flashes. Trigger sized to `size-8 shrink-0` with dynamic accessible label (`Appearance: Light/Dark/System`).
  - **Emil Kowalski Tactile Physics (W-44):** Full tactile physics (`enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100`) across theme trigger, radio items, and empty-state action/recipe buttons; Radix origin mapping `origin-(--radix-dropdown-menu-content-transform-origin)` on dropdown contents.
- **Subagent Assignment:** Grok (Scout: `844e0437-0f85-4ace-9ea1-1d04d561db64`) $\rightarrow$ Composer (Craft: `63632db1-3ffa-4f03-a7d9-c8cb43f2bd5e`) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
