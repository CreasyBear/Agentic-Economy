# User, Organization & Standard Application Maturity: Deep IceInVein Specification

**Date:** 17 September 2026  
**Status:** Comprehensive Master Design for Sign-Off (No implementation until Joel signs)  
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/operations/user-and-org-maturity-register.md`, `docs/designs/2026-09-16-am-source-iceinvein.md`

---

## 1. Executive Thesis & The Anti-Generosity Mandate

### The North Star Thesis
> **"An invited Australian business can give its Agent bounded access to useful paid Tools, and can understand and recover every resulting purchase."**

### Why Our Previous Approach Was Far Too Generous
Our previous evaluation and scoring across standard application workflows was dangerously lenient:
1. **Third-Party Outsourcing Delusion:** Mounting Clerk's prebuilt `<SignIn />` and `<UserProfile />` widgets was scored as "VERIFIED", ignoring that Clerk session cookies do NOT establish Convex spending authority, Clerk user changes do NOT synchronize with internal `principals`, and terminating a Clerk session leaves machine agent tokens actively draining customer funds indefinitely.
2. **Single-Tenant Prototype Masquerading as Multi-Tenancy:** Auto-provisioning a single 1:1 business record on first login was treated as an acceptable baseline. In reality, `requireSingleAccessFact` in `convex/interactiveAuthority.ts` crashes with `account_access_ambiguous` if a user belongs to more than one workspace, rendering true B2B organization switching impossible.
3. **CQS Violations in Core Queries:** The operator layout and authority loaders currently execute silent database mutations (`ensureOwnerIdentityForAuthenticatedIdentity`) inside read queries, complecting query caching and violating Command-Query Separation.
4. **Superficial Feature Checkmarks:**
   - Team management was treated as "just a table and an invite dialog", ignoring cryptographic token hashing, 7-day TTL expiration, race conditions on duplicate invites, and the critical fork between existing vs new users.
   - Credit top-up was treated as "VERIFIED" simply because Stripe hosted checkout redirected, ignoring that auto-recharge is a hardcoded stub, cards cannot be saved, and there is zero organization-wide monthly spending ceiling.
   - Supplier onboarding was treated as a missing blank slate, ignoring that Stripe Connect link generation and webhooks were already written on the backend, but suffered from missing return-URL completion polling and lack of an Express Dashboard SSO bridge.
   - Call receipts were dumping raw machine error codes rather than human-actionable diagnostic playbooks.

### The Canonical Product Boundary
Under no circumstances may any design or implementation collapse these boundaries:
- **Funding is not Authority:** Holding credit does not grant spending permission.
- **Authority is not a Purchase:** Spending policy allowance is not an executed Call.
- **Buyer Consideration is not Provider Obligation:** AUD paid by customer does not equal USDC transferred upstream to provider.
- **Settlement is not Delivery:** On-chain payment confirmation does not prove the Tool delivered valid output.
- **Delivery is not Purchase Resolution:** Receiving output is not final commercial closure until adjustments and status reconcile.
- **Provider $\neq$ Seller $\neq$ Payment Recipient:** Agentic Economy is the buyer-facing Seller; the Tool operator is the Provider; the crypto address is the Payment Recipient.

---

## 2. The 8-Point IceInVein Engineering Framework

Every line item (W-01 through W-44) is designed against the 8 dimensions of the IceInVein engineering discipline:

```text
1. Thesis Fit (design-review / Brooks)
   └─ Does this directly serve the buyer/provider journey? What is explicitly cut?
2. Semantic Contract (contract-enforcer / Meyer)
   └─ Preconditions (Requires), Postconditions (Ensures), Invariants, Loud Violations.
3. Type-Driven Modeling (type-driven-designer / Wlaschin & Minsky)
   └─ Make illegal states unrepresentable. Discriminated unions, branded types, no boolean flag explosions.
4. Temporal Invariants (temporal-coupling-detector / Hunt, Thomas, Seemann)
   └─ Eliminate hidden order dependencies. Phase encoding; A's output is B's input.
5. Error Taxonomy & Guarantees (error-strategist / Duffy & Abrahams)
   └─ Bug (crash/assert) vs Recoverable (typed refusal union) vs Fatal (clean exit). Exception safety guarantees.
6. Idempotency & Replay Safety (idempotency-guardian / Helland)
   └─ At-least-once delivery; idempotency keys; side-effect isolation; replay returns cached result.
7. CQS & Boundary Architecture (cqs-auditor / Meyer)
   └─ Pure queries (side-effect free) vs Commands (mutates state, returns void/receipt). No concealed commands.
8. Simplicity & Complexity Budget (simplicity-razor / Hickey & complexity-accountant / Ousterhout)
   └─ Decomplect braided concerns. Deep modules (simple interface, rich implementation). Minimal change amplification.
```

---

## 3. The Core Authority & Tenancy Spine (The W-10 Prerequisite)

Before any workspace UI, team invitations, or multi-tenant billing can function, the fundamental authority resolution model in `convex/interactiveAuthority.ts` must be refactored:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTHORITY RESOLUTION SPINE                      │
├────────────────────────────────────────────────────────────────────────┤
│  Human Principal (Clerk Subject)                                       │
│    ├── External Identity Binding (Issuer + Subject)                    │
│    └── Interactive Session Selection (Stored in DB)                    │
│          └── activeAccountRef (Explicit target workspace)              │
│                ├── Verified against accountOwnerships                 │
│                └── OR Verified against memberships (Role: Admin/Dev)   │
│                      └── Yields InteractiveBusinessAuthorityContext    │
└────────────────────────────────────────────────────────────────────────┘
```

### Architectural Contract: `interactiveSessionSelections`
1. **New Table:** `interactiveSessionSelections`
   - Key: `principalRef` (unique).
   - Fields: `activeAccountRef: v.string()`, `revision: v.number()`, `selectedAt: v.number()`, `lastCorrelationRef: v.string()`.
   - Index: `by_principalRef`.
2. **Authority Resolver Refactor:**
   - Retire `requireSingleAccessFact`.
   - Replace with `requireAccessFactForAccount(principalRef, activeAccountRef)`.
   - If a caller has multiple workspaces and no `activeAccountRef` is selected, fail closed with `active_account_selection_required`.
3. **CQS Separation:**
   - Remove auto-provisioning mutations from `readCurrentInteractiveAuthorityFacts`.
   - Pure Query: `interactiveSession.readCurrentAuthority` (pure read, never writes).
   - Explicit Command: `interactiveSession.bootstrap` (runs once on post-auth hook).

---

## 4. Comprehensive Specifications: Modules 1 to 10 (W-01 to W-44)

---

### Module 1: Authentication & Session Workflows

