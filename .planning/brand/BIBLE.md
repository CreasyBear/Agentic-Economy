# Agentic Economy — Design Bible (v1, locked)

Locked direction from wayfinder ticket 002 (Fusion) + ticket 003. All renders and
production assets conform to this. Supersedes the three exploration bibles under
`explore/`. Authority chain: `PRODUCT.md` → this bible → `DESIGN.md` update (ticket 004).

## 0. Direction

**AE is the receipt-backed handoff layer for agentic commerce — not "AI that finds
local services."** Sourced business facts become one bounded, auditable inquiry.

Soul = **Fusion**: a **Proof-Ledger spine** (evidence/receipt is the hero object),
carried by **Handoff motion** (the inquiry travels out, a reply returns), warmed by
**Real-Marketplace** provider pride + honest photography. Warm-but-strict: browsable
and proud, but every attractive surface exposes its limits.

North stars: Perplexity (claims beside sources), Stripe (receipt objects), Google
Flights (honest comparison), Companies House (dated record gravity). Never: lead-selling
(Angi/hipages/Bark), urgency theater (Booking), source-washing.

## 1. Logo system

- **Primary mark — the AE seal.** An octagonal seal/monogram where A and E share a
  stem and the crossbar is a **proof line** carried through negative space — a mark of
  record (seal + ledger).
- **Motion variant.** The proof line extends past the seal into a **handoff arc** for
  hero/animated contexts — the record that travels.
- **Wordmark.** "Agentic Economy" in the grotesk, tight tracking, sentence case.
- **Lockups.** Seal-only (app icon/favicon); seal + wordmark (horizontal); stacked (rare).
- **App icon.** Ink seal on Bone, or Bone seal on Ink; small keyline; no bubble radius
  beyond the icon container.
- **Clear space** ≥ the seal crossbar height. Min: seal 24px, wordmark 96px.
- Do: keep the proof line unbroken. Don't: wifi/signal marks, gradients, drop shadows.

## 2. Palette (AU-native; hex is source of truth, oklch finalized for a11y in ticket 004)

| Token | Hex | Role → Astryx |
|---|---|---|
| Ink | `#17201F` | primary text, seal, dark surfaces → `text-primary` |
| Bone | `#F4EFE6` | page background → `bg-body` |
| Paper | `#FBF8F1` | raised surfaces / cards → `bg-surface` / `bg-card` |
| Stone | `#D8CFC2` | hairline borders, rules, table lines → `border-border` |
| Mist | `#ECE6DC` | muted fills, chips |
| Slate | `#5B6360` | secondary text → `text-secondary` |
| **Eucalyptus** | `#40614F` | **the single brand accent** — CTA, active proof-step, kicker, link-hover, stamps |
| Eucalyptus-dust | `#8AA396` | accent tints, hairline accents, muted marks |
| Clay | `#A85C3A` | **rare** warm punctuation only (imagery/physical stamp, <1%); never a CTA |

Rules: eucalyptus does the accent work (~5% of surface); express "live / reply received"
by **value/weight** (solid eucalyptus node) vs "pending" (hairline Stone) — **no second
green**. Danger/warn = Astryx theme semantic (separate red-orange), never eucalyptus.
No amber (retired Daylight), no purple, no teal, no gradients. Eucalyptus + Bone + Clay
= a bush-landscape palette that reads Australian without being literal.

## 3. Typography

- **Display / headline:** Astryx theme grotesk (system-mapped), tight tracking, medium.
  Short + declarative ("The proof desk for agentic commerce.").
- **Body:** same grotesk, regular, ~66ch measure.
- **Data / mono:** monospace for IDs, timestamps, receipt numbers, stamps, source marks
  (`AE-PL-2025-0612-7843`, `business supplied · 12 Jun`). Mono-as-record is a signature —
  it makes facts feel like a ledger. (Type role, not a new font package.)
- Hierarchy: kicker (mono, eucalyptus, tiny caps) → headline (grotesk) → body → data (mono).
- Don't: serif/Fraunces (retired), multiple display fonts, tiny decorative type.

## 4. The hero objects (the soul made tangible — all boundary-honest by construction)

1. **Qualified-inquiry receipt / docket** (Stripe-grade). Receipt ID (mono), business,
   the request, "what AE sent", "what happens next" (business replies with timing/quote/
   availability), a **boundary line** ("AE has not booked, charged, or confirmed."),
   timestamp, "Keep/Copy receipt". This IS the conversion — the most important object.
2. **Proof spine.** Chain: Published → Source/Freshness checked → Inquiry sent → Business
   reply. Hairline connectors, mono timestamps, dot states; reached step = eucalyptus, a
   received reply = solid eucalyptus node. No thick colored side-stripes.
3. **Source / freshness stamps.** Mono marks beside facts: `business supplied · 12 Jun`,
   `last checked · 14 Jun`, `owner reply required`. Never "Verified" without a named
   standard; never star ratings.
4. **Comparison ledger.** Google-Flights-honest table of *published facts* across providers
   (service area, published services, response window, "receipt issued when sent", source
   note). Explainable; AE never invents price/availability.

## 5. Imagery (honest photography spec — fixes weak renders + review temptation)

- Warm editorial photography of real trades/providers/places (electrician at a board,
  cleaner in a bright room, cafe counter, a real street). Human, proud, specific.
- Treatment: natural warm grade toward Bone/Ink; soft not glossy; consistent crops;
  subtle grain OK.
- **Forbidden in imagery:** star ratings, "verified" badges, booking/payment/dispatch
  confirmation, amber, glowing AI-network maps, stock "AI" clichés, real brand logos.
- Structured objects carry *trust*; photography carries *warmth/pride*. A photo must
  never imply a completed transaction. Placeholder businesses only (Harbour Electrical,
  Meadow Cleaning).

## 6. Iconography

- Custom, restrained, single ~1.5px stroke, rounded joins. Category icons (electrical,
  cleaning, plumbing, cafe…) + action icons (compare, send inquiry, source, receipt,
  reply). Slightly more character than Lucide defaults; consistent.
- No wifi/signal "connected" cliché, no generic dev-tool set, no filled+outline mixing.

## 7. Motion (implied)

- The receipt/docket **travels** a routed hairline (handoff); a reply **returns**.
- The proof spine **fills** step by step; the final node resolves to solid eucalyptus on reply.
- Docket **stamps in**; staggered list reveal; calm and quick, never bouncy.
- Motion clarifies the handoff; it never decorates.

## 8. Astryx binding (summary; full token map in ticket 004)

Build on `@astryxdesign/core` + `theme-neutral` light. Map Ink/Bone/Paper/Stone/Slate to
the semantic tokens above; radius 4–6px; hairline shadows. Add ONE accent token =
Eucalyptus (+ dust tint). Mono is a type role (theme/system mono), not a font package.
No bespoke `Ae*` presentation comps, no shadcn/radix/cva, no new handwritten CSS files.

## 9. Guardrails (binding)

Anti-slop: no purple/AI gradients, 3-col icon grids, centered-everything, bubble radius
everywhere, gradient CTAs, glass, blobs. Boundary-honest copy: no booking/payment/dispatch/
availability confirmation; "Verified" only vs a named standard; never render
KNOWN/UNKNOWN/UNAVAILABLE/NEXT_STEP as human labels; no internal architecture words in
public copy.

## 10. Asset manifest (ticket 005 produces)

Logo set (seal, wordmark, lockups, app icon, favicon, monochrome) · OG/social · home hero
imagery · category imagery (honest photography) · the four hero-object component references
· empty/loading states · icon set · source/freshness stamp kit.
