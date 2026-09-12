# Market design direction: Airbnb, not a trading desk

Purpose: a design brief for `/market` and `/tools/$toolRef`, answering the
owner's direction that aecon.ai should feel like Airbnb - "here's what
people are using and what they're using it for; this is the experience you
could be having" - with no tickers or movers, and agents (MCP, CLI, HTTP)
as the primary users though the look and feel is human. Builds on
`docs/architecture/market-feel-audit.md` and `DESIGN.md`. No code changed.

Assumptions, answering the design-consultation brief in place of an
interactive session: Tool = listing, Provider = host, Customer/Agent =
guest; audience is a human deciding whether to let an agent spend, plus the
agent calling the same facts over MCP/CLI/HTTP; the memorable thing is
"this is a real place people already use their agents to buy things, not a
dashboard".

## (a) Design brief

**Principles**
1. Show usage, not markets. Lead with what Tools are being used for, not
   price movement or volume. A listing earns its place by what it does and
   who trusts it, never by a chart.
2. One decision per screen. `/market` is for finding a Tool; the Quote
   screen (out of scope here) is for buying it. No comparison table or
   analytics leaks into the finding screen.
3. Warm, not clinical. Chalk and forest read as a considered place, not a
   spreadsheet. Editorial imagery (human technology, nature, architecture)
   carries mood; screenshots and glyph-charts never do.
4. Agents read the same facts. Price, readiness and provenance shown to a
   human are the same fields the MCP tool, CLI command and HTTP route
   return - the human view explains more, never a simpler model
   (`DESIGN.md` "Machine parity"). The agent flow is already documented in
   `plugins/agentic-economy/skills/use-agentic-economy/SKILL.md`: discover,
   connect, quote, call, recover. The human pages are that same flow,
   dressed for a person deciding whether to let it happen.

**Tone**: plain, confident, sentence case, no hype adjectives, in
Tool/Call/Quote/Provider vocabulary, never "product" or "vendor."
**Hierarchy**: identity and provider first, price second, trust evidence
third, contract last and collapsed. Never open on a number.

**Motion**: acknowledges interaction only - existing 150/220/300ms ladder,
the 260ms hover ink wash. No page-load choreography, shimmer, or count-up
numbers. Respects `prefers-reduced-motion`.

**Imagery**: one editorial image per top-level category shelf at most,
never a stock screenshot of a Tool's own API response. Provider avatars are
plain initials or a submitted mark, not logos treated as trust badges.

## (b) Four references

1. **Airbnb Experiences** - borrow: listing card grammar (title, host,
   one-line what-it-does, price-first, one trust line) and a category rail
   entry point instead of a filter form. Refuse: star-rating aggregates as
   decoration - "Rating" stays tied to Qualified Use, not a cosmetic
   5-star average.
2. **App Store Today tab** - borrow: editorial curation as the landing
   view ("what people are using this week") instead of an analytics tab,
   one big story plus a shelf of smaller ones. Refuse: the swipeable
   full-bleed carousel and auto-advancing hero - the canvas stays quiet.
3. **Stripe API docs** - borrow: the detail page's "what this call does,
   what it costs, how to call it" order, and the same request shape shown
   for every access path (MCP/CLI/HTTP) side by side. Refuse: the dense
   left-nav method tree - one Tool per page, not a reference manual.
4. **A field guide / museum placard** (completely different) - borrow:
   economy of fact - name, maker, provenance, one sentence of context,
   nothing else competing for attention - as the model for `AeToolCard`'s
   fact row, replacing the current five-column stat grid. Refuse: the
   placard's total absence of a call to action - the card still needs one
   link that reads "Use" or "Inspect."

## (c) Component map

