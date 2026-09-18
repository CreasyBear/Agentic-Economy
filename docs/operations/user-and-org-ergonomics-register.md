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
| **Wave 1: Buyer Onboarding & Developer Launchpad** | 6 | `W-01`, `W-02`, `W-25`, `W-26`, `W-27`, `W-29` | 3 | 0 | 3 | `IN PROGRESS` |
| **Wave 2: Financial Peace-of-Mind & Spend Observability** | 8 | `W-20`, `W-21`, `W-22`, `W-23`, `W-24`, `W-38`, `W-39`, `W-40` | 0 | 0 | 8 | `PENDING` |
| **Wave 3: Supplier Monetization & Testing Playground** | 8 | `W-30`, `W-31`, `W-32`, `W-33`, `W-34`, `W-35`, `W-36`, `W-37` | 0 | 0 | 8 | `PENDING` |
| **Wave 4: Team Operations, Identity & Tactile Standards** | 22 | `W-03`–`W-09`, `W-10`–`W-19`, `W-28`, `W-41`–`W-44` | 0 | 0 | 22 | `PENDING` |
| **Total** | **44** | **All 44 Standard Workflows** | **3** | **0** | **41** | `IN PROGRESS` |

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
  - Monospace currency formatting with tabular numbers (`tabular-nums font-mono`).
  - Visual quota bar: "Daily Allowance: A$10.00 • Today's Burn: A$2.40 (24%)".
  - Quick-preset chips (`A$10/day`, `A$50/day`, `A$250/day`, `Custom`).
  - Actionable toast upon update: *"Spending limit updated to A$50.00/day. [Undo]"*.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-27: One-Time API Key Reveal Modal
- **Surfaces:** `src/components/ae/console/AeKeyRevealDialog.tsx`
- **Incumbent Baseline:** Dialog displaying generated secret key string with copy button.
- **Ergonomic Gap:** Secret is exposed in plain text by default; copy button gives basic feedback; dismissal warning is small text.
- **Target Ergonomic Spec:**
  - Monospace secret display with masked toggle (`••••••••••••••••` / `Reveal`).
  - Prominent 1-click copy button with dynamic badge: *"Copied to clipboard — paste into ~/.cursor/mcp.json"*.
  - Explicit security guardrail banner: *"This secret will never be shown again. Store it securely."*
  - Requires explicit checkbox confirmation (*"I have safely stored this secret"*) before modal can be dismissed.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-29: Contextual Quickstart Snippets
- **Surfaces:** `src/modules/agent-access/config-snippets.ts`, `src/components/ae/console/AeKeyRevealDialog.tsx`
- **Incumbent Baseline:** Static code string templates in helper functions.
- **Ergonomic Gap:** Not integrated with syntax highlighting; no 1-click `.env` or `mcp.json` file download option.
- **Target Ergonomic Spec:**
  - Syntax-highlighted code blocks with theme-aware styling.
  - 1-click *"Download .env"* or *"Download mcp.json"* button for immediate project drops.
  - Inline "Verify Connection" status radar that detects when the first Call is received with the new key.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

# Wave 2: Financial Peace-of-Mind & Spend Observability

### W-20: Prepaid Credit Top-Up Console
- **Surfaces:** `src/routes/_operator/owner.credit.tsx`, `src/components/ae/console/AeOwnerCredit.tsx`
- **Incumbent Baseline:** Basic input field with Stripe checkout redirection.
- **Ergonomic Gap:** User must manually calculate GST or guess common refill amounts; no instant post-payment balance verification.
- **Target Ergonomic Spec:**
  - Preset denomination chips (`+A$50`, `+A$100`, `+A$250`, `Custom`) with keyboard navigation.
  - Live calculated Australian GST summary (`A$10.00 GST included`).
  - Instant balance refresh and celebratory confirmation upon return from checkout.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-21: Auto-Recharge Predictive Timeline
- **Surfaces:** `src/components/ae/console/AeAutoRechargeCard.tsx`, `convex/moneyAutoRecharge.ts`
- **Incumbent Baseline:** Toggle switch with threshold and recharge amount inputs.
- **Ergonomic Gap:** Unclear trigger logic; operator cannot see when auto-recharge last triggered or whether it succeeded.
- **Target Ergonomic Spec:**
  - Visual linked slider: Trigger threshold $\rightarrow$ Top-up amount.
  - Plain-English trigger statement: *"When balance dips below A$20.00, automatically add A$50.00 from your primary card"*.
  - Mini audit timeline showing the last 3 automated recharge events with timestamps and receipts.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-22: Saved Payment Methods Vault
