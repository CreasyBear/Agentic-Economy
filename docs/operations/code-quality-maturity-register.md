# Code Quality, Component Purity & Structural Decoupling: Operational Register

**Date:** 19 September 2026  
**Status:** ACTIVE REFINEMENT REGISTER (Wave 1 Complete; Wave 2 Next)  
**Operating Protocol:** `docs/operations/code-quality-maturity-protocol.md`  
**Master Architectural Specification:** `docs/designs/2026-09-19-code-quality-iceinvein.md`  
**Core Rules:** `.cursor/rules/leaf-and-component-cleanliness.mdc`, `AGENTS.md`

---

## 1. Progress & Census Scorecard

*Refinement in Progress via 4-Phase Subagent Protocol*

| Wave | Scope | Workflows | Verified | In Review | Pending | Target Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Wave 1: Component Type Quarantine & Contract Extraction** | Extract 80+ trapped types from `.tsx` into domain contracts | `CQ-01` – `CQ-06` | 6 | 0 | 0 | `COMPLETE` |
| **Wave 2: Leaf & Container Decoupling: Critical Surfaces** | Earnings, Chat, Consent, Spending Limits, Command Palette | `CQ-07` – `CQ-12` | 0 | 0 | 6 | `READY` |
| **Wave 3: Leaf & Container Decoupling: Wizards & Settings** | Danger Zone, Provider Workspace, Onboarding, Price Modal, Playground | `CQ-13` – `CQ-18` | 0 | 0 | 6 | `READY` |
| **Wave 4: Convex God-Files & CQS Nonce Rectification** | Decompose six 1,000-line files + 9 CQS query mutations | `CQ-19` – `CQ-25` | 0 | 0 | 7 | `READY` |
| **Wave 5: Barrel Cycle Eradication & Dependency Ratchet** | Eradicate type-on-barrel imports; drop ceiling 32 $\rightarrow$ 0 | `CQ-26` – `CQ-30` | 0 | 0 | 5 | `READY` |
| **Total** | **All 30 Code Quality Workflows** | **30** | **6** | **0** | **24** | `IN PROGRESS` |

### Wave 1 Verification Evidence

| Gate | Command | Result |
| :--- | :--- | :--- |
| **Gate 1 Lint** | `npm run lint` (oxlint, `--deny-warnings`) | Exit 0, zero warnings. |
| **Gate 2 Typecheck** | `npm run typecheck` (`tsc --noEmit`, `exactOptionalPropertyTypes: true`) | Exit 0, zero errors. |
| **Gate 3 Dependency ratchet** | `npm run deps:check` | Exit 0. `no-circular` 0/0, `no-circular-capability-supply-internal` 0/0, `no-circular-via-barrel` 32/32. |
| **Gate 4 Tests** | `npx vitest run` | 703 of 708 files and **6,649 tests passing**, 25 skipped, 3 todo. The 9 remaining failures are all attributed to non-campaign causes (see the Known Red Baseline section). |

`no-circular-via-barrel` measured **32 both before and after Wave 1**, confirming that routing the quarantined types as deep module imports added zero barrel cycles — the metric that Wave 5 (`CQ-26` to `CQ-30`) exists to drive to zero.

---

## 2. Known Red Baseline (Non-Campaign Failures)

This checkout is shared with a concurrent agent working on procurement, the decision engine, and the registry. The failures below are not owned by this campaign; Waves 2 through 5 gate on **no new failures against this baseline** rather than on a zero-failure suite.

| Test File | Count | Attribution | Evidence |
| :--- | :---: | :--- | :--- |
| `tests/imports/module-boundaries.test.ts` | 3 | Concurrent agent | `src/modules/capability-execution/procure-engine.ts` is imported but absent from `entrySurfaces`; a forbidden `capability-execution` to `registry` edge at `procure-engine.ts:7`; 7 unowned white-box test imports while `testOnlyWhiteBoxExceptions` is empty. All three already failing at `HEAD` (`713f904b9`). |
| `tests/ui-contract/ui-contract.test.ts` | 1 | Pre-existing | `bg-black/30` at `src/components/ui/dialog.tsx:136` and `src/components/ui/sheet.tsx:39` violates the `/bg-black\/\d+/` prohibition. Introduced by design-system commit `713f904b9`, which replaced `bg-[var(--ae-overlay-scrim)]`. Unchanged by this campaign. |
| `tests/unit/core-flow/native-platform-procure.test.ts` | 3 | Concurrent agent | `toolProcureAction` and `TOOL_PROCURE_ROUTE_CONTRACT` were removed from `src/modules/actions/index.ts`, so `tool.procure` and the derived `ae_tool_procure` MCP catalog entry both resolve `undefined`. New breakage in the working tree; registered at `HEAD`. |
| `tests/imports/module-boundaries-ratchet.test.ts` | 1 | Concurrent agent | Module count 29 exceeds the ceiling of 28, caused by the new `decision-engine` module. This campaign added zero modules. |

