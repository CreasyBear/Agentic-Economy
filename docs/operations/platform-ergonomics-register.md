# Platform ergonomics register

**Status:** wave 2 acceptance register — criteria, not polish. No overall maturity score.  
**Date:** 2026-09-21  
**Authority:** [PRODUCT.md](../../PRODUCT.md) journeys 1–6; [CONTEXT.md](../../CONTEXT.md); [DESIGN.md](../../DESIGN.md); [platform-design-package.md](./platform-design-package.md) grades.  
**Companion:** [platform-design-package.md](./platform-design-package.md) **part 7**. Dest IDs from [platform-nav-route-map.md](./platform-nav-route-map.md). Jobs from [platform-job-map.md](./platform-job-map.md).  
**Craft rules (do not invent a second tactile standard):** [user-and-org-ergonomics-protocol.md](./user-and-org-ergonomics-protocol.md) Rules 1–5. Do **not** reopen `W-01`–`W-44` as a new campaign — cross-link [user-and-org-ergonomics-register.md](./user-and-org-ergonomics-register.md). Design-system leftovers stay on [design-system-maturity-register.md](./design-system-maturity-register.md). Buyer-integration leftovers stay on [jev-platform-integration-register.md](./jev-platform-integration-register.md). Experience findings stay on [platform-experience-register.md](./platform-experience-register.md).

This file is **acceptance criteria**. A cell is not a mandate to restyle. Recheck every cited line before anyone implements — this checkout is shared and dirty.

Grades follow the package:

| Grade | Meaning |
| --- | --- |
| `CHARTER` | PRODUCT.md / CONTEXT.md / protocol require it; source may not |
| `IMPLEMENTED` | Current source **and** tests establish it |
| `PARTIAL` | Source exists; journey, states, or dest proof incomplete |
| `OPEN` | Not decided; do not implement from interpolation |
| `SEEN` | Live product page this session (not claimed here for these criteria) |
| `DOCS` | First-party docs named it; not walked on the product |

`SEEN` is reserved for a live criterion walk. [platform-nav-route-map.md](./platform-nav-route-map.md) records dest **presence** on `/market`; that is not keyboard, contrast, or validation proof. Design-system Layer B for operator dests is source interpolation ([design-system-maturity-register.md](./design-system-maturity-register.md) Wave 3). This register does not convert those walks into ergonomic acceptance.

---

## Dest families

| Family | Dest / resource | Primary surfaces inspected |
| --- | --- | --- |
| **Market** | `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET` · `/market` | `AeX402Directory.tsx`, `DirectoryToolCard.tsx`, `DirectoryExplorerFilters.tsx`, `DirectoryIndexDiscovery.tsx`, `DirectoryProviderCards.tsx` |
| **Tool detail** | `RES-TOOL` · `/tools/$toolRef`, `/tools/$providerHost/$slug` | `PublicToolDetail.tsx`, `AeDirectoryToolCanonicalPage.tsx`, `AeToolInspector.tsx`, `AeToolFacts.tsx`, `AeToolNextAction.tsx` |
| **Chat** | `RES-ASK-THREAD` · `/t/new`, `/t/$threadId` | `ChatComposer.tsx`, `ChatTranscript.tsx`, `ChatHeader.tsx`, `ChatHistory.tsx`, `ToolCard.tsx`, `AeChatPage.tsx`, `ChatSkeleton.tsx` |
| **Agents** | `DEST-BUYER-AGENTS` · `/agent-access` | `AeAgentAccessHome.tsx`, `AeAgentSpendingLimitsForm.tsx`, `SpendingLimitInputs.tsx`, `AeConnectAgentWizardDialog.tsx`, `AeAgentAccessAuthorizeForm.tsx`, `AgentLifecycleConfirmDialog.tsx` |
| **Calls / receipt** | `DEST-BUYER-CALLS` + `RES-CALL` · `/activity`, `/calls/$callRef` | `AeActivity.tsx`, `ActivityFilterBar.tsx`, `CallReceiptPrimitives.tsx`, `CallReceiptTimeline.tsx`, `CallRecoveryPanel.tsx`, `CallReceiptSkeleton.tsx` |
| **Credit** | `DEST-BUYER-CREDIT` · `/owner/credit` | `AeOwnerCredit.tsx`, `AeCreditTopUpPanel.tsx`, `AeAutoRechargeCard.tsx`, `AeMonthlySpendCeilingCard.tsx`, `AeSavedPaymentMethodsCard.tsx`, `AeInvoiceHistoryTable.tsx` |
| **Provider workspace** | `DEST-PROVIDER-SUPPLY` · `/owner/operations` | `AeProviderWorkspace.tsx`, `AeSupplierOnboardingWizard.tsx`, `AePayoutPolicyForm.tsx`, `SupplyPublicationFlow.tsx`, `AeProviderToolDetail.tsx`, `AeToolTestPlayground.tsx` |
| **Shared account** | `DEST-SHARED-*` + DS-38 overlay | `AeSettingsDialog.tsx`, `SettingsScopeTabs.tsx`, `WorkspaceSettingsBody.tsx`, `WorkspaceClosePanel.tsx`, `AeTeamDirectoryTable.tsx`, `ThemeToggle.tsx`, `AeCommandPanel.tsx` |

Shared primitives that every dest inherits (not a dest): `src/components/ui/button-variants.ts`, `field.tsx`, `dialog.tsx`, `checkbox.tsx`, `src/styles/globals.css` (`--ae-touch: 44px`, `--ae-ring`).

---

## Acceptance matrix

Criterion × dest family. Each cell is `GRADE` plus one file cite. Craft rules from the existing protocol are rows, not a second standard.

Legend for cites: path is under `src/components/ae/` unless noted.

