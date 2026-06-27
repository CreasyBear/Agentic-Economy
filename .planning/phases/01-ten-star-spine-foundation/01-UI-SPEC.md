---
phase: 01
slug: ten-star-spine-foundation
status: approved-for-planning
shadcn_skill_installed: true
shadcn_initialized: false
preset: none
created: 2026-06-27
---

# Phase 01 — UI Design Contract

Visual, IA, UI, and UX contract for Phase 1 implementation. Runtime is absent: no `package.json`, `components.json`, `apps/`, `src/`, `convex/`, or `tests/` tree exists yet. This file locks the user-facing product direction before `plan-phase`; rendered verification remains required during implementation.

---

## Scope and mode

| Field | Value |
|-------|-------|
| Mode | Shape + Harden |
| Primary phase | Phase 1: Ten-Star Spine Foundation |
| Primary product job | An AU urgent/local-service owner can claim without ABN, publish truthful service facts, understand public/index/discovery health, and recover or suppress exposure. |
| Primary user | Sam from Parramatta Emergency Plumbing, owner/operator or admin. |
| Secondary users | Public customer/searcher, crawler/answer engine, source-owned operator/admin. |
| Non-goal | Do not design chat, inbox, payments, bookings, protected actions, developer platform, hosted agents, voice, marketplace, API-key, MCP, or OpenAPI UI in Phase 1. |

---

## External SaaS inspiration

Use these as product interaction patterns, not visual cloning.

| Source | Observed pattern | AE application | Rejected part |
|--------|------------------|----------------|---------------|
| Vercel Projects/Deployments docs — project dashboard groups deployment status, generated URLs, logs, resources, observability, and repair actions. | One object overview with status, URL, diagnostics, and actions. | Owner status/readback becomes one compact object dashboard: public URL, service status, public/index/discovery/trust state, unavailable capabilities, and next action. Admin repair surfaces expose inspect/retry/no-repair without hiding failure. | Do not import developer/deployment language into owner copy. |
| Linear Docs — docs center exposes popular paths, workflows, triage, issue statuses, relations, and display options. | Work queues are grouped by status and next action, not by implementation table. | Admin claims/index/discovery queues group by needs-review, failed, stale, suppressed, and no-repair. Owner UI gets status labels with next action. | Do not create a general project-management dashboard. |
| Stripe Checkout docs — Checkout prefers a hosted full page for lowest complexity and includes order summary/state handoff. | High-consequence flows should centralize summary, handoff, return/cancel, and receipt states. | Future Phase 5 paid activation should use this posture. Phase 1 borrows only the summary/receipt mental model for publish success and repair readbacks. | No payment affordances, price, checkout, wallet, x402, or receipt copy in Phase 1. |
| Clerk component docs — auth UI is framework-specific and componentized. | Authentication should feel native but remain auth-provider-owned. | Use Clerk components/patterns for sign-in/session UI when runtime exists; AE forms never accept browser-supplied owner/admin IDs. | Do not build bespoke auth UI before necessary. |
| shadcn/ui component docs — Card, Button, Badge, Alert, Empty, Skeleton, and TanStack Form/Field patterns. | Use official components and composition before custom markup. | Phase 1 UI uses Card for object summaries, FieldGroup/Field for forms, Badge for status, Alert for failures, Empty for no data, Skeleton for loading, Button for actions. | No third-party registry blocks unless explicitly selected and reviewed. |

Sources: Vercel Projects/Deployments docs, Linear Docs, Stripe Checkout docs, Clerk component overview, and shadcn/ui component docs read during this pass.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui skill installed with `npx skills add shadcn/ui`; runtime shadcn project not initialized yet. |
| shadcn project context | `npx shadcn@latest info --json` reports framework `Manual`, `config: null`, `components: []`. |
| Preset | Not initialized now. When runtime scaffold exists, initialize shadcn in the TanStack Start app with a boring Vercel-compatible default; prefer `nova` only if it does not fight Tailwind/TanStack conventions. |
| Component library | shadcn/ui official registry, Radix base unless future `components.json` says otherwise. |
| Icon library | Decide at scaffold time from shadcn `info`. If absent, prefer one library only; no mixed icon packs in Phase 1. |
| Font | Geist Sans for UI text and Geist Mono for route/API/code labels if available in the runtime scaffold; otherwise use system sans until fonts are installed. |
| Tailwind | Use semantic tokens. No raw brand colors in route components. |
| Motion | CSS transitions first. Do not add a motion dependency solely for polish. |

