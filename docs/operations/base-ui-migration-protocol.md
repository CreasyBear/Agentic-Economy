# Zero-Legacy Base UI & Modern shadcn Cutover: Operating Protocol

**Date:** 19 September 2026  
**Status:** Approved Master Protocol & Execution Reference (Zero-Shim Mandate)  
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `DESIGN.md`, `docs/operations/app-shell-maturity-protocol.md`, `docs/operations/base-ui-migration-register.md`

---

## 1. Executive Purpose & The Zero-Legacy Mandate

In July 2026, **shadcn/ui officially designated Base UI (`@base-ui/react` v1.8+) as its default headless primitive engine**, replacing Radix UI. Built by the authors of Radix UI, Floating UI, and Material UI in collaboration with W3C ARIA editors, Base UI delivers a cleaner DOM architecture, native CSS `@starting-style` transitions, and drops the fragile React `Slot` / `asChild` cloning pattern in favor of clean, predictable `render` props and unbundled `Positioner` / `Popup` primitives.

> **The Zero-Shim Directive:**  
> *"No compatibility bridges, no hybrid wrappers, and no dual-driver adapters shall remain in this codebase. We execute a clean-sheet, end-to-end migration from Radix UI to Base UI across all 42 UI primitives, all ~140 `asChild` consumer call sites, all internal CSS selectors, and all accessibility tests. Upon completion, every `@radix-ui/*` dependency is permanently excised from `package.json`."*

---

## 2. Inverse Premortem: Deliberate Invariants for Total Cutover

A standard pre-mortem asks: *"Why did the migration fail?"*  
The **Inverse Premortem (The Success Blueprint)** asks:  
> *"It is six months from now. The Agentic Economy codebase has zero trace of Radix UI. Not a single `asChild` remains. Every link is a clean semantic anchor. Base UI primitives render flawlessly on React 19. All 166 unit/UI contract tests and Playwright E2E suites pass with zero regressions. Exactly what deliberate structural defenses and architectural rules guaranteed this outcome?"*

### The 6 Structural Pillars of Migration Success

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      THE 6 INVERSE PREMORTEM PILLARS                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. Zero Shims, Pure Base UI Primitives: src/components/ui/ components use pure │
│    @base-ui/react APIs (render prop, Positioner + Popup, Backdrop + Popup).     │
│ 2. Semantic Anchor Link Reformation: All ~107 instances of Button asChild are   │
│    refactored to semantic <Link className={buttonVariants(...)}> or native      │
│    render props, completely resolving the role="button" link collision.        │
│ 3. Native Base UI State Selectors: All CSS and tests move from Radix data-state │
│    to native Base UI attributes: data-open, data-closed, data-checked,          │
│    data-active, data-side.                                                      │
│ 4. Native Table Composite Navigation: The leaked @radix-ui/react-roving-focus   │
│    in AeOperatorDataTable is eliminated in favor of an unstyled, pure roving     │
│    tabindex primitive in src/components/ui/roving-focus.tsx.                    │
│ 5. W3C Accessibility Contract Parity: Tests asserting [data-radix-focus-guard]  │
│    are upgraded to assert true W3C ARIA standards: aria-modal, focus trapping   │
│    cycles, and aria-checked.                                                    │
│ 6. Complete Dependency Eradication: radix-ui, @radix-ui/react-roving-focus, and │
│    @radix-ui/react-presence are uninstalled, verified by zero-count scans.      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. The 4-Tier Zero-Handroll Engineering Directive

Every component refactor must strictly adhere to the 4-tier delegation strategy:

1. **Tier 1: Hosted Vendor Surfaces (Zero Custom Code)**
   - Clerk: `<UserButton />`, `<OrganizationSwitcher />`, `<SignIn />`, `<SignUp />`.
   - Never replace or alter Clerk vendor surfaces during the primitive migration.
2. **Tier 2: Official shadcn Base UI Primitives (`@base-ui/react` v1.8+)**
   - Use official shadcn Base UI implementations (`registry/bases/base/ui/*`) for all 22 components:
     - `Dialog` (`Dialog.Root`, `Dialog.Backdrop`, `Dialog.Popup`, `Dialog.Close`)
     - `Drawer` (`Drawer.Root`, `Drawer.Backdrop`, `Drawer.Popup`) for `Sheet`
     - `Menu` (`Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`, `Menu.Popup`, `Menu.Item`, `Menu.RadioGroup`)
     - `Select` (`Select.Root`, `Select.Trigger`, `Select.Value`, `Select.Portal`, `Select.Positioner`, `Select.Popup`, `Select.Item`)
     - `Tooltip` (`Tooltip.Root`, `Tooltip.Trigger`, `Tooltip.Portal`, `Tooltip.Positioner`, `Tooltip.Popup`)
     - `Tabs` (`Tabs.Root`, `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`)
     - `Accordion` & `Collapsible` (`Accordion.Root`, `Accordion.Item`, `Accordion.Panel`, `Collapsible.Root`, `Collapsible.Panel`)
     - `Checkbox` & `RadioGroup` (`Checkbox.Root`, `Checkbox.Indicator`, `RadioGroup.Root`, `Radio.Root`, `Radio.Indicator`)
     - `Progress` (`Progress.Root`, `Progress.Track`, `Progress.Indicator`)
     - `Separator` (`Separator.Root`)
     - `Avatar` (`Avatar.Root`, `Avatar.Image`, `Avatar.Fallback`)
