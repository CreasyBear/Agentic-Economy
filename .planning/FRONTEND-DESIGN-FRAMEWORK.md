# Frontend Design Framework

**Created:** 2026-06-27  
**Status:** authority for frontend planning and implementation  
**Applies to:** every user-facing route, admin route, form, state surface, and generated UI component in `agentic-economy`

## Decision

Agentic Economy needs a real frontend architecture, not a stack of bespoke screens. The design system is a deep module: a small public interface of tokens, shells, layout primitives, status presenters, form patterns, and motion rules that hides the visual complexity every route would otherwise reinvent.

Boldness is required. Bespoke drift is forbidden.

The application should feel like a source-owned civic command surface for local-service trust: sharp enough to be memorable, restrained enough to be trusted, and systematic enough that Phase 2-5 can extend it without visual rewrites.

## Source of truth

| Artifact | Owns |
|----------|------|
| `DESIGN.md` | Machine-readable visual seed: colors, typography, spacing, radii, component token hints, and design director rules. |
| `.impeccable/design.json` | Rich design sidecar for agents/panels: tonal ramps, shadows, motion, breakpoints, and canonical primitive previews. |
| `.planning/FRONTEND-DESIGN-FRAMEWORK.md` | Engineering framework: seams, module ownership, route composition, class policy, checks, and implementation order. |
| `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md` | Phase 1 route IA, copy, state, accessibility, and surface-specific contracts. |

If any of these disagree, stop and update them together before implementation. Route files never become the source of truth for design decisions.

## Design read

Reading this product as: a task-first local-service trust product for AU owner/operators, public customers, crawlers, and source-owned operators, with a bold operational SaaS language. Use shadcn/ui and Tailwind as owned component infrastructure, then layer AE-specific product components and status presenters on top. Apply `/taste` for brand-level ambition and surface topology. Apply `/impeccable` for product discipline, hardening, auditability, and polish.

Physical scene: Sam is checking the state of an urgent-service listing between real jobs, often on a phone, with one question: what is public, what is trustworthy, and what must be fixed now? That scene allows a distinctive control-room aesthetic, but forbids decorative theatre that hides state or slows action.

## Ambition doctrine

| Principle | Meaning |
|-----------|---------|
| System before screen | A route may arrange content, but it must not invent visual language. |
| Bold topology, disciplined primitives | Homepage/public explanation can use cinematic composition; forms, status, and admin use consistent product primitives. |
| State is the brand | The distinctive AE look comes from truthful status/readback, not ornamental gradients. |
| Every flourish has a job | Motion, color, imagery, and layout variation must clarify hierarchy, state, trust, or next action. |
| No default shadcn | shadcn primitives are raw material. AE tokens, variants, and composition rules make them ours. |
| No generic SaaS | No three equal cards everywhere, no AI-purple glow, no hero metrics, no fake dashboard art. |
| No future-surface cosplay | No payments, wallet, request market, hosted agents, MCP/OpenAPI, or callable UI before the phase gate. |

## Foundation choices

| Area | Decision | Why |
|------|----------|-----|
| Framework | TanStack Start + React | Matches project stack and route/server-function plan. |
| Styling | Tailwind with semantic CSS variables | Keeps routes fast while preventing raw per-screen colors. |
| Component base | shadcn/ui official registry | We own source code, can theme through tokens, and avoid bespoke primitives. |
| UI register | Product UI first; high-ambition brand composition only where it helps trust and explanation | Owner/admin tasks need consistency, but the public story should not look like a template. |
| Theme mode | Light-first with fully specified dark-mode tokens from day one | Field users need legibility; dark support prevents later token churn. |
| Motion | Tokenized CSS transitions first; Motion/GSAP only behind isolated client leaves when a route earns choreography | Avoid dependency bloat while preserving an ambitious path for public storytelling. |
| Icons | One icon family chosen at scaffold from shadcn project context | No mixed Lucide/Tabler/Phosphor drift. |
| Fonts | Geist Sans + Geist Mono if available; otherwise system sans + system mono | Durable, task-oriented, fast, and avoids decorative font debt. |

## Runtime architecture

When the runtime scaffold exists, create these seams before implementing screens.