### Required initial shadcn components

Install only when the runtime app exists and the importing route needs them.

| Need | Component |
|------|-----------|
| Primary/secondary/destructive actions | `button` |
| Claim/publish/status forms | `field`, `input`, `textarea`, `select`, `checkbox`, `input-group` as needed |
| Object summaries and status cards | `card` |
| Status labels | `badge` |
| Failure/warning/success callouts | `alert` |
| Loading states | `skeleton`, `spinner` |
| Empty states | `empty` |
| Separators/layout scroll where needed | `separator`, `scroll-area` |
| Admin tables/queues if dense data is necessary | `table` |
| Destructive confirmations | `alert-dialog` only when consequence is not safely undoable inline |

Registry safety: official shadcn registry only for Phase 1. Third-party blocks require explicit registry, `shadcn view`, diff review, import-path review, icon-library review, and product-design acceptance.

---

## Information architecture

### IA principles

1. Owner activation before developer/platform surfaces.
2. One public business object owns the user's mental model.
3. Status and repair are visible where the owner needs them, not hidden in admin logs.
4. Public routes say what is true; admin/operator routes say what can be repaired.
5. Machine-readable discovery exists, but owner UI never leads with protocol jargon.

### Route map

| Route | Primary user | Job | Surface contract |
|-------|--------------|-----|------------------|
| `/` | Owner | Understand AE and start a claim. | One hero, one primary CTA `Claim your service page`, clear anti-overclaim copy, no protocol-first positioning. |
| `/claim` | Owner | Submit business/service facts and publish. | Single coherent claim flow with sections for identity, service facts, first-request disclosure, review/publish. Avoid wizard unless validation/length proves one page fails. |
| `/claim/success` | Owner | See published or queued result and next action. | Success receipt with public URL, current status, copied/shared URL action, and pending/degraded explanations. `noindex`. |
| `/{slug}` | Public customer/owner | Read truthful service facts and availability. | Public business service catalog page with service facts, status, safe first-request disclosure, unavailable capabilities, removal link, schema-safe copy. |
| Owner status/readback | Owner | Understand visibility and repair next steps. | One-screen status card: public URL, service status, public/index/discovery/trust state, unavailable capability, next action. May live after claim success or authenticated owner route chosen in plan. |
| `/registry` | Public/customer/operator | Browse eligible published services. | Search/list surface with explicit empty state, status-safe snippets, pagination, no private fields. |
| `/api/businesses*` | Builder/crawler/operator | Fetch public catalog facts. | JSON/API response, not a styled app surface. Error/empty/schema examples documented in UI copy or docs if exposed. |
| `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt` | Crawler/agent/operator | Fetch discovery outputs. | Machine-readable; human debug copy may be minimal but must state unsupported capabilities. |
| `/privacy/remove-business` | Owner/public claimant | Request removal or dispute exposure. | Plain-language form with object, scope, consequence, evidence, and response expectation. |
| `/admin/claims` | Operator | Review claims and contention. | Queue grouped by status and next action; no hidden destructive controls. |
| `/admin/index-health` | Operator | Repair projection/discovery failures. | Health queue grouped by failed/stale/suppressed/no-repair; each row has source hash/readback summary and repair action. |
| `/admin/audit-events` | Operator | Reconstruct state. | Read-only audit viewer with filters, redaction, correlation IDs, and no raw private payloads. |

### Navigation contract

- Public header: logo/name, `Claim your service page`, `Registry`, `Remove a business`; no `Agents`, `Developers`, `Payments`, `Marketplace`, or `API keys` nav.
- Owner authenticated context: public URL/status card first; claim/publish status and next action second.
- Admin context: separate `/admin/*` shell; never expose admin nav to non-admins.
- Footer: privacy/removal, registry, claim, unsupported capability statement, no protocol hype.

