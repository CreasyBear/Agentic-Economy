# Zero-Legacy Base UI & Modern shadcn Cutover: Migration Register

**Date:** 19 September 2026  
**Status:** APPROVED FOR STEP-BY-STEP EXECUTION (Zero-Shim Mandate)  
**Operating Protocol:** `docs/operations/base-ui-migration-protocol.md`  
**Upstream Standard:** shadcn/ui Base UI Default (`@base-ui/react` v1.8+)  
**Subagent Execution Model:** Grok (Scout) $\rightarrow$ Composer (Craft) $\rightarrow$ Orchestrator (Verify)

---

## 1. Progress & Census Scorecard

*Full Maturity Refactor: Zero Shims, Zero Legacy Radix Primitives*

| Wave | Scope | Workflows | Verified | In Review | Pending | Target Status |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Wave 1: Package Setup & Clean-Sheet Substrate** | `@base-ui/react` installation & config | `B-01` | 1 | 0 | 0 | `COMPLETED` |
| **Wave 2: Atomic Primitives & Auxiliaries** | Button, Badge, Separator, Label, Avatar, Progress, Item, Marker, Bubble | `B-02` – `B-08` | 7 | 0 | 0 | `COMPLETED` |
| **Wave 3: Selection, Forms & Disclosures** | Checkbox, RadioGroup, Collapsible, Accordion, Tabs | `B-09` – `B-13` | 5 | 0 | 0 | `COMPLETED` |
| **Wave 4: Overlay & Modal Surfaces** | Dialog, Sheet/Drawer, AlertDialog | `B-14` – `B-16` | 3 | 0 | 0 | `COMPLETED` |
| **Wave 5: Floating Menus, Selects & Tooltips** | Tooltip, DropdownMenu, Select, Sidebar Triggers | `B-17` – `B-20` | 4 | 0 | 0 | `COMPLETED` |
| **Wave 6: Link Navigation Clean-Sheet** | Eradicate all `Button asChild` sites across routes and components | `B-21` – `B-24` | 4 | 0 | 0 | `COMPLETED` |
| **Wave 7: Table Focus, A11y Tests & Radix Removal** | Table roving focus, W3C ARIA tests, package uninstallation | `B-25` – `B-27` | 3 | 0 | 0 | `COMPLETED` |
| **Total** | **All 27 Refactor Workflows** | **27** | **27** | **0** | **0** | `COMPLETED` |

---

## 2. Master Footprint Census

### Category A: The 22 UI Primitives in `src/components/ui/*`
1. `src/components/ui/button.tsx` (Radix `Slot`)
2. `src/components/ui/badge.tsx` (Radix `Slot`)
3. `src/components/ui/separator.tsx` (Radix `Separator`)
4. `src/components/ui/label.tsx` (Radix `Label`)
5. `src/components/ui/breadcrumb.tsx` (Radix `Slot`)
6. `src/components/ui/progress.tsx` (Radix `Progress`)
7. `src/components/ui/avatar.tsx` (Radix `Avatar`)
8. `src/components/ui/item.tsx` (Radix `Slot`)
9. `src/components/ui/marker.tsx` (Radix `Slot`)
10. `src/components/ui/bubble.tsx` (Radix `Slot`)
11. `src/components/ui/checkbox.tsx` (Radix `Checkbox`)
12. `src/components/ui/radio-group.tsx` (Radix `RadioGroup`)
13. `src/components/ui/collapsible.tsx` (Radix `Collapsible`)
14. `src/components/ui/accordion.tsx` (Radix `Accordion`)
15. `src/components/ui/tabs.tsx` (Radix `Tabs`)
16. `src/components/ui/dialog.tsx` (Radix `Dialog`)
17. `src/components/ui/sheet.tsx` (Radix `Dialog` as `SheetPrimitive`)
18. `src/components/ui/alert-dialog.tsx` (Radix `AlertDialog`)
19. `src/components/ui/tooltip.tsx` (Radix `Tooltip`)
20. `src/components/ui/dropdown-menu.tsx` (Radix `DropdownMenu`)
21. `src/components/ui/select.tsx` (Radix `Select`)
22. `src/components/ui/sidebar.tsx` (Radix `Slot` + `Dialog` + `Tooltip`)

### Category B: The Direct Leaked Radix Package
- `src/components/ae/operator/AeOperatorDataTable.tsx:16` (`import * as RovingFocusGroup from '@radix-ui/react-roving-focus'`)

