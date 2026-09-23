# User & Organization Application Maturity: Execution Protocol & Operating Manual

**Date:** 17 September 2026  
**Status:** Approved Master Protocol & Execution Reference  
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/operations/user-and-org-maturity-register.md`, `docs/designs/2026-09-17-user-org-maturity-iceinvein.md`

---

## 1. Executive Purpose & Anti-Compaction Memory Anchor

This document is the **immutable operating manual** for executing the 44 standard application workflows (`W-01` through `W-44`) to complete **Source Maturity**. 

When context windows compact or subagents are dispatched, **always read this file first** to restore exact operational alignment.

### The Canonical North Star
> **"An invited Australian business can give its Agent bounded access to useful paid Tools, and can understand and recover every resulting purchase."**

### Inviolable Product Boundaries
Never collapse these distinct concepts in code, tests, or models:
- **Funding is not Authority:** Prepaid balance does not equal authorization to execute.
- **Authority is not a Purchase:** Spending allowances do not constitute an executed Call.
- **Buyer Consideration is not Provider Obligation:** Customer AUD charged $\neq$ USDC owed to provider.
- **Settlement is not Delivery:** On-chain payment confirmation does not prove the Tool succeeded.
- **Delivery is not Purchase Resolution:** Receiving output is not commercial closure until adjustments reconcile.
- **Roles:** Agentic Economy is the fixed buyer-facing **Seller**; the Tool runner is the **Provider**; the payout address is the **Payment Recipient**.
- **No Jargon:** Never introduce acronyms like "AM", milestone tags, or speculative terminology into production code, schemas, routes, or commit messages.

---

## 2. The Zero-Handroll Engineering Directive

Every workflow must adhere to the 4-tier delegation strategy:

1. **Tier 1: Hosted Vendor Surfaces (Zero Custom Code)**
   - Use Clerk prebuilt widgets: `<SignIn />`, `<SignUp />`, `<UserProfile />`, `<OrganizationProfile />`, `<OrganizationSwitcher />`.
   - Use Stripe hosted surfaces: Stripe Checkout (`stripe.checkout.sessions.create`), Stripe Customer Portal (`stripe.billingPortal.sessions.create`), Stripe Connect Express Dashboard (`stripe.accounts.createLoginLink`).
   - *Rule:* Never write bespoke password inputs, session stores, card inputs, or payout statement engines.
2. **Tier 2: Prebuilt Components & Primitives**
   - Headless primitives: Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-switch`, `@radix-ui/react-popover`).
   - UI utilities: `@tanstack/react-table` for tabular data, `sonner` for mutation feedback toasts, `shiki` for syntax highlighting, `@scalar/openapi-parser` for browser-side schema parsing, `@rjsf/shadcn` for JSON Schema forms.
   - *Rule:* Never handroll table sorting algorithms, bespoke modal focus traps, or custom syntax highlighters.
3. **Tier 3: Open-Source (OSS) Architectural Blueprints**
   - Study and mirror patterns from Dub.co, Sonny Sangha's Linear Clone, Resend, and Stripe Connect Samples before writing architecture.
4. **Tier 4: Proprietary Core Code (AE-Owned)**
   - Write custom code *exclusively* for AE domain logic: multi-tenant authority resolution in Convex, Formance double-entry ledger integration, tool quote/call admission, and purchase resolution.

---

## 3. The 5-Step Subagent Protocol

Every task or wave cluster must traverse these 5 phases sequentially with no skipping or jumping:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   THE 5-STEP EXECUTION PROTOCOL                        │
├────────────────────────────────────────────────────────────────────────┤
│  Step 1: Read Vendor Docs & Analyze OSS References (Grok Subagent)     │
│    └─ Read official docs (Clerk, Stripe, Radix, Scalar, etc.)          │
│    └─ Study production OSS codebases (Dub.co, Linear clone, Resend)    │
│    └─ Output: Architecture brief + "What NOT to handroll" checklist    │
├────────────────────────────────────────────────────────────────────────┤
│  Step 2: Internal Seam Characterization (Grok Subagent)                │
│    └─ Map Convex schema, authority handlers, existing components       │
│    └─ Define IceInVein Contract: Needs, Offers, Touches, Invariants    │
├────────────────────────────────────────────────────────────────────────┤
│  Step 3: Red Test First (Composer Subagent)                            │
│    └─ Write failing unit/integration tests establishing the contract   │
│    └─ Verify tests fail for expected reason (Red baseline)             │
├────────────────────────────────────────────────────────────────────────┤
│  Step 4: Bounded Zero-Handroll Implementation (Composer Subagent)      │
│    └─ Implement minimal clean code satisfying the contract             │
│    └─ Delegate to hosted surfaces or prebuilt primitives               │
│    └─ Turn tests green (Green baseline)                                │
├────────────────────────────────────────────────────────────────────────┤
│  Step 5: IceInVein Cold Review & Verification Gate (Orchestrator)       │
│    └─ Run vitest, typecheck, lint, and dependency cycle checks         │
│    └─ Verify zero jargon leaks and invariant satisfaction              │
│    └─ Mark VERIFIED in docs/operations/user-and-org-maturity-register  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Subagent Division of Labor & Roles