| Section | shadcn primitive | Brand token | Agent surface rendered |
| --- | --- | --- | --- |
| `/market` category shelf heading | plain `h2` + `p` | `font-sans` 500, `--ae-muted-fg` | Capability group from MCP `ae_registry_tools_list`, CLI `ae list --category`, `api.v1.market-tools.list.ts` |
| Tool listing row (`AeToolCard`) | `Item`/`ItemContent` (`item.tsx`), `Badge` (`badge.tsx`), `Separator` | `--ae-brand-muted` hover, `--ae-border` | One Tool descriptor from `api.v1.market-tools.search.ts` and MCP `ae_registry_tools_search` |
| Compare tray | `Button`, custom tray (not shadcn) | `--ae-fg` primary action | Selected `toolRefs` passed to MCP `ae_registry_tools_compare`, CLI `ae compare`, `api.v1.market-tools.compare.ts` |
| Category tabs | `Tabs`/`TabsList`/`TabsTrigger` (`tabs.tsx`) | `--ae-border` line variant | Category filter mirrored in CLI `ae list --category` and `api.v1.market-tools.list.ts` query |
| Pagination | `Pagination`/`PaginationContent` (`pagination.tsx`) | `--ae-border` | Cursor param shared by MCP `ae_registry_tools_list`, CLI `ae list`, `api.v1.market-tools.list.ts` |
| Empty/unavailable state | `AeEmptyState` (project component, not shadcn) | `--ae-muted-fg` | Catalogue-unavailable state, same reason code as `api.v1.market-tools.search.ts` |
| Tool detail identity block | `Item`, plain heading | `font-display` once, `--ae-fg` | `PublicToolDescriptor.offering` from MCP `ae_registry_tools_describe`, CLI `ae describe`, route `src/routes/tools.$toolRef.tsx` |
| Tool detail overview/contract | `Tabs`, `Card` (`card.tsx`) for contract sections | `--ae-surface`, `--ae-border` | Overview = human summary of the same contract MCP/CLI/HTTP consume via `ae_registry_tools_describe` |
| Schemas and references | `Sheet`/`SheetContent` (`sheet.tsx`) | `--ae-surface`, popup shadow | Exact JSON Schema, transport and effect facts - the literal MCP tool schema surfaced by `ae_registry_tools_describe` |
| Run ticket / next action | `Button`, `Card` | `--ae-fg` primary action | MCP `ae_tool_quote` then `ae_tool_call`, CLI `ae call` (quote+call), `api.v1.funding.quote.ts` then `api.v1.tools.call.ts` |
| Track record | `AeFactList` (project component) | `--ae-muted-fg`, no color-as-state | Qualified Use count and last-verified timestamp, same fields `api.v1.market-metrics.ts` reports |

Two surfaces resist this model as built: `AeToolTable` (dense table)
belongs on an operator/admin surface, not here; `AeToolInspector`'s desktop
`ResizablePanelGroup` reads as an IDE and should collapse to one scrolling
page with the run ticket as a sticky aside (the Stripe-docs reference).

## (d) Wireframes

`/market` above the fold:

```
+--------------------------------------------------------+
| [wordmark]                      [for Providers]  [in]   |
| The Tool catalog - price, access, and readiness,         |
| no account needed.                                       |
| [ All 42 ] [ Research 9 ] [ Payments 6 ] [ Data 11 ]     |
| Research 9 - Tools your agent can call to look things up |
|  Web search · by Tavily          $0.004/call  Routeable  |
|  Company lookup · by Clearbit    $0.01/call   Routeable  |
+--------------------------------------------------------+
```

Tool listing page (`/tools/$toolRef`) above the fold:

```
+--------------------------------------------------------+
| < Back to catalog                                        |
| Company lookup                            $0.01/call    |
| by Clearbit · lookup.company                 Routeable  |
| [ Overview ] [ Contract ] [ Schemas ]                    |
| What this does · Who provides it · Qualified Use 1,204   |
| Last verified 2026-09-10       +--------------------+   |
|                                 | Use this Tool      |   |
|                                 | $0.01 · USDC        |   |
|                                 | [ Quote and Call ]  |   |
|                                 +--------------------+   |
+--------------------------------------------------------+
```

## (e) Refuse list

- Tickers, sparklines, any time-window selector (`window: '30d'` family).
- "Movers," "Rising/Falling" chips, red/green delta colour coding.
- Dense multi-column tables (`AeToolTable`) on buyer-facing results.
- Gauges, HHI/concentration meters, bar-chart "distribution" cards.
- Bare activity counters with a chart-glyph icon (e.g. `ActivityIcon` on
  "X Calls in 30 days") standing in for a trust statement.
- Stock-chart iconography in navigation (`ChartNoAxesCombinedIcon` on an
  "Overview" tab).
- Provider logos or wallet addresses substituting for Seller/Provider.
- Gold as a UI accent, decorative page-load animation, or a second active
  accent colour beside forest.

## (f) Decisions for the owner

1. Retire the "Overview" analytics tab (KPI tiles, distribution charts,
   momentum, HHI concentration) for a plain curated rail (audit surface 2)
   - confirm no replacement metric belongs on the public surface at all.
2. Collapse the two Tool-detail surfaces (`DirectoryToolDetails` dialog and
   `/tools/$toolRef`) into one page-based inspector, dropping the desktop
   resizable two-pane layout for a scrolling page with a sticky aside.
3. Confirm `AeToolCard`'s five-column fact grid (Call, Rating, Calls,
   Latency, Authentication, Last verified) should shrink to the
   field-guide placard model, with the rest moved to the Tool detail page.
