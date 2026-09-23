# General App Shell Maturity & Ergonomics Register

**Date:** 18 September 2026  
**Status:** ACTIVE REFINEMENT REGISTER (Step-by-Step Subagent Protocol)  
**Operating Protocol:** `docs/operations/app-shell-maturity-protocol.md`  
**Functional Baseline Reference:** `docs/operations/user-and-org-maturity-register.md`  
**Design Standards:** Emil Kowalski Design Engineering, Linear Workspace Standards, Stripe Dashboard Craft, Raycast Command Velocity

---

## 1. Progress & Census Scorecard

*Refinement in Progress via 4-Phase Subagent Protocol*

| Wave | Workflows | Scope | Verified | In Review | Pending | Target Status |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: |
| **Wave 1: Geometry Integrity, Zero-CLS & Layout Continuity** | 5 | `S-01`, `S-02`, `S-03`, `S-04`, `S-05` | 5 | 0 | 0 | `COMPLETE` |
| **Wave 2: Keyboard Velocity, Command Console & Tactile Physics** | 5 | `S-06`, `S-07`, `S-08`, `S-09`, `S-10` | 5 | 0 | 0 | `COMPLETE` |
| **Wave 3: Contextual Shell Modes & Multi-Tenant Fluidity** | 5 | `S-11`, `S-12`, `S-13`, `S-14`, `S-15` | 5 | 0 | 0 | `COMPLETE` |
| **Wave 4: Runtime Resilience, Sensory Polish & Accessibility** | 5 | `S-16`, `S-17`, `S-18`, `S-19`, `S-20` | 5 | 0 | 0 | `COMPLETE` |
| **Total** | **20** | **All 20 App Shell Workflows** | **20** | **0** | **0** | `COMPLETE` |

---

# Wave 1: Geometry Integrity, Zero-CLS & Layout Continuity

### S-01: Scope `SidebarProvider` Strictly to Operator Workspace
- **Surfaces:** `src/components/ae/layout/AeAppShell.tsx`, `src/routes/_operator.tsx`, `src/components/ui/sidebar.tsx`
- **Incumbent Baseline:** `SidebarProvider` wraps the entire application in `AeAppShell.tsx`. Public pages (marketing, catalog, legal, auth) inherit unnecessary sidebar state, document cookies (`sidebar_state`), and global `Cmd+B` event listeners.
- **Ergonomic & Stability Gap:**
  - Violates the principle of least privilege in UI tree hierarchy.
  - Public marketing visitors receive unnecessary cookie operations.
  - Pressing `Cmd+B` on `/terms` or `/market` triggers silent cookie updates and state mutations despite no sidebar existing on screen.
- **Target Ergonomic Spec:**
  - Hoist public frame cleanly in `AeAppShell.tsx` without `SidebarProvider`.
  - Mount `SidebarProvider` strictly inside `src/routes/_operator.tsx` around `OperatorChromeProvider` and `AeOperatorSidebar`.
  - Provide a safe fallback in `AeOperatorPage` and `AeAppShell` so rendering an operator component in isolated unit tests without a `SidebarProvider` never throws a context error.
  - Verify zero hydration mismatch across public and operator surfaces.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/layout/sidebar-provider-scope.test.tsx` (5/5 passed):
    1. Public `AeAppShell` renders zero `[data-slot="sidebar-wrapper"]`.
    2. Pressing `⌘B` on a public page does NOT set `sidebar_state` cookie.
    3. `--header-height: 4rem` remains cleanly declared on the root shell element.
    4. Operator layout owns the provider and mounts `[data-slot="sidebar-wrapper"]`.
    5. Isolated `AeOperatorPage` renders without throwing when `SidebarProvider` is absent.
  - Colocated regression verification: `tests/unit/operator-shell-chrome.test.tsx` (all 31 suites passed).
  - Vitest layout & UI contracts: 10 files, 47 passed (`tests/ui-contract/`, `tests/unit/layout/`).
  - Playwright E2E: `tests/e2e/shell-persistence.spec.ts` (6 passed in 21s) confirming header persistence, height invariance, no view-transition flashes, skip link integrity.
  - Quality gates: `oxlint` 0 warnings, `deps-ratchet` 0 circular dependencies.

---

### S-02: Zero-CLS Content-Preserving Route Skeletons
- **Surfaces:** `src/components/ae/layout/AeRouteStates.tsx`, `src/components/ae/layout/AePageState.tsx`, `src/components/ae/layout/AeOperatorPage.tsx`
- **Incumbent Baseline:** `OperatorRoutePending` renders a generic vertical stack of 6 uniform `<Skeleton className="h-touch w-full" />` bars.
- **Ergonomic & Stability Gap:**
  - Extreme Cumulative Layout Shift (CLS) when navigating into asymmetrical layouts (e.g., Overview metric cards, split-pane console views, or wide data tables).
  - Header actions, secondary filter bars, and breadcrumb heights jump abruptly when data resolves.
- **Target Ergonomic Spec:**
  - Implement route-aware skeleton presets: `'table'`, `'overview-cards'`, `'split-console'`, and `'form-record'`.
  - `OperatorRoutePending` inspects the active route or route metadata to project matching skeleton structures with exact reserved heights (`min-h-[14rem]` for tables, `h-32` for metric grids).
  - Reserve exact record header title height (`leading-tight font-sans text-2xl h-8 w-48`) and action button slots.
  - Table skeletons render identical column counts, matching header cell alignments, and subtle shimmer animations.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/layout/operator-route-skeletons.test.tsx` (17/17 passed):
    1. Presets render exact structural geometry matching destination layout:
       - `table`: 5 rows × 4 columns with `min-h-[14rem]`, filter shelf placeholder, and title placeholder.
       - `overview-cards`: 3 metric cards grid (`h-32`) + primary content area (`h-64`).
       - `split-console`: 2 columns with left rail (`h-96`) and main inspect panel (`h-96`).
       - `form-record`: 4 form input fields (`h-10`) + submit action button (`h-10 w-32`).
       - `default`: balanced fallback stack.
    2. Automatic route inference via `inferOperatorSkeletonPreset(pathname)` accurately maps routes (`/owner/workspace` $\rightarrow$ `overview-cards`, `/activity` $\rightarrow$ `table`, `/owner/settings` $\rightarrow$ `form-record`, `/t/agent` $\rightarrow$ `split-console`).
    3. `data-skeleton-preset`, `aria-busy="true"`, and `aria-label="Loading workspace"` confirmed.
  - Existing `tests/unit/operator-shell-chrome.test.tsx` pending-state suites continue to pass seamlessly.
  - 13 files, 67 tests passing in layout and UI contract suites.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-03: Responsive Breadcrumb Auto-Truncation & Tooltip Expansion