### Grok Subagent (`cursor-grok-4.6-high-fast`)
- **Role:** Scout, Researcher, and Seam Characterizer.
- **Responsibilities:**
  - Performs web and repository research on vendor documentation and OSS implementations.
  - Inspects internal codebase seams, database tables, and existing handlers.
  - Drafts exact IceInVein specifications (Needs, Offers, Touches, Invariants).
  - *Constraint:* Does not write production or test code.

### Composer Subagent (`composer-2.5`)
- **Role:** Bounded Implementer.
- **Responsibilities:**
  - Implements Vitest test suites (red tests first).
  - Implements Convex schema updates, mutations, queries, and React components strictly bounded by the Grok specification.
  - Eliminates code duplication, enforces imports at top of file, and ensures switch exhaustiveness.
  - *Constraint:* Never changes architecture or adds unapproved dependencies.

### Parent Agent (Orchestrator)
- **Role:** Judgment, Reasoning, Quality Control, and Gate Enforcement.
- **Responsibilities:**
  - Directs subagents with clear, single-purpose briefs.
  - Verifies red test failures and green test completions via terminal commands.
  - Runs code quality reviews, lints, typechecks, and dependency ratchet validations.
  - Updates the operational register (`docs/operations/user-and-org-maturity-register.md`).

---

## 5. Curated OSS Reference Library

When launching Step 1 for any workflow, consult these specific repositories and files:

### A. Multi-Tenancy & Workspace Switching (Modules 1 & 3)
- **Sonny Sangha Linear Clone (Clerk + Convex Multi-Tenancy):**
  - *Repository:* `https://github.com/sonnysangha/linear-clone-clerk-nextjs-16`
  - *Pattern:* Consuming `identity.org_id` in Convex functions to resolve active tenant without cookies or bespoke state.
- **Dub.co Workspace Architecture:**
  - *Repository:* `https://github.com/dubinc/dub`
  - *Files:* `apps/web/ui/modals/create-workspace-modal.tsx`, `apps/web/lib/middleware/workspace.ts`
  - *Pattern:* Debounced live slug availability, organization domain provisioning, workspace deletion checks.

### B. Team Management & Cryptographic Invitations (Module 4)
- **James Ross Jr. B2B SaaS Architecture:**
  - *Reference:* `https://www.jamesrossjr.com/blog/saas-user-management`
  - *Pattern:* The 3-way invitation fork (existing user vs logged-in other email vs new user) and atomic membership joins.
- **Clerk Organizations Reference:**
  - *Documentation:* `https://clerk.com/docs/components/organization/organization-profile`
  - *Pattern:* Turnkey invitation dispatch, pending invitation revocation, role changing.

### C. Buyer Billing & Provider Payouts (Modules 5 & 7)
- **Stripe Connect Marketplace Sample:**
  - *Repository:* `https://github.com/stripe-samples/connect-onboarding-for-marketplaces`
  - *Pattern:* Hosted onboarding link generation, refresh/return URL handling, webhook synchronization.
- **OpenAI Automatic Recharge Blueprint:**
  - *Reference:* `https://platform.openai.com/docs/guides/production-best-practices#billing-and-budgets`
  - *Pattern:* Low balance threshold monitoring, off-session SetupIntents, daily charge limits.
- **Locus Marketplace Case Study:**
  - *Reference:* `https://bitrupt.co/blog/stripe-connect-marketplace`
  - *Pattern:* Segregating prepaid customer credit from provider payouts, Express Dashboard SSO links.

### D. API Key Generation & Management (Module 6)
- **Dub.co Scoped API Token Generator:**
  - *Repository:* `https://github.com/dubinc/dub`
  - *Files:* `apps/web/ui/tokens/token-card.tsx`, `apps/web/ui/modals/create-token-modal.tsx`
  - *Pattern:* `crypto.randomBytes(24)` token generation, `sha256` hashing, reveal-once modal with confirmation checkbox.
