# DESIGN.md update draft — Eucalyptus Fusion authority

This is a proposed DESIGN.md update only. It is not applied to `DESIGN.md`.

## Scope

Replace the neutral-default brand guidance in `DESIGN.md` with the locked Fusion direction from `.planning/brand/BIBLE.md`, while preserving these non-negotiables:

- Astryx first: `@astryxdesign/core` + `@astryxdesign/theme-neutral`, `mode="light"`.
- Tailwind 4 remains layout glue through the Astryx bridge.
- No new bespoke CSS files, no shadcn/radix/cva expansion, no new `Ae*` presentation component system.
- Boundary-honest copy remains binding: AE routes qualified inquiries; it does not book, charge, dispatch, confirm availability, or invent proof.

## Proposed patch shape

```diff
 # AE Design System — Astryx Era
 
 This document is the visual/UI authority for Agentic Economy. The previous
 identity ("Daylight Register": Fraunces/amber/paper, hand-drawn hero, bespoke
 `Ae*` component system, handwritten CSS files) is **retired**. Do not extend it;
 migrate away from it.
+
+## 0. Brand authority — Fusion
+
+Agentic Economy is the receipt-backed handoff layer for agentic commerce. It is
+not a lead-selling marketplace, not an "AI finds local services" skin, and not a
+booking/payment/dispatch surface.
+
+The visual soul is **Fusion**:
+
+- **Proof-Ledger spine:** evidence and receipts are the hero objects. Claims sit
+  beside dated sources; facts feel like records, not marketing badges.
+- **Handoff motion:** the inquiry travels out, a reply returns, and the proof
+  spine fills only as events happen. Motion clarifies routing; it never decorates.
+- **Real-Marketplace warmth:** provider pride and honest local photography warm
+  the strict proof layer, without implying AE performed the service.
+
+North-star references: Perplexity for claims beside sources, Stripe for receipt
+objects, Google Flights for honest comparison, and Companies House for dated
+record gravity. Do not copy lead-selling urgency patterns, star-rating theatre,
+AI gradients, or source-washing.
 
 ## 1. The system
 
 - **Component layer:** [Astryx](https://github.com/facebook/astryx)
   (`@astryxdesign/core`) with `@astryxdesign/theme-neutral`, `mode="light"`.
@@
-- **Utility layer:** Tailwind 4 (CSS-first, no config file) for layout glue —
+- **Utility layer:** Tailwind 4 (CSS-first, no config file) for layout glue —
   spacing, flex/grid arrangement, responsive breakpoints — using the Astryx
   token bridge (`@astryxdesign/core/tailwind-theme.css`).
 - **Style entry:** `src/styles/globals.css` owns the layer cascade
   (`reset → theme → base → astryx-base → astryx-theme → components → utilities`).
   `src/styles/legacy.css` is the retiring old system; it only shrinks.
+- **Brand-token layer:** AE overrides theme-neutral semantic CSS variables in
+  `src/styles/globals.css` inside `@layer astryx-theme` under
+  `@scope ([data-astryx-theme="neutral"]) to ([data-astryx-theme])`. The
+  implementation map lives in `.planning/brand/ASTRYX-TOKEN-MAP.md`. Do not add
+  a separate CSS file or route-local palette.
 
 ## 2. Rules
@@
 2. **Tailwind is glue, not a design system.** Utilities arrange Astryx
    components; they do not restyle their internals. Use semantic bridge classes
    (`text-primary`, `text-secondary`, `bg-surface`, `bg-card`, `bg-body`,
    `border-border`, `rounded-md`, `shadow-sm`). Raw hex/oklch literals and
    arbitrary-value classes are prohibited outside a token definition.
@@
-5. **Typography and icons come from the theme.** theme-neutral's type scale and
-   Lucide icons. No font packages, no ad-hoc `font-family`.
+5. **Typography and icons come from the theme.** Use theme-neutral's grotesk
+   scale. Use the theme/platform mono role for receipt IDs, timestamps, source
+   stamps, and docket numbers. No font packages, no ad-hoc `font-family`.
+6. **One accent only.** Eucalyptus is the only brand accent. It may appear on
+   primary CTAs, active proof steps, mono kickers, link-hover states, and stamps.
+   Danger/warn/status colors stay functional Astryx semantics; Clay is imagery
+   punctuation only and never a CTA.
+
+## 2a. Palette and token authority
+
+The Bible palette supersedes neutral-default color guidance while still flowing
+through Astryx theme-neutral semantic tokens:
+
+| Role | Hex | Astryx binding |
+| --- | ---: | --- |
+| Ink | `#17201F` | `--color-text-primary`, seal, dark record surfaces |
+| Bone | `#F4EFE6` | `--color-background-body`, `--color-on-accent` |
+| Paper | `#FBF8F1` | `--color-background-surface`, `--color-background-card` |
+| Stone | `#D8CFC2` | `--color-border`, rules/table lines |
+| Mist | `#ECE6DC` | `--color-background-muted`, quiet chips/fills |
+| Slate | `#5B6360` | `--color-text-secondary` |
+| Eucalyptus | `#40614F` | `--color-accent`, `--color-text-accent`, `--color-icon-accent` |
+| Eucalyptus-dust | `#8AA396` | accent-muted tints, hairline accents, muted marks |
+| Clay | `#A85C3A` | rare warm punctuation in imagery/physical-stamp moments only |
+
+Public UI should read warm-but-strict: mostly Bone/Paper/Ink/Stone, with
+Eucalyptus at roughly five percent of the surface. No amber, purple, teal,
+gradient CTAs, glowing AI maps, glass, or colored proof side-stripes.
+
+Radius is strict: 4–6px for objects, cards, controls, chat composer, dialogs,
+and pages; pills only for true status/avatar shapes. Shadows are hairline/rim
+elevation, not decorative depth.
+
+Dust and Stone are not body-text colors. They are structural/support colors;
+Eucalyptus carries accent text when contrast matters.
+
+## 2b. Hero objects
+
+Four objects define the AE visual language and should be preferred over generic
+marketing panels:
+
+1. **Qualified-inquiry receipt / docket.** Stripe-grade object with receipt ID,
+   business, request, what AE sent, what happens next, timestamp, keep/copy
+   affordance, and the boundary line: "AE has not booked, charged, or confirmed."
+2. **Proof spine.** Published → source/freshness checked → inquiry sent →
+   business reply. Hairline connectors, mono timestamps, dot states; reached
+   steps use Eucalyptus by value/weight, not a second green.
+3. **Source/freshness stamps.** Mono marks beside facts such as `business
+   supplied · 12 Jun`, `last checked · 14 Jun`, and `owner reply required`.
+   Never use "Verified" without a named standard.
+4. **Comparison ledger.** Google-Flights-honest table of published facts across
+   providers: service area, published services, response window, receipt status,
+   and source note. AE never invents price or availability.
 
 ## 3. Surface conventions