---

## Key flows

### Flow A — Owner claim without ABN

1. Owner lands on `/` and sees who this is for, what AE does, and what it does not do yet.
2. Owner chooses `Claim your service page`.
3. If unauthenticated, Clerk sign-in appears before authority-sensitive claim mutation.
4. Owner enters business identity and service facts: category, suburb/state, optional postcode, service area, hours/unknown, source refs, and public contact target or no-contact reason.
5. UI validates inline and preserves user input.
6. Review block summarizes the exact object and public consequence: service page, registry/search/API/discovery visibility, unavailable booking/payment/action state.
7. Publish action writes source state or returns typed error.
8. Success/readback shows URL, status, what is still pending, and next action.

### Flow B — Public service page

1. Visitor lands on `/{slug}`.
2. Top of page identifies business/service/category/suburb and current trust/status without implying ABR verification.
3. Service facts and first-request disclosure are visible in the first viewport on mobile.
4. Unavailable capabilities are explicit: bookings, payments, and automated actions are not live.
5. Discovery/API links are secondary and human-readable.
6. Removal/dispute path is discoverable but not visually louder than the primary service facts.

### Flow C — Owner status/readback

1. Owner opens success/status view.
2. One object card shows: public URL, publicStatus, trustTier, indexStatus, discoveryStatus, service/capability state, and next action.
3. Failures show problem + repair path: `We could not update discovery files. Retry is available.`
4. Repair/readback states do not use raw adapter/log wording.
5. Copy/share public URL is available only when the page is actually public.

### Flow D — Operator repair

1. Operator opens `/admin/index-health`.
2. Queues are grouped by failed/stale/degraded/suppressed/no-repair.
3. Each item shows object, affected public surfaces, latest readback, source hash/version, correlation ID, and safe repair action.
4. Destructive suppress/unsuppress actions require consequence copy and reason/evidence.
5. Audit viewer reconstructs events without exposing raw private payloads.

---

## State contract

Every route that exposes state must render the state as text, not color alone.

| State family | User label guidance | Component guidance |
|--------------|---------------------|--------------------|
| `publicStatus` | `Draft`, `Published`, `Suppressed` | Badge + plain text explanation. |
| `trustTier` | `Claimed`, `Contact confirmed`, `Listed`, `Registry verified` | Badge; never say `verified` unless `registry_verified`. |
| `indexStatus` | `Not queued`, `Queued`, `Indexed`, `Failed`, `Stale` | Badge + repair copy when failed/stale. |
| `discoveryStatus` | `Unavailable`, `Degraded`, `Available`, `Stale` | Badge + Alert for degraded/stale. |
| `ServiceCapabilityStatus` | `Available`, `Degraded`, `Unavailable`, `Stale` | Badge + first-request copy. |
| Negative flags | `Bookings not live`, `Payments not live`, `Automated actions not live` | Human labels on owner/public pages; raw `callable=false` and `paymentRequired=false` only in machine/admin diagnostics. |

Never collapse these into `live`, `agent-ready`, `verified`, `callable`, or `payable`.

---

## Reachable UI states

| Surface | Required states |
|---------|-----------------|
| `/` | default, narrow/mobile, no-js critical copy, long location/service phrase, CTA focus/hover/press. |
| `/claim` | unauthenticated, authenticated, loading, empty, invalid business identity, empty service list, invalid service area, hours unknown, public contact target present, no-contact reason present, CSRF/origin failure, duplicate/suspicious claim, rate-limited, wrong owner, publish pending, publish failed, published, input preserved after recoverable errors. |
| `/claim/success` | published/index queued, published/not indexed, discovery degraded, copy URL success/failure, suppressed after publish, noindex. |
| `/{slug}` | published, published-not-indexed, discovery degraded, unavailable first request, contact target excluded, long service list, long owner text escaped, suppressed/not-found, noindex, JSON-LD escape proof. |
| Owner status | no public page yet, queued, indexed, failed, stale, degraded discovery, suppressed, repair available, repair failed, no repair, activation milestone complete/incomplete. |
| `/registry` | loading, empty search, no results, populated, pagination, encoded query, long suburb/category, suppressed item absent. |
| API/discovery debug surfaces | 200, 404, stale, degraded, unsupported capability, schema mismatch, content-type visible where human-debuggable. |
| `/privacy/remove-business` | empty, invalid evidence, submitted, duplicate, contested, suppressed, error, preserved input. |
| `/admin/*` | non-admin 401/403, empty queue, populated queue, failed/stale item, retry pending, retry success/failure, suppress/unsuppress confirmation, audit redacted, filters empty/populated. |