### Category C: The ~140 `asChild` Consumer Call Sites
- **`Button asChild`:** ~107 sites across 52 AE component files and 16 routes in `src/routes/`.
- **`AeSiteButton asChild`:** 12 sites in marketing/website pages (already custom `cloneElement`, completely independent of Radix).
- **Trigger / Close wrappers:** ~21 sites:
  - `CollapsibleTrigger asChild` (6 sites: `AeAgentOperatorConsole` lines 306, 430; `AeAgentAccessAuthorizeForm` line 497; `SupplySourceTypeSection` line 154; `DirectoryExplorerFilters` line 131; `AeAdminReadbackPanel` line 165).
  - `SheetTrigger asChild` (4 sites: `AeAppShell` line 174; `DirectoryExplorerFilters` line 162; `DirectoryFilters` line 17; `ChatHeader` line 42).
  - `SidebarMenuButton asChild` (3 sites: `AeOperatorSidebar` lines 210, 255, 294).
  - `DialogTrigger asChild` (2 sites: `AeCommandPanel` line 61; `AeAgentJsonAffordance` line 67).
  - `TooltipTrigger asChild` (2 sites: `AeOperatorBreadcrumbs` line 82; `AeNetworkHealthIndicator` line 48).
  - `SidebarGroupLabel asChild` (2 sites: `AeOperatorSidebar` lines 235, 284).
  - `Item asChild` (3 sites: `ToolCard` lines 58, 144; `AeCapabilityTile` line 31).
  - `DialogClose asChild` (1 site: `AeCommandPanel` line 102).
  - `SheetClose asChild` (1 site: `DirectoryExplorerFilters` line 162).
  - `BreadcrumbLink asChild` (1 site: `AeOperatorBreadcrumbs` line 108).
  - `DropdownMenuTrigger asChild` (1 site: `AeOperatorBreadcrumbs` line 165).
  - `DropdownMenuItem asChild` (1 site: `AeOperatorBreadcrumbs` line 176).

---

# Wave 1: Package Setup & Clean-Sheet Substrate

### B-01: Install `@base-ui/react` & Configure Build Pipeline
- **Surfaces:** `package.json`, `package-lock.json`
- **Incumbent Baseline:** Repository lists `radix-ui: "^1.6.7"` and `@radix-ui/react-*` sub-packages.
- **Target Specification:**
  - Run `npm install @base-ui/react@1.8.0`.
  - Verify clean TypeScript integration under `exactOptionalPropertyTypes: true` and Node 22 local runtime.
  - Verify `package.json` reflects `@base-ui/react: "^1.8.0"`.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED` (Installed `@base-ui/react@1.8.0`, passed tsc, oxlint, deps:check)

### B-02: Base UI Button Primitive (`button.tsx`)
- **Surfaces:** `src/components/ui/button.tsx`, `src/components/ui/button-variants.ts`
- **Incumbent Baseline:** Imports `Slot` from `radix-ui` and conditionally renders `asChild ? Slot.Root : 'button'`.
- **Target Specification:**
  - Completely remove `radix-ui` and `Slot`.
  - Refactor to official shadcn Base UI Button:
    ```tsx
    import { Button as ButtonPrimitive } from '@base-ui/react/button'
    import { cva, type VariantProps } from 'class-variance-authority'
    import { cn } from '@/lib/utils'
    import { buttonVariants } from './button-variants'

    export function Button({
      className,
      variant = 'default',
      size = 'default',
      render,
      nativeButton = true,
      ...props
    }: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
      return (
        <ButtonPrimitive
          render={render}
          nativeButton={nativeButton}
          className={cn(buttonVariants({ variant, size }), className)}
          {...props}
        />
      )
    }
    ```
  - Zero `asChild` prop; polymorphic customization strictly uses the `render` prop.
  - Retain all CVA variants (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`) and sizes with Kowalski tactile physics (`active:scale-[0.98]`).
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-03: Pure Base UI Badge Primitive (`badge.tsx`)
- **Surfaces:** `src/components/ui/badge.tsx`
- **Incumbent Baseline:** Imports `Slot` from `radix-ui` to allow `<Badge asChild>`.
- **Target Specification:**
  - Remove `radix-ui` import.
  - Implement Base UI `useRender` or plain polymorphic `render` prop on `Badge`:
    ```tsx
    export function Badge({ className, variant, render, children, ...props }: BadgeProps) {
      if (render) return cloneElement(render, { className: cn(badgeVariants({ variant }), className), ...props }, children)
      return <span className={cn(badgeVariants({ variant }), className)} {...props}>{children}</span>
    }
    ```
  - Retain all design system semantic color tokens.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-04: Base UI Separator Primitive (`separator.tsx`)