#### W-01: Sign-In with Multiple Auth Methods & Identity Resolution
- **Gold Standard Design Reference:** [Clerk Prebuilt `<SignIn />`](https://clerk.com/docs/components/authentication/sign-in) & [WorkOS AuthKit](https://workos.com/authkit)
- **Zero-Handroll Implementation Blueprint:** Mount `@clerk/tanstack-react-start`'s `<SignIn />` directly in `src/routes/sign-in.$.tsx`. All credential hashing, bot detection (Turnstile), social OAuth handshakes (Google, GitHub), and WebAuthn passkey negotiations are fully delegated to Clerk. Never write custom password inputs, OAuth callback handlers, or auth token stores.
- **Anti-Generosity Reality Check:** Rendering `<SignIn />` from Clerk proves UI exists, but does not prove identity convergence. If Clerk's `tokenIdentifier` rotates or OAuth providers yield different token claims, `interactiveAuthority.ts` creates split or orphaned principal records.
- **Thesis Fit:** Authenticated humans must resolve to a known workspace to fund credit and approve agents. Cut: custom username/password auth; SAML/SCIM (Enterprise Level 4).
- **Semantic Contract:**
  ```text
  CONTRACT: admitClerkInteractiveSignIn(clerkSession, returnDestination)
    Requires: Convex-verified Clerk JWT; returnDestination is normalized AppRelativeUrl.
    Ensures:  Resolves stable providerIdentifier = clerkUserProviderIdentifier(issuer, subject).
              At most one active externalIdentityBinding per providerIdentifier.
    Invariant: Clerk session cookie MUST NOT be treated as AccountRef or spending authority.
    On Violation: Invalid JWT = 401 interactive_authentication_required; Unsafe redirect = fallback to '/owner'.
  ```
- **Type-Driven Modeling:**
  ```typescript
  type AppRelativeUrl = string & { readonly __brand: 'AppRelativeUrl' }
  type ClerkInteractiveIdentity = Readonly<{
    issuer: string
    subject: string
    providerIdentifier: string // clerkUserProviderIdentifier(issuer, subject)
    tokenIdentifier: string
  }>
  type SignInResolution =
    | { kind: 'needs_bootstrap'; principalPending: true }
    | { kind: 'ready'; principalRef: PrincipalRef; activeAccountRef: AccountRef }
    | { kind: 'refused'; code: InteractiveAuthorityErrorCode }
  ```
- **Temporal Invariants:** Clerk JWT verified $\rightarrow$ Resolve providerIdentifier $\rightarrow$ Bootstrap session command (if first time) $\rightarrow$ Resolve active account $\rightarrow$ Route admission.
- **Error Taxonomy:** 401 for unauthenticated; 403 for revoked binding; strong transactional guarantee on bootstrap.
- **Idempotency:** Binding idempotency ref = `bind:interactive-owner:{sha256(subject)}`; atomic upsert.
- **CQS:** Sign-in route is read-only; bootstrap is an explicit command.
- **Implementation Seams:** `src/routes/sign-in.$.tsx`, `convex/interactiveAuthority.ts` (`bootstrapInteractiveSession`), `src/modules/principal-account/external-identity/registry.ts`.

---

#### W-02: Sign-Up with Post-Registration Onboarding & Workspace Initialization
- **Gold Standard Design Reference:** [Dub.co Workspace Onboarding Modal](https://github.com/dubinc/dub/blob/main/apps/web/ui/modals/create-workspace-modal.tsx) & [Clerk Custom Onboarding Flow](https://clerk.com/docs/guides/development/custom-sign-up-flow)
- **Zero-Handroll Implementation Blueprint:** Use Clerk's `<SignUp afterSignUpUrl="/onboarding" />`. Route `/onboarding` is a 2-step setup: Step 1 (Role intent: Developer/Buyer vs Supplier) + Step 2 (Workspace name + live slug generation). On submit, calls Convex mutation `accounts.createOrganization({ name, slug })` and redirects to `/owner/dashboard`. Never write custom email verification or signup credential persistence.
- **Anti-Generosity Reality Check:** Currently, new sign-ups are dumped straight into `/owner/settings` with a synthetic shadow business created silently. The user never selects their intent (buyer vs supplier) or names their workspace, leaving the system in an ambiguous state.
- **Thesis Fit:** Captures commercial intent (AI Agent Buyer vs Tool Supplier) to configure initial catalog views. Cut: complex marketing questionnaires.
- **Semantic Contract:**
  ```text
  CONTRACT: completeInteractiveOnboarding(input)
    Requires: Authenticated principal; initial account is in lifecycle 'pending_activation'.
              displayName valid (2-80 chars); slug available; intent in {'buyer', 'supplier'}.
    Ensures:  Account transitions 'pending_activation' -> 'active'; persists slug & intent;
              sets interactiveSessionSelections.activeAccountRef.
    Invariant: No Call, Quote, or agent grant may be created against 'pending_activation' accounts.
    On Violation: slug_taken = 409 workspace_slug_unavailable; invalid slug = 422 workspace_slug_invalid.
  ```
- **Type-Driven Modeling:**
  ```typescript
  type WorkspaceSlug = string & { readonly __brand: 'WorkspaceSlug' }
  type OnboardingIntent = 'buyer' | 'supplier'
  type OnboardingState =
    | { phase: 'workspace_pending'; accountRef: AccountRef }
    | { phase: 'complete'; accountRef: AccountRef; intent: OnboardingIntent }
  ```
- **Temporal Invariants:** Clerk sign-up $\rightarrow$ Bootstrap creates `pending_activation` account $\rightarrow$ Redirect to `/onboarding` $\rightarrow$ Submit onboarding $\rightarrow$ Account activates $\rightarrow$ Redirect to `/owner`.
- **Implementation Seams:** `src/routes/_operator/onboarding.tsx`, `convex/interactiveOnboarding.ts` (`readState`, `complete`), `OnboardingIntentStep.tsx`, `OnboardingWorkspaceStep.tsx`.

---

#### W-03: Password Reset & Session Invalidation
- **Gold Standard Design Reference:** [Clerk Self-Serve Password Reset](https://clerk.com/docs/components/authentication/sign-in#password-reset)
- **Zero-Handroll Implementation Blueprint:** Handled out-of-the-box by Clerk's `<SignIn />` and `<UserProfile />`. Email code dispatch, rate limiting, and password reset challenge validation are 100% hosted by Clerk. Zero custom mailers or reset token databases.
- **Anti-Generosity Reality Check:** Outsourcing password reset to Clerk without verifying webhook handling means a user who resets a compromised password leaves existing interactive credentials active in Convex, preserving the attacker's spending window.
- **Thesis Fit:** Credential recovery protects funding balances and agent authority. Cut: custom reset email templates.
- **Semantic Contract:**
  ```text
  CONTRACT: applyClerkPasswordResetEvent(svixDelivery)
    Requires: Verified user.updated / session.ended Svix payload.
    Ensures:  Invalidates all active provider_token credentials for the binding;
              cascades revocation to connected agent credentials; logs security audit.
    Invariant: No active credential issued prior to password reset timestamp may execute calls.
    On Violation: Invalid Svix signature = 400 Bad Request; processing error = 503 retry.
  ```
- **Implementation Seams:** `src/lib/server/clerk-security-webhook.ts`, `convex/securityCascade.ts` (`applyPasswordResetCascade`).

---

#### W-04: Two-Factor Authentication (2FA) & Workspace Security Policy
- **Gold Standard Design Reference:** [Clerk Multi-Factor Authentication](https://clerk.com/docs/authentication/configuration/sign-up-sign-in-options#multi-factor-authentication) & [WorkOS MFA Enforcement Standard](https://workos.com/guide/enterprise-readiness-checklist#mfa)
- **Zero-Handroll Implementation Blueprint:** Enabled via Clerk Dashboard toggle. User manages TOTP QR code enrollment and backup recovery codes through the Security tab of Clerk `<UserProfile />`. Organization-level enforcement is checked via `identity.mfa_enabled` or org security policy claim in Convex mutation wrappers. Never code custom TOTP secret generation, QR rendering, or recovery code hashing.
- **Anti-Generosity Reality Check:** Personal TOTP in Clerk is optional; there is zero organization-level enforcement. An admin without 2FA can connect unverified agents or initiate bank payout modifications without step-up verification.
- **Thesis Fit:** Protects spending policies and bank payout credentials from account takeovers. Cut: custom WebAuthn implementation (leverage Clerk claims).
- **Semantic Contract:**
  ```text
  CONTRACT: assertInteractiveStepUp(session, requiredPolicy)
    Requires: When workspace policy 'requireMfaForMembers' is true, caller session must contain recent MFA claim (<= 10 mins).
    Ensures:  Admit sensitive mutation (transferOwnership, closeWorkspace, upsertTaxFacts, payoutLink).
    On Violation: 403 step_up_required with redirect challenge to Clerk MFA re-verification.
  ```
- **Type-Driven Modeling:**
  ```typescript
  type WorkspaceSecurityPolicy =
    | { requireMfaForMembers: false; revision: number }
    | { requireMfaForMembers: true; revision: number; gracePeriodEndsAt?: number }
  ```
- **Implementation Seams:** `accountSecurityPolicies` table in Convex schema, `convex/workspaceSecurity.ts` (`assertStepUpForMutation`).

---

#### W-05: Active Session Termination & Cascade to Machine Tokens
- **Gold Standard Design Reference:** [Clerk Sessions Management](https://clerk.com/docs/components/user/user-profile#sessions-tab) & [Clerk Webhook `session.revoked`](https://clerk.com/docs/integrations/webhooks/overview)
- **Zero-Handroll Implementation Blueprint:** Active devices UI is hosted inside Clerk `<UserProfile />` (Active Devices tab). In `src/routes/api.clerk.webhook.ts`, listen for `session.revoked` or `session.removed` and call Convex `agentAccessPolicy.revokeSessionsForPrincipal({ principalRef })` to synchronously revoke connected machine tokens and OAuth token families.
- **Anti-Generosity Reality Check:** Currently, Clerk's `session.revoked` webhook only logs an audit event (`account.session.revoked`). The machine agent tokens (`agentAccessGrants`) created by that user remain completely active and authorized to spend credit.
- **Thesis Fit:** Terminating a compromised human session must immediately cut off authorized autonomous spenders.
- **Semantic Contract:**
  ```text
  CONTRACT: cascadeSessionRevocation(clerkSessionId, ownerPrincipalRef)
    Requires: Verified session.revoked webhook delivery from Clerk.
    Ensures:  Invalidates interactive credentials for the session;
              transitions all agentAccessGrants linked to this session family to 'revoked';
              logs security audit 'account.agent_access.revoked_bulk'.
    Invariant: Revoked sessions MUST NOT resolve resolveAgentBinding successfully.
    On Violation: Fail-closed; return 503 to trigger webhook redelivery if transaction fails.
  ```
- **Implementation Seams:** `convex/securityCascade.ts` (`applySessionRevoked`), `convex/agentAccessPolicy.ts` (`revokeGrantsForPrincipal`).

---

### Module 2: User Account & Personal Profile Workflows

#### W-06: Profile Name, Email, Avatar & Identity Binding Sync
- **Gold Standard Design Reference:** [Clerk `<UserProfile />` Component](https://clerk.com/docs/components/user/user-profile)
- **Zero-Handroll Implementation Blueprint:** Mount Clerk's `<UserProfile />` directly in `src/components/ae/settings/OwnerSettingsSections.tsx`. Avatar upload, image cropping, S3/CDN hosting, name editing, and primary email verification codes are 100% turnkey. Never write custom S3 presigned URL generators, image processing lambdas, or email verification flows.
- **Anti-Generosity Reality Check:** Display name in `principals` is set once at account creation. If a user changes their name or primary email in Clerk, Agentic Economy never updates its database, causing audit trails to attribute actions to stale or incorrect identities.
- **Thesis Fit:** Accurate human actor attribution on purchased Calls and tax invoices. Cut: hosting custom avatar CDNs.
- **Semantic Contract:**
  ```text
  CONTRACT: syncClerkProfileObservation(event)
    Requires: Verified user.updated Svix delivery.
    Ensures:  Updates principals.displayName; recalculates primaryEmailHash for GDPR-compliant audit.
    Invariant: principalRef and accountRef remain completely immutable across profile updates.
  ```
- **Implementation Seams:** `convex/principalProfile.ts` (`syncFromClerkObservation`), `src/lib/server/clerk-security-webhook.ts`.

---

#### W-07: Email Notification Preferences & Event Triggers
- **Gold Standard Design Reference:** [Knock.app User Notification Preferences](https://docs.knock.app/preferences/overview) & [Dub.co Notification Settings](https://github.com/dubinc/dub/blob/main/apps/web/ui/account/notification-settings.tsx)
- **Zero-Handroll Implementation Blueprint:** Compose standard Radix UI switches (`@radix-ui/react-switch` via shadcn) in `/owner/settings` backed by a single Convex document `userNotificationPreferences` storing boolean flags. Triggers are fired via PostHog or Resend transactional API when Convex actions detect low balance (< threshold) or spend cap breach. Never build an in-house notification queue or delivery scheduler.
- **Anti-Generosity Reality Check:** The app currently has zero notification preferences and no dispatcher. When an agent drains a balance or a tool fails repeatedly, operators receive zero automated alerts.
- **Thesis Fit:** Notifies human operators when agent spending requires funding or intervention. Cut: SMS and Slack webhooks (v1).
- **Semantic Contract:**
  ```text
  CONTRACT: dispatchAccountNotification(event, accountRef)
    Requires: Event type supported; recipient principal has notification preference enabled; rate limit not exceeded.
    Ensures:  Dispatches single email via Resend/Postmark; records notificationDeliveries row.
    Invariant: Notifications MUST NEVER contain plaintext secret keys or credit card details.
  ```
- **Type-Driven Modeling:**
  ```typescript
  type NotificationPreferenceKey =
    | 'low_credit_balance'
    | 'spend_cap_warning'
    | 'spend_cap_exceeded'
    | 'call_failure_spike'
    | 'invoice_ready'
    | 'team_membership_changed'
  ```
- **Implementation Seams:** `userNotificationPreferences` table, `convex/notifications.ts` (`readPreferences`, `updatePreferences`, `dispatch`).

---

#### W-08: Appearance & Theme Preferences (CSS Tokens & DOM State)
- **Gold Standard Design Reference:** [Shadcn UI Dark Mode for Vite/TanStack](https://ui.shadcn.com/docs/dark-mode/vite) & [Radix UI Dropdown Menu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu)
- **Zero-Handroll Implementation Blueprint:** Mount a prebuilt `ThemeToggle` component in `AeOperatorSidebar.tsx` footer using Radix `<DropdownMenu />` with choices: `Light`, `Dark`, `System`. State is persisted in `localStorage` under `ae-theme` and updates `document.documentElement.classList`. Leverages Tailwind CSS `dark:` selectors already in `src/styles/globals.css`. Never write custom style engines or CSS injection scripts.
- **Anti-Generosity Reality Check:** Tailwind dark classes exist, but theme state is not persisted or controllable by the user. Flash of unstyled theme (FOUT) compromises readability during financial reviews.
- **Thesis Fit:** Visual contrast and readability of financial tables and call receipts.
- **Semantic Contract:** Enforce pure client/cookie persistence (`localStorage['ae.theme.mode']` + `html[data-theme]`) with zero layout shift on initial SSR.
- **Implementation Seams:** `ThemeSwitcher.tsx`, `src/routes/__root.tsx`.

---

#### W-09: Delete Personal Account, Data Export & GDPR Invariants
- **Gold Standard Design Reference:** [Clerk Account Deletion Flow](https://clerk.com/docs/components/user/user-profile#danger-zone) & [GDPR Article 15/17 Right to Erasure Standard](https://gdpr-info.eu/art-17-gdpr/)
- **Zero-Handroll Implementation Blueprint:** Mount Clerk's built-in "Delete Account" button within the `<UserProfile />` Danger Zone. The Clerk webhook `user.deleted` triggers a Convex handler that anonymizes audit records and soft-deletes the principal. A single Convex query `users.exportUserData` returns all user records as a downloadable JSON blob. Never build custom password-re-entry deletion modals or manual data-gathering routines.
- **Anti-Generosity Reality Check:** No personal account deletion flow exists. Simply dropping a user record would orphan Formance ledger entries and violate Australian legal record-keeping requirements for commercial purchases.
- **Thesis Fit:** Compliant offboarding while preserving immutable commercial Purchase resolution records.
- **Semantic Contract:**
  ```text
  CONTRACT: requestPersonalAccountDeletion(principalRef, confirmation)
    Requires: Typed email confirmation; caller is NOT sole active owner of workspace with positive balance or open Calls.
    Ensures:  Memberships ended; credentials revoked; Clerk deletion requested; export bundle generated.
    Invariant: Ledger records, Calls, and Tax Invoices are NEVER deleted; personal identity is pseudonymized.
    On Violation: 409 account_deletion_blocked if positive balance or open obligations exist.
  ```
- **Implementation Seams:** `convex/personalAccount.ts` (`readDeletionEligibility`, `requestDeletion`).

---

### Module 3: Organization & Workspace Management

#### W-10: Workspace Switcher & Multi-Tenant Authority Resolution
- **Gold Standard Design Reference:** [Clerk `<OrganizationSwitcher />`](https://clerk.com/docs/components/organization/organization-switcher) & [Sonny Sangha Linear Clone (Clerk + Convex)](https://github.com/sonnysangha/linear-clone-clerk-nextjs-16)
- **Zero-Handroll Implementation Blueprint:** Mount `<OrganizationSwitcher hidePersonal={false} />` from `@clerk/tanstack-react-start` directly into `src/components/ae/layout/AeOperatorSidebar.tsx`. Clerk manages the active workspace dropdown, personal vs org contexts, and automatically updates the session token with `org_id` and `org_role`. In Convex, update `resolveInteractiveAuthorityContext` to consume `identity.org_id ?? identity.subject`, resolving the `requireSingleAccessFact` ambiguity blocker. Never write a bespoke workspace switcher dropdown, cookie synchronizer, or tenant cookie parser.
- **Anti-Generosity Reality Check:** P0 Critical Blocker. `convex/interactiveAuthority.ts` (`requireSingleAccessFact`) explicitly throws `account_access_ambiguous` if a user belongs to more than one workspace. Adding multi-tenancy without fixing this will cause immediate outages.
- **Thesis Fit:** Allows a business to isolate agent budgets across separate workspaces (e.g. Research vs Production).
- **Semantic Contract:**
  ```text
  CONTRACT: resolveInteractiveAuthority(identity, targetAccountRef?)
    Requires: Valid Clerk identity; if count(accessFacts) > 1, targetAccountRef MUST be provided and valid.
    Ensures:  Returns InteractiveBusinessAuthorityContext strictly bounded to targetAccountRef.
    Invariant: Authority NEVER falls back to an ambiguous or cross-tenant context.
    On Violation: 403 active_account_selection_required if multiple memberships exist without selection.
  ```
- **Type-Driven Modeling:**
  ```typescript
  type InteractiveSessionSelection = Readonly<{
    principalRef: PrincipalRef
    activeAccountRef: AccountRef
    revision: number
    selectedAt: number
  }>
  ```
- **Implementation Seams:** `interactiveSessionSelections` table, refactored `interactiveAuthority.ts`, `WorkspaceSwitcher.tsx` in `AeOperatorSidebar.tsx`.

---

#### W-11: Create New Organization / Workspace Modal & Domain Provisioning
- **Gold Standard Design Reference:** [Clerk `<CreateOrganization />`](https://clerk.com/docs/components/organization/create-organization) & [Dub.co Create Workspace Modal](https://github.com/dubinc/dub/blob/main/apps/web/ui/modals/create-workspace-modal.tsx)
- **Zero-Handroll Implementation Blueprint:** Render Clerk's `<CreateOrganization />` modal or invoke `createOrganization({ name, slug })` via Clerk's `useOrganizationList()`. The webhook `organization.created` in `src/routes/api.clerk.webhook.ts` catches the event and invokes `AccountRegistry.create` in Convex to atomically provision the shadow `accounts` and `accountOwnerships` records. Never build custom slug availability debouncers or manual organization tables.
- **Anti-Generosity Reality Check:** Workspaces cannot be created on demand. `AccountRegistry.create` exists in test harnesses, but has no interactive Convex wrapper.
- **Thesis Fit:** Allows organizations to spin up dedicated funding containers for new agent projects.
- **Semantic Contract:**
  ```text
  CONTRACT: createOrganizationWorkspace(name, slug, idempotencyRef)
    Requires: Authenticated principal; slug available; caller under workspace quota.
    Ensures:  Provisions Account record; assigns caller as Owner; switches active session selection.
    Invariant: Workspace slug must be globally unique across active accounts.
  ```
- **Implementation Seams:** `convex/workspaceAccounts.ts` (`create`), `CreateWorkspaceDialog.tsx`.

---

#### W-12: Workspace Profile, Slug & General Settings
- **Gold Standard Design Reference:** [Clerk `<OrganizationProfile />`](https://clerk.com/docs/components/organization/organization-profile) (General Settings Tab)
- **Zero-Handroll Implementation Blueprint:** Mount `<OrganizationProfile />` in route `src/routes/_operator/owner.workspace.tsx`. Organization name editing, slug changes, logo upload to CDN, and domain management are fully delegated to Clerk. Webhook `organization.updated` mirrors changes to Convex `accounts`. Never build custom file uploaders or slug update mutations.
- **Anti-Generosity Reality Check:** `accounts` table contains only `displayName`. There is no slug editing, support email, or logo storage.
- **Thesis Fit:** Identifies the commercial buyer to providers on public quote records.
- **Semantic Contract:**
  ```text
  CONTRACT: updateWorkspaceProfile(accountRef, patch, expectedRevision)
    Requires: Caller has Owner or Admin role on accountRef; expectedRevision matches current.
    Ensures:  Updates displayName, supportEmail, logoRef; bumps revision.
  ```
- **Implementation Seams:** `src/routes/_operator/owner.workspace.tsx`, `convex/workspaceProfile.ts`.

---

#### W-13: Legal Entity, Billing Address & Tax ID (ABN Checksum)
- **Gold Standard Design Reference:** [Stripe Customer Portal Tax ID Management](https://docs.stripe.com/customer-management/tax-ids) & [Australian Business Register (ABN) Algorithmic Checksum](https://abr.business.gov.au/Help/AbnFormat)
- **Zero-Handroll Implementation Blueprint:** Delegate customer billing address and tax ID collection directly to Stripe Customer Portal (`tax_id_collection: { enabled: true }`), or present a 3-field form in `/owner/workspace` validated with existing `isValidAbn` helper (`src/modules/money/internal/tax-invoice-control.ts`) that persists to Convex `moneyCustomerTaxFacts`. Never write custom billing address schemas or unvalidated tax ID inputs.
- **Anti-Generosity Reality Check:** ABN algorithmic checksum validator (`isValidAbn`) exists, but there is zero UI to view or input it. As a result, all generated Australian Tax Invoices are withheld (`tax_invoice_withheld`).
- **Thesis Fit:** Captures mandatory Australian tax facts for principal-reseller invoice compliance.
- **Semantic Contract:**
  ```text
  CONTRACT: upsertCustomerTaxFacts(accountRef, facts)
    Requires: Caller is Owner; facts.abn passes isValidAbn; legal name and address non-empty.
    Ensures:  Persists moneyCustomerTaxFacts; unblocks admitTaxInvoiceIssuance gate for future invoices.
    On Violation: 422 customer_abn_invalid if checksum fails.
  ```
- **Implementation Seams:** `convex/moneyCustomerTaxFacts.ts` (`upsertForAccount`), `TaxProfileForm.tsx` in workspace settings.

---

#### W-14: Delete Workspace / Transfer Ownership & Obligation Fences
- **Gold Standard Design Reference:** [Clerk Organization Deletion & Ownership Transfer](https://clerk.com/docs/organizations/overview#organization-permissions) & [WorkOS Enterprise Tenant Offboarding](https://workos.com/guide/enterprise-readiness-checklist)
- **Zero-Handroll Implementation Blueprint:** Managed via Clerk's `<OrganizationProfile />` Danger Zone ("Leave Organization" and "Delete Organization"). In Convex, enforce financial invariants by rejecting the deletion webhook if `unwithdrawnEarnings > 0` or unpaid call obligations exist, requiring settlement before final tenant dissolution. Never handroll dangerous SQL cascade deletes.
- **Anti-Generosity Reality Check:** Deleting a workspace without verifying settled balances or open call liabilities risks permanent ledger corruption in Formance.
- **Thesis Fit:** Safe commercial decommission.
- **Semantic Contract:**
  ```text
  CONTRACT: closeWorkspace(accountRef, confirmationName)
    Requires: Caller is Owner; typed name matches; account has ZERO unpaid balances, active calls, or provider obligations.
    Ensures:  Transitions account lifecycle to 'closed'; revokes all connected agent grants.
    On Violation: 409 open_commercial_obligations if unsettled liabilities exist.
  ```
- **Implementation Seams:** `convex/workspaceAccounts.ts` (`closeWorkspace`, `transferOwnership`), `DeleteWorkspaceDialog.tsx`.

---

### Module 4: Team & Member Management (Invitations & RBAC)

#### W-15: Team Member Directory & Hierarchical Membership Readback
- **Gold Standard Design Reference:** [Clerk `<OrganizationProfile />` (Members Tab)](https://clerk.com/docs/components/organization/organization-profile#members-tab) & [James Ross Jr. B2B SaaS Role Model](https://www.jamesrossjr.com/blog/saas-user-management)
- **Zero-Handroll Implementation Blueprint:** Mount Clerk's `<OrganizationProfile />` (focused on Members tab) in route `src/routes/_operator/owner.team.tsx`. Renders team members list, avatar badges, emails, joined dates, and active roles out-of-the-box. Never write custom member table queries, pagination cursors, or avatar resolvers.
- **Anti-Generosity Reality Check:** `memberships` table has no `role` field. Listing members requires querying multiple tables without exposing other workspaces' members or leaking revoked credentials.
- **Thesis Fit:** Multi-operator management of agent spending authority.
- **Semantic Contract:**
  ```text
  CONTRACT: listWorkspaceTeamDirectory(activeAccountRef)
    Requires: Caller has 'team:read' permission on activeAccountRef.
    Ensures:  Returns unified list of Owners, Members (with roles), and Pending Invitations;
              masks unconfirmed invitation tokens.
  ```
- **Type-Driven Modeling:**
  ```typescript
  type InvitableWorkspaceRole = 'admin' | 'developer' | 'viewer'
  type WorkspaceRole =
    | { kind: 'owner'; ownershipRef: string }
    | { kind: 'member'; role: InvitableWorkspaceRole; membershipRef: MembershipRef }
  ```
- **Implementation Seams:** `src/routes/_operator/owner.team.tsx`, `convex/workspaceTeam.ts` (`listDirectory`), `AeTeamDirectoryTable.tsx`.

---

#### W-16: Invite Team Member by Email, Cryptographic Token & Scoped Role
- **Gold Standard Design Reference:** [Clerk Organization Invitations](https://clerk.com/docs/organizations/invite-members) & [WorkOS Directory Invitations](https://workos.com/docs/user-management/invitations)
- **Zero-Handroll Implementation Blueprint:** Native to Clerk `<OrganizationProfile />` ("Invite" modal). Role dropdown (`Admin` vs `Member`), email address validation, rate-limited email dispatch via Clerk's email infrastructure, and 7-day cryptographic invite token generation are 100% turnkey. Never build custom token tables, TTL expirers, or transactional mailer templates.
- **Anti-Generosity Reality Check:** Storing raw tokens in plaintext allows database read leaks to become instant account takeovers. Storing only a SHA-256 digest is required.
- **Thesis Fit:** Secure expansion of workspace authority.
- **Semantic Contract:**
  ```text
  CONTRACT: createWorkspaceInvitation(accountRef, email, role, idempotencyRef)
    Requires: Caller has 'team:invite'; role in {'admin', 'developer', 'viewer'}; email not already active member.
    Ensures:  Stores sha256(rawToken) in accountInvitations with 7-day TTL;
              returns one-time raw token to caller for email dispatch; dispatches email.
    Invariant: Plaintext invitation token is NEVER persisted in the database.
  ```
- **Implementation Seams:** `accountInvitations` table (indexed by `tokenDigest`), `convex/workspaceTeam.ts` (`createInvitation`), `InviteMemberDialog.tsx`.

---

#### W-17: Accept Invitation Flow (The Existing vs New User Fork & Atomic Association)
- **Gold Standard Design Reference:** [Clerk Hosted Invitation Acceptance Flow](https://clerk.com/docs/organizations/invite-members#invitation-flow) & [James Ross Jr. Invitation Flow Fork](https://www.jamesrossjr.com/blog/saas-user-management)
- **Zero-Handroll Implementation Blueprint:** Delegated to Clerk's hosted `/accept-invitation` flow. Automatically handles the new-user vs existing-user branching: existing users click "Accept" and immediately switch active workspace; new users are guided through sign-up with prefilled email. The Clerk webhook `organizationMembership.created` syncs the membership to Convex `accountMemberships`. Never handroll invite token decoding or registration routing forks.
- **Anti-Generosity Reality Check:** The acceptance flow must handle logged-in users with a different email, logged-out users, and brand new users cleanly without session hijacking or duplicate membership creation.
- **Thesis Fit:** Seamless onboarding into an existing commercial container.
- **Semantic Contract:**
  ```text
  CONTRACT: acceptWorkspaceInvitation(rawToken, clerkSession)
    Requires: sha256(rawToken) matches pending invitation; now < expiresAt;
              verified Clerk email matches invitation emailNormalized.
    Ensures:  Consumes invitation atomically; inserts memberships record with invited role;
              sets active session selection to new workspace.
    On Violation: 410 invitation_expired; 403 invitation_email_mismatch.
  ```
- **Implementation Seams:** `src/routes/invite.$token.tsx`, `convex/workspaceTeam.ts` (`previewInvitation`, `acceptInvitation`).

---

#### W-18: Change Member Role with Hierarchical Authority Fences
- **Gold Standard Design Reference:** [Clerk Role Management & Permissions](https://clerk.com/docs/organizations/roles-permissions) & [WorkOS Hierarchical RBAC](https://workos.com/guide/enterprise-readiness-checklist#rbac)
- **Zero-Handroll Implementation Blueprint:** Handled by the member action dropdown inside Clerk `<OrganizationProfile />`. Modifying a role updates Clerk immediately, enforces that at least one Admin remains, and fires webhook `organizationMembership.updated` to update Convex `accountMemberships.role`. Never code custom role dropdown mutations or owner-protection guards.
- **Anti-Generosity Reality Check:** Unconstrained role editing allows an Admin to promote themselves to Owner or demote the last remaining Owner, creating headless workspaces.
- **Thesis Fit:** Enforces strict role boundaries on billing and credential actions.
- **Semantic Contract:**
  ```text
  CONTRACT: updateMemberRole(accountRef, targetPrincipalRef, newRole, expectedRevision)
    Requires: Caller has 'team:manage_roles'; Caller rank strictly exceeds target rank;
              Admin CANNOT promote anyone to Owner (Owner is assigned via ownership transfer only).
    Invariant: The workspace must retain at least one active Owner at all times.
    On Violation: 403 role_escalation_forbidden; 409 last_owner_invariant.
  ```
- **Implementation Seams:** `convex/workspaceTeam.ts` (`updateMemberRole`), `ChangeMemberRoleDialog.tsx`.

---

#### W-19: Revoke Pending Invitation & Remove Member with Immediate Credential Invalidation
- **Gold Standard Design Reference:** [Clerk Manage Members](https://clerk.com/docs/organizations/manage-members) & [Radix UI `<AlertDialog />`](https://www.radix-ui.com/primitives/docs/components/alert-dialog)
- **Zero-Handroll Implementation Blueprint:** Built directly into Clerk `<OrganizationProfile />`. Pending tab provides one-click "Revoke" and "Resend" actions. Active members tab has "Remove member" with built-in modal confirmation. Fires `organizationMembership.deleted` webhook, instantly invalidating the user's workspace session in Convex. Never write custom member-removal cascades.
- **Anti-Generosity Reality Check:** Removing a member from a team must immediately invalidate their ability to query or mutate workspace resources, even if their Clerk web session remains active.
- **Thesis Fit:** Immediate revocation of compromised or departing team members.
- **Semantic Contract:**
  ```text
  CONTRACT: removeMember(accountRef, targetPrincipalRef)
    Requires: Caller has 'team:remove_member'; target is not the Owner.
    Ensures:  Transitions membership lifecycle to 'ended'; revokes operator authority immediately;
              logs workspace audit event.
  ```
- **Implementation Seams:** `convex/workspaceTeam.ts` (`revokeInvitation`, `removeMember`), `AeConfirmDialog` integration.

---

### Module 5: Buyer Billing, Balance & Invoicing Workflows

#### W-20: Balance Card & Hardened Credit Top-Up Pipeline
- **Gold Standard Design Reference:** [Stripe Hosted Checkout (One-Time Payments)](https://docs.stripe.com/checkout) & [Locus Buyer Prepaid Model](https://bitrupt.co/blog/stripe-connect-marketplace)
- **Zero-Handroll Implementation Blueprint:** Server creates a Stripe Checkout session via `stripe.checkout.sessions.create({ mode: 'payment', line_items: [...] })`. On successful payment, the `checkout.session.completed` event is delivered to `moneyStripeWebhookWorker.ts`, which atomically and idempotently credits the account's Formance double-entry ledger. Never capture or store credit card numbers on our servers.
- **Anti-Generosity Reality Check:** Marking this "VERIFIED" previously masked that duplicate clicks create parallel pending checkout sessions, and returning from Stripe before the webhook completes produces confusing zero-balance UI states.
- **Thesis Fit:** Provides reliable funds for agent calls.
- **Semantic Contract:**
  ```text
  CONTRACT: beginCreditTopUpCheckout(fundingIntentRef, idempotencyRef)
    Requires: Valid quote within bounds; no in-flight active checkout for same account.
    Ensures:  Creates Stripe Checkout session URL; stores checkoutSessionDigest.
    Invariant: Credit is applied ONLY upon successful webhook delivery, never on client redirect.
  ```
- **Implementation Seams:** `convex/moneyFunding.ts`, `AeCreditTopUpPanel.tsx`, `use-account-funding.ts`.

---

#### W-21: Auto-Top-Up Engine & Low Balance Threshold (SetupIntent Off-Session)
- **Gold Standard Design Reference:** [Stripe Off-Session Payments & SetupIntents](https://docs.stripe.com/payments/save-and-reuse) & [OpenAI Automatic Recharge Blueprint](https://platform.openai.com/docs/guides/production-best-practices#billing-and-budgets)
- **Zero-Handroll Implementation Blueprint:** Customer attaches a default payment method via Stripe SetupIntent. In Convex, `moneyLedger.ts` checks available balance upon Call completion; if balance is below `autoRecharge.threshold`, it schedules a Convex background action calling `stripe.paymentIntents.create({ customer, off_session: true, confirm: true })`. Ledger credits automatically on `payment_intent.succeeded` webhook. Never handroll recurring payment schedules or store CVVs.
- **Anti-Generosity Reality Check:** `convex/moneyLedger.ts` currently hardcodes `autoRecharge: { enabled: false }` with an internal "not implemented yet" comment. Autonomous agents will fail mid-workload when balance hits zero.
- **Thesis Fit:** Uninterrupted autonomous agent operation.
- **Semantic Contract:**
  ```text
  CONTRACT: evaluateAutoRecharge(accountRef)
    Requires: Auto-recharge enabled; balance < threshold; no in-flight auto-charge; under daily charge limit.
    Ensures:  Executes off-session Stripe PaymentIntent using saved mandate evidence; credits Formance via webhook.
    Invariant: Never auto-charge without durable customer payment mandate.
  ```
- **Type-Driven Modeling:**
  ```typescript
  type AutoRechargeSettings =
    | { kind: 'disabled' }
    | {
        kind: 'enabled'
        threshold: ExactAmount
        rechargeAmount: ExactAmount
        paymentMethodRef: string
        maxChargesPerDay: number
      }
  ```
- **Implementation Seams:** `accountBillingPreferences` table, `convex/moneyAutoRecharge.ts`, `owner.credit.tsx`.

---

#### W-22: Saved Payment Methods & Stripe Customer Portal Bridge
- **Gold Standard Design Reference:** [Stripe Customer Portal (Payment Method Management)](https://docs.stripe.com/customer-management/integrate-customer-portal#payment-methods)
- **Zero-Handroll Implementation Blueprint:** Server creates a portal session via `stripe.billingPortal.sessions.create({ customer, flow_data: { type: 'payment_method_update' } })`. The user is redirected to Stripe's hosted portal to add/remove cards, manage 3D Secure / SCA verification, and set defaults. The app simply renders the default payment method brand and last 4 digits returned by the Stripe API. Never embed custom credit card input fields or handle raw cardholder data.
- **Anti-Generosity Reality Check:** No saved payment method UI exists. Users must manually re-enter their card details for every single top-up.
- **Thesis Fit:** Streamlined payments without taking on PCI-DSS cardholder data scope.
- **Semantic Contract:**
  ```text
  CONTRACT: createBillingPortalSession(returnUrl)
    Requires: Authenticated Owner or Admin; account has Stripe Customer ID.
    Ensures:  Returns single-use hosted Stripe Customer Portal URL for managing cards and receipts.
  ```
- **Implementation Seams:** `convex/moneyBilling.ts` (`createCustomerPortalSession`), `owner.credit.tsx`.

---

#### W-23: Organization Monthly Spend Ceiling & Fail-Closed Budget Fences
- **Gold Standard Design Reference:** [AWS Budgets & Cost Allocation](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html) & [Locus Pro Budget Architecture](https://bitrupt.co/blog/stripe-connect-marketplace)
- **Zero-Handroll Implementation Blueprint:** Store `monthlySpendCeiling` on `accounts` in Convex. In `admitCapabilityCall`, check current month aggregate debits from Formance; fail closed with RFC 9457 `spending_limit_exceeded` if ceiling is breached. In UI, render a Shadcn `<Progress />` bar showing percentage spent. Never build a bespoke billing aggregator.
- **Anti-Generosity Reality Check:** E-B4 FAIL. Only per-agent policies exist. If an organization connects 5 agents each with a $100 limit, the organization can burn $500 even if the company budget was $200.
- **Thesis Fit:** Organization-level solvency fence.
- **Semantic Contract:**
  ```text
  CONTRACT: assertOrgSpendWithinCeiling(accountRef, incrementalUnits)
    Requires: Call admission checks current month Formance aggregate spend + incrementalUnits <= monthlyCeiling.
    Invariant: If Formance spend cannot be determined, fail closed and refuse Call with 402 Payment Required.
    On Violation: 402 org_spend_ceiling_exceeded.
  ```
- **Implementation Seams:** `accounts.monthlySpendCeilingUnits`, `convex/lib/callLifecycle/admission.ts`, `AeOwnerCredit.tsx`.

---

#### W-24: Invoice History, PDF Tax Invoice Issuance & Stripe Receipt Surfacing
- **Gold Standard Design Reference:** [Stripe Customer Portal Invoice History](https://docs.stripe.com/customer-management/integrate-customer-portal#invoice-history) & [ATO Compliant Tax Invoice Standards](https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices)
- **Zero-Handroll Implementation Blueprint:** Surface direct Stripe Hosted Receipt links (`stripe.charges.retrieve(id).receipt_url`) for card charges. For Australian B2B GST Tax Invoices, trigger existing SSR pipeline `convex/moneyDocumentRender.ts`, which renders a compliant PDF with legal customer name, ABN, GST attribution, and line-item totals. Never write custom PDF canvas engines.
- **Anti-Generosity Reality Check:** Tax invoices are withheld if customer ABN is missing, but the UI provides no clear explanation or remediation. External Stripe hosted receipts are never linked.
- **Thesis Fit:** Required purchase resolution documentation for accounting.
- **Semantic Contract:**
  ```text
  CONTRACT: readBillingDocuments(accountRef)
    Ensures: Lists historical top-ups, Stripe receipt links, and Tax Invoices (flagging 'withheld' with ABN CTA).
  ```
- **Implementation Seams:** `convex/moneyDocuments.ts`, `AeAccountHistoryTable.tsx`.

---

### Module 6: Agent Connections & API Key Management

#### W-25: Connected Agents Directory & Real-Time Spend vs Limit Tracking
- **Gold Standard Design Reference:** [Stripe Restricted API Keys Dashboard](https://docs.stripe.com/keys#limit-access-with-restricted-api-keys) & [Dub.co API Keys Table](https://github.com/dubinc/dub/blob/main/apps/web/ui/tokens/token-card.tsx)
- **Zero-Handroll Implementation Blueprint:** Render standard `@tanstack/react-table` (already installed) over Convex query `agentAccessPolicy.listAgentsForAccount`. Progress bar rendered via Shadcn `<Progress />`. Never handroll table sorting algorithms or manual pagination math.
- **Anti-Generosity Reality Check:** Directory table shows connection status, but completely omits monthly spend vs limit progress indicators.
- **Thesis Fit:** Visibility into autonomous agent burn.
- **Semantic Contract:** Extend `AgentDirectoryItem` to join Formance monthly spend aggregates and render visual utilization bars.
- **Implementation Seams:** `src/modules/agent-access/agent-directory-projector.ts`, `AeAgentDirectoryTable.tsx`.

---

#### W-26: Connect New Agent Wizard & Interactive Credential Issuance
- **Gold Standard Design Reference:** [Resend API Key Creation Modal](https://resend.com/docs/dashboard/api-keys/create-api-key) & [Dub.co Scoped API Token Generator](https://github.com/dubinc/dub/blob/main/apps/web/ui/modals/create-token-modal.tsx)
- **Zero-Handroll Implementation Blueprint:** Modal composed via Radix `<Dialog />`. Generation logic follows Dub.co standard: `crypto.randomBytes(24).toString('base64url')` prefixed with `ae_live_` or `ae_test_`. Store only `crypto.createHash('sha256').update(rawKey).digest('hex')` in Convex `secretReferenceTables`. Display the full plaintext secret exactly once. Never persist plaintext keys in databases.
- **Anti-Generosity Reality Check:** Creating an agent via the web console is clunky and does not combine naming, spending limits, and tool namespace scoping into an atomic operation.
- **Thesis Fit:** Frictionless provisioning of bounded agent credentials.
- **Semantic Contract:**
  ```text
  CONTRACT: createConnectedAgent(command)
    Requires: Caller has 'agents:connect'; limits within platform policies.
    Ensures:  Atomically provisions Principal, Credential, and SpendingPolicy grant;
              returns one-time secret token.
  ```
- **Implementation Seams:** `convex/agentAccessPolicy.ts` (`createOwnerAgent`), `CreateAgentKeyDialog.tsx`.

---

#### W-27: One-Time Key Reveal Modal with Contextual Multi-Client Config Snippets
- **Gold Standard Design Reference:** [Stripe Reveal-Once Key Modal](https://docs.stripe.com/keys) & [Svix Developer Dashboard Code Snippets](https://docs.svix.com/quickstart)
- **Zero-Handroll Implementation Blueprint:** Render monospace text area with `navigator.clipboard.writeText()` + Sonner toast. Quickstart tabs use Radix `<Tabs />` and render snippets highlighted with `shiki` (already in `package.json`). Modal cannot be closed until user toggles "I have securely copied this secret key". Never allow re-revealing secret keys after dismissal.
- **Anti-Generosity Reality Check:** Plaintext secret tokens are returned without a dedicated one-time modal, leading users to accidentally lose them or paste them into insecure channels.
- **Thesis Fit:** Secure handoff of machine credentials into agent harnesses.
- **Semantic Contract:** Render plaintext key once in a modal with confirmation checkbox before dismissal; generate copyable config tabs for **Cursor** (`mcp.json`), **Claude Code** (`claude mcp add`), **Python SDK**, and **cURL**. Zeroize key from client memory upon modal close.
- **Implementation Seams:** `KeyRevealDialog.tsx`, `src/modules/agent-access/config-snippets.ts`.

---

#### W-28: In-Place Spend Limit Mutation & Agent Pause / Revocation Lifecycle
- **Gold Standard Design Reference:** [Dub.co Token Edit & Revoke Sheet](https://github.com/dubinc/dub/blob/main/apps/web/ui/tokens/token-card.tsx) & [Radix `<AlertDialog />`](https://www.radix-ui.com/primitives/docs/components/alert-dialog)
- **Zero-Handroll Implementation Blueprint:** Wire existing `updateAgentSpendingLimitsServer` Convex mutation to a Sheet form with numeric inputs. Revoke uses existing `AeConfirmDialog` with destructive styling, calling `agentAccessPolicy.revokeGrant`. Toggle pause simply flips a boolean flag `isSuspended` checked fail-closed in `admitCapabilityCall`. Never allow unconfirmed key destruction.
- **Anti-Generosity Reality Check:** Backend mutation `updateAgentSpendingLimitsServer` exists, but has no UI in the operator sheet. There is also no way to "pause" an agent without permanently revoking its credential.
- **Thesis Fit:** Operational control over agent spend without rotating keys.
- **Semantic Contract:**
  ```text
  CONTRACT: setAgentPaused(principalRef, paused: boolean)
    Requires: Caller has 'agents:manage_policy'.
    Ensures:  Updates admission policy flag; paused agent requests fail closed with 'agent_paused'.
  ```
- **Implementation Seams:** `convex/agentSpendingPolicy.ts`, `AeAgentOperatorConsole.tsx`.

---

#### W-29: Per-Agent Call History & Filtered Economic Drill-Down
- **Gold Standard Design Reference:** [Stripe API Logs Filtered by Key](https://docs.stripe.com/logs) & [WorkOS Audit Events Filter](https://workos.com/docs/events)
- **Zero-Handroll Implementation Blueprint:** Route `_operator/agents.$agentRef.tsx` queries existing `capabilityCallProjection` indexed by `by_caller_principal` (`accountRef`, `callerPrincipalRef`). Renders via existing `AeRecordTable` with predefined filter prop. Never write new indexing pipelines for existing relational projections.
- **Anti-Generosity Reality Check:** The global activity table does not allow filtering by caller agent, preventing operators from diagnosing which specific bot caused an error or incurred a charge.
- **Thesis Fit:** Economic debugging per agent.
- **Semantic Contract:** Filter `capabilityCallProjections` by `callerPrincipalRef` and link rows directly to `/calls/$callRef`.
- **Implementation Seams:** `AeAgentCallHistoryTable.tsx`, `_operator/agent-access.tsx`.

---

### Module 7: Supplier Onboarding & Payout Workflows

#### W-30: Supplier Activation Wizard ("Start Selling" Intent & Verification Pipeline)
- **Gold Standard Design Reference:** [Stripe Connect Marketplace Onboarding Guide](https://docs.stripe.com/connect/hosted-onboarding) & [Whop Seller Onboarding Flow](https://whop.com/sell/)
- **Zero-Handroll Implementation Blueprint:** Component `AeSupplierOnboardingWizard.tsx` guides the user across 3 clear gates. Step 2 directly calls the existing `stripe.accountLinks.create` action (`src/lib/server/stripe-connect-evidence.ts`), delegating all bank collection and KYC verification to Stripe. Never write custom bank account forms, identity uploaders, or KYC compliance engines.
- **Anti-Generosity Reality Check:** Suppliers visiting `/owner/operations` are dropped into an empty table or redirected to raw OpenAPI imports before setting up their identity or bank account, causing tool publishes to fail or strand earnings.
- **Thesis Fit:** Guides suppliers through identity, payouts, and tool admission.
- **Semantic Contract:**
  ```text
  CONTRACT: advanceSupplierActivationStep(businessId, step, payload)
    Requires: Authenticated owner; valid step sequence: profile -> connect -> first_tool.
    Ensures:  Persists validated profile (ABN verified) and Stripe Connect state.
  ```
- **Implementation Seams:** `supplierActivationProfiles` table, `AeSupplierOnboardingWizard.tsx`, `owner.operations.tsx`.

---

#### W-31: Self-Serve Stripe Connect Hosted Onboarding & Real-Time Readiness Polling
- **Gold Standard Design Reference:** [Stripe Official Connect Onboarding Sample](https://github.com/stripe-samples/connect-onboarding-for-marketplaces) & [Stripe Account Links API](https://docs.stripe.com/api/account_links)
- **Zero-Handroll Implementation Blueprint:** Server creates single-use URL via `stripe.accountLinks.create({ account, type: 'account_onboarding', refresh_url, return_url })`. The return URL navigates to `/owner/operations?onboarding=return`, where a React query polls Convex `moneyConnect.readConnectAccount`. When webhook `account.updated` sets `details_submitted: true` and `payouts_enabled: true`, the UI displays a success badge. Never treat return URL visit as proof of KYC completion without server-side verification.
- **Anti-Generosity Reality Check:** Backend link creation exists, but lacks a dedicated return route to poll Stripe status. Users returning from Stripe are stranded on static pages before webhooks arrive.
- **Thesis Fit:** Bank account connection for provider obligation settlement.
- **Semantic Contract:**
  ```text
  CONTRACT: pollConnectReadiness(businessId)
    Ensures: Polls Convex projection updated by webhook; returns 'ready' when charges_enabled and payouts_enabled are true.
  ```
- **Implementation Seams:** `src/routes/_operator/owner.payouts.return.tsx`, `AeConnectReturnPoller.tsx`.

---

#### W-32: Payouts & Earnings Dashboard (Gross vs Rake vs Net vs Held & Express SSO)
- **Gold Standard Design Reference:** [Stripe Express Dashboard SSO](https://docs.stripe.com/connect/express-dashboard) & [Locus Supplier Earnings UI](https://bitrupt.co/blog/stripe-connect-marketplace)
- **Zero-Handroll Implementation Blueprint:** Supplier balance metrics are queried from Formance double-entry ledger via Convex. For historical bank payouts, tax 1099/financial summaries, and bank transfer statuses, generate an ephemeral single-sign-on link via `stripe.accounts.createLoginLink(accountId)`. Clicking "View Bank Transfers" opens Stripe's hosted Express portal. Never rebuild banking statements or 1099 tax forms.
- **Anti-Generosity Reality Check:** Earnings card displays static numbers without reconciling Available vs Pending clearance vs Paid out, and lacks a one-click SSO link to the Stripe Express Dashboard.
- **Thesis Fit:** Supplier financial transparency.
- **Semantic Contract:**
  ```text
  CONTRACT: createExpressDashboardLoginLink(businessId)
    Requires: Connect state is 'ready'.
    Ensures:  Generates single-use Stripe login link via stripe.accounts.createLoginLink.
  ```
- **Implementation Seams:** `src/lib/server/stripe-connect-evidence.ts` (`createExpressDashboardLink`), `AeEarningsDashboard.tsx`.

---

#### W-33: Configurable Payout Schedule, Minimum Threshold & Automated Settlement
- **Gold Standard Design Reference:** [Stripe Connect Settings API (Payout Schedules)](https://docs.stripe.com/connect/manage-payout-schedules) & [Whop Payout Thresholds](https://whop.com/sell/)
- **Zero-Handroll Implementation Blueprint:** Store supplier minimum payout preferences in Convex `moneySupplierPreferences`. Automated payout dispatch is executed via existing Formance settlement worker, respecting `minimumPayoutUnits`. For payout schedules (daily/weekly/monthly), delegate directly to Stripe Connect's native settings API (`stripe.accounts.update(accountId, { settings: { payouts: { schedule: { interval } } } })`). Never build a custom banking clearinghouse.
- **Anti-Generosity Reality Check:** Payout threshold is hardcoded in schema with no supplier UI to adjust payout frequency (Monthly vs Weekly vs Manual).
- **Thesis Fit:** Predictable settlement cycles.
- **Semantic Contract:** Persist `payoutPolicy` with minimum threshold and schedule; evaluated automatically by settlement cron.
- **Implementation Seams:** `convex/moneyPayoutPolicy.ts`, `AePayoutPolicyForm.tsx`.

---

### Module 8: Tool Catalog & In-App Testing Workflows

#### W-34: Tool Inventory Table with Full Lifecycle, Pricing & Operational Metrics
- **Gold Standard Design Reference:** [Stripe Products & Prices Catalog](https://docs.stripe.com/products-prices/overview) & [Whop Creator Product Dashboard](https://whop.com/sell/)
- **Zero-Handroll Implementation Blueprint:** Render via `@tanstack/react-table` over Convex query `capabilitySupplyProjection.listOwnerTools`. Prices are projected exclusively through `displayPriceFromPricingConfig` (from `src/modules/money/public.ts`). Never handroll price formatters or bespoke table filter state machines.
- **Anti-Generosity Reality Check:** Inventory table displays only Name and Status, omitting Version, Protocol (OpenAPI vs MCP), Price per call, Monthly Calls, and Earnings.
- **Thesis Fit:** Supplier inventory health.
- **Semantic Contract:** Join tool catalog projections with call metrics; render price strictly via `displayPriceFromPricingConfig`.
- **Implementation Seams:** `AeOwnerOfferings.tsx`, `src/modules/capability-supply/owner-inventory.ts`.

---

#### W-35: Add Tool Wizard with In-Line Preflight Connectivity & Schema Validation
- **Gold Standard Design Reference:** [Scalar OpenAPI Importer / Parser](https://github.com/scalar/scalar) & [Zuplo API Gateway Onboarding](https://zuplo.com/docs)
- **Zero-Handroll Implementation Blueprint:** Use `@scalar/openapi-parser` (already installed) to validate uploaded schemas in browser memory before network calls. Authentication tokens are saved via standard pointer pattern to `secretReferenceTables`. Pricing is captured via numeric currency stepper feeding directly into `pricingConfigForOffering`. Never handroll custom OpenAPI regex scanners or write unencrypted secrets.
- **Anti-Generosity Reality Check:** Users advance past the endpoint input before HTTP reachability checks complete, causing silent draft failures.
- **Thesis Fit:** Admission gate: only reachable tools with valid schemas can be published.
- **Semantic Contract:** Block wizard step advancement until `preflightOwnerOpenApiDocument` returns 200 OK and validates operations.
- **Implementation Seams:** `AeToolWizardPreflightPanel.tsx`, `src/modules/capability-supply/supply-preflight.functions.ts`.

---

#### W-36: In-App Interactive Test Console (Zero-Cost Sandbox Playground)
- **Gold Standard Design Reference:** [RazeGrowth API Playground Design Benchmark](https://razegrowth.com/blog/api-playground-design-converts) & [Swagger UI / Scalar API Client](https://github.com/scalar/scalar)
- **Zero-Handroll Implementation Blueprint:** Component `AeToolTestPlayground.tsx` uses `@rjsf/shadcn` (React JSON Schema Form, already installed) to auto-generate form controls directly from the tool's JSON Schema. The "Send Test Request" action dispatches to Convex `runProviderSandboxTest`, measuring latency and rendering response payloads highlighted with `shiki`. Never build bespoke form inputs for arbitrary JSON schemas.
- **Anti-Generosity Reality Check:** Suppliers have no in-app test console and must rely on external curl or integration tests to see if their tool works.
- **Thesis Fit:** Pre-publish verification without buyer financial risk.
- **Semantic Contract:**
  ```text
  CONTRACT: executeOwnerToolDryRun(toolRef, operationId, inputJson)
    Requires: Owner owns tool; input matches schema.
    Ensures:  Executes sandbox probe; returns status, latency (ms), and output payload;
    Invariant: MUST NOT create Call records or charge buyer balances.
  ```
- **Implementation Seams:** `AeToolTestPlayground.tsx` on `owner.operations.$toolRef.tsx`, `convex/capabilitySupplyOwnerDryRun.ts`.

---

#### W-37: Tool Revision Management, Price Modification & Graceful Catalog Withdrawal
- **Gold Standard Design Reference:** [Stripe Product Archiving Lifecycle](https://docs.stripe.com/products-prices/overview#archive-products) & [Whop Product Visibility Controls](https://whop.com/sell/)
- **Zero-Handroll Implementation Blueprint:** Wire drawer actions to existing `capabilitySupplyOwnerWithdrawRepublish.ts` mutations. Price updates generate an immutable new version revision while leaving existing quotes locked to the previous version. "Unpublish" sets state to `withdrawn` without mutating historical records. Never mutate historical prices in-place.
- **Anti-Generosity Reality Check:** In-place price modifications without version bumping violate quote immutability.
- **Thesis Fit:** AM-17 lifecycle integrity.
- **Semantic Contract:** Price changes issue a new publication revision; old revision is frozen for new quotes while in-flight calls complete under original terms.
- **Implementation Seams:** `AeToolPriceRevisionDialog.tsx`, `convex/capabilitySupplyOwnerWithdrawRepublish.ts`.

---

### Module 9: Activity, Receipts & Audit Log Workflows

#### W-38: Central Activity Feed with Multi-Dimensional Filtering & Actor Attribution
- **Gold Standard Design Reference:** [WorkOS Audit Trail Component](https://workos.com/docs/audit-logs) & [Stripe Dashboard Payments Table](https://docs.stripe.com/payments)
- **Zero-Handroll Implementation Blueprint:** Compose via `@tanstack/react-table` over Convex query `capabilityCallProjection.listOwnerCalls`. Uses Radix `<Popover />` for date range picker and `<Select />` for call status filter. Formats durations and timestamps via standard browser `Intl` APIs. Never build custom table sorting pipelines or homebrew pagination indices.
- **Anti-Generosity Reality Check:** `/activity` lacks date range pickers, status filters, and duration columns, despite backend support.
- **Thesis Fit:** Buyer outcome tracking and reconciliation.
- **Semantic Contract:** Paginated indexed query supporting `createdAtFrom`, `createdAtTo`, `state`, and `callerPrincipalRef`.
- **Implementation Seams:** `AeActivityFilters.tsx`, `src/routes/_operator/activity.tsx`.

---

#### W-39: Actionable Call Receipt with Diagnostic Playbooks & Input/Output Inspection
- **Gold Standard Design Reference:** [Stripe Payment Intent Inspection](https://docs.stripe.com/payments/paymentintents/lifecycle) & [Svix Event Delivery Inspector](https://docs.svix.com/inspect)
- **Zero-Handroll Implementation Blueprint:** Renders in `CallReceiptWorkspace.tsx`. Status banners map directly from RFC 9457 error taxonomy via `call-recovery-contracts.ts`. JSON argument and payload viewers are rendered via `shiki` syntax highlighter with collapsible `<details>` disclosure. Never build bespoke JSON tree inspectors from scratch.
- **Anti-Generosity Reality Check:** Failure states show machine codes (e.g. `rate limited`) without human-actionable diagnostic advice.
- **Thesis Fit:** "Understand and recover every resulting purchase."
- **Semantic Contract:** Map refusal codes (`provider_timeout`, `provider_http_5xx`, `schema_input_invalid`) to diagnostic playbooks with root causes and remediation links.
- **Implementation Seams:** `src/modules/capability-execution/call-receipt-diagnostics.ts`, `CallReceiptWorkspace.tsx`.

---

#### W-40: RFC 4180 Compliant Activity & Billing CSV Export Engine
- **Gold Standard Design Reference:** [Stripe Balance Activity CSV Export](https://docs.stripe.com/reports/balance) & [RFC 4180 CSV Specification](https://datatracker.ietf.org/doc/html/rfc4180)
- **Zero-Handroll Implementation Blueprint:** Lightweight in-browser client export using a compliant RFC 4180 string builder (`items.map(row => [escape(row.date), ...].join(',')).join('\r\n')`) triggered via a Blob URL download (`URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))`). For workspace-wide bulk exports (>10,000 rows), Convex action streams rows. Never introduce heavyweight server-side spreadsheet rendering dependencies.
- **Anti-Generosity Reality Check:** E-O4 FAIL. No export capability exists for finance and accounting reconciliation.
- **Thesis Fit:** External accounting and compliance reporting.
- **Semantic Contract:**
  ```text
  CONTRACT: exportOwnerCallsCsv(filter)
    Ensures: Streams RFC 4180 compliant CSV: Date, CallId, ToolName, ProviderRef, AgentName, CostAUD, GstAUD, Status.
  ```
- **Implementation Seams:** `src/modules/export/rfc4180.ts`, `ExportCsvButton.tsx` on `/activity` and `/owner/credit`.

---

### Module 10: UI/UX Interaction & State Standards

#### W-41: Standardized Empty States with Contextual Primary CTAs Across All Surfaces
- **Gold Standard Design Reference:** [Shadcn UI Empty State Pattern](https://ui.shadcn.com) & [Dub.co Empty State Illustrations](https://github.com/dubinc/dub/blob/main/apps/web/ui/shared/empty-state.tsx)
- **Zero-Handroll Implementation Blueprint:** Standardize on existing component `src/components/ae/feedback/AeEmptyState.tsx`. Accepts `icon`, `title`, `description`, and `action` button prop. Replace all raw `<p>No records found</p>` instances across tables with `<AeEmptyState />`.
- **Anti-Generosity Reality Check:** Major tables have empty states, but sub-queues use raw `<p>` tags, creating disjointed UX.
- **Thesis Fit:** Clear user orientation and primary action prompts.
- **Semantic Contract:** Standardize all zero-row states on `AeTableEmptyState` with primary action button.
- **Implementation Seams:** `AeTableEmptyState.tsx`, `CallQueue.tsx`.

---

#### W-42: Layout-Stable Pulse Loading Skeletons for Tables, Cards, and Receipts
- **Gold Standard Design Reference:** [Shadcn Skeleton Primitive](https://ui.shadcn.com/docs/components/skeleton) & [Radix UI Accessible Loading Guidelines](https://www.radix-ui.com)
- **Zero-Handroll Implementation Blueprint:** Compose Tailwind `animate-pulse bg-muted rounded` skeleton shapes matching the target component dimensions. Route pending states use TanStack Router `pendingComponent` mounting the skeleton. Precludes all Cumulative Layout Shift (CLS).
- **Anti-Generosity Reality Check:** Call receipts display raw text during load, causing cumulative layout shift (CLS).
- **Thesis Fit:** Perceived reliability during high-stress recovery moments.
- **Semantic Contract:** Replace text loaders with dimension-matched pulse skeletons (`CallReceiptSkeleton.tsx`).
- **Implementation Seams:** `CallReceiptSkeleton.tsx`, `calls.$callRef.tsx`.

---

#### W-43: Unified Mutation Feedback Toasts (Sonner Integration & Copy Standards)
- **Gold Standard Design Reference:** [Sonner Toast Notifications](https://sonner.emilkowal.ski/) (Emil Kowalski) & [Radix Toast Accessibility](https://www.radix-ui.com/primitives/docs/components/toast)
- **Zero-Handroll Implementation Blueprint:** Call `toast.success()`, `toast.error()`, or `toast.promise(mutation, { loading: 'Updating...', success: 'Saved', error: (err) => err.message })` via `sonner` (already in `package.json`). Replace all inline timeout-based "Copied!" state booleans with `toast.success('Copied to clipboard')`.
- **Anti-Generosity Reality Check:** Sonner is mounted but only called in one file across the repo. Mutations rely on raw unstyled alerts.
- **Thesis Fit:** Clear confirmation of authority and financial operations.
- **Semantic Contract:** Standardize all mutations on `useAeMutationToast()` hook with accessible role="status" announcements.
- **Implementation Seams:** `src/hooks/useAeMutationToast.ts`, `src/lib/ui/toast.ts`.

---

#### W-44: Accessible Destructive Action Confirmation Modals (`AeConfirmDialog` Enforcement)
- **Gold Standard Design Reference:** [Radix UI `<AlertDialog />`](https://www.radix-ui.com/primitives/docs/components/alert-dialog) & [GitHub Repository Deletion Confirmation](https://docs.github.com/en/repositories/creating-and-managing-repositories/deleting-a-repository)
- **Zero-Handroll Implementation Blueprint:** Mount existing component `src/components/ae/feedback/AeConfirmDialog.tsx` wrapping `@radix-ui/react-alert-dialog`. Traps focus, handles Escape key, dims backdrop, and renders destructive red confirmation button with pending spinner. Never use `window.confirm()` or un-trapped div modals.
- **Anti-Generosity Reality Check:** `AeConfirmDialog` exists in 7 flows, but destructive API key revocation and future team removals are unprotected.
- **Thesis Fit:** Prevents accidental catastrophic revocation.
- **Semantic Contract:** Enforce `AeDestructiveConfirm` modal on all revocations, member removals, and workspace deletions.
- **Implementation Seams:** `AeDestructiveConfirm.tsx`, `AeAgentOperatorConsole.tsx`.

---

## 5. Strategic Dependency Spine & Implementation Waves

Execution must proceed strictly bottom-up by fact dependencies:

```text
WAVE 1 [THE TENANCY & AUTHORITY SPINE] (P0 Blockers)
  ├── W-10: Multi-Tenant Authority Resolver & interactiveSessionSelections
  ├── W-11: Workspace Creation Mutation & Modal
  ├── W-12: Workspace Profile & Settings
  └── W-02: Post-Registration Onboarding (Intent + Workspace Name)

WAVE 2 [TEAM COLLABORATION & RBAC] (P0 Blockers)
  ├── W-15: Team Member Directory & Roles Projection
  ├── W-16: Cryptographic Email Invitations (7-day tokenDigest)
  ├── W-17: Forked Invitation Acceptance Route & Atomic Join
  ├── W-18: Hierarchical Role Management Fences
  └── W-19: Member Removal & Session Access Invalidation

WAVE 3 [SUPPLIER ONBOARDING & ECONOMIC SETTLEMENT] (P0 Blockers)
  ├── W-30: Supplier Activation Wizard
  ├── W-31: Stripe Connect Hosted Link & Return URL Poller
  ├── W-32: Earnings Dashboard & Express SSO Link
  ├── W-33: Payout Threshold & Schedule Preferences
  └── W-36: In-App Interactive Test Playground

WAVE 4 [BUYER BILLING, BUDGETS & COMPLIANCE] (P1)
  ├── W-13: Customer Tax Facts (ABN Checksum) Form
  ├── W-23: Organization Monthly Spend Ceiling (Fail-Closed Gate)
  ├── W-21: Auto-Recharge Engine (SetupIntent Off-Session)
  ├── W-22: Saved Cards Customer Portal Bridge
  └── W-24: Australian Tax Invoice Download Unblock

WAVE 5 [AGENT ACCESS & DEVELOPER UX] (P1)
  ├── W-25: Connected Agent Spend Utilization Progress
  ├── W-26: Interactive Agent Provisioning Wizard
  ├── W-27: One-Time Key Reveal Modal with Cursor/Claude Snippets
  ├── W-28: In-Place Limit Editing & Agent Pause Toggle
  └── W-29: Filtered Call History per Agent

WAVE 6 [OBSERVABILITY, UX & MATURITY POLISH] (P1/P2)
  ├── W-05: Session Revocation Cascade to Machine Tokens
  ├── W-38: Multi-Dimensional Activity Filters & Date Pickers
  ├── W-39: Actionable Call Receipt Diagnostic Playbooks
  ├── W-40: RFC 4180 CSV Export Engine
  └── W-41 to W-44: Skeletons, Empty States, Sonner Toasts & Confirm Dialogs
```

---

*This document is the authoritative, ungenerous IceInVein specification for all 44 standard application workflows. No implementation will begin until sign-off.*