All user-visible screens must pass mobile 375px, keyboard-only operation, visible focus, labels/errors, reduced-motion where motion exists, long-content handling, and safe empty/loading/error states.

---

## Spacing Scale

Declared values are multiples of 4.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon/text gaps, badge internals. |
| sm | 8px | Field helper/error gap, compact row gap. |
| md | 16px | Default card/content gap, form group gap. |
| lg | 24px | Section padding, card header/content separation. |
| xl | 32px | Page region gap, two-column layout gap. |
| 2xl | 48px | Major route section break. |
| 3xl | 64px | Home hero and high-level page spacing. |

Rules:
- Use `gap-*`, never `space-x-*` or `space-y-*` in app code.
- Card sections use full Card composition; do not dump everything into `CardContent`.
- Concentric radii: outer radius = inner radius + padding for nested rounded surfaces.
- If padding exceeds 24px, treat nested elements as separate surfaces rather than forcing concentric math.
- Interactive hit area target is 44×44px; never below 40×40px.

Exceptions: none approved.

---

## Typography

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Body | 16px | 400 | 1.6 | Owner/public explanatory copy and form body. |
| Small | 14px | 400/500 | 1.45 | Field descriptions, status details, metadata. |
| Label | 14px | 500 | 1.4 | Form labels, table headers, status labels. |
| Heading | 24–32px | 600 | 1.15 | Route headings, card section titles. |
| Display | 44–56px | 650 | 1.0–1.08 | Home hero only; must balance within 6 lines. |
| Mono | 12–14px | 400/500 | 1.5 | Slugs, IDs, route paths, correlation IDs. |

Rules:
- Apply font smoothing once at the root (`antialiased` or equivalent).
- Headings use `text-wrap: balance`.
- Body/descriptions use `text-wrap: pretty` unless long-form 10+ lines.
- Dynamic counts, timestamps, attempts, status numbers, and IDs in columns use `tabular-nums`.
- Owner/public copy avoids raw terms: SQCT, router, UCP, MCP, llms, manifest, lifecycle, callable, agent-native, wallet, marketplace, request market, verified unless the exact trust tier supports it.

---

## Color and visual hierarchy

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | Token: `background` | Page background and calm whitespace. |
| Secondary (30%) | Token: `card`, `muted` | Cards, panels, admin queue grouping, skeleton backgrounds. |
| Accent (10%) | Token: `primary` | Primary CTA only, active selection, focus ring where token-driven. |
| Destructive | Token: `destructive` | Suppression/removal/destructive errors only. |
| Warning/degraded | Semantic warning token to define at scaffold if shadcn preset lacks one; otherwise use Alert copy plus neutral Badge. |
| Success/available | Semantic success token only if tokenized; never color-only success. |

Accent reserved for: `Claim your service page`, `Publish service page`, retry/repair primary action, and one selected navigation state. Do not paint every clickable element with accent.

Rules:
- Status uses Badge + text, never color alone.
- Prefer shadows-as-borders for elevated cards/containers; keep true borders for dividers, inputs, tables, and focus affordances.
- Images, if used, must have `outline-black/10 dark:outline-white/10` with inset outline.
- No decorative gradients or motion unless they clarify state or hierarchy.

---

## Component contract

