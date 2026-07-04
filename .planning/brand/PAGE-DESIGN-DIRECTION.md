# AE — Page Design Direction (v1)

Authored by the **Opus 4.8 planner** applying `skill://design-taste-frontend` +
`skill://make-interfaces-feel-better` + `skill://ui-craft`, grounded in
[`BIBLE.md`](./BIBLE.md) + the Astryx **centered-hero** reference
([`ref-centered-hero.png`](./ref-centered-hero.png)). **Sonnet 5 executors build EXACTLY
to this.** Substrate: Astryx (`@astryxdesign/core`, theme-neutral **light**) + Tailwind4
glue. Eucalyptus `#40614F` accent token is already live in `globals.css`.

## 0. Design read + dials
- **Read:** trust-first commerce/registry for people + AI assistants seeking real local
  services; warm-but-strict editorial-utility language; Astryx + eucalyptus + mono-record.
- **Dials:** `DESIGN_VARIANCE 5` (calm asymmetry — not centered-everything, not chaos) ·
  `MOTION_INTENSITY 3` (restrained, motivated: only the proof-fill + handoff beats) ·
  `VISUAL_DENSITY 4` (calm but substantive). Trust-first caps motion/variance; the SOUL
  comes from the hero **objects** + type + eucalyptus, never decoration.

## 1. Global rules (every surface)
- **Astryx-first:** compose `Grid/VStack/HStack/Card/Text/Badge/Button/Table` etc. NO new
  bespoke `Ae*`/shadcn/radix/cva/handwritten CSS. NO hardcoded hex — tokens only
  (`text-primary/secondary`, `bg-body/surface/card`, `border-border`,
  `text-accent/bg-accent/border-accent`).
- **Type:** grotesk display + body; **MONO for records** (IDs, timestamps, stamps).
  `text-wrap: balance` on headings, `pretty` on body; `tabular-nums` on any dynamic number.
- **Color lock:** eucalyptus is the ONLY accent, ~5% of surface (primary CTA, active proof
  node, the single kicker, link-hover, stamps). "Received/live" state = **solid** node
  (value), not a second hue. No amber/purple/teal/gradient.
- **Shape lock:** radii 4-6px; concentric on nested (outer = inner + padding). Shadows over
  borders where elevation is real (warm-tinted, never pure black); hairline Stone borders else.
- **Motion (motivated only):** two AE beats — (a) the **proof spine fills** step-by-step,
  final node resolves to solid eucalyptus on reply; (b) the **receipt/docket stamps in**.
  Enter = split + stagger ~100ms; exits subtle; `scale(0.96)` on press; honor
  `prefers-reduced-motion`; never `transition: all`.
- **Boundary-honest copy:** no booking/pay/dispatch/availability-confirmation; "Verified"
  only vs a named standard; no `KNOWN/UNKNOWN/UNAVAILABLE/NEXT_STEP` labels; no internal
  architecture words; no stars/fake reviews.
- **ZERO em-dash** (`—`/`–`) anywhere — use hyphen/period/comma.
- **Imagery:** NO stock imagery anywhere. On **HOME, no photographic hero at all** — the
  vibe = the brand OBJECT as the visual. Honest, specific, non-stock imagery is allowed
  only on storefront/category, never implying a completed transaction.
- **a11y:** WCAG AA (verified: Ink/Bone 14.5:1, Bone-on-Eucalyptus 6.0:1, Slate/Bone 5.4:1;
  dust/stone = borders/fills only). 40×40 hit areas; labels above inputs, error below,
  never placeholder-as-label. Light theme locked — sections never invert.

## 2. HOME — `src/routes/index.tsx`, `AeChatWelcome.tsx`, `AePublicShell.tsx`
**Job:** feel like the honest beginning of a marketplace + get the person to ask.
**Beat:** "a place of record — I can trust what I see and take one honest step."
**NO STOCK. The hero visual = AE's own live brand object (comparison-ledger / receipt).**

Sections (centered-hero language, then diversified — ≥4 layout families, ≤1 eyebrow / 3 sections):
1. **HERO** (centered-hero, contained, fits viewport):
   - kicker (mono, eucalyptus — the ONE eyebrow): `The receipt-backed handoff layer`
   - headline (grotesk, ≤2 lines, balance): **The proof desk for agentic commerce.**
   - description (≤20 words): `Ask for a real local service. Compare the facts each business publishes, and send one qualified inquiry for owner review.`
   - **the ASK INPUT is the primary action** (eucalyptus focus ring) + a ghost link `Browse the registry`.
   - the centered-hero "wide slot" = a **live comparison-ledger artifact** (Harbour Electrical / Meadow Cleaning / Banksia Plumbing; columns service area / published services / response window / source note) on Paper, hairline rules, mono stamps, one eucalyptus `receipt issued when sent` node. Subtle Bone texture behind. NOT a photo.
   - quiet boundary line (slate/mono): `AE does not book, charge, dispatch, or confirm timing.`
2. **PROOF SPINE** (full-width, new family): `Published -> Source checked -> Inquiry sent -> Business reply`, hairline connectors, mono dates, final node eucalyptus. Framing line: `A record that travels, then returns.` NOT 3 equal cards.
3. **FOR BUSINESSES** (asymmetric split, new family): `Be listed as a business of record` + receipt/stamp motif + ghost CTA `List your business`.
4. **CLOSING CTA** (mini, confident, center): short headline + the single primary action.
5. **Footer** (AePublicShell): seal + wordmark + dated source/receipt boundary copy.