### Keyboard operation and visible focus

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Tabs + search are native controls (`market/AeX402Directory.tsx` 229–250). Listing title uses `focus-visible:outline-none` and an overlay `after:inset-0` ring (`market/DirectoryToolCard.tsx` 42). No dest keyboard test. |
| Tool detail | `PARTIAL` | Inspector tabs and next-action links use the button/tabs primitive rings (`market/tool-detail/AeToolInspector.tsx` 85–94; `AeToolNextAction.tsx` 49–52). Found-state not walked ([DS-18](./design-system-maturity-register.md)). |
| Chat | `IMPLEMENTED` | Labelled composer, Enter submit (`chat/chat-session/components/ChatComposer.tsx` 42–55). History rows `focus-visible:ring-2` (`ChatHistory.tsx` 123). Skip-link → `#main-content` tested (`tests/unit/layout/shell-a11y-focus.test.tsx` 80–120). |
| Agents | `PARTIAL` | Spending inputs are labelled (`shared/SpendingLimitInputs.tsx` 58–70). Revocation mode cards are `role="button"` with **`tabIndex={-1}`** — not in the tab order (`console/agent-operator-console/components/AgentLifecycleConfirmDialog.tsx` 50–66). |
| Calls / receipt | `PARTIAL` | Filter chips are buttons with `aria-pressed` (`activity/components/ActivityFilterBar.tsx` 42–49). Receipt actions are buttons (`call-receipt/CallReceiptPrimitives.tsx` 93–101). No dest keyboard test. Agent-clear control is `h-6` (`ActivityFilterBar.tsx` 83–88). |
| Credit | `PARTIAL` | Denomination / preset chips use `aria-pressed` (`console/AeCreditTopUpPanel.tsx` 177; `AeAutoRechargeCard.tsx` 227). Focus comes from `buttonVariants` (`src/components/ui/button-variants.ts` 9). No dest keyboard test. |
| Provider workspace | `PARTIAL` | Stepper is a labelled `<nav>` with `aria-current` (`supply/supplier-onboarding-wizard/components/OnboardingStepper.tsx` 13). Source/publication radios sit in labelled fields (`supply/SupplyPublicationFlow.tsx` 157–161). No dest keyboard test. |
| Shared account | `PARTIAL` | Settings tabs are a labelled tablist (`settings/settings-dialog/components/SettingsScopeTabs.tsx` 19–25). Dialog close has `focus-visible:outline-brand` (`src/components/ui/dialog.tsx` 187). Personal body is unfocusable pending text while history loads (`settings/settings-dialog/AeSettingsDialog.tsx` 60–61). Clerk `OrganizationProfile` is a hosted island (`WorkspaceSettingsBody.tsx` 16–24). |

**Weakest keyboard/focus evidence:** Market (overlay ring, no dest test), Shared account (pending text + Clerk island + `ThemeToggle` `size-8`), Calls / receipt (chips/export/dismiss sized below the 44px target; no dest test). Chat is the only dest with a focused skip-link/landmark test.

### Labelled controls

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `IMPLEMENTED` | `sr-only` “Search Tools” + `aria-label` on submit/clear (`AeX402Directory.tsx` 229–237). Filter aside `aria-label="Tool filters"`; fieldsets use `legend.sr-only` (`DirectoryExplorerFilters.tsx` 49, 165). Price/provider inputs have `htmlFor` + `FieldLabel` (`DirectoryExplorerFilters.tsx` 88, 103). |
| Tool detail | `PARTIAL` | Tabs `aria-label="Tool views"`; next-action region labelled (`AeToolInspector.tsx` 85; `AeToolNextAction.tsx` 34). Public found-state not walked ([DS-18](./design-system-maturity-register.md)). |
| Chat | `IMPLEMENTED` | Prompt `FieldLabel htmlFor="tool-chat-prompt"` (`ChatComposer.tsx` 42–44). Header icon buttons have accessible names (`ChatHeader.tsx` 31, 49, 54). History rename/delete labelled (`ChatHistory.tsx` 141, 151). |
| Agents | `IMPLEMENTED` | Spending labels `htmlFor` (`SpendingLimitInputs.tsx` 58–60). Authorize decision `role="group"` + `legend.sr-only` (`agent-access/authorize-form/AeAgentAccessAuthorizeForm.tsx` 47; `AuthorityModeRadioGroup.tsx` 15). Connect-agent environment/authority cards are `Label`-wrapped ([W-25](./user-and-org-ergonomics-register.md)). |
| Calls / receipt | `PARTIAL` | Status/date chips have visible text + `aria-pressed` (`ActivityFilterBar.tsx` 38–49). Agent dismiss has `aria-label` (`ActivityFilterBar.tsx` 85). Export CSV/JSON buttons have visible text only — no group label (`ActivityFilterBar.tsx` 112–132). Receipt playbook `aria-labelledby` (`CallReceiptPrimitives.tsx` 42–45). |
| Credit | `IMPLEMENTED` | Auto-recharge `aria-label` (`AeAutoRechargeCard.tsx` 245). Ceiling input `aria-label="Monthly spending cap"` (`AeMonthlySpendCeilingCard.tsx` 302). Quote `aria-label="Funding quote"` (`AeCreditTopUpPanel.tsx` 218–232). Card PAN `aria-label` (`AeSavedPaymentMethodsCard.tsx` 181). |
| Provider workspace | `IMPLEMENTED` | Identity fields `FieldLabel htmlFor` (`supplier-onboarding-wizard/components/ProviderIdentityFields.tsx` 35–72). Stepper `aria-label="Supplier activation"` (`OnboardingStepper.tsx` 13). Price/connection fieldsets labelled (`SupplyPublicationFlow.tsx` 157–161). |
| Shared account | `PARTIAL` | Scope tabs `aria-label="Settings scope"` (`SettingsScopeTabs.tsx` 20). Close-workspace confirm labelled (`WorkspaceClosePanel.tsx` 52–55). Theme trigger `aria-label={`Appearance: ${currentLabel}`}` (`layout/ThemeToggle.tsx` 39). Clerk profile fields are hosted, not AE-labelled. |

