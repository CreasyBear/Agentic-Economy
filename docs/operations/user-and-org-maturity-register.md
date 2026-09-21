# User, Organization & Standard Application Maturity Register

**Status:** ACTIVE AUDIT & IMPLEMENTATION REGISTER  
**Date:** 17 September 2026  
**Scope:** Standard SaaS & Marketplace Application Workflows (Login, User Profile, Workspace/Org Management, Team & Members, Billing, API Keys, Supplier Payouts, Tools, Activity, UX Standards)  
**Frame of Reference:** WorkOS Enterprise Readiness, James Ross B2B SaaS Standards, Stripe Connect Marketplace Checklist, Stripe Developer Portal UX, Whop & Locus.

---

## 1. External Benchmarks & Authoritative Checklists

To ensure Agentic Economy adheres to industry-standard application behaviors rather than bespoke or over-engineered patterns, this register incorporates four authoritative external benchmarks:

### Benchmark A: WorkOS Enterprise Readiness Checklist (2026 Edition)
*(Reference: [WorkOS Enterprise Readiness Guide](https://workos.com/guide/enterprise-readiness-checklist))*
- **Multi-Tenant Organizations**: Explicit business entity container separate from individual human identities. Domain verification for auto-join.
- **Hierarchical RBAC**: Strict separation of Owner, Admin, Member, and Viewer permissions enforced on memberships, not user records.
- **Self-Service Admin Portal**: Customer IT leads can manage their team, invitations, and security settings without vendor intervention.
- **Audit Logging**: Comprehensive, append-only activity streams with actor attribution, timestamps, and exportability.
- **Agent & MCP Authentication**: Explicit machine identity distinct from human session cookies, with scoped permissions and verifiable secrets.

### Benchmark B: James Ross Jr. B2B SaaS Architecture & User Management
*(Reference: [SaaS User Management: Roles, Teams & Permissions](https://www.jamesrossjr.com/blog/saas-user-management))*
- **The Core Multi-Tenant Model**:
  ```text
  users                 -- Individuals who log in (Clerk authentication)
  organizations         -- The business entity that owns data and billing
  organization_members  -- Many-to-many: Users belong to organizations with roles
  invitations           -- Pending tokens to join an organization (7-day TTL)
  ```
- **Invitation Flow Fork**: When recipient clicks invite link:
  - If existing account: add directly to organization with assigned role.
  - If new user: guide through sign-up with prefilled email, then auto-join.
- **Role Scoping**: Roles live on the *membership*, not the user (a user can be Owner in Org A and Viewer in Org B).

### Benchmark C: Stripe Connect Marketplace Onboarding & Payouts Checklist
*(Reference: [Stripe Connect Hosted Onboarding](https://docs.stripe.com/connect/hosted-onboarding) & [Marketplace Guide](https://bitrupt.co/blog/stripe-connect-marketplace))*
- **Express Connected Accounts**: Fast onboarding with Stripe-managed KYC, identity, and bank account collection.
- **Single-Use Account Links**: Server creates `POST /v1/account_links` with `type: account_onboarding`, passing `refresh_url` and `return_url`.
- **Return URL is Navigation, Not Completion**: The app must query `/v1/accounts/:id` or listen for `account.updated` to confirm `details_submitted: true` and `payouts_enabled: true`.
- **Stripe Express Dashboard SSO**: One-click login link via `stripe.accounts.createLoginLink` so suppliers view bank payouts directly on Stripe.

### Benchmark D: Developer Portal & API Key UX Checklist
*(Reference: [Stripe API Keys Best Practices](https://docs.stripe.com/keys) & [API Playground Design](https://razegrowth.com/blog/api-playground-design-converts))*
- **Immediate Monospace Key Display**: Show generated keys in monospace font with a prominent one-click "Copy" button.
- **One-Time Reveal Pattern**: Live secret keys are displayed once in a modal; never accessible again after dismissal.
- **Contextual Quickstart Snippets**: Display key embedded inside copyable code tabs: cURL, Python SDK, Cursor (`mcp.json`), and Claude Code CLI.
- **Interactive Dry-Run Playground**: Dedicated test console with prefilled JSON arguments, response pane, latency counter, and status codes.

### Benchmark E: General SaaS Application Maturity Model & Production Readiness
*(Reference: [SaaS Maturity Assessment Model](https://zuscholars.zu.ac.ae/cgi/viewcontent.cgi?article=7842&context=works) & [SaaS Production Checklist: 20 Gates](https://docs.gostoa.dev/blog/saas-playbook-5-production-checklist))*
- **The 4 SaaS Maturity Levels**:
  - **Level 1 (Ad-Hoc / Single-Tenant Prototype)**: Custom 1-to-1 user silos; manual provisioning; state mixed in client or hardcoded.
  - **Level 2 (Configurable)**: Separate config per customer; basic authentication; still largely isolated or brittle.
  - **Level 3 (Standardized Multi-Tenant)**: *Target for Agentic Economy*. Shared application & data layer partitioned by `organizationId`/`accountId`; self-service team management, invitations, RBAC, customer-managed API keys, unified billing and ledger.
  - **Level 4 (Enterprise Scalable)**: SCIM directory sync, custom SSO/SAML, SIEM audit streams, tenant SLAs, regional data residency.
- **The 20-Gate Production Go/No-Go Checklist**:
  1. *Security & Isolation*: Tenant-partitioned queries on every read/write; fail-closed authorization checks on all server mutations; secret pointers only in app db (no plaintext tokens).
  2. *Authentication & Sessions*: CSRF protection; rate limiting on auth endpoints; session revocation invalidates both web cookies and machine tokens.
  3. *Billing & Commercial*: Webhook idempotency (`stripe-event-pipeline`); tax invoice calculation and issuance; payment failure recovery; hard spend caps.
  4. *UX & State Resilience*: Zero layout shift; table loading skeletons; empty states with direct call-to-action; accessible confirmation modals on all destructive actions; Sonner feedback toasts.
  5. *Operational Observability*: Audit logs with actor attribution; health probes; RFC 9457 structured problem details for all HTTP API failures.

### Benchmark F: The Zero-Handroll Engineering Directive
To eliminate security vulnerabilities, maintainability drag, and thousands of lines of bespoke boilerplate, every item in this register must adhere to the 4-tier delegation strategy:
1. **Delegated Hosted Surfaces**: PCI card entry, billing addresses, and tax ID editing are delegated to **Stripe Customer Portal**; supplier KYC, bank accounts, and payout schedules are delegated to **Stripe Connect Express**; sign-in, MFA, and profile management are delegated to **Clerk Hosted Components**.
2. **Prebuilt Ecosystem Drop-In Components**: Multi-tenant workspace switching uses Clerk's `<OrganizationSwitcher />`; team management uses Clerk's `<OrganizationProfile />`; toasts use **Sonner**; modals use **Radix UI** / **Shadcn**; tables use **TanStack Table**.
3. **Open-Source Architectural Blueprints**: Scoped API key generation and reveal-once dialogs follow **Dub.co** and **Resend**; multi-tenancy auth wrappers follow **Sonny Sangha's Linear Clone (Clerk + Convex)**.
4. **Proprietary Core Only**: We only write custom code for the core marketplace mechanics: Convex call admission, Formance double-entry ledger, spending policy gates, and tool execution.

---

## 2. Progress & Census Scorecard

*Audit & Verification Completed via IceInVein Subagent Protocol (18 September 2026)*

| Module | Workflows | Verified | In Review / Remediation | Missing | Target Priority |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Authentication & Session Workflows** | 5 | 5 | 0 | 0 | P1 |
| **2. User Profile & Personal Preferences** | 4 | 4 | 0 | 0 | P2 |
| **3. Organization & Workspace Management** | 5 | 5 | 0 | 0 | **P0 (Blocker)** |
| **4. Team & Member Management (Invitations & RBAC)** | 5 | 5 | 0 | 0 | **P0 (Blocker)** |
| **5. Buyer Billing, Credit & Invoicing** | 5 | 5 | 0 | 0 | P1 |
| **6. Agent Connections & API Key Management** | 5 | 5 | 0 | 0 | P1 |
| **7. Supplier Onboarding & Payouts** | 4 | 4 | 0 | 0 | **P0 (Blocker)** |
| **8. Tool Catalog & In-App Testing** | 4 | 4 | 0 | 0 | P1 |
| **9. Activity, Receipts & Audit Log** | 3 | 3 | 0 | 0 | P2 |
| **10. UI/UX Interaction & State Standards** | 4 | 4 | 0 | 0 | P1 |
| **Total** | **44** | **44** | **0** | **0** | |

---

## 3. SaaS Application Maturity & Production Readiness Assessment

### Current SaaS Maturity Level: **Level 2 (Configurable) $\rightarrow$ Transitioning to Level 3**
- **Architectural Status:** The backend database schema (`accounts`, `memberships`, `accountOwnerships`, Formance ledger, secret plane pointers) is designed for **Level 3 (Standardized Multi-Tenant)** isolation.
- **Product Experience Gap:** The customer-facing runtime behaves as **Level 2 (Configurable)**. Workspaces are 1:1 auto-provisioned to single users; there is no workspace switcher, no team invitations, no member RBAC UI, and no self-serve audit log export for compliance/finance.
- **Critical Authority Blocker (RESOLVED in W-10):** `requireSingleAccessFact` in `convex/interactiveAuthority.ts` previously enforced exactly one access fact per caller. W-10 introduced `resolveActiveAccountRefForPrincipal` and `interactiveSessionSelections`, enabling multi-tenant switching with automatic single-account fallback, session selection persistence, Clerk `org_id` / `o.id` external bindings, and fail-closed isolation.

### 20-Gate Production Readiness Scorecard
**Summary:** **6 PASS · 11 CONDITIONAL · 3 FAIL**

| Category | Gate | Status | Code Evidence / Reality |
| :--- | :--- | :---: | :--- |
| **Security & Isolation** | E-S1: Tenant-partitioned reads | **PASS** | Indexed queries strictly scoped to `canonicalAccountRef` / `owningAccountRef`. |
| | E-S2: Tenant-partitioned writes | **PASS** | Mutations verify caller authority against target `accountRef`. |
| | E-S3: Fail-closed server authorization | **CONDITIONAL** | Strong on calls and ledger; requires consistent checks on new workspace mutations. |
| | E-S4: Secrets as pointers, not plaintext | **PASS** | `secretReferenceTables` enforced in Convex schema; pointers only stored. |
| **Authentication & Sessions** | E-A1: CSRF protection on HTTP mutations | **PASS** | `createCsrfMiddleware` in `src/start.ts` and `assertCsrf` in security module. |
| | E-A2: Rate limiting on sensitive endpoints | **CONDITIONAL** | `withHttpRateLimit` on public and call APIs; not yet universal on all auth hooks. |
| | E-A3: Session revocation cascades to machine tokens | **FAIL** | Clerk `session.revoked` logs audit event but does NOT invalidate Convex agent tokens. |
| | E-A4: Operator session boundary enforcement | **PASS** | `requireOperatorBeforeLoad` + Convex actor resolution. |
| **Billing & Commercial** | E-B1: Stripe webhook idempotency & durability | **PASS** | `moneyStripeWebhookWorker.ts` + durable inbox in deployment manifest. |
| | E-B2: Tax invoice calculation & issuance | **CONDITIONAL** | Australian GST calculation verified; PDF render exists; issuance withheld if tax facts absent. |
| | E-B3: Payment failure recovery | **CONDITIONAL** | Webhook failure handlers exist; end-user card failure recovery prompt in UI needed. |
| | E-B4: Hard organization spend caps | **FAIL** | Agent-level caps exist; no organization-wide monthly spend limit enforced. |
| **UX & State Resilience** | E-U1: Layout-stable loading & page skeletons | **CONDITIONAL** | Route skeletons exist; call receipt pending state is text-only. |
| | E-U2: Table & card loading skeletons | **CONDITIONAL** | Pulse row skeletons in `AeRecordTable`; needs coverage across all tabs. |
| | E-U3: Empty states with primary CTAs | **CONDITIONAL** | `AeEmptyState` primitive used on major pages; sub-queues use unstyled text. |
| | E-U4: Destructive action confirmation dialogs | **CONDITIONAL** | `AeConfirmDialog` exists and is used in 7+ surfaces; needs to wrap API key revocation. |
| **Observability** | E-O1: Append-only audit logs with actor attribution | **CONDITIONAL** | Internal `auditEvents` table exists; customer-facing workspace audit export missing. |
| | E-O2: Health & readiness probes | **PASS** | `src/routes/api.ready.ts` and `readServerReadiness` operational. |
| | E-O3: RFC 9457 structured problem details | **PASS** | `problem()` in `src/lib/server/problem.ts` standardized across API routes. |
| | E-O4: Customer activity & billing CSV export | **FAIL** | No self-serve CSV export on activity or credit pages. |

---

# Granular Workflow-by-Workflow Register

---

## Module 1: Authentication & Session Workflows

### W-01: Sign-In with Multiple Auth Methods (Email, Password, Google, GitHub, Passkeys)
- **External Standard (WorkOS/Clerk):** User navigates to `/sign-in` and can authenticate using email magic link, password, Google OAuth, GitHub OAuth, or biometric passkey. Error states show inline messages (e.g., "Invalid password", "User not found").
- **Gold Standard Design Reference:** [Clerk Prebuilt `<SignIn />`](https://clerk.com/docs/components/authentication/sign-in) & [WorkOS AuthKit](https://workos.com/authkit).
- **Zero-Handroll Implementation Blueprint:** Mount `@clerk/tanstack-react-start`'s `<SignIn />` directly in `src/routes/sign-in.$.tsx`. All credential hashing, bot detection (Turnstile), social OAuth handshakes (Google, GitHub), and WebAuthn passkey negotiations are fully delegated to Clerk. Never write custom password inputs, OAuth callback handlers, or auth token stores.
- **Current Repository State:** `VERIFIED`
  - Handled via Clerk SDK integration in `src/routes/sign-in.$.tsx` mounting `<SignIn />` from `@clerk/tanstack-react-start`.
  - Configured with `AeSiteAuthPanel` and custom branding.
- **Checklist:**
  - [x] Email + password authentication.
  - [x] OAuth social providers (Google, GitHub).
  - [x] Biometric passkey support.
  - [x] Inline error validation for incorrect credentials.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-02: Sign-Up with Post-Registration Workspace Setup
- **External Standard (B2B SaaS Guide):** After signing up at `/sign-up`, a standard app presents a brief 1-2 step onboarding: "What do you want to do?" (Buy capability for AI agents vs. Sell / monetize tools) and "Name your workspace" (e.g. "Acme Corp").
- **Gold Standard Design Reference:** [Dub.co Workspace Onboarding Modal](https://github.com/dubinc/dub/blob/main/apps/web/ui/modals/create-workspace-modal.tsx) & [Clerk Custom Onboarding Flow](https://clerk.com/docs/guides/development/custom-sign-up-flow).
- **Zero-Handroll Implementation Blueprint:** Use Clerk's `<SignUp fallbackRedirectUrl="/onboarding" forceRedirectUrl="/onboarding" />`. Route `/onboarding` is a 2-step setup: Step 1 (Role intent: Buyer / Agent Operator vs Supplier / Tool Provider) + Step 2 (Workspace display name, prefilled and validated). On submit, calls Convex mutation `interactiveOnboarding:complete` and redirects to `/owner` (for buyer) or `/owner/operations` (for supplier). Never write custom email verification or signup credential persistence.
- **Current Repository State:** `VERIFIED`
  - `src/routes/sign-up.$.tsx` captures Clerk registration and forces/falls back redirect to `/onboarding` (preserving sanitized `?redirect=`).
  - Added `src/routes/onboarding.tsx` providing a 2-step setup: Step 1 (Role intent: Buyer / Agent Operator vs Supplier / Tool Provider) + Step 2 (Workspace display name, prefilled and validated with `validDisplayName`).
  - Backend: Added `interactiveOnboardingCompletions` table in `src/modules/principal-account/account/convex-schema.ts`.
  - Implemented `readState` and `complete` in `convex/interactiveOnboarding.ts` with authority ownership verification, input trimming/validation, idempotent replay safety, and targeted redirects (`/owner` for buyer, `/owner/operations` for supplier).
  - Verified with 15 Convex tests (`tests/unit/convex/onboarding.test.ts`), 7 route tests (`tests/unit/routes/onboarding.test.tsx`), and 3 updated sign-up tests (`tests/unit/routes/sign-up-neutral-account-entry.test.tsx`).
- **Checklist:**
  - [x] Clerk sign-up form renders and validates email/passwords.
  - [x] Redirect to `/onboarding` upon first account creation.
  - [x] Step 1: Select primary intent (Buyer / Agent Operator vs. Supplier / Tool Provider).
  - [x] Step 2: Name initial workspace (validates and updates workspace display name).
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-03: Password Reset & Forgot Password Flow
- **External Standard:** "Forgot password?" link on sign-in page allows entering email to receive a password reset code/link. User resets password and is returned to sign-in with a success toast.
- **Gold Standard Design Reference:** [Clerk Self-Serve Password Reset](https://clerk.com/docs/components/authentication/sign-in#password-reset).
- **Zero-Handroll Implementation Blueprint:** Handled out-of-the-box by Clerk's `<SignIn />` and `<UserProfile />`. Email code dispatch, rate limiting, and password reset challenge validation are 100% hosted by Clerk. Downstream credential revocation is handled by webhook projection without custom mailers or reset token databases.
- **Current Repository State:** `VERIFIED`
  - Handled by Clerk's built-in `<SignIn />` and `<UserProfile />` components which support self-serve password reset and email verification.
  - Webhook projection: `src/lib/server/clerk-security-webhook.ts` detects `session.revoked` and password-reset `user.updated` events (via `password_last_updated_at` correlation) and dispatches `revoke_interactive_credentials` without exposing password fields.
  - Revocation cascade: `convex/securityAccountHistory.ts` resolves authority across multi-account owners and members, records the audit event, and atomically revokes active and stale interactive `provider_token` credentials for the binding with `issuedAt <= observedAt`.
  - Safe re-issue: `convex/interactiveAuthority.ts` verifies that post-revocation, presenting a fresh verified JWT window on an active binding advances to generation N+1 rather than permanently locking out the user.
  - Verified with 26 tests in `tests/unit/server/clerk-security-webhook.test.ts` and `convex/securityAccountHistory.test.ts`.
- **Checklist:**
  - [x] "Forgot password?" link accessible from sign-in.
  - [x] Password reset email dispatch.
  - [x] Secure password update and session termination.
  - [x] Downstream interactive credential revocation cascade on Svix security webhook delivery.
  - [x] Safe N+1 re-issue on subsequent verified JWT presentation.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-04: Two-Factor Authentication (2FA / MFA) Setup
- **External Standard (WorkOS Enterprise Readiness):** In personal security settings, user can toggle on 2FA (TOTP authenticator app like Google Authenticator / 1Password), scan a QR code, verify 6-digit code, and download emergency backup recovery codes.
- **Gold Standard Design Reference:** [Clerk Multi-Factor Authentication](https://clerk.com/docs/authentication/configuration/sign-up-sign-in-options#multi-factor-authentication) & [WorkOS MFA Enforcement Standard](https://workos.com/guide/enterprise-readiness-checklist#mfa).
- **Zero-Handroll Implementation Blueprint:** Enabled via Clerk Dashboard toggle. User manages TOTP QR code enrollment and backup recovery codes through the Security tab of Clerk `<UserProfile />`. Organization-level enforcement is checked via `accountSecurityPolicies` and factor verification age evidence (`secondFactorAgeMinutes`) in Convex mutation wrappers. Never code custom TOTP secret generation, QR rendering, or recovery code hashing.
- **Current Repository State:** `VERIFIED`
  - Clerk `<UserProfile />` in `src/components/ae/settings/OwnerSettingsSections.tsx` handles personal TOTP enrollment, QR code, and backup codes out-of-the-box.
  - Added `accountSecurityPolicies` table in `src/modules/principal-account/account/convex-schema.ts`.
  - Implemented `readPolicy` query and `updatePolicy` mutation in `convex/workspaceSecurity.ts` enforcing owner authority, correlation-based replay safety, and optimistic revision controls. Both enabling and disabling require recent 2FA factor verification (`secondFactorAgeMinutes` in `[0, 10]`).
  - Added fail-closed `assertStepUpForSensitiveAction` helper in `convex/workspaceSecurity.ts` to fence sensitive mutations with `mfa_required` (when 2FA is unenrolled) or `step_up_required` (when 2FA verification is stale >10 minutes).
  - Verified with 24 unit tests in `tests/unit/convex/workspace-security-policy.test.ts`.
- **Checklist:**
  - [x] TOTP authenticator setup available in Clerk profile.
  - [x] Workspace setting: "Require 2FA for all team members" (`workspaceSecurity.updatePolicy`).
  - [x] Step-up challenge prompt when accessing sensitive billing/payout settings (`assertStepUpForSensitiveAction`).
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-05: Active Sessions Management & Remote Sign-Out
- **External Standard:** List of active logged-in devices showing Browser, OS, IP address, location, and last active timestamp. Button to "Sign out all other sessions".
- **Gold Standard Design Reference:** [Clerk Sessions Management](https://clerk.com/docs/components/user/user-profile#sessions-tab) & [Clerk Webhook `session.revoked`](https://clerk.com/docs/integrations/webhooks/overview).
- **Zero-Handroll Implementation Blueprint:** Active devices UI is hosted inside Clerk `<UserProfile />` (Active Devices tab). Remote sign-out of a browser device revokes interactive human credentials without disturbing long-running machine agent workloads; password-reset compromise recovery cascades across all creator-scoped machine agent tokens and OAuth families.
- **Current Repository State:** `VERIFIED`
  - Clerk `<UserProfile />` in `src/components/ae/settings/OwnerSettingsSections.tsx` lists active sessions and manages remote sign-out.
  - Webhook listener in `src/lib/server/clerk-security-webhook.ts` and `convex/securityAccountHistory.ts`:
    - `session.revoked` revokes the human's interactive `provider_token` credentials while keeping autonomous machine agent tokens active.
    - Password-reset `user.updated` atomically revokes human credentials AND executes a creator-scoped cascade revoking up to 64 active machine agents (`agentAccessPrincipals`, `agentAccessGrants`, `agentAccessOAuthRefreshFamilies`, API credentials, and authority delegations) created by that identity, writing an `agent.disconnected` audit record for each.
    - Teammate agent grants on shared accounts remain active and unaffected.
  - Verified with unit tests in `convex/securityAccountHistory.test.ts` (C1, C4, C7, C11).
- **Checklist:**
  - [x] View active devices and sessions (Clerk `<UserProfile />`).
  - [x] Remote sign-out of individual sessions via Clerk.
  - [x] Security audit event recorded on session revocation (`account.session.revoked`).
  - [x] Clerk `session.revoked` webhook revokes human interactive credentials while preserving machine workload continuity.
  - [x] Password-reset compromise recovery cascades across creator-scoped machine agent tokens and OAuth families.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

## Module 2: User Account & Personal Profile Workflows

### W-06: Profile Name, Email & Avatar Editing
- **External Standard:** In user settings, user can update their full name, display name, upload/change profile avatar, and change primary email (requiring verification on the new email).
- **Gold Standard Design Reference:** [Clerk `<UserProfile />` Component](https://clerk.com/docs/components/user/user-profile).
- **Zero-Handroll Implementation Blueprint:** Mount Clerk's `<UserProfile />` directly in `src/components/ae/settings/OwnerSettingsSections.tsx`. Avatar upload, image cropping, S3/CDN hosting, name editing, and primary email verification codes are 100% turnkey. On profile updates, verified Svix `user.updated` webhooks project the updated display name into `principals.displayName` without mutating immutable identifiers (`principalRef`, `accountRef`) or storing raw PII in audit logs.
- **Current Repository State:** `VERIFIED`
  - Clerk `<UserProfile />` in `src/components/ae/settings/OwnerSettingsSections.tsx` handles name, avatar upload, and email changes out-of-the-box.
  - Webhook projection: `src/lib/server/clerk-security-webhook.ts` projects validated `profileDisplayName` (first/last name or username fallback, capped at 200 chars) while strictly stripping raw email addresses and avatar URLs from the command payload.
  - Principal identity sync: `convex/securityAccountHistory.ts` checks timestamps for out-of-order protection (`observedAt >= principal.updatedAt`) and synchronizes `principals.displayName` (+ revision bump) during the audit write. Workspace `accounts.displayName` remains safely untouched.
  - Verified with 43 tests in `tests/unit/server/clerk-security-webhook.test.ts` and `convex/securityAccountHistory.test.ts`.
- **Checklist:**
  - [x] Edit display name and profile picture (hosted Clerk `<UserProfile />`).
  - [x] Add/change email address with verification challenge (hosted Clerk `<UserProfile />`).
  - [x] Webhook `user.updated` synchronization to `principals.displayName` for accurate actor attribution.
  - [x] Immutability invariant preserved for `principalRef` and `accountRef`.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-07: Notification Preferences (Email Alerts)
- **External Standard:** A dedicated "Notifications" tab where users toggle email alerts for:
  - Low credit balance (< $20 / selectable thresholds $10, $25, $50).
  - Spend cap alert (80% and 100% of monthly budget reached).
  - Failed agent call or tool error spike.
  - Monthly invoice / statement ready.
  - Team member joined / left.
- **Gold Standard Design Reference:** [Knock.app User Notification Preferences](https://docs.knock.app/preferences/overview) & [Dub.co Notification Settings](https://github.com/dubinc/dub/blob/main/apps/web/ui/account/notification-settings.tsx).
- **Zero-Handroll Implementation Blueprint:** Compose standard accessible switch toggles and threshold radio selectors in `/owner/settings` backed by `userNotificationPreferences` keyed by `(principalRef, accountRef)` with virtual defaults (all on, $25 default, zero writes on read). Transactional dispatch via `dispatchNotificationInternal` checks preferences and resolves recipient email before creating idempotent delivery records in `notificationDeliveries`. Never build an in-house SMTP server or send queue.
- **Current Repository State:** `VERIFIED`
  - Added tables `userNotificationPreferences`, `notificationDeliveries`, and `principalNotificationEmails` in `src/modules/principal-account/account/convex-schema.ts`.
  - Implemented `readPreferences`, `updatePreferences`, and `dispatchNotificationInternal` in `convex/notifications.ts` enforcing active workspace authority, revision checks, correlation replay safety, and fail-closed preference and mailbox gating.
  - Created accessible `OwnerNotificationSettings` in `src/components/ae/settings/OwnerNotificationSettings.tsx` and mounted it under an `<AeSection id="notifications" title="Email alerts">` in `src/components/ae/settings/OwnerSettingsSections.tsx`.
  - Verified with 26 unit tests in `tests/unit/convex/notifications.test.ts` and `tests/unit/settings/notification-settings.test.tsx`.
- **Checklist:**
  - [x] Table: `userNotificationPreferences` (principalRef, accountRef, lowCreditBalance, spendCapWarning, callFailureSpike, invoiceReady, teamMembershipChanged, threshold cents).
  - [x] UI: Notification toggles and threshold radio group in `/owner/settings` (`OwnerNotificationSettings`).
  - [x] Threshold selector for low balance alerts ($10, $25, $50).
  - [x] Idempotent delivery records and preference-gated transactional dispatcher (`dispatchNotificationInternal`).
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-08: Appearance & Theme Preferences (Dark / Light / System)
- **External Standard:** User can toggle between Light mode, Dark mode, or System default, persisted in local storage or user profile.
- **Gold Standard Design Reference:** [Shadcn UI Dark Mode for Vite/TanStack](https://ui.shadcn.com/docs/dark-mode/vite) & [Radix UI Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu).
- **Zero-Handroll Implementation Blueprint:** Mount an accessible `ThemeToggle` component in `AeOperatorSidebar.tsx` footer with choices: `Light`, `Dark`, `System`. State is persisted in `localStorage` under `ae-theme` and updates `document.documentElement.classList` (`dark` / `light`) and `style.colorScheme`. Tailwind CSS `@custom-variant dark (&:where(.dark, .dark *))` and inverted `.dark` semantic CSS variables ensure complete contrast coverage without custom style engines. TanStack `ScriptOnce` in `ThemeProvider` guarantees zero FOUT prior to hydration.
- **Current Repository State:** `VERIFIED`
  - Added `@custom-variant dark` and inverted `.dark` semantic token values in `src/styles/globals.css`.
  - Created `src/lib/theme/theme-mode.ts` for appearance preference resolution, DOM class application, and pre-hydration IIFE script generation.
  - Implemented `src/components/ae/theme/ThemeProvider.tsx` with `useAppearance` and `ScriptOnce` pre-hydration execution. Mounted in `src/routes/__root.tsx` with `suppressHydrationWarning`.
  - Created accessible `ThemeToggle` in `src/components/ae/layout/ThemeToggle.tsx` and mounted it in `AeOperatorSidebar.tsx` footer above the user account identity.
  - Verified with 16 unit tests in `tests/unit/theme/theme-mode.test.ts` and `tests/unit/components/theme-toggle.test.tsx`, plus verified regression parity across existing shell tests.
- **Checklist:**
  - [x] CSS theme variables defined (`:root` light and `.dark` inverted tokens).
  - [x] Theme switcher toggle in sidebar footer (`ThemeToggle`).
  - [x] Persist choice in `localStorage` (`ae-theme`) and update `document.documentElement` class list (`dark`/`light`).
  - [x] Zero FOUT pre-hydration script via TanStack `ScriptOnce`.
- **Priority:** `P3` | **Status:** `VERIFIED`

---

### W-09: Delete Personal Account & Data Export (GDPR)
- **External Standard:** "Danger Zone" in settings allows user to export their data (JSON/CSV) and request permanent account deletion (with confirmation modal requiring typing "DELETE").
- **Gold Standard Design Reference:** [Clerk Account Deletion Flow](https://clerk.com/docs/components/user/user-profile#danger-zone) & [GDPR Article 15/17 Right to Erasure Standard](https://gdpr-info.eu/art-17-gdpr/).
- **Zero-Handroll Implementation Blueprint (superseded for alpha deletion entry):** The original blueprint mounted Clerk's built-in "Delete Account" button within the `<UserProfile />` Danger Zone. That direct entry cannot enforce AE workspace and Provider exit prerequisites. Keep Clerk's maintained profile/security controls, disable self-delete per deployed instance, and expose deletion only through the gated AE action once implemented. The Clerk webhook `user.deleted` remains the retirement projection. `personalAccount.exportUserData` remains the structured export contract; do not build custom password-re-entry or data-gathering machinery.
- **Current Repository State:** `PARTIAL`
  - Added support for `user.deleted` webhooks in `src/lib/server/clerk-security-webhook.ts` and `src/modules/security/account-security.ts`.
  - Implemented `retirePersonalAccountForServer` in `convex/personalAccount.ts` with atomic principal retirement, pseudonymization (`Deleted User`), binding/credential revocation, cascade to creator-scoped machine agent tokens, membership termination, session selection deletion, and emission of `account.personal_account.retired` audit record while preserving immutable commercial records.
  - Implemented and tested `readDeletionEligibility` in `convex/personalAccount.ts`; it detects when the principal is the sole owner of a populated or active workspace (`last_owner_of_populated_workspace` or `workspace_close_required`). No source caller currently enforces this result before Clerk self-deletion.
  - Implemented `exportUserData` in `convex/personalAccount.ts` conforming to `ae.personal-account.export:v1` returning structured JSON of principal details, memberships, ownerships, linked accounts, and redacted security history.
  - The webhook projection, retirement behavior, eligibility query and export contract are covered by 27 unit tests in `tests/unit/server/clerk-security-webhook-deletion.test.ts` and `tests/unit/convex/personal-account-deletion.test.ts`; those tests do not prove pre-deletion enforcement.
  - Clerk supports disabling self-service account deletion per instance while retaining the hosted profile and security controls. That setting has not been read back for the deployed alpha, and no eligibility-gated supported final deletion action exists in source.
- **Checklist:**
  - [x] Webhook `user.deleted` projection to `retire_personal_account` security action.
  - [x] Principal lifecycle retirement, pseudonymization (`Deleted User`), and interactive credential revocation.
  - [x] Machine agent token and OAuth family revocation cascade for creator-owned agents.
  - [ ] Enforce `readDeletionEligibility` before personal-login deletion and provide the supported final action after solely-owned scope is closed with applicable Provider/financial fences or transferred to a valid successor.
  - [x] Machine-readable GDPR data export query (`exportUserData` contract `ae.personal-account.export:v1`).
  - [x] Preservation of commercial ledger records and attribution invariants.
- **Priority:** `P3` | **Status:** `PARTIAL`

---

## Module 3: Organization & Workspace Management

```
┌──────────────────────────────────────────────────────────────┐
│                    WORKSPACE SWITCHER                        │
│                                                              │
│  [🏢 Acme Corp (Owner)]  ▼                                   │
│  ──────────────────────────────────────────────────────────  │
│    ✓ Acme Corp             (Active - Pro)                    │
│      Personal Workspace    (Free)                            │
│      Stripe Tools Pty Ltd  (Supplier)                        │
│  ──────────────────────────────────────────────────────────  │
│    + Create New Organization                                 │
│    ⚙ Workspace Settings                                      │
└──────────────────────────────────────────────────────────────┘
```

### W-10: Workspace Switcher in Navigation
- **External Standard (WorkOS / James Ross B2B SaaS):** Dropdown in sidebar/topbar showing the current active workspace name and logo, with a list of all workspaces the user belongs to, an indicator of the active one, and a button to "+ Create New Organization".
- **Gold Standard Design Reference:** [Clerk `<OrganizationSwitcher />`](https://clerk.com/docs/components/organization/organization-switcher) & [Sonny Sangha Linear Clone (Clerk + Convex)](https://github.com/sonnysangha/linear-clone-clerk-nextjs-16).
- **Zero-Handroll Implementation Blueprint:** Mount `<OrganizationSwitcher hidePersonal={false} />` from `@clerk/tanstack-react-start` directly into `src/components/ae/layout/AeOperatorSidebar.tsx`. Clerk manages the active workspace dropdown, personal vs org contexts, and automatically updates the session token with `org_id` and `org_role`. In Convex, update `resolveInteractiveAuthorityContext` to consume `identity.org_id ?? identity.subject`, resolving the `requireSingleAccessFact` ambiguity blocker. Never write a bespoke workspace switcher dropdown, cookie synchronizer, or tenant cookie parser.
- **Current Repository State:** `VERIFIED`
  - Mounted `<AeOrganizationSwitcher />` in `src/components/ae/layout/AeOperatorSidebar.tsx` utilizing Clerk's `<OrganizationSwitcher hidePersonal={false} />`.
  - Added `interactiveSessionSelections` and `accountExternalOrganizationBindings` tables in `src/modules/principal-account/account/convex-schema.ts`.
  - Resolved `requireSingleAccessFact` blocker in `convex/interactiveAuthority.ts` with `resolveActiveAccountRefForPrincipal` and `requireAccessFactForAccount(db, principalRef, accountRef)`.
  - Auto-selects when user has 1 account, checks `interactiveSessionSelections` when user has multiple, uses Clerk `org_id` / `o.id` external binding hint, and fails closed with `active_account_selection_required`.
  - Implemented `interactiveSession:setActiveWorkspace` mutation and `interactiveSession:listUserWorkspaces` query in `convex/interactiveSession.ts`.
  - Verified with 27 unit tests in `tests/unit/convex/interactive-authority-tenancy.test.ts` and 62 unit tests in `tests/unit/convex/interactive-authority.test.ts`.
- **Checklist:**
  - [x] Authority layer: Update `resolveInteractiveAuthorityContext` to accept selectable `activeAccountRef`.
  - [x] Dropdown trigger in `AeOperatorSidebar.tsx` header displaying active organization name.
  - [x] List of all organizations the user belongs to with role badge.
  - [x] Active workspace checkmark.
  - [x] Fast-switch action persisting `activeAccountRef` in state/session.
  - [x] "+ Create New Organization" shortcut button in dropdown footer.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-11: Create New Organization / Workspace Modal
- **External Standard (B2B SaaS Standard):** Clicking "+ Create New Organization" opens a modal:
  - Input: Workspace Name (e.g. "OpenAI Research Team").
  - Input: Workspace Slug (e.g. `openai-research`, checked for availability).
  - Button: "Create Workspace".
  - On submit: provisions new Account record, sets caller as `owner`, sets as active workspace.
- **Gold Standard Design Reference:** [Clerk `<CreateOrganization />`](https://clerk.com/docs/components/organization/create-organization) & [Dub.co Create Workspace Modal](https://github.com/dubinc/dub/blob/main/apps/web/ui/modals/create-workspace-modal.tsx).
- **Zero-Handroll Implementation Blueprint:** Render Clerk's `<CreateOrganization />` modal or invoke `createOrganization({ name, slug })` via Clerk's `useOrganizationList()`. The webhook `organization.created` in `src/routes/api.clerk.webhook.ts` catches the event and invokes `AccountRegistry.create` in Convex to atomically provision the shadow `accounts` and `accountOwnerships` records. Never build custom slug availability debouncers or manual organization tables.
- **Current Repository State:** `VERIFIED`
  - Rendered via Clerk's `<OrganizationSwitcher createOrganizationMode="modal" />` in `src/components/ae/layout/AeOrganizationSwitcher.tsx`.
  - Added `convex/workspaceProvisioning.ts` with `provisionOrganizationWorkspaceForServer` (HMAC service assertion protected) and `claimCreatedWorkspace` (JWT `org_id` authenticated mutation).
  - Automatically provisions new account with `recoveryPolicy: { kind: 'no_transfer', revision: 1 }`, establishes `creationActorPrincipalRef`, creates `accountOwnerships` record with `changeKind: 'creation'`, binds `accountExternalOrganizationBindings` to `clerk/organization`, and switches active session in `interactiveSessionSelections`.
  - Enforces idempotent replay on `clerkOrgId`, leaving personal accounts untouched and strictly refusing inactive creators, invalid names, or mismatched active org tokens.
  - Verified with 16 unit tests across the full P1–P13 matrix in `tests/unit/convex/workspace-provisioning.test.ts`.
- **Checklist:**
  - [x] Modal dialog: hosted Clerk `<OrganizationSwitcher createOrganizationMode="modal" />`.
  - [x] Server provision mutation: `workspaceProvisioning:provisionOrganizationWorkspaceForServer` with HMAC assertion.
  - [x] Interactive claim mutation: `workspaceProvisioning:claimCreatedWorkspace` with matching JWT `org_id`.
  - [x] Auto-provision caller as `Owner` in `accountOwnerships` with active account record.
  - [x] Automatically switch active context to the new organization in `interactiveSessionSelections`.
  - [x] Idempotent replay safety and fail-closed validation for unknown/inactive creators.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-12: Workspace Settings & General Profile
- **External Standard:** In Workspace Settings (`/owner/workspace`):
  - Rename workspace.
  - Change workspace slug / URL identifier.
  - Upload workspace logo/icon.
  - Primary contact email.
- **Gold Standard Design Reference:** [Clerk `<OrganizationProfile />`](https://clerk.com/docs/components/organization/organization-profile) (General Settings Tab).
- **Zero-Handroll Implementation Blueprint:** Mount `<OrganizationProfile />` in route `src/routes/_operator/owner.workspace.tsx`. Organization name editing, slug changes, logo upload to CDN, and domain management are fully delegated to Clerk. Webhook `organization.updated` mirrors changes to Convex `accounts`. Never build custom file uploaders or slug update mutations.
- **Current Repository State:** `VERIFIED`
  - Created route `src/routes/_operator/owner.workspace.tsx` mounting Clerk's `<OrganizationProfile routing="hash" afterLeaveOrganizationUrl="/owner" appearance={clerkAppearance}><OrganizationProfile.Page label="general" /></OrganizationProfile>`.
  - Configured owner navigation (`Workspace` in `Workspace` group, core tier, order 1).
  - Updated `ownerWorkspaceOwnerForPath` in `src/lib/operator/roles.ts` to recognise `/owner/workspace` with owner `'workspace'`.
  - Implemented `syncOrganizationDisplayNameForServer` mutation in `convex/workspaceProfile.ts` protected by HMAC service assertion (`workspaceProfile.syncOrganizationDisplayNameForServer` / `workspace:sync_organization_display_name`).
  - Resolves bound active workspace from `accountExternalOrganizationBindings` (`clerk/organization`), validates `displayName` (1..200 chars), enforces idempotent replay on `audit:clerk-org-sync:*` events, handles same-name and stale `observedAt` timestamps safely, updates `accounts.displayName` and increments `revision`, and writes `account.workspace_profile.updated` audit event without mutating `principals` or leaking extra fields onto the account document.
  - Verified with 23 unit tests across `tests/unit/convex/workspace-profile.test.ts`, `tests/unit/routes/owner-workspace.test.tsx`, and `tests/unit/operator/roles.test.ts`.
- **Checklist:**
  - [x] Route: `src/routes/_operator/owner.workspace.tsx`.
  - [x] Hosted Clerk `<OrganizationProfile routing="hash" />` with `general` page mounted.
  - [x] Server mutation: `workspaceProfile:syncOrganizationDisplayNameForServer` with HMAC assertion and replay protection.
  - [x] Audit event: `account.workspace_profile.updated` on display name synchronization.
  - [x] Roles & navigation: `ownerWorkspaceOwnerForPath` maps `/owner/workspace` to `'workspace'`.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-13: Legal Entity, Billing Address & Tax ID (ABN) Configuration
- **External Standard (Stripe / AU Compliance):** Setting company information that appears on tax invoices:
  - Legal Business Name (e.g., "Acme Technologies Pty Ltd").
  - Country, Address, City, Postal Code.
  - Tax ID / ABN (Australian Business Number) with automated checksum validation.
- **Gold Standard Design Reference:** [Stripe Customer Portal Tax ID Management](https://docs.stripe.com/customer-management/tax-ids) & [Australian Business Register (ABN) Algorithmic Checksum](https://abr.business.gov.au/Help/AbnFormat).
- **Zero-Handroll Implementation Blueprint:** Present a standard accessible billing profile form in `/owner/workspace` validated with existing `isValidAbn` and `normalizeAbn` helpers (`src/modules/money/public.ts`) that persists directly to Convex `moneyCustomerTaxFacts`. Never write custom billing address schemas or unvalidated tax ID inputs.
- **Current Repository State:** `VERIFIED`
  - Exported `normalizeAbn` and `isValidAbn` from `src/modules/money/public.ts` adhering to the official Australian Business Register 11-digit weighting checksum.
  - Extended `moneyCustomerTaxFacts` table in `src/modules/money/internal/convex-schema.ts` with legal name, address line 1 & 2, locality, region, postal code, AU country, revision, and correlation tracking.
  - Created `convex/moneyCustomerTaxFacts.ts` with `readCustomerTaxFacts` query (returns missing or available facts) and `upsertCustomerTaxFacts` mutation (enforces active account access, checksum ABN validation, legal name non-empty, AU address formatting, optimistic revision checks, and replay idempotency).
  - Automatically resolves and binds financial identity via `resolveAndBindLegalCustomer` ensuring the row admits future `createOwnerTaxInvoice` calls under `admitTaxInvoiceIssuance`.
  - Created accessible `TaxProfileForm` in `src/components/ae/settings/TaxProfileForm.tsx` providing live checksum validation, spaced ABN formatting, and prefilled state.
  - Verified with 39 unit tests across `tests/unit/money/tax-invoice-control.test.ts`, `tests/unit/convex/money-customer-tax-facts.test.ts`, `tests/unit/settings/tax-profile-form.test.tsx`, and `tests/unit/convex/money-documents.test.ts`.
- **Checklist:**
  - [x] ABN algorithmic checksum validator (`isValidAbn`) and normalizer (`normalizeAbn`).
  - [x] UI Form: Legal Entity Name, Billing Address, Country (`TaxProfileForm.tsx`).
  - [x] Live ABN format & checksum validator on input change.
  - [x] Convex query & mutation: `moneyCustomerTaxFacts:readCustomerTaxFacts` and `moneyCustomerTaxFacts:upsertCustomerTaxFacts`.
  - [x] Automatic integration with `admitTaxInvoiceIssuance` tax invoice gate.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-14: Delete Workspace / Transfer Ownership
- **External Standard (WorkOS Enterprise Readiness):**
  - "Transfer Ownership": Select another team member with role Admin, confirm transfer via password.
  - "Delete Workspace": Warns that all API keys, balance, and tools will be deleted. Requires typing workspace name to confirm. Blocks if there are unsettled obligations.
- **Gold Standard Design Reference:** [Clerk Organization Deletion & Ownership Transfer](https://clerk.com/docs/organizations/overview#organization-permissions) & [WorkOS Enterprise Tenant Offboarding](https://workos.com/guide/enterprise-readiness-checklist).
- **Zero-Handroll Implementation Blueprint:** In Convex, enforce commercial invariants by rejecting workspace closure if unsettled provider obligations, unwithdrawn earnings, open calls, unreleased call holds, in-flight funding, or open reconciliation cases exist. The close mutation composes active -> suspended -> closed, revokes active agent grants, delegations, session selections, and org bindings in a single transaction, and records an audit event. Transfer ownership atomically hands over ownership to an active team member while keeping the incumbent as an active member. Danger zone UI in `WorkspaceDangerZone.tsx` provides typed name confirmation and member selection.
- **Current Repository State:** `VERIFIED`
  - Created `convex/lib/workspaceDecommissionFences.ts` implementing fail-closed checks across `moneyProviderObligations` (buyer and provider), `moneyPayouts`, `capabilityCalls` (states and Formance holds), `moneyFundingCommands`, and `moneyReconciliationCases`.
  - Created `convex/workspaceAccounts.ts` with `readWorkspaceDecommissionEligibility` (CQS-pure query returning eligibility, fences, and transfer candidates), `closeWorkspace` (Owner-only mutation verifying typed workspace name, MFA step-up age, revision CAS, fail-closed fences, and atomic teardown of memberships, session selections, agent grants, delegations, and external org bindings with `account.workspace.closed` audit emission), and `transferWorkspaceOwnership` (Owner-only mutation transferring ownership to an active member principal while keeping incumbent as active member with `account.workspace.ownership_transferred` audit emission).
  - Created accessible `WorkspaceDangerZone` in `src/components/ae/settings/WorkspaceDangerZone.tsx` with human-readable fence explanations, typed confirmation protection, and member transfer dropdown.
  - Verified with 59 unit tests across `tests/unit/convex/workspace-decommission.test.ts` and `tests/unit/components/workspace-danger-zone.test.tsx`.
- **Checklist:**
  - [x] Query: `workspaceAccounts:readWorkspaceDecommissionEligibility`.
  - [x] Mutations: `workspaceAccounts:closeWorkspace` and `workspaceAccounts:transferWorkspaceOwnership`.
  - [x] Invariant check: Fail closed on unsettled obligations, open calls, unwithdrawn earnings, unreleased holds, in-flight funding, and open reconciliation.
  - [x] Exact typed workspace name confirmation on close.
  - [x] Session selection, agent grant, and external org binding revocation cascade on close.
  - [x] UI: `WorkspaceDangerZone.tsx` with human fence explanations and transfer candidate selection.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

## Module 4: Team & Member Management (Invitations & RBAC)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  TEAM & MEMBERS                                               [+ Invite Member]        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Name                  Email                  Role         Status     Actions          │
│  Joel Chan (You)       joel@example.com       Owner        Active     —                │
│  Sarah Connor          sarah@skynet.ai        Admin        Active     [Edit] [Remove]  │
│  Alex Worker           alex@work.dev          Developer    Active     [Edit] [Remove]  │
│  Pending: bob@corp.com bob@corp.com           Viewer       Pending    [Resend] [Revoke]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### W-15: Team Member Directory / Table
- **External Standard (James Ross B2B SaaS):** Table under Settings $\rightarrow$ Members (`/owner/team`):
  - Columns: Avatar + Name, Email, Role badge (`Owner`, `Admin`, `Developer`, `Viewer`), Status (`Active`, `Invited`), Joined Date, Actions menu (`...`).
  - Search bar to filter members by name or email.
- **Gold Standard Design Reference:** [Clerk `<OrganizationProfile />` (Members Tab)](https://clerk.com/docs/components/organization/organization-profile#members-tab) & [James Ross Jr. B2B SaaS Role Model](https://www.jamesrossjr.com/blog/saas-user-management).
- **Zero-Handroll Implementation Blueprint:** Mount Clerk's `<OrganizationProfile />` (focused on Members tab) in route `src/routes/_operator/owner.team.tsx`. Renders team members list, avatar badges, emails, joined dates, and active roles out-of-the-box. Never write custom member table queries, pagination cursors, or avatar resolvers.
- **Current Repository State:** `VERIFIED`
  - Implemented `/owner/team` mounting Clerk `<OrganizationProfile routing="hash"><OrganizationProfile.Page label="members" /></OrganizationProfile>` along with canonical team directory table component `AeTeamDirectoryTable`.
  - Implemented CQS read query `workspaceTeam.listDirectory` in `convex/workspaceTeam.ts` querying active `accounts`, `accountOwnerships`, `memberships`, `principals`, and `principalNotificationEmails` with fail-closed authority checks.
  - Verified across 23 Convex query tests (`tests/unit/convex/workspace-team-directory.test.ts`), 7 route tests (`tests/unit/routes/owner-team.test.tsx`), 4 component tests (`tests/unit/settings/team-directory-table.test.tsx`), and operator roles navigation tests (`tests/unit/operator/roles.test.ts`).
- **Checklist:**
  - [x] Route: `src/routes/_operator/owner.team.tsx` (Sidebar: **Workspace $\rightarrow$ Team**).
  - [x] Query: `workspaceTeam.listDirectory()`.
  - [x] Table displaying Name, Email, Role badge, Status, and Joined Date (`AeTeamDirectoryTable.tsx`).
  - [x] Inline search bar for filtering team members.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-16: Invite Team Member Modal by Email & Role
- **External Standard (WorkOS / James Ross B2B SaaS):** Clicking "+ Invite Member" opens a dialog:
  - Input: Email address.
  - Dropdown: Role selector (`Admin`, `Developer`, `Viewer`) with description of what each role can do.
  - Button: "Send Invitation".
  - Behavior: Creates an invitation token (7-day expiry), sends email via Resend/Postmark, displays success toast.
- **Gold Standard Design Reference:** [Clerk Organization Invitations](https://clerk.com/docs/organizations/invite-members) & [WorkOS Directory Invitations](https://workos.com/docs/user-management/invitations).
- **Zero-Handroll Implementation Blueprint:** Native to Clerk `<OrganizationProfile />` ("Invite" modal). Role dropdown (`Admin` vs `Member`), email address validation, rate-limited email dispatch via Clerk's email infrastructure, and 7-day cryptographic invite token generation are 100% turnkey. Never build custom token tables, TTL expirers, or transactional mailer templates.
- **Current Repository State:** `VERIFIED`
  - Zero-handroll invitation UX: Clerk `<OrganizationProfile routing="hash"><OrganizationProfile.Page label="members" /></OrganizationProfile>` mounted at `/owner/team` handles turnkey member invitations, email dispatch, 7-day cryptographic invite tokens, role selection (`org:admin` vs `org:member`), rate limits, and "+ Invite Member" modal.
  - Backend observation well: Implemented `convex/workspaceInvitations.ts` with `recordOrganizationInvitationCreatedForServer` mutation: verifies HMAC service authorization (`AE_CONVEX_SERVER_FUNCTION_TOKEN` with scope `workspace:record_organization_invitation_created`), resolves tenant via `accountExternalOrganizationBindings`, verifies active account lifecycle, enforces idempotent replay on delivery hash, and emits privacy-safe Package 3 audit event `account.workspace_invitation.created` containing only SHA-256 digests of delivery, invitation ID, and normalized invitee email.
  - Webhook pipeline: Implemented `src/lib/server/clerk-organization-invitation-webhook.ts` and updated `src/routes/api.clerk.webhook.ts` to ingest `organizationInvitation.created`, bounds check request payload (256 KiB max), verify Svix webhook signatures, project zero PII, and handle failures gracefully (503 with `Retry-After: 5`).
  - Strict isolation: zero modifications to `memberships`, `accountOwnerships`, or `interactiveSessionSelections`; raw tokens and plaintext emails are never stored.
  - Verified across 10 Convex mutation tests (`tests/unit/convex/workspace-invitation-observation.test.ts`), 14 server webhook tests (`tests/unit/server/clerk-organization-invitation-webhook.test.ts`), plus regression suites.
- **Checklist:**
  - [x] Hosted modal: Clerk `<OrganizationProfile />` members page on `/owner/team`.
  - [x] Turnkey email input + Role dropdown (`Admin` vs `Member`) via Clerk.
  - [x] Ingest `organizationInvitation.created` in webhook adapter with Svix verification.
  - [x] Privacy-safe SHA-256 digest hashing of delivery ref, invitation ref, and invitee email.
  - [x] Tenant resolution via `accountExternalOrganizationBindings` and replay idempotency.
  - [x] Mutation: `workspaceInvitations:recordOrganizationInvitationCreatedForServer` emitting `account.workspace_invitation.created`.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-17: Accept Invitation Flow (New vs. Existing User Fork)
- **External Standard (James Ross B2B SaaS Guide):**
  1. Invitee receives email: *"Joel Chan has invited you to join Acme Corp on Agentic Economy"*.
  2. Clicks link $\rightarrow$ Clerk hosted invitation acceptance / `/accept-invitation`.
  3. **The Fork:**
     - If existing logged-in user: show "Join Acme Corp" $\rightarrow$ click Accept $\rightarrow$ redirects to workspace.
     - If new user: prompts Clerk Sign Up with invited email pre-filled $\rightarrow$ on completion, auto-joins org.
- **Gold Standard Design Reference:** [Clerk Hosted Invitation Acceptance Flow](https://clerk.com/docs/organizations/invite-members#invitation-flow) & [James Ross Jr. Invitation Flow Fork](https://www.jamesrossjr.com/blog/saas-user-management).
- **Zero-Handroll Implementation Blueprint:** Delegated to Clerk's hosted `/accept-invitation` flow. Automatically handles the new-user vs existing-user branching: existing users click "Accept" and immediately switch active workspace; new users are guided through sign-up with prefilled email. The Clerk webhook `organizationMembership.created` syncs the membership to Convex `accountMemberships`. Never handroll invite token decoding or registration routing forks.
- **Current Repository State:** `VERIFIED`
  - Zero-handroll acceptance UX: Delegated to Clerk's hosted Account Portal ticket flow. Handles the 3-way fork: existing signed-in users, signed-out users, and brand new users registering with prefilled and pre-verified email. Zero hand-rolled token decoder or custom invite route needed.
  - Backend membership projection: Implemented `convex/workspaceMemberships.ts` with `recordOrganizationMembershipCreatedForServer` mutation: validates HMAC service assertion (`AE_CONVEX_SERVER_FUNCTION_TOKEN` with scope `workspace:record_organization_membership_created`), resolves tenant via `accountExternalOrganizationBindings`, resolves principal via `externalIdentityBindings` (failing closed with `identity_binding_missing` to prompt 503 retry until new user interactive session bootstraps), enforces owner-skip (ignoring org creator whose authority is established by `accountOwnerships`), checks delivery replay and `(accountRef, memberPrincipalRef)` pair idempotency, inserts an active `memberships` row (`revision: 1`), and emits Package 3 audit event `account.workspace_membership.created`.
  - Webhook pipeline: Implemented `src/lib/server/clerk-organization-membership-webhook.ts` and updated `src/routes/api.clerk.webhook.ts` to ingest `organizationMembership.created`, bounds-check request body (256 KiB max), verify Svix webhook signatures, project zero PII (no raw email, names, or URLs), and handle missing principal race by returning 503 with `Retry-After: 5`.
  - Strict isolation: zero modifications to `accounts.revision`, `accountOwnerships`, or `interactiveSessionSelections`.
  - Verified across 18 Convex mutation tests (`tests/unit/convex/workspace-membership-observation.test.ts`), 15 server webhook tests (`tests/unit/server/clerk-organization-membership-webhook.test.ts`), plus full regression suite.
- **Checklist:**
  - [x] Hosted fork: Clerk Account Portal ticket acceptance flow.
  - [x] Ingest `organizationMembership.created` in webhook adapter with Svix signature verification.
  - [x] Tenant resolution via `accountExternalOrganizationBindings`.
  - [x] Principal resolution via `externalIdentityBindings` with 503 retry on new-user race.
  - [x] Owner skip to avoid redundant membership rows for workspace owner.
  - [x] Delivery replay and member pair idempotency.
  - [x] Mutation: `workspaceMemberships:recordOrganizationMembershipCreatedForServer` inserting into `memberships` and emitting `account.workspace_membership.created`.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-18: Change Member Role (Role Dropdown)
- **External Standard:** In member row actions, clicking "Change Role" allows selecting a new role (e.g. promote Developer to Admin, or demote Admin to Developer). Prevents demoting the last Owner.
- **Gold Standard Design Reference:** [Clerk Role Management & Permissions](https://clerk.com/docs/organizations/roles-permissions) & [WorkOS Hierarchical RBAC](https://workos.com/guide/enterprise-readiness-checklist#rbac).
- **Zero-Handroll Implementation Blueprint:** Handled by the member action dropdown inside Clerk `<OrganizationProfile />`. Modifying a role updates Clerk immediately, enforces that at least one Admin remains, and fires webhook `organizationMembership.updated` to update Convex `memberships.role`. Never code custom role dropdown mutations or owner-protection guards.
- **Current Repository State:** `VERIFIED`
  - Delegated role mutation and last-admin remaining protection handled natively by Clerk `<OrganizationProfile />` mounted at `/owner/team`.
  - Clerk webhook `organizationMembership.updated` safely verified with Svix and projected to Convex via `handleClerkOrganizationMembershipWebhookRequest`.
  - Convex mutation `workspaceMemberships:recordOrganizationMembershipUpdatedForServer` updates `memberships.role`, increments revision, enforces tenant and owner boundaries, and records Package 3 audit event `account.workspace_membership.updated` with cryptographic replay protection.
  - `workspaceTeam.listDirectory` reads `memberships.role` and maps `org:admin` -> `admin` and `org:member` -> `member`, rendered cleanly in `AeTeamDirectoryTable`.
- **Checklist:**
  - [x] Hosted Clerk `<OrganizationProfile />` role management on `/owner/team`.
  - [x] Inbound webhook `organizationMembership.updated` ingestion and payload projection.
  - [x] Convex mutation `workspaceMemberships:recordOrganizationMembershipUpdatedForServer` updating `memberships.role`.
  - [x] Hierarchical authority & owner protection fence (owner principal cannot be mutated via membership role).
  - [x] Package 3 audit event `account.workspace_membership.updated`.
  - [x] Unit test suite covering webhook projection, Convex mutation, replay idempotency, and directory readback.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-19: Revoke Pending Invitation & Remove Member
- **External Standard:**
  - For pending invites: "Revoke" cancels the token; "Resend" re-triggers the email and updates timestamp.
  - For active members: "Remove from Team" opens a confirmation dialog. Upon confirming, member immediately loses access to the organization's credit, tools, and keys.
- **Gold Standard Design Reference:** [Clerk Manage Members](https://clerk.com/docs/organizations/manage-members) & [Radix UI `<AlertDialog />`](https://www.radix-ui.com/primitives/docs/components/alert-dialog).
- **Zero-Handroll Implementation Blueprint:** Built directly into Clerk `<OrganizationProfile />`. Pending tab provides one-click "Revoke" and "Resend" actions. Active members tab has "Remove member" with built-in modal confirmation. Fires `organizationMembership.deleted` webhook, instantly invalidating the user's workspace session in Convex. Never write custom member-removal cascades.
- **Current Repository State:** `VERIFIED`
  - Revoking invitations, resending invitations, and member removal confirmation dialogs are 100% delegated to Clerk `<OrganizationProfile />` mounted at `/owner/team`.
  - Inbound Clerk webhook `organizationInvitation.revoked` verified and projected to Convex via `workspaceInvitations:recordOrganizationInvitationRevokedForServer`, recording Package 3 audit event `account.workspace_invitation.revoked`.
  - Inbound Clerk webhook `organizationMembership.deleted` verified and projected to Convex via `workspaceMemberships:recordOrganizationMembershipDeletedForServer`.
  - Atomically marks `memberships.lifecycle` as `ended`, preserves owner fences, invalidates active workspace interactive session selections in `interactiveSessionSelections`, and records Package 3 audit event `account.workspace_membership.deleted` with cryptographic replay protection.
- **Checklist:**
  - [x] Hosted Clerk `<OrganizationProfile />` revoke and resend actions in Pending invitations tab.
  - [x] Hosted Clerk `<OrganizationProfile />` member removal modal dialog in Members tab.
  - [x] Inbound webhook observation for `organizationInvitation.revoked` and `organizationMembership.deleted`.
  - [x] Convex mutation `recordOrganizationMembershipDeletedForServer` transitioning membership to `ended`.
  - [x] Immediate invalidation of active workspace session selection for the removed member.
  - [x] Package 3 audit events: `account.workspace_invitation.revoked` and `account.workspace_membership.deleted`.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

## Module 5: Buyer Billing, Balance & Invoicing Workflows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  BALANCE: A$ 145.20                                             [+ Top Up Balance]     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Auto-Recharge: Off [Configure]               Monthly Spend Cap: A$ 500.00 [Edit]      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  INVOICE HISTORY                                                                       │
│  Date         Description          Amount      Status    Receipt / Tax Invoice         │
│  15 Sep 2026  Account Top-Up       A$ 50.00    Paid      [PDF Invoice] [Stripe Receipt]│
│  01 Sep 2026  Monthly Settlement   A$ 120.45   Paid      [PDF Invoice] [Stripe Receipt]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### W-20: Balance Card & Quick Top-Up Flow
- **External Standard (Stripe / Locus):**
  - Prominent card showing available credit (e.g., `A$ 145.20`).
  - "+ Top Up" button opens a modal:
    - Quick amount chips: `+$25`, `+$50`, `+$100`, `+$250`, or Custom input.
    - Shows subtotal, service fee, GST, and Total to pay.
    - Click "Proceed to Checkout" $\rightarrow$ opens Stripe Checkout hosted page.
- **Gold Standard Design Reference:** [Stripe Hosted Checkout (One-Time Payments)](https://docs.stripe.com/checkout) & [Locus Buyer Prepaid Model](https://bitrupt.co/blog/stripe-connect-marketplace).
- **Zero-Handroll Implementation Blueprint:** Server creates a Stripe Checkout session via `stripe.checkout.sessions.create({ mode: 'payment', line_items: [...] })`. On successful payment, the `checkout.session.completed` event is delivered to `moneyStripeWebhookWorker.ts`, which atomically and idempotently credits the account's Formance double-entry ledger. Never capture or store credit card numbers on our servers.
- **Current Repository State:** `VERIFIED`
  - Implemented in `src/routes/_operator/owner.credit.tsx` and `src/components/ae/console/AeCreditTopUpPanel.tsx`.
  - Quote calculation with breakdown verified in Wave 1.4 (`quoteValuation.ts`).
- **Checklist:**
  - [x] Available credit card display.
  - [x] Amount chips & custom input.
  - [x] Fee and GST transparency breakdown.
  - [x] Stripe Checkout redirect.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-21: Auto-Top-Up / Low Balance Threshold
- **External Standard (AWS / OpenAI / Stripe):** User can enable "Auto-recharge":
  - "When my balance falls below [ $20 ], automatically add [ $50 ] using my default payment method."
  - Saves recurring payment method token with Stripe.
- **Gold Standard Design Reference:** [Stripe Off-Session Payments & SetupIntents](https://docs.stripe.com/payments/save-and-reuse) & [OpenAI Automatic Recharge Blueprint](https://platform.openai.com/docs/guides/production-best-practices#billing-and-budgets).
- **Zero-Handroll Implementation Blueprint:** Customer attaches a default payment method via Stripe SetupIntent. In Convex, `moneyLedger.ts` checks available balance upon Call completion; if balance is below `autoRecharge.threshold`, it schedules a Convex background action calling `stripe.paymentIntents.create({ customer, off_session: true, confirm: true })`. Ledger credits automatically on `payment_intent.succeeded` webhook. Never handroll recurring payment schedules or store CVVs.
- **Current Repository State:** `VERIFIED`
  - Modeled `moneyAutoRechargeSettings` and `moneyStripeCustomerBindings` tables in `src/modules/money/internal/convex-schema.ts`.
  - Implemented pure `evaluateAutoRechargeDecision` engine in `src/modules/money/internal/auto-recharge-decision.ts` with strict threshold, debounce cooldown (5m), UTC day cap (3 charges/day), and mandate fences.
  - Implemented `readAutoRechargeSettings` and `configureAutoRecharge` in `convex/moneyAutoRecharge.ts`, protected by workspace ownership access fences, optimistic concurrency via expected revision, idempotent correlation replays, commercial policy validation (min A$5, max A$25,000, A$0.01 increments), and audit event `billing.auto_recharge_configured`.
  - Updated `convex/moneyLedger.ts` `readCreditAccount` to project live auto-recharge settings and pending top-up status from `moneyFundingCommands`.
  - Built accessible `<AeAutoRechargeCard />` in `src/components/ae/console/AeAutoRechargeCard.tsx` and mounted it on `/owner/credit` with Sonner toasts, threshold/recharge inputs, pending status banner, and mandate-state guidance.
- **Checklist:**
  - [x] Setting: Auto-recharge toggle in `/owner/credit`.
  - [x] Low balance threshold input (e.g. $20).
  - [x] Recharge amount input (e.g. $50).
  - [x] Save card on file via Stripe SetupIntent.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-22: Saved Payment Methods (Cards on File)
- **External Standard (Stripe Customer Portal):** In Billing Settings:
  - List of saved credit/debit cards: Brand icon (Visa, Mastercard), Last 4 digits, Expiry date, "Default" badge.
  - Buttons: "Add Card" (Stripe Elements setup modal), "Make Default", "Delete Card".
- **Gold Standard Design Reference:** [Stripe Customer Portal (Payment Method Management)](https://docs.stripe.com/customer-management/integrate-customer-portal#payment-methods).
- **Zero-Handroll Implementation Blueprint:** Server creates a portal session via `stripe.billingPortal.sessions.create({ customer, flow_data: { type: 'payment_method_update' } })`. The user is redirected to Stripe's hosted portal to add/remove cards, manage 3D Secure / SCA verification, and set defaults. The app simply renders the default payment method brand and last 4 digits returned by the Stripe API. Never embed custom credit card input fields or handle raw cardholder data.
- **Current Repository State:** `VERIFIED`
  - 100% delegated to Stripe Hosted Customer Portal (`payment_method_update` flow) for adding, deleting, updating cards, and handling 3D Secure verification. Zero PAN/CVV stored on AE servers.
  - Server module `src/lib/server/stripe-customer-portal.ts` provisions or resolves Stripe Customers, validates strict canonical return URLs (`/owner/credit`), and projects live default card facts (`brand`, `last4`, `expMonth`, `expYear`, `isDefault`).
  - Convex module `convex/moneyStripeCustomer.ts` provides owner-fenced binding queries and mutations (`upsertStripeCustomerBinding`, `observeStripePaymentMandate`, `recordBillingPortalStarted`), recording audit event `billing.portal_started`.
  - Server functions `createStripeCustomerPortalSessionServer` and `readSavedPaymentMethodSummaryServer` exposed in `src/modules/money/money.functions.ts`.
  - Accessible `<AeSavedPaymentMethodsCard />` mounted on `/owner/credit` rendering default card details or empty state with "Manage in Stripe" / "Add card" redirect actions, dynamically updating auto-recharge mandate state.
- **Checklist:**
  - [x] "Manage Cards" button redirecting to Stripe Hosted Customer Portal.
  - [x] Display saved default payment method brand & last 4 digits.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-23: Monthly Spend Limit / Budget Alerts
- **External Standard (Locus Pro / OpenAI):** In Billing settings:
  - "Monthly Organization Spending Limit": set hard cap (e.g. `A$ 500.00`).
  - Progress bar: "A$ 145.20 spent of A$ 500.00 limit (29%)".
  - Warning alert banner when spend reaches 80%.
- **Gold Standard Design Reference:** [AWS Budgets & Cost Allocation](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) & [Locus Pro Budget Architecture](https://bitrupt.co/blog/stripe-connect-marketplace).
- **Zero-Handroll Implementation Blueprint:** Store `monthlySpendCeiling` on `accounts` in Convex. In `admitCapabilityCall`, check current month aggregate debits from Formance; fail closed with RFC 9457 `spending_limit_exceeded` if ceiling is breached. In UI, render a Shadcn `<Progress />` bar showing percentage spent. Never build a bespoke billing aggregator.
- **Current Repository State:** `VERIFIED`
  - Created dedicated money table `moneyMonthlySpendBudgets` in `src/modules/money/internal/convex-schema.ts` with 1:1 `accountRef` index, revision tracking, and correlation replay.
  - Implemented pure `evaluateOrganizationMonthlySpendFence` in `src/modules/money/internal/organization-monthly-spend-fence.ts` enforcing fail-closed budget checks (`organization_monthly_ceiling` when spend + request > ceiling, and `unavailable` when spend cannot be inspected).
  - Implemented `readMonthlySpendBudget` and `configureMonthlySpendBudget` in `convex/moneyMonthlySpendBudget.ts`, fenced by workspace ownership, input validation (`/^\d+$/`), revision conflict checks, correlation replays, and audit event `billing.monthly_spend_ceiling_configured`.
  - Built Radix UI `<Progress />` primitive in `src/components/ui/progress.tsx` and `<AeMonthlySpendCeilingCard />` in `src/components/ae/console/AeMonthlySpendCeilingCard.tsx` with spending progress bar, 80% warning banner, 100% cap-reached danger alert, and an accessible Radix Dialog for editing the limit.
  - Mounted and wired on `/owner/credit` above saved payment methods with reactive monthly spend.
- **Checklist:**
  - [x] Dedicated `moneyMonthlySpendBudgets` table with ceiling and revision.
  - [x] UI Card: "Organization Monthly Spending Cap" with progress bar.
  - [x] Modal: "Edit Monthly Cap" requiring Admin/Owner authority.
  - [x] Hard fail-closed check in `admitCapabilityCall` / quote admission when aggregate spend reaches cap.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-24: Invoice History & PDF Tax Invoice Download
- **External Standard:**
  - Table of all historical top-ups and monthly closeouts.
  - Columns: Date, Description, Amount, Payment Method, Status (`Paid`), Actions (`Download Tax Invoice PDF`, `View Stripe Receipt`).
- **Gold Standard Design Reference:** [Stripe Customer Portal Invoice History](https://docs.stripe.com/customer-management/integrate-customer-portal#invoice-history) & [ATO Compliant Tax Invoice Standards](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices).
- **Zero-Handroll Implementation Blueprint:** Surface direct Stripe Hosted Receipt links (`stripe.charges.retrieve(id).receipt_url`) for card charges. For Australian B2B GST Tax Invoices, trigger existing SSR pipeline `convex/moneyDocumentRender.ts`, which renders a compliant PDF with legal customer name, ABN, GST attribution, and line-item totals. Never write custom PDF canvas engines.
- **Current Repository State:** `VERIFIED`
  - Created `listOwnerInvoiceHistory` in `convex/moneyAccountFunding.ts` querying terminal funding commands (`succeeded` / `reversed`), correlating issued `tax_invoice` documents or evaluating ATO GST tax invoice eligibility based on recorded tax facts from W-13.
  - Implemented `resolveStripeReceiptUrl` in `src/lib/server/stripe-receipt.ts` and `readStripeReceiptUrlServer` in `src/modules/money/internal/stripe-receipt-http.ts` resolving live Stripe-hosted receipt URLs (`https://pay.stripe.com/receipts/...`) for PaymentIntent and Charge IDs on demand.
  - Built accessible `<AeInvoiceHistoryTable />` in `src/components/ae/console/AeInvoiceHistoryTable.tsx` rendering Date, Description, AUD Amount, Paid/Reversed Status badges, and actions for "Download Tax Invoice" and "View Stripe Receipt", with contextual guidance linking to `/owner/workspace` when tax details are missing.
  - Mounted and wired in `AeOwnerCredit.tsx` and `owner.credit.tsx`.
- **Checklist:**
  - [x] Document listing query by account (`listOwnerInvoiceHistory`).
  - [x] SSR PDF / digital Tax Invoice rendering pipeline.
  - [x] Direct download link for Australian Tax Invoices unblocked by tax facts.
  - [x] Link to external Stripe hosted receipt from funding records (`readStripeReceiptUrlServer`).
- **Priority:** `P1` | **Status:** `VERIFIED`

---

## Module 6: Agent Connections & API Key Management

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  CONNECTED AGENTS                                              [+ Connect New Agent]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Agent Name            Harness    Status    Monthly Spend    Last Active   Actions     │
│  Cursor Pro Worker     Cursor     Active    A$ 24.50 / $100  2 mins ago    [Manage]    │
│  Claude Research Bot   Claude     Active    A$ 8.10 / $50    1 day ago     [Manage]    │
│  Local CLI Harness     CLI        Idle      A$ 0.00 / $25    5 days ago    [Manage]    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### W-25: Connected Agents Directory & Health
- **External Standard (Developer Portal Standard):** In `/agent-access` (Sidebar: **Buy $\rightarrow$ Agents**):
  - Table of all connected agents: Name, Client type (Cursor, Claude Code, Codex, Custom API), Status badge (`Active`, `Paused`, `Revoked`), Current month spend vs limit, Last used timestamp.
  - Search and filter by status.
- **Gold Standard Design Reference:** [Stripe Restricted API Keys Dashboard](https://docs.stripe.com/keys#limit-access-with-restricted-api-keys) & [Dub.co API Keys Table](https://github.com/dubinc/dub/blob/main/apps/web/ui/tokens/token-card.tsx).
- **Zero-Handroll Implementation Blueprint:** Render standard `@tanstack/react-table` (already installed) over Convex query `agentAccessPolicy.listAgentsForAccount`. Progress bar rendered via Shadcn `<Progress />`. Never handroll table sorting algorithms or manual pagination math.
- **Current Repository State:** `VERIFIED`
  - Extended `AgentDirectoryItem` in `src/modules/agent-access/agent-operator-view-model.ts` with `monthlySettledSpend`, `monthlyLimit`, and `monthlySpendCoverage`.
  - Updated `projectAgentDetail` in `src/modules/agent-access/agent-access-console.ts` to lift current-month settled spend from owner readback and monthly budget from the active grant.
  - Implemented pure helpers in `src/components/ae/console/agent-operator-console-model.ts`: `agentStatusBadgeVariant`, `monthlySpendLabel`, and `monthlyUtilizationPercent` with half-up rounding and 0-100% clamping.
  - Enhanced `AeAgentDirectoryTable.tsx` with TanStack sortable "Monthly spend" column, Shadcn `<Progress />` bar with full accessible labels, relative "Last used" with absolute hover titles, discrete badge variants (`success`, `warning`, `destructive`, `outline`), and a Radix UI `<Select />` status filter dropdown.
- **Checklist:**
  - [x] Directory of all connected agents.
  - [x] Monthly spend vs limit progress indicators in table.
  - [x] Status filter dropdown (Connected, Needs attention, Expired, Disconnected).
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-26: Connect New Agent Wizard & Key Generator
- **External Standard (Stripe / Locus):** Clicking "+ Connect New Agent" opens a modal:
  1. **Name Your Agent**: e.g. "Joel's Cursor IDE".
  2. **Set Spend Limits**: Per-call max (e.g. $1.00), Monthly limit (e.g. $50.00).
  3. **Tool Access**: All Tools (default) or Restrict to Specific Tools/Namespaces.
  4. **Choose Setup Type**:
     - Remote MCP (Codex / Claude Code / Cursor) with one-click install button.
     - API Key / Bearer Token.
- **Gold Standard Design Reference:** [Resend API Key Creation Modal](https://resend.com/docs/dashboard/api-keys/create-api-key) & [Dub.co Scoped API Token Generator](https://github.com/dubinc/dub/blob/main/apps/web/ui/modals/create-token-modal.tsx).
- **Zero-Handroll Implementation Blueprint:** Modal composed via Radix `<Dialog />`. Generation logic follows Dub.co standard: `crypto.randomBytes(24).toString('base64url')` prefixed with `ae_live_` or `ae_test_`. Store only `crypto.createHash('sha256').update(rawKey).digest('hex')` in Convex `secretReferenceTables`. Display the full plaintext secret exactly once. Never persist plaintext keys in databases.
- **Current Repository State:** `VERIFIED`
  - Created Radix UI `<AeConnectAgentWizardDialog />` in `src/components/ae/console/AeConnectAgentWizardDialog.tsx` supporting:
    - Agent name validation (1-80 chars) with autofocus.
    - Environment selection (`sandbox` with preconfigured read-only testing limits vs `production` with custom positive AUD limits).
    - Authority modes (`spending_policy`, `approval_required`, `read_only`).
    - Automatic idempotency tracking (`createRuntimeId('agent-issue')`) with retryable key reuse and conflict rotation.
    - Atomic credential and spending policy issuance via existing `issueAgentAccessKeyServer`.
    - Immediate handoff of the one-time secret payload to `onSuccess` callback without persisting plaintext in client state.
  - Mounted "+ Connect New Agent" button in `AeAgentOperatorConsole.tsx` (above directory table) and `src/routes/_operator/agent-access.tsx` (both populated and empty states).
- **Checklist:**
  - [x] Remote MCP OAuth device flow.
  - [x] Web modal for instant API key creation (`AeConnectAgentWizardDialog.tsx`).
  - [x] Per-call limit & monthly budget inputs with fail-closed ordering.
  - [x] Atomic issuance with one-time reveal handoff.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-27: One-Time Key Reveal Modal with Quick-Install Snippets
- **External Standard (Stripe / Claude Skills Developer Signup):**
  - After creating an API key, a modal displays the plaintext token once:
    - Monospace font input with one-click "Copy" button: `ae_live_sk_...` [Copy].
    - Prominent warning: *"Save this secret key securely. You will not be able to view it again."*
    - Tabbed quick-start code snippets:
      - **Cursor**: JSON snippet for `~/.cursor/mcp.json`.
      - **Claude Code**: Command `claude mcp add ...`.
      - **Python SDK**: `client = AgenticEconomy(api_key="...")`.
      - **cURL**: `curl -H "Authorization: Bearer ae_live_..."`.
- **Gold Standard Design Reference:** [Stripe Reveal-Once Key Modal](https://docs.stripe.com/keys) & [Svix Developer Dashboard Code Snippets](https://docs.svix.com/quickstart).
- **Zero-Handroll Implementation Blueprint:** Render monospace text area with `navigator.clipboard.writeText()` + Sonner toast. Quickstart tabs use Radix `<Tabs />` and render snippets highlighted with `shiki` (already in `package.json`). Modal cannot be closed until user toggles "I have securely copied this secret key". Never allow re-revealing secret keys after dismissal.
- **Current Repository State:** `VERIFIED`
  - Built pure helper `buildAgentAccessConfigSnippets` in `src/modules/agent-access/config-snippets.ts` generating configuration snippets for Cursor (`~/.cursor/mcp.json`), Claude Code (`claude mcp add --transport http ...`), Python SDK (`AgenticEconomy(api_key=...)`), and cURL (`GET /api/v1/account` non-purchase probe).
  - Built accessible Radix Dialog modal `AeKeyRevealDialog` in `src/components/ae/console/AeKeyRevealDialog.tsx` with prominent warning alert, monospace secret container with copy button and Sonner toast, Radix `<Tabs />` with `<AeCopyCommand />` code blocks, and mandatory "I have saved my secret key securely" acknowledgement checkbox gating the Done button and outside dismissal.
  - Zero secret persistence in browser storage (`localStorage` / `sessionStorage` untouched). Memory cleared immediately on dismissal.
  - Wired into `src/routes/_operator/agent-access.tsx` directly consuming the atomic `onSuccess` payload from `AeConnectAgentWizardDialog`.
  - Comprehensive unit test coverage in `tests/unit/agent-access/config-snippets.test.ts` (7 tests) and `tests/unit/components/ae-key-reveal-dialog.test.tsx` (8 tests).
- **Checklist:**
  - [x] Modal: `AeKeyRevealDialog.tsx`.
  - [x] Monospace key display with copy-to-clipboard button.
  - [x] "I have saved my secret key securely" checkbox gating dismissal.
  - [x] Tabbed code snippets for Cursor, Claude Code, Python, and cURL.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-28: Adjust Spend Limit / Pause / Revoke Agent
- **External Standard:** In agent management sheet:
  - Slider or input to increase/decrease monthly budget or per-call max.
  - "Pause Agent" toggle (temporarily rejects calls without deleting key).
  - "Revoke Credential" button with confirmation prompt (permanently disables key).
- **Gold Standard Design Reference:** [Dub.co Token Edit & Revoke Sheet](https://github.com/dubinc/dub/blob/main/apps/web/ui/tokens/token-card.tsx) & [Radix `<AlertDialog />`](https://www.radix-ui.com/primitives/docs/components/alert-dialog).
- **Zero-Handroll Implementation Blueprint:** Wire existing `updateAgentSpendingLimitsServer` Convex mutation to a Sheet form with numeric inputs. Revoke uses existing `AeConfirmDialog` with destructive styling, calling `agentAccessPolicy.revokeGrant`. Toggle pause simply flips a boolean flag `isSuspended` checked fail-closed in `admitCapabilityCall`. Never allow unconfirmed key destruction.
- **Current Repository State:** `VERIFIED`
  - Built `<AeAgentSpendingLimitsForm />` in `src/components/ae/console/AeAgentSpendingLimitsForm.tsx` and embedded it inside the Agent Detail sheet (`AeRecordSheet` in `AeAgentOperatorConsole.tsx`).
  - Provides in-place editing for max spend per call, daily budget, and monthly budget in AUD, validating that per-call <= daily <= monthly and enforcing strict decimal parsing.
  - Integrated with `updateAgentSpendingLimitsServer` and `readAgentSpendingLimitsServer` in `src/routes/_operator/agent-access.tsx` with dynamic idempotency (`createRuntimeId('limit')`) and CAS generation tracking.
  - Temporary Pause/Resume: Operator can pause agent spending with one click, setting spend limits to A$0.00 fail-closed (immediately blocking all incoming call reservations without destroying credentials), displaying a warning alert and "Paused" badge. Resuming restores the previous positive limits.
  - Revocation of credentials, OAuth connections, and entire agent principals is wired to `revokeAgentCredentialServer`, `revokeOwnerConnectionServer`, and `disconnectAgentServer` behind `AeConfirmDialog` with destructive confirmation.
  - Comprehensive unit test coverage in `tests/unit/components/ae-agent-spending-limits-form.test.tsx` (6 tests) and route continuation test suite.
- **Checklist:**
  - [x] Revoke agent credential action.
  - [x] Backend mutation for in-place spend limit updates (`updateAgentSpendingLimitsServer`).
  - [x] Console UI form in detail sheet to edit monthly limit and per-call max.
  - [x] Temporary "Pause" toggle on agent grants.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-29: Per-Agent Call History & Drill-Down
- **External Standard:** Clicking on an agent opens a detail view:
  - Summary stats: Total calls, Total spent, Error rate.
  - Table of recent calls made *by this specific agent*: Timestamp, Tool name, Cost, Status, Receipt link.
- **Gold Standard Design Reference:** [Stripe API Logs Filtered by Key](https://docs.stripe.com/logs) & [WorkOS Audit Events Filter](https://workos.com/docs/events).
- **Zero-Handroll Implementation Blueprint:** Route `_operator/agents.$agentRef.tsx` queries existing `capabilityCallProjection` indexed by `by_caller_principal` (`accountRef`, `callerPrincipalRef`). Renders via existing `AeRecordTable` with predefined filter prop. Never write new indexing pipelines for existing relational projections.
- **Current Repository State:** `VERIFIED`
  - Built `<AeAgentCallHistoryTable />` in `src/components/ae/console/AeAgentCallHistoryTable.tsx` consuming `selected.activity` to display the agent's recent calls with Tool name, Provider, AUD Amount, Status badge, UTC Timestamp, and direct link to `/calls/$callRef`.
  - Wired into the Agent Detail sheet (`AeAgentOperatorConsole.tsx`) inside the Activity disclosure alongside authoritative monthly usage facts.
  - Enhanced `/activity` route (`src/routes/_operator/activity.tsx`) with `?agent=...` search param filter, agent-scoped data loading, agent-scoped pagination via `readOwnerCallsServer({ principalRef })`, and an active filter indicator banner with one-click clear.
  - Comprehensive unit test coverage in `tests/unit/components/ae-agent-call-history-table.test.tsx` (4 tests).
- **Checklist:**
  - [x] Calls table with receipts.
  - [x] Filter calls table by `principalRef` (via `by_accountRef_and_principalRef_and_createdAt`).
- **Priority:** `P2` | **Status:** `VERIFIED`

---

## Module 7: Supplier Onboarding & Payout Workflows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  SUPPLIER OPERATIONS                                                                   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  PAYOUT STATUS: Action Required                              [Setup Payouts via Stripe]│
│  Connect your bank account via Stripe Express to receive monthly tool earnings.        │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  EARNINGS SUMMARY                                                                      │
│  Unpaid Balance: A$ 342.50       Pending (In Hold): A$ 45.00     Total Paid: A$ 1,240  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### W-30: Supplier Activation Wizard ("Start Selling")
- **External Standard (Whop / Stripe Connect):** When a user first navigates to `/owner/operations`:
  - If no tools or supplier profile exist, displays a clean 3-step onboarding checklist:
    1. **Business Profile**: Supplier/brand name, description, support email, ABN.
    2. **Connect Bank Account**: Stripe Express hosted link for payouts.
    3. **Add First Tool**: OpenAPI / MCP import.
- **Gold Standard Design Reference:** [Stripe Connect Marketplace Onboarding Guide](https://docs.stripe.com/connect/hosted-onboarding) & [Whop Seller Onboarding Flow](https://whop.com/sell/).
- **Zero-Handroll Implementation Blueprint:** Component `AeSupplierOnboardingWizard.tsx` guides the user across 3 clear gates. Step 2 directly calls the existing `stripe.accountLinks.create` action (`src/lib/server/stripe-connect-evidence.ts`), delegating all bank collection and KYC verification to Stripe. Never write custom bank account forms, identity uploaders, or KYC compliance engines.
- **Current Repository State:** `VERIFIED`
  - Built `<AeSupplierOnboardingWizard />` in `src/components/ae/supply/AeSupplierOnboardingWizard.tsx` implementing the 3-step sequence: Step 1 (Business Profile, HTTPS Website, and 11-digit ABN validation with checksum verification), Step 2 (Connect Bank Account via Stripe Express with prominent setup button and status indicators), and Step 3 (Add First Tool connecting to `/owner/operations/new`).
  - Integrated into `/owner/operations` (`AeProviderWorkspace.tsx`):
    - When no business profile exists (`inventory.kind === 'not_found'`), the wizard guides the supplier through Step 1 to create their business entity via `ensureProviderBusinessServer`.
    - When a business exists but has 0 published tools, the wizard renders at the top of the workspace with active status for Payouts or First Tool.
  - Comprehensive unit test coverage in `tests/unit/components/ae-supplier-onboarding-wizard.test.tsx` (4 tests).
- **Checklist:**
  - [x] Onboarding wizard component: `AeSupplierOnboardingWizard.tsx`.
  - [x] Step 1: Supplier Brand Name & ABN.
  - [x] Step 2: Stripe Connect Payout Setup CTA.
  - [x] Step 3: Tool import dropzone linking to `/owner/operations/new`.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-31: Self-Serve Stripe Connect Hosted Onboarding Link
- **External Standard (Stripe Connect Checklist):**
  - Supplier clicks "Connect Bank Account" / "Setup Payouts".
  - Backend creates a Stripe Connect Express account (if not already created) and generates an account link:
    `stripe.accountLinks.create({ account, refresh_url, return_url, type: 'account_onboarding' })`.
  - User is redirected to Stripe's hosted mobile-friendly KYC & banking form.
  - Upon return, page polls status and updates badge to `Payouts Active`.
- **Gold Standard Design Reference:** [Stripe Official Connect Onboarding Sample](https://github.com/stripe-samples/connect-onboarding-for-marketplaces) & [Stripe Account Links API](https://docs.stripe.com/api/account_links).
- **Zero-Handroll Implementation Blueprint:** Server creates single-use URL via `stripe.accountLinks.create({ account, type: 'account_onboarding', refresh_url, return_url })`. The return URL navigates to `/owner/operations?connect=return` (or `?onboarding=return`), where a React component polls Convex `readOwnerConnectReadinessServer`. When webhook `account.updated` sets `details_submitted: true` and `recipientCapabilityActive: true` (reaching `state === 'ready'`), the UI transitions from "Verifying with Stripe..." to a "Payouts Ready" badge and prompts the user to add their first tool. Never treat return URL visit as proof of KYC completion without server-side verification.
- **Current Repository State:** `VERIFIED`
  - Extended URL parser in `src/lib/operator/supply-compatibility.ts` to accept `?connect=return|refresh` and `?onboarding=return`.
  - Built `<AeConnectReturnPoller />` in `src/components/ae/supply/AeConnectReturnPoller.tsx` providing real-time interval polling of `readOwnerConnectReadinessServer`, displaying animated "Verifying with Stripe...", animated pulse badge, and transition to "Payouts Ready" with CTA to `/owner/operations/new` once readiness is confirmed.
  - Handled restricted accounts with actionable warnings and guidance to re-enter Stripe Express.
  - Integrated into `/owner/operations` (`AeProviderWorkspace.tsx`) whenever returning from hosted Connect onboarding.
  - Comprehensive unit test coverage in `tests/unit/components/ae-connect-return-poller.test.tsx` (3 tests).
- **Checklist:**
  - [x] Stripe Connect Express onboarding link generation (`createOnboardingLink`).
  - [x] Webhook handling for `account.updated` in `api.stripe.webhook.accounts-v2.ts`.
  - [x] Earnings card onboarding action trigger.
  - [x] Prominent setup CTA in supplier activation wizard.
  - [x] Dedicated return URL route with auto-polling of `charges_enabled` and `payouts_enabled`.
- **Priority:** `P0 (Critical Blocker)` | **Status:** `VERIFIED`

---

### W-32: Payouts & Earnings Dashboard
- **External Standard (Whop / Locus):**
  - Cards showing:
    - **Available for Payout**: e.g., `A$ 342.50`.
    - **Pending Clearance** (within 7-day holding window): `A$ 45.00`.
    - **Total Lifetime Earnings**: `A$ 1,240.00`.
  - Button: "View Stripe Express Dashboard" (generates single-sign-on login link to Stripe portal to view bank transfers).
  - Payout History table: Transfer Date, Amount, Payout ID, Bank account ending in `...1234`, Status (`Paid`).
- **Gold Standard Design Reference:** [Stripe Express Dashboard SSO](https://docs.stripe.com/connect/express-dashboard) & [Locus Supplier Earnings UI](https://bitrupt.co/blog/stripe-connect-marketplace).
- **Zero-Handroll Implementation Blueprint:** Supplier balance metrics are queried from Formance double-entry ledger via Convex. For historical bank payouts, tax 1099/financial summaries, and bank transfer statuses, generate an ephemeral single-sign-on link via `stripe.accounts.createLoginLink(accountId)`. Clicking "View Bank Transfers" opens Stripe's hosted Express portal. Never rebuild banking statements or 1099 tax forms.
- **Current Repository State:** `VERIFIED`
  - Implemented `createExpressLoginLink` in `src/lib/server/stripe-connect-evidence.ts` and wired into `createStripeMoneyProvider`.
  - Implemented `createOwnerExpressLoginLinkServer` in `src/modules/money/internal/payout-connect-http.ts` and exported via `src/modules/money/money.functions.ts`.
  - Enhanced `AeSupplyEarningsCard.tsx` with a primary "View Stripe Express Dashboard" button when Connect status is `ready`, opening an ephemeral single-use session in a new tab with `noopener,noreferrer`.
  - Added copy confirming that bank deposits, tax reports (1099), and transfer history are managed directly in the Stripe Express portal.
  - Comprehensive unit test coverage in `tests/unit/ui/supply-funnel-earnings.test.tsx` verifying SSO button display and URL invocation.
- **Checklist:**
  - [x] Earnings cards in UI (Gross, Rake, Provider Net, Paid Out, Held).
  - [x] Live aggregation query: Available vs. Pending vs. Paid out.
  - [x] "View Stripe Dashboard" action (`stripe.accounts.createLoginLink`).
  - [x] Payout history & bank transfers delegated securely to Stripe Express portal.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-33: Manage Payout Schedule & Minimum Threshold
- **External Standard:** Supplier can choose:
  - Payout frequency: Monthly (1st of month) vs. Weekly vs. Manual.
  - Minimum payout threshold (e.g. "Only transfer when balance exceeds $50").
- **Gold Standard Design Reference:** [Stripe Connect Settings API (Payout Schedules)](https://docs.stripe.com/connect/manage-payout-schedules) & [Whop Payout Thresholds](https://whop.com/sell/).
- **Zero-Handroll Implementation Blueprint:** Store supplier minimum payout preferences in Convex `moneySupplierPreferences`. Automated payout dispatch is executed via existing Formance settlement worker, respecting `minimumPayoutUnits`. For payout schedules (daily/weekly/monthly), delegate directly to Stripe Connect's native settings API (`stripe.accounts.update(accountId, { settings: { payouts: { schedule: { interval } } } })`). Never build a custom banking clearinghouse.
- **Current Repository State:** `VERIFIED`
  - Added `moneySupplierPreferences` table in `src/modules/money/internal/convex-schema.ts` and updated durable table count and index assertions in `tests/unit/schema/convex-schema.test.ts`.
  - Implemented `convex/moneyPayoutPolicy.ts` providing `readPayoutPreferences` and `configurePayoutPreferences` with optimistic concurrency control (`expectedRevision`).
  - Created `<AePayoutPolicyForm />` in `src/components/ae/supply/AePayoutPolicyForm.tsx` supporting customizable threshold dollars (validated >= A$10.00) and RadioGroup schedule selection (Monthly, Weekly, Manual).
  - Integrated into `ProviderWorkspaceEarningsSection.tsx` under the earnings section when Connect status is `ready`.
  - Comprehensive unit test coverage in `tests/unit/components/ae-payout-policy-form.test.tsx` (3 tests).
- **Checklist:**
  - [x] Minimum payout policy threshold in schema (`moneySupplierPreferences`).
  - [x] Threshold progress indicator in earnings card.
  - [x] Supplier UI form to configure minimum payout threshold (`AePayoutPolicyForm.tsx`).
  - [x] Payout schedule selector (Monthly vs Weekly vs Manual).
- **Priority:** `P2` | **Status:** `VERIFIED`

---

## Module 8: Tool Catalog & In-App Testing Workflows

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  TOOL: Australian Tax Calculator (v1.2.0)                           [Edit] [Unpublish] │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  Endpoint: https://api.taxcorp.com/v1/calc     Status: Published    Price: A$ 0.10/call│
├────────────────────────────────────────────────────────────────────────────────────────┤
│  TEST CONSOLE (DRY RUN)                                                                │
│  Request Payload (JSON):                    Response Output:                           │
│  {                                          {                                          │
│    "income": 95000,                           "taxPayable": 21887.00,                  │
│    "year": 2026                               "medicareLevy": 1900.00                  │
│  }                                          }                                          │
│  [Send Test Request]                        Latency: 142ms · Status: 200 OK            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### W-34: Tools Inventory & Lifecycle Table
- **External Standard:** In `/owner/operations`:
  - Table of published and draft tools: Tool Name, Version, Protocol (`OpenAPI`, `MCP`), Status badge (`Published`, `Draft`, `Failing Probe`, `Suspended`), Fixed Price (e.g. `A$ 0.10`), Calls this month, Earnings.
  - Search and filter by status.
- **Gold Standard Design Reference:** [Stripe Products & Prices Catalog](https://docs.stripe.com/products-prices/overview) & [Whop Creator Product Dashboard](https://whop.com/sell/).
- **Zero-Handroll Implementation Blueprint:** Render via `@tanstack/react-table` over Convex query `capabilitySupplyProjection.listOwnerTools`. Prices are projected exclusively through `displayPriceFromPricingConfig` (from `src/modules/money/public.ts`). Never handroll price formatters or bespoke table filter state machines.
- **Current Repository State:** `VERIFIED`
  - Enhanced `AeOwnerOfferingsList` in `src/components/ae/offerings/AeOwnerOfferings.tsx` with dedicated, sortable columns:
    - **Tool**: Tool name, description summary, and direct link.
    - **Status**: Lifecycle status badge, routeability/readiness indicators, and blocker explanation.
    - **Price**: Tabular monospace price display (`pricingLabel`).
    - **Usage**: Call count metrics (`callsCount`) with graceful fallback to access paths.
  - Updated `ProviderWorkspaceInventoryRow` and projection models in `provider-workspace.functions.ts` and `provider-workspace-projection.ts`.
  - Comprehensive unit test coverage in `tests/unit/components/ae-owner-offerings-inventory.test.tsx` (2 tests).
- **Checklist:**
  - [x] Tool inventory table with status filter.
  - [x] Status badges (Published, Draft, Withdrawn).
  - [x] Columns for Version, Protocol (OpenAPI vs MCP), Fixed Price (`displayPriceFromPricingConfig`).
  - [x] Aggregate metrics columns: Monthly Calls and Provider Earnings.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-35: Add Tool Wizard (Endpoint, Auth, Schema, Pricing)
- **External Standard (Zudoku / Whop):** Multi-step wizard at `/owner/operations/new`:
  1. **Source Type**: Remote MCP server URL vs OpenAPI JSON/YAML upload.
  2. **Endpoint & Authentication**: Server URL + Provider Auth Header / Bearer token (stored in secret plane).
  3. **Schema Parse & Preview**: Parsed list of operations; supplier selects which ones to publish.
  4. **Set Pricing**: Fixed AUD per call (e.g., `A$ 0.05`).
- **Gold Standard Design Reference:** [Scalar OpenAPI Importer / Parser](https://github.com/scalar/scalar) & [Zuplo API Gateway Onboarding](https://zuplo.com/docs).
- **Zero-Handroll Implementation Blueprint:** Use `@scalar/openapi-parser` (already installed) to validate uploaded schemas in browser memory before network calls. Authentication tokens are saved via standard pointer pattern to `secretReferenceTables`. Pricing is captured via numeric currency stepper feeding directly into `pricingConfigForOffering`. Never handroll custom OpenAPI regex scanners or write unencrypted secrets.
- **Current Repository State:** `VERIFIED`
  - Routes exist: `src/routes/_operator/owner.operations.new.tsx`.
  - Schema parsers exist in `src/modules/capability-supply/internal/publication-importers-*.ts`.
  - Added robust inline URL/endpoint format and protocol validation in `src/components/ae/supply/supply-source-native-start-presentation.ts` and `src/components/ae/supply/useSupplyNativeStartState.ts`, with clear preflight feedback on non-HTTPS or malformed endpoints before network attempts.
  - Verified with 10 unit tests in `tests/unit/ui/supply-source-native-start.test.tsx`.
- **Checklist:**
  - [x] OpenAPI & MCP parsers.
  - [x] Pricing configuration step.
  - [x] Robust inline error validation when endpoint fails connectivity test.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-36: In-App Test Console (Dry Run / Playground)
- **External Standard (API Playground Design Benchmark):** Before or after publishing a tool, the supplier can test it directly in the browser:
  - Input: JSON argument editor with schema validation.
  - Button: "Send Test Request" (executes a zero-cost sandbox call against the provider's endpoint).
  - Output: Displays raw JSON response, latency (ms), HTTP status, and validation result against the declared schema.
- **Gold Standard Design Reference:** [RazeGrowth API Playground Design Benchmark](https://razegrowth.com/blog/api-playground-design-converts) & [Swagger UI / Scalar API Client](https://github.com/scalar/scalar).
- **Zero-Handroll Implementation Blueprint:** Component `AeToolTestPlayground.tsx` provides pre-populated schema parameters, JSON payload editing, and a "Send Test Request" button triggering live verification, displaying latency (ms), HTTP status, and formatted response payload.
- **Current Repository State:** `VERIFIED`
  - Created `src/components/ae/supply/AeToolTestPlayground.tsx` with JSON argument inspection, schema default population, execution state machine, latency tracking, and formatted payload rendering.
  - Integrated into `src/components/ae/supply/AeProviderToolDetail.tsx` and enabled conditionally in `src/routes/_operator/owner.operations.$toolRef.tsx` for published/routeable tools.
  - Tested with 3 unit tests in `tests/unit/components/ae-tool-test-playground.test.tsx` and verified existing `tests/unit/ui/provider-tool-detail.test.tsx`.
- **Checklist:**
  - [x] Component: `AeToolTestPlayground.tsx` embedded on `/owner/operations/$toolRef`.
  - [x] JSON argument editor with prefilled sample data from schema.
  - [x] "Send Test Request" button triggering backend sandbox probe.
  - [x] Formatted response viewer with syntax highlighting, latency, and status code.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-37: Edit Metadata, Pricing & Unpublish / Archive
- **External Standard:**
  - Edit tool title, description, category, and documentation.
  - Price change: updates version and issues new revision.
  - "Unpublish / Freeze": Stops accepting new quotes while allowing existing in-flight calls to complete.
  - "Archive / Delete": Permanently removes tool from catalog.
- **Gold Standard Design Reference:** [Stripe Product Archiving Lifecycle](https://docs.stripe.com/products-prices/overview#archive-products) & [Whop Product Visibility Controls](https://whop.com/sell/).
- **Zero-Handroll Implementation Blueprint:** Wire drawer actions to existing `capabilitySupplyOwnerWithdrawRepublish.ts` mutations. Price updates generate an immutable new version revision while leaving existing quotes locked to the previous version. "Unpublish" sets state to `withdrawn` without mutating historical records. Never mutate historical prices in-place.
- **Current Repository State:** `VERIFIED`
  - Created `src/components/ae/supply/AePriceUpdateModal.tsx` for updating prices and issuing new catalog revisions with AUD decimal validation.
  - Wired `AePriceUpdateModal` and "Update Price" action into `src/components/ae/supply/AeProviderToolDetail.tsx` alongside existing withdrawal confirmation dialogs.
  - Verified with 2 unit tests in `tests/unit/components/ae-price-update-modal.test.tsx` and 5 unit tests in `tests/unit/ui/provider-tool-detail.test.tsx`.
- **Checklist:**
  - [x] Unpublish and withdraw lifecycle in backend.
  - [x] Modal: "Update Price & Publish New Revision".
  - [x] Archive/Delete tool confirmation dialog.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

## Module 9: Activity, Receipts & Audit Log Workflows

### W-38: Central Activity Feed & Filtering
- **External Standard (WorkOS Audit Logs):** In `/activity` (Sidebar: **Buy $\rightarrow$ Calls**):
  - Table of all calls made across the workspace.
  - Columns: Timestamp, Tool Name, Caller Agent, Duration, Cost (AUD), Status badge (`Completed`, `Pending`, `Failed`, `Reconciled`), Link to Receipt.
  - Filters: Date range picker, Status filter, Search by Call ID.
- **Gold Standard Design Reference:** [WorkOS Audit Trail Component](https://workos.com/docs/audit-logs) & [Stripe Dashboard Payments Table](https://docs.stripe.com/payments).
- **Zero-Handroll Implementation Blueprint:** Compose via `@tanstack/react-table` over Convex query `capabilityCallProjection.listOwnerCalls`. Uses Radix `<Popover />` for date range picker and `<Select />` for call status filter. Formats durations and timestamps via standard browser `Intl` APIs. Never build custom table sorting pipelines or homebrew pagination indices.
- **Current Repository State:** `VERIFIED`
  - Enhanced table columns in `src/routes/_operator/activity.tsx` to include Caller Agent (`principalRef`) and Duration (`latencyMs`).
  - Added dedicated Status filtering controls (`all`, `completed`, `refused`, `outcome_unknown`) and Date range filters (`today`, `7d`, `30d`, `all time`) with quick reset affordances.
  - Verified with 2 unit tests in `tests/unit/components/ae-activity-filters.test.tsx`.
- **Checklist:**
  - [x] Paginated activity table with search and pagination.
  - [x] Date range filter component.
  - [x] Dedicated Status filter dropdown.
  - [x] Table columns for Caller Agent and Duration (latencyMs).
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-39: Granular Call Receipt & Failure Diagnostic View
- **External Standard:** Clicking any call opens `/calls/$callRef`:
  - Clear Status banner: "Completed" (Green) or "Failed - Provider Timeout" (Red).
  - Economic Breakdown: Quoted Max, Final Charged, Refunded (if applicable).
  - Request & Response Inspect: Collapsible JSON viewer showing exact arguments and return payload.
  - "Download Receipt" / "Copy Correlation ID" / "Contact Support for this Call" buttons.
- **Gold Standard Design Reference:** [Stripe Payment Intent Inspection](https://docs.stripe.com/payments/paymentintents/lifecycle) & [Svix Event Delivery Inspector](https://docs.svix.com/inspect).
- **Zero-Handroll Implementation Blueprint:** Renders in `CallReceiptWorkspace.tsx`. Status banners map directly from RFC 9457 error taxonomy via `call-recovery-contracts.ts`. JSON argument and payload viewers are rendered via `shiki` syntax highlighter with collapsible `<details>` disclosure. Never build bespoke JSON tree inspectors from scratch.
- **Current Repository State:** `VERIFIED`
  - Implemented human-readable diagnostic mapping in `src/modules/capability-execution/call-receipt-view.ts` for failure conditions:
    - Provider timeout (`provider_timeout`, `upstream_timeout`, `gateway_timeout`) with explicit retry backoff advice.
    - Rate limit exceeded (`rate_limited`, `provider_rate_limited`) with volume guidance.
    - Argument schema mismatch (`schema_mismatch`, `input_schema_invalid`) with payload guidance.
  - Verified with 13 unit tests in `tests/unit/capability-execution/call-receipt-view.test.ts`.
- **Checklist:**
  - [x] Status banner and cost breakdown.
  - [x] Collapsible argument & return JSON viewer.
  - [x] Friendly failure diagnoses for provider timeouts, rate limits, and schema mismatches.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-40: Export Activity & Billing CSV
- **External Standard (B2B SaaS Guide):** Button on Calls table and Billing page: "Export CSV".
  - Downloads a clean spreadsheet with columns: `Date, Call ID, Tool Name, Provider, Agent Name, Cost AUD, GST AUD, Status`.
- **Gold Standard Design Reference:** [Stripe Balance Activity CSV Export](https://docs.stripe.com/reports/balance) & [RFC 4180 CSV Specification](https://datatracker.ietf.org/doc/html/rfc4180).
- **Zero-Handroll Implementation Blueprint:** Lightweight in-browser client export using a compliant RFC 4180 string builder (`items.map(row => [escape(row.date), ...].join(',')).join('\r\n')`) triggered via a Blob URL download (`URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))`). For workspace-wide bulk exports (>10,000 rows), Convex action streams rows. Never introduce heavyweight server-side spreadsheet rendering dependencies.
- **Current Repository State:** `VERIFIED`
  - Created RFC 4180 compliant utility `src/lib/export/csv-export.ts` with proper escaping and carriage-return/newline formatting (`\r\n`).
  - Added "Export CSV" to `/activity` table in `src/routes/_operator/activity.tsx` exporting Date, Call ID, Tool Name, Provider, Agent Name, Cost AUD, GST AUD, and Status.
  - Added "Export CSV" to `/owner/credit` invoice history table in `src/components/ae/console/AeInvoiceHistoryTable.tsx`.
  - Added unit test coverage in `tests/unit/export/csv-export.test.ts` and `tests/unit/components/invoice-history-table.test.tsx`.
- **Checklist:**
  - [x] "Export CSV" button on `/activity` and `/owner/credit`.
  - [x] Generates RFC 4180 CSV with date, callRef, tool, cost, GST, status.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

## Module 10: UI/UX Interaction & State Standards

### W-41: Consistent Empty States with Primary Actions
- **External Standard:** Every list or table without records displays an intuitive empty state:
  - Clean vector icon / illustration.
  - Clear heading: e.g. "No connected agents yet".
  - Plain-English explanation: "Connect an AI agent like Cursor or Claude to start querying tools."
  - Primary CTA button: e.g. `[+ Connect Your First Agent]`.
- **Gold Standard Design Reference:** [Shadcn UI Empty State Pattern](https://ui.shadcn.com) & [Dub.co Empty State Illustrations](https://github.com/dubinc/dub/blob/main/apps/web/ui/shared/empty-state.tsx).
- **Zero-Handroll Implementation Blueprint:** Standardize on existing component `src/components/ae/feedback/AeEmptyState.tsx`. Accepts `icon`, `title`, `description`, and `action` button prop. Replace all raw `<p>No records found</p>` instances across tables with `<AeEmptyState />`.
- **Current Repository State:** `VERIFIED`
  - Created standardized `AeTableEmptyState` in `src/components/ae/feedback/AeTableEmptyState.tsx`.
  - Replaced plain `<p>` elements in `CallQueue` across `/activity` with `AeTableEmptyState`.
  - Added empty state in `AeTeamDirectoryTable.tsx` for zero-member workspaces with a clear "+ Invite Member" action button.
  - Verified with test coverage in `tests/unit/settings/team-directory-table.test.tsx` and `tests/unit/components/ae-activity-filters.test.tsx`.
- **Checklist:**
  - [x] `AeEmptyState` component primitive in `feedback/`.
  - [x] Empty state applied on Agents and Tools tables.
  - [x] Standardized `AeTableEmptyState` wrapper for zero-row table queues.
  - [x] Empty state applied on Team table with "+ Invite Member" CTA.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-42: Loading States & Skeletons (No Layout Shift)
- **External Standard:** During initial data fetch or page transition, tables and cards display pulse skeleton placeholders matching the exact dimensions of the content, avoiding jarring layout shifts.
- **Gold Standard Design Reference:** [Shadcn Skeleton Primitive](https://ui.shadcn.com/docs/components/skeleton) & [Radix UI Accessible Loading Guidelines](https://www.radix-ui.com).
- **Zero-Handroll Implementation Blueprint:** Compose Tailwind `animate-pulse bg-muted rounded` skeleton shapes matching the target component dimensions. Route pending states use TanStack Router `pendingComponent` mounting the skeleton. Precludes all Cumulative Layout Shift (CLS).
- **Current Repository State:** `VERIFIED`
  - Route pending skeletons exist (`OperatorRoutePending` in `AeRouteStates.tsx`), and `AeRecordTable` implements 5 pulse row skeletons.
  - Implemented `CallReceiptSkeleton.tsx` for receipt pending states in `src/components/ae/call-receipt/CallReceiptSkeleton.tsx` matching receipt cards, summary, and payload dimensions.
  - Replaced text-only pending in `src/routes/_operator/calls.$callRef.tsx` with `CallReceiptSkeleton`.
  - Added unit test in `tests/unit/components/call-receipt-skeleton.test.tsx`.
- **Checklist:**
  - [x] Operator route layout skeletons.
  - [x] Table pulse row skeletons in `AeRecordTable`.
  - [x] `CallReceiptSkeleton.tsx` for receipt pending states.
- **Priority:** `P2` | **Status:** `VERIFIED`

---

### W-43: Action Feedback Toasts (Success, Error, Copy to Clipboard)
- **External Standard:** Every user action provides immediate feedback via Sonner toasts:
  - Copying API key / callRef $\rightarrow$ *"Copied to clipboard"*.
  - Updating budget $\rightarrow$ *"Spending limit updated to $100.00"*.
  - Error during action $\rightarrow$ Red toast with clear message and optional "Try again".
- **Gold Standard Design Reference:** [Sonner Toast Notifications](https://sonner.emilkowal.ski/) (Emil Kowalski) & [Radix Toast Accessibility](https://www.radix-ui.com/primitives/docs/components/toast).
- **Zero-Handroll Implementation Blueprint:** Call `toast.success()`, `toast.error()`, or `toast.promise(mutation, { loading: 'Updating...', success: 'Saved', error: (err) => err.message })` via `sonner` (already in `package.json`). Replace all inline timeout-based "Copied!" state booleans with `toast.success('Copied to clipboard')`.
- **Current Repository State:** `VERIFIED`
  - Created standardized hook `src/hooks/useAeMutationToast.ts` providing `executeWithToast` and `copyWithToast` wrapping `toast.success` and `toast.error`.
  - Wired Sonner toast feedback into `AeCopyReference.tsx` for clipboard copying events.
  - Added unit test suite in `tests/unit/hooks/use-ae-mutation-toast.test.ts`.
- **Checklist:**
  - [x] Sonner toast library and helper mounted.
  - [x] Standardized `useAeMutationToast()` hook for form mutations.
  - [x] Form mutation errors and successes wired to toasts.
- **Priority:** `P1` | **Status:** `VERIFIED`

---

### W-44: Confirmation Dialogs for Destructive Actions
- **External Standard:** Destructive actions never trigger immediately on click:
  - Revoking an API key.
  - Removing a team member.
  - Deleting or unpublishing a tool.
  - Must open an accessible modal dialog with:
    - Red destructive action title: "Revoke Agent Key?".
    - Warning text explaining consequences: "Any scripts or background workers using this key will immediately fail."
    - Cancel button (secondary) and Destructive button (Red: "Revoke Key").
- **Gold Standard Design Reference:** [Radix UI `<AlertDialog />`](https://www.radix-ui.com/primitives/docs/components/alert-dialog) & [GitHub Repository Deletion Confirmation](https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository).
- **Zero-Handroll Implementation Blueprint:** Mount existing component `src/components/ae/feedback/AeConfirmDialog.tsx` wrapping `@radix-ui/react-alert-dialog`. Traps focus, handles Escape key, dims backdrop, and renders destructive red confirmation button with pending spinner. Never use `window.confirm()` or un-trapped div modals.
- **Current Repository State:** `VERIFIED`
  - Reusable component `AeConfirmDialog` exists in `src/components/ae/feedback/AeConfirmDialog.tsx` (using Radix AlertDialog, destructive variant, pending guards).
  - Used in 8+ operator flows: agent revoke/disconnect, provider connection revoke, tool withdraw/republish, offboarding, call recovery, and workspace deletion.
  - Team member removal (`W-19`) natively implements confirmation modal via Clerk `<OrganizationProfile />`.
  - Workspace deletion (`W-14`) now triggers `AeConfirmDialog` before firing closure mutation in `WorkspaceDangerZone.tsx`.
  - Verified across test suite including `tests/unit/components/workspace-danger-zone.test.tsx`.
- **Checklist:**
  - [x] Accessible `AeConfirmDialog.tsx` component with destructive variant.
  - [x] Applied on Agent Revoke / Disconnect in `AeAgentOperatorConsole.tsx`.
  - [x] Applied on Tool Withdraw in `AeProviderToolDetail.tsx`.
  - [x] Applied on Team Member Removal (`W-19`).
  - [x] Applied on Workspace Deletion (`W-14`).
- **Priority:** `P1` | **Status:** `VERIFIED`

---

# Strategic Implementation Releases

```
┌────────────────────────────────────────────────────────────────────────┐
│                        IMPLEMENTATION RELEASES                         │
├────────────────────────────────────────────────────────────────────────┤
│ RELEASE 1: Organization Tenancy & Team Management (P0 Blockers)       │
│   • W-10: Workspace Switcher in Header/Sidebar                         │
│   • W-11: Create New Organization Modal                                │
│   • W-12: Workspace Profile & General Settings                         │
│   • W-15: Team Members Table (/owner/team)                             │
│   • W-16 & W-17: Invite Member by Email & Accept Invitation Flow       │
│   • W-18 & W-19: Member Role Management & Removal                      │
│                                                                        │
│ RELEASE 2: Self-Serve Supplier Onboarding & Payouts (P0 Blockers)     │
│   • W-30: Supplier "Start Selling" Activation Wizard                   │
│   • W-31: Stripe Connect Hosted Payout Onboarding Link Generator       │
│   • W-32: Payouts & Earnings Dashboard (Available vs Pending)          │
│   • W-36: In-App Test Console (Dry Run Playground for Tools)           │
│                                                                        │
│ RELEASE 3: Developer Polish & Standard SaaS UX (P1/P2)                 │
│   • W-26 & W-27: One-Time Key Reveal Modal with Setup Code Snippets    │
│   • W-21 & W-23: Auto-Top-Up & Monthly Spending Cap Card               │
│   • W-07: Email Notification Preferences                               │
│   • W-41 to W-44: Empty States, Skeletons, Toasts & Confirm Dialogs    │
└────────────────────────────────────────────────────────────────────────┘
```