```text
src/
  styles/
    globals.css
    tokens.css
  components/
    ui/                         # shadcn-owned primitives only
    ae/
      layout/                   # page shells, route chrome, section primitives
      forms/                    # AE field groups and claim form sections
      status/                   # status badges, status cards, capability rows
      feedback/                 # alerts, empty states, loading states, errors
      data/                     # admin queue rows, audit rows, compact tables
      motion/                   # optional isolated motion leaves, never route sprawl
      brand/                    # homepage/public storytelling sections only
  lib/
    ui/
      status-presentation.ts    # domain status -> label, tone, copy, next action
      copy.ts                   # canonical UI strings and banned-copy checks
      routes.ts                 # nav model and route labels
      tokens.ts                 # typed token names if needed by components
      contract-scans.ts         # mechanical checks for class/copy/token drift
```

The directory names are contracts, not suggestions. If a screen needs a pattern that belongs in `components/ae/*`, build it once there before composing the route.

## Deep module seams

| Module | Interface | Owns | Routes must not own |
|--------|-----------|------|---------------------|
| Theme tokens | CSS variables and Tailwind theme aliases | Color, radius, shadow, font, spacing, z-index, focus ring, semantic state tones | Raw hex, ad hoc `dark:` palettes, arbitrary radii, arbitrary shadows |
| Page shell | `<AePublicShell>`, `<AeOwnerShell>`, `<AeAdminShell>` | Header/footer/nav layout, skip link, max width, route chrome, responsive container | Header variants, local nav styling, custom page gutters |
| Surface primitives | `<AePageHeader>`, `<AeSection>`, `<AeSurface>`, `<AeActionBar>` | Section rhythm, card/surface hierarchy, compact/wide behavior | One-off bento/card wrappers, random border/shadow combinations |
| Brand sections | `<AeHero>`, `<AeTrustProof>`, `<AeNarrativePanel>` | Homepage/public storytelling topology, image/media slots, AIDA rhythm | Fake screenshots, repeated card grids, local hero systems |
| Status presentation | `getStatusPresentation(status, context)` | Labels, tone, icon, explanation, next action, semantic ordering | Mapping raw status to color or copy inside routes |
| Form system | `<AeFieldGroup>`, `<AeFormSection>`, `<AeReviewBlock>` | Label/help/error layout, invalid/disabled/loading states, review/publish summaries | Placeholder-as-label, local form spacing, local error display |
| Feedback system | `<AeAlert>`, `<AeEmptyState>`, `<AeLoadingState>`, `<AeErrorState>` | State shape, recovery copy, skeleton strategy, no-data teaching | Custom alerts, raw spinners, empty `div`s |
| Admin data system | `<AeQueueList>`, `<AeQueueRow>`, `<AeAuditEventRow>` | Dense row layout, redaction display, correlation IDs, retry/suppress affordances | Tables invented per admin route |
| Motion system | `aeMotion`, `<AeReveal>`, `<AeStateTransition>` | Duration, easing, reduced-motion handling, client isolation | Route-local `transition-all`, scroll listeners, unbounded GSAP |
| Copy registry | exported string constants or typed copy map | Primary CTA labels, destructive copy, banned phrases, support copy | Route-level wording for shared states |

A module earns its existence only if two or more routes use it or if it prevents a dangerous inconsistency. Otherwise keep the route local until the second use.

## Token system

`DESIGN.md` frontmatter owns the seed token names. Runtime `tokens.css` owns executable token values. They must share names.

### Required token groups

Use semantic names only. Component code may reference tokens, never raw color values.

```css
:root {
  color-scheme: light;

  --ae-bg: oklch(0.985 0.004 252);
  --ae-fg: oklch(0.20 0.026 255);
  --ae-muted-fg: oklch(0.45 0.026 255);
  --ae-surface: oklch(1 0 0);
  --ae-surface-raised: oklch(0.975 0.007 252);
  --ae-surface-command: oklch(0.22 0.04 255);
  --ae-border: oklch(0.87 0.014 252);
  --ae-ring: oklch(0.56 0.18 252);

  --ae-primary: oklch(0.50 0.18 252);
  --ae-primary-fg: oklch(0.985 0.004 252);
  --ae-info: oklch(0.55 0.15 235);
  --ae-success: oklch(0.49 0.12 155);
  --ae-warning: oklch(0.70 0.15 78);
  --ae-danger: oklch(0.56 0.17 28);

  --ae-radius-sm: 8px;
  --ae-radius-md: 12px;
  --ae-radius-lg: 16px;
  --ae-radius-pill: 999px;
  --ae-shadow-raised: 0 1px 2px oklch(0.2 0.02 255 / 0.08), 0 12px 36px oklch(0.2 0.02 255 / 0.08);
  --ae-shadow-command: 0 24px 80px oklch(0.2 0.04 255 / 0.18);
  --ae-focus-ring: 0 0 0 3px oklch(0.56 0.18 252 / 0.30);

  --ae-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ae-ease-state: cubic-bezier(0.22, 1, 0.36, 1);
  --ae-duration-fast: 120ms;
  --ae-duration-state: 180ms;
  --ae-duration-route: 260ms;
}
```

