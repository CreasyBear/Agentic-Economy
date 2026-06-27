---
name: Agentic Economy
description: Source-owned civic command surface for local-service trust.
colors:
  command-ink: "#10151F"
  command-panel: "#1D2637"
  cool-field: "#F7F9FC"
  surface: "#FFFFFF"
  surface-raised: "#F1F5FA"
  text-primary: "#10151F"
  text-secondary: "#566173"
  border: "#D7DEE8"
  signal-cobalt: "#2457D6"
  signal-cobalt-deep: "#173E9F"
  success: "#157F5B"
  warning: "#B86F00"
  danger: "#C13A30"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 6vw, 5.25rem)"
    fontWeight: 650
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.25
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 550
    lineHeight: 1.4
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.8125rem"
    fontWeight: 450
    lineHeight: 1.45
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
  3xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.signal-cobalt}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.pill}"
    padding: "12px 20px"
    height: "44px"
  card-status:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "24px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
    height: "44px"
---

# Design System: Agentic Economy

## 1. Overview

**Creative North Star: "The Civic Signal Board"**

Agentic Economy should feel like a source-owned control surface for public truth: calm enough for owners under pressure, sharp enough for operators repairing failures, and distinctive enough that the public service catalog does not read like another SaaS template.

The system is bold through structure, not decoration. Public pages use commanding hierarchy, clear status architecture, and confident whitespace. Task flows use familiar product primitives, persistent labels, explicit states, and zero theatre around authority, payments, or actions that do not exist yet.

**Key Characteristics:**

- Source-owned status is always visible and textual.
- One action accent carries primary action and focus.
- Command-ink panels are reserved for high-stakes readback and admin context.
- Forms, badges, cards, alerts, empty states, and loading states come from shared components.
- Public storytelling may be cinematic; transactional UI stays fast and familiar.

## 2. Colors

The palette is cool, civic, and operational: a near-white field, command ink for authority, and signal cobalt for the single action accent.

### Primary

- **Signal Cobalt** (`#2457D6`): primary actions, selected navigation, focus affordance, and public discovery emphasis.
- **Signal Cobalt Deep** (`#173E9F`): hover/active depth for the primary action and high-contrast text links.

### Secondary

- **Command Ink** (`#10151F`): headings, command panels, high-stakes readback, and admin authority surfaces.
- **Command Panel** (`#1D2637`): elevated dark surfaces where a page needs operational gravity without becoming dark-mode theatre.

### Neutral

- **Cool Field** (`#F7F9FC`): default page background.
- **Surface** (`#FFFFFF`): cards, forms, and primary content panels.
- **Surface Raised** (`#F1F5FA`): grouped panels, skeletons, secondary blocks.
- **Text Primary** (`#10151F`): primary copy and labels.
- **Text Secondary** (`#566173`): secondary descriptions with contrast preserved.
- **Border** (`#D7DEE8`): dividers, input borders, and quiet panel boundaries.

### Semantic

- **Success** (`#157F5B`): available, indexed, publish succeeded.
- **Warning** (`#B86F00`): degraded, queued too long, repair available.
- **Danger** (`#C13A30`): suppressed, failed, unauthorized, destructive.

### Named Rules

**The One Signal Rule.** Signal Cobalt is rare. It appears on the primary action, selected state, focus, and true information emphasis only.

**The State Text Rule.** Semantic color never carries meaning alone. Every status needs a text label and an explanation or next action when state is degraded.

**The No Cosmetic Stripe Rule.** No colored side-stripes. Use full-perimeter hairlines, tinted surfaces, icons, or status text.

## 3. Typography

**Display Font:** Geist, with system sans fallback  
**Body Font:** Geist, with system sans fallback  
**Label/Mono Font:** Geist Mono for route paths, IDs, correlation IDs, and code-like metadata

**Character:** one precise sans family does the work. The interface feels engineered and trustworthy, not editorial for its own sake.

### Hierarchy

- **Display** (650, `clamp(2.75rem, 6vw, 5.25rem)`, `1.02`): homepage/public story hero only. Must fit 2-3 lines with a wide measure.
- **Headline** (650, `2rem`, `1.15`): route headings, major section headers, and status summaries.
- **Title** (600, `1.25rem`, `1.25`): card titles, form section titles, queue group headings.
- **Body** (400, `1rem`, `1.6`): owner/public explanations and form copy. Keep prose within 65-75ch.
- **Label** (550, `0.875rem`, `1.4`): form labels, table headers, status labels.
- **Mono** (450, `0.8125rem`, `1.45`): slugs, route paths, source hashes, correlation IDs. Use tabular numbers.

