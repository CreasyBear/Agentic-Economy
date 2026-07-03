# Operator surfaces — owner, admin, builder

Operator routes use `DESIGN.md` Astryx Era conventions, not the retired public visual identity. Shells are product/work surfaces: structured, dense enough for review, and consequence-aware without becoming dark command centers.

# Persona and composition

Primary persona: **operator** (UI Craft dashboard/work-surface lens).

- Sidebar = persistent resource index using Astryx `AppShell` + `SideNav`.
- Topbar = breadcrumbs + sidebar trigger.
- Section rail = settings-shaped sub-nav for billing and monetization only.
- Content = readback-first panels, queues, tables, settings, receipts, and reconstruction views composed from Astryx cards, tables, badges, status dots, toolbar/filter primitives, and detail-page/settings templates.

Density knob: **5** (owner/admin). Craft: **7**.

# Shell anatomy

```text
┌──────────┬────────────────────────────────────────────┐
│ SideNav  │ topbar: trigger · breadcrumbs              │
│ 240px    ├──────────┬─────────────────────────────────┤
│ grouped  │ section  │ page header (title + description)│
│ nav      │ rail     │ work region (cards, queue, table)│
│          │ (billing │                                 │
│          │  only)   │                                 │
└──────────┴──────────┴─────────────────────────────────┘
```

Reference pattern: grouped sidebar, sticky topbar, breadcrumbs on detail routes. Adapted to AE through Astryx primitives, theme-neutral typography/color, and product-specific copy. No custom dashboard chrome or component-library fork.

# Navigation groups

## Owner

| Group | Items |
| --- | --- |
| Work | Status, Inquiries, Contact follow-ups, Business actions |
| Account | Billing |

## Admin

| Group | Items |
| --- | --- |
| Review | Claims, Audit events, Index health |
| Operations | Business actions, Protected actions, Inquiries |
| Monetization | Billing reconstruction |

## Builder

| Group | Items |
| --- | --- |
| Builder | Discovery |

# Section rails

Auto-mounted when path prefix matches:

| Prefix | Section rail |
| --- | --- |
| `/owner/billing` | Overview, Activate |
| `/admin/monetization` | Reconstruction |

Child routes (receipts, operations) keep section rail and add breadcrumbs.

# Components

| Piece | Astryx-era contract |
| --- | --- |
| Shell | `AppShell` + `SideNav` pattern with AE route/navigation data |
| Sidebar | Astryx navigation primitives; role-aware visibility |
| Section nav | Settings/detail-page sub-navigation |
| Breadcrumbs | Astryx/text-link pattern with TanStack Router links |
| Nav config | `src/lib/operator/navigation.ts` remains the IA source |
| Work primitives | Compose Astryx `Card`, `Table`, `Toolbar`, `Badge`, `StatusDot`, `Banner`, `EmptyState`, `Skeleton`, and form primitives around AE data/readback logic |

# Token rules

- Use Astryx theme-neutral surfaces, text roles, borders, focus, and status primitives.
- Tailwind utilities are allowed for layout, spacing, responsive behavior, and sticky positioning only.
- Active nav uses the Astryx selected/active treatment; do not create route-local color systems.
- Use Astryx radius/elevation defaults unless a swizzled Astryx component owns the exception.
- No glassmorphism, dark terminal panels, decorative glow, or custom style files for operator chrome.

# Copy rules

- Sentence case headings.
- Readback-honest descriptions; no fake “Active Pro” unless source-owned.
- Payment or activation trust copy appears only at real action moments (activate redirect, receipt links, reconstruction readbacks).
- Public marketing vocabulary does not leak into operator recovery/reconstruction screens.

# Next additions (not in this pass)

- Astryx `Table`/`Toolbar` patterns for admin queues.
- Progress meters for usage billing only when backed by source-owned usage.
- Switch/accordion for notification settings when settings routes land.

# IA and personas (2026-06-30)

## Navigation tiers

| Tier | Owner sidebar (prod) | Admin sidebar (prod) |
| --- | --- | --- |
| Core | Status, Inquiries | Claims, Inquiries |
| Advanced | Contact follow-ups, Business actions, Billing | Audit, Index health, Business actions, Protected actions, Monetization |

Advanced items show in **dev** or when `VITE_AE_OPERATOR_ADVANCED_NAV=true`. The **⌘K command palette always lists all destinations** so power operators can jump without sidebar clutter.

## Persona fit

| Persona | Primary surfaces | Design choice |
| --- | --- | --- |
| Priya (first-time owner) | Status, claim success | Plain titles, copy public URL, core nav only |
| Jordan (power operator) | Admin queues, monetization | ⌘K palette, breadcrumbs, future table patterns |
| Margo (mobile owner) | Inquiries, status | Collapsible sidebar, 44px targets, section rail stacks |
| Kwame (screen reader) | All operator | Landmarks, skip link, labelled command dialog |

## Command palette

- Trigger: **⌘K** / **Ctrl+K** or "Jump to…" in topbar.
- Includes operator routes for current role + public Ask/Browse.
- Uses Astryx dialog/command primitives wrapped around AE route data.
