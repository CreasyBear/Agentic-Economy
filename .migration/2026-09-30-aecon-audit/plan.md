# Migration plan: Agentic Economy buyer surfaces to the pinned local aecon system

System: `DESIGN.md`, `src/styles/globals.css`, `components.json`, and `src/components/ui/` at `e1f2b3f59ee785deb114dc195f33c2bda54593e7`, landed in the checkout. Counts: 0 imports, 309 raw values, 2 palette uses, 0 legacy files, 0 unassigned and 0 overlaps (`inventory/counts.txt`). The audit's source pin is `inventory/pin.txt`; the design contract and local tokens were reviewed at this commit.

Blind spots: the inventory is source-based and does not see computed CSS, runtime class construction, style props supplied by data, third-party iframe styles, or viewport-dependent rendering. It counts arbitrary Tailwind values but not default utility scales; `DirectoryHero.tsx` also uses `lg:text-6xl` and `xl:text-7xl`, so breakpoint typography is outside the 38-row market token map. No browser capture was made, so salience, exact visible counts, target sizes, focus appearance, and contrast were not measured. Queue groups other than `market` have inventory only and are coverage gaps for detailed IA, state and parity review. The later shared checkout HEAD advanced to `ebfc4c7d2` with chat quote-stream/`quoteRequest` changes after this pin; per the audit scope, counts and parity remain pinned to `e1f2b3f59ee785deb114dc195f33c2bda54593e7`. The parent reports no market UI source change in that later commit. This plan does not claim the later chat surface was re-audited.

## Surfaces

Static counts are assigned from `inventory/current.tsv`. `states` are not runtime-inventoried in this audit.

| Surface | Paths (from `queue.tsv`) | Findings | States | Depends on | Notes |
|---|---|---:|---|---|---|
| shared | `src/styles/base.css`; `src/components/ae/layout/**`; `shared/**`; `data/**`; `feedback/**`; `status/**`; `shortcuts/**`; `forms/**`; `src/components/ai-elements/**`; `src/routes/__root.tsx`; `src/routes/_operator.tsx` | 62 raw | Not inventoried | — | Global shell and reused foundations; sampled only where buyer journey uses them. |
| market | `src/components/ae/market/**`; `listing/**`; `landing/**`; `command-panel/**`; `src/routes/index.tsx`; `market.tsx`; `tools.*.tsx`; `providers.*.tsx`; `$slug.tsx` | 38 raw | Source-only path review | shared | Deep buyer-path token map, composition and parity review. |
| public-editorial | `about/**`; `website/**`; `developers/**`; `agents/**`; `auth/**`; `legal/**`; `support/**`; related public/editorial routes | 55 raw, 2 palette | Not inventoried | shared | Inventory only; IA, token mapping and parity are coverage gaps. |
| chat | `src/components/ae/chat/**`; `src/routes/t.*.tsx`; `src/routes/s.*.tsx` | 30 raw | Not inventoried | shared | Inventory only; later HEAD includes quote-stream/`quoteRequest` changes not incorporated at this pin. |
| operator-customer | `console/**`; `settings/**`; `agent-access/**`; `activity/**`; `call-receipt/**`; `funding/**`; `offerings/**`; `supply/**`; `operator/**`; `onboarding/**`; `principal-account/**`; `src/modules/agent-access/**`; owner/activity/call/agent-access/funding/onboarding/removal routes | 105 raw | Not inventoried | shared | Inventory only; operator and detailed receipt IA remain coverage gaps. |
| operator-admin | `src/components/ae/admin/**`; `src/routes/_operator/admin.*.tsx` | 8 raw | Not inventoried | shared | Inventory only; admin IA, token mapping and parity are coverage gaps. |
| document-render | `convex/moneyDocumentRender.ts` | 11 raw | Not inventoried | shared | Inventory only; rendered business-document parity is unverified. |

The router census is 155 route files, 64 `.tsx` view/layout files. Triage's earlier `routes=1` summary did not cover TanStack file routes; the corrected census and surface globs are recorded in `frame.md` and `queue.tsv`.

## Shared layer work

No shared-layer code change is proposed in this audit. The current target is the in-repo contract and local component layer: `components.json` points at `src/components/ui/`, and buyer components import local `Card`, `Avatar`, `Button`, `Carousel` and `Dialog` primitives. The audit's `imports 0` means no legacy imports were identified against the empty `inventory/legacy.txt`; it does not prove adoption completeness or tell which copied components are stock versus customized.