### Named Rules

**The Product Type Rule.** Task UI uses fixed rem scales. Fluid display type is allowed only on public storytelling surfaces.

**The Mono Restraint Rule.** Mono identifies technical references; it never becomes the main brand voice.

## 4. Elevation

Depth is structural, not decorative. Most surfaces are flat with clear spacing and tokenized borders. Elevated cards use a soft ambient shadow only when they separate a status object, command panel, or overlay from surrounding content.

### Shadow Vocabulary

- **Raised Surface** (`0 1px 2px rgba(16,21,31,0.08), 0 12px 36px rgba(16,21,31,0.08)`): status cards, public object summaries, and floating action panels.
- **Command Surface** (`0 24px 80px rgba(16,21,31,0.18)`): high-stakes readback panels, admin repair panels, and modal/dialog surfaces.
- **Focus Ring** (`0 0 0 3px rgba(36,87,214,0.30)`): keyboard focus and validation focus.

### Named Rules

**The No Ghost Card Rule.** Do not combine a decorative 1px border with a wide soft shadow. Pick structural border or purposeful elevation.

**The Raised When It Matters Rule.** Elevation means consequence, not decoration.

## 5. Components

### Buttons

- **Shape:** pill by default for primary/secondary actions (`999px`), 44px minimum height.
- **Primary:** Signal Cobalt background with white text, used once per action area.
- **Secondary:** white or transparent surface with Command Ink text and a token border.
- **Hover / Focus:** explicit color or shadow transition using token easing; focus ring is always visible.
- **Loading:** spinner plus stable label, disabled while pending, no `isLoading` magic prop.

### Cards / Containers

- **Corner Style:** 12-16px radius, never oversized.
- **Background:** Surface for content cards, Surface Raised for grouped panels, Command Ink for high-stakes readback.
- **Shadow Strategy:** Raised only for object summaries, overlays, and consequence panels.
- **Internal Padding:** 16px compact, 24px default, 32px major status object.

### Inputs / Fields

- **Style:** persistent label above control, 44px minimum height, token border, white surface.
- **Focus:** Signal Cobalt focus ring plus border shift.
- **Error:** Danger text and border with a specific fix; input value remains preserved.
- **Disabled:** muted surface and explanation where disabling affects task completion.

### Status Badges

- **Style:** Badge plus adjacent text, not badge alone.
- **States:** neutral, info, success, warning, danger.
- **Rule:** raw domain labels never appear directly in owner/public copy if they imply unavailable capabilities.

### Navigation

- **Public:** one-line desktop nav with claim, registry, and removal/correction. No future-phase links.
- **Owner:** status-first navigation. Public URL/readback before settings.
- **Admin:** separate shell with role-checked access and no leakage into public chrome.
- **Mobile:** menu or stacked nav must preserve the primary action and skip link.

### Empty, Loading, Error

- **Empty:** teaches the next action and names why nothing exists.
- **Loading:** skeletons matching final shape, not centered spinners for page content.
- **Error:** problem, consequence, recovery path. No raw implementation wording.

### Signature Component: Status Readback Card

A compact object summary showing public URL, public status, index status, discovery status, trust tier, unavailable capabilities, and next action. This is the canonical AE product object.

## 6. Do's and Don'ts

### Do:

- **Do** build screens from shared AE shells, surfaces, forms, status, and feedback components.
- **Do** use Signal Cobalt sparingly so the primary action remains obvious.
- **Do** make every degraded state explain what happened and what the user can do next.
- **Do** test every user-facing route at 375px and wide desktop.
- **Do** apply `/taste` to public storytelling and `/impeccable` hardening to every task flow.
- **Do** prefer real or generated images over fake screenshot divs when a public surface needs imagery.
- **Do** keep status text and focus visible without relying on color alone.

### Don't:

- **Don't** ship default shadcn styling without AE tokens and composition.
- **Don't** create screen-local buttons, badges, cards, alerts, empty states, loading states, form layouts, or status colors.
- **Don't** add payments, wallet, marketplace, hosted agents, request market, MCP, OpenAPI, or callable UI before phase gates.
- **Don't** use AI-purple gradients, hero metrics, fake dashboard previews, decorative glassmorphism, or repeated three-card grids.
- **Don't** call anything verified unless the trust tier is `registry_verified`.
- **Don't** use raw hex or arbitrary Tailwind colors in route components.
- **Don't** use `transition-all`, route-local scroll listeners, decorative status dots, colored side-stripes, or oversized product-card radii.