### Readable contrast (semantic tokens, not raw Tailwind colours)

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Product scan forbids raw colour utilities (`tests/ui-contract/ui-contract.test.ts` 13–14). `FieldError` is `text-destructive` (`src/components/ui/field.tsx` 229) — [DS-09](./design-system-maturity-register.md) names AA fail (~4.3 light / ~3.3 dark). Price-range / provider errors use that primitive (`DirectoryExplorerFilters.tsx` 89, 103). |
| Tool detail | `PARTIAL` | Surfaces use `text-foreground` / `text-muted-foreground` / `text-brand` (`AeToolNextAction.tsx` 40–46). Found-state contrast not walked ([DS-18](./design-system-maturity-register.md)). |
| Chat | `PARTIAL` | Composer errors render through `FieldError` (`ChatComposer.tsx` 81) — same DS-09 leftover. Transcript uses semantic tokens. |
| Agents | `PARTIAL` | Diagnostics use `Alert variant="destructive"` ([W-26](./user-and-org-ergonomics-register.md)). Same `text-destructive` token on any `FieldError`. |
| Calls / receipt | `PARTIAL` | Playbook money well uses `text-success-foreground` / `text-warning-foreground` **with** a text body (`CallReceiptPrimitives.tsx` 59–68). Timeline icons are colour + `sr-only` state (`CallReceiptTimeline.tsx` 26–38). |
| Credit | `PARTIAL` | Ceiling band maps `bg-success` / `bg-warning` / `bg-destructive` on the progress indicator (`AeMonthlySpendCeilingCard.tsx` 41–45, 238–241) **and** a text percent (`226–230`). ui-contract green on AE files; FieldError leftover remains if used. |
| Provider workspace | `PARTIAL` | Wizard / payout diagnostics are `Alert variant="destructive"` (`AeSupplierOnboardingWizard.tsx` 34–36). Tokenised; DS-09 leftover if FieldError is shown. |
| Shared account | `PARTIAL` | Dialog / tabs use semantic tokens. Clerk appearance is a token bridge ([DS-17](./design-system-maturity-register.md)), not AE field chrome. |

### Useful validation (what is missing and how to proceed)

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Price: “Enter a valid price range…” (`DirectoryExplorerFilters.tsx` 84). Provider: “Enter a Provider hostname, such as api.example.com.” (`DirectoryExplorerFilters.tsx` 101). Route error tells the operator which query keys failed (`src/routes/market.tsx` 65). Does not name financial impact (not a money mutation). |
| Tool detail | `PARTIAL` | Unavailable / not-found distinguish and return to market (`market/public-tool-detail/AeDirectoryToolCanonicalPage.tsx` — [EX-01](./platform-experience-register.md)). No input form on the public listing. |
| Chat | `PARTIAL` | `FieldError` states the failure, copies a support ref, and offers Browse market (`ChatComposer.tsx` 79–96). Purchase continuation from chat remains [JI-04b](./jev-platform-integration-register.md) — not closed here. |
| Agents | `IMPLEMENTED` | Spending / connect / authorize diagnostics are Rule 4 triplets ([W-25](./user-and-org-ergonomics-register.md), [W-26](./user-and-org-ergonomics-register.md)). Tool access empty: “Select at least one Tool” (`authorize-form/components/ConsentToolAccessFieldset.tsx` 49). |
| Calls / receipt | `IMPLEMENTED` | Playbook sections What happened / Financial impact / Automatic / What you can do (`CallReceiptPrimitives.tsx` 55–72). [W-39](./user-and-org-ergonomics-register.md). |
| Credit | `IMPLEMENTED` | Quote shell + Rule 4 refusal playbooks ([W-20](./user-and-org-ergonomics-register.md)–[W-23](./user-and-org-ergonomics-register.md)). Balance unavailable names refresh, not an inferred amount (`AeOwnerCredit.tsx` 190–199). |
| Provider workspace | `PARTIAL` | Wizard reserved diagnostic + `A$0.00 affected` ([W-30](./user-and-org-ergonomics-register.md)). ABN is collected and checksummed in the wizard while inventory save omits it ([EX-02](./platform-experience-register.md)) — validation copy can over-promise. |
| Shared account | `PARTIAL` | Tax / danger-zone slots state `A$0.00 affected` ([W-10](./user-and-org-ergonomics-register.md)–[W-14](./user-and-org-ergonomics-register.md)). Settings overlay has no validation of its own while personal history is `null` (`AeSettingsDialog.tsx` 60–61). |

### Responsive reflow

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Filters: sticky desktop aside + mobile `Sheet` (`DirectoryExplorerFilters.tsx` 165–166). Cards wrap footer (`DirectoryToolCard.tsx` 53). Search submit text `hidden sm:inline` (`AeX402Directory.tsx` 237). No 320px / 200% dest test. |
| Tool detail | `PARTIAL` | Inspector tabs `max-sm` height; next action `w-full sm:w-auto` (`AeToolInspector.tsx` 85–94; `AeToolNextAction.tsx` 52). Pending skeleton is `lg:grid-cols-[minmax(0,1fr)_20rem]` (`layout/AePageState.tsx` 111–121). |
| Chat | `PARTIAL` | History rail `hidden lg:flex`; composer `max-h-40` + `safe-area-inset-bottom` (`layout/AeChatPage.tsx` 42–48; `ChatComposer.tsx` 37, 60). No virtual-keyboard inset. |
| Agents | `PARTIAL` | Spending inputs `grid-cols-1 sm:grid-cols-3` (`SpendingLimitInputs.tsx` 33). Approvals `w-full sm:w-auto` (`console/AeAgentApprovalsSection.tsx` 90). |
| Calls / receipt | `PARTIAL` | Filter bar `flex-wrap` (`ActivityFilterBar.tsx` 36). Timeline `sm:grid-cols-2 lg:grid-cols-6` (`CallReceiptTimeline.tsx` 14). Export cluster can wrap under chips. |
| Credit | `PARTIAL` | Quote / GST rows and chips wrap (`AeCreditTopUpPanel.tsx` 27, 232). Balance well is a single column (`AeOwnerCredit.tsx` 203–213). |
| Provider workspace | `PARTIAL` | Stepper `grid-cols-1 sm:grid-cols-3` (`OnboardingStepper.tsx` 13). Publication radios `sm:grid-cols-2` (`SupplyPublicationFlow.tsx` 157). |
| Shared account | `PARTIAL` | Overlay `max-h-[min(42rem,calc(100dvh-2rem))]` + scroll body (`AeSettingsDialog.tsx` 50, 58). Command panel `h-[calc(100dvh-1rem)]` on small viewports (`command-panel/AeCommandPanel.tsx` 91). Clerk wells `min-h-96` (`WorkspaceSettingsBody.tsx` 16). |

