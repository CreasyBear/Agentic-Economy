# Onboarding friction blueprint and closeout

Date: 2026-07-24
Evidence classes used below: **source inspection**, **unit/fixture**, **labelled local execution** (dev server on `127.0.0.1:3001`, seeded Convex), **labelled local stub provider**. No hosted, provider, or customer evidence is claimed anywhere in this document.

## How this pass actually ran (read this before trusting the process notes)

The approved plan delegated Wave 1 (nine audit and literature agents) and Wave 2 (one synthesis agent) to subagents. **Every subagent spawn failed**, including a two-agent availability probe:

```
task(agent: task|scout|sonic) -> Codex error event: The usage limit has been reached (code=usage_limit_reached)
```

All agent types in this environment route through the same exhausted provider. Per the plan's contingency and `memory://root` ("if agents fail from provider limits, perform the same workflow inline; never claim external review that did not occur"), the orchestrator executed inline.

**Consequences, stated plainly:**

- There are **no** independent nine-agent audit artifacts. The findings below come from the orchestrator's own source reading, which was required for the build anyway.
- There is **no** independent literature review and **no** independently written cold-agent probe document. The cold-agent findings that exist were produced by *executing* the journey (`npm run ae -- journey`), which is stronger evidence than the planned read-only probe, but narrower in coverage.
- No claim in this document rests on review that did not happen.

## Pre-committed build list: verdicts

The plan permitted veto only on a factual blocker found in source. Two were found.

| Build | Verdict | Basis |
| --- | --- | --- |
| B1 AE CLI | Built | — |
| B2 Find-my-business + URL prefill | Built | — |
| B3 Import-first claim form, ABN input removed | Built | — |
| B4 Offering draft-first + draft persistence | Built, **step 2 reduced** | Factual blocker: the claim's service facts are not reachable from `readOwnerOfferingSupplyServer`. Its `business` shape is `{ name, slug, publicStatus, publishedPhone }` only (`src/components/ae/offerings/owner-offering.functions.ts:18`) — no category, no `serviceName`. Per the plan's pre-decided fallback, no new source plumbing was added. The quick start instead seeds `category` from the owner's most recent Offering revision, which needs no new plumbing. |
| B5 Registry instant search | Built | — |
| B6 Web-search business enrichment | Built | — |
| B7 Action-surface legibility | Built, **step 3 is a no-op** | Factual blocker: the canonical link already exists. `publicUrl` is on the registry DTO (`src/modules/registry/registry.actions.ts:80`) and is populated from the catalog record through the projection (`src/modules/registry/internal/offering-api-projection.ts:131,214`; `search.ts:424`). Adding `pageUrl` would have duplicated it. Recorded and skipped, as the plan instructed. |

Contract breaks proposed: **none clear the 20x bar, and none were taken.** No copy scan, UI contract, or truth boundary was weakened.

## What changed

### The magic: type your business name, get a drafted page

`src/modules/storefront/internal/business-enrichment.ts` (new). One web-search-grounded model call drafts a public profile from a business name plus optional suburb.

- Reuses `readAnswerLlmConfig()` and copies the bounded-fetch discipline of `openrouter-transport.ts`: 20s timeout, max 2 attempts on transient status, 1MB request cap, `plugins: [{ id: 'web', max_results: 5 }]`, `response_format: json_object`.
- Every result is discriminated; the module never throws at its caller: `draft` | `unavailable(llm_not_configured)` | `error(enrichment_failed | enrichment_no_facts)`.
- **Truth boundary preserved.** Enrichment reuses `StorefrontImportDraft`, so gathered facts land in the existing `draft_unconfirmed` review gate. Each fact carries `sourceLabel: 'gathered-from-web-search'` and the citation URL in `evidenceRef`. Nothing publishes without owner confirmation.
- Pre-decided bound honored: a returned `websiteUrl` becomes a fact, and is **not** auto-chained into the website import. One model call, zero extra fetches.
- The source-label type was widened from a single literal to `StorefrontDraftSourceLabel`. Grep confirmed the only consumers were `import-draft.ts` and `public.ts` before widening.

Transport and admission: `storefrontEnrichDraftAction` (registered), `enrichBusinessDraftServer`, and `src/routes/api.storefront.enrich.ts`, which copies the import route's posture verbatim — Clerk gate with local bypass, 401, 16KB bounded body, zod parse, 200/422. There is no unauthenticated model spend.

### The front door: `/claim` no longer opens with a wall