- **Svix Developer Dashboard:**
  - *Reference:* `https://docs.svix.com/quickstart`
  - *Pattern:* Client snippet generation (Cursor MCP, Claude Code, Python, cURL).

### E. Tool Catalog & In-App Playground (Module 8)
- **RazeGrowth API Playground Design Guide:**
  - *Reference:* `https://razegrowth.com/blog/api-playground-design-converts`
  - *Pattern:* Zero-cost developer playground, JSON Schema form generation, live response inspection.
- **Scalar OpenAPI Client:**
  - *Repository:* `https://github.com/scalar/scalar`
  - *Pattern:* Client-side OpenAPI parsing and preflight endpoint probing.

---

## 6. The 6 Strategic Implementation Waves

Work proceeds strictly bottom-up by fact dependency:

```text
WAVE 1: TENANCY & AUTHORITY SPINE (P0 BLOCKER)
  ├── W-10: Multi-Tenant Authority Resolver & interactiveSessionSelections
  ├── W-11: Workspace Creation Mutation & Modal
  ├── W-12: Workspace Profile, Slug & Settings
  └── W-02: Post-Registration Onboarding (Role Intent + Workspace Name)

WAVE 2: TEAM COLLABORATION & HIERARCHICAL RBAC (P0 BLOCKER)
  ├── W-15: Team Member Directory & Roles Projection
  ├── W-16: Cryptographic Email Invitations (7-day tokenDigest)
  ├── W-17: Forked Invitation Acceptance Route & Atomic Join
  ├── W-18: Hierarchical Role Management Fences
  └── W-19: Member Removal & Session Access Invalidation

WAVE 3: SUPPLIER ONBOARDING & ECONOMIC SETTLEMENT (P0 BLOCKER)
  ├── W-30: Supplier Activation Wizard ("Start Selling" flow)
  ├── W-31: Stripe Connect Hosted Link & Return URL Poller
  ├── W-32: Earnings Dashboard & Express SSO Link
  ├── W-33: Payout Threshold & Schedule Preferences
  └── W-36: In-App Interactive Test Playground

WAVE 4: BUYER BILLING, BUDGETS & COMPLIANCE (P1)
  ├── W-13: Customer Tax Facts (ABN Checksum) Form & Management
  ├── W-23: Organization Monthly Spend Ceiling (Fail-Closed Gate)
  ├── W-21: Auto-Recharge Engine (SetupIntent Off-Session)
  ├── W-22: Saved Cards Customer Portal Bridge
  └── W-24: Australian Tax Invoice Download Unblock & Receipt Links

WAVE 5: AGENT ACCESS & DEVELOPER UX (P1)
  ├── W-25: Connected Agent Spend Utilization Progress
  ├── W-26: Interactive Agent Provisioning Wizard
  ├── W-27: One-Time Key Reveal Modal with Cursor/Claude Snippets
  ├── W-28: In-Place Limit Editing & Agent Pause Toggle
  └── W-29: Filtered Call History per Agent

WAVE 6: OBSERVABILITY, UX STANDARDS & SECURITY POLISH (P1/P2)
  ├── W-01: Sign-In Identity Resolution Hardening
  ├── W-03: Password Reset Webhook Credential Revocation
  ├── W-04: Step-Up Verification for Sensitive Mutations
  ├── W-05: Session Revocation Cascade to Machine Tokens
  ├── W-06: Profile Name/Email/Avatar Webhook Sync
  ├── W-07: Email Notification Preferences & Dispatcher
  ├── W-08: Theme Switcher & FOUT Elimination
  ├── W-09: GDPR Account Deletion & Anonymization
  ├── W-14: Workspace Deletion & Balance Verification
  ├── W-34: Tool Inventory Table with Full Metrics
  ├── W-35: Add Tool Wizard In-Line Preflight Connectivity
  ├── W-37: Tool Revision Management & Graceful Withdrawal
  ├── W-38: Multi-Dimensional Activity Filters & Date Range Pickers
  ├── W-39: Actionable Call Receipt Diagnostic Playbooks
  ├── W-40: RFC 4180 CSV Export Engine
  └── W-41 to W-44: Standardized Empty States, Pulse Skeletons, Sonner Toasts, Confirm Dialogs
```

---

## 7. Verification & Release Gates

Before claiming completion of any wave or task:
1. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck`
2. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run deps:check`
3. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run lint`
4. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/<relevant-suite>.test.ts`
5. Verify `docs/operations/user-and-org-maturity-register.md` is updated with exact status and evidence.