Dark tokens must be defined in the same file before any route ships, even if Phase 1 defaults to light. Do not let dark mode become a later rewrite.

### Token rules

- Route components cannot use raw hex, `rgb()`, `hsl()`, or arbitrary Tailwind color utilities for product surfaces.
- shadcn components consume tokens through globals and variants; route components consume AE components.
- Accent appears on primary action, selected nav, focus affordance, and real semantic states only.
- Status is Badge plus text. Color never carries meaning alone.
- Radius system: inputs `8px`, cards/surfaces `12-16px`, buttons may be pill. No `32px+` product cards.
- Shadows are subtle and tokenized. No border plus wide soft shadow decoration.
- Z-index is named: base, sticky, overlay, modal, toast, tooltip. No `z-[9999]`.
- Motion tokens are required before any animation beyond hover/focus/active is added.

## Class strategy

Classes are allowed for layout, not local visual identity.

Allowed in routes:

```tsx
className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]"
className="flex items-center gap-3"
className="max-w-7xl px-4 py-8 md:px-6"
```

Banned in routes:

```tsx
className="bg-blue-600 text-white shadow-xl rounded-[28px]"
className="space-y-6"
className="transition-all"
className="text-emerald-600"
className="border-l-4 border-orange-500"
```

If a route repeats a class recipe twice, move it into an AE component or typed variant. If a visual choice needs a name, it belongs in tokens or component variants.

## Component layer rules

1. `components/ui/*` is shadcn-owned primitive source. Keep it close to generated docs and tokenized theme.
2. `components/ae/*` is the product framework. Routes import from this layer first.
3. Shared AE components expose typed product props, not `variant` strings that mirror Tailwind trivia.
4. Shared components accept `className` only for layout escape hatches, never to override color, typography, radius, or state styling.
5. Every shared component documents default, hover, focus, active, disabled, loading, error, and success states once runtime exists.
6. A component is promoted to shared only after reuse or safety need. No speculative component library.
7. Brand sections may be more expressive, but they still consume tokens, shells, and copy rules.

### Initial AE components

| Component | Purpose | First routes |
|-----------|---------|--------------|
| `AePublicShell` | Public header/footer, skip link, max width, public nav | `/`, `/registry`, `/{slug}` |
| `AeOwnerShell` | Owner-authenticated chrome and status-first layout | `/claim`, `/claim/success`, owner status |
| `AeAdminShell` | Admin-only chrome and denial state | `/admin/*` |
| `AePageHeader` | Route title, subtitle, primary/secondary action layout | all styled routes |
| `AeHero` | Homepage/public attention surface with strict CTA and anti-overclaim rules | `/` |
| `AeTrustProof` | Source-owned proof cards without fake metrics | `/`, public page |
| `AeStatusBadge` | Textual status with semantic tone | public page, owner status, admin queues |
| `AeStatusCard` | Object readback: URL, public/index/discovery/trust/capability state | claim success, owner status |
| `AeCapabilityList` | Service capability facts and explicit negative flags | public page, owner status |
| `AeClaimFormSection` | FieldGroup-backed form section with review handoff | `/claim` |
| `AeReviewBlock` | Public consequence preview before publish/suppress | `/claim`, removal/dispute, admin suppression |
| `AeEmptyState` | Empty route/list/search states with next action | registry, admin queues |
| `AeQueueList` | Grouped admin queue with action row contract | `/admin/claims`, `/admin/index-health` |
| `AeAuditEventRow` | Redacted audit display with correlation ID | `/admin/audit-events` |

## Status presentation contract

Domain state enters UI through one mapper.