There is no `.design-system/run.md`, `registry.json`, `ui-drift.tsv`, migration map, or `docs/system/` component/foundation documentation. `components.json` references an unpinned remote `@bklit` registry; it is not used as the target. G-01 and G-02 in `gates.md` preserve these boundaries. No new wrapper, abstraction, token, dependency or structure is justified by the audit evidence. The only new artifacts are the `.migration/` audit record and reusable inventory script, whose concrete benefit is repeatable surface assignment/counting for a later run.

## Buyer UI/UX and IA (source-only cognitive-load review)

The current buyer flow is: `/` redirects to `/market`; discovery rails and full-results filters show admitted Tools alongside separately-labelled external directory entries; the comparison tray selects at most four Tools; public admitted Tool detail presents input/recipient and provenance before its next action; a routeable detail hands off to Agent setup or connected-agent chat for a fresh Quote; chat surfaces the Quote confirmation; the Call receipt then separates payment, delivery and Purchase outcome and exposes state-aware recovery. External directory-only pages correctly say they are not admitted/callable through AE and offer no AE Quote or Call. Source map: `src/routes/index.tsx:7-14`, `src/routes/market.tsx:11-43,64-68`, `src/components/ae/market/AeX402Directory.tsx:360-368`, `PublicToolDetail.tsx:48-59`, `AeToolContractSections.tsx:29-53`, `tool-inspector-model.ts:55-60`, `QuoteConfirmation.tsx:28-49`, `CallSummarySection.tsx:23-42`, `CallRecoveryPanel.tsx:82-104,117-177`, and `DirectoryToolPage.tsx:32-39`.

**Comparison is the main IA/parity mismatch.** `DESIGN.md:72-74` says comparison and operational records stay tabular. `DirectoryComparison.tsx:32-52` renders one card per Tool in a responsive grid, with five repeated facts, price/source context, and optionally reported call activity. `AeX402Directory.tsx:353,360-368` allows four selections. This is a degrading parity gap: users can inspect up to four candidates, but repeated attributes are not aligned into shared rows; the desktop grid shows two cards per row and narrow layouts stack them. Source alone establishes that structure, not its rendered salience or actual abandonment. Keep the five data facts and their provenance labels; for a later parity decision, compare them in aligned rows while retaining a separately labelled Inspect action.

**Cognitive Load Auditor findings.**

- Perception/attention: the comparison entry point is named `Compare Tools`, and each object has an `Inspect Tool` action; exact primary-action salience was not captured. The dialog repeats Provider-listed price and Bazaar activity, distinct sources whose labels should remain visible beside buyer Quote information.
- Chunking/decision: cards chunk each candidate as an object, and the tray caps selection at four; each card repeats identity, access, price/context, five facts and optionally call count. Comparing a particular attribute requires scanning separate card blocks rather than one aligned row. The cards keep data visible, so this is a scan/alignment cost, not an asserted working-memory violation.
- Memory/learning: public detail places input/recipient disclosure before chat, setup or Quote entry, and clearly says a Quote confirms buyer price. The Quote approval card then shows Tool, Provider, amount, expiry, remaining cap, input and references, but omits several pieces required by the design contract (below). That forces the approval view to rely on caller context or detail learned earlier.
- Primary action: detail says `Set up to get a Quote` or routes to alternatives; the connected-agent instruction asks for a fresh Quote and says to resume pending Calls. Quote approval names `Approve this Call`; expired/unavailable Quotes offer `Get a fresh Quote`. These labels preserve the next-action chain in source, but were not tested in a live Agent session.

**Forward-looking commercial contract coverage.** `DESIGN.md:160-191` states the future Tool/Seller and Quote composition. `ToolDetailFacts.tsx:21-27` currently projects a Provider, Publisher or Directory Host; `QuoteConfirmationView` and `QuoteConfirmation.tsx` carry/display the Tool, Provider, total Quote amount, expiry, cap, input and references, but not Customer, Account, Agent/policy version, fixed Seller, destinations/external effects, accepted terms/evidence, or retry/recovery consequences. This is not a newly discovered regression: `AGENTS.md:46` and `PRODUCT.md:598-602` explicitly say Seller identity and the complete Australian principal-reseller purchase record remain implementation work. Treat these rows as known forward-looking contract coverage gaps, not a current feature break or a visual migration task. Do not invent or infer Seller identity. Purchase receipt does keep purchase kind, payment and delivery as separate facts, and recovery copy explains that status checks do not repeat the Call/payment. Runtime recovery/concurrency was not exercised in this audit.

## Parity

`parity.tsv`: 10 rows: 7 `parity`, 1 `gap: degrading`, and 2 `gap: blocking`. The only current buyer IA mismatch is comparison cards against `DESIGN.md:72-74`'s tabular comparison rule. The two blocking classifications compare the current source with the forward-looking commercial contract; `AGENTS.md:46` and `PRODUCT.md:598-602` already call those features incomplete, so they are known future implementation gaps, not regressions or blockers to this audit. They remain gates to claiming the complete principal-reseller purchase contract, and a system-only component migration cannot close them.