- **Surfaces:** `src/components/ae/console/AeSavedPaymentMethodsCard.tsx`, `src/lib/server/stripe-customer-portal.ts`
- **Incumbent Baseline:** External Stripe portal redirect button.
- **Ergonomic Gap:** User cannot see their current default card brand, last 4 digits, or expiry date without leaving the application.
- **Target Ergonomic Spec:**
  - In-app card summary display: Card brand icon (Visa/Mastercard/Amex), `•••• 4242`, Expiry date.
  - Expiry warning chip if the card expires within 30 days (`Expires next month`).
  - 1-click *"Update Payment Method"* jumping directly into Stripe billing portal.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-23: Organization Monthly Spend Velocity Gauge
- **Surfaces:** `src/components/ae/console/AeMonthlySpendCeilingCard.tsx`, `convex/moneyMonthlySpendBudget.ts`
- **Incumbent Baseline:** Basic text input and save button.
- **Ergonomic Gap:** Static number gives zero context on whether the workspace is about to hit its ceiling.
- **Target Ergonomic Spec:**
  - Real-time spend progress bar: Current month spend vs Monthly cap.
  - Dynamic color gradient: Green ($\le 70\%$) $\rightarrow$ Amber ($\le 90\%$) $\rightarrow$ Crimson ($> 90\%$).
  - Predictive burn forecast: *"At current pace, projected month-end spend is A$184.20 (within A$200.00 cap)"*.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-24: ATO-Compliant Tax Invoices & Billing History
- **Surfaces:** `src/components/ae/console/AeInvoiceHistoryTable.tsx`, `src/components/ae/settings/TaxProfileForm.tsx`
- **Incumbent Baseline:** Table listing invoices with external links.
- **Ergonomic Gap:** Invoices cannot be searched by number; tax facts cannot be updated inline; no batch download for accounting.
- **Target Ergonomic Spec:**
  - Table search by invoice number and date range.
  - 1-click direct PDF download with itemized GST, ABN, and seller details.
  - 1-click *"Download All Invoices for Financial Year (ZIP)"* for accountant handoff.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-38: High-Density Activity Feed with Faceted Search
- **Surfaces:** `src/routes/_operator/activity.tsx`, `src/components/ae/console/AeAgentCallHistoryTable.tsx`
- **Incumbent Baseline:** Table of Calls with basic agent filter.
- **Ergonomic Gap:** Lacks multi-criteria filtering; execution latency and cost breakdown are not scannable; no date range picker.
- **Target Ergonomic Spec:**
  - Faceted filter bar: Filter by Agent, by Tool, by Outcome (`Delivered`, `Refunded`, `Failed`), and Date Range.
  - Monospace latency telemetry badge (`⚡ 240ms`) and exact cost (`A$0.10`).
  - Clickable row opens instant slide-over Call Receipt.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-39: Interactive Purchase Certificate & Call Receipt
- **Surfaces:** `src/routes/_operator/calls.$callRef.tsx`, `src/modules/capability-execution/call-receipt-view.ts`
- **Incumbent Baseline:** Accordion modal showing receipt stages.
- **Ergonomic Gap:** Text-heavy stages; raw machine error codes on failure; lacks clear commercial resolution summary.
- **Target Ergonomic Spec:**
  - Visual progress stepper: `Authorized` $\rightarrow$ `Reserved` $\rightarrow$ `Executed` $\rightarrow$ `Settled`.
  - Itemized commercial receipt: Tool Price, Platform Seller Consideration, Australian GST, Final Settlement.
  - Plain-English diagnostic playbook for failed calls with recommended next actions (e.g., *"Provider rate-limited; zero credit deducted. Retry in 12s"*).
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-40: RFC 4180 CSV Export Hub
- **Surfaces:** `src/lib/export/csv-export.ts`, `src/routes/_operator/activity.tsx`
- **Incumbent Baseline:** Button triggering browser download of CSV string.
- **Ergonomic Gap:** No export options; cannot filter export by date or outcome; lacks visual feedback during file generation.
- **Target Ergonomic Spec:**
  - Export modal offering date range filtering and column customization.
  - Instant client-side streaming generation with UTF-8 BOM encoding for Excel compatibility.
  - Actionable toast notification upon download: *"Export complete: 142 calls saved to CSV. [Open]"*.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

# Wave 3: Supplier Monetization & Testing Playground