- **Surfaces:** `src/components/ui/separator.tsx`
- **Incumbent Baseline:** Imports `Separator as SeparatorPrimitive` from `radix-ui`.
- **Target Specification:**
  - Refactor to `@base-ui/react/separator`:
    ```tsx
    import { Separator as SeparatorPrimitive } from '@base-ui/react/separator'
    export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorPrimitive.Props) {
      return (
        <SeparatorPrimitive
          orientation={orientation}
          className={cn(
            'shrink-0 bg-border',
            orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
            className
          )}
          {...props}
        />
      )
    }
    ```
  - Zero Radix dependencies.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-05: Base UI Label Primitive (`label.tsx`)
- **Surfaces:** `src/components/ui/label.tsx`
- **Incumbent Baseline:** Imports `Label as LabelPrimitive` from `radix-ui`.
- **Target Specification:**
  - Refactor to `@base-ui/react/field` (`Field.Label`) or `@base-ui/react/label`.
  - Retain `text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70`.
  - Zero Radix dependencies.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-06: Base UI Avatar Primitive (`avatar.tsx`)
- **Surfaces:** `src/components/ui/avatar.tsx`
- **Incumbent Baseline:** Imports `Avatar as AvatarPrimitive` from `radix-ui`.
- **Target Specification:**
  - Refactor to `@base-ui/react/avatar`:
    ```tsx
    import { Avatar as AvatarPrimitive } from '@base-ui/react/avatar'
    // Root, Image, Fallback
    ```
  - Retain `AvatarBadge`, `AvatarGroup`, and `AvatarGroupCount` with design token radii.
  - Zero Radix dependencies.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-07: Base UI Progress Primitive (`progress.tsx`)
- **Surfaces:** `src/components/ui/progress.tsx`
- **Incumbent Baseline:** Imports `Progress as ProgressPrimitive` from `radix-ui`.
- **Target Specification:**
  - Refactor to `@base-ui/react/progress`:
    ```tsx
    import { Progress as ProgressPrimitive } from '@base-ui/react/progress'
    export function Progress({ className, value, ...props }: ProgressPrimitive.Root.Props) {
      return (
        <ProgressPrimitive.Root className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)} {...props}>
          <ProgressPrimitive.Track className="h-full w-full">
            <ProgressPrimitive.Indicator
              className="h-full w-full flex-1 bg-primary transition-all duration-base ease-emphasized"
              style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
            />
          </ProgressPrimitive.Track>
        </ProgressPrimitive.Root>
      )
    }
    ```
  - Zero Radix dependencies.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-08: Auxiliary Primitives Slot Eradication (`item.tsx`, `marker.tsx`, `bubble.tsx`, `breadcrumb.tsx`)
- **Surfaces:** `src/components/ui/item.tsx`, `src/components/ui/marker.tsx`, `src/components/ui/bubble.tsx`, `src/components/ui/breadcrumb.tsx`
- **Incumbent Baseline:** All 4 files import `Slot` from `radix-ui` solely to support `asChild`.
- **Target Specification:**
  - Completely excise `Slot` from all 4 files.
  - Implement standard Base UI `render` prop on `BreadcrumbLink`, `Item`, `Marker`, and `BubbleContent`.
  - Refactor call site in `AeOperatorBreadcrumbs.tsx:108` from `<BreadcrumbLink asChild>` to `<BreadcrumbLink render={<Link to={item.href} />}>`.
  - Refactor call sites in `ToolCard.tsx` (lines 58, 144) and `AeCapabilityTile.tsx` (line 31) from `<Item asChild>` to `render`.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

# Wave 3: Selection, Forms & Disclosure Primitives & Call Sites