### Status that does not rely on colour alone

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Saved / compare use `aria-pressed` + icon/text (`DirectoryToolCard.tsx` 34, 59). Activity line is text (`DirectoryToolCard.tsx` 51). Facet selected state is a class + `aria-pressed` (`DirectoryExplorerFilters.tsx` 66–67). |
| Tool detail | `PARTIAL` | Next action is a labelled heading + sentence (`AeToolNextAction.tsx` 38–47). Readiness on public found-state not walked. |
| Chat | `IMPLEMENTED` | Readiness is a **text badge** (`chat/ToolCard.tsx` 69–71). Composer `role="status" aria-live` (`ChatComposer.tsx` 112). Transcript `aria-live="polite"` (`ChatTranscript.tsx` 82–83). |
| Agents | `IMPLEMENTED` | Spending **Paused** / **Active** badges include icon + word (`AeAgentSpendingLimitsForm.tsx` 52–61). |
| Calls / receipt | `IMPLEMENTED` | Separate status copy + `sr-only` “Stage state: …” (`CallReceiptTimeline.tsx` 26). Purchase vs delivery kept as text ([DS-26](./design-system-maturity-register.md); [W-38](./user-and-org-ergonomics-register.md)). |
| Credit | `IMPLEMENTED` | Ceiling percent is text; progress colour is additive (`AeMonthlySpendCeilingCard.tsx` 226–241). Expired card is a **Expired** badge + mono expiry (`AeSavedPaymentMethodsCard.tsx` 186–192). |
| Provider workspace | `IMPLEMENTED` | Stepper “Completed” is `sr-only` text (`OnboardingStepper.tsx` 36). Connect poller playbook is labelled sections (`supply/AeConnectReturnPoller.tsx` 79). |
| Shared account | `PARTIAL` | Theme options are text + icon (`ThemeToggle.tsx` 56–59). Team roles are labelled pills (`AeTeamDirectoryTable.tsx` 137–144). Clerk session/status chrome is hosted. |

### Touch targets (~44×44 CSS px; WCAG 2.2 AA 24×24 is the floor)

Token: `--ae-touch: 44px` (`src/styles/globals.css` 262) bridged as `--spacing-touch` (145). `buttonVariants` adds `max-sm:min-h-touch max-sm:min-w-touch` (`src/components/ui/button-variants.ts` 9). Desktop sizes below 44px are `PARTIAL` even when they clear 24px.

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Save is `size="icon-sm"` (32×32) (`DirectoryToolCard.tsx` 34). Compare is `size="sm"`. Filter labels `min-h-10` (40px) (`DirectoryExplorerFilters.tsx` 49, 66). Checkbox control itself is `size-4` (16px) (`src/components/ui/checkbox.tsx` 35) — label may enlarge the hit area. Collection “View all” uses `min-h-touch` (`DirectoryIndexDiscovery.tsx` 45). |
| Tool detail | `PARTIAL` | Tabs / next actions declare `min-h-touch` (`AeToolInspector.tsx` 86–94; `AeToolNextAction.tsx` 52, 96). |
| Chat | `PARTIAL` | Composer send `min-h-touch min-w-touch` (`ChatComposer.tsx` 66). History icon actions same (`ChatHistory.tsx` 140, 150). Header icons same (`ChatHeader.tsx` 31, 49). |
| Agents | `PARTIAL` | Form / pause / edit use `min-h-touch` (`AeAgentSpendingLimitsForm.tsx` 64–73). Revoke trigger `min-h-touch` (`console/agent-operator-console/components/AgentRecordSheet.tsx` 71–74). |
| Calls / receipt | `PARTIAL` | Filter chips `min-h-9 sm:min-h-8` (`ActivityFilterBar.tsx` 47). Export `h-7` (`116`). Agent dismiss `h-6` (24px floor, not the 44px target) (`86`). Receipt actions `min-h-touch` (`CallReceiptPrimitives.tsx` 96). |
| Credit | `PARTIAL` | Chips / primary actions `min-h-touch` (`AeCreditTopUpPanel.tsx` 27, 252; `AeAutoRechargeCard.tsx` 24). Inline credit skeletons still use `h-9` action placeholders (`AeOwnerCredit.tsx` 245, 278). |
| Provider workspace | `PARTIAL` | Wizard / payout / playground actions `min-h-touch` (`PayoutsStep.tsx` 54; `AePayoutPolicyForm.tsx` 74, 299). |
| Shared account | `PARTIAL` | Scope tabs `min-h-touch` (`SettingsScopeTabs.tsx` 21–24). `ThemeToggle` overrides icon size to **`size-8` (32px)** (`layout/ThemeToggle.tsx` 41–45) — [W-43](./user-and-org-ergonomics-register.md) recorded that size; it does not meet the 44px target. Dialog close is `size-8` + `max-sm:min-h-touch` (`src/components/ui/dialog.tsx` 187). |

### Destructive actions distinguishable, separated, still accessible

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `OPEN` | No dest-level destructive (unsave / clear compare are reversible toggles). |
| Tool detail | `OPEN` | No dest-level destructive. |
| Chat | `PARTIAL` | Delete uses `variant="destructive"` only after an inline confirm; cancel is `ghost` beside it (`ChatHistory.tsx` 98–115). Trigger is a ghost trash icon (`146–155`) — distinguishable after confirm, not on the resting row. |
| Agents | `PARTIAL` | Revoke uses `AeConfirmDialog` `confirmVariant="destructive"` + drain vs freeze copy (`AgentLifecycleConfirmDialog.tsx` 31, 38–42). Mode cards are not tabbable (`tabIndex={-1}`, 53). |
| Calls / receipt | `PARTIAL` | Recovery actions are outline/primary, not silent. Reconciliation is behind `<summary>` (`call-receipt/CallRecoveryPanel.tsx` 200). No dest delete. |
| Credit | `OPEN` | Cap / recharge edits are consequential but not labelled destructive. Portal management is external Stripe ([W-22](./user-and-org-ergonomics-register.md)). |
| Provider workspace | `PARTIAL` | **Withdraw** sits next to **Update Price** as `variant="secondary"` (`supply/AeProviderToolDetail.tsx` 249–257) — not the destructive variant, not separated by a confirm in this file. |
| Shared account | `IMPLEMENTED` | Close workspace is `variant="destructive"`, name-to-confirm, then a second destructive dialog (`WorkspaceClosePanel.tsx` 51–80). Transfer is a separate panel ([W-10](./user-and-org-ergonomics-register.md)–[W-14](./user-and-org-ergonomics-register.md)). |