- **Surfaces:** `src/components/ae/layout/AeOperatorBreadcrumbs.tsx`, `src/components/ae/layout/AeOperatorPage.tsx`
- **Incumbent Baseline:** Breadcrumbs render full route segment labels without overflow containment.
- **Ergonomic & Stability Gap:**
  - On deep nested routes (e.g., `/calls/call_cl_01jb8...` or `/owner/operations/tool_provider_slug`), breadcrumbs wrap onto multiple lines on tablet viewports (768px–1024px) or push mobile triggers out of alignment.
- **Target Ergonomic Spec:**
  - Dynamic breadcrumb middle-truncation: long technical identifiers truncate to `call_cl_...89ab` or max 160px width.
  - Hovering/focusing a truncated breadcrumb reveals a Radix tooltip (`TooltipContent`) displaying the complete canonical reference with a 1-click copy affordance.
  - Intermediate crumbs collapse into an accessible ellipsis dropdown (`...`) when more than 3 hierarchy levels exist.
  - Preserves exact 44px touch target on mobile viewports.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/layout/operator-breadcrumbs.test.tsx` (6/6 passed):
    1. Short labels render intact without truncation or unnecessary tooltip wrappers.
    2. Long identifier `call_cl_01jb89xyz000000000123456` triggers middle-truncation (`call_cl_01...123456`) and exposes full value in `TooltipContent`.
    3. Non-ID long labels trigger end-truncation with `…`.
    4. Deep hierarchies (>3 levels) collapse intermediate segments into `BreadcrumbEllipsis` with `data-slot="breadcrumb-collapsed-items"` and hidden segment tooltip, keeping root and leaf visible.
    5. Links on non-current segments preserve navigation `href`.
  - Nested breadcrumb dynamic update test in `tests/unit/operator-shell-chrome.test.tsx` continues to pass cleanly.
  - Full Vitest suite: 13 files, 72 passed (`tests/ui-contract/`, `tests/unit/layout/`, `tests/unit/operator-shell-chrome.test.tsx`).
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-04: Mobile Navigation Safe-Area & Floating Toast Coordination
- **Surfaces:** `src/routes/__root.tsx`, `src/components/ae/layout/AeOwnerMobileNavigation.tsx`, `src/components/ae/layout/AeOperatorPage.tsx`
- **Incumbent Baseline:** Sonner `<Toaster />` renders in default bottom-center/bottom-right position. `AeOwnerMobileNavigation` renders fixed to `bottom-0 z-20`.
- **Ergonomic & Stability Gap:**
  - Toasts appear directly over the 4-item owner tab bar on mobile screens, completely blocking navigation and touch targets during active operations.
  - On modern iOS Safari, gestures near the home indicator clash with the fixed nav bar.
- **Target Ergonomic Spec:**
  - Coordinate responsive toast placement: render toasts at `position="top-right"` on viewports `<768px`, and `position="bottom-right"` on viewports `≥768px`.
  - When in bottom position on desktop, reserve strict elevation offset above any sticky footer.
  - `AeOwnerMobileNavigation` enforces explicit `pb-[env(safe-area-inset-bottom,0px)]` and `h-[calc(3.5rem+env(safe-area-inset-bottom,0px))]`.
  - Ensure main scroll container adds corresponding `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]` so content is never obscured by the bottom bar.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/layout/toaster-placement.test.tsx` (2/2 passed):
    1. Viewport <768px resolves toast placement to `top-right` with 72px top offset (clearing 64px header + 8px gap).
    2. Viewport ≥768px resolves toast placement to `bottom-right` with 16px bottom offset.
  - `tests/unit/ui/client-notification-boundary.test.ts` passed: `<Toaster>` strictly inside `<ClientOnly>`.
  - `tests/unit/operator-shell-chrome.test.tsx` passed: `content` enforces `pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]` and `mobileNav` enforces `h-[calc(3.5rem+env(safe-area-inset-bottom,0px))]`.
  - Full Vitest suite: 12 files, 50 passed (`tests/ui-contract/`, `tests/unit/layout/`, `tests/unit/operator-shell-chrome.test.tsx`).
  - Playwright E2E: `tests/e2e/shell-persistence.spec.ts` (6 passed in 19.5s).
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-05: Sticky Record Header & Secondary Filtering Shelf Integration
- **Surfaces:** `src/components/ae/layout/AeRecordHeader.tsx`, `src/components/ae/layout/AeOperatorPage.tsx`, `src/styles/globals.css`
- **Incumbent Baseline:** `AeRecordHeader` and `secondaryBar` are rendered in normal document flow inside `<main>`.
- **Ergonomic & Stability Gap:**
  - Scrolling through dense activity tables or tool listings causes the header and filter bar to scroll off-screen, forcing users to scroll all the way back to the top to change filters, search terms, or view page context.