### W-30: Supplier Activation & Guided Onboarding
- **Surfaces:** `src/components/ae/supply/AeSupplierOnboardingWizard.tsx`, `src/components/ae/offerings/AeProviderWorkspace.tsx`
- **Incumbent Baseline:** 3-step profile form and Connect redirect.
- **Ergonomic Gap:** Stepper looks like static text; estimated completion times not provided; provider lacks clarity on KYC requirements.
- **Target Ergonomic Spec:**
  - Visual interactive progress stepper: `1. Provider Identity` $\rightarrow$ `2. Payout Account (Stripe)` $\rightarrow$ `3. First Tool Publication`.
  - Estimated time chips (`~2 mins`) and reassurance copy regarding Australian banking compliance.
  - Smooth animation between wizard steps without scroll jumping.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-31: Stripe Express Dashboard SSO Portal
- **Surfaces:** `src/routes/_operator/owner.payouts.sso.ts`, `src/components/ae/supply/AeSupplyEarningsCard.tsx`
- **Incumbent Baseline:** Link generating Stripe Express SSO login URL.
- **Ergonomic Gap:** User doesn't know what they will find in the Express dashboard; lacks fallback if account is in pending verification.
- **Target Ergonomic Spec:**
  - Dedicated card displaying *"Stripe Express Account Active"* with bank account last 4 digits.
  - 1-click *"View Bank Payouts on Stripe"* opening in a secure popup with focus return handler.
  - Clear explanation: *"Manage bank account details, view payout transfer receipts, and download annual tax statements"*.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-32: Predictable Payout Policy & Frequency Preferences
- **Surfaces:** `src/components/ae/supply/AePayoutPolicyForm.tsx`, `convex/moneyPayoutPolicy.ts`
- **Incumbent Baseline:** Radio buttons for payout frequency.
- **Ergonomic Gap:** Supplier cannot see when their next payout will actually land or what balance has accumulated.
- **Target Ergonomic Spec:**
  - Tactile frequency selector: `Weekly on Monday`, `Monthly on the 1st`, or `Balance Threshold (Min A$10.00)`.
  - Real-time countdown calculation: *"Next payout scheduled for Monday 10:00 AM AEST (Estimated: A$142.50)"*.
  - Inline validation preventing thresholds below A$10.00.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-33: Connect Return Poller & Health Monitor
- **Surfaces:** `src/components/ae/supply/AeConnectReturnPoller.tsx`
- **Incumbent Baseline:** Alert banner polling readiness on return.
- **Ergonomic Gap:** Static polling text; if verification fails or requires additional documents, the user is left guessing.
- **Target Ergonomic Spec:**
  - Animated radar pulse indicator: *"Verifying your payout setup with Stripe..."*.
  - Transitions into green checkmark card upon success: *"Payouts enabled. Your tools are now ready to monetize."*
  - If additional KYC is required: displays exact missing requirement (e.g. *"Stripe requires photo ID verification"*) with 1-click resume button.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-34: Tool Performance & Catalog Inventory Table
- **Surfaces:** `src/components/ae/offerings/AeOwnerOfferings.tsx`, `src/components/ae/offerings/provider-workspace-projection.ts`
- **Incumbent Baseline:** Table showing tool name, status, price, and call count.
- **Ergonomic Gap:** Column sorting is basic; lacks tool protocol icons (`MCP`, `OpenAPI`, `x402`); no quick-action toolbar.
- **Target Ergonomic Spec:**
  - High-density table with protocol badges, health status indicators (`Operational` / `Degraded`), and 30-day earnings.
  - Quick action buttons on hover: `Test Run`, `Edit Price`, `View Logs`.
  - Instant client-side search by tool name or operation ID.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-35: Intelligent Source Ingestion Scanner (Preflight Wizard)
- **Surfaces:** `src/components/ae/supply/supply-source-native-start-presentation.ts`, `src/components/ae/supply/AeProviderToolDetail.tsx`
- **Incumbent Baseline:** URL input form with protocol validation.
- **Ergonomic Gap:** No pre-parse feedback; user has to submit before seeing whether their OpenAPI or MCP endpoint was recognized.
- **Target Ergonomic Spec:**
  - Debounced live URL inspection: As user types, fetches and validates the schema in the background.
  - Displays instant preview chip: *"Valid MCP server detected: 4 tools discovered"*.
  - Inline error warnings for HTTP URLs or malformed JSON payloads before submission.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-36: Postman-Grade Dry-Run Testing Playground
