# Surface: Business Citation Page (/$slug)

Governed by this file. Visual authority: `DESIGN.md` (Astryx Era). IA authority: [chat.md](./chat.md).

## Role (resolved)

**Citation artifact** — stable, shareable, SEO-indexed business page that the chat links to. Not the primary journey center. Not an audit log. Not a default map surface.

Generative composition (maps, comparisons, query-shaped layouts) happens **in chat**, not here.

## Composition

```text
┌────────────────────────────────────────────────────────────┐
│ Astryx AppShell + TopNav · back to chat optional           │
├────────────────────────────────────────────────────────────┤
│ IDENTITY  Name · category · suburb                         │
│           status text/badge · plain trust row              │
├────────────────────────────────────────────────────────────┤
│ STICKY RAIL  [primary CTA: inquiry or contact]             │
│              Protected-by-AE trust line                    │
│              Get as agent JSON                             │
├────────────────────────────────────────────────────────────┤
│ Services — chips                                           │
│ Service area — TEXT ONLY (suburbs, radius prose)           │
│ Office — Google Maps embed IF officeAddress exists         │
│ About — summaries, postcode                                │
│ Not offered — plain muted line                             │
│ Provenance — "Details supplied by the business · date"     │
│ Correct or remove — secondary link                         │
└────────────────────────────────────────────────────────────┘
```

Use Astryx detail-page/product-gallery/card/citation/form primitives for presentation. Tailwind may only arrange layout, sticky rail behavior, spacing, and responsive stacking.

## Key decisions (resolved 2026-06-30)

| Question | Decision |
| --- | --- |
| Service-area map on every listing? | **No.** Text-first service area. Maps are generative in chat when query warrants. |
| Office map? | **Google Maps Embed** only when catalog publishes `officeAddress`. Never fake map from suburb alone. |
| Audit-log layout? | **Remove** from public path: readback bands, command panels, and status-wall presentation. |
| Epistemic labels? | **Never** on human surface. Use plain "What to do now", "Not offered", "Needs confirmation". |
| Primary CTA | Sticky primary action — inquiry or honest contact instructions per `buildPublicInquiryAffordance()`. |
| Photos/evidence | Render only real catalog evidence. Empty/missing media stays quiet. |

## States

| State | Behavior |
| --- | --- |
| Published | Full citation/detail layout |
| Not found | Astryx `EmptyState` + claim path |
| Inquiry unavailable | Plain disclosure; no disabled fake booking button |

## Forbidden

- Mandatory service-area map
- Dark command-center panels on public path
- "Next step" / `NEXT_STEP` as visible label
- Internal jargon (readback, source-owned, shoppers)
- Status badge walls from capability metadata
- Retired route-local styling or custom presentation components

## Acceptance bar

- [ ] Reads as a clean local-business info page, not audit log
- [ ] No map iframe unless `officeAddress` present
- [ ] Sticky CTA + Protected-by-AE + agent JSON
- [ ] JSON-LD / SEO loader unchanged
- [ ] Copy contract green
- [ ] Visuals trace to Astryx/theme-neutral and Tailwind layout glue from `DESIGN.md`