### B-09: Base UI Checkbox Primitive & Selector Cleanup (`checkbox.tsx`)
- **Surfaces:** `src/components/ui/checkbox.tsx`, `src/components/ae/supply/AePayoutPolicyForm.tsx`
- **Incumbent Baseline:** Imports `Checkbox as CheckboxPrimitive` from `radix-ui`. Consumer CSS checks `has-[[data-state=checked]]`.
- **Target Specification:**
  - Refactor `src/components/ui/checkbox.tsx` to `@base-ui/react/checkbox`:
    ```tsx
    import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
    // Root + Indicator, native data-checked attribute
    ```
  - Update consumer CSS in `AePayoutPolicyForm.tsx:75` from `has-[[data-state=checked]]` to `has-[[data-checked]]`.
  - Retain Kowalski `:active:scale-[0.98]` tactile press physics and high-visibility focus ring.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-10: Base UI Radio Group Primitive & Card Selectors (`radio-group.tsx`)
- **Surfaces:** `src/components/ui/radio-group.tsx`, `src/components/ae/console/AeConnectAgentWizardDialog.tsx`, `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- **Incumbent Baseline:** Imports `RadioGroup as RadioGroupPrimitive` from `radix-ui`. Consumer cards select on `has-[[data-state=checked]]`.
- **Target Specification:**
  - Refactor to `@base-ui/react/radio-group` + `@base-ui/react/radio`:
    ```tsx
    import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
    import { Radio as RadioPrimitive } from '@base-ui/react/radio'
    ```
  - Update card selectors in `AeConnectAgentWizardDialog.tsx` (lines 252, 255, 322, 334) and `AeAgentAccessAuthorizeForm.tsx` (lines 349, 353, 374, 378, 410, 430, 434) from `has-[[data-state=checked]]` to `has-[[data-checked]]`.
  - Retain tactile physics and ring focus tokens.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-11: Base UI Collapsible Primitive & All 6 Call Sites (`collapsible.tsx`)
- **Surfaces:** `src/components/ui/collapsible.tsx`, `AeAgentOperatorConsole.tsx`, `AeAgentAccessAuthorizeForm.tsx`, `SupplySourceTypeSection.tsx`, `DirectoryExplorerFilters.tsx`, `AeAdminReadbackPanel.tsx`
- **Incumbent Baseline:** Imports `Collapsible as CollapsiblePrimitive` from `radix-ui`. 6 consumer call sites use `<CollapsibleTrigger asChild>`.
- **Target Specification:**
  - Refactor primitive to `@base-ui/react/collapsible`:
    - `Collapsible.Root`
    - `Collapsible.Trigger` (using `render` prop, zero `asChild`)
    - `Collapsible.Panel` (exported as `CollapsibleContent`)
  - Refactor all 6 consumer call sites:
    - `AeAgentOperatorConsole.tsx` (lines 306, 430): `<CollapsibleTrigger render={<Button ... />} />`
    - `AeAgentAccessAuthorizeForm.tsx` (line 497): `render={<Button ... />}`
    - `SupplySourceTypeSection.tsx` (line 154): `render={<Button ... />}`
    - `DirectoryExplorerFilters.tsx` (line 131): `render={<Button ... />}`
    - `AeAdminReadbackPanel.tsx` (line 165): `render={<Button ... />}`
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-12: Base UI Accordion Primitive & Consumer Selectors (`accordion.tsx`)
- **Surfaces:** `src/components/ui/accordion.tsx`, `src/components/ae/website/AeSiteFaq.tsx`, `src/routes/terms.tsx`
- **Incumbent Baseline:** Imports `Accordion as AccordionPrimitive` from `radix-ui`. Consumer CSS in `AeSiteFaq.tsx:28` and `terms.tsx:114` checks `[&[data-state=open]>svg]`.
- **Target Specification:**
  - Refactor to `@base-ui/react/accordion`:
    - `Accordion.Root`, `Accordion.Item`, `Accordion.Header`, `Accordion.Trigger`, `Accordion.Panel`.
  - Update trigger and panel styling to Base UI native `data-open` and `data-closed`.
  - Update `AeSiteFaq.tsx` and `terms.tsx` from `[&[data-state=open]>svg]` to `[&[data-open]>svg]`.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-13: Base UI Tabs Primitive & Consumer Call Sites (`tabs.tsx`)
- **Surfaces:** `src/components/ui/tabs.tsx`, all consumer tab views across market and console
- **Incumbent Baseline:** Imports `Tabs as TabsPrimitive` from `radix-ui`. Relies on `data-[state=active]`.
- **Target Specification:**
  - Refactor to `@base-ui/react/tabs`:
    - `Tabs.Root`, `Tabs.List`, `Tabs.Tab` (exported as `TabsTrigger`), `Tabs.Panel` (exported as `TabsContent`).
  - Style active tabs with Base UI native `data-active` selector.
  - Zero Radix dependencies.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

# Wave 4: Overlay & Modal Surfaces & Their Triggers

### B-14: Base UI Dialog Primitive & Call Sites (`dialog.tsx`)
- **Surfaces:** `src/components/ui/dialog.tsx`, `AeCommandPanel.tsx`, `AeAgentJsonAffordance.tsx`
- **Incumbent Baseline:** Imports `Dialog as DialogPrimitive` from `radix-ui`. Uses `<DialogTrigger asChild>` and `<DialogClose asChild>`.
- **Target Specification:**
  - Refactor `src/components/ui/dialog.tsx` to `@base-ui/react/dialog`:
    ```tsx
    import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
    // DialogPrimitive.Root, DialogPrimitive.Trigger (with render prop)
    // DialogPrimitive.Portal, DialogPrimitive.Backdrop, DialogPrimitive.Popup
    // DialogPrimitive.Close (with render prop)
    ```
  - Animate using native Base UI `data-open` / `data-closed` attributes with `--duration-base` and `--ease-emphasized`.
  - Refactor call sites:
    - `AeCommandPanel.tsx:61`: `<DialogTrigger render={<Button ... />} />`
    - `AeCommandPanel.tsx:102`: `<DialogClose render={<Button ... />} />`
    - `AeAgentJsonAffordance.tsx:67`: `<DialogTrigger render={<Button ... />} />`
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-15: Base UI Sheet / Drawer Primitive & Call Sites (`sheet.tsx`)
- **Surfaces:** `src/components/ui/sheet.tsx`, `AeAppShell.tsx`, `DirectoryExplorerFilters.tsx`, `DirectoryFilters.tsx`, `ChatHeader.tsx`
- **Incumbent Baseline:** Re-wraps Radix `Dialog` as a sheet with `side` variants. 4 consumer call sites use `<SheetTrigger asChild>`.
- **Target Specification:**
  - Refactor `src/components/ui/sheet.tsx` to `@base-ui/react/drawer` or `@base-ui/react/dialog` full-bleed popup with directional slide transitions.
  - Refactor call sites:
    - `AeAppShell.tsx:174`: `<SheetTrigger render={<AeSiteIconButton ... />} />`
    - `DirectoryExplorerFilters.tsx:162`: `<SheetTrigger render={<Button ... />} />` & `<SheetClose render={<Button ... />} />`
    - `DirectoryFilters.tsx:17`: `render={<Button ... />}`
    - `ChatHeader.tsx:42`: `render={<Button ... />}`
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-16: Base UI Alert Dialog Primitive (`alert-dialog.tsx`)
- **Surfaces:** `src/components/ui/alert-dialog.tsx`, `src/components/ae/settings/WorkspaceDangerZone.tsx`
- **Incumbent Baseline:** Imports `AlertDialog as AlertDialogPrimitive` from `radix-ui`.
- **Target Specification:**
  - Refactor to `@base-ui/react/alert-dialog`:
    - `AlertDialog.Root`, `AlertDialog.Backdrop`, `AlertDialog.Popup`, `AlertDialog.Close`.
  - Re-export `AlertDialogAction` and `AlertDialogCancel` using `render` prop for button styling.
  - Retain destructive styling and strict keyboard focus trapping.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

# Wave 5: Floating Menus, Selects & Tooltips

### B-17: Base UI Tooltip Primitive & Call Sites (`tooltip.tsx`)
- **Surfaces:** `src/components/ui/tooltip.tsx`, `AeOperatorBreadcrumbs.tsx`, `AeNetworkHealthIndicator.tsx`, `sidebar.tsx`
- **Incumbent Baseline:** Imports `Tooltip as TooltipPrimitive` from `radix-ui`. Uses `<TooltipTrigger asChild>`.
- **Target Specification:**
  - Refactor to `@base-ui/react/tooltip`:
    - `Tooltip.Root`, `Tooltip.Trigger` (with `render` prop), `Tooltip.Portal`, `Tooltip.Positioner`, `Tooltip.Popup`, `Tooltip.Arrow`.
  - Positioner receives `sideOffset`, alignment, and collision detection.
  - Refactor call sites:
    - `AeOperatorBreadcrumbs.tsx:82`: `<TooltipTrigger render={<span ... />} />`
    - `AeNetworkHealthIndicator.tsx:48`: `<TooltipTrigger render={<button ... />} />`
    - `sidebar.tsx:542`: `<TooltipTrigger render={button} />`
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-18: Base UI Dropdown Menu Primitive & Call Sites (`dropdown-menu.tsx`)
- **Surfaces:** `src/components/ui/dropdown-menu.tsx`, `ThemeToggle.tsx`, `AeOperatorBreadcrumbs.tsx`
- **Incumbent Baseline:** Imports `DropdownMenu as DropdownMenuPrimitive` from `radix-ui`. Uses `<DropdownMenuTrigger asChild>`.
- **Target Specification:**
  - Refactor to `@base-ui/react/menu`:
    - `Menu.Root`, `Menu.Trigger` (with `render` prop), `Menu.Portal`, `Menu.Positioner`, `Menu.Popup`, `Menu.Item`, `Menu.RadioGroup`, `Menu.RadioItem`.
  - Refactor call sites:
    - `AeOperatorBreadcrumbs.tsx:165`: `<DropdownMenuTrigger render={<button ... />} />`
    - `AeOperatorBreadcrumbs.tsx:176`: `<DropdownMenuItem render={<Link ... />} />`
    - `ThemeToggle.tsx`: clean menu trigger using `render={<button ... />}` or direct button.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-19: Base UI Select Primitive (`select.tsx`)
- **Surfaces:** `src/components/ui/select.tsx`
- **Incumbent Baseline:** Imports `Select as SelectPrimitive` from `radix-ui`.
- **Target Specification:**
  - Refactor to `@base-ui/react/select`:
    - `Select.Root`, `Select.Trigger`, `Select.Value`, `Select.Portal`, `Select.Positioner`, `Select.Popup`, `Select.Item`.
  - Retain existing shadcn component API (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`).
  - Forward `sideOffset` to `Positioner`.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-20: Modernized Sidebar Chrome (`sidebar.tsx`)
