# Domain-Public Audit — Customer-Facing Browse/Discovery Surfaces

Scope: `src/modules/{registry,catalog,discovery,seo}/**`, public routes (home, registry, listing detail `/$slug`, `/$slug/inquiry`, about), and listing components. READ-ONLY. Lines from current tree. Format: `[Pn] · REAL|NOISE|FP · category · path:line · evidence · fix-direction · blast-radius`.

---

## 0. COVERAGE & SCOPE NOTES (read first)

- **react-doctor scanned 163/377 src files.** In MY domain, scanned: `registry.tsx`, `$slug.inquiry.tsx`, `about.tsx`, and the registry/catalog/discovery/seo `internal/*` + `validators.ts`. **NOT scanned:** `src/routes/index.tsx` (home), `src/routes/$slug.tsx` (listing detail), `src/routes/__root.tsx` (layout shell). I **spot-checked all three manually** — see §5.
- **The assignment's named listing components DO NOT EXIST in the current tree.** Grep for `AeListingCard|AeBrowseGrid|AeHowItWorks|AeBoundaryNote|AeClosingObject|AeNoScrollLanding` across `src/` + `.planning/` = **0 matches**. They were removed (memory notes them as "should not be assumed rendered"). The **live** listing surface is `src/components/ae/listing/AeProviderListingPage.tsx` — I read it in full (§5).
- 35 of 391 react-doctor diagnostics fall in my domain — **all `warning` severity, zero errors** (the 34 `aria-role` ERRORS and 10 `prefer-tag-over-role` are almost entirely in admin/owner routes; only 1 a11y error touches a discovery-module route — §1).
- **No PERFORMANCE findings on the scanned public routes except the inquiry hydration gate (§2).** The home-search-bar perf hit is adjacent (§2).
- **Dead code is AUTHORITATIVE in dead-code.md** — I do not reclassify its hits; I cite it. The `unused-export` rule overlaps but is mostly a *different* signal here (§4).

---

## 1. ACCESSIBILITY

**[P2] · REAL · a11y · src/routes/developers.discovery.tsx:58 · `aria-role` (error)**
Evidence: `role="developer"` is not a valid ARIA role — assistive tech cannot expose the element correctly. Rendered inside `<AeOperatorShell>`.
Fix-direction: remove the bogus role (use a semantic landmark/section + `aria-label`, or a real role like `region`/`main`).
Blast-radius: 1 route. **Lower customer impact** — this is the developer-facing discovery page (machine/assistant surface per AGENTS.md), not the main customer browse path. Still a real error-severity a11y defect.

**[INFO] · NO a11y findings on the primary customer surfaces.** `registry.tsx`, `$slug.inquiry.tsx`, `about.tsx` (scanned) and `$slug.tsx`→`AeProviderListingPage`, `index.tsx`, `__root.tsx` (manually verified) are a11y-clean: native `<nav aria-label>`, `<article>`, `<section aria-labelledby>` with matched heading ids, `<dl>/<dt>/<dd>` facts, `<ul>/<li>` chips, single `<h1>`, `lang="en"`. No `role=` abuse, no missing labels. The customer-facing a11y posture is sound.

---

## 2. PERFORMANCE (render-critical public surfaces)

**[P2] · REAL · perf/UX · src/routes/$slug.inquiry.tsx:66,73-75,160/173/187/200/211 · `rendering-hydration-no-flicker` + `no-initialize-state`**
Evidence: `const [hydrated,setHydrated]=useState(false)` + `useEffect(()=>setHydrated(true),[])`, then every input + the submit button are `disabled={!hydrated||pending}`. SSR renders disabled → client first paint still disabled → effect fires → enabled. **Customers see a visible disabled→enabled flash on the inquiry form.**
Fix-direction: the `hydrated` gate is a defensive SSR-no-submit-before-JS measure, but it costs a flash. Either (a) drop the gate (native form `noValidate` + JS handlers are enough; a pre-hydration submit is harmless because the server fn re-validates), or (b) if the disabled-defensive intent is kept, accept it is intentional and suppress the lint, or (c) gate via a non-flashing signal.
Blast-radius: 1 component, **customer-facing inquiry form** — the conversion-critical surface. Medium.