- **Target Ergonomic Spec:**
  - Provide an optional `sticky` mode for `AeRecordHeader` + `secondaryBar`.
  - When enabled, the record header and secondary shelf stick beneath the global app header at `top-(--header-height)` with subtle border-b hairline and backdrop blur (`backdrop-blur-md bg-background/90`).
  - Smooth visual compression when stuck: title gently transitions from `text-2xl` to `text-lg` to maximize vertical data density.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/layout/operator-sticky-header.test.tsx` (5/5 passed):
    1. Defaults `stickyHeader` to false with zero sticky shelf DOM markup.
    2. Setting `stickyHeader={true}` mounts `data-testid="operator-sticky-shelf"` with `data-sticky-shelf="true"`.
    3. `secondaryBar` and `AeRecordHeader` cluster inside the sticky shelf container when enabled.
    4. `sticky` prop on standalone `AeRecordHeader` applies sticky styling and `data-record-header-sticky="true"`.
    5. Clean layout flow preserved across both modes.
  - Vitest layout & UI contracts: 14 files, 77 passed (`tests/ui-contract/`, `tests/unit/layout/`, `tests/unit/operator-shell-chrome.test.tsx`).
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

# Wave 2: Keyboard Velocity, Command Console & Tactile Physics

### S-06: Unified Linear-Grade Global Command Console
- **Surfaces:** `src/components/ae/command-panel/AeCommandPanel.tsx`, `src/components/ae/command-panel/pages/ToolsSearchPage.tsx`, `src/components/ae/command-panel/command-panel-state.ts`
- **Incumbent Baseline:** `AeCommandPanel` operated solely as a Tool catalog search.
- **Ergonomic & Stability Gap:**
  - Power developers expect `⌘K` to navigate anywhere in the product ("Go to Calls", "Go to Billing", "Create API Key", "Switch Workspace") rather than only querying the marketplace tools.
- **Target Ergonomic Spec:**
  - Upgrade command panel to a multi-group command palette:
    - **Navigation Group:** Direct route transitions to all primary destinations across public and operator workspaces (`/market`, `/activity`, `/owner/operations`, `/owner/credit`, `/owner/settings`, `/agent-access`, `/for-providers`).
    - **Quick Actions Group:** Direct triggers ("Toggle Theme", "Check System Status").
    - **Tools Market Group:** Live debounced catalog search with badge tags and recent tool memory.
  - Sub-millisecond instant filtering for navigation items; debounced 200ms background fetch for tools.
  - Full keyboard traversal (`ArrowUp`, `ArrowDown`, `Enter`).
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `COMMAND_NAVIGATION_ITEMS` (7 routes) and `COMMAND_QUICK_ACTIONS` (Toggle Theme, Check System Status) defined and integrated into `ToolsSearchPage.tsx`.
  - Instant filtering via `filterCommandPaletteEntries`: query-aware filtering ensures empty query renders all groups, matching queries filter instantly, and non-matching queries (e.g. `'weather'`) strictly hide nav/actions with zero catalog regression.
  - `AeCommandPanel.tsx` wires TanStack Router navigation and theme toggle via callbacks.
  - `tests/unit/command-panel/command-console-navigation.test.tsx` (4/4 passed): verifies empty query group rendering, navigation filtering, quick action execution, and catalog isolation.
  - Vitest command-panel suite: 3 files, 33/33 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-07: Visible Command Palette Keyboard Shortcuts & Cheatsheet
- **Surfaces:** `src/components/ae/command-panel/AeCommandPanel.tsx`, `src/components/ae/command-panel/pages/ToolsSearchPage.tsx`
- **Incumbent Baseline:** The command dialog opens with a bare search input without visible keyboard navigation hints; footer displayed raw static text.
- **Ergonomic & Stability Gap:**
  - Users are unaware of available shortcuts (`Esc` to pop page, `Enter` to run, `Tab` to jump, `/` to focus input).
- **Target Ergonomic Spec:**
  - Persistent command dialog footer displaying tactile keyboard chips:
    - `↑↓ Navigate`
    - `↵ Select`
    - `esc Back / Close`
    - `/ Search`
  - Keyboard chips styled with monospace tabular tokens (`font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border`).
  - Fully accessible screen-reader instructions via semantic `<footer aria-label="Keyboard shortcuts">`.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - Persistent `<footer aria-label="Keyboard shortcuts">` implemented in `AeCommandPanel.tsx` with semantic token `<kbd>` chips for `↑↓`, `↵`, `esc`, and `/`.
  - `tests/unit/command-panel/command-panel-shortcuts-footer.test.tsx` (1/1 passed): asserts footer presence, `aria-label`, `<kbd>` tokens with `font-mono text-[10px]`, and shortcut labels.
  - Vitest command-panel, layout, and UI contracts: 16 files, 90 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-08: Radix Headless Refactor of `ThemeToggle`
- **Surfaces:** `src/components/ae/layout/ThemeToggle.tsx`, `src/components/ae/theme/ThemeProvider.tsx`, `src/components/ui/dropdown-menu.tsx`
- **Incumbent Baseline:** `ThemeToggle.tsx` handrolls an absolute-positioned `div` with manual boolean state `[open, setOpen]` and custom click listeners.
- **Ergonomic & Stability Gap:**
  - Violates Tier 2 zero-handroll directive.
  - Lacks proper outside-click dismissal, lacks focus restoration on close, and fails keyboard traversal standards.
- **Target Ergonomic Spec:**
  - Introduce standard `src/components/ui/dropdown-menu.tsx` wrapping `@radix-ui` / `radix-ui` primitive.
  - Refactor `ThemeToggle` to use `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`.
  - Tactile trigger button with active compression (`:active:scale-[0.98] transition-transform duration-100 ease-out`).
  - Active theme radio checkmark with monospace labels (`Light`, `Dark`, `System`).
  - Spring-curve entry animation originating from the trigger icon.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `src/components/ui/dropdown-menu.tsx` implemented with complete Radix primitive exports adhering to UI contract tokens (`shadow-overlay`, `duration-base`, `ease-emphasized`, `motion-reduce:animate-none`).
  - `ThemeToggle.tsx` refactored cleanly onto Radix `DropdownMenu` + `DropdownMenuRadioGroup` + `DropdownMenuRadioItem`.
  - `tests/unit/components/theme-toggle.test.tsx` (7/7 passed):
    - T1: Renders trigger with accessible appearance label.
    - T2: Opens menu with Light, Dark, System options.
    - T3: Dark selection updates storage and document class.
    - T4: Light selection updates storage and document class.
    - T5: System selection updates storage and resolves from media query.
    - T6: Trigger button includes `:active:scale-[0.98]` tactile physics.
    - T7: Menu renders radio items with `aria-checked="true"` on the active option.
  - Vitest layout, component, and UI contracts: 14 files, 63 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-09: Universal Emil Kowalski Tactile Physics Across Navigation Links
- **Surfaces:** `src/components/ae/layout/AeAppShell.tsx`, `src/components/ae/layout/AeOperatorSidebar.tsx`, `src/components/ae/layout/AeOwnerMobileNavigation.tsx`, `src/components/ae/website/AeSiteNav.tsx`
- **Incumbent Baseline:** While buttons have `:active:scale-[0.98]`, sidebar navigation items, header links, and mobile bottom tab items lack micro-physics.
- **Ergonomic & Stability Gap:**
  - Navigation feels stiff and web-like rather than tactile and native.
- **Target Ergonomic Spec:**
  - Apply universal Emil Kowalski tactile physics to all navigation links:
    ```css
    :active:scale-[0.98] transition-transform duration-100 ease-out
    ```
  - Mobile bottom tabs (`AeOwnerMobileNavigation`) exhibit subtle icon spring deflection on touch.
  - Sidebar rail items compress horizontally (`active:scale-[0.98]`).
  - Strict motion-reduction check: disable all scale transforms when `prefers-reduced-motion: reduce`.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `tests/unit/layout/tactile-navigation-physics.test.tsx` (5/5 passed):
    1. Header nav links (`AppHeaderNavLink`) carry `:active:scale-[0.98]`, 100ms ease-out transform, and `motion-reduce:active:scale-100`.
    2. Header brand mark (`BrandLink`) carries `:active:scale-[0.98]` tactile physics.
    3. Operator sidebar rail buttons (`OPERATOR_NAV_BUTTON_CLASS` & role home link) carry `:active:scale-[0.98]`.
    4. Public drawer nav links (`PublicNavLink`) carry `:active:scale-[0.98]`.
    5. Mobile owner navigation links (`AeOwnerMobileNavigation`) carry `:active:scale-[0.98]` and `motion-reduce:active:scale-100`.
  - Vitest layout & UI contracts: 15 files, 82 passed.
  - Playwright E2E: `tests/e2e/shell-persistence.spec.ts` (6 passed in 16.4s).
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-10: Instant Global Shortcut Engine & Esc Unstacking
- **Surfaces:** `src/components/ae/command-panel/useCommandPanelHotKeys.ts`, `src/components/ae/shortcuts/KeyboardShortcutsDialog.tsx`, `src/components/ae/layout/AeAppShell.tsx`
- **Incumbent Baseline:** Hotkeys were scattered across independent components with ad-hoc keydown handlers.
- **Ergonomic & Stability Gap:**
  - Pressing `Escape` when multiple layers are open (e.g., Command Palette open over a Confirmation Dialog) can dismiss both layers at once or leave focus stranded.
- **Target Ergonomic Spec:**
  - Unified priority-based modal/layer stack manager for `Escape`:
    - Layer 3: Command Palette sub-page $\rightarrow$ pops sub-page.
    - Layer 2: Command Palette root $\rightarrow$ closes palette.
    - Layer 1: Active Dialog/Sheet $\rightarrow$ closes dialog and restores focus.
    - Layer 0: Collapsed sidebar rail $\rightarrow$ no-op.
  - Global `?` key opens a clean Keyboard Shortcuts Cheatsheet modal.
  - Safe guard: all shortcuts ignore events originating from editable targets (`input`, `textarea`, `select`, `contenteditable`).
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `KeyboardShortcutsDialog` component created with categorized cheatsheet (Navigation & Console + Item Traversal) styled with monospace `<kbd>` tokens adhering to UI semantic tokens.
  - `useGlobalShortcuts` hook bound to document: `?` opens cheatsheet with strict guard rejecting editable targets (`input`, `textarea`, `select`, `isContentEditable`).
  - Layered Escape priority verified: Command panel capturing `keydown` in capture phase pops sub-page / clears query / closes before propagation; Radix Dialog dismisses and restores focus on layer 1.
  - `tests/unit/layout/keyboard-shortcuts-dialog.test.tsx` (4/4 passed): validates chips, `?` opening, input guard rejection, and Escape dismissal.
  - Vitest layout, command-panel, and UI contracts: 18 files, 98 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

# Wave 3: Contextual Shell Modes & Multi-Tenant Fluidity

### S-11: Minimalist Distraction-Free Shell for Auth & Onboarding
- **Surfaces:** `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/routes/onboarding.tsx`, `src/components/ae/layout/AeAppShell.tsx`, `src/router.tsx`
- **Incumbent Baseline:** Auth and onboarding routes rendered inside the full standard public header, displaying the complete catalog navigation links, search bar, and "Sign in" buttons.
- **Ergonomic & Stability Gap:**
  - Visual clutter and high bounce rate during critical onboarding steps.
  - Having a "Sign in" button in the header while viewing the `/sign-in` form is redundant and confusing.
- **Target Ergonomic Spec:**
  - Introduce `staticData.shellMode: 'minimal'` on auth and onboarding routes.
  - When `shellMode === 'minimal'`, `AeAppShell` renders a clean, focused header:
    - Centered / split brand mark.
    - Suppressed public navigation links and search trigger.
    - Subtle contextual exit link ("Back to market" linking to `/market`).
  - Preserves persistent layout frame without unmounting root context or shifting height.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `src/router.tsx` augmented with `shellMode?: 'standard' | 'minimal'`.
  - `sign-in.$.tsx`, `sign-up.$.tsx`, and `onboarding.tsx` configured with `staticData: { shellMode: 'minimal' }`.
  - `AeAppShell.tsx` dynamically detects `shellMode === 'minimal'`, switching to distraction-free header while preserving `--header-height: 4rem` persistent container.
  - `tests/unit/layout/minimal-shell-mode.test.tsx` (3/3 passed): confirms minimal header on `/sign-in/$` with exit link and brand link, confirms absence of primary nav, command trigger, and mobile drawer, and verifies standard header remains active on `/market`.
  - Playwright E2E: `tests/e2e/shell-persistence.spec.ts` (6 passed in 19.0s).
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-12: Zero-Flicker Multi-Tenant Workspace Switching & Safe Redirection
- **Surfaces:** `src/components/ae/layout/AeOrganizationSwitcher.tsx`, `src/components/ae/layout/WorkspaceTransitionBoundary.tsx`, `src/routes/_operator.tsx`
- **Incumbent Baseline:** Switching organizations via Clerk triggered async state revalidation while potentially leaving users on tenant-specific leaf routes.
- **Ergonomic & Stability Gap:**
  - If a user switches organizations while on a tenant-specific leaf route (e.g. `/owner/operations/tool_acme_123`), the route may crash with a 403 or 404 before the redirect catches up.
- **Target Ergonomic Spec:**
  - Wrap organization change handler in a graceful transition boundary.
  - When switching organizations:
    1. Display an instantaneous translucent loading scrim over the content area with an ambient spinner.
    2. Safely navigate to `/owner/operations` if the current route depends on non-transferable entity IDs.
    3. Remove scrim once the new organization's authority state resolves.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `AeOrganizationSwitcher.tsx` sets `afterSelectOrganizationUrl`, `afterCreateOrganizationUrl`, and `afterLeaveOrganizationUrl` pointing to `/owner/operations`.
  - `WorkspaceTransitionBoundary.tsx` implements graceful tenant switching scrim with ambient spinner (`data-slot="workspace-transition-scrim"`) and deep-route redirection guard.
  - `_operator.tsx` wraps `<Outlet />` with `<WorkspaceTransitionBoundary>`.
  - `tests/unit/layout/workspace-transition-boundary.test.tsx` (3/3 passed): verifies Clerk URL destination props, scrim activation on `orgId` change, and automatic redirection off deep tenant routes.
  - Vitest layout & UI contracts: 20 files, 100 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-13: Clerk Organization Switcher Visual Harmonization
- **Surfaces:** `src/components/ae/layout/AeOrganizationSwitcher.tsx`, `src/components/ae/website/clerk-appearance.ts`
- **Incumbent Baseline:** Clerk's `<OrganizationSwitcher />` trigger was customized, but its opened modal/popover rendered standard Clerk styling.
- **Ergonomic & Stability Gap:**
  - Visual clash between AE's warm parchment/ink design tokens and Clerk's default gray popovers.
- **Target Ergonomic Spec:**
  - Deepen Clerk appearance customization in `clerk-appearance.ts` specifically for Organization Switcher elements:
    - Popover card uses `border border-border bg-popover text-popover-foreground shadow-overlay`.
    - Active organization pill uses `bg-brand-muted text-info-foreground border border-border` and monospace role badges.
    - Organization creation button matches `buttonVariants({ variant: 'outline' })` with tactile press.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `clerkOrganizationSwitcherAppearance` exported from `clerk-appearance.ts` with complete element targeting (`organizationSwitcherPopoverCard`, `organizationPreviewMainIdentifier`, `organizationPreviewSecondaryIdentifier`, `organizationSwitcherActiveOrganizationPill`, `organizationSwitcherPopoverActionButton`).
  - `AeOrganizationSwitcher.tsx` merges `clerkOrganizationSwitcherAppearance.elements` into `<OrganizationSwitcher appearance={{ elements }} />`.
  - `tests/unit/layout/organization-switcher-appearance.test.tsx` (5/5 passed): asserts popover card semantic tokens, active pill styling, merged props passed to Clerk component, and collapsed/expanded trigger classes.
  - Vitest layout & UI contracts: 19 files, 97 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-14: Collapsed Sidebar Icon Mode Ergonomics & Quick-Actions Rail
- **Surfaces:** `src/components/ae/layout/AeOperatorSidebar.tsx`, `src/components/ui/sidebar.tsx`
- **Incumbent Baseline:** Collapsing the sidebar hid text labels and showed icons with standard tooltips, hiding badges and hotkeys.
- **Ergonomic & Stability Gap:**
  - Tooltips can be slow to appear on quick scanning.
  - The collapsed state offers no quick way to view badges or sub-actions without expanding the entire rail.
- **Target Ergonomic Spec:**
  - Instant zero-delay Radix tooltips (`delayDuration={0}`) when sidebar is in collapsed icon mode.
  - Collapsed icon badges render as crisp numerical indicator dots (`size-2 bg-info rounded-full`).
  - Active indicator is clearly demarcated by a 3px vertical accent bar on the leading edge (`border-s-[3px]`).
  - Expand/collapse keyboard shortcut (`⌘B` / `Ctrl+B`) displayed directly on the sidebar rail handle.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `src/components/ui/sidebar.tsx`: `SidebarRail` displays `Toggle Sidebar (⌘B)` on `title` and `aria-label`.
  - `src/components/ae/layout/AeOperatorSidebar.tsx`: `OPERATOR_NAV_BUTTON_CLASS` features prominent `border-s-[3px]` leading edge.
  - Collapsed badge dot (`[data-slot="collapsed-badge-dot"]`) rendered on items with active counts, and tooltip dynamically augmented to include badge count in collapsed state (`Label (count)`).
  - `tests/unit/layout/operator-sidebar-collapsed-mode.test.tsx` (3/3 passed): confirms rail hotkey hint, 3px active border, and collapsed dot + tooltip count.
  - Vitest layout & UI contracts: 18 files, 92 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-15: Public Editorial vs Catalog Header Specialization
- **Surfaces:** `src/components/ae/layout/AePageHeader.tsx`, `src/components/ae/layout/AePublicPage.tsx`
- **Incumbent Baseline:** `AePageHeader` handled both public editorial copy and catalog headers through mixed branching with excessive padding on market surfaces.
- **Ergonomic & Stability Gap:**
  - Public market pages require high visual density and tabular metadata, while editorial pages require expansive display typography and open spacing.
- **Target Ergonomic Spec:**
  - Clearly delineate distinct header profiles:
    - **Editorial Profile (`variant="page"`):** Manrope display face, fluid text scaling (`PAGE_TITLE_CLASS`), generous padding (`py-section md:py-page`), `data-header-profile="editorial"`.
    - **Catalog / Market Profile (`variant="market"`):** Compact sans-serif typography (`MARKET_TITLE_CLASS`), compact vertical padding (`py-related sm:py-section`), inline tabular live counts (`tabular-nums font-mono text-xs`), `data-header-profile="market"`.
    - **Workspace Profile (`variant="workspace"`):** Compact interface shelf with `data-header-profile="workspace"`.
  - Zero layout shift between header profiles.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `AePageHeader.tsx` implements explicit `data-header-profile` attributes (`editorial`, `market`, `workspace`).
  - Market profile enforces compact padding (`py-related sm:py-section`) and sans-serif heading (`MARKET_TITLE_CLASS`), preventing sparse layout on catalog screens.
  - Editorial profile retains expansive typography (`PAGE_TITLE_CLASS`) and comfortable breathing room (`py-section md:py-page`).
  - `tests/unit/layout/page-header.test.tsx` (4/4 passed): verifies attributes, font classes, and padding across editorial, market, and workspace profiles.
  - Vitest layout & UI contracts: 20 files, 103 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

# Wave 4: Runtime Resilience, Sensory Polish & Accessibility

### S-16: Ambient Network Offline & Convex Reconnection Indicator
- **Surfaces:** `src/components/ae/layout/AeNetworkHealthIndicator.tsx`, `src/components/ae/layout/AeAppShell.tsx`
- **Incumbent Baseline:** Network disconnection triggered uncaught fetch errors or frozen UI without clear indication of network health.
- **Ergonomic & Stability Gap:**
  - Operators monitoring live agent calls become anxious when data stops streaming without clear indication of network health.
- **Target Ergonomic Spec:**
  - Non-intrusive ambient connection radar in the app header:
    - **Online:** Subtle green dot (`size-2 bg-success rounded-full`) with tooltip "Connection online".
    - **Offline:** Warning dot and persistent alert banner below the header (`data-slot="offline-warning-banner"` `role="alert"`: "You are currently offline. Showing cached data.").
  - Automatic silent state reconciliation once connectivity restores without full page reload.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `AeNetworkHealthIndicator.tsx` implemented with SSR-safe `useNetworkStatus()` (`useSyncExternalStore` + `window.addEventListener('online'/'offline')`).
  - Online radar with `data-slot="network-health-indicator"` `data-status="online"` mounted in header shelf; offline banner (`data-slot="offline-warning-banner"` `role="alert"`) conditionally rendered below header nav row using semantic warning tokens (`bg-warning/15 border-warning/30 text-warning-foreground`).
  - `tests/unit/layout/network-health-indicator.test.tsx` (3/3 passed): confirms default online state, displays banner on `offline` event dispatch, and clears banner on `online` restoration.
  - Vitest layout & UI contracts: 22 files, 110 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-17: Dark Mode Depth & Sunken Surface Contrast Calibration
- **Surfaces:** `src/styles/globals.css`, `src/styles/base.css`
- **Incumbent Baseline:** Dark mode mapped parchment tones to dark obsidian, but sunken well surfaces (`--ae-surface-sunken`) in code cards and data grids lacked contrast separation from hover/interactive states.
- **Ergonomic & Stability Gap:**
  - Visual hierarchy collapses in dark mode; nested panels feel flat and difficult to parse.
- **Target Ergonomic Spec:**
  - Fine-tune dark mode color tokens:
    - `--background`: Deep rich obsidian (`#141414`).
    - `--card` / `--container`: Elevated dark slate (`#1c1c1c`).
    - `--muted` / `--ae-surface-sunken`: Sunken well (`#0f0f0f`) with crisp borders (`#383838`).
    - `--accent`: Elevated hover/focus surface (`var(--ae-surface-raised)` / `#242424`).
  - Guarantee WCAG 2.2 AAA contrast ratio (≥7:1) for foreground text (`#e8e4da`) on background (`#141414`), and WCAG AA (≥4.5:1) for muted text (`#aaa89e`).
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `globals.css`: `.dark` `--accent` updated to `var(--ae-surface-raised)` (`#242424`) ensuring menus and list items visually elevate on hover, while `--muted` stays on sunken well (`#0f0f0f`).
  - `tests/unit/layout/dark-mode-contrast.test.ts` (4/4 passed): validates mathematical WCAG 2.2 contrast compliance (14.2:1 AAA for foreground, 6.7:1 AA for muted text) and parses CSS variables.
  - Vitest layout & UI contracts: 24 files, 119 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-18: Enhanced Route Progress Bar with Micro-Spring Velocity