- `AeFindMyBusiness` sits at the top of `/claim`, before the sign-in CTA. Type a name, get selectable cards, or hand the name to the draft builder. Empty results say "No match. Start fresh and we will build your page." — never a dead end.
- Selecting a result navigates to `/claim/form?businessName=…&category=…&suburb=…&stateTerritory=…&requestedSlug=…`. The `/claim` route now has `validateSearch`; garbage params are dropped, values trimmed and capped at 120 chars.
- **Precedence is explicit**: a stored `ae.claimFormDraft.v1` draft beats URL prefill and beats a pending enrich intent, because the stored draft is the owner's own later work. When a draft is restored, a pending intent is dropped unread.
- Prefill applies through the existing `import` reducer event, which already preserves dirty fields (`src/modules/catalog/claim-draft.ts:110-118`) — so the no-clobber invariant came for free rather than being reimplemented.
- The claim form is now import-first: "Fastest way: paste your website" is Step 1, with manual fields always open below it. The ABN input is gone from the UI; the module's optional `abn` param and the API route are untouched, since they remain a valid machine-surface param.

### Offerings: requiredness moved to the publish gate

`publishGateRefusal` is now the single gate, shared by the editor and the save path. A draft parks with any subset of fields; publishing needs name, category, and summary, refusing with the field named and focused. The server enforces the same function — client-only enforcement was not acceptable and is not what shipped. An empty draft name is server-defaulted to `Untitled offering`. Drafts persist under `ae.ownerOfferingDraft.v1:<businessId>`, cleared on save, and a restored draft never overwrites a focused field.

### Registry: instant search without lying about scope

Typing navigates the router with a 300ms debounce; the URL stays shareable and the no-JS `<form action="/registry">` remains. When a category filter is active the UI now says "Filtering this page of results." — the filter only ever covered the current page, and previously said nothing.

**A real bug was found and fixed during verification, not shipped:** the first implementation debounced inside a render effect and kept `key={query}` on the search controls. In the browser this navigated with an empty query on mount and remounted the component, wiping typed input. Fixed by debouncing in the change handler and removing the remount key. Caught only because the flow was actually driven in a browser.

### Action-surface legibility

- `ActionSurface` gained `'cli'`; `ActionContext` gained an optional `caller?: ActionSurface`, documented as attribution only and never authority, matching the wording already on `agentIdentity`. It is populated at the two new seams (CLI dispatch, enrich route) and left optional everywhere else, so no existing action changed behavior.
- `npm run audit:actions` (`scripts/audit-action-surfaces.mjs`) mechanizes AE's own rule that registration does not create a reachable route. Advisory, always exits 0.

### The CLI

`npm run ae -- <cmd>` (`tools/ae/`). HTTP commands over the public surfaces; `actions` and `action` dispatch **in process over the real registry**, so no server is needed and nothing is hand-mirrored. Writes refuse without `--allow-write` and print consequence class, authority requirement, and declared boundaries first.

## Verification performed

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors repo-wide.** The plan's assumed 72-error baseline was already cleared by commit `05a0233e`. |
| `npm run lint` | Clean. |
| `tests/unit/storefront/business-enrichment.test.ts` (new, 6 tests) | Pass. Covers unavailable, drafted facts with per-fact citation, exactly-one-request with the web plugin, unreadable output, zero groundable fields, and provider error never thrown. |
| `tests/unit/catalog/offering-draft-first.test.ts` (new, 6 tests) | Pass. Publish gate and prefill link. |
| `tests/unit/catalog/owner-offering-editor.test.tsx` (new, 4 tests) | Pass. Draft saves empty, publish refuses and names the field, draft survives remount and clears on save, seed chip fills. |
| `tests/unit/storefront/import-draft.test.ts` (existing) | Pass, unchanged. |
| `npm run audit:actions` | Exits 0. `5 missing-adapter, 12 unclassified-write, 5 unreferenced of 21 actions`. |
| `tests/copy`, `tests/ui-contract` | **4 pre-existing failures, all in `src/components/ae/action-invocation/AePaidOperationCard.tsx`** — a committed file (`05a0233e`) this pass never touched, tripping `p5-money-rail-overclaim` on the word "settlement". Recorded, not absorbed, not fixed here. No violation names any file from this pass. |
| `tests/imports/private-imports.test.ts` | Pre-existing failures, all `convex/*` internal imports. Untouched by this pass; the new storefront code uses the public seam. |

### Labelled local execution (dev server `127.0.0.1:3001`, seeded Convex)

- `ae journey "plumber"` → 4 steps, **0 stall points**; every next call derivable from the previous response body.
- `ae business adelaide-emergency-plumbing` → 200, one service with area, hours, and a what-to-do-now path.
- `ae actions` → 21 actions with declared surfaces and contract compatibility, **no server required**, proving in-process dispatch.
- `ae action storefront.enrichDraft '{"businessName":"Test"}'` → refused, boundaries printed, exit 1.
- `ae action registry.search '{"query":"plumber"}'` → ran; returned `registry_source_query_failed` before Convex was up, a real discriminated result.
- `ae import https://example.com` and `ae enrich "…"` without the bypass → `401`, structured refusal.

### Browser proof (headless Chromium against the local dev server)