3. **Tier 3: Sourced Architectural Blueprints**
   - Official shadcn Base UI reference (`skills/shadcn/rules/base-vs-radix.md`).
   - Emil Kowalski tactile physics (`:active:scale-[0.98] transition-transform duration-100 ease-out`).
   - Floating UI alignment and collision engine.
4. **Tier 4: Proprietary Core Code (AE-Owned)**
   - Custom code is strictly quarantined to AE domain routing: two-tier chrome bridge (`OperatorChromeProvider`), role-based navigation resolution (`staticData.nav`), and financial observability integration.

---

## 4. The 5 Inviolable Migration Rules

### Rule 1: The Zero-Shim Standard
- Never introduce compatibility shims, `renderOrSlot` helpers, or conditional branches supporting both `asChild` and `render`.
- When migrating a component, migrate both the primitive file in `src/components/ui/` and all its direct call sites in the same atomic wave.

### Rule 2: Semantic Link Navigation Standard
- For navigation links that look like buttons:
  ```tsx
  // Standard (Preferred for TanStack Router links)
  <Link to="/market" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
    Browse Tools
  </Link>

  // Or using Base UI Button render prop with nativeButton={false}
  <Button render={<Link to="/market" />} nativeButton={false} variant="outline" size="sm">
    Browse Tools
  </Button>
  ```
- Never use `<Button asChild>` anywhere in the codebase.

### Rule 3: Native Base UI Attribute Standard
- All animation and styling selectors must use Base UI native data attributes:
  - `data-open` and `data-closed` (for dialogs, sheets, menus, tooltips, popovers).
  - `data-active` (for tabs).
  - `data-checked` and `data-indeterminate` (for checkboxes and radios).
  - `data-side="top|bottom|left|right"` (for positioned popups).
- Replace all `data-[state=...]` selectors in consumer CSS.

### Rule 4: Emil Kowalski Tactile Physics Standard
- Every interactive control across all Base UI primitives must retain physical micro-compression:
  ```css
  :active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100
  ```

### Rule 5: Complete Package Clean-Sheet
- Upon completion of Wave 7, `radix-ui`, `@radix-ui/react-roving-focus`, and `@radix-ui/react-presence` must be completely removed from `package.json`. A repository-wide grep for `radix` must return 0 occurrences in `src/`.

---

## 5. The 4-Phase Subagent Execution Loop

Every wave in [`docs/operations/base-ui-migration-register.md`](./docs/operations/base-ui-migration-register.md) executes through this 4-phase cycle:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   THE 4-PHASE BASE UI PROTOCOL                         │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Scout & Baseline Analysis (Grok Subagent)                    │
│    └─ Audit incumbent Radix primitive and exact consumer call sites    │
│    └─ Fetch official shadcn Base UI template from registry             │
│    └─ Produce exact Before/After refactor diff & call-site list        │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 2: Red Test Construction (Contract & Test Engineer)             │
│    └─ Write component contract tests asserting Base UI event/focus APIs│
│    └─ Verify failing state under current implementation                │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 3: Bounded Craft Implementation (Composer Subagent)             │
│    └─ Implement new Base UI component in src/components/ui/            │
│    └─ Refactor all consumer call sites (zero asChild, zero shims)      │
│    └─ Apply semantic tokens and Kowalski tactile physics               │
│    └─ Preserve exactOptionalPropertyTypes: true & strict TS types      │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 4: Cold Review & Verification Gate (Orchestrator)               │
│    └─ Quality gate: oxlint --deny-warnings                             │
│    └─ Dependency gate: npm run deps:check (ratchet limits honored)     │
│    └─ Compiler gate: NODE_VERSION=22 npm run typecheck (0 errors)      │
│    └─ Test suite: Vitest UI contract suite + Playwright E2E            │
│    └─ Mark line item as VERIFIED in base-ui-migration-register.md      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Verification Gates & Release Criteria

A wave cannot be marked complete without clearing all five automated verification gates:

1. **TypeScript Compiler Gate:**
   ```sh
   NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx tsc --noEmit
   # Exit code 0, 0 type errors
   ```
2. **Linting Gate:**
   ```sh
   npx oxlint --deny-warnings
   # Exit code 0, 0 warnings, 0 errors
   ```
3. **Dependency Cruiser Architecture & Ratchet:**
   ```sh
   NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run deps:check
   # 0 circular dependencies, ratchet limits honored
   ```
4. **UI Contract & Component Suite:**
   ```sh
   npx vitest run tests/unit/layout/ tests/ui-contract/ tests/unit/command-panel/ tests/unit/components/
   # All tests passing
   ```
5. **Playwright E2E Shell Persistence & A11y Suite:**
   ```sh
   npx playwright test tests/e2e/shell-persistence.spec.ts tests/e2e/a11y/
   # All tests passing across viewports
   ```