@@
 | Public (`/`, `/registry`, `/$slug`, legal) | `AppShell` + `TopNav` (logo heading, nav items, single CTA). Content templates: `centered-hero`, `product-gallery`, `detail-page`. |
@@
 | Forms (`/$slug/inquiry`, `/claim`) | `FormLayout` + `Field` components; `form-two-column` / `contact-form` shapes; one primary action per viewport. |
 | Feedback | `Banner` (persistent), `useToast` (transient), `EmptyState`, `Skeleton`/`Spinner`. |
+
+Public surfaces must make at least one of the four hero objects visible when a
+handoff, proof, source, or provider comparison is the point of the screen. Avoid
+uniform three-column icon grids; use receipt, spine, stamp, or ledger structure
+instead.
@@
 ## 5. Product constraints (unchanged)
 
 - Boundary-honest copy everywhere: AE reads, compares, and routes inquiries; it
   does not book, charge, or dispatch. "Verified" only against a named standard.
 - `KNOWN/UNKNOWN/UNAVAILABLE/NEXT_STEP` never appear on human surfaces.
 - No internal architecture words in public copy (see AGENTS.md).
 - One primary action per viewport on conversion paths
   (card → `/$slug` → inquiry CTA → `/$slug/inquiry`).
 - Anti-slop still applies: no purple gradients, no 3-column icon grids, no
   centered-everything, no gradient CTAs, no glassmorphism.
+- Photography, when used, must be honest provider/place imagery with warm natural
+  grading toward Bone/Ink. It must never imply completed booking, payment,
+  dispatch, availability, or endorsement.
```

## Replacement intent by existing DESIGN.md area

| Existing area | Proposed change |
|---|---|
| Intro | Keep Astryx-era retirement of Daylight Register; add Fusion as current visual authority. |
| System | Keep component/utility/style stack exactly; add brand-token override mechanism in existing `globals.css` cascade. |
| Rules | Keep Astryx-first, Tailwind-glue, no bespoke CSS, no parallel systems; add one-accent Eucalyptus rule and mono-as-record role. |
| Surface conventions | Keep Astryx templates; require receipt/proof/stamp/ledger objects where they are the real product artifact. |
| Product constraints | Keep boundary-honesty unchanged; add imagery-specific no-overclaim rules. |

## Implementation guardrails for later application

- Apply the token map through existing Astryx variables only: `--color-background-*`, `--color-text-*`, `--color-border*`, `--color-accent*`, `--radius-*`, and `--shadow-*`.
- Do not name or export a new `AETheme`, `AeBrandProvider`, `AeButton`, `AeReceiptCard`, or other presentation namespace unless Astryx composition genuinely cannot satisfy a component and a swizzle is chosen.
- Do not move the app off `neutralTheme` unless the team explicitly chooses the stronger Astryx-native path: `defineTheme({ name: 'ae', extends: neutralTheme, tokens: ... })` plus built theme CSS. The CSS-variable override path is the minimal cutover.
- Preserve status semantics. Eucalyptus is the proof/handoff brand accent, not a generic success green.
- Preserve copy boundaries in every hero object: the receipt/docket is proof of routed inquiry, not proof of booking, payment, dispatch, quote, or availability.
