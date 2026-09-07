# Wave 2 — human UI cold review

## Scope and method

- Reviewed current HEAD `a51e17b221c6b73851c5873502d8150120ef3aad` and the source cutover `3770b43bac9bf3ea11478664ee8249ec4ddf505e`.
- Read `PRODUCT.md`, `CONTEXT.md`, and the repository instructions first. Inspected the public shell, home, market/detail/command-panel paths, owner navigation and workspaces, provider connection handoffs, agent setup/approval, calls/activity, and public status/support/privacy routes plus their focused UI tests.
- Checked Node `v22.22.0` and npm `11.5.1`. No source or test files were changed; no browser, server, broad test, or deployment check was run.
- Product rule applied: `Tool` is the canonical callable unit; `Operation` remains only where it is protected protocol, generic implementation, opaque/hash/evidence material, or historical documentation.

## Confirmed findings

### F1 — P2 — Owner/provider shell still calls the Tool workspace “Operations”

- **Confidence:** 10/10. **Provenance:** pre-existing and omitted by the cutover. `navigation.ts` and the sidebar were unchanged by `3770b43`; the canonical destination was moved to Tool copy elsewhere.
- **Code:** `src/lib/operator/navigation.ts:64` has `{ href: '/owner/offerings', label: 'Operations' }`; `:281-282` returns `{ label: 'Operations', href: '/owner/offerings' }`; `src/components/ae/layout/AeOperatorSidebar.tsx:117` gives the owner home link `aria-label="Operations home"`.
- **Trigger/caller:** A signed-in owner opens `/owner/offerings` or any owned provider route. The same shell also frames the provider status table (`src/components/ae/status/AeCapabilityList.tsx:24,53-70`) and provider connection handoffs (`src/routes/_operator/owner.supply.connections.new.tsx:99,293`; `src/routes/_operator/owner.supply.connections.oauth.callback.tsx:72`).
- **Observable impact:** The active sidebar/mobile link and breadcrumb say “Operations”, while the destination’s page title and section say “Tools” (`src/routes/_operator/owner.offerings.tsx:34,49-50`; `src/components/ae/offerings/AeProviderWorkspace.tsx:71-75,236`). Provider users get a split noun for the same workspace; screen readers receive the stale “Operations home” name.
- **Evidence/reproduction:** Render the owner shell at `/owner/offerings`, then inspect the primary nav and breadcrumb; follow Add service into `/owner/supply/connections/new?attempt=...` or the OAuth callback. The page remains reachable, but the chrome and content disagree. Existing checks encode the stale contract (`tests/unit/operator-navigation.test.ts:70-80`, `tests/unit/operator-shell-chrome.test.tsx:167-172`, `tests/e2e/owner-operations-compatibility.spec.ts:65-70`).
- **Minimal correction direction:** Make the person-facing supply destination, breadcrumb, mobile text, home accessible name, provider-status table labels, and connection-handoff breadcrumb consistently say `Tool`/`Tools`; update focused UI tests. Keep compatibility URL paths and protected operation identifiers intact.
- **Counterevidence considered:** `/owner/supply` is a retained compatibility route and may keep its URL; that does not justify stale labels on the canonical `/owner/offerings` surface. `Operation ID` in `AeToolContractSections` is a technical field and is intentionally excluded.

### F2 — P2 — Agent setup tells users to find an “Operation” after presenting “Browse Tools”

- **Confidence:** 10/10. **Provenance:** pre-existing and omitted. `AeAssistantInstallFunnel.tsx` was unchanged by the source cutover, while its current callers already use Tool language.
- **Code:** `src/components/ae/console/AeAssistantInstallFunnel.tsx:23` says “You can browse Operations before connecting”; `:33-34` says “ask it to find an Operation for your task.” The current public caller presents `Browse Tools` at `src/components/ae/agents/AeAgentDoorPage.tsx:34-37`.
- **Trigger/caller:** Visit `/for-agents` (`src/routes/for-agents.tsx:23-26`) or open the empty/add-another-agent setup on `/agent-access` (`src/routes/_operator/agent-access.tsx:337-345`).
- **Observable impact:** The primary setup funnel changes nouns mid-journey, making the exact market object unclear and contradicting the current public heading/CTA. This is especially visible to an agent owner following setup instructions verbatim.
- **Evidence/reproduction:** On `/for-agents`, read the hero CTA (“Browse Tools”) and the immediately following Codex section (“browse Operations” / “find an Operation”). The focused unit test proves the mismatch is accepted: `tests/unit/ui/agent-door-page.test.tsx:33,52-53` asserts `Browse Tools` and the old sentence; e2e checks still request `Browse Operations` (`tests/e2e/code-block-hit-target.spec.ts:14-22`).
- **Minimal correction direction:** Use canonical `Tool`/`Tools` wording in the shared funnel and update the focused/e2e assertions. Preserve the client/protocol terms (Codex, MCP, OAuth) unchanged.
- **Counterevidence considered:** The old noun is a historical alias in `CONTEXT.md`, but this is ordinary onboarding copy, not an external protocol or technical identifier.

