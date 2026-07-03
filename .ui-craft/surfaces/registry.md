# Surface: Registry (/registry)

## Composition

Search-first results page with comparable provider cards or a compact table/list view. Visuals follow `DESIGN.md` Astryx Era: `AppShell` + `TopNav`, Astryx search/form controls, cards or `Table`, `Badge`/`StatusDot`, and citations where relevant.

## Key decisions

- Search bar is the dominant element.
- Cards/list rows use stable dimensions and one clear CTA to `/$slug`.
- Filters are secondary and collapsible on mobile.
- Provider facts remain plain: name, services, service area, status/availability text when known, and agent-readable affordance when useful.
- `/registry` is a secondary browse path; it must not compete with the query-first home surface.

## Product constraints

- No booking/payment/dispatch implication.
- No invented ratings, response times, freshness, or availability.
- No internal status vocabulary on human-facing rows.
- One primary action per result card/row.

## Visual constraints

- Astryx components/templates own presentation.
- Tailwind 4 utilities provide layout, spacing, responsive columns, sticky filter behavior, and truncation only.
- No retired pre-Astryx styling, route-local visual system, custom card system, or component-library fork.
