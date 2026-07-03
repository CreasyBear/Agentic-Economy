# UI Craft — Surface Specs

Index of active per-surface composition specs. Detailed specs live in `surfaces/`. This file keeps the UI Craft `## Surface:` convention; route detail belongs in the surface files.

## Surface: public landing discovery surface

- Detail: [surfaces/landing-query.md](surfaces/landing-query.md)
- Composition: Astryx public shell → query composer → generative answer. Provider cards, comparison tables, optional maps, and recovery prompts follow the answer-contract budgets.
- One conversion action: submit a query.
- Acceptance bar: see [surfaces/landing-query.md](surfaces/landing-query.md) "Acceptance bar".

## Surface: provider page (/[slug])

- Detail: [surfaces/listing.md](surfaces/listing.md)
- Composition: Astryx detail-page/product-gallery shape. Real services, real service area, real hours when known, one primary inquiry/contact action, and plain language only.

## Surface: registry (/registry)

- Detail: [surfaces/registry.md](surfaces/registry.md)
- Composition: Astryx search/list or table pattern for browsing providers (`Provider | Services | Service area | Status`). Search leads; filters are secondary.

## Surface: chat and answer threads

- Detail: [surfaces/chat.md](surfaces/chat.md)
- Composition: Astryx `Chat*` family with AE answer-contract budgets, frozen evidence per turn, and replay-stable layout profiles.

## Surface: operator routes

- Detail: [surfaces/operator.md](surfaces/operator.md)
- Composition: Astryx `AppShell` + `SideNav`, settings/detail/table patterns, and readback-first product copy.

## Authority

- Visuals: `DESIGN.md` (Astryx Era). Principles: `.ui-craft/brief.md`.
- When a surface spec and `DESIGN.md` disagree on visuals, `DESIGN.md` wins.
- Human surfaces use plain language. Internal status vocabulary belongs only in the JSON API, `llms.txt`, the "Get as agent JSON" payload, and owner/admin surfaces — never on a human page.
- Product boundary remains unchanged: AE reads, compares, and routes qualified inquiries; it does not book, charge, dispatch, or autonomously fulfill the work.