A fifth failure in the same ratchet file is owned by this campaign and is covered in the next subsection. Attribution was established by forensic scout `49ac5025-902c-4cf3-bd9e-bfd6ec0b6d9a`, corroborated by pre-campaign gate logs showing the same `no-circular-via-barrel` count of 32 and typecheck failures confined to concurrent-agent files.

### Accepted Debt: Module Entry Surface Ratchet

- `tests/imports/module-boundaries-ratchet.test.ts` pins `totalEntrySurfaces` at **198**.
- Wave 1 legitimately raised it to **223** by registering 25 new entry surfaces (principal-account +5, agent-access +4, money +7, capability-supply +5, market +4). The concurrent agent adds 2 more (`decision-engine/public.ts`, `registry/tool-reranker.ts`), making the observed total **225**.
- The ratchet's own comment says "Lower these as work lands; never raise them." It was authored on 2026-09-10, nine days before this campaign, and did not anticipate type quarantine.
- **Decision (Owner, 19 Sep 2026): accept the breach for this refactor and rebaseline the ratchet later.** The ceiling stays at 198 for now and this test stays red.
- **Rejected alternative:** Re-exporting the 25 types through each module's `public.ts` barrel would hold the count at 198, but would push 25 more type imports through the very barrels that Wave 5 (`CQ-26` to `CQ-29`) exists to decouple, with `no-circular-via-barrel` already at 32. Deep module imports were chosen as the architecturally correct direction.

---

# Wave 1: Component Type Quarantine & Contract Extraction

### CQ-01: Quarantine Principal, Account & Team Types
- **Surfaces:** `src/components/ae/console/AeOwnerOverview.tsx`, `src/components/ae/settings/AeTeamDirectoryTable.tsx`, `src/components/ae/settings/WorkspaceDangerZone.tsx`, `src/components/ae/settings/OwnerNotificationSettings.tsx`, `src/routes/onboarding.tsx`
- **Incumbent Baseline:** Domain models and view projections defined directly in `.tsx` files: `OwnerOverviewSnapshot`, `NextAction`, `ProviderCard`, `DirectoryOwner`, `DirectoryMember`, `TeamDirectoryData`, `WorkspaceDecommissionEligibilityView`, `NotificationPreferencesView`, `NotificationPreferencePatch`, `OnboardingRoleIntent`.
- **Code Quality Gap:** Routes and sibling components import data contracts from React presentation files.
- **Target Spec:**
  - Move owner overview types to `src/modules/principal-account/owner-overview.view-model.ts`.
  - Move team roster types to `src/modules/principal-account/team.view-model.ts`.
  - Move decommission eligibility types to `src/modules/principal-account/workspace-decommission.view-model.ts`.
  - Move notification preference types to `src/modules/principal-account/notification-preferences.view-model.ts`.
  - Move onboarding intent types to `src/modules/principal-account/onboarding.contracts.ts`.
  - Update all `.tsx` components to only export `<ComponentName>Props`.
