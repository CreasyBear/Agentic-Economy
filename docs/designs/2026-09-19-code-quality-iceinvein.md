# Code Quality, Component Purity & Structural Decoupling: Deep IceInVein Specification

**Date:** 19 September 2026
**Status:** Comprehensive Master Design & Refactor Blueprint
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/operations/user-and-org-maturity-protocol.md`, `docs/operations/app-shell-maturity-protocol.md`
**Theoretical Foundations:** Martin Fowler (*PresentationDomainDataLayering*), Scott Wlaschin (*Domain Modeling Made Functional*), John Ousterhout (*A Philosophy of Software Design*), Alan Abramov / Dan Abramov (*Presentational and Container Components*), Bulletproof React Architecture.

---

## 1. Executive Thesis: The Law of Architectural Decoupling

> **"A UI component is a visual and tactile projection of data; it is neither the domain authority, the financial calculator, the database schema definition, nor the mutation dispatcher."**

### Why Our Codebase Accumulated Friction
Through rapid velocity across Alpha Maturity, System One, and User/Org workflows, the repository achieved high functional correctness and rigorous test coverage. However, speed created four insidious structural code-quality debts:
1. **Component Type Trapping:** Over 80 domain models, database readbacks, API payloads, and state machine unions are declared and exported directly from inside `.tsx` presentation components. Routes and sibling components import types *from* UI components, turning visual markup files into pseudo-contracts.
2. **Conflation of Leaf and Container Concerns:** Several major components (e.g. `AeSupplyEarningsCard`, `AeAgentSpendingLimitsForm`, `Chat`) directly invoke Convex queries, server functions, and OAuth fetch routines, while executing currency rescaling, BigInt quota burns, ABN checksums, and Australian GST calculations directly inside JSX render routines.
3. **The 1,000-Line Convex God-Files:** Six central backend files in `convex/` exceed 1,000 lines because they jam together validators, provisioning, authorization caches, webhook reads, and external API orchestration into monolithic procedural hubs.
4. **Command-Query Separation (CQS) Leaks & Barrel Cycles:**
   - Multiple read operations (e.g. `listAgentSupplyCalls`, `readAgentHandoff`) are registered as Convex *mutations* purely to consume a one-time `sourceWriteNonces` record, making read operations uncacheable and non-idempotent.
   - Internal files under `src/modules/<domain>/internal/` import types from their own module's `public.ts` barrel, causing circular dependency cycles.

---

## 2. The 5 Inviolable Code Quality Invariants

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    THE 5 INVIOLABLE CODE QUALITY RULES                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Rule 1: Component Type Quarantine (Absolute Prohibition)                        │
│   └─ .tsx files must NEVER define, export, or house domain models, DTOs, or     │
│      database types. Exactly ONE props type per file: <ComponentName>Props.     │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Rule 2: Pure Leaf Invariant (Zero Side-Effects)                                 │
│   └─ Leaf components receive pre-formatted view-models and callbacks. Zero      │
│      useQuery/useMutation/fetch; zero inline BigInt or GST math.               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Rule 3: Single Responsibility & The 500/1000 Line Ceilings                     │
│   └─ Components soft limit: 300 lines. Hard decomposition ceiling: 500 lines.   │
│      Backend modules hard ceiling: 1,000 lines (split into cohesive lib/ files).│
├─────────────────────────────────────────────────────────────────────────────────┤
│ Rule 4: Command-Query Separation (Pure Reads)                                   │
│   └─ Queries are 100% read-only and cache-safe. Reads never burn write nonces.  │
│      Mutations return receipts or status; queries return state without writes.  │
├─────────────────────────────────────────────────────────────────────────────────┤
│ Rule 5: Internal Modules Never Import Own Barrel                                │
│   └─ Files in src/modules/<domain>/internal/ must NEVER import from public.ts.  │
│      Shared types live in internal contracts; public.ts re-exports only.        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Component Type Quarantine & Destination Mapping

All 80+ trapped types are quarantined out of `.tsx` into dedicated contracts and view-models:

### Domain A: Principal & Account (`src/modules/principal-account/`)
- `OwnerOverviewSnapshot`, `NextAction`, `ProviderCard` $\rightarrow$ `src/modules/principal-account/owner-overview.view-model.ts`
- `DirectoryOwner`, `DirectoryMember`, `TeamDirectoryData`, `DirectoryRow` $\rightarrow$ `src/modules/principal-account/team.view-model.ts`
- `WorkspaceDecommissionEligibilityView` $\rightarrow$ `src/modules/principal-account/workspace-decommission.view-model.ts`
- `NotificationPreferencesView`, `NotificationPreferencePatch` $\rightarrow$ `src/modules/principal-account/notification-preferences.view-model.ts`
- `OnboardingRoleIntent`, `OnboardingSearch` $\rightarrow$ `src/modules/principal-account/onboarding.contracts.ts`

### Domain B: Money, Billing & Tax (`src/modules/money/`)
- `TaxProfileInitialData`, `TaxProfileSubmitPayload`, `CustomerTaxFactsRead` $\rightarrow$ `src/modules/money/tax-profile.view-model.ts`
- `AeInvoiceHistoryRow` $\rightarrow$ `src/modules/money/invoice-history.view-model.ts`
- `SavedPaymentMethodsSummary`, `CardBrandDisplay`, `ExpiryBadgeKind` $\rightarrow$ `src/modules/money/saved-payment-methods.view-model.ts`
- `AccountFundingPort`, `FundingUiState`, `FundingUiAction` $\rightarrow$ `src/modules/money/account-funding.contracts.ts`
- `AccountHistoryPort`, `AvailableAccountHistory`, `AccountHistoryState` $\rightarrow$ `src/modules/money/account-history.contracts.ts`
- `MonthlySpendCeilingPreset`, `MonthlySpendCeilingDiagnostic`, `UtilizationBand` $\rightarrow$ `src/modules/money/monthly-spend-ceiling.view-model.ts`
- `AutoRechargePreset`, `AutoRechargeDiagnostic` $\rightarrow$ `src/modules/money/auto-recharge.view-model.ts`
- `ConnectReturnDiagnostic`, `PollerStatus` $\rightarrow$ `src/modules/money/connect-return.view-model.ts`
- `PublicFunding`, `FundingReadResult`, `FundingPageEvent` $\rightarrow$ `src/modules/money/funding-return.view-model.ts`

### Domain C: Agent Access (`src/modules/agent-access/`)
- `IssuedAgentAccessReveal`, `AgentAccessKeyIssueResult` $\rightarrow$ `src/modules/agent-access/issue-key.contracts.ts`
- `SpendingDiagnostic`, `SpendingPresetId`, `MonthlyQuotaGauge` $\rightarrow$ `src/modules/agent-access/spending-policy.view-model.ts`
- `LifecycleCommand`, `LifecycleIssue`, `DirectoryPaginationIssue` $\rightarrow$ `src/modules/agent-access/agent-lifecycle.view-model.ts`
- `OAuthPermanentProblemCode` $\rightarrow$ `src/modules/agent-access/consent.contracts.ts`

### Domain D: Capability Supply & Offerings (`src/modules/capability-supply/`)
- `ProviderConnectionInspection` $\rightarrow$ `src/modules/capability-supply/provider-connection.contracts.ts`
- `SupplierOnboardingStep` $\rightarrow$ `src/modules/capability-supply/supplier-onboarding.contracts.ts`
- `ProviderToolActionOutcome` $\rightarrow$ `src/modules/capability-supply/provider-tool-actions.contracts.ts`
- `OwnerEarningsAccount` $\rightarrow$ `src/modules/capability-supply/earnings.view-model.ts`
- `ToolTestResponse`, `JsonSchemaProperty` $\rightarrow$ `src/modules/capability-supply/tool-test.contracts.ts`
- `OwnerOfferingSummary`, `OwnerToolAvailability`, `ProviderWorkspaceProjection` $\rightarrow$ `src/modules/capability-supply/provider-workspace.view-model.ts`

### Domain E: Market & Directory (`src/modules/market/`)
- `DirectoryExplorerFilterValues`, `DirectoryExplorerFilterPatch` $\rightarrow$ `src/modules/market/directory-filters.contracts.ts`
- `SavedDirectoryTool`, `StorageState`, `SavedToolsContextValue` $\rightarrow$ `src/modules/market/saved-tools.contracts.ts`
- `DirectoryToolCardModel` $\rightarrow$ `src/modules/market/directory-card.view-model.ts` (replaces raw `X402DirectoryEntry` in leaf)

### Domain F: Universal Diagnostic Triplet (`src/lib/ui/diagnostic.ts`)
- Unify `WizardDiagnostic`, `SpendingDiagnostic`, `DiagnosticTriplet`, `Rule4Diagnostic`, `PriceDiagnostic`, `PlaygroundDiagnostic` into a single canonical immutable contract:
  ```typescript
  export type Rule4Diagnostic = Readonly<{
    whatHappened: string;
    financialImpact: string;
    nextStep: string;
    helpLink?: string;
  }>;
  ```

---

## 4. Pure Leaf Decomposition: The Top 12 Refactor Blueprints

### Blueprint 1: `AeSupplyEarningsCard.tsx` (703 lines $\rightarrow$ Container + 4 Leaves)
- **Container / Hook (`src/components/ae/supply/useOwnerPayoutActions.ts`):**
  Encapsulates `useReverification`, Stripe Connect onboarding links, Express SSO logins, and payout transfers.
- **Projection (`src/components/ae/supply/earnings-projection.ts`):**
  Maps `OwnerProviderEarningsReadback` to pure view facts.
- **Leaves:**
  - `EarningsFactsList.tsx`: Pure list of `AeFact`.
  - `PayoutActionBar.tsx`: Pure buttons with boolean availability flags and callbacks.
  - `PayoutConfirmDialog.tsx`: Dialog with static props and confirm callback.
  - `EarningsEmptyState.tsx`: Pure state badge.

### Blueprint 2: `Chat.tsx` (420 lines $\rightarrow$ Thin Orchestrator)
- **Hook (`src/components/ae/chat/useChatSession.ts`):**
  Encapsulates Convex queries (`listThreads`, `searchThreads`, `getShareState`), mutations (send, rename, delete, share), and abort controllers.
- **Presentation:** `Chat.tsx` becomes `<ChatLayout model={useChatSession(props)} />` with zero direct Convex imports.

### Blueprint 3: `AeAgentAccessAuthorizeForm.tsx` (586 lines $\rightarrow$ Hook + 5 Leaves)
- **Hook (`src/components/ae/agent-access/useAgentConsentDecision.ts`):**
  Owns `/oauth/authorize` HTTP calls, agent pagination, and market tool searches.
- **Leaves:**
  - `ConsentConnectionFieldset.tsx`
  - `AuthorityModeRadioGroup.tsx`
  - `ConsentToolAccessFieldset.tsx`
  - `ConsentDecisionBar.tsx`
  - `ConsentOutcomeView.tsx`

### Blueprint 4: `AeAgentSpendingLimitsForm.tsx` (832 lines $\rightarrow$ Shared Module + Hook + 4 Leaves)
- **Domain Module (`src/modules/agent-access/spending-limit-policy.ts`):**
  Shared parse, compare, preset match, and BigInt quota burn math (reusable in wizard).
- **Hook (`src/components/ae/console/useAgentSpendingLimits.ts`):**
  Manages edit/view toggle, optimistic generation tracking, and pause state.
- **Leaves:**
  - `SpendingPresetSelector.tsx`
  - `SpendingLimitInputs.tsx`
  - `MonthlyQuotaGauge.tsx`
  - `SpendingPauseToggle.tsx`

### Blueprint 5: `ToolsSearchPage.tsx` (684 lines $\rightarrow$ 2 Hooks + 4 Leaves)
- **Hooks:** `useMarketToolSearch.ts` (debounced fetch), `useCommandPaletteSelection.ts` (keyboard intent).
- **Leaves:** `CommandPaletteInput.tsx`, `CommandNavGroup.tsx`, `ToolSearchResultRow.tsx`, `ToolSearchStatus.tsx`.

### Blueprint 6: `AeConnectAgentWizardDialog.tsx` (462 lines $\rightarrow$ Reuses Spending Policy + Leaves)
- Reuses `spending-limit-policy.ts` and `SpendingLimitInputs` from Blueprint 4.
- Leaves: `AgentNameField.tsx`, `EnvironmentRadioCards.tsx`.

### Blueprint 7: `WorkspaceDangerZone.tsx` (348 lines $\rightarrow$ Container + 3 Leaves)
- **Container (`WorkspaceDangerZoneContainer.tsx`):** Calls Convex queries and mutations.
- **Leaves:** `WorkspaceClosePanel.tsx`, `WorkspaceTransferPanel.tsx`, `DecommissionFenceList.tsx`.

### Blueprint 8: `AeProviderWorkspace.tsx` (366 lines $\rightarrow$ Hooks + Clean Shell)
- Extract `useProviderWorkspaceInventory.ts` and `useProviderWorkspaceSheets.ts`.
- Eliminate all six inline `useServerFn` calls from the view markup.

### Blueprint 9: `AeSupplierOnboardingWizard.tsx` (438 lines $\rightarrow$ Hook + 3 Leaves)
- Extract `useSupplierOnboardingWizard.ts`. Shared ABN validation in `provider-identity-validation.ts`.
- Leaves: `OnboardingStepper.tsx`, `ProviderIdentityFields.tsx`, `PayoutsStep.tsx`.

### Blueprint 10: `AePriceUpdateModal.tsx` (357 lines $\rightarrow$ Domain Module + Hook + Leaves)
- Extract pure unit-tested `price-revision-preview.ts` for Australian GST split and delta calculations.
- Leaves: `PriceDeltaPreview.tsx`, `GstSplitBreakdown.tsx`, `PriceAdjustmentChips.tsx`.

### Blueprint 11: `AeToolTestPlayground.tsx` (370 lines $\rightarrow$ Domain Module + Hook + Leaves)
- Extract `tool-test-payload.ts` for schema walking and JSON extraction.
- Leaves: `JsonPayloadEditor.tsx`, `PlaygroundResponsePane.tsx`, `SimulationModeBanner.tsx`.

### Blueprint 12: `AeAgentOperatorConsole.tsx` (456 lines $\rightarrow$ 2 Hooks + Leaves)
- Extract `useAgentLifecycleDialog.ts` and `useAgentSelection.ts`.
- Leaves: `AgentRecordSheet.tsx`, `AgentLifecycleConfirmDialog.tsx`.

---

## 5. Convex God-File Decomposition Plan

Each monolithic file is factored into cohesive domain helpers under `convex/lib/`:

### 1. `convex/interactiveAuthority.ts` (1,172 lines)
- `convex/lib/interactiveAuthority/errors.ts` (Error codes and types)
- `convex/lib/interactiveAuthority/provisioning.ts` (Identity creation, credential generation rotation, expiry arming)
- `convex/lib/interactiveAuthority/facts.ts` (Cache-safe authority reads, context materialization)
- `convex/lib/interactiveAuthority/accountSelection.ts` (Active organization locator and access fact resolution)
- Root file reduced to **<200 lines** (pure entry point registrations and re-exports).

### 2. `convex/moneyAccountFunding.ts` (1,172 lines)
- `convex/lib/money/fundingValidators.ts` (Arg and return validators)
- `convex/lib/money/fundingOwnerCommands.ts` (Reserve, bind, read, and unknown handlers)
- `convex/lib/money/fundingAgentHandoff.ts` (Handoff reserve, bind, and read handlers)
- `convex/lib/money/fundingWebhookReads.ts` (Authorized webhook handler reads)
- `convex/lib/money/fundingInvoiceHistory.ts` (Tax invoice and receipt projection)
- Root file reduced to **<250 lines**.

### 3. `convex/capabilitySupplyPublish.ts` (1,135 lines)
- `convex/lib/capabilitySupply/sourceAuthority.ts` (Authority verification)
- `convex/lib/capabilitySupply/publishPrepared.ts` (Prepared publish, admission cases, directory row sync)
- `convex/lib/capabilitySupply/publishBootstrap.ts` (Bootstrap, seed, curated capabilities, withdrawal)
- `convex/lib/capabilitySupply/readPublication.ts` (Publication reads)
- Root file reduced to **<200 lines**.

### 4. `convex/capabilityQuotes.ts` (1,116 lines)
- `convex/lib/capabilityQuotes/financialSubjects.ts` (Grants, policies, spending periods)
- `convex/lib/capabilityQuotes/issueQuote.ts` (Quote creation and deterministic hashing)
- `convex/lib/capabilityQuotes/quoteAction.ts` (Action orchestration: Formance sync, rate lookup)
- Root file reduced to **<250 lines**.

### 5. `convex/capabilityProviderConnectionAttempts.ts` (1,105 lines)
- `convex/lib/providerConnections/attemptReserve.ts` (Reserve handlers)
- `convex/lib/providerConnections/attemptOwnerReads.ts` (Read and cancel handlers)
- `convex/lib/providerConnections/attemptPrepare.ts` (Secret and OAuth preparation)
- `convex/lib/providerConnections/attemptFinalize.ts` (Atomic finalize, connection creation, audit)
- Root file reduced to **<200 lines**.

### 6. `convex/capabilityCallProjection.ts` (1,041 lines)
- `convex/lib/callLifecycle/workerProjection.ts` (Command mapping and dispatch finalization)
- `convex/lib/callLifecycle/canaryProjection.ts` (Canary projection)
- `convex/lib/callLifecycle/recoveryProjection.ts` (Pure recovery status, persisted projection)
- `convex/lib/callLifecycle/supplyCalls.ts` (Provider call listings and summaries)
- Root file reduced to **<200 lines**.

---

## 6. CQS Rectification & Barrel Cycle Eradication

### CQS Rectification: Convert Nonce-Burning Reads to Pure Queries
Convert these 9 false-mutation reads to `query` / `internalQuery` handlers using `requireSourceRead`:
1. `readAgentHandoff` (`convex/moneyAccountFunding.ts`)
2. `listAgentSupplyCalls` (`convex/capabilityCallProjection.ts`)
3. `listAgent` / `readAgent` (`convex/capabilityProviderTools.ts`)
4. `readAgentStatus` (`convex/capabilityProviderOffboarding.ts`)
5. `list` / `read` (`convex/capabilityProviderConnectionAgents.ts`)
6. `readAgentOwnerSupplyFunnel` (`convex/capabilitySupplyOwnerFunnel.ts`)
7. `activity` (`convex/agentMoneyReads.ts`)
8. `list` / `read` (`convex/marketDemandSignals.ts`)
9. `readAgentProviderEarnings` (`convex/moneyLedger.ts`)

### Barrel Cycle Eradication (Ceiling 32 $\rightarrow$ 0)
- **The Inviolable Import Rule:** No file under `src/modules/<domain>/internal/` may import from `src/modules/<domain>/public.ts`.
- **Eradication Steps:**
  1. Move shared types (`MoneyRefusal`, `MoneyPayout`, `PricingResolution`, `RakeConfig`) from `src/modules/money/public.ts` into `src/modules/money/internal/money-types.ts`.
  2. Move admin types from `src/modules/security/public.ts` into `src/modules/security/internal/admin-authority-types.ts`.
  3. Move observability types from `src/modules/observability/public.ts` into `src/modules/observability/internal/literals.ts`.
  4. Move discovery options from `src/modules/discovery/public.ts` into `src/modules/discovery/internal/discovery-file-types.ts`.
  5. Lower dependency-cruiser ratchet ceiling in `tools/dev/deps-ratchet.ts` to 0.

---

## 7. Topology, File Structure & Directory Layout Specifications

Every subagent refactoring must preserve strict physical folder boundaries:

### 1. Compound Component Directory Pattern
When any component is decomposed (Container + Hook + Leaves + Contracts), it must be housed in a compound folder:
```text
src/components/ae/<domain>/<feature-name>/
  ├── <ComponentName>.tsx          # Smart Container / Orchestrator (<150 lines)
  ├── use<ComponentName>.ts        # State machine, calculations & mutations hook
  ├── <feature-name>.contracts.ts  # View-model contracts & pure leaf props definitions
  ├── <ComponentName>Skeleton.tsx  # Colocated zero-CLS loading skeleton
  ├── <ComponentName>.test.tsx     # Colocated unit test for leaf rendering
  └── components/                  # Pure Leaf Presenters (<150 lines each)
        ├── <SubSectionOne>.tsx
        └── <SubSectionTwo>.tsx
```

### 2. Convex Façade Router Pattern
To preserve Convex generated RPC paths (`api.<module>.<method>`):
```text
convex/
  ├── <module>.ts                  # Thin Façade (<200 lines): RPC endpoint schemas & delegations
  └── <module>/                    # Internal logic submodules (<400 lines each)
        ├── <submoduleOne>.ts      # Pure business logic & database transactions
        ├── <submoduleTwo>.ts      # Telemetry & verification helpers
        └── <module>.contracts.ts  # Backend-internal type definitions
```

### 3. Three-Tier Component Hierarchy
- **Tier 1 (Atomic Primitives):** `src/components/ui/` (Zero domain logic, zero `@/modules/*` imports).
- **Tier 2 (Shared Domain Primitives):** `src/components/ae/shared/` (Cross-domain badges, copy buttons, currency displays).
- **Tier 3 (Feature Compounds):** `src/components/ae/<domain>/<feature>/` (Encapsulated workflow packages).

### 4. Ultra-Thin Route Controllers
Files in `src/routes/` are strictly controllers (<80 lines). They validate search params via Zod, invoke loaders, and render the Page Container from `src/components/ae/`. All state, modals, and layouts reside inside the component container.

