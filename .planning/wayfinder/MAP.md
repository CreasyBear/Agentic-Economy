<!-- wayfinder:map -->
# Give Agentic Economy a soul: brand system + in-app assets

Charting the route from "soulless Astryx-neutral scaffold" to a **real, emotive,
visceral brand system** whose assets live inside the application. Tracker mode:
local-markdown (no `docs/agents/issue-tracker.md` in this repo).

## Notes

**Domain.** AE is the trust-and-discovery layer for agentic commerce — the
trustworthy clerk at the threshold of a new marketplace. Soul is *warm-but-strict*.
Full grounding: [`.planning/brand/GROUNDING.md`](../brand/GROUNDING.md).

**Chosen direction (locked).** Fusion — **Proof-Ledger spine + Handoff motion +
Marketplace warmth**. Accent = **Eucalyptus #40614F** (AU-native). Definitive spec:
[`.planning/brand/BIBLE.md`](../brand/BIBLE.md).

**Strategic anchor.** AE = **"the receipt-backed handoff layer," not "AI that finds
local services."** North stars: Perplexity, Stripe, Google Flights, Companies House.
Anti-refs: Angi/hipages/Bark leads, Booking urgency, AI source-washing.
[`REFERENCES.md`](../brand/REFERENCES.md).

**Standing preferences.** Astryx (`@astryxdesign/core` + `theme-neutral`, light) is the
build substrate; brand layers on via a theme override (`--color-accent:#40614F`), no
bespoke systems. Anti-slop + boundary-honesty are non-negotiable. `DESIGN.md` is the
authority and will be updated from the draft. Generation via gpt-5.5 subagents.

## Decisions so far

- [Imagine three brand territories](tickets/001-imagine-three-brand-territories.md) — A/B/C
  generated (15 assets, `explore/`); A most ownable, B best motion, C best warmth/weak photos.
- [Reference scan of real services](tickets/008-reference-scan-real-services.md) — north
  stars + anti-refs + "receipt-backed handoff layer" insight. [`REFERENCES.md`](../brand/REFERENCES.md).
- Raw baseline control (`explore/z-raw-baseline/`) — proved skills+grounding are
  load-bearing (unguided → reviews/amber/AI-slop); donated photographic warmth + deep-teal.
- [Choose brand territory](tickets/002-choose-brand-territory.md) — **Fusion + Eucalyptus** chosen.
- [Lock the design bible](tickets/003-lock-design-bible.md) — [`BIBLE.md`](../brand/BIBLE.md) +
  2 validated locked boards (`brand/bible/`): AE seal, eucalyptus, mono-record, 4 hero objects.
- [Map to Astryx + DESIGN.md](tickets/004-map-bible-to-astryx-and-designmd.md) — token override
  plan + DESIGN draft; AA contrast passes ([`ASTRYX-TOKEN-MAP.md`](../brand/ASTRYX-TOKEN-MAP.md),
  [`DESIGN-UPDATE-DRAFT.md`](../brand/DESIGN-UPDATE-DRAFT.md)).

## Frontier (open)

- [Produce the production asset system](tickets/005-produce-production-asset-system.md) — logo
  SVG set, favicon/OG, honest imagery, icon set, hero-object component refs.
- [Redesign the first scenes](tickets/006-redesign-first-scenes.md) — home, inquiry-receipt,
  storefront, answer journey (blocked by 005).
- [Wire assets into the app + verify](tickets/007-wire-assets-into-app.md) — apply DESIGN.md +
  token overrides + assets to source (blocked by 006).

## Fog

- Honest-photography sourcing (AI placeholder vs real/licensed) + treatment rules.
- Motion / interaction implementation of the motifs (proof spine, handoff).
- Per-surface rollout order; marketing-site vs app split; dark-mode question.
- How the brand shows on machine surfaces (agent JSON, llms.txt) without warmth loss.
