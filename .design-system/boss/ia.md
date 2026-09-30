# aecon buyer journey: source-only cognitive load audit

**Scope:** `/market` discovery, catalogue search, comparison and the Call confirmation component at commit `939237d833433d50fd02c150dbc3c612b34ce13a`. Applied `cognitive-load-auditor` to source and the active `PRODUCT.md`/`DESIGN.md` contracts. This record does not claim visual salience, target sizes or live keyboard behaviour.

## Market entry and Tool search

- **Items visible from source:** Four market tabs; in the indexed Tools view, five sort choices and one filter control precede the results. The hero has a separate question input that starts `/t/new` (`src/components/ae/market/AeX402Directory.tsx:438-475`, `:513-521`).
- **Chunking:** Tabs separate Collections, Providers, Tools and Saved. The filter sheet presents a query, Provider, listed-price and category sections; Advanced filters collapse by default unless active (`DirectoryExplorerFilters.tsx:154-196`).
- **Decision points:** The user chooses between the hero conversation and catalogue search in the filter sheet, then may choose a sort/filter, Tool, Save or Compare. The two query paths have different recipients and outputs (`AeX402Directory.tsx:438-451`, `DirectoryExplorerFilters.tsx:40-64`).
- **Memory demand:** Comparison selection is externalized in a tray with selected Tool names and a four-Tool cap (`AeX402Directory.tsx:356-369`). This supports recognition rather than recall.
- **Primary action:** Cannot judge prominence from source. Hero `Ask` starts a conversation; filter sheet `Search Tools` searches listings.
- **Extraneous load and recommendation:** In canonical search, the filter sheet remains available, but price caps, adoption, curation and published-detail filters are omitted by `marketToolSearchInput` and disclosed only in result text (`market-route-data.ts:21-43`, `AeX402Directory.tsx:393`, `:520`). Show which filters will apply before search, or disable browse-only controls while a query is active. This is an IA/decision risk; the notice is intentional and covered by `tests/unit/market/x402-directory-page.test.tsx:573`.

## Compare Tools

- **Items visible from source:** Up to four selected Tools; each comparison card has identity, access, listed price, five fixed facts, optional activity and an Inspect action (`AeX402Directory.tsx:356-369`, `DirectoryComparison.tsx:11-13`, `:27-56`).
- **Chunking:** Facts are repeated in the same order per Tool. At widths below `sm`, the grid is one column inside an 85dvh scroll area (`DirectoryComparison.tsx:24-28`).
- **Decision points:** Compare selected Tools, then inspect one Tool before calling.
- **Memory demand:** On narrow screens, the user must remember facts from earlier cards while scrolling through later ones. A criterion-first mobile layout or persistent compact comparison summary would reduce recall. `DESIGN.md:72-74` explicitly says comparison stays tabular, while the implementation repeats facts in per-Tool cards rather than an attribute-by-Tool matrix. This is a source-backed contract mismatch; the severity of its visual impact requires a rendered mobile check before a design change.
- **Primary action:** Each card has one `Inspect Tool` action; rendered hierarchy unverified.

## Call confirmation

- **Items visible from source:** The confirmation presents Tool, Provider, Quote, expiry, remaining cap, input and references, followed by one state-appropriate primary action and `Not now` (`src/components/ae/shared/QuoteConfirmation.tsx:20-51`).
- **Chunking and memory demand:** Facts needed for the decision stay in one region; expired/unavailable Quotes switch the primary action to `Get a fresh Quote`. No cross-screen recall is required by this component.
- **Primary action:** Labels name the action (`Approve this Call`, `Get a fresh Quote`). Visual prominence and behaviour were not measured.
- **Boundary:** The full Seller and Provider obligation record remains a declared implementation gap in `PRODUCT.md`; this component cannot establish that future contract by itself.

## Four-channel conclusion

- **Perception:** Source establishes semantic grouping; rendered hierarchy remains unverified.
- **Attention:** Five sort controls plus search/filter and card actions compete on the Tools view; rendered prominence remains unverified.
- **Memory:** The comparison tray externalizes selection; the mobile comparison layout still asks the user to recall earlier facts.
- **Learning:** Two search paths and filters with different applicability require extra model building. Their labels and upfront explanation should make the difference explicit.

**Evidence:** Direct source reads with `sed`/`rg` on 2026-09-30. No product files changed. No runtime interaction or target-size measurement is claimed.