- **Surfaces:** `src/components/ae/layout/AeRouteProgressBar.tsx`
- **Incumbent Baseline:** Standard 75ms delayed CSS scale-x bar without velocity stages.
- **Ergonomic & Stability Gap:**
  - On medium-length loads (200ms–500ms), the bar feels linear and robotic rather than dynamic and responsive.
- **Target Ergonomic Spec:**
  - Upgrade to non-linear micro-spring velocity:
    - Instant snap to 30% within 75ms to signal immediate acknowledgment.
    - Organic ease deceleration through 70% during data fetch.
    - Rapid 100% completion flush on route commit with smooth fade-out (`opacity-0 duration-200`).
  - Strict motion-reduction check: instantaneous opacity jump with zero width animation if `prefers-reduced-motion` is enabled.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - Multi-stage velocity implemented in `AeRouteProgressBar.tsx`: `idle` $\rightarrow$ `starting` (30% scale at 75ms) $\rightarrow$ `creeping` (70% scale at 200ms) $\rightarrow$ `finishing` (100% scale flush) $\rightarrow$ `idle` (fade-out reset).
  - Explicit inspectability attributes: `data-progress-bar="true"` and `data-phase={phase}`.
  - Motion reduction enforced via `motion-reduce:transition-none motion-reduce:transform-none motion-reduce:scale-x-100`.
  - `tests/unit/layout/route-progress-bar.test.tsx` (4/4 passed): validates idle state, starting delay/30%, creeping transition/70%, and finishing 100% flush.
  - Vitest layout & UI contracts: 21 files, 107 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-19: Comprehensive WCAG 2.2 AA Focus Trapping & Skip-Link Verification