- **Surfaces:** `src/components/ui/sidebar.tsx`, `AeOperatorSidebar.tsx`
- **Incumbent Baseline:** Uses Radix `Slot` for menu buttons and group actions. `AeOperatorSidebar.tsx` has 5 `asChild` sites.
- **Target Specification:**
  - Refactor `SidebarMenuButton` and `SidebarGroupLabel` in `sidebar.tsx` to use Base UI `render` prop.
  - Refactor call sites in `AeOperatorSidebar.tsx`:
    - Lines 210, 255, 294: `<SidebarMenuButton render={<Link to={...} />} />`
    - Lines 235, 284: `<SidebarGroupLabel render={<span />} />`
  - Wire to Base UI Tooltip and Drawer primitives.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

# Wave 6: Link Navigation Eradication of `Button asChild` (~107 Call Sites)

### B-21: Eradicate `Button asChild` in Shell, Navigation & Layout Views
- **Surfaces:** `AeAppShell.tsx`, `AeRouteStates.tsx`, `ToolsSearchPage.tsx`
- **Incumbent Baseline:** `<Button asChild><Link to="...">Label</Link></Button>`.
- **Target Specification:**
  - Replace with semantic `<Link to="..." className={buttonVariants({ ... })}>`.
  - `AeAppShell.tsx` (lines 170, 197): Sign-in links.
  - `AeRouteStates.tsx` (lines 259, 307, 355, 358, 395): Error, pending, and not-found recovery buttons.
  - `ToolsSearchPage.tsx` (line 672): Secondary navigation buttons.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-22: Eradicate `Button asChild` in Market & Discovery Surfaces