The degrading row is the comparison-card layout against the tabular rule. If a later migration touches it, preserve data, selection limit, URLs, focus return and action semantics, and get an explicit layout decision before changing presentation. The `parity` rows record current strengths to preserve: local component adoption, input disclosure before action, truthful source pricing, the Agent's Quote/Call instruction, separate external registry handling, and receipt/recovery state boundaries. Runtime behavior remains untested.

## Gaps for the system owner

- Token mapping for the buyer market is `not actionable (gap threshold)`: 34/38 rows (89.5%) are gaps. Of the 34, 28 are component-specific geometry (dialog/side-panel bounds, sidebar widths, grid templates, scroll offsets, carousel basis and local max heights). Their absence from global tokens is not inherently a system defect; do not create general tokens solely to clear the inventory.
- Four 10px keyboard-key glyph sizes are 2px below the only purpose-compatible 12px caption token; two tracking values differ from the named eyebrow/display tokens by 0.04em and 0.020em, over the 0.01em tolerance. Keep unchanged by default until the owner decides whether the current visual values or token values should win.
- The three exact base display values have safe, identical-value candidates: `text-[2.75rem]` → `text-display`, `leading-[1.02]` → `leading-display`, and `tracking-[-0.055em]` → `tracking-display`. They cover 3/38 market findings (7.9%). This is a future mechanical candidate only; the same heading uses untracked default-scale `lg:text-6xl` and `xl:text-7xl` breakpoints, so a complete typography swap needs an explicit scale/parity check.
- No docs twin for the local component layer was found under `docs/system/`; individual component usage contracts, variants and accessibility/behavior guarantees are not mapped here. Existing local primitives are present, but the external remote registry remains unpinned and cannot serve as comparison evidence.
- Seller and Quote composition gaps are product-contract gaps stated above, not missing global design tokens/components to invent during this run.

## Docs coverage

| System part referenced | Code page | `.md` twin | Coverage |
|---|---|---|---|
| Token/foundation layer used in the buyer path (`Card`, `Avatar`, `Button`, `Carousel`, `Dialog`) | `src/components/ui/` and `src/styles/globals.css` | No `docs/system/` twin found | Partial: active visual contract exists in `DESIGN.md`, but no component pages were available to verify props, variants, keyboard/focus or overlay contracts. |

## Pilot

Recommend `market`, the lived visual reference explicitly named by `DESIGN.md:1-6` (`/market?view=discover`) and the highest-leverage buyer decision path. It exercises local Card/Avatar/Button/Carousel/Dialog composition, responsive collection rails, filters, a four-item comparison flow, public admitted Tool detail, Quote handoff and recovery links. It also contains three exact token swaps and concrete typography/layout gaps. Before an implementation run, close or explicitly gate the comparison parity row and keep Seller/Quote product gaps outside a style-only pilot.

## Codemod candidates

No legacy import replacements can be generated: the active migration map/registry is absent and `inventory/legacy.txt` is empty. Future exact class rewrites are limited to the three base typography utilities listed above (3/38 market findings, 7.9%). No safe codemod is recommended for the 34 gaps; they require per-component intent and/or a person’s visual decision. Do not use regex to alter the quote, seller, price, role or recovery copy.

## Gates

| Gate | Question | Default | Status |
|---|---|---|---|
| G-01 | Which local UI components are stock, customized, canonical compositions or superseded? | Treat `src/components/ui/` as current; do not infer legacy from folder/import names. | Open; see `gates.md`. |
| G-02 | Should unpinned remote `@bklit` become the target? | No; continue to use the pinned in-repo design contract. | Open; see `gates.md`. |
| P-01 | Should comparison remain cards or align to `DESIGN.md`'s table rule? | Preserve current layout until the product/design owner decides; a future change needs before/after capture. | Open parity gap. |
| P-02 | How should the admitted Tool and Quote views represent fixed Seller and missing authority/commercial facts? | Preserve current data, show no invented identity; product owner resolves before claiming full principal-reseller parity. | Open product-contract gap. |
| M-01 | Should 10px key glyphs and the two tracking values follow current values or nearest tokens? | Preserve current rendering until owner decision; no token or visual change in audit. | Open mapping questions. |

## Estimate

Seven surfaces are in the queue; a later implementation run should use window cap 1 from `frame.md`, pilot `market`, and proceed one surface at a time after the target-component map and buyer-flow gates are resolved. Wall-clock estimate is not supported by this audit: no browser baselines, runtime behavior run, component documentation map, or migration pilot was produced. This run ends at plan; there is no claim of completed adoption or visual parity.