### Test conditions (mobile keyboard open, large text, slow connections, long content, interrupted sessions)

These are **required acceptance conditions**, not optional polish. PRODUCT.md “Reference products are the default” asks for interruptions and recovery, not happy-path copy alone.

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Slow: `pendingMs: 1_000` so filter reloads do not flash the full-page skeleton (`src/routes/market.tsx` 32–40). Long: filter aside `max-h-[calc(100dvh-7rem)]` (`DirectoryExplorerFilters.tsx` 165); compare dialog `max-h-[85dvh]` (`market/DirectoryComparison.tsx` 27). **No** virtual-keyboard, 200% text, or interrupted-session dest test. |
| Tool detail | `PARTIAL` | Pending uses `AePageSkeleton` `shape="detail"` (`src/routes/tools.$providerHost.$slug.tsx` 38). Interrupted return to market is tagged history ([EX-01](./platform-experience-register.md) / `market-return-context.ts`). Large text / keyboard **OPEN**. |
| Chat | `PARTIAL` | Composer `max-h-40` + `env(safe-area-inset-bottom)` (`ChatComposer.tsx` 37, 60). Thread is a path (`src/routes/t.$threadId.tsx`). First-page pending is two bubbles, not the colocated page skeleton (`ChatTranscript.tsx` 38–45). **No** `visualViewport` / keyboard-inset. 200% text **OPEN**. |
| Agents | `PARTIAL` | `resumeTool` query preserves the selected Tool ([EX-01](./platform-experience-register.md) strengths). Authorize is a shareable page. Keyboard-open / large-text **OPEN**. |
| Calls / receipt | `PARTIAL` | Receipt pending is the colocated five-region skeleton (`src/routes/_operator/calls.$callRef.tsx` 56–61). Long playbook / technical `<details>` collapse. Activity list pending is a **table preset**, not `AeActivitySkeleton`. Large text / keyboard **OPEN**. |
| Credit | `PARTIAL` | Stripe return + reserved quote shell ([W-20](./user-and-org-ergonomics-register.md)). Route pending is the operator **table** preset (`src/lib/operator/route-options.ts` 55–61; `owner.credit.tsx` 21). Keyboard-open on amount field **OPEN**. |
| Provider workspace | `PARTIAL` | Connect return poller + saved-source resume copy (`supply/AeOwnerSupplySourceStartPage.tsx` 69–72; [W-33](./user-and-org-ergonomics-register.md)). Wizard `min-h-[28rem]` ([W-30](./user-and-org-ergonomics-register.md)). Keyboard-open on ABN **OPEN**. |
| Shared account | `PARTIAL` | Overlay claims “without leaving your current task” (`AeSettingsDialog.tsx` 53–55); [DS-38](./design-system-maturity-register.md) source-interpolates Escape → same path. Command palette is `100dvh` on small screens (`AeCommandPanel.tsx` 91) — will collide with a mobile keyboard. Large text **OPEN**. |

No dest family has an `IMPLEMENTED` cell for this row. That is a criterion gap, not a maturity score.

### Zero-CLS skeletons (protocol Rule 1)

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Route pending is `AePageSkeleton` `shape="market"` — search bar + 3 chips + 4 **rows**, not listing-card geometry (`layout/AePageState.tsx` 124–138; `src/routes/market.tsx` 56–57). No colocated `Directory*` skeleton. |
| Tool detail | `PARTIAL` | `shape="detail"` two-column blocks (`AePageState.tsx` 111–121). Not `AeToolInspector` / next-action geometry. |
| Chat | `PARTIAL` | `ChatSkeleton.tsx` mirrors header + dock + two bubbles — **not imported** by `src/routes/t.new.tsx` or `t.$threadId.tsx` (no `pendingComponent`). In-session pending is two bubbles only (`ChatTranscript.tsx` 38–45). History sheet has four `h-touch` rows (`ChatHistory.tsx` 61–64). |
| Agents | `PARTIAL` | `AeAgentAccessHomeSkeleton.tsx` exists — **not** the route `pendingComponent` (`src/routes/_operator/agent-access.tsx` 39 uses `operatorRouteOptions` → `OperatorRoutePending` default). Spending / connect skeletons exist as files; authorize route uses generic operator pending (`agent-access.authorize.tsx` 29). |
| Calls / receipt | `PARTIAL` | **Receipt:** colocated skeleton wired (`calls.$callRef.tsx` 56–61; `CallReceiptSkeleton.tsx` 14–77) — [W-41](./user-and-org-ergonomics-register.md). **Calls list:** `AeActivitySkeleton.tsx` exists — route uses `OperatorRoutePending` `table` preset (`activity.tsx` 32; `AeRouteStates.tsx` 55–61, 69–99). |
| Credit | `PARTIAL` | No `AeOwnerCreditSkeleton`. After mount, balance / ceiling / recharge wells reserve height (`AeOwnerCredit.tsx` 184–282). First paint is operator `table` skeleton (`inferOperatorSkeletonPreset` includes `/credit`). |
| Provider workspace | `PARTIAL` | Route pending **is** `AeProviderWorkspaceSkeleton` (`src/routes/_operator/owner.operations.tsx` 36) — inventory list `loading`. Wizard / playground / earnings / price-update / handoff skeletons exist (see § Skeletons). |
| Shared account | `PARTIAL` | Danger-zone skeleton file exists. Settings overlay personal load is a **sentence**, no reserved well (`AeSettingsDialog.tsx` 60–61). Team table has an `aria-busy` skeleton (`AeTeamDirectoryTable.tsx` 170). Workspace Clerk wells `min-h-96` (`WorkspaceSettingsBody.tsx` 16). |