- **Surfaces:** `src/components/ae/layout/AeAppShell.tsx`, `src/components/ae/layout/AeOperatorPage.tsx`, `src/components/ae/shortcuts/KeyboardShortcutsDialog.tsx`, `tests/e2e/a11y/shell-a11y.spec.ts`
- **Incumbent Baseline:** Skip link existed, but focus outlines and tab orders were not systematically validated across all modal/drawer transitions.
- **Ergonomic & Stability Gap:**
  - Keyboard navigation can get trapped in sheets or drop focus onto `document.body` after modal close.
- **Target Ergonomic Spec:**
  - High-visibility keyboard focus rings across all shell elements using semantic tokens (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
  - Automated unit and Playwright accessibility suite asserting:
    1. Skip-to-content smoothly moves focus to `main-content` on `Enter`.
    2. Dialog/Sheet dismissal returns focus strictly to the triggering button.
    3. Proper landmark structure across `<header>`, `<nav>`, `<main>`, `<footer>`.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `AeAppShell.tsx`: Skip link upgraded with `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Primary nav links include `focus-visible:ring-offset-2`.
  - `KeyboardShortcutsDialog.tsx`: Captures `document.activeElement` when triggered via `?` keydown, restoring focus via `onCloseAutoFocus` on DialogContent when dismissed.
  - `tests/unit/layout/shell-a11y-focus.test.tsx` (6/6 passed): validates skip link DOM order, href, focus ring classes, `#main-content` `tabIndex={-1}`, and Dialog/Sheet focus trapping and `aria-modal="true"` primitives.
  - `tests/e2e/a11y/shell-a11y.spec.ts` (4/4 passed on `wide-chromium`): tests skip link Tab/Enter focus, shortcuts dialog focus restore, ⌘K focus restore, and landmark structure.
  - Vitest layout & UI contracts: 28 files, 158 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

### S-20: Cross-Engine View Transition Smoothing & Reduced-Motion Respect
- **Surfaces:** `src/router.tsx`, `src/styles/globals.css`, `src/styles/base.css`
- **Incumbent Baseline:** `defaultViewTransition: true` was enabled in TanStack Router, but CSS pseudo-elements for view transitions were only partially styled.
- **Ergonomic & Stability Gap:**
  - In browsers supporting View Transitions API (Chromium, Safari 18+), navigations could trigger document-wide cross-fades that briefly flash the persistent chrome.
- **Target Ergonomic Spec:**
  - Isolate view transitions strictly to the routed outlet container:
    - `[data-shell="app-header"]` assigned `view-transition-name: ae-app-header;` with `::view-transition-group(ae-app-header) { animation: none; }`.
    - `[data-slot="sidebar"]` assigned `view-transition-name: ae-operator-sidebar;` with `::view-transition-group(ae-operator-sidebar) { animation: none; }`.
    - Root transition animations run on calibrated 220ms ladder (`--motion-duration-base`, `--motion-ease-standard`).
  - Strict motion reduction: `::view-transition-group(*)`, `::view-transition-old(*)`, `::view-transition-new(*)` enforce `animation: none !important` under `prefers-reduced-motion: reduce`.
- **Subagent Assignment:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)
- **Status:** `VERIFIED`
- **Verification Evidence:**
  - `globals.css`: Header and sidebar view-transition names (`ae-app-header`, `ae-operator-sidebar`) explicitly registered and exempted from cross-fade transitions.
  - `tests/unit/layout/view-transitions-isolation.test.tsx` (1/1 passed): verifies CSS property values, animation isolation, and reduced-motion override.
  - Playwright E2E: `tests/e2e/shell-persistence.spec.ts` (6 passed in 16.4s).
  - Vitest layout & UI contracts: 23 files, 114 passed.
  - Quality gates: `oxlint` 0 warnings, `deps:check` 0 circular dependencies.