- **Surfaces:** `src/components/ae/supply/AeToolTestPlayground.tsx`
- **Incumbent Baseline:** Form with input arguments textarea and synthetic response preview.
- **Ergonomic Gap:** Arguments must be written by hand; no schema auto-fill; output lacks syntax formatting and execution latency.
- **Target Ergonomic Spec:**
  - 1-click *"Load Example Arguments"* auto-populated directly from the tool's JSON Schema.
  - Prominent *"Send Test Invocation"* button with execution timer (`⚡ 142ms`) and HTTP response code.
  - Formatted JSON response pane with 1-click copy button.
  - Clear zero-cost guarantee banner: *"Simulation Mode: Zero credit deducted"*.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-37: Transparent Pricing Revision Modal
- **Surfaces:** `src/components/ae/supply/AePriceUpdateModal.tsx`
- **Incumbent Baseline:** Modal updating price in cents.
- **Ergonomic Gap:** No price comparison visualization; doesn't clarify what happens to in-flight quotes.
- **Target Ergonomic Spec:**
  - Side-by-side comparison: *"Current Price: A$0.10 $\rightarrow$ New Price: A$0.15"*.
  - Australian GST itemization recalculated live.
  - Reassurance callout: *"Existing quotes locked by agents remain valid until their 15-minute expiration"*.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

# Wave 4: Team Operations, Identity & Tactile Standards

### W-03 to W-09: User Profile, Preferences & Security Hub
- **Surfaces:** `src/components/ae/settings/OwnerNotificationSettings.tsx`, `convex/personalAccount.ts`, `convex/notifications.ts`
- **Incumbent Baseline:** Profile view, notification checkboxes, and session list.
- **Target Ergonomic Spec:**
  - Granular notification controls with Emil Kowalski spring toggles.
  - Security command center with device icons, IP geolocation badges, and 1-click *"Revoke Other Sessions"*.
  - Respectful 1-click GDPR/Personal Data ZIP export and safe account retirement preflight.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-10 to W-14: Command-Grade Workspace Management
- **Surfaces:** `src/components/ae/layout/AeOrganizationSwitcher.tsx`, `src/routes/_operator/owner.workspace.tsx`, `src/components/ae/settings/WorkspaceDangerZone.tsx`
- **Incumbent Baseline:** Simple workspace switcher and profile forms.
- **Target Ergonomic Spec:**
  - Command-grade `Cmd+K` workspace switcher with avatar icons, role badges, and billing health pills.
  - Frictionless workspace provisioning in $<300\text{ms}$ with auto-generated slug.
  - Safe workspace decommission preflight checking outstanding calls and offering 1-click balance refund.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-15 to W-19: Faceted Team Roster & Frictionless Invitations
- **Surfaces:** `src/components/ae/settings/AeTeamDirectoryTable.tsx`, `src/routes/_operator/owner.team.tsx`, `convex/workspaceInvitations.ts`
- **Incumbent Baseline:** Member table and invite form.
- **Target Ergonomic Spec:**
  - Instant client-side search by name/email with role filter pills.
  - 1-click **"Copy Direct Invite Link"** button alongside email dispatch for instant Slack sharing.
  - Tactile role editor popover preventing accidental owner lockouts.
  - Warm team welcome portal with workspace branding and 1-click join button.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-28: Safe Agent Revocation with Graceful Drainage
- **Surfaces:** `src/components/ae/console/AeAgentOperatorConsole.tsx`, `convex/agentSpendingPolicy.ts`
- **Incumbent Baseline:** Direct delete button.
- **Target Ergonomic Spec:**
  - Dual revocation choices: (1) **Immediate Freeze** (halts immediately) vs (2) **Graceful Drain** (allows in-flight calls to finish within 30s).
  - Explicit confirmation modal explaining impact on autonomous workflows.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`

---

### W-41 to W-44: Design Engineering, Layout Stability & Tactile Physics
- **Surfaces:** `src/components/ae/call-receipt/CallReceiptSkeleton.tsx`, `src/components/ae/feedback/AeTableEmptyState.tsx`, `src/components/ae/layout/ThemeToggle.tsx`, `src/styles/globals.css`
- **Incumbent Baseline:** Basic pulse divs, plain empty states, and standard theme toggle.
- **Target Ergonomic Spec:**
  - **Zero-CLS Skeletons (W-41):** Custom SVG/CSS skeletons designed to exact pixel dimensions, column counts, and padding of the final rendered cards. Zero layout shift.
  - **Inspiring Zero-State Accelerators (W-42):** Action-oriented cards with illustrations and 1-click recipe templates.
  - **Flicker-Free Theme Toggle (W-43):** Smooth spring toggle between `System`, `Light`, and `Dark` with zero flash of unstyled content.
  - **Emil Kowalski Tactile Physics (W-44):** Button `:active:scale-[0.98]` compression, Radix transform-origin popover origins, and monospace tabular currency digits.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `PENDING`