- `/claim` renders the find step above the sign-in CTA.
- Searching "Adelaide" → "No match. Start fresh and we will build your page." (empty state is not a dead end).
- Searching "plumber" → three selectable cards.
- Selecting "Demo Plumbing" → `/claim/form?businessName=Demo+Plumbing&category=Plumbing&suburb=Parramatta&stateTerritory=NSW&requestedSlug=plumbing-demo` with **all five fields prefilled**. Zero retyping.
- Claim form shows "Fastest way: paste your website" first and **zero ABN inputs**.
- Typing "Adelaide Emergency Plumbing" on the landing and clicking "Build my page from the web" → `/claim/form` → "Details gathered for review" → **10 fields populated**, review block showing every fact tagged `gathered-from-web-search` / `unconfirmed` with its source URL, and the confirm checkbox still gating publish.
- `/registry`: typing "plumber" updates the URL to `?q=plumber&limit=10` with **no full document reload** (`performance` navigation entry unchanged) and the input retains focus and value. Selecting a category shows "Filtering this page of results."

### Enrichment evidence boundary (important)

The repository's `OPENROUTER_API_KEY` is **invalid** — OpenRouter's own `/api/v1/key` endpoint returns 401 for it. So:

- **No live-model evidence exists for enrichment.** None is claimed.
- The invalid key did produce useful evidence of the failure path: the route returned `422 {kind:'error', code:'enrichment_failed', retryable:true}` rather than throwing.
- The success path was proven end to end against `tools/dev/stub-openrouter-web-search.mjs`, a **labelled local stub** pointed at via `AE_OPENROUTER_API_BASE_URL`. It is not a provider and proves nothing about real model output quality — only that the route, module, parsing, citation mapping, draft contract, and UI review path work together.

## Findings worth acting on (from execution, not speculation)

1. **Two public surfaces name the same concept differently.** `/api/businesses/search` returns `services`; `/api/businesses/<slug>` returns `offerings`. A cold agent that learned the first vocabulary stalls on the second — the journey harness reported exactly that stall before the CLI was taught to read both. This is an agent-legibility defect in the product, not in the CLI. Fixing it means choosing one public noun.
2. **12 of 21 registered actions are writes with no explicit invocation contract**, so `resolveActionContract` derives `legacy_unclassified_write` / `legacy_unspecified` for them. The two storefront draft actions are now in that set as well.
3. **5 declared surfaces have no adapter evidence** (`inquiry.readCustomerRecord` http; `demand.capture` http+ui; `settings.updateNotificationPreferences` http+ui) and **5 actions are referenced nowhere** under routes, components, or `src/lib/server`. Grep-level heuristic, labelled as such in the script output, but it is a concrete list to check.
4. **Owner surfaces are unreachable locally.** `/owner/offerings/new` renders "Offering editor unavailable" because the Clerk bypass does not create claimed ownership in Convex. The offering work is therefore proven at component and server-seam level, not in a browser. A local seeded owner session would close that gap and is worth having.

## Backlog (ranked, not built this pass)

1. **Unify the `services` / `offerings` public noun** across search and detail responses. Highest agent-legibility value per unit of effort; it is a rename plus contract update, and it removes a stall that was observed, not theorized.
2. **Seed offering quick-start from claim service facts.** Needs `readOwnerOfferingSupplyServer` to expose the claim's `serviceName` / `serviceCategory` / `serviceSummary`. Deliberately deferred: it requires new source plumbing.
3. **Classify the 12 legacy-unclassified writes** with explicit invocation contracts, starting with the two storefront draft actions added here.
4. **Local seeded owner session** so owner and proof surfaces can be exercised in a browser at all.
5. **Generic action-mount pilot (the plan's PARKED item).** The gap is real: `api.businesses.search.ts:21-33` performs no auth while `api.storefront.import-draft.ts:20-51` hand-rolls Clerk, bounded body, zod, and status mapping — and `api.storefront.enrich.ts` had to copy that posture by hand, which is exactly the duplication the mount would remove. **Pilot candidate: `src/routes/api.storefront.enrich.ts`**, because it is new, has exactly one caller, and its required behavior is fully specified: Clerk `auth()` with `isLocalE2EAuthBypassEnabled()` bypass; 401 `storefront_enrich_unauthenticated`; 413 at 16KB; 400 on unparseable body or schema failure with `z.prettifyError`; 200 when `kind === 'draft'`, 422 otherwise; `Cache-Control: no-store`. Any mount must reproduce all six behaviors before a second route moves. This is a recommendation with its cost stated, not a migration.
6. **Restructure the `/` Ask surface.** Highest blast radius, explicitly out of scope this pass.
7. **Fix the pre-existing `p5-money-rail-overclaim` failures** in `AePaidOperationCard.tsx`, which currently leave `tests/copy` red for everyone.

## Claim ceiling

This pass proves, at labelled-local-execution level, that an owner can reach a drafted business page from a business name without retyping it, that gathered facts stay unconfirmed with visible provenance, that an offering can be parked as a draft, that registry search no longer reloads the page, and that an external caller can traverse find → understand → contract with zero stall points. It proves nothing about hosted behavior, real model output quality, provider fulfilment, or customer value.
