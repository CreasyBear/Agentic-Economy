# General App Shell Maturity & Ergonomics: Operating Protocol

**Date:** 18 September 2026  
**Status:** Approved Master Protocol & Execution Reference  
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/operations/user-and-org-maturity-protocol.md`, `docs/operations/user-and-org-ergonomics-protocol.md`, `docs/operations/app-shell-maturity-register.md`

---

## 1. Executive Purpose & Shell Cockpit Thesis

The Application Shell is not a decorative frame; it is the **durable, persistent cockpit** hosting every interaction across discovery, tool procurement, agent execution observability, financial governance, and public exploration.

In an agentic marketplace where buyers deploy autonomous software and suppliers monetize custom tools:
1. **Operators lose trust when the shell flickers, jerks the viewport, leaks keyboard focus, or misplaces navigation context.**
2. **Operators retain and feel in control when the shell feels instantaneous, tactile, spatially coherent, and resilient to network, auth, or runtime shocks.**

> **The App Shell Invariant:**  
> *"The Agentic Economy shell is a zero-latency, spatially coherent cockpit where an operator moves effortlessly across discovery, procurement, execution observability, and financial governance with zero visual jitter, instant keyboard fluidity, and impenetrable runtime resilience."*

---

## 2. Inverse Premortem: The Architecture of Inevitable Success

A standard pre-mortem asks: *"We shipped the shell and it failed catastrophically—why did it fail?"*  
An **Inverse Premortem (The Success Blueprint)** asks:  
> *"It is six months from now. The Agentic Economy app shell is celebrated as an industry benchmark for enterprise craft—comparable to Linear, Stripe Dashboard, and Raycast. It has achieved 99.99% interaction stability, zero layout shifts, zero hydration desynchronizations, and praise from power developers. Exactly what deliberate structural defenses, invariants, and architectural barriers caused that success?"*

### The 7 Structural Pillars of Shell Durability

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      THE 7 INVERSE PREMORTEM PILLARS                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Zero-Jitter Boundary Fencing: Shell chrome mounts once and NEVER remounts    │
│    across route boundaries, preventing DOM teardown and CSS recalculations.     │
│ 2. Scoped Context Isolation: Primitives (like SidebarProvider) live strictly    │
│    where their state has semantic meaning, preventing shortcut/cookie leaks.    │
│ 3. Spatial Continuity & Height Reservoirs: Every shell element (header, rail,    │
│    secondary bar, mobile tabs) reserves exact invariant pixel reservoirs.       │
│ 4. Two-Tier Hoisted Chrome Communication: Outlets register breadcrumbs and      │
│    badges into layout providers without prop drilling or render-loop races.     │
│ 5. Keyboard-First Substrate: Global hotkeys (⌘K, ⌘B, /, Esc) never clash with   │
│    native inputs, never swallow focus, and always offer clear visual cues.      │
│ 6. Tenancy-Immune Reactivity: Organization switches invalidate and reconcile    │
│    in-flight queries with zero whiteouts, race conditions, or unauthorized 403s.│
│ 7. Ambient Runtime Self-Healing: The shell traps offline disconnects, stale     │
│    Vite deployment chunks, and route errors without unmounting global chrome.   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The 4-Tier Zero-Handroll Engineering Directive

Every workflow in the shell register must adhere strictly to the 4-tier delegation strategy:

1. **Tier 1: Hosted Vendor Surfaces (Zero Custom Code)**
   - Use Clerk components: `<UserButton />`, `<OrganizationSwitcher />`, `<SignIn />`, `<SignUp />`.
   - Never handroll bespoke authentication forms, avatar uploaders, or tenant switchers.
2. **Tier 2: Prebuilt Headless Primitives & Accessible Toolkits**
   - Radix UI: `@radix-ui/react-dialog` (Command panel, confirmations), `@radix-ui/react-dropdown-menu` (Theme toggle, action menus), `@radix-ui/react-popover` (Contextual cards), `@radix-ui/react-tooltip` (Collapsed sidebar tooltips).
   - UI Command: `cmdk` for the global command palette (`AeCommandPanel`).
   - Notification Stack: `sonner` for non-blocking toast notifications.
   - Never handroll custom focus traps, floating portal positioners, or keyboard listener engines.
3. **Tier 3: Open-Source Architectural Blueprints**
   - Linear Workspace Navigation & Command Palette.
   - Dub.co Scoped Header & Organization Switcher.
   - Stripe Dashboard Fixed Rail & Invariant Metric Layouts.
4. **Tier 4: Proprietary Core Code (AE-Owned)**
   - Custom code is strictly quarantined to AE domain routing: two-tier chrome bridge (`OperatorChromeProvider` + `AeOperatorPage`), role-based navigation resolution (`staticData.nav`), and financial observability integration.

---

## 4. The 6 Inviolable Shell Craft Rules

### Rule 1: The Persistent Frame Invariant
- The root app header (`[data-shell="app-header"]`) and operator rail (`[data-slot="sidebar"]`) must **never remount** during intra-surface client navigations.
- Enforced by Playwright end-to-end tests (`tests/e2e/shell-persistence.spec.ts`). Any PR introducing DOM teardown of the header is automatically blocked.

### Rule 2: The Absolute Zero-CLS Standard
- Dynamic data regions (record headers, secondary action bars, table lists, metric chips) must reserve their exact layout footprint using layout-stable skeleton primitives.
- Never use generic `<Skeleton className="h-24 w-full" />` that snaps when loaded. Every skeleton must mirror the exact grid columns, padding, and baseline typography of the resolved component.

### Rule 3: The Emil Kowalski Tactile Physics Standard
- Every interactive control across the shell—including sidebar menu buttons, header navigation links, breadcrumb anchors, mobile tab items, and modal triggers—must exhibit instant tactile feedback:
  ```css
  /* Physical micro-compression on active click/tap */
  :active:scale-[0.98] transition-transform duration-100 ease-out
  ```
- No artificial animation delays on search inputs, command palette filters, or keyboard navigation.

### Rule 4: Total Keyboard Coherence & Hotkey Safety
- Global shortcuts (`⌘K` / `Ctrl+K` for command console, `⌘B` / `Ctrl+B` for sidebar toggle, `/` for search, `Escape` for dismissal) must:
  1. Never fire when the user is actively typing in an `<input>`, `<textarea>`, or content-editable surface.
  2. Maintain a predictable navigation stack (e.g., `Escape` pops sub-pages before closing the modal).
  3. Feature visible keyboard shortcut badges (`<kbd>`) on both desktop and mobile views.

### Rule 5: Viewport Geometry & Mobile Safe-Area Harmony
- The shell must provide rock-solid responsive ergonomics across all 4 canonical viewport tiers:
  - **Mobile (<768px):** Sticky header with compact brand lockup, fixed 4-item bottom navigation (`AeOwnerMobileNavigation`), floating toasts positioned at `top-right` to prevent blocking touch targets.
  - **Tablet (768px–1024px):** Collapsible icon rail (`collapsible="icon"`), responsive breadcrumbs with auto-truncation, inline actions.
  - **Desktop (1024px–1440px):** Full-width expanded sidebar, sticky record headers, multi-column data tables.
  - **Ultra-Wide (>1440px):** Centered max-rail containment (`--ae-rail: 1408px`), balanced margins.
- All fixed bars must explicitly offset for iOS home indicators: `pb-[env(safe-area-inset-bottom,0px)]`.

### Rule 6: Ambient Runtime Resilience & Self-Healing
- The shell must never collapse into an unrecoverable blank white screen:
  1. **Network Disconnects:** Show ambient non-intrusive reconnection radar, never a blocking modal.
  2. **Route Load Failures:** Render `OperatorRouteError` inside the persistent shell with plain-English explanation, financial impact guarantee (`A$0.00 deducted`), and a 1-click copyable support correlation reference.
  3. **Stale Production Chunks:** Automatically trap Vite dynamic import failures via `attemptViteStaleChunkReload` and cleanly refresh.

---

## 5. The 4-Phase Subagent Protocol

Every workflow in the shell register must traverse this sequential cycle:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   THE 4-PHASE SUBAGENT PROTOCOL                        │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Ergonomic Scouting & Geometry Audit (Grok Subagent)          │
│    └─ Audit viewport geometry, CLS, keyboard paths, and focus flow     │
│    └─ Identify layout shifts, missing tactile feedback, or leaks       │
│    └─ Reference design standards (Linear, Stripe, Raycast)             │
│    └─ Output: Exact Before/After UX spec & test matrix                 │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 2: Red Test Construction (Composer Subagent)                    │
│    └─ Write failing unit/integration tests establishing the contract   │
│    └─ Colocate in tests/unit/layout/, tests/unit/ui/, tests/e2e/       │
│    └─ Verify tests fail for the exact expected reason (Red baseline)   │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 3: Bounded Craft Implementation (Composer Subagent)             │
│    └─ Implement Zero-Handroll Radix primitives & semantic tokens       │
│    └─ Implement Emil Kowalski tactile physics (:active:scale-[0.98])   │
│    └─ Implement zero-CLS content-matching skeletons                    │
│    └─ Turn tests green (Green baseline)                                │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 4: Cold Review & Integrity Release Gate (Parent Orchestrator)   │
│    └─ oxlint --deny-warnings && tsc --noEmit                          │
│    └─ npm run deps:check (ratchet verification)                        │
│    └─ npm run test:ui-contract (no raw colors/shadows/transition-all)  │
│    └─ Vitest & Playwright e2e/shell-persistence.spec.ts validation     │
│    └─ Mark VERIFIED in docs/operations/app-shell-maturity-register.md  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Execution Waves & Groupings

The 20 app shell workflows are divided into 4 sequential Waves. **No wave begins until the prior wave passes all release gates:**

- **Wave 1: Geometry Integrity, Zero-CLS & Layout Continuity**
  - Workflows: `S-01`, `S-02`, `S-03`, `S-04`, `S-05`
  - Focus: Scoping `SidebarProvider`, zero-CLS content skeletons, breadcrumb auto-truncation, mobile safe-area & toast deconfliction, sticky record headers.

- **Wave 2: Keyboard Velocity, Command Console & Tactile Physics**
  - Workflows: `S-06`, `S-07`, `S-08`, `S-09`, `S-10`
  - Focus: Linear-grade unified command console (navigation + actions), visible keyboard cheatsheet, Radix refactor of `ThemeToggle`, universal tactile physics, instant shortcut engine.

- **Wave 3: Contextual Shell Modes & Multi-Tenant Fluidity**
  - Workflows: `S-11`, `S-12`, `S-13`, `S-14`, `S-15`
  - Focus: Minimalist auth/onboarding shell mode, zero-flicker organization switching, Clerk switcher visual harmonization, collapsed icon rail quick-actions, public header specialization.

- **Wave 4: Runtime Resilience, Sensory Polish & Accessibility**
  - Workflows: `S-16`, `S-17`, `S-18`, `S-19`, `S-20`
  - Focus: Ambient network offline indicator, dark mode sunken surface calibration, spring-velocity route progress bar, WCAG 2.2 AA focus trapping, smooth view transitions.

---

## 7. Verification & Release Gates

Before claiming completion of any wave or line item in the register:
1. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run lint`
2. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck`
3. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run deps:check`
4. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/ui-contract/ tests/unit/layout/`
5. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx playwright test tests/e2e/shell-persistence.spec.ts`
6. Verify `docs/operations/app-shell-maturity-register.md` is updated with exact evidence and verified status.
