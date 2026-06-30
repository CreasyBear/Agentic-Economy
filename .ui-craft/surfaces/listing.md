# Surface: Business Citation Page (/$slug)

Governed by this file. Visual authority: `DESIGN.md`. IA authority: [chat.md](./chat.md).

## Role (resolved)

**Citation artifact** — stable, shareable, SEO-indexed business page that the chat links to. Not the primary journey center. Not an audit log. Not a default map surface.

Generative composition (maps, comparisons, query-shaped layouts) happens **in AeChat**, not here.

## Composition

```text
┌────────────────────────────────────────────────────────────┐
│ header · back to chat optional ("Ask another")             │
├────────────────────────────────────────────────────────────┤
│ IDENTITY  Name (Fraunces) · category · suburb              │
│           status pill · plain trust row                    │
├────────────────────────────────────────────────────────────┤
│ STICKY RAIL  [amber primary CTA: inquiry or contact]       │
│              AeProtectedByAe (one line)                    │
│              Get as agent JSON                             │
├────────────────────────────────────────────────────────────┤
│ Services — chips                                           │
│ Service area — TEXT ONLY (suburbs, radius prose)           │
│ Office — Google Maps embed IF officeAddress exists         │
│ About — summaries, postcode                                │
│ Not offered — plain muted line (not strikethrough ledger)  │
│ Provenance — "Details supplied by the business · date"     │
│ Correct or remove — secondary link                         │
└────────────────────────────────────────────────────────────┘
```

## Key decisions (resolved 2026-06-30)

| Question | Decision |
| --- | --- |
| Service-area map on every listing? | **No.** Text-first service area. Maps are generative in chat when query warrants. |
| Office map? | **Google Maps Embed** only when catalog publishes `officeAddress` (schema PR). Never fake map from suburb alone. |
| Audit-log layout? | **Remove** from public path: `AeAnswerRecordCard`, readback bands, dark command panels. |
| Epistemic labels? | **Never** on human surface. Use plain "What to do now", "Not offered", "Needs confirmation". |
| Primary CTA | Sticky amber — inquiry or honest contact instructions per `buildPublicInquiryAffordance()`. |
| Photos | Muted empty until schema adds images; optional hand-drawn category mark. |

## States

| State | Behavior |
| --- | --- |
| Published | Full artifact layout |
| Not found | `AeEmptyState` + claim path |
| Inquiry unavailable | Plain disclosure; no disabled fake booking button |

## Forbidden

- Mandatory service-area map
- Dark command-center panels on public path
- "Next step" / `NEXT_STEP` as visible label
- Internal jargon (readback, source-owned, shoppers)
- Status badge walls from capability metadata

## Acceptance bar

- [ ] Reads as Google-Maps-**clean** info page, not audit log
- [ ] No map iframe unless `officeAddress` present
- [ ] Sticky CTA + Protected-by-AE + agent JSON
- [ ] JSON-LD / SEO loader unchanged
- [ ] Copy contract green
