# Surface: Public Landing (/)

## Composition

Single-viewport query-first hero + trust line + footer. No scroll required on desktop or mobile. Visuals follow `DESIGN.md` Astryx Era: `AppShell` + `TopNav`, centered-hero composition, `ChatComposer`-style query input, and theme-neutral surfaces.

## Key decisions

- Hero headline: "What do you need done?" or a route-specific equivalent that keeps query intent first.
- Lede states the source-verified, human-handoff boundary in plain language.
- Primary action: ask/submit the query. Secondary: browse services or list your business, visually subordinate.
- Trust signals: published details, owner correction path, human handoff, agent-readable data.
- One primary action per viewport.

## Tokens and components used

- Astryx `AppShell` + `TopNav` for chrome.
- Astryx centered-hero or form template for the query composition.
- Astryx theme-neutral text/surface/border/focus roles.
- Tailwind 4 utilities only for layout, viewport sizing, spacing, and responsive behavior.