| Pattern | Required component / behavior |
|---------|-------------------------------|
| Forms | `FieldGroup` + `Field` + `FieldLabel` + `FieldDescription` + `FieldError`; controls use `aria-invalid`, parent Field uses `data-invalid`. |
| Textarea with character count | `InputGroup` + `InputGroupTextarea` + `InputGroupAddon`; count uses `tabular-nums`. |
| Buttons | `Button`; loading uses `Spinner` + `data-icon` + `disabled`, not `isLoading`. Active press may use `active:scale-[0.96]` via explicit transform transition. |
| Status | `Badge` variants plus text; icon uses `data-icon`, no manual icon sizing inside components. |
| Object summaries | Full `Card` composition with `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`. |
| Empty states | `Empty` composition, not custom divs. |
| Loading | `Skeleton`/`Spinner`, no custom `animate-pulse` blocks. |
| Alerts/callouts | `Alert` with title, description, and optional action. |
| Destructive confirmation | Inline consequence first; use `AlertDialog` only when the destructive outcome cannot be safely undone or is high impact. |
| Admin queues | `Table` only for dense comparison; otherwise Cards/List rows with explicit next action. |
| Navigation | Navigation components for navigation; Buttons for actions; links are not styled buttons unless `asChild` is appropriate and semantic. |

---

## Interaction and motion contract

- Use CSS transitions for interactive state changes; they must be interruptible.
- Never use `transition: all` or Tailwind `transition` shorthand for app interactions. Use explicit properties such as `transition-[scale,opacity,filter]`, `transition-transform`, or `transition-[box-shadow]`.
- Contextual icon swaps use scale `0.25 → 1`, opacity `0 → 1`, blur `4px → 0px`; if no motion dependency exists, keep both icons in DOM and cross-fade with CSS.
- Press feedback uses exactly `scale(0.96)` and can be disabled for distracting contexts.
- Use `will-change` only after observed first-frame stutter and only for transform, opacity, filter, or clip-path.
- Staged route enters may split title, description, and CTA with ~100ms stagger, but never delay form usability.
- Reduced-motion must disable non-essential animation.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Home H1 | Claim and publish a truthful service page customers and assistants can read. |
| Home subcopy | Start with emergency local services. Show what is reachable, what is unavailable, and what needs repair without claiming bookings, payments, or automated actions. |
| Primary CTA | Claim your service page |
| Secondary CTA | View registry |
| Claim page heading | Tell us what your service can safely publish |
| Claim submit | Publish service page |
| Claim review warning | Publishing makes these service facts visible on your public page, registry, search API, and AE-hosted discovery files. |
| Empty service error | Add at least one service before publishing. |
| Duplicate claim error | This business may already be claimed. We saved the attempt for review and did not publish changes. |
| Rate-limit error | Too many claim attempts. Try again later or request help. |
| Publish pending | Publishing your page and updating discovery files. |
| Publish failed | We could not publish this page yet. Nothing public changed. |
| Success heading | Your service page is published |
| Indexed pending | Search and discovery updates are still running. |
| Discovery degraded | Discovery is degraded. The public page remains available. |
| Unavailable capability | Bookings, payments, and automated actions are not live for this service. |
| Suppressed public state | This service page is no longer publicly available. |
| Removal heading | Request removal or correction |
| Admin denied | You do not have access to this admin area. |
| Destructive confirmation | Suppress service page: this removes the page, registry entry, API result, sitemap URL, llms entry, and UCP output until restored. |

Copy rules:
- Say `claimed`, `listed`, `indexed`, `discovery available/degraded/unavailable`, `bookings not live`, `payments not live`, `automated actions not live`.
- Do not say `verified`, `agent-ready`, `callable`, `payable`, `marketplace`, `wallet`, `AI booking`, `guaranteed response`, or `partner network` in Phase 1 owner/public copy.
- Error copy must name the problem and next step, not expose implementation details.

---

## Accessibility and responsive contract