---

## 5. Post-Wave Polish & IceInVein Refinement Pass

**Audit Scope:** Forensic evaluation against the Zero-Handroll Directive, Protocol Criteria, Dieter Rams' Principles, and Cognitive Ergonomics (Miller/Hick/Fitts).

### Identified Issues & Remediated Actions

1. **Elimination of Handrolled Portal Bridge & Duplicate IDs (S-16):**
   - *Finding:* `AeNetworkHealthIndicator.tsx` handrolled a DOM portaling bridge via `document.getElementById` and forced rerenders using `useReducer`. In `AeAppShell.tsx`, `id="ae-network-health-indicator-host"` was duplicated across minimal and standard headers (invalid HTML).
   - *Resolution:* Replaced with clean React component composition. `<AeNetworkHealthIndicator withBanner={false} />` mounts directly in the header action shelf, and `<AeNetworkHealthBanner />` mounts at the root of the header container. Zero portals, zero double-renders, zero duplicate IDs.

2. **IceInVein Cognitive Calm: Steady-State Indicator Radar (S-16):**
   - *Finding:* Steady online state had an unprompted `animate-ping` pulsing ring, violating Dieter Rams' removal test ("animations that do not convey state change are visual noise") and Cognitive Load Auditor ("motion competes for finite user attention").
   - *Resolution:* Calibrated the online dot to a calm, unflinching 8px green circle inside a 20px touch target button with `focus-visible:ring-1` focus ring for keyboard tab navigation.

