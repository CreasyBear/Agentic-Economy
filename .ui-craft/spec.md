# UI Craft — Surface Specs

Index of per-surface composition specs. Detailed specs live in `surfaces/`. This file keeps the ui-craft `## Surface:` convention; the heavy detail moved out of here.

## Surface: public landing discovery surface

- Detail: [surfaces/landing-query.md](surfaces/landing-query.md)
- Composition: query box → generative answer. Daylight Commerce Routing visuals, Google-Maps-clean provider cards, hand-drawn hero.
- One conversion action: submit a query.
- Acceptance bar: see [surfaces/landing-query.md](surfaces/landing-query.md) "Acceptance bar".

## Surface: provider page (/[slug])

- Spec pending — Daylight Commerce Routing refactor pass.
- Until then: a Google-Maps-clean info surface. Real services, real service area, real hours, one amber next action. Plain language only.

## Surface: registry (/registry)

- Spec pending — Daylight Commerce Routing refactor pass.
- Until then: a plain, agentic.market-style browse list (`Provider | Services | Service area | Status`). Plain language only.

## Authority

- Visuals: `DESIGN.md` (Daylight Commerce Routing, §10–§17). Principles: `.ui-craft/brief.md`.
- When a surface spec and `DESIGN.md` disagree, `DESIGN.md` wins.
- Human surfaces use plain language. Internal status vocabulary belongs only in the JSON API, `llms.txt`, the "Get as agent JSON" payload, and owner/admin surfaces — never on a human page.