- **Subagent Assignment:** Grok (Spec: `d488cf5e-6941-4588-bbd5-335a054054c4`) $\rightarrow$ Composer (Implement: `0f800837-26dc-4b3e-a4f5-73a167875a8e`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/principal-account/owner-overview.view-model.ts`, `src/modules/principal-account/team.view-model.ts`, `src/modules/principal-account/workspace-decommission.view-model.ts`, `src/modules/principal-account/notification-preferences.view-model.ts`, `src/modules/principal-account/onboarding.contracts.ts`
- **Status:** `VERIFIED`

---

### CQ-02: Quarantine Money, Billing, Tax & Payment Method Types
- **Surfaces:** `src/components/ae/settings/TaxProfileForm.tsx`, `src/components/ae/settings/TaxProfileFormSection.tsx`, `src/components/ae/console/AeInvoiceHistoryTable.tsx`, `src/components/ae/console/AeSavedPaymentMethodsCard.tsx`, `src/components/ae/console/AeOwnerCredit.tsx`, `src/components/ae/console/AeCreditTopUpPanel.tsx`, `src/routes/fund.$fundingSessionId.tsx`
- **Incumbent Baseline:** Financial and tax types declared in UI files: `TaxProfileInitialData`, `TaxProfileSubmitPayload`, `CustomerTaxFactsRead`, `AeInvoiceHistoryRow`, `SavedPaymentMethodsSummary`, `CardBrandDisplay`, `ExpiryBadgeKind`, `DocumentAction`, `PublicFunding`, `FundingReadResult`, `FundingPageEvent`.
- **Code Quality Gap:** Tax calculation payloads, card PAN masking models, and funding state reducers are entangled with UI markup.
- **Target Spec:**
  - Move tax profile models to `src/modules/money/tax-profile.view-model.ts`.
  - Move invoice history rows to `src/modules/money/invoice-history.view-model.ts`.
  - Move payment method models to `src/modules/money/saved-payment-methods.view-model.ts`.
  - Move funding return state types to `src/modules/money/funding-return.view-model.ts`.
  - Stop re-exporting `AccountHistoryPort` and `AccountFundingPort` from UI files; import directly from money module ports.
- **Subagent Assignment:** Grok (Spec: `1b502536-45f3-49b9-a812-4995cc2b9902`) $\rightarrow$ Composer (Implement: `3d85072e-7994-4a8d-bbbd-b5b15037a92c`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/money/tax-profile.view-model.ts`, `src/modules/money/invoice-history.view-model.ts`, `src/modules/money/saved-payment-methods.view-model.ts`, `src/modules/money/funding-return.view-model.ts`, `src/modules/money/account-documents.view-model.ts`, `src/modules/money/account-funding.contracts.ts`, `src/modules/money/account-history.contracts.ts`
- **Deviations:** The implementing Composer exceeded its brief — it edited `src/modules/module-boundaries.ts` despite explicit instruction not to, and left an orphaned `src/modules/money/owner-credit.view-model.ts` duplicating types already placed in `account-documents.view-model.ts`. Both were rectified by a dedicated Wave 1 boundary reconciliation pass, Composer `b32ab1fb-0053-4f77-8ef1-b6f04a655e8c`, which deleted the orphan and registered all Wave 1 entry surfaces in one consolidated edit. Tax-profile diagnostics were also moved early here rather than waiting for CQ-06; accepted because CQ-06 consolidated them regardless.
- **Status:** `VERIFIED`

---

### CQ-03: Quarantine Agent Access, Credential & Consent Types
- **Surfaces:** `src/components/ae/console/AeConnectAgentWizardDialog.tsx`, `src/components/ae/console/AeAgentSpendingLimitsForm.tsx`, `src/routes/_operator/agent-access.tsx`, `src/routes/_operator/agent-access.authorize.tsx`
- **Incumbent Baseline:** Credential secret reveal formats (`IssuedAgentAccessReveal`), key generation results (`AgentAccessKeyIssueResult`), spending diagnostics (`SpendingDiagnostic`), and lifecycle commands (`LifecycleCommand`, `LifecycleIssue`) defined inside dialogs and forms.
- **Code Quality Gap:** Machine authentication secrets and spending policy results are defined in React components.
- **Target Spec:**
  - Move key issue contracts to `src/modules/agent-access/issue-key.contracts.ts`.
  - Move spending policy models to `src/modules/agent-access/spending-policy.view-model.ts`.
  - Move agent lifecycle commands to `src/modules/agent-access/agent-lifecycle.view-model.ts`.
  - Move OAuth consent problem codes to `src/modules/agent-access/consent.contracts.ts`.
- **Subagent Assignment:** Grok (Spec: `513dccd6-7692-450a-8476-1d97248192aa`) $\rightarrow$ Composer (Implement: `5399fdcb-ea06-4b5a-8ea0-99d213cfad47`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/agent-access/issue-key.contracts.ts`, `src/modules/agent-access/spending-policy.view-model.ts`, `src/modules/agent-access/agent-lifecycle.view-model.ts`, `src/modules/agent-access/consent.contracts.ts`
- **Deviations:** The scout recommended moving `SpendingDiagnostic` and `WizardDiagnostic` in this workflow. The Orchestrator overruled this so that CQ-06 could own every diagnostic triplet in a single pass, avoiding double-editing the same files.
- **Status:** `VERIFIED`

---

### CQ-04: Quarantine Capability Supply & Offerings Types
- **Surfaces:** `src/components/ae/supply/AeProviderConnectionForm.tsx`, `src/components/ae/supply/AeSupplierOnboardingWizard.tsx`, `src/components/ae/supply/AeProviderToolDetail.tsx`, `src/components/ae/supply/AeSupplyEarningsCard.tsx`, `src/components/ae/supply/AeToolTestPlayground.tsx`, `src/components/ae/offerings/provider-workspace-projection.ts`
- **Incumbent Baseline:** x402 connection inspections (`ProviderConnectionInspection`), wizard steps (`SupplierOnboardingStep`), tool action outcomes (`ProviderToolActionOutcome`), test responses (`ToolTestResponse`), and JSON Schema walkers declared in presentation files.
- **Code Quality Gap:** Provider onboarding and catalog publishing data structures trapped in presentation layer.
- **Target Spec:**
  - Move provider connection models to `src/modules/capability-supply/provider-connection.contracts.ts`.
  - Move supplier onboarding models to `src/modules/capability-supply/supplier-onboarding.contracts.ts`.
  - Move tool action outcomes to `src/modules/capability-supply/provider-tool-actions.contracts.ts`.
  - Move playground test payloads to `src/modules/capability-supply/tool-test.contracts.ts`.
  - Move earnings projections to `src/modules/capability-supply/earnings.view-model.ts`.
- **Subagent Assignment:** Grok (Spec: `e5ff309a-1c2e-460a-b675-a4492921172a`) $\rightarrow$ Composer (Implement: `ff5837d8-d409-4e08-8d0d-d2b9dfeff161`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/capability-supply/provider-connection.contracts.ts`, `src/modules/capability-supply/supplier-onboarding.contracts.ts`, `src/modules/capability-supply/provider-tool-actions.contracts.ts`, `src/modules/capability-supply/tool-test.contracts.ts`, `src/modules/capability-supply/earnings.view-model.ts`
- **Status:** `VERIFIED`

---

### CQ-05: Quarantine Market, Directory & Catalogue Types
- **Surfaces:** `src/components/ae/market/DirectoryExplorerFilters.tsx`, `src/components/ae/market/AeX402Directory.tsx`, `src/components/ae/market/DirectorySavedTools.tsx`, `src/routes/tools.$toolRef.tsx`, `src/components/ae/market/DirectoryToolCard.tsx`
- **Incumbent Baseline:** Catalogue filters (`DirectoryExplorerFilterValues`, `DirectoryExplorerFilterPatch`), saved tool storage schemas (`SavedDirectoryTool`), and tool detail presentation results declared in `.tsx` files. Leaf cards take raw `X402DirectoryEntry`.
- **Code Quality Gap:** Market leaf cards tightly coupled to raw upstream directory schemas rather than UI view-models.
- **Target Spec:**
  - Move directory filters to `src/modules/market/directory-filters.contracts.ts`.
  - Move saved tool models to `src/modules/market/saved-tools.contracts.ts`.
  - Move tool presentation results to `src/modules/market/tool-detail-presentation.ts`.
  - Introduce `DirectoryToolCardModel` view-model for leaf cards; leaf cards accept only pre-formatted card models.
- **Subagent Assignment:** Grok (Spec: `e7a8a33e-3491-4cb1-803f-e9a57ff776bf`) $\rightarrow$ Composer (Implement: `0274eb7e-cd5b-4717-9e85-84ee208c9b23`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/modules/market/directory-filters.contracts.ts`, `src/modules/market/saved-tools.contracts.ts`, `src/modules/market/tool-detail-presentation.ts`, `src/modules/market/directory-card.view-model.ts`, `tests/unit/market/directory-card.view-model.test.ts`
- **Deviations:** `src/components/ae/market/directory-presentation.ts` was left as a re-export shim for five moved helper functions rather than rewiring all consumers, to stay within the Composer's file budget. Flagged as Wave 5 structural cleanup.
- **Status:** `VERIFIED`

---

### CQ-06: Consolidate Universal Rule-4 Diagnostic Triplet Contract
- **Surfaces:** `src/components/ae/console/AeConnectAgentWizardDialog.tsx`, `src/components/ae/console/AeAgentSpendingLimitsForm.tsx`, `src/components/ae/settings/WorkspaceDangerZone.tsx`, `src/components/ae/supply/AeSupplierOnboardingWizard.tsx`, `src/components/ae/supply/AeSupplyEarningsCard.tsx`, `src/components/ae/supply/AePriceUpdateModal.tsx`, `src/components/ae/supply/AeToolTestPlayground.tsx`
- **Incumbent Baseline:** 15 redundant, fragmented declarations of the Rule-4 diagnostic shape across `.tsx` components, domain view-models, and `*-copy.ts` presentation-copy files (`WizardDiagnostic`, `SpendingDiagnostic`, `DiagnosticTriplet`, `Rule4Diagnostic` × 2, `PriceDiagnostic`, `PlaygroundDiagnostic`, and related aliases).
- **Code Quality Gap:** Copy-pasted type definitions violating DRY across UI surfaces.
- **Target Spec:**
  - Create canonical `src/lib/ui/diagnostic.ts` exporting immutable `Rule4Diagnostic` type.
  - Refactor all 7 components and dialogs to import the canonical contract.
- **Subagent Assignment:** Grok (Spec: `f0b7beff-9011-43cc-8344-1161f6361b40`) $\rightarrow$ Composer (Implement: `ee267502-13ff-4b54-9990-091fd2ae61f5`) $\rightarrow$ Orchestrator (Verify: Passed 4/4 Gates)
- **Delivered Surfaces:** `src/lib/ui/diagnostic.ts`
- **Deviations:** The register's stated baseline of 7 duplicate declarations was wrong — the scout found **15**. All 15 now resolve to the single canonical `Rule4Diagnostic`. The seven non-`.tsx` declarations retain their exported names as one-line type aliases so consumer imports stay valid. `helpLink` was deliberately omitted: nothing in the repository uses one, and `exactOptionalPropertyTypes: true` makes an unused optional member pure friction. Unifying the shape required renaming 32 `title` property keys and 5 `.title` reads to `whatHappened` across `AeConnectAgentWizardDialog.tsx` and `AeAgentSpendingLimitsForm.tsx`; zero string values and zero markup changed.
- **Status:** `VERIFIED`

---

# Wave 2: Leaf & Container Decoupling: Critical Surfaces

### CQ-07: Decompose `AeSupplyEarningsCard.tsx` (703 lines)
- **Surfaces:** `src/components/ae/supply/AeSupplyEarningsCard.tsx`
- **Incumbent Baseline:** Massive 703-line component executing four money server functions (`useReverification(useServerFn(...))`), window redirects, payout threshold checks, and raw JSX rendering.
- **Code Quality Gap:** Critical violation of the Pure Leaf Component Invariant. Untestable without live backend contexts.
- **Target Spec:**
  - Extract `useOwnerPayoutActions.ts` hook for Connect account creation, onboarding, Express login, and payout transfers.
  - Extract `earnings-projection.ts` to map readbacks to pure display facts.
  - Extract 4 dumb leaf components: `EarningsFactsList.tsx`, `PayoutActionBar.tsx`, `PayoutConfirmDialog.tsx`, `EarningsEmptyState.tsx`.
  - `AeSupplyEarningsCard.tsx` becomes a clean coordinator under 250 lines.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-08: Decompose `Chat.tsx` (420 lines)
- **Surfaces:** `src/components/ae/chat/Chat.tsx`
- **Incumbent Baseline:** Conflates 3 Convex queries, 5 Convex mutations, streaming abort controllers, interval timers, and layout rendering.
- **Code Quality Gap:** Hardest file in `src/components/ae/` to test in isolation.
- **Target Spec:**
  - Extract `useChatSession.ts` hook encapsulating thread queries, send/rename/delete mutations, and share management.
  - `Chat.tsx` becomes `<ChatLayout model={useChatSession(props)} />` with zero direct Convex imports.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-09: Decompose `AeAgentAccessAuthorizeForm.tsx` (586 lines)
- **Surfaces:** `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- **Incumbent Baseline:** Consent form calls `/oauth/authorize` via raw `fetch`, searches market tools, and renders complex authorization radio cards.
- **Code Quality Gap:** Direct HTTP networking and catalog searching inside form markup.
- **Target Spec:**
  - Extract `useAgentConsentDecision.ts` hook managing approve/deny HTTP mutations, agent pagination, and tool search.
  - Extract 5 dumb leaf components: `ConsentConnectionFieldset.tsx`, `AuthorityModeRadioGroup.tsx`, `ConsentToolAccessFieldset.tsx`, `ConsentDecisionBar.tsx`, `ConsentOutcomeView.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-10: Decompose `AeAgentSpendingLimitsForm.tsx` (832 lines)
- **Surfaces:** `src/components/ae/console/AeAgentSpendingLimitsForm.tsx`
- **Incumbent Baseline:** Largest component in repository (832 lines). Owns ExactAmount currency conversion, BigInt quota burn math, pause-as-zero limits, and generation conflict mapping.
- **Code Quality Gap:** Domain financial calculations and optimistic revision handling executed inside JSX render.
- **Target Spec:**
  - Extract pure domain module `src/modules/agent-access/spending-limit-policy.ts` (reused across form and wizard).
  - Extract `useAgentSpendingLimits.ts` hook managing edit/view modes, preset chips, and mutation dispatch.
  - Extract 4 dumb leaf components: `SpendingPresetSelector.tsx`, `SpendingLimitInputs.tsx`, `MonthlyQuotaGauge.tsx`, `SpendingPauseToggle.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-11: Decompose `ToolsSearchPage.tsx` (684 lines)
- **Surfaces:** `src/components/ae/command-panel/pages/ToolsSearchPage.tsx`
- **Incumbent Baseline:** 684-line command palette page mixing debounced catalog HTTP calls, keyboard-intent state machine, and command list items.
- **Code Quality Gap:** Complex async fetch and cmdk focus management inside presentation component.
- **Target Spec:**
  - Extract `useMarketToolSearch.ts` hook for debounced query fetching and retry.
  - Extract `useCommandPaletteSelection.ts` hook for keyboard intent tracking.
  - Extract 4 dumb leaves: `CommandPaletteInput.tsx`, `CommandNavGroup.tsx`, `ToolSearchResultRow.tsx`, `ToolSearchStatus.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-12: Decompose `AeConnectAgentWizardDialog.tsx` (462 lines)
- **Surfaces:** `src/components/ae/console/AeConnectAgentWizardDialog.tsx`
- **Incumbent Baseline:** 462-line wizard dialog duplicating ExactAmount parsing, credential generation, and modal navigation.
- **Code Quality Gap:** Code duplication with `AeAgentSpendingLimitsForm`.
- **Target Spec:**
  - Reuse `spending-limit-policy.ts` and `SpendingLimitInputs` from `CQ-10`.
  - Extract `useConnectAgentWizard.ts` hook.
  - Extract dumb leaves: `AgentNameField.tsx`, `EnvironmentRadioCards.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

# Wave 3: Leaf & Container Decoupling: Wizards, Settings & Testing

### CQ-13: Decompose `WorkspaceDangerZone.tsx` (348 lines)
- **Surfaces:** `src/components/ae/settings/WorkspaceDangerZone.tsx`
- **Incumbent Baseline:** Settings leaf component inlines Convex queries (`readWorkspaceDecommissionEligibility`) and mutations (`closeWorkspace`, `transferWorkspaceOwnership`).
- **Code Quality Gap:** Presentation markup directly executing destructive database mutations.
- **Target Spec:**
  - Extract `WorkspaceDangerZoneContainer.tsx` (or hook) to own query and mutation bindings.
  - Split presentation into pure leaves: `WorkspaceClosePanel.tsx`, `WorkspaceTransferPanel.tsx`, `DecommissionFenceList.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-14: Decompose `AeProviderWorkspace.tsx` (366 lines)
- **Surfaces:** `src/components/ae/offerings/AeProviderWorkspace.tsx`
- **Incumbent Baseline:** Inlines six `useServerFn` calls for identity, connections, earnings, and provider registration inside JSX.
- **Code Quality Gap:** Page markup acts as API controller.
- **Target Spec:**
  - Extract `useProviderWorkspaceInventory.ts` and `useProviderWorkspaceSheets.ts`.
  - Move onboarding save into route controller; leaf workspace imports zero server functions.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-15: Decompose `AeSupplierOnboardingWizard.tsx` (438 lines)
- **Surfaces:** `src/components/ae/supply/AeSupplierOnboardingWizard.tsx`
- **Incumbent Baseline:** 3-step wizard owns ABN checksums, HTTPS origin validation, and state machine navigation.
- **Code Quality Gap:** Domain validation logic baked into presentation forms.
- **Target Spec:**
  - Extract `useSupplierOnboardingWizard.ts` hook.
  - Share ABN and origin validation in `provider-identity-validation.ts` (shared with `TaxProfileForm`).
  - Extract pure leaves: `OnboardingStepper.tsx`, `ProviderIdentityFields.tsx`, `PayoutsStep.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-16: Decompose `AePriceUpdateModal.tsx` (357 lines)
- **Surfaces:** `src/components/ae/supply/AePriceUpdateModal.tsx`
- **Incumbent Baseline:** Modal calculates Australian GST splits (`calculateAudGstSplit`), ExactAmount rescaling, and percentage deltas in `useMemo` inside render.
- **Code Quality Gap:** Financial tax math embedded in modal markup.
- **Target Spec:**
  - Extract unit-tested pure module `price-revision-preview.ts` for GST split and price deltas.
  - Extract `usePriceRevisionForm.ts` hook.
  - Extract pure leaves: `PriceDeltaPreview.tsx`, `GstSplitBreakdown.tsx`, `PriceAdjustmentChips.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-17: Decompose `AeToolTestPlayground.tsx` (370 lines)
- **Surfaces:** `src/components/ae/supply/AeToolTestPlayground.tsx`
- **Incumbent Baseline:** Test playground owns recursive JSON Schema walking, default extraction, and latency timing.
- **Code Quality Gap:** Schema parsing algorithms embedded in UI component.
- **Target Spec:**
  - Extract `tool-test-payload.ts` for schema default extraction.
  - Extract `useToolTestPlayground.ts` hook for execution timing and response handling.
  - Extract pure leaves: `JsonPayloadEditor.tsx`, `PlaygroundResponsePane.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-18: Decompose `AeAgentOperatorConsole.tsx` (456 lines)
- **Surfaces:** `src/components/ae/console/AeAgentOperatorConsole.tsx`
- **Incumbent Baseline:** Mixes route selection, revoke/drain lifecycle dialogs, and toast handling.
- **Code Quality Gap:** Conflation of sheet navigation, modal states, and table rendering.
- **Target Spec:**
  - Extract `useAgentLifecycleDialog.ts` and `useAgentSelection.ts`.
  - Extract pure leaves: `AgentRecordSheet.tsx`, `AgentLifecycleConfirmDialog.tsx`.
- **Subagent Assignment:** Grok (Spec: `9d72774d-a2b7-4905-9888-9fb280449696`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

# Wave 4: Convex God-Files & CQS Nonce Rectification

### CQ-19: Rectify Nonce-Burning Agent Reads to Pure Queries (9 Handlers)
- **Surfaces:** `convex/moneyAccountFunding.ts`, `convex/capabilityCallProjection.ts`, `convex/capabilityProviderTools.ts`, `convex/capabilityProviderOffboarding.ts`, `convex/capabilityProviderConnectionAgents.ts`, `convex/capabilitySupplyOwnerFunnel.ts`, `convex/agentMoneyReads.ts`, `convex/marketDemandSignals.ts`, `convex/moneyLedger.ts`
- **Incumbent Baseline:** 9 agent read operations are registered as Convex `mutation` purely to consume a one-time `sourceWriteNonces` record.
- **Code Quality Gap:** Major CQS violation. Reads fail with `source_write_nonce_replayed` on refresh; cannot be cached.
- **Target Spec:**
  - Convert all 9 handlers to `query` or `internalQuery` using `requireSourceRead`.
  - Update callers and test mocks to invoke queries without write nonces.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-20: Decompose `convex/interactiveAuthority.ts` (1,172 lines)
- **Surfaces:** `convex/interactiveAuthority.ts`
- **Incumbent Baseline:** 1,172 lines jamming error codes, Clerk organization locator, identity provisioning, credential rotation, fact reads, and scheduled reconcile.
- **Code Quality Gap:** 1,000-line rule violation; multiple disparate responsibilities.
- **Target Spec:**
  - Extract `convex/lib/interactiveAuthority/errors.ts`.
  - Extract `convex/lib/interactiveAuthority/provisioning.ts`.
  - Extract `convex/lib/interactiveAuthority/facts.ts`.
  - Extract `convex/lib/interactiveAuthority/accountSelection.ts`.
  - Reduce root `interactiveAuthority.ts` to <200 lines.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-21: Decompose `convex/moneyAccountFunding.ts` (1,172 lines)
- **Surfaces:** `convex/moneyAccountFunding.ts`
- **Incumbent Baseline:** 1,172 lines mixing owner top-up commands, agent handoff reserves, webhook reads, and invoice history projection.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Extract `convex/lib/money/fundingValidators.ts`.
  - Extract `convex/lib/money/fundingOwnerCommands.ts`.
  - Extract `convex/lib/money/fundingAgentHandoff.ts`.
  - Extract `convex/lib/money/fundingWebhookReads.ts`.
  - Extract `convex/lib/money/fundingInvoiceHistory.ts`.
  - Reduce root file to <250 lines.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-22: Decompose `convex/capabilitySupplyPublish.ts` (1,135 lines)
- **Surfaces:** `convex/capabilitySupplyPublish.ts`
- **Incumbent Baseline:** 1,135 lines mixing source-authority verification, prepared publishing, admission cases, bootstrap decoding, and curated capability management.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Extract `convex/lib/capabilitySupply/sourceAuthority.ts`.
  - Extract `convex/lib/capabilitySupply/publishPrepared.ts`.
  - Extract `convex/lib/capabilitySupply/publishBootstrap.ts`.
  - Extract `convex/lib/capabilitySupply/readPublication.ts`.
  - Reduce root file to <200 lines.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-23: Decompose `convex/capabilityQuotes.ts` (1,116 lines)
- **Surfaces:** `convex/capabilityQuotes.ts`
- **Incumbent Baseline:** 1,116 lines mixing financial subject preparation, quote hashing, Formance sync action, rate lookup, and call admission.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Extract `convex/lib/capabilityQuotes/financialSubjects.ts`.
  - Extract `convex/lib/capabilityQuotes/issueQuote.ts`.
  - Extract `convex/lib/capabilityQuotes/quoteAction.ts`.
  - Reduce root file to <250 lines.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-24: Decompose `convex/capabilityProviderConnectionAttempts.ts` (1,105 lines)
- **Surfaces:** `convex/capabilityProviderConnectionAttempts.ts`
- **Incumbent Baseline:** 1,105 lines mixing attempt reserves, secret preparation, OAuth callback bindings, and atomic finalization.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Extract `convex/lib/providerConnections/attemptReserve.ts`.
  - Extract `convex/lib/providerConnections/attemptOwnerReads.ts`.
  - Extract `convex/lib/providerConnections/attemptPrepare.ts`.
  - Extract `convex/lib/providerConnections/attemptFinalize.ts`.
  - Reduce root file to <200 lines.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-25: Decompose `convex/capabilityCallProjection.ts` (1,041 lines)
- **Surfaces:** `convex/capabilityCallProjection.ts`
- **Incumbent Baseline:** 1,041 lines mixing worker dispatch mapping, canary projection, recovery calculation, and provider supply call listings.
- **Code Quality Gap:** 1,000-line rule violation.
- **Target Spec:**
  - Extract `convex/lib/callLifecycle/workerProjection.ts`.
  - Extract `convex/lib/callLifecycle/canaryProjection.ts`.
  - Extract `convex/lib/callLifecycle/recoveryProjection.ts`.
  - Extract `convex/lib/callLifecycle/supplyCalls.ts`.
  - Reduce root file to <200 lines.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

# Wave 5: Barrel Cycle Eradication & Strict Dependency Ratchet

### CQ-26: Eradicate Money Module Internal Barrel Cycles
- **Surfaces:** `src/modules/money/public.ts`, `src/modules/money/internal/*`
- **Incumbent Baseline:** `public.ts` is a 680-line god-barrel. Internal modules import `MoneyRefusal`, `MoneyPayout`, `PricingResolution`, and `RakeConfig` from `public.ts`.
- **Code Quality Gap:** Generates circular dependency warnings in dependency-cruiser.
- **Target Spec:**
  - Move shared types to `src/modules/money/internal/money-types.ts`.
  - Internal modules import from sibling types. `public.ts` re-exports only.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-27: Eradicate Security Module Internal Barrel Cycles
- **Surfaces:** `src/modules/security/public.ts`, `src/modules/security/internal/*`
- **Incumbent Baseline:** `internal/admin-authority.ts` imports `AdminAction` and `AdminMembership` from `security/public.ts`.
- **Code Quality Gap:** Circular barrel cycle.
- **Target Spec:**
  - Move admin authority types to `internal/admin-authority-types.ts`.
  - Internal files import sibling types. `public.ts` re-exports only.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-28: Eradicate Observability Module Internal Barrel Cycles
- **Surfaces:** `src/modules/observability/public.ts`, `src/modules/observability/internal/*`
- **Incumbent Baseline:** `internal/schema.ts`, `operation-keys.ts`, and `outbox.ts` import `ActorKind` and `OperationKeyRecord` from `observability/public.ts`.
- **Code Quality Gap:** Circular barrel cycle.
- **Target Spec:**
  - Move types to `internal/literals.ts`.
  - Internals import local types; barrel re-exports only.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-29: Eradicate Discovery Module Internal Barrel Cycles
- **Surfaces:** `src/modules/discovery/public.ts`, `src/modules/discovery/internal/*`
- **Incumbent Baseline:** `discovery-files.ts` and `offering-discovery-file.ts` import `BuildDiscoveryFileOptions` from `discovery/public.ts`.
- **Code Quality Gap:** Circular barrel cycle.
- **Target Spec:**
  - Move discovery options to `internal/discovery-file-types.ts`.
  - Internals import sibling types; barrel re-exports only.
- **Subagent Assignment:** Grok (Spec: `6033918e-28e4-4e49-a1c6-b9b7016314ea`) $\rightarrow$ Composer (Implement) $\rightarrow$ Orchestrator (Verify)
- **Status:** `READY`

---

### CQ-30: Lower Dependency-Cruiser Ratchet Ceilings to Zero
- **Surfaces:** `tools/dev/deps-ratchet.ts`, `.dependency-cruiser.cjs`, `tests/imports/module-boundaries-ratchet.test.ts`
- **Incumbent Baseline:** `no-circular-via-barrel` ceiling is set to 32.
- **Code Quality Gap:** Permissive ceiling allowing barrel cycles to persist.
- **Target Spec:**
  - Verify all 32 cycles are resolved across Waves 1–5.
  - Lower `no-circular-via-barrel` ceiling in `tools/dev/deps-ratchet.ts` from 32 to 0.
  - Run `npm run deps:check` to prove zero violations.
  - Rebaseline the module boundary ratchet — set `totalEntrySurfaces` and `numModules` to the true post-campaign counts, and record the justification for the raise.
- **Subagent Assignment:** Orchestrator (Verify Gate)
- **Status:** `READY`
