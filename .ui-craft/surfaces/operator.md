# Operator surfaces — owner, admin, builder

Command-composition layout for billing, settings-shaped account flows, and admin reconstruction. Public Daylight Register rules do not apply here; operator shells use `.ae-operator-shell.dark` only.

# Persona and composition

Primary persona: **operator** (ui-craft recipe-dashboard Command layout).

- Sidebar = persistent resource index (Polaris translation from DESIGN.md §5).
- Topbar = breadcrumbs + sidebar trigger (project-dashboard pattern, AE tokens).
- Section rail = settings-shaped sub-nav for billing and monetization only.
- Content = readback-first panels (`AeOperatorFactGrid`, `AeOperatorQueueList`, `AeAdminReadbackPanel`, billing panels).

Density knob: **5** (owner/admin). Craft: **7**.

# Shell anatomy

```
┌──────────┬────────────────────────────────────────────┐
│ sidebar  │ topbar: trigger · breadcrumbs              │
│ 240px    ├──────────┬─────────────────────────────────┤
│ grouped  │ section  │ page header (title + description)│
│ nav      │ rail     │ work region (cards, queue, table)│
│          │ (billing │                                 │
│          │  only)   │                                 │
└──────────┴──────────┴─────────────────────────────────┘
```

Reference steal: [Jason-uxui/project-dashboard](https://github.com/Jason-uxui/project-dashboard) — grouped sidebar, sticky topbar, breadcrumbs on detail routes. Adapted to AE: no blue SaaS chrome, 6px controls, amber active states, Fraunces/Hanken/IBM Plex Mono.

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

| Piece | Location |
| --- | --- |
| Shell | `AeOperatorShell` |
| Sidebar | `AeOperatorSidebar` (shadcn Sidebar) |
| Section nav | `AeOperatorSectionNav` |
| Breadcrumbs | `AeOperatorBreadcrumbs` |
| Nav config | `src/lib/operator/navigation.ts` |
| Work primitives | `AeOperatorFactGrid`, `AeOperatorQueueList`, `AeOperatorFilterCard`, `AeAdminReadbackPanel` |

# Token rules

- Sidebar tokens live under `.ae-operator-shell.dark` (`--sidebar-*` + shadcn bridge remap).
- Active nav: amber tint at ~14%, not full fill.
- Radius: 6px buttons/menu, 4px cards/rails.
- No glassmorphism on operator topbar (hairline border only).

# Copy rules

- Sentence case headings.
- Readback-honest descriptions; no fake “Active Pro” unless source-owned.
- Stripe Checkout trust at action moments (activate redirect, receipt links).

# Next additions (not in this pass)

- shadcn Data Table for admin queues
- Progress meters for usage billing
- Switch/accordion for notification settings when settings routes land

# IA and personas (2026-06-30)

Multi-perspective audit: `.ui-craft/reports/heuristic-multiperspective-surfaces.md`.

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
| Jordan (power operator) | Admin queues, monetization | ⌘K palette, breadcrumbs, future data table |
| Margo (mobile owner) | Inquiries, status | Collapsible sidebar, 44px targets, section rail stacks |
| Kwame (screen reader) | All operator | Landmarks, skip link, labelled command dialog |

## Command palette

- Trigger: **⌘K** / **Ctrl+K** or "Jump to…" in topbar
- Includes operator routes for current role + public Ask/Browse
- Component: `AeOperatorCommandMenu`