### F3 — P3 — Public status, support, and privacy surfaces retain the retired product noun

- **Confidence:** 10/10. **Provenance:** pre-existing and omitted. The source cutover changed the status probe contract key (`operationGateway` to `toolGateway`) but left its visible strings; support/privacy files were unchanged.
- **Code:** `src/routes/status.tsx:27,36,96` render “Operation API” and “Individual Operation readiness”; `:220,224,233,237,246,250,264` repeat “Operation calls/API”. `src/routes/support.tsx:43` says “The original Call or Operation”. `src/routes/privacy.tsx:23,33,54-62,76,92` and `src/routes/privacy.remove-business.tsx:39,50,58,156` expose the same noun in metadata, headings, help text, and form copy.
- **Trigger/caller:** Any visitor opens `/status`, `/support`, `/privacy`, or `/privacy/remove-business`; the strings are also emitted into page metadata and degraded-state/error guidance.
- **Observable impact:** Public guidance and SEO metadata describe a callable market object that the current catalogue and product charter call a Tool. Users encounter different terminology between the public market (`Tools`) and legal/help/status surfaces, and degraded status messages repeat the wrong noun while directing recovery.
- **Evidence/reproduction:** Static render inspection finds the exact strings above; `tests/unit/routes/status-route.test.tsx:104-130,160-181` asserts “Operation API” and “New Operation calls”, so focused status checks do not protect the current vocabulary. No runtime test was run per the review brief.
- **Minimal correction direction:** Replace ordinary person-facing `Operation` uses with `Tool`/`Tools` (and “Tool API” where an API label is needed), then update metadata and focused tests. Retain technical `operationId`, external operation identifiers, and historical/protocol text.
- **Counterevidence considered:** “Operation ID” in the schema/reference panel and opaque operation refs are protected technical material; they were not counted. The public strings above are product prose and metadata, so the protection does not apply.

### F4 — P2 — “Find Tool alternatives” returns an unfiltered market view

- **Confidence:** 9/10. **Provenance:** carried forward during the cutover. The new Tool inspector file was introduced by `3770b43`, but the deleted Operation inspector had the same unfiltered URL; the shared Tool next-action helper already implements the intended filtered URL.
- **Code:** `src/components/ae/market/tool-detail/tool-inspector-model.ts:50-54` creates `href: /market?query=...` while warning “This Tool is not operational. Choose an operational alternative.” Both full and compact inspectors consume this model (`src/components/ae/market/AeToolInspector.tsx:51,95`; `src/components/ae/market/tool-detail/AeToolCompactDecision.tsx:59-62`).
- **Trigger/caller:** Inspect a `setup_required`, `unavailable`, or routeability-failed Tool in the full market detail or command-panel compact detail, then activate `Find Tool alternatives`.
- **Observable impact:** The link omits `window=30d` and, critically, `availability=routeable`. `validateMarketSearch` accepts that filter (`src/routes/market.tsx:56-73`), and the server only filters the catalog when it is supplied (`src/modules/market/server.ts:138-147`). The user is sent to a query that can show more setup/unavailable Tools, despite the CTA promising an operational alternative. A summary over 200 characters is also dropped by the route validator, making the result unfiltered.
- **Evidence/reproduction:** For a setup-required fixture, the rendered href is `/market?query=<summary>`; compare it with the authoritative `nextActionForToolFacts` output `/market?window=30d&query=<bounded-summary>&availability=routeable` (`src/modules/market/suggested-next-action.ts:127-156`). Existing detail tests only assert that the link exists (`tests/unit/routes/tool-detail-route.test.tsx:439-485`); shared-helper tests assert the missing params are required (`tests/unit/market/suggested-next-action.test.ts:15-62`).
- **Minimal correction direction:** Have the inspector use the shared Tool next-action projection or the same bounded URL builder, preserving the routeable filter and 30-day window; add a detail test that parses the actual rendered href. Align label/warning wording only as needed.
- **Counterevidence considered:** The command-panel’s unavailable-state fallback already links to `/market?window=30d#tools` (`src/components/ae/command-panel/pages/ToolDetailPage.tsx:79-86`), and the shared helper correctly filters routeable results. Those paths confirm this inspector link is the outlier.

## Uncertain leads and verification gaps

- No additional confirmed UI findings from this bounded pass. `src/components/ae/layout/AeOperatorRouteStates.tsx:79`, `src/components/ae/settings/AeCompromiseRecoveryChecklist.tsx:18`, and `src/components/ae/settings/OwnerSettingsSections.tsx:36` contain similar stale ordinary copy, but were not split into additional findings because they are the same vocabulary omission as F1/F3.
- Existing Playwright tests still name the old public/owner labels (`tests/e2e/a11y/engine-product-a11y.spec.ts:35-41`; `tests/e2e/code-block-hit-target.spec.ts:21`; `tests/e2e/owner-operations-compatibility.spec.ts:6,65-70`). This is a verification gap attached to F1–F3, not evidence that the protected compatibility URLs are broken.
- No browser/server runtime or broad test was run; the CTA defect is established by the source-level caller/validator trace and the existing focused helper/detail tests.