- **Surfaces:** `AeX402Directory.tsx`, `DirectoryComparison.tsx`, `DirectoryHomeDiscovery.tsx`, `DirectoryIndexDiscovery.tsx`, `DirectoryProviderHeader.tsx`, `AeToolNextAction.tsx`, `AeToolCompactDecision.tsx`, `AeToolPosition.tsx`
- **Incumbent Baseline:** ~25 instances of `<Button asChild>` wrapping catalog and comparison links.
- **Target Specification:**
  - Refactor all sites to `<Link to="..." className={buttonVariants({ ... })}>`.
  - Ensure tool inspection links, pagination buttons, and compare buttons retain exact semantic tokens and active physics.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-23: Eradicate `Button asChild` in Operator Console, Supply & Settings
- **Surfaces:** `AeAgentDirectoryTable.tsx`, `AeOwnerOverview.tsx`, `AeOwnerOfferings.tsx`, `AeProviderWorkspace.tsx`, `ProviderWorkspaceToolsSection.tsx`, `AeWorkspaceGeneral.tsx`, `CallTechnicalRecord.tsx`, `CallReceiptWorkspace.tsx`, `AeFundingReturnState.tsx`
- **Incumbent Baseline:** ~35 instances of `<Button asChild>` across operator workspaces.
- **Target Specification:**
  - Refactor all sites to `<Link to="..." className={buttonVariants({ ... })}>`.
  - Ensure table actions ("Add Tool", "Offer a Tool", "Return to Tools") preserve layout footprints.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-24: Eradicate `Button asChild` in Routes Layer (`src/routes/*`)
