# AE Brand — Staged Production Asset Library (v1)

Everything here is **staged** under `.planning/brand/assets/` — **nothing is wired into
app source yet** (per decision: stage first). Conforms to
[`../BIBLE.md`](../BIBLE.md). All boundary-honest. Accent Eucalyptus `#40614F`.

## Logo / identity (SVG, vector, `currentColor`)
- `logo/ae-seal.svg` — primary mark (octagon, A/E shared stem, unbroken proof line)
- `logo/ae-app-icon.svg` — Ink seal on Bone rounded square (maskable padding)
- `logo/ae-favicon.svg` — simplified seal, legible at 16px
- `logo/ae-lockup.svg` — seal + "Agentic Economy" (wordmark is a live `<text>` system-grotesk
  stack; swap to the chosen brand font at wire-in)

Verified: rendered crisp at 16–128px on Bone + Ink → `assets/preview.png`; all SVG XML parses.

## Icons (SVG, 24px grid, ~1.5px stroke, `currentColor`, custom — no Lucide clones / no wifi cliché)
`compare` · `send-inquiry` · `source` · `receipt` · `reply` · `freshness-clock` ·
`electrical` · `cleaning` · `plumbing` · `cafe`

## Source / freshness stamps (SVG, eucalyptus)
`business-supplied` · `last-checked` · `owner-reply-required` · `receipt-issued` —
boundary-honest (no "Verified", no stars). Best on Bone/Paper (low contrast on Ink).

## Imagery (WEBP) — ⚠ PLACEHOLDER / BRAND IMAGERY
**AI-generated brand/placeholder imagery. NOT real providers.** No real business names,
logos, or ratings are present. Replace with licensed/real photography before any production
claim of authenticity. Warm natural-daylight treatment; recurring eucalyptus motif.
- `imagery/hero-01.webp`, `imagery/hero-02.webp` — home-hero options
- `imagery/cat-electrical.webp`, `cat-cleaning.webp`, `cat-plumbing.webp`, `cat-cafe.webp`,
  `cat-handyman.webp` — category tiles (consistent treatment)
- `imagery/og.webp` — Open Graph mood (final crop to 1200×630 + wordmark overlay at wire-in)
- `imagery/empty-state.webp` — calm empty/loading visual

## Hero-object component references (static HTML, token-driven — design refs, not app code)
`components/inquiry-receipt.html` · `proof-spine.html` · `source-stamps.html` ·
`comparison-ledger.html` · `index.html`. W3C-valid (0 errors).
Astryx port map: Card / Grid / Text / Badge / Button / Table.
**Port note:** `comparison-ledger` needs a responsive fix (last column clips <~1100px).

## Provenance
Bible: [`../BIBLE.md`](../BIBLE.md) · Token map: [`../ASTRYX-TOKEN-MAP.md`](../ASTRYX-TOKEN-MAP.md)
· DESIGN update draft: [`../DESIGN-UPDATE-DRAFT.md`](../DESIGN-UPDATE-DRAFT.md) · Locked boards:
`../bible/00-LOCKED-*.webp`.

## Next (awaiting go-ahead — no source edits yet)
Wire-in (tickets 006 → 007): apply the DESIGN.md update, add the eucalyptus token override to
`src/styles/globals.css`, place logo/favicon in the app, and reskin the first scenes on Astryx.
