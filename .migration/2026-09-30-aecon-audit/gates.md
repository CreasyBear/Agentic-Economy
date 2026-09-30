## G-01. Establish the canonical component replacement map for a later migration
ID: G-01. Question: which local component files are canonical stock, customized or forked, and which product patterns are declared replacements? Default: treat current `src/components/ui/` as the live local component layer; do not classify any path or native composition as legacy without a manifest/diff or named migration-map row. Status: open. Commit: -. From: audit.
Evidence: `components.json` points to `src/components/ui/` and the external `@bklit` registry, but no `registry.json`, `.design-system/run.md`, `ui-drift.tsv` or migration map exists at the pinned commit. The external registry is unpinned.
Blocks: definitive legacy-import counts and component-by-component replacement parity in a future migration run. Token mapping and current adoption evidence continue.

## G-02. Pin external `@bklit` before using it as a target
ID: G-02. Question: should the remote `@bklit` registry become the design-system target in a future run? Default: no; keep this audit pinned to the in-repo active aecon contract and local components. Status: open. Commit: -. From: audit.
Evidence: `components.json` contains `https://ui.bklit.com/r/{name}.json` with no version or commit reference; no installed `@bklit` runtime package was found.
Blocks: parity claims against that external registry only. It does not block the current-state audit.

## P-01. Reconcile the current comparison composition with the active market rule
ID: P-01. Question: should Tool comparison remain in independent cards, or align the repeated facts into the tabular pattern stated in `DESIGN.md:72-74`? Default: preserve the current layout during any style-only migration; a later layout change needs an owner decision and before/after capture. Status: open. Commit: -. From: audit.
Evidence: `DirectoryComparison.tsx:32-52` renders one card per Tool in a grid; `AeX402Directory.tsx:353,360-368` allows up to four selected Tools. This is the current buyer IA mismatch identified in `parity.tsv`, not a new product-behavior regression.
Blocks: claiming full presentation parity for comparison and changing this layout in a future migration without a design decision.

## P-02. Keep forward-looking Seller and Quote requirements distinct from shipped behavior
ID: P-02. Question: when should the buyer detail/Quote flow implement the full principal-reseller roles and information contract? Default: preserve current data, do not infer Seller identity, and do not claim full principal-reseller parity until the product work is implemented. Status: open product scope. Commit: -. From: audit.
Evidence: `DESIGN.md:160-191` states the target composition; `AGENTS.md:46` and `PRODUCT.md:598-602` explicitly describe Seller identity and the complete purchase record as unfinished. `parity.tsv` records the missing fields as known forward-looking gaps, not regressions.
Blocks: any later product implementation claiming the complete buyer-facing Seller/Quote contract; does not block this audit or an unrelated style-only change that preserves behavior.

## M-01. Resolve three buyer typography drifts before a mapped visual change
ID: M-01. Question: should the four 10px keyboard glyphs and two tracking values follow their current values or nearest named tokens? Default: preserve current rendering; a mapped change needs owner decision and before/after capture. Status: open. Commit: -. From: audit.
Evidence: `mapping/market.md` maps four 10px hints 2px below `text-caption`, compact hero tracking `-0.035em` 0.020em from `tracking-display`, and eyebrow tracking `0.12em` 0.04em below `tracking-eyebrow`; all exceed their category tolerances.
Blocks: mapped typography edits at those six call sites; exact-value token swaps remain eligible for a later implementation run after the breakpoint blind spot is resolved.