```ts
type AeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

type AeStatusPresentation = {
  label: string;
  tone: AeTone;
  description: string;
  nextAction?: string;
  icon?: IconComponent;
  priority: 'low' | 'medium' | 'high';
};
```

Rules:
- Routes pass raw domain status to the mapper and render returned presentation.
- Owner/public labels are plain language: `Published`, `Indexed`, `Discovery degraded`, `Bookings not live`.
- Admin labels can include technical context but still use redacted/source-safe wording.
- `verified`, `agent-ready`, `callable`, `payable`, `marketplace`, and `wallet` are not owner/public labels in Phase 1.
- `registry_verified` is the only state allowed to produce `Registry verified`.

## Page and route construction

Every route follows this composition order:

```tsx
<Shell>
  <AePageHeader />
  <main>
    <AeSection>
      <DomainSpecificComposition />
    </AeSection>
  </main>
</Shell>
```

A route may own arrangement and data loading. It may not own component styling, state tone, shared copy, or theme decisions.

Route-specific exceptions require a short comment naming why the framework could not express the need and whether the exception should become a component.

## Taste and impeccable operating pipeline

Use these commands as roles in the lifecycle, not random afterthoughts.

| Moment | Command/lens | Required output |
|--------|--------------|-----------------|
| New surface or major change | `/impeccable shape` | Brief: user job, state of mind, color strategy, scene sentence, references, scope, states, interactions, content. |
| Brand/public storytelling surface | `/taste` or `gpt-taste` lens | AIDA plan, hero math, topology variation, no meta labels, no fake screenshots, no gapless-grid mistakes. |
| Design system exists or changes | `/impeccable document` | `DESIGN.md` and sidecar updated from real tokens/components, or seed updated before runtime. |
| Repeated visual pattern | `/impeccable extract` | Promote into `components/ae/*` or token; migrate all callsites; delete local copies. |
| Typography change | `/impeccable typeset` | Fixed product scale, display rule for public pages, font loading/fallback plan. |
| Palette/theme change | `/impeccable colorize` | OKLCH palette, semantic roles, contrast checks, dark-mode parity. |
| Spatial/layout change | `/impeccable layout` | Spacing/rhythm decision, content-driven breakpoints, no repeated card-grid reflex. |
| Motion change | `/impeccable animate` | Purpose, token, reduced-motion fallback, cleanup, no scroll listeners. |
| Responsive change | `/impeccable adapt` | 375px/768px/1024px behavior, touch/pointer differences, safe areas, real-device plan. |
| Edge-case pass | `/impeccable harden` | Long text, empty, invalid, error, permission, rate-limit, RTL/CJK, concurrent operation states. |
| Technical quality pass | `/impeccable audit` | 0-4 score for accessibility, performance, theming, responsive, anti-patterns. |
| Final finish | `/impeccable polish` | Drift classified by root cause, every detail fixed or explicitly deferred with reason. |

No implementation PR closes without the harden, audit, and polish checks that match its changed surfaces.

## Taste integration rules

`/taste` is allowed to push ambition, not to break system ownership.

- Use `/taste` for homepage, public explanation, brand moments, visual direction probes, and hero/section topology.
- Do not use `/taste` to invent route-local buttons, forms, badges, inputs, status colors, admin rows, or nav systems.
- `/taste` randomization applies to composition choices inside the accepted system, not to tokens every time a page is generated.
- AIDA applies to public story pages. It does not apply to `/claim` or `/admin/*` task flows.
- GSAP is allowed only for an earned public storytelling moment, isolated in `components/ae/motion/*`, with `prefers-reduced-motion`, cleanup, and no state-critical content hidden behind animation.
- The bento-grid idea is allowed only when content genuinely has multiple peer objects; it must have exact cell count and no empty cells.
- Hero imagery must be real or generated. Div-based fake product screenshots are banned.

## Theming workflow

1. Maintain `DESIGN.md` and `.impeccable/design.json` as design seed artifacts until code exists.
2. Define executable tokens in `src/styles/tokens.css` before route implementation.
3. Wire tokens into shadcn/Tailwind globals.
4. Initialize shadcn once in the app root after runtime scaffold exists.
5. Install only the shadcn primitives needed by current routes.
6. Build AE components from primitives and tokens.
7. Compose routes from AE components.
8. Add contract tests/scans before adding more screens.