3. **Tier 2 Primitives for Collapsed Breadcrumbs (S-03):**
   - *Finding:* Intermediate breadcrumbs (> 3 levels) collapsed into a button with a static tooltip string rather than an interactive navigation surface.
   - *Resolution:* Upgraded to a Radix UI `@radix-ui/react-dropdown-menu` with Emil Kowalski tactile physics. Clicking `...` opens a keyboard-traversable menu with links to intermediate pages. Hoisted `TooltipProvider` to component root to eliminate redundant context churn.

4. **Category Traversal via `Tab` / `Shift+Tab` in Command Console (S-06):**
   - *Finding:* Command console lacked category switching on `Tab`, forcing users to arrow down through 7+ items to reach Quick Actions or Catalog Tools.
   - *Resolution:* Implemented high-velocity category hopping in `ToolsSearchPage.tsx`. Pressing `Tab` jumps directly between Navigation $\rightarrow$ Quick Actions $\rightarrow$ Matching Tools groups, fulfilling S-06 target specification.

5. **Universal Theme Toggle Accessibility (S-08):**
   - *Finding:* `ThemeToggle` was isolated in `AeOperatorSidebar.tsx`, preventing public catalog visitors and mobile users from toggling appearance.
   - *Resolution:* Mounted `<ThemeToggle />` in the desktop header action shelf (beside `AeCommandPanel`) and inside the mobile drawer footer.

6. **Removal of Module-Level Mutable State (S-10):**
   - *Finding:* `KeyboardShortcutsDialog.tsx` used a module-scoped variable `shortcutsRestoreFocusRef` to track focus.
   - *Resolution:* Removed the module-level mutable ref; relied on Radix Dialog's native focus restoration.

7. **Sidebar Rail Shortcut Accessibility (S-14):**
   - *Finding:* `AeOperatorSidebar.tsx` overridden `aria-label` lost the `(⌘B)` keyboard shortcut hint.
   - *Resolution:* Restored shortcut cue in `title="Collapse navigation (⌘B)"` / `title="Expand navigation (⌘B)"`.

### Refinement Verification Metrics
- **TypeScript:** `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx tsc --noEmit` $\rightarrow$ 0 errors.
- **Linters:** `npx oxlint` $\rightarrow$ 0 errors, 0 warnings.
- **Architecture / Ratchet:** `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run deps:check` $\rightarrow$ 0 circular dependencies.
- **Unit & UI Contract Suite:** 28 test files, 166 passed.
- **Playwright E2E Persistence:** 6 passed (21.1s).