**Hierarchy:** focal point = headline + ask input; the ledger artifact is the supporting proof visual; big display vs mono-record scale contrast.
**Motion:** hero split/staggered enter; ledger rows stagger; proof spine fills on scroll-in. Reduced-motion static.
**Critique of current reskin:** it became a bare search box + a flat placeholder ledger with no centered-hero hierarchy/vibe; fix by making the ask the primary action inside a centered-hero and the ledger the brand-object visual.
**BUILD RECIPE (Sonnet):** (1) AePublicShell: `<img src="/brand/logo/ae-seal.svg">` + live grotesk wordmark, header ≤72px one line; footer boundary copy. (2) index hero: Astryx `VStack` centered — `Text` kicker(mono/accent), `Text` display(balance), `Text` desc, the AeChatWelcome ask input as primary + ghost link; below a `Card` w/ the comparison-ledger (`Grid`/`Table` + `Text` + `Badge` + mono). (3) proof-spine section (`HStack`/`Grid`, hairline connectors, eucalyptus final node). (4) for-businesses split + mini closing CTA. (5) tabular-nums, balance/pretty, `scale(0.96)`, reduced-motion.

## 3. STOREFRONT — `src/components/ae/listing/AeProviderListingPage.tsx`
**Job:** make the provider feel PROUD to be listed; confidence via published facts + provenance. **Beat:** "this business is real and represented honestly."
Sections: (1) **PRIDE HEADER** (asymmetric, contained): provider name (large grotesk), category + location, honest response cue Badge (only if published), a seal-backed `Listed on Agentic Economy` mark. No stars. Typographic + seal (no stock; a specific non-stock image may sit as a calm side asset if genuinely available). (2) **PROOF SPINE** for this provider. (3) **PUBLISHED FACTS** (single-provider ledger): service area / published services / hours / office / about — Astryx `Grid`, rows **grouped into 2-3 clusters** with sparse dividers (never border-t+border-b every row), mono for data. (4) **SOURCE/FRESHNESS stamps** beside facts (quiet mono). (5) **ACTION rail:** primary `Start an inquiry` (eucalyptus) + warmed assistant affordance labelled `Assistant-ready facts` (keep AeAgentJsonAffordance behavior).
**Copy/boundary:** rework `owner reply required` -> `owner confirms on reply` (passes p2-inquiry-overclaim, stays honest). No "Verified".
**Critique current:** flat hierarchy, no pride header, stamps tripped the copy scan.

## 4. INQUIRY + RECEIPT — `src/routes/$slug.inquiry.tsx`, `src/components/ae/inquiries/*`
**Job:** the conversion; the receipt/docket is the emotional peak — a real, keep-able record. **Beat:** "I did one honest thing and I have proof."
Sections: (1) **FORM** (pre-submit): calm single column (max ~560px), labels above / error below, eucalyptus focus ring, one primary `Send inquiry`, boundary line under it: `AE sends this for owner review. The business replies with timing, quote, and availability. AE does not confirm them.` (2) **RECEIPT** (post-submit) = the hero object (per `components/inquiry-receipt.html`): Paper docket, mono receipt ID, provider name (grotesk), "What AE sent", "What happens next", SOURCE NOTE (mono stamps), boundary box `AE has not booked, charged, or confirmed.`, `Keep receipt` + `Copy receipt`. Concentric radius, hairline, restrained shadow; the docket **stamps in** on success; a proof spine fills to `Inquiry sent`.
**Hierarchy:** pre-submit = the form; post-submit = the docket is the whole focus.
**Critique current:** mostly done; ensure the docket is the focal peak (concentric radius, stamp-in motion) and the pre-submit form is calm.

## 5. ANSWER / CHAT JOURNEY — `src/components/ae/artifacts/AeGenerativeAnswer.tsx`
**Job:** replace generic "Process" cards with AE's proof-spine handoff journey; honest reasoning + handoff. **Beat:** "the assistant read real published facts and handed me off honestly."
Layout: **answer-first** (a concise honest answer), then the **proof-spine journey** (`Understand need -> Check listings -> Compare published facts -> Hand off / next step`) as the branded motif (not step cards); comparison uses the mini comparison-ledger; **sources/freshness sit beside claims** (Perplexity-style); boundary line preserved (business confirms timing/quote/availability).
**Hierarchy:** the answer + the one next step; the spine is supporting.
**Motion:** spine fills as the answer settles; reduced-motion static.
**Critique current:** ensure it reads answer-first with honest sources beside claims, not a decorative spine; no "Process" label; no stars.

## 6. Executor protocol (Sonnet 5)
- One executor per surface; read THIS doc + the surface's current file(s) + the relevant
  `assets/components/*.html` ref + `BIBLE.md`; build to spec.
- Astryx primitives only; no new bespoke components/CSS; no hardcoded hex; boundary-honest;
  **zero em-dash**. Rework `owner reply required` to pass p2-inquiry-overclaim.
- Coordinate on shared files (AePublicShell) via IRC. Self-review; leave full build/scan/QA
  to the verify gate.