### Copy-paste for refs / keys / commands (protocol Rule 3)

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | No 1-click copy on listing cards (`DirectoryToolCard.tsx`). Compare / search do not expose a Tool ref control. |
| Tool detail | `IMPLEMENTED` | Next action can render `AeCopyCommand` (`AeToolNextAction.tsx` 101–105). |
| Chat | `PARTIAL` | Error path copies a support ref (`ChatComposer.tsx` 86). Share path is a readonly input + copy (`ChatHeader.tsx` 69–71). Choice rows are links, not copy controls (`ToolCard.tsx` 62). |
| Agents | `IMPLEMENTED` | Key reveal + snippets + destination toasts ([W-25](./user-and-org-ergonomics-register.md), [W-27](./user-and-org-ergonomics-register.md), [W-29](./user-and-org-ergonomics-register.md)). |
| Calls / receipt | `IMPLEMENTED` | `CallReceiptRef` → `AeCopyReference` with 2000ms check (`CallReceiptPrimitives.tsx` 25–27). [W-39](./user-and-org-ergonomics-register.md). |
| Credit | `PARTIAL` | Invoice / receipt downloads, not ref copy ([W-24](./user-and-org-ergonomics-register.md)). Support refs appear on route errors (`layout/AeRouteStates.tsx` 268–272). |
| Provider workspace | `PARTIAL` | Playground “Copy response” (`supply/tool-test-playground/components/PlaygroundResponsePane.tsx` 23). Earnings masks Stripe account id ([W-31](./user-and-org-ergonomics-register.md)). |
| Shared account | `PARTIAL` | Team email 1-click copy (`AeTeamDirectoryTable.tsx` 67). Command console copies via tool pages when opened. |

`AeCopyReference` (`data/AeCopyReference.tsx` 22–46): `aria-label`, check icon, `role="status"`. Copy button is `size="icon-sm"` (32px) — craft Rule 3 met; 44px target not.

### Diagnostic playbooks (protocol Rule 4)

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `PARTIAL` | Filter/route errors say what failed and what to change (`DirectoryExplorerFilters.tsx` 84, 101; `src/routes/market.tsx` 65). No financial-impact line (correct: browse is not a Charge). |
| Tool detail | `PARTIAL` | Unavailable vs not-found + market return ([EX-01](./platform-experience-register.md)). Not a four-section playbook. |
| Chat | `PARTIAL` | Composer error + ref + next (`ChatComposer.tsx` 79–96). Tool card `status` alerts (`ToolCard.tsx` 120–124). Chat must not manufacture purchase authority ([JI-04b](./jev-platform-integration-register.md)). |
| Agents | `IMPLEMENTED` | Rule 4 slots on spending / connect / revoke ([W-25](./user-and-org-ergonomics-register.md), [W-26](./user-and-org-ergonomics-register.md), [W-28](./user-and-org-ergonomics-register.md)). |
| Calls / receipt | `IMPLEMENTED` | Four labelled playbook sections (`CallReceiptPrimitives.tsx` 55–72). [W-39](./user-and-org-ergonomics-register.md). |
| Credit | `IMPLEMENTED` | [W-20](./user-and-org-ergonomics-register.md)–[W-23](./user-and-org-ergonomics-register.md) reserved diagnostic wells. |
| Provider workspace | `IMPLEMENTED` | Wizard / poller / playground / price-update triplets ([W-30](./user-and-org-ergonomics-register.md), [W-33](./user-and-org-ergonomics-register.md), [W-36](./user-and-org-ergonomics-register.md), [W-37](./user-and-org-ergonomics-register.md)). |
| Shared account | `IMPLEMENTED` | Tax / danger / security slots ([W-03](./user-and-org-ergonomics-register.md)–[W-14](./user-and-org-ergonomics-register.md)). Overlay itself has no playbook for a failed history read (`AeSettingsDialog.tsx` 40–41, 60–61). |

### Tabular-nums for money (protocol Rule 5)

| Dest | Grade | Evidence |
| --- | --- | --- |
| Market | `IMPLEMENTED` | Card price `tabular-nums` (`DirectoryToolCard.tsx` 56). Shared `AeToolPrice` is `font-mono … tabular-nums` (`market/AeToolPrice.tsx` 30). Facet counts `tabular-nums` (`DirectoryExplorerFilters.tsx` 49, 68). |
| Tool detail | `IMPLEMENTED` | Directory price `tabular-nums` (`AeDirectoryToolCanonicalPage.tsx` 54). `AeToolPrice` on inspector paths. |
| Chat | `PARTIAL` | Choice rows use `AeToolPrice` (`ToolCard.tsx` 81). Prompt counter is `tabular-nums` but is a length, not money (`ChatComposer.tsx` 106). |
| Agents | `IMPLEMENTED` | Spending readout / inputs `font-mono tabular-nums` (`SpendingLimitInputs.tsx` 41, 69; [W-26](./user-and-org-ergonomics-register.md)). |
| Calls / receipt | `IMPLEMENTED` | Queue amounts + playbook money well `tabular-nums` (`activity/components/ActivityCallQueue.tsx` 69; `CallReceiptPrimitives.tsx` 61). |
| Credit | `IMPLEMENTED` | Balance `font-mono text-2xl … tabular-nums` (`AeOwnerCredit.tsx` 205). GST rows / chips ([W-20](./user-and-org-ergonomics-register.md)). |
| Provider workspace | `IMPLEMENTED` | Payout threshold / ABN / playground latency / price revision ([W-30](./user-and-org-ergonomics-register.md), [W-32](./user-and-org-ergonomics-register.md), [W-37](./user-and-org-ergonomics-register.md)). |
| Shared account | `IMPLEMENTED` | Tax / danger / notification thresholds `font-mono tabular-nums` ([W-03](./user-and-org-ergonomics-register.md)–[W-14](./user-and-org-ergonomics-register.md); `WorkspaceClosePanel.tsx` 43). |

---

## Finding table

Cross-link existing owners. Do not open a parallel `W-*` wave.

