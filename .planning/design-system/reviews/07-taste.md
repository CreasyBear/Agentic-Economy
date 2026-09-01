# Design Taste Review — Agentic Economy Design System
**Analysis Date:** 2026-09-01
**Lens/Skill:** design-taste — `/Users/joelchan/.claude/skills/design-taste/SKILL.md`
**Scope:** All seven map documents (`FOUNDATIONS`, `COMPONENTS`, `LAYOUT`, `PATTERNS`, `CONVENTIONS`, `ACCESSIBILITY`, `CONCERNS`), `DESIGN.md`, `.planning/BRAND.md`, `src/styles/globals.css`, and direction-relevant public, market, and operator source files. This is a direction review, not a browser-render or implementation-conformance audit.

## Scope and Coverage

I read the complete design-system map and the two governing authorities, then spot-checked the token bridge and representative compositions: `src/content/brand-copy.ts`, `AeHomeLanding.tsx`, `AeSiteType.tsx`, `AeSiteSection.tsx`, `AePageHeader.tsx`, `AeMarketPage.tsx`, `AeOperatorSidebar.tsx`, and `AeOwnerOperationsWorkspace.tsx`. The review covers distinctiveness, anti-AI-slop risk, mode coherence, market-terminal conviction, density, type/shape restraint, construction motifs, and language continuity. It intentionally does not certify rendered contrast, responsive geometry, or the visual weight of every route; those are marked **Not verified** below.

## Verdict summary

The direction is strong and worth protecting, but it is not yet fully coherent. This is an **industrial/utilitarian market terminal warmed by a public, lightly constructed entry composition**. The warm canvas (`--ae-bg` / `#f4f4f1`), near-black ink (`--ae-fg` / `#1a1a1a`), and one semantic blue (`--ae-brand`) produce a quiet, classic base with controlled loud moments: ink actions, a notched public CTA, and a small Geist Pixel display voice. That is a better and more ownable point of view than a generic dashboard, and it does not read as AI-slop at the palette level.

The strongest evidence of conviction is structural rather than ornamental: `DESIGN.md` explicitly rejects the app-directory/card-grid default; `AeOperationCard` and `AeOperationTable` use square, hairline-separated market rows; prices and identifiers use `font-mono`; the five-step Operation sequence keeps identity, price/readiness, evidence, contract, and one next action in the same mental model. Public copy also stays product-specific and literal: `HOME.heroHeading` says “The marketplace built for agents,” while `HOME.heroSubhead` says to search, inspect price/access, and connect only when required (`src/content/brand-copy.ts:23-31`).

The weak point is not the chosen aesthetic; it is drift at the seams. Market currently inherits a public display-header decision, Operator still looks partly like a flat stock dashboard, owner surfaces introduce repeated rounded summary boxes, and the public construction vocabulary is broad enough to become terminal cosplay if it lacks a strict usage hierarchy. Fix those seams and the system reads as one deliberate product. Leave them and it reads as a good brand direction accumulated over several implementation passes.

**Direction brief**

- **Direction:** Industrial/utilitarian market terminal, with a warm public entry and restrained construction language.
- **Density:** Spacious on Public, comfortable on first-use paths, compact and comparison-led in Market and Operator.
- **Surface:** Warm canvas plus a white work well; hairlines before cards; raised surfaces only for bounded tasks, compare, receipts, and execution.
- **Type mood:** Calm sans interface, aligned mono data, occasional pixel display statement; never pixel type in operational work.
- **Motion:** Crisp, state-led, and quiet; `100/160/220ms` with the shared easing tokens, never ambient theater.
- **Do:** Keep ink as the action color; let rows/tables carry the market; make evidence classes visually quiet but explicit; use notches and marks only where they explain public structure.
- **Don't:** Add gradients or extra accents; turn every summary into a card; use display type or uppercase tracking as a generic terminal costume; multiply construction motifs without a role.

## Findings