**[P2] · REAL · perf (adjacent) · src/components/ae/forms/AePublicSearchBar.tsx:27 · `rerender-memo-with-default-value`**
Evidence: a default prop value of `[]` is re-allocated every render, defeating memoized child prop comparison. This is the **home-page search bar** — render-critical entry surface.
Fix-direction: hoist `const EMPTY_ITEMS: ... = []` to module scope and use it as the default.
Blast-radius: 1 component, home search path. (Component lives in `forms/` not a route, but it is the public entry surface — flagging per assignment's "public surfaces are render-critical".)

**[P3] · REAL · quality · src/routes/$slug.inquiry.tsx:60 · `prefer-useReducer`**
Evidence: 5 `useState` in `PublicInquiryRoute` (`hydrated, value, errors, result, pending`); the latter four are interdependent submission state coordinated by `handleSubmit`.
Fix-direction: collapse `value/errors/result/pending` into one reducer; keep `hydrated` separate (or remove per §2). Low ROI — judgment call, not a defect.
Blast-radius: 1 component.

---

## 3. only-export-components / no-multi-comp (intentional co-location — NOISE)

**[P3] · REAL (but trivial) · fast-refresh · src/routes/$slug.inquiry.tsx:58 · `only-export-components` (×2)**
Evidence: `export { readPublicInquiryRouteReadback, validatePublicInquiryFormInput }` re-exports non-component fns from a route file → Fast Refresh can't preserve state.
- `validatePublicInquiryFormInput` re-export is **fully vestigial** — the only test consumer (`tests/unit/inquiries/inquiry-flow.test.ts:12`) imports it directly from `@/modules/inquiries/route-readbacks`, not the route.
- `readPublicInquiryRouteReadback` re-export exists **solely** for one test import (`inquiry-flow.test.ts:15 → @/routes/$slug.inquiry`).
Fix-direction: repoint that one test import to `@/modules/inquiries/route-readbacks`, delete line 58.
Blast-radius: 1 test import.

**[NOISE] · INTENTIONAL co-location · src/routes/registry.tsx:222,263,279 · `no-multi-comp` (×3)**
`RegistryPagination` / `RegistryLoading` / `RegistryError` are **route-bound loading/error/pagination boundaries** — the idiomatic TanStack Router pattern (they consume the route's own search params and render only for this route). Not sloppy. Could be extracted to `src/components/ae/registry/` for purity but it is not a defect.

**[NOISE] · INTENTIONAL co-location · src/routes/about.tsx:236,280,303,370 · `no-multi-comp` (×4)**
`MobileAccordion` / `MobileOfferTabs` / `MobileTrustAccordion` / `MobileAccordionTrigger` are **page-private mobile-responsive variants** (`md:hidden`) used only on the about page. Co-locating page-scoped responsive helpers with their page is defensible. Not sloppy.

> **Assignment question answered:** the 7 `no-multi-comp` hits are co-location, **intentional**, not sloppy. The 2 `only-export-components` hits ARE real (vestigial test re-export).

---

## 4. MAINTAINABILITY — unused-export / circular-dependency / unused-file

> **Critical distinction:** most `unused-export` hits here are **"function used in-file, only the `export` keyword is dead"** — fix = drop `export`, **do NOT delete the code**. The dead-code agent correctly did NOT flag these as dead. A remediator who reads "unused-export" as "delete" will break the build.

### 4a. Genuinely DEAD exports (no consumer anywhere in src/convex/tests) — P3

**[P3] · REAL · dead-schema · src/modules/registry/internal/validators.ts:13-17**
`RegistryProjectionStatusSchema`, `RegistryProjectionKindSchema`, `IndexTargetTypeSchema`, `RegistryRepairActionSchema`, `RegistryRepairResultSchema` — Zod schemas with zero consumers (grep across src/convex/tests = definition only). Likely scaffolding for a registry index-health/repair projection not yet wired (note `admin.index-health` route exists). Verify intent before deleting; dead-code.md did not enumerate these (it operated at file granularity).

**[P3] · REAL · dead-schema · src/modules/catalog/internal/validators.ts:12,14,15 + src/modules/discovery/internal/validators.ts:6,7**
`PublicFirstRequestChannelSchema`, `CapabilityKindSchema`, `BusinessServiceStatusSchema`, `DiscoveryPathKindSchema`, `DiscoveryAttemptStatusSchema` — the underlying `*Values` arrays ARE used (in `public.ts` for types), but these `*Schema` parse objects are never invoked. Dead zod. Safe to delete.

**[P3] · REAL · dead-file · src/modules/seo/internal/validators.ts · `unused-file`**
Whole file unreachable from any entry point. **Already in dead-code.md (ORPHANS, P3).** Cite, do not re-audit.

### 4b. "export keyword dead, function alive" — drop `export`, do NOT delete — P3

| file:line | symbol | in-file use |
|---|---|---|
| registry/internal/search-documents.ts:8 | `RegistrySearchDocumentSchemaVersion` | :12, :156 |
| registry/internal/search-documents.ts:104 | `buildRegistrySearchDocumentsFromCatalogs` | (defined; builders used by siblings) |
| registry/internal/search-documents.ts:164 | `buildRegistrySearchDocumentId` | :155 |
| registry/internal/search-documents.ts:221 | `normalizeSearchToken` | :205 |
| catalog/owner-claim.functions.ts:159 | `submitOwnerClaimThroughSource` | :149 (handler) |
| catalog/owner-claim.functions.ts:275 | `readPublicBusinessPageThroughSource` | :157 (handler) |
| catalog/internal/first-request.ts:52 | `buildFirstRequestDisclosure` | :34 |
| registry/internal/catalog-search-port.ts:10 | `CatalogSearchBackendValues` | type `CatalogSearchBackend` derives from it (:11) — values const itself unused externally |
| registry/internal/catalog-search-port.ts:113 | `readCatalogSearchTimeoutMs` | :296 |

**[P3] · REAL · dead-value-const · src/modules/catalog/internal/owner-public-flow.ts:15 · `PublicOwnerClaimFieldValues`**
Exported array; only the derived type is consumed (via `public.ts`). The runtime array is unused. Drop the export or delete the const, keep the type.

### 4c. Circular dependency — REAL structural smell — P2

**[P2] · REAL · maintainability · src/modules/catalog/** barrel cycle**
`catalog/public.ts:39` imports `./internal/publish`; `publish.ts:3-6` imports `buildPublicCatalogDto,validateServiceCatalogInput` (values) back from `@/modules/catalog/public`; `owner-public-flow.ts:6` imports `./publish` and types from the barrel. → **`public.ts → internal/publish.ts → public.ts`** (and via owner-public-flow). Currently LATENT (cycle crosses function bodies, not module top-level, so no runtime TDZ today), but order-dependent and fragile. `public.ts:301-323` re-exports ~20 impl symbols from `internal/*` that re-import through the barrel — the root pattern.
Fix-direction: internal modules import siblings directly (`./public-catalog-dto`, `./publish`) instead of routing through the `@/modules/catalog/public` barrel. Standard barrel-cycle fix.
Blast-radius: catalog module init ordering; no current runtime bug.

---

## 5. WHAT REACT-DOCTOR MISSED (in this domain)

1. **Unscanned primary routes — manually cleared.** `index.tsx` (home) is a 4-line wrapper around `<AeChat>` (answer/chat domain). `__root.tsx` has `lang="en"`, clean structure, no a11y issues. `$slug.tsx` delegates to `AeProviderListingPage`, which I read in full (226 lines): **exemplary native semantics** — `<article>`, `<nav aria-label="Return to ask">`, `<dl>` facts, `<section aria-labelledby>` with matched ids, single `<h1>`, `<aside aria-label>`. **No missed bugs** — but the coverage gap is itself the risk; a future regression here is invisible to react-doctor.
2. **`normalizeSearchToken` duplication (cross-boundary).** Defined in `src/modules/registry/internal/search-documents.ts:221` AND reimplemented locally in `convex/registry.ts:1308` (convex has its own copy rather than importing src). react-doctor cannot see cross-boundary duplication. **Drift risk:** if src adds a synonym (e.g. `electrician→electrical`), convex search won't match unless both are edited. Consolidate or add a parity test.
3. **Catalog barrel cycle is deeper than flagged.** react-doctor names two cycle edges; the underlying smell is `public.ts:301-323` re-exporting ~20 internal impls that import back through the barrel — a single architectural fix removes both cycles.
4. **Stale assignment component list.** `AeListingCard`/`AeBrowseGrid`/`AeHowItWorks`/`AeBoundaryNote`/`AeClosingObject`/`AeNoScrollLanding` do not exist; remediators chasing them will lose time. Live surface = `AeProviderListingPage`.

---

## 6. CROSS-REF soc-arch.md / dead-code.md (no duplication)

- **soc-arch [P1] /api/businesses/* bypass + vestigial 'http' surface** — CITED, not re-audited. **Code-quality fallout specific to this domain:** `registry.actions.ts` declares `surfaces:['http','agentJson','agentTools']`, but NO HTTP route honors 'http' (`api.businesses.search.ts:23`/`api.businesses.$slug.ts:18` call `readPublicRegistrySearch*` directly). The action wrapper (input parse, output-schema check, boundary docs) is therefore **dead weight on the HTTP path** — `registry.actions.ts` reads as the HTTP contract authority but is not. No runtime divergence (same underlying read fn), but the declared surface misleads anyone treating the action registry as the contract source-of-truth.
- **dead-code.md** — `seo/internal/validators.ts` (P3 orphan, §4a) and the broader dead-export theme are cited, not reclassified.

---

## DIGEST

- **0× P0/P1 in this domain.** Public browse/discovery surfaces are architecturally sound and a11y-clean on the customer path.
- **1× a11y error (P2):** `developers.discovery.tsx:58` invalid `role="developer"` — dev-facing surface, real but low customer impact.
- **2× perf (P2):** inquiry-form `hydrated` gate flashes disabled→enabled on the conversion-critical form (`$slug.inquiry.tsx:66,73`); home search bar default-`[]` prop defeats memoization (`AePublicSearchBar.tsx:27`).
- **1× structural (P2):** catalog barrel circular dependency (`public.ts↔internal/*`) — latent, fragile.
- **7× `no-multi-comp` = NOISE** (intentional route/page co-location: loading/error/pagination/mobile-accordion). **2× `only-export-components` = REAL but trivial** (vestigial test re-export in `$slug.inquiry.tsx:58`).
- **`unused-export` is mostly "drop the `export` keyword", NOT delete** — functions are used in-file; only the 10 dead Zod schemas + 1 dead value-const are genuinely removable (P3).
- **Coverage gap:** home/listing-detail/root-layout were unscanned — I cleared them manually (all clean); live listing surface is `AeProviderListingPage` (the named components were deleted). Missed-by-RD: `normalizeSearchToken` src↔convex duplication.
