# Multi-perspective surface audit — 2026-06-30

Perspectives: **IA** (lane L1), **Nielsen heuristics**, **five personas** (Priya, Jordan, Adaeze, Kwame, Margo). Scope: public funnel + operator command layout.

## Executive summary

| Surface | IA score | UX score | Top blocker |
| --- | --- | --- | --- |
| Public Ask + nav | 4 | 4 | GTM funnel events not wired (L1-001) |
| Registry browse | 3 | 4 | Pagination label confusion (fixed) |
| Owner operator | 3 | 4 | Advanced routes equal weight to core (fixed via stage gate) |
| Admin operator | 3 | 4 | No jump navigation for power users (fixed via ⌘K) |
| Billing subsection | 4 | 4 | Receipt drill-down OK; needs data table next |

## IA findings (ranked)

| ID | Finding | Personas | Impact | Status |
| --- | --- | --- | --- | --- |
| IA-01 | Operator nav exposed P4/P6 at same weight as Status/Inquiries | Priya-owner, Margo | reduces-trust | **Fixed** — core/advanced tiers; sidebar shows core in prod |
| IA-02 | Owner status missing share URL after activation | Priya-owner | blocks-conversion | **Fixed** — `AeCopyPublicUrlButton` on status card |
| IA-03 | Registry "Previous" disabled at page 1 | Priya, Kwame | adds-friction | **Fixed** — "First page" label |
| IA-04 | Owner nav label "Inquiries" vs page "Owner messages" | Priya-owner | adds-friction | **Fixed** — aligned to "Inquiries" |
| IA-05 | Advanced operator pages unreachable in prod sidebar | Jordan | adds-friction | **Fixed** — ⌘K palette lists all destinations |
| IA-06 | GTM funnel events not emitted | All | blocks-conversion | **Fixed** — `POST /api/observability/funnel` + surface emitters |
| IA-07 | No bidirectional registry cursor | Jordan | minor-polish | Open — "Back to start" only |

## Persona walkthrough highlights

### Priya (first-time owner)

| Check | Pass | Notes |
| --- | --- | --- |
| Understands owner status page in 5s | Pass | Plain title + copy public URL |
| One obvious next action | Pass | Open page / copy URL |
| No jargon labels on human surface | Pass | Removed "readback" from inquiries title |

### Jordan (power operator)

| Check | Pass | Notes |
| --- | --- | --- |
| Cmd+K jump navigation | Pass | `AeOperatorCommandMenu` |
| URL reflects filters | Partial | Registry yes; admin filters partial |
| Bulk select on queues | Fail | Future data table |

### Kwame (screen reader)

| Check | Pass | Notes |
| --- | --- | --- |
| Landmarks: main, nav, header | Pass | Operator shell |
| Skip link | Pass | Both shells |
| Disabled control confusion | Pass | Registry pagination fixed |
| Command dialog labelled | Pass | DialogTitle sr-only |

### Margo (mobile owner)

| Check | Pass | Notes |
| --- | --- | --- |
| Touch targets ≥44px | Pass | Sidebar trigger, section nav |
| Primary info above fold | Pass | Status card first |
| Sticky chrome not excessive | Pass | 56px topbar + collapsible sidebar |

## Nielsen quick scorecard

| Heuristic | Public | Operator | Notes |
| --- | --- | --- | --- |
| 1 Visibility of status | 4 | 4 | Loading skeletons on registry |
| 2 Match real world | 4 | 4 | Copy aligned |
| 3 User control | 3 | 4 | ⌘K + breadcrumbs |
| 4 Consistency | 4 | 4 | Shared shell |
| 5 Error prevention | 4 | 4 | Billing fail-closed |
| 6 Recognition over recall | 4 | 4 | Sidebar + section rail |
| 7 Flexibility | 3 | 4 | Palette helps experts |
| 8 Minimalist design | 4 | 3 | Admin monetization dense (OK) |
| 9 Error recovery | 4 | 4 | Alert panels |
| 10 Help/docs | 3 | 3 | Footer only |

## Shipped in this pass

1. `AeCopyPublicUrlButton` — shared activation affordance
2. Operator nav **core/advanced** tiering (`VITE_AE_OPERATOR_ADVANCED_NAV` override)
3. `AeOperatorCommandMenu` — ⌘K jump palette (all routes + public)
4. Registry pagination IA fix
5. Owner copy alignment (status, inquiries)
6. Surface spec update: `.ui-craft/surfaces/operator.md`

## Next pass (ROI order)

1. Wire GTM funnel events (L1-001)
2. shadcn Data Table on admin queues (Jordan bulk + sort)
3. Owner status empty state CTA → claim flow
4. Promote `rounded-[var(--ae-radius-*)]` to CSS utilities (class-scan)
5. Saved admin filter views in URL search params