| # | Severity | Domain | Location | Before | After | Why |
|---|----------|--------|----------|--------|-------|-----|
| 1 | MEDIUM | Market mode / type direction | `src/components/ae/market/AeMarketPage.tsx:274-280`; `src/components/ae/layout/AePageHeader.tsx:68-85`; `DESIGN.md:18-36`; `CONCERNS.md:9-12` | The Market page calls `AePageHeader` without a variant, so the default title is `font-display` (Geist Pixel). The authority reserves `font-display` for public hero/page-level brand statements and says Market should be terminal-dense. | Give Market an explicit terminal header treatment using `font-sans` (with mono only for measured metadata), while retaining the display face for Public hero/page statements. Make the mode choice impossible to inherit accidentally. | This is the clearest current mode schism. A pixel title above a dense catalogue makes the market feel like a branded landing page rather than the same tool becoming operational. It also spends the system's scarce display voice in the place where aligned scanning should win. |
| 2 | MEDIUM | Operator mode / shell grammar | `LAYOUT.md:40-54`; `src/components/ae/layout/AeOperatorSidebar.tsx:128-142,177-180`; `.planning/BRAND.md:74-91`; `DESIGN.md:23-25` | Operator navigation uses mono uppercase/tracked group labels, and the sidebar is `variant="sidebar"`, producing a flat split instead of the locked inset work well. The map explicitly records this divergence. | Resolve the Operator shell to the documented inset-well posture: canvas outside, `bg-container` work well inside, with existing `rounded-card`/`shadow-soft` semantics only where the well is genuinely raised. Use ordinary compact labels; reserve uppercase tracking for a real marker/status, not every group heading. | Quiet Operator mode should feel like the calm inside of the market, not a second generic dashboard and not terminal cosplay. The current combination makes navigation visually louder while the missing inset boundary removes the product's strongest cross-mode surface cue. |
| 3 | MEDIUM | Public construction language / anti-slop | `.planning/design-system/COMPONENTS.md:116-125`; `.planning/design-system/FOUNDATIONS.md:170-179`; `src/components/ae/website/AeSiteMarks.tsx`; `DESIGN.md:18-25,38-46`; `.planning/BRAND.md:84-87` | The public inventory contains plus marks, corner marks, vertical hairlines, dotted rules, connecting frames, crosshairs, site markers, notched buttons, and a notched footer card. The map describes the pieces, but does not provide a tight motif-to-role matrix beyond “sparse construction marks” and “notches only on public actions/footer.” | Define a small public motif grammar and usage matrix: one line/plus family for wayfinding and section joins, notch only for primary CTA/footer, and decorative marks hidden or reduced on constrained widths. Cull any motif that does not clarify hierarchy or prove a second real use. | The pieces are distinctive individually, but together they can tip the system from industrial precision into retro-futurist garnish. The brand explicitly rejects terminal cosplay; without hierarchy, the construction layer competes with the literal catalogue and Operation facts it is meant to frame. |
| 4 | MEDIUM | Surface and shape discipline | `.planning/design-system/CONCERNS.md:21-31`; `src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx:268-280,350-352`; `FOUNDATIONS.md:156-169`; `DESIGN.md:38-53` | Market rows correctly stay square, but owner work surfaces use repeated bordered `rounded-lg` summary boxes in a two-column grid, while owner lists, funding quotes, and status panels also use local `rounded-lg` substitutes instead of the role-specific `rounded-card`/structural-row grammar. | Keep one raised card for a genuinely self-contained task; render repeated owner summaries as hairline-separated rows or a single grouped work surface using `border-border`, `gap-related`, and the declared radius roles. Do not let summary cards multiply into a dashboard grid. | The owner workspace is where the coherent terminal direction is most likely to become scrappy accumulation. Repeated rounded boxes imply interchangeable dashboard metrics, while the product's distinctive promise is exact Operations and controlled work, organized by structure first. |
| 5 | LOW | Auth surface / token coherence | `src/components/ae/website/clerk-appearance.ts:9-23,30-35`; `CONCERNS.md:15-18`; `FOUNDATIONS.md:7-31,156-179` | The Clerk appearance adapter owns literal OKLCH values, `borderRadius: '0px'`, and `rounded-none` controls without an explicit token bridge or documented auth-only exception. The rest of the system has named palette, radius, and surface roles. | Bridge provider appearance to the existing `--ae-bg`, `--ae-fg`, `--ae-border`, and control-radius semantics, or record a deliberate auth exception in the authority. The sign-in surface should still look like the same market. | Auth is a small surface, but it is a trust-sensitive first or return visit. A provider-looking zero-radius form quietly breaks the warm-neutral, controlled-geometry story and makes the design system feel assembled from adjacent kits. |