| ID | Dest | Job | Evidence | Gap | Existing owner |
| --- | --- | --- | --- | --- | --- |
| **ERG-01** | Market | J-B01 / J-B02 | `DirectoryToolCard.tsx` 34–42, 59 | Listing title suppresses the control outline and paints a full-card `after` ring. Save is `icon-sm` (32px). Keyboard exists; focus evidence is non-standard and untested. | [DS-19](./design-system-maturity-register.md) (grammar only). **none** for dest keyboard. |
| **ERG-02** | Market / Tool detail | J-B01 / J-B02 | `AePageState.tsx` 111–138; `market.tsx` 56–57; `tools.$providerHost.$slug.tsx` 38 | Pending layouts are generic market **rows** / detail **blocks**, not listing cards or inspector + next-action. CLS risk on first slow load. | App-shell `S-*` closed. [W-41](./user-and-org-ergonomics-register.md) is receipt-shaped, not these dests. |
| **ERG-03** | Calls / Agents / Chat | J-B07 / J-B05 / J-B01 | `AeActivitySkeleton.tsx`; `AeAgentAccessHomeSkeleton.tsx`; `ChatSkeleton.tsx`; `activity.tsx` 32; `agent-access.tsx` 39; `t.new.tsx` / `t.$threadId.tsx` (no `pendingComponent`) | Colocated dest skeletons exist and are **unwired**. Routes fall through to `OperatorRoutePending` presets or mount Chat with no page pending. | [W-38](./user-and-org-ergonomics-register.md), [W-41](./user-and-org-ergonomics-register.md), [DS-25](./design-system-maturity-register.md), [DS-27](./design-system-maturity-register.md), [DS-29](./design-system-maturity-register.md) — completion labels describe files, not route wiring. |
| **ERG-04** | Shared account | J-R02 | `AeSettingsDialog.tsx` 50–61 | Personal scope shows `Loading account settings…` with no reserved height, no `aria-busy` well, no colocated skeleton. Overlay can shift when `AccountSettingsSection` arrives. | [DS-38](./design-system-maturity-register.md) |
| **ERG-05** | Market / Chat / Shared | J-B01 / J-B02 | `src/components/ui/field.tsx` 229; `DirectoryExplorerFilters.tsx` 89; `ChatComposer.tsx` 81 | `FieldError` `text-destructive` is a named AA leftover. Every dest that uses FieldError inherits it. | [DS-09](./design-system-maturity-register.md) |
| **ERG-06** | Shared / Calls / Market | J-R02 / J-B07 / J-B02 | `ThemeToggle.tsx` 41–45; `ActivityFilterBar.tsx` 47, 86, 116; `DirectoryToolCard.tsx` 34; `checkbox.tsx` 35; `dialog.tsx` 187 | Resting controls sit at 16–32px (or 24px floor) while `--ae-touch` is 44px. `max-sm:min-h-touch` covers some, not desktop Calls export/chips or ThemeToggle. | [W-43](./user-and-org-ergonomics-register.md), [W-38](./user-and-org-ergonomics-register.md), [DS-25](./design-system-maturity-register.md) |
| **ERG-07** | Agents | J-B05 | `AgentLifecycleConfirmDialog.tsx` 50–66 | Drain vs immediate-freeze cards are `role="button"` with `tabIndex={-1}`. Keyboard users cannot Tab to the mode that changes financial drainage. Confirm remains a destructive button. | [W-28](./user-and-org-ergonomics-register.md) |
| **ERG-08** | Chat / Shared / Market | J-B01 / J-R02 | `ChatComposer.tsx` 37, 60; `AeCommandPanel.tsx` 91; `AeSettingsDialog.tsx` 50 | Mobile keyboard open, 200% text, and slow-connection **dest** proof are absent. Command panel and settings use `100dvh` / `max-h` shells that will sit under a virtual keyboard. Safe-area is not keyboard-inset. | App-shell `S-*` (safe-area only). **none** for virtual keyboard / large text. |
| **ERG-09** | Credit | J-B06 | `owner.credit.tsx` 21; `AeRouteStates.tsx` 55–61; `AeOwnerCredit.tsx` 184–282 | First-route pending is a **table** preset, not the credit wells. After hydration, reserved wells exist. No colocated page skeleton file. | [W-20](./user-and-org-ergonomics-register.md)–[W-23](./user-and-org-ergonomics-register.md) |
| **ERG-10** | Tool detail | J-B02 / J-B03 | [DS-18](./design-system-maturity-register.md); [EX-01](./platform-experience-register.md); `AeDirectoryToolCanonicalPage.tsx` | Unavailable / not-found are labelled. Found-state keyboard, contrast, and next-action reflow are **not walked**. Do not implement from interpolation. | [DS-18](./design-system-maturity-register.md), [EX-01](./platform-experience-register.md), [JI-04b](./jev-platform-integration-register.md) for purchase continuation |
| **ERG-11** | Chat | J-B01 | `ChatTranscript.tsx` 38–45 vs `ChatSkeleton.tsx` 4–28 | First-page pending reserves two bubbles and omits header/composer geometry that `ChatSkeleton` already describes. | [DS-29](./design-system-maturity-register.md), [W-41](./user-and-org-ergonomics-register.md) |
| **ERG-12** | Market | J-B02 | `DirectoryToolCard.tsx` (no copy control) vs `AeToolNextAction.tsx` 101–105 | Tool refs / commands become copyable on detail, not on the listing used to choose. | [W-29](./user-and-org-ergonomics-register.md) (snippets, not cards). **none** for listing copy. |
| **ERG-13** | Provider workspace | J-P01 | `AeProviderToolDetail.tsx` 249–257 | Withdraw is `variant="secondary"` beside Update Price — not destructive, not confirmed in this surface. | [W-34](./user-and-org-ergonomics-register.md) |
| **ERG-14** | Provider workspace | J-P01 | [EX-02](./platform-experience-register.md); wizard ABN field vs inventory save | Wizard validation can demand an ABN the workspace save does not persist. Useful-validation criterion fails if copy and contract disagree. | [EX-02](./platform-experience-register.md), [W-30](./user-and-org-ergonomics-register.md) |
| **ERG-15** | Chat | J-B03 | `convex/chatTools.ts` (JI); `ChatComposer.tsx` 79–96 | Discovery error playbook exists. Authorised-Agent Quote/Call from chat is not dest-accepted. | [JI-04b](./jev-platform-integration-register.md), [EX-04](./platform-experience-register.md) |
| **ERG-16** | Shared account | J-R02 | `WorkspaceSettingsBody.tsx` 16–24, 31–38; [DS-17](./design-system-maturity-register.md) | Personal/workspace overlay embeds Clerk `OrganizationProfile`. Keyboard, labels, contrast, and touch inside that island are not AE-testable. AE can only accept the chrome around it. | [DS-17](./design-system-maturity-register.md), [DS-38](./design-system-maturity-register.md), [W-10](./user-and-org-ergonomics-register.md) |

---

## Skeletons vs unreserved load

### Dest / compound skeletons that exist (colocated files)