- **Surfaces:** `__root.tsx`, `activity.tsx`, `support.tsx`, `fund.cancelled.tsx`, `owner.operations.$toolRef.tsx`, `agent-access.tsx`, `agent-access.authorize.tsx`, `tools.$toolRef.tsx`, `owner.supply.connections.oauth.callback.tsx`, `owner.supply.connections.new.tsx`, `owner.operations.new.tsx`, `developers.discovery.tsx`, `privacy.tsx`, `$slug.tsx`, `terms.tsx`, `status.tsx`
- **Incumbent Baseline:** 16 route files containing ~25 instances of `<Button asChild>`.
- **Target Specification:**
  - Refactor all route files to `<Link to="..." className={buttonVariants({ ... })}>`.
  - Zero `Button asChild` left in `src/routes/`.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

# Wave 7: Table Focus, A11y Tests & Complete Radix Package Removal

### B-25: Encapsulate Table Roving Focus (`AeOperatorDataTable.tsx`)
- **Surfaces:** `src/components/ae/operator/AeOperatorDataTable.tsx`, `src/components/ui/roving-focus.tsx`
- **Incumbent Baseline:** Imports `@radix-ui/react-roving-focus` at line 16. Uses `RovingFocusGroup.Item asChild` and `RovingFocusGroup.Root asChild`.
- **Target Specification:**
  - Create `src/components/ui/roving-focus.tsx` using Base UI's composite keyboard navigation pattern or unstyled roving tabindex hook.
  - Refactor `AeOperatorDataTable.tsx` to use `@/components/ui/roving-focus`.
  - Zero imports of `@radix-ui/react-roving-focus` in the repository.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-26: Realign A11y & Focus Contract Tests
- **Surfaces:** `tests/unit/layout/shell-a11y-focus.test.tsx`, `tests/unit/routes/agent-access-authorize.test.tsx`, `tests/unit/operator/record-table-presence.test.tsx`
- **Incumbent Baseline:** Tests assert Radix-internal DOM nodes (`[data-radix-focus-guard]` lines 134–148) and `getAttribute('data-state') === 'checked'`.
- **Target Specification:**
  - Update `shell-a11y-focus.test.tsx` to assert accessibility behavior via W3C standards:
    - Assert `aria-modal="true"` on open dialogs and sheets.
    - Assert focus trapping via active element tab cycling.
  - Update radio tests in `agent-access-authorize.test.tsx` to assert `aria-checked="true"`.
  - Verify all 166 unit and UI contract tests pass.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`

---

### B-27: Complete Radix Package Deprecation & Full Gate Verification
- **Surfaces:** `package.json`, `package-lock.json`
- **Incumbent Baseline:** `package.json` contains `radix-ui`, `@radix-ui/react-roving-focus`, and `@radix-ui/react-presence`.
- **Target Specification:**
  - Verify zero residual imports:
    ```sh
    rg "radix-ui|@radix-ui" src/ tests/
    # Count must be exactly 0
    ```
  - Run `npm uninstall radix-ui @radix-ui/react-roving-focus @radix-ui/react-presence`.
  - Execute full release gate:
    ```sh
    NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run gate
    ```
  - Mark migration 100% complete and verified.
- **Subagent Assignment:** Grok $\rightarrow$ Composer $\rightarrow$ Orchestrator
- **Status:** `VERIFIED`