## Considered but Rejected

| Location | Candidate | Rejected because |
|----------|-----------|------------------|
| Global palette and surfaces | Add a dark terminal theme or a second high-contrast accent set. | `.planning/BRAND.md:72-91` and `FOUNDATIONS.md:29-31,78-105` intentionally lock the product to a light warm canvas with one blue information channel and literal status colors. Dark mode would be a new product direction, not a taste fix. |
| Type system | Replace Inter/DM Mono/Geist Pixel with a more exotic type pairing everywhere. | The existing roles are deliberate and distinctive (`DESIGN.md:27-36`; `globals.css:115-122`). The problem is the Market inheritance leak and Operator label treatment, not Inter itself. |
| Market composition | Use a three-column feature/card grid, gradients, or a ticker to make the catalogue feel more “alive.” | Those are precisely the generic AI/trading-dashboard signals the authorities reject. The square rows, aligned numbers, hairlines, and progressive detail already express the market more convincingly. |

## Verification

Checked the complete map set: `.planning/design-system/FOUNDATIONS.md`, `COMPONENTS.md`, `LAYOUT.md`, `PATTERNS.md`, `CONVENTIONS.md`, `ACCESSIBILITY.md`, and `CONCERNS.md`; the governing `DESIGN.md` and `.planning/BRAND.md`; and the current token bridge in `src/styles/globals.css`. Spot-checked `src/content/brand-copy.ts`, `src/components/ae/home/AeHomeLanding.tsx`, `src/components/ae/website/AeSiteType.tsx`, `src/components/ae/website/AeSiteSection.tsx`, `src/components/ae/layout/AePageHeader.tsx`, `src/components/ae/market/AeMarketPage.tsx`, `src/components/ae/layout/AeOperatorSidebar.tsx`, and `src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx`.

Confirmed the named direction tokens and roles: `--ae-bg`, `--ae-fg`, `--ae-brand`, `--ae-font-sans`, `--ae-font-display`, `--ae-font-mono`, `--radius`, `--radius-card`, `--radius-nav`, `--ae-space-section`, `--ae-space-hero`, `--ae-space-band`, `--shadow-soft`, `--shadow-overlay`, `duration-fast/base/slow`, and `ease-standard/emphasized`. Confirmed the map's canonical Operation sequence, three mode definitions, row/card rules, and public copy continuity against source.

**Not verified:** browser-rendered visual balance, actual motif density on every route, contrast ratios, 320px/200% zoom behavior, and whether the Operator inset divergence is an intentional product exception rather than unfinished cutover. Those require runtime or owner confirmation and are not treated as additional findings here.

## Recommendations (priority order)

1. Make Market typography explicit and role-pure. Add a Market header decision so `font-display` cannot leak through `AePageHeader`'s default `variant="page"`.
2. Finish the Operator surface decision against `.planning/BRAND.md`: adopt the inset work well, keep navigation receded, and remove generic uppercase tracking from ordinary operational labels.
3. Publish a construction-motif usage matrix and prune before adding any new public mark. The matrix should name the allowed surface, information job, breakpoint behavior, and second use for each motif.
4. Converge owner summaries and local `rounded-lg` surfaces on the declared structural-row/card roles. Treat the two-column `SummaryCard` pattern as a guardrail case, not a template for more tiles.
5. Bring Clerk appearance under the same token vocabulary or document the exception so auth does not become a hidden sixth visual mode.
6. Preserve what is already differentiated: the warm-neutral/ink/blue restraint, literal landing copy, notched public action, square market rows, mono-aligned values, evidence-first Operation sequence, and functional motion tokens.

## Open questions for the owner

- Is the flat Operator split an intentional usability choice, or should the `.planning/BRAND.md` inset work well be treated as a non-negotiable acceptance criterion?
- Should every Market/page header be sans-led, with Geist Pixel limited strictly to `/` and other clearly public brand statements?
- Which public construction marks are canonical brand language, and which are implementation-era experiments that should be retired?
- Is a provider-rendered auth form allowed to use a distinct geometry, or must it inherit the same token bridge as every other user-facing control?

**Verdict: Needs changes**