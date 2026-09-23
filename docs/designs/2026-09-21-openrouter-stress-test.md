# Stress test: ideal Market vs OpenRouter `/models`

**Status:** recast. Primary evidence is the catalog page. Listing, Chat, Keys are out of scope except as what `/models` links to.  
**Date:** 2026-09-21  
**Walk:** https://openrouter.ai/models logged out · **SEEN**  
**Ideal under test:** [2026-09-21-ideal-app.md](./2026-09-21-ideal-app.md) dest `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET`  
**Current Market:** [platform-screen-specs.md](../operations/platform-screen-specs.md) §1

`/models` is the page that must survive contact with our Market. If the ideal cannot sit next to this catalog, it is fashion. If it diverges for J-B01–J-B04, keep the divergence.

---

## What `/models` is for

OpenRouter’s catalog job: **find a model by name, modality, price, or constraint, then open it or pin it.**

It is not “describe a need despite vocabulary.” Search placeholder is **“Search models…”** — inventory lookup. Title in the tab is “Compare AI Models.” Every row is assumed callable if you later get a key.

AE Market’s jobs: **J-B01** turn a need into a shortlist; **J-B02** compare a small set; **J-B04** record no-fit. Opening a listing is the advance, not purchase.

---

## Page chrome — SEEN

```text
Models
Filter · Compare · Discover Models
Newest ▾ · All variants ▾ · Pinned · List | Table
Search models…
All · Text 446 · Image 52 · Video 29 · Speech 18 · More
[cards]
Filter (floating)
```

Header (site): Search · Sign Up · hamburger. No Keys, Credits, or Activity on this page. Guest can browse.

**Compare** is a link off the catalog (to `/compare`). **Discover Models** is a sibling entry, not the ask on this page. **Pinned** is a filter over pins on the cards.

---

## Element for element

| `/models` (SEEN) | Ideal / current Market | Verdict |
| --- | --- | --- |
| One catalog dest | One Market URL; fold `/owner/market` | **HOLD** |
| No sign-in to browse | Guest browse | **HOLD** |
| Search = model name / inventory | Ask = describe the need (J-B01) | **HOLD** both can live; do not replace the ask with “Search tools…” |
| Modality tabs with **counts** (Text 446 …) | Tools / Collections / Providers / Saved — views, no counts on first paint | **REFINE** counts on a facet. Do **not** add six modality dests |
| Filter sheet (below) | Sticky aside + mobile Sheet; price + provider hostname | **REFINE** a few decision filters. Do not copy the whole sheet |
| Newest / All variants | Sort after browse | Compatible; keep sort as query |
| Pinned control + pin on every card | Saved tab + heart | **HOLD** Saved is a view, not chrome. Pin-on-card is the same job |
| List default · Table toggle | Cards for choice; table in compare dialog | **REFINE** Table view on Market is legal (DESIGN.md). Not a new dest |
| Compare as a **link** | Compare tray; `?compare=` stripped | **REFINE** persist (FR-05). Still not a header dest |
| Discover Models link | Ask + collections on the same page | **HOLD** our discover *is* Market. Do not mint a second dest |
| Card: title, pin, 7-day volume, description | Title, save, activity line, description | Compatible |
| Card facts: `by {author}` · context · **$ in / $ out** | Provider line · **one** provider-listed price | **REFINE** put comparable numbers on the card. Label them listed, not Quote |
| Discount / free badges | Rare | Optional. Not a dest |
| Primary: open listing | Open listing | **HOLD** No Reserve on the catalog |
| Every card treated as callable | Indexed ≠ callable | **HOLD** Do not copy this. AE directory rows can fail inspect (EX-01, FR-04) |
| Empty / no-fit | “No matching Tools”; no gap record | **HOLD** J-B04 stays ours. `/models` has no analogue |
| Floating Filter | Filter in chrome + sheet | Craft only |

---

## Filter sheet — SEEN (opened)

Heading **Model Filters**. Groups on screen:

Input modalities (Text, Image, File, Audio, Video) · Discounted · Context length · Prompt pricing · Series · Categories · Supported parameters · Distillable · Zero data retention · In-region routing · Output pricing · Model age · Tool calling · Inactive models · Artificial Analysis · Design Arena · Providers · Model authors.

Our ideal already said: do not turn every catalogue field into a peer filter. Most of this sheet is **inventory science**. Take only filters that change a **purchase decision**:

| Take | Leave |
| --- | --- |
| Price band (they split prompt / output) | Artificial Analysis, Design Arena (quality scores — charter forbids a universal score) |
| Provider / author | Series, Distillable, Model age as first-class |
| A capability / category chip | Supported parameters as a 20-item checklist |
| Data-use / retention **when the Tool has it** | Inactive models as a default browse |
| | In-region routing as a dest |

AE already has price range and provider hostname. That is the right size. Adding ZDR or tool-calling later is a query facet, not chrome.

---

## Card facts that pressure the ideal

A `/models` card always shows **two prices and a context window** in the same row as the author. A person can compare three cards without opening them.

Our card shows one provider-listed price and an activity line. Comparison that needs context, effects, or data use waits for the dialog — which then dies on inspect (FR-05).

**REFINE (Market only):**

1. Keep the ask. That is the job `/models` does not do.
2. On the card, keep title, Provider, listed price, **callable vs indexed**, save, compare.
3. If a second number earns its place, it is a **constraint** (readiness, or “not callable”), not 7-day token volume as a quality score.
4. Persist the compare set in the URL. Their Compare **link** admits comparison is a task, not a hover.
5. Optional Table view for the same attributes — already our compare grammar. Do not add Rankings to get a table.

---

## Jobs on this page

| Job | `/models` | Ideal Market | Result |
| --- | --- | --- | --- |
| J-B01 Find despite vocabulary | Weak. Search is names. Tabs are modalities. | Ask + shortlist | **HOLD** ask. Their search is a *second* control, not the product |
| J-B02 Compare without exhaustion | Stronger. Counts, two prices, Compare link, Table, Pin | Tray evaporates; disabled Compare unexplained | **REFINE** persist + named disable (FR-05, FR-06) |
| J-B04 No-fit | Absent | Absent on screen today | **HOLD** do not drop because they lack it |
| Browse endless directory | This *is* the page (446 Text …) | Explicitly **not** a job | **HOLD** do not make Market a 15k scroll with no ask |
| Open listing | Card is the listing | Card opens `/tools/…` | **HOLD** |

---

## What we will not take from `/models`

- Replacing the need-ask with “Search models…”
- Modality tabs as dests (Text / Image / Video as chrome)
- Token volume as the card’s trust signal
- Artificial Analysis / Design Arena filters
- Assuming a catalog row will Call
- Compare as a **header** dest (their Compare is a page link; we keep it a view)
- Discover as a second catalog dest

---

## Distance on Market only

| Ideal Market | Current AE Market | `/models` pressure |
| --- | --- | --- |
| Ask on the page | Ask + collections **SEEN** | Keep. They are weaker here |
| Comparable listed price | One listed price on the card | Keep label; make compare attributes survive |
| Callable vs indexed on the card | Tool language on indexed rows | They cannot teach us this; we must add it |
| Compare in the URL, ≤4 | Tray in React state | They treat Compare as durable. So should we |
| Counts optional on a facet | No counts on first paint | Counts help J-B02; not required on All |
| Table as a view | Cards only | Legal to add; not a dest |
| No-fit action | Missing | Still ours to add when JI-08 |

---

## Out of scope this recast

Home pitch (Signup → credits → key), listing playground, `/compare` empty slots, `/chat`, Keys **BLOCKED**. Those remain in the previous walk if needed. They do not change the Market verdict.

---

## Integrity

`/models` is a very good **inventory catalog**. Our Market is a **need → shortlist** dest that happens to contain a catalog. Copying `/models` wholesale would delete J-B01. Ignoring it would leave J-B02 weaker than a public page we can open in one click.

Take their card honesty (numbers you can scan) and durable compare. Keep our ask, our callable distinction, and our refusal to rank.
