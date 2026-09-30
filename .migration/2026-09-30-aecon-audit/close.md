# Audit close: aecon current design system

Status: complete at the audit plan stage. No UI migration, product implementation, baseline capture, or runtime parity verification was performed.

## Source and scope

- Audit pin: `e1f2b3f59ee785deb114dc195f33c2bda54593e7`, recorded in `inventory/pin.txt`.
- The shared checkout advanced after this pin to `ebfc4c7d295cd7e20102323176f5ff3b41e67bc3`. The later diff changes `convex/lib/chat/generate/stream.ts` and `convex/lib/chat/tools/quoteRequest.ts`; the parent confirmed no market UI source changed. Counts, token mapping and parity remain scoped to the audit pin. The later chat changes were not re-audited.
- Target: active local `DESIGN.md` contract, `src/styles/globals.css` tokens, `components.json`, and `src/components/ui/` as of the pin. Remote `@bklit` remains unpinned and excluded.
- Tracked product-source changes from this audit: none. Existing untracked `.design-system/` artifacts were present before the audit and were left untouched. Audit records are confined to `.migration/2026-09-30-aecon-audit/`.

## Final inventory at the pin

`inventory/counts.txt`: 0 legacy imports, 309 raw values, 2 palette uses, 0 legacy files, 0 unassigned, 0 overlaps, across 1,507 scanned source files. Surface totals: shared 62 raw; market 38 raw; public-editorial 55 raw + 2 palette; chat 30 raw; operator-customer 105 raw; operator-admin 8 raw; document-render 11 raw. The route census is 155 TanStack route files, including 64 `.tsx` views/layouts.

Market mapping: 38 occurrences, 3 exact, 1 semantic, 34 gaps, 0 ambiguous, 0 do-not-use. Gap share 89.5%, above the 30% threshold. Most gaps are component-specific geometry rather than defects in the global token system. The buyer-path parity record has 10 rows: 7 parity, 1 current degrading comparison-layout mismatch, and 2 known forward-looking Seller/Quote contract gaps. The latter are explicitly marked incomplete in `AGENTS.md:46` and `PRODUCT.md:598-602`; they are not reported as current regressions.

## Verification

| Check | Result |
|---|---|
| `node --check .migration/2026-09-30-aecon-audit/inventory/migration-inventory.mjs` | Exit 0 (recorded during inventory phase). |
| Inventory root portability: from checkout and `/tmp`, absolute run-folder path and `--paths 'src/**;convex/**'` | Both exit 0 with identical `0 imports, 309 raw, 2 palette, 0 files`; no unassigned rows or overlaps. Wrong `--root /tmp` guard exited 3 before scanning. |
| `NODE_VERSION=22 /Users/joelchan/.nvm/nvm-exec node .migration/2026-09-30-aecon-audit/inventory/migration-inventory.mjs --help` | Expected exit 2; printed usage. SHA-256 for `current.tsv`, `counts.txt` and `pin.txt` was identical before and after, confirming `--help` made no inventory mutation. Hashes are `f6fe0ee7bd43e9e29831f67924dd3d786f7d57afb513b146eb18f0e5a60948bc`, `1ce0c7d845ae934ebd4bf6100a75615f9ce60b81fa757ae27137bf84df261671`, and `fac6724cafec5bc46c1fba7e0db103c24006799c87dad64328411ea135b5e89b`, respectively. |
| `NODE_VERSION=22 /Users/joelchan/.nvm/nvm-exec npm run check` | Exit 1 at `deps:check`; the preceding lint stage passed. The dependency ratchet reports two `no-circular` violations: `src/modules/chat/tool-card-price.ts` ↔ `src/modules/chat/tool-card.ts`, and `src/modules/capability-execution/procure-engine.ts` ↔ `src/modules/capability-execution/route-selection.ts`. Direct depcruise diagnostic reproduced both. None of those four files changed between the audit pin and close HEAD. Typecheck, import checks and TS standards did not run because the dependency gate stopped the script. |

## Remaining coverage limits

- No visual/browser baselines or computed styles were captured. Exact salience, target sizes, focus appearance, contrast and responsive rendering remain unverified.
- Only the market buyer path received detailed token mapping and source-level IA/parity review. Other queued surfaces remain inventory-only coverage gaps.
- No component replacement/migration manifest exists, so zero legacy imports does not establish stock/custom component status or complete adoption.
- The later chat changes after the audit pin are outside the inventory and parity claims in this close.
- The repository `check` gate remains red on the two dependency cycles above; no cycle changes were made in this audit.