| Surface | File | Wired to a route / pending boundary? |
| --- | --- | --- |
| Call receipt | `call-receipt/CallReceiptSkeleton.tsx` | **Yes** — `src/routes/_operator/calls.$callRef.tsx` 56–61 |
| Provider workspace | `offerings/provider-workspace/AeProviderWorkspaceSkeleton.tsx` | **Yes** — `src/routes/_operator/owner.operations.tsx` 36 |
| Connection handoff | `supply/connection-handoff/AeConnectionHandoffSkeleton.tsx` | Compound-local |
| Supplier onboarding wizard | `supply/supplier-onboarding-wizard/AeSupplierOnboardingWizardSkeleton.tsx` | File exists; wizard also uses a reserved `min-h` shell ([W-30](./user-and-org-ergonomics-register.md)) |
| Tool test playground | `supply/tool-test-playground/AeToolTestPlaygroundSkeleton.tsx` | Compound-local |
| Price update modal | `supply/price-update-modal/AePriceUpdateModalSkeleton.tsx` | Compound-local |
| Earnings card | `supply/earnings-card/AeSupplyEarningsCardSkeleton.tsx` | Compound-local |
| Authorize form | `agent-access/authorize-form/AeAgentAccessAuthorizeFormSkeleton.tsx` | File exists; authorize **route** uses `OperatorRoutePending` |
| Agent home | `agent-access/home/AeAgentAccessHomeSkeleton.tsx` | **No** — `agent-access.tsx` uses `operatorRouteOptions` |
| Agent operator console | `console/agent-operator-console/AeAgentOperatorConsoleSkeleton.tsx` | Compound-local |
| Connect-agent wizard | `console/connect-agent-wizard/AeConnectAgentWizardDialogSkeleton.tsx` | Compound-local |
| Spending limits | `console/spending-limits-form/AeAgentSpendingLimitsFormSkeleton.tsx` | Compound-local |
| Calls list | `activity/AeActivitySkeleton.tsx` | **No** — `activity.tsx` uses `OperatorRoutePending` `table` |
| Chat page | `chat/chat-session/ChatSkeleton.tsx` | **No** — `/t/new` and `/t/$threadId` have no `pendingComponent` |
| Workspace danger zone | `settings/workspace-danger-zone/WorkspaceDangerZoneSkeleton.tsx` | Compound-local |
| Command palette | `command-panel/tools-search-page/ToolsSearchPageSkeleton.tsx` | Compound-local |
| Sign-in / sign-up / onboarding / status / remove-business | matching `*Skeleton.tsx` under `auth/`, `principal-account/`, `status/`, `privacy/` | Outside these dest families; [DS-17](./design-system-maturity-register.md) notes status skeleton may remain unwired |

### Dest families that load without a dest-shaped reserved layout

| Dest | What actually paints | Why it fails Rule 1 |
| --- | --- | --- |
| **Market** | `AePageSkeleton` `shape="market"` (chips + rows) | Not listing-card / hero / filter geometry |
| **Tool detail** | `AePageSkeleton` `shape="detail"` | Not inspector + facts + next-action |
| **Chat** (route) | Chat mounts immediately; first page may show two bubbles | `ChatSkeleton` unused; header/composer can pop in |
| **Agents** (home) | `OperatorRoutePending` **default** (six `h-touch` bars) | `AeAgentAccessHomeSkeleton` unused |
| **Calls** (list) | `OperatorRoutePending` **table** (4 columns × 5 rows) | `AeActivitySkeleton` unused; filter + dual queues not reserved |
| **Credit** (first navigation) | `OperatorRoutePending` **table** | Credit is wells + GST, not a 4-column table |
| **Shared account** (overlay) | `Loading account settings…` | No reserved personal-settings geometry |
| **Authorize** (Agents grant) | `OperatorRoutePending` | Authorize-form skeleton unused on the route |

### Dest families with reserved layout after the compound mounts (not a route skeleton)

| Dest | Reserved wells in the loaded compound |
| --- | --- |
| Credit | Balance / ceiling / recharge / quote / invoice toolbar (`AeOwnerCredit.tsx` 184–282; [W-20](./user-and-org-ergonomics-register.md)–[W-24](./user-and-org-ergonomics-register.md)) |
| Agents (spending / connect) | `min-h-[24.5rem]` spending shell; wizard reserved slots ([W-26](./user-and-org-ergonomics-register.md), [W-25](./user-and-org-ergonomics-register.md)) |
| Calls / receipt (receipt only) | Five-region skeleton matches loaded receipt ([W-41](./user-and-org-ergonomics-register.md)) |
| Provider workspace | Wizard `min-h-[28rem]`; payout `min-h-[26rem]`; poller `min-h-[11rem]` ([W-30](./user-and-org-ergonomics-register.md)–[W-33](./user-and-org-ergonomics-register.md)) |
| Shared account (full pages) | Clerk `min-h-96`; danger-zone `min-h-[28rem]` ([W-10](./user-and-org-ergonomics-register.md)–[W-14](./user-and-org-ergonomics-register.md)) |

---

## What this register does not do

- Does not score overall platform maturity or invent audit percentages.
- Does not reopen `W-01`–`W-44`, `DS-01`–`DS-39`, or `JI-*` as a new campaign. Findings name the existing owner.
- Does not replace [user-and-org-ergonomics-register.md](./user-and-org-ergonomics-register.md). That file still owns the 44 workflow craft completions.
- Does not treat tactile physics (`:active:scale-[0.98]`) as a new standard — it remains protocol Rule 2, already recorded on those `W-*` lines.
- Does not accept hosted Clerk/Stripe interiors as AE keyboard/contrast proof.
- Does not mark `SEEN` for these criteria. Recheck cited lines, then walk the dest, before implementation.

---

## Recheck before implementation

1. Open the cited file and confirm the line still states the same control, class, or pending wiring.
2. Prefer the existing owner (`DS` / `W` / `JI` / `EX`) over a new ergonomics wave.
3. For skeleton work: wire the colocated dest skeleton or change the route `pendingComponent` — do not add a third pending family.
4. For touch: `--ae-touch` (44px) is the target; 24×24 is the WCAG floor, not the product ideal.
5. For test conditions: prove mobile keyboard open, large text, slow connection, long content, and an interrupted session on the dest you touch — source classes alone do not close ERG-08.