- 375px width is a release gate for every user-facing route.
- Primary controls are at least 44px tall where practical; never below 40px hit area.
- Keyboard order follows visual order; skip link exists for pages with repeated navigation.
- Focus is visible and not color-only.
- Form labels are persistent, not placeholder-only.
- Errors are connected to fields, announced accessibly, and preserve user input.
- Status cannot rely on color only; each status has text.
- Destructive actions name object, scope, and consequence before confirmation.
- Owner/public pages keep critical facts available without JS-only rendering.
- RTL/localization risk: long suburb/service/category names and expanded labels must not break cards, tables, or badges.

---

## Surface-specific layout contracts

### Home `/`

- Hero: one sentence of outcome, one primary CTA, one secondary registry link.
- Below hero: three proof cards max: `Claim without ABN`, `Publish truthful service facts`, `See discovery health`.
- Anti-overclaim block: concise Alert naming not-live capabilities.
- No pricing, developer, AI-agent, marketplace, or payment sections.

### Claim `/claim`

- Use one page with anchored sections unless validation proves a stepper is needed.
- Section order: business identity, service facts, first-request disclosure, review/publish.
- Review block must summarize public surfaces affected.
- Publish button is disabled only with visible reason.
- Loading label remains stable; use spinner/busy affordance.

### Public business `/{slug}`

- Above fold on 375px: business/service identity, suburb/state, primary service facts, first-request mode, status/unavailable capability.
- Status details are scannable but not louder than service facts.
- Discovery/API/debug links are secondary.
- Removal/correction link is visible but low-friction.

### Owner status/readback

- One-screen status card is the canonical owner readback.
- Card groups: public URL, service status, visibility, discovery/index health, unavailable capabilities, next action.
- If a failure exists, next action is explicit and testable.

### Admin/operator

- Admin pages are utilitarian and dense only where density helps comparison.
- Queue rows name object, source state, failed surface, last attempt, next repair action, and correlation ID.
- Suppression/unsuppression reason/evidence is required and visibly attached to audit.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Components listed in Required initial shadcn components; install only when imported. | `npx shadcn@latest docs <component>` before use; read added files; verify composition and imports. |
| third-party registries | None approved. | Explicit user-selected registry, `shadcn view`, diff review, import-path rewrite, icon-library alignment, and product-design review required. |

---

## Verification contract

The UI-SPEC is approved for planning, not implementation closeout. During implementation, each user-facing PR must provide:

1. Source verification: route/component code follows this UI-SPEC and Phase 1 SPEC.
2. Rendered verification: compact 375px and wide viewport evidence for every materially changed surface.
3. Interaction verification: keyboard path, focus movement, loading/busy behavior, and pointer/touch targets.
4. State verification: at least the changed surface's loading, empty, invalid, error, permission, success, and suppressed/degraded/stale states as applicable.
5. Copy verification: no overclaims; raw protocol terms absent from owner/public copy.
6. Component verification: shadcn official components are composed according to docs and project `components.json`/`info` after scaffold.
7. Polish verification: make-interfaces-feel-better checks for radius, gap, shadows, tabular numbers, text wrapping, transitions, hit areas, and font smoothing.

---

## Checker Sign-Off

| Dimension | Result | Evidence |
|-----------|--------|----------|
| Copywriting | PASS | Copy contract names primary CTA, errors, destructive consequence, and banned phrases. |
| Visuals | PASS | Design system, component contract, hierarchy, color, and surface layout are specified without decorative bloat. |
| Color | PASS | Token-only color roles, accent reservation, status-not-color-only, destructive boundaries. |
| Typography | PASS | Role scale, Geist/system fallback, balance/pretty wrapping, font smoothing, tabular numbers. |
| Spacing | PASS | 4px scale, gap-only rule, concentric radius, hit area, route-specific layout. |
| Registry Safety | PASS | shadcn skill installed; runtime shadcn uninitialized; official registry only; third-party blocks rejected unless explicitly selected and reviewed. |

**Approval:** approved for planning 2026-06-27. Rendered UI approval remains blocked until runtime implementation exists.

---

## Next implementation handoff

Planner must include this UI-SPEC in Phase 1 plan inputs. The first UI-related implementation task should initialize the TanStack Start app and shadcn only after runtime substrate exists, then install the smallest required official shadcn components for the routes being built. No component or nav item should be added for a future phase.