No per-screen theme files. No route-local palettes. No future-surface nav or colors.

## Look and feel guardrails

| Dimension | AE rule |
|-----------|---------|
| Personality | Source-owned, high-trust, operationally bold. Not AI marketplace theatre. |
| Color | Restrained neutral base with a commanding cobalt action accent, semantic state tones, and command-ink panels for high-stakes readback. |
| Shape | Crisp product geometry, 8/12/16px radii, pill buttons allowed, no bulbous cards. |
| Density | Owner/public screens readable with strong hierarchy; admin screens denser but still state-first. |
| Motion | 120-260ms for product state; one earned signature motion per public story page max. |
| Typography | One sans family, mono only for IDs/routes/correlation, display scale only on public story surfaces. |
| Imagery | Real/generated only when it clarifies a public/marketing surface. No fake dashboard art. |
| Brand flair | Homepage can be memorable; task flows stay familiar, fast, and verifiable. |

## Product-design gates

Every user-facing PR must prove:

1. It imported the relevant AE shell and shared components before introducing route-local UI.
2. New states use `status-presentation.ts` or add to it with tests.
3. New form fields use the form system and persistent labels.
4. New loading/empty/error states use shared feedback components.
5. Compact 375px and wide viewport screenshots exist for materially changed surfaces.
6. Keyboard path, focus, and pointer/touch target checks passed.
7. Copy scan passes banned owner/public phrases.
8. Class scan passes: no raw colors, no `space-y-*`, no `transition-all`, no arbitrary visual tokens in routes.
9. shadcn docs were read for any primitive added or updated.
10. No future-phase UI appears before its phase gate.
11. If `/taste` drove a public surface, its design plan is attached to the PR and reconciled with this framework.
12. If `/impeccable` found drift, the root cause is named: missing token, one-off implementation, or conceptual misalignment.

## Mechanical checks to add with runtime

Create `test:ui-contract` or equivalent before the second user-facing route ships. It should scan route/component files for:

- raw color values in route components: `#[0-9a-fA-F]`, `rgb(`, `hsl(`, arbitrary Tailwind color values
- `space-x-` and `space-y-`
- `transition-all` or unscoped `transition` where explicit transition properties are required
- banned owner/public copy: `verified`, `agent-ready`, `callable`, `payable`, `marketplace`, `wallet`, `AI booking`, `guaranteed response`, `partner network`
- manual status-color classes outside the status presentation module
- custom empty/loading/error markup where shared AE components exist
- local `Button` lookalikes, custom status badges, and custom skeletons
- route-local z-index and arbitrary radius/shadow values
- `window.addEventListener('scroll')` in UI code

This is not a replacement for visual review. It prevents drift before review.

## Relationship to phase specs

- `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md` narrows this framework to Phase 1 routes and copy.
- Phase 2-5 specs inherit the framework. They may add components only when their phase gate opens.
- Future UI-SPEC files must reference this framework instead of redefining tokens or component primitives.
- If a future product decision changes the design language, update this file, `DESIGN.md`, `.impeccable/design.json`, and phase UI specs in the same change.

## Hard prohibitions

- No bespoke screen-level theme.
- No bespoke status badge or status color in a route.
- No custom button, alert, empty, skeleton, card, form-control, modal, or destructive confirmation if shadcn/AE component exists.
- No route-local raw colors, radius system, shadow system, typography scale, z-index scale, or motion scale.
- No decoration-first homepage that contradicts product task screens.
- No marketing nav item for future phases.
- No component promotion without reuse or safety justification.
- No default shadcn styling shipped as final AE UI.
- No `/taste` output accepted unless it is converted into framework tokens/components, not pasted as a one-off screen.

## First implementation slice

Before any full screen build, the first frontend PR should ship only:

1. Runtime scaffold.
2. `tokens.css` and globals wired to Tailwind/shadcn.
3. shadcn initialization and minimal primitives: button, card, badge, alert, field/input/textarea, skeleton/spinner, empty, separator.
4. `components/ae/layout/*` shells.
5. `components/ae/status/AeStatusBadge` and `lib/ui/status-presentation.ts`.
6. One tiny route proving the framework, preferably `/` or a non-mutating shell preview.
7. `test:ui-contract` scan for raw styling and copy drift.

Only after that should `/claim`, `/{slug}`, `/registry`, and `/admin/*` be composed.
