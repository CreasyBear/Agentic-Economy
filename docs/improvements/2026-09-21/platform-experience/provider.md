# Provider marketplace experience audit

> **Scope reset, 21 September 2026:** this is retained technical evidence. Its priorities do not govern the immediate UX work. Use the [buyer experience baseline](../../../designs/2026-09-21-platform-experience-audit.md) and [page checklist](../../../operations/platform-experience-register.md), reframed around basic site, group and page requirements after Joel’s correction.


**Date:** 2026-09-21  
**Scope:** Provider entry, supply admission, publication, maintenance, distribution, earnings, support, and offboarding.  
**Evidence:** current source and inspected focused tests; one signed-in runtime observation supplied by the parent task. No test command or subagent test execution was run by this subtask.  
**Owner:** provider experience audit.

This is a source-grounded experience audit, not a production-readiness claim. `S` means current source was read, `T` means a focused test asserts the behavior, and `R` means the parent observed the signed-in local runtime on 2026-09-21. A source receipt, passing test, local browser observation, or maturity-register entry does not prove an installed package, hosted deployment, external payout, or production behavior.

The product charter defines a two-sided capability market: a Provider exposes a bounded capability and reaches relevant buyers, while a buyer describes a need, compares services, buys with authority, and continues work (`PRODUCT.md:28-54`). The entry release is the managed x402 lane; the current Jev campaign is buyer-only. Provider enrichment/publication, later matching, and repeat allocation remain roadmap work in the integration register (`docs/operations/jev-platform-integration-register.md:14-23`). This audit covers the full Provider job so the release can preserve the right seams without turning future supply-side work into a Jev gate.

## Provider job and service blueprint

The Provider’s job is: “I have one source I control. Help me admit one bounded Tool with honest price, access, effects, and evidence; show me whether buyers can use it; help me keep it healthy, earn and withdraw safely, and leave without losing the record.” The distribution job is separate: “Show the right public identity and explain how this Tool can reach buyer demand without making me become a catalogue or search expert.”

| Journey stage | Provider action | Current AE surface | Domain objects and states | Proof and safe continuation |
| --- | --- | --- | --- | --- |
| Decide fit | Understand what can be listed and what the check does | `/for-providers` | Source, Tool, provider authority; public/private source | Landing copy explains source fit, secret handling, and that a check is not publication (`src/components/ae/supply/AeSupplyLanding.tsx:101-126`, `:141-151`). |
| Establish identity | Create or select the owner Provider business | `/owner/operations` first visit | Provider business identity; currently `unpublished`/`claimed` after creation | Name and HTTPS website are saved; ABN is collected and validated but dropped before persistence (finding 1). |
| Connect supply | Preview a native source and, when needed, use an owner-controlled connection | `/owner/operations/new`, `/owner/supply/connections/new`, workspace `#provider-connections` | Source digest/revision, connection generation, candidate Tool | Unsupported candidates remain visible with correction; secrets are not pasted into the Tool form; recheck/reconnect is the continuation (`src/components/ae/supply/SupplyCandidateSection.tsx:17-49`, `tests/unit/ui/supply-source-native-start.test.tsx:218-320`). |
| Publish | Choose one candidate, declare terms, review, attest, submit | `/owner/operations/new` | Portfolio Service, Offering, Publication, and callable Tool remain distinct; Tool is `draft → submitted → under review → published/paused/action required/retired` | Publication is admission/readiness, not demand, payment, delivery, or payout (`src/components/ae/supply/AeSupplyLanding.tsx:141-145`; `src/modules/capability-supply/provider-tool-status.ts:3-11`). |
| Operate | See availability, source health, publication and observed outcomes; withdraw or republish | `/owner/operations/$toolRef` | Tool version/source, connection, validation, publication, freshness, delivery, qualified use | Detail has one primary continuation, separate health/outcome facts, and guarded withdrawal/republish (`src/components/ae/supply/AeProviderToolDetail.tsx:74-180`). |
| Earn and withdraw | Understand source-recorded earnings and hosted payout readiness | `/owner/operations#earnings` | Provider earnings, payout account, transfer evidence; no synthetic earning from setup/test | Existing card states truncation and uses Stripe-hosted flows (`src/components/ae/supply/earnings-card/AeSupplyEarningsCard.tsx:60-68`, `:120-135`). |
| Get help or leave | Recover a failure, contact support, freeze new work, settle obligations, retire | `/support`, `/owner/operations#offboarding` | Support reference; offboarding `Freezing → Action required/Retired/Cancelled` | Support accepts a safe reference (`src/routes/support.tsx:9-27`); offboarding uses reverification, idempotency and blocker gates (`src/components/ae/offerings/ProviderWorkspaceOffboardingSection.tsx:32-160`). |

The object vocabulary matters. A Provider business is the owner identity. A Portfolio Service can describe a broader offering. An Offering is a source-backed commercial draft. A Publication is the Provider’s admission/sealing act for a Tool version. A Tool is the one callable unit buyers inspect and call. A Source and Provider connection establish upstream authority or access; neither alone is a public Provider identity. A Listing is a public projection. Earnings, payout state, delivery, and purchase status are separate facts. The charter’s x402 clarification keeps an external endpoint browseable before AE onboarding/publication, while an admitted/publicated Tool remains the Provider-controlled supply path (`PRODUCT.md:153-183`).

## Current routes and screen contracts

The current route set is sufficient for the entry release. The minimum route repair is the connection handoff in finding 2. Do not add a second “Provider Center,” a new wireframe kit, or speculative route names.

### Public entry — `/for-providers`

```text
[Providers]  List a Tool
One bounded Tool, exact inputs/outcome, price, access, effects, evidence
[List a Tool]

Before you sign in: source fit, credential rule, safe-check consequence
How to publish: source → Tool → describe/check → submit/status
What agents can inspect: published facts and current readiness
```

The route and page contract are explicit (`src/routes/for-providers.tsx:8-24`). The existing `AeSite*` primitives and `AeCollectionRail` already match the design-system decision for DS-13 (`docs/operations/design-system-maturity-register.md:200-207`). The missing ideal element is a short distribution explanation: publication makes facts inspectable; it does not promise demand. The current page already says this, so the change is sequencing and discoverability copy rather than a new component.

### Owner workspace — `/owner/operations`

```text
My tools                                      [Add Tool]
Next action / blocker / one safe continuation
Tools: Tool | status | price | usage | quick actions
Tool availability: connections + buyer availability
Earnings: payout readiness + recorded earnings
Provider settings and administration [identity, offboarding]
```

The actual page renders the onboarding wizard when no Tool exists, then Tools, availability, earnings, and a collapsed settings/administration disclosure (`src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx:94-147`). Keep this composition. The path to ideal is a clearer “next action” summary and explicit hash links to the existing sections, not a new workspace abstraction.

### Source-native publication — `/owner/operations/new`

```text
1 Source       source kind, URL/definition, environment, connection
2 Tool         discovered candidates, supported/unsupported reason
3 Terms        name, description, category, availability, price, effects/data
4 Review       source and Tool summary, attestations, [Submit for validation]
```

`AeSupplySourceNativeStart` already owns these four stages (`src/components/ae/supply/AeSupplySourceNativeStart.tsx:174-208`), and the focused test proves source discovery, candidate selection, no protocol-reconstruction fields, exact source digest/revision, consequences, attestations, and submission (`tests/unit/ui/supply-source-native-start.test.tsx:218-320`). Preserve the flow and use its existing `Field`, `RadioGroup`, `AeSection`, `Alert`, and `AeFactList` primitives. Progressive disclosure within Terms is the smallest improvement.

### Tool maintenance — `/owner/operations/$toolRef`

```text
[Published / Action required] [Available to buyers / Not available]
One reason and one continuation
Tool status: source, connection, validation, publication, freshness, last checked
Observed outcomes: delivery / qualified use
Technical details [refs, digest, reason codes, provenance]
[Readiness check]     [Withdraw] [Republish] [Update price]
```

This is already close to the ideal. Keep status and outcome facts separate and make “readiness check” explicit when the test response is a local readiness projection rather than a buyer Call. The existing detail route should remain the maintenance destination.

### Distribution and economics

```text
Public Provider listing: identity → catalogue status → Tools → Ready now/setup/inspect only
Owner earnings: recorded amount → payout readiness → Stripe-hosted account → transfer evidence
Help: safe reference → private support
```

The public listing and support route exist, but public Provider identity and external directory identity need clearer relationship (finding 4). Earnings and statements remain entry-release foundations, not the complete Whop-like maturity surface (finding 8).

## Prioritized findings and path to ideal

### 1. P1 — CONFIRMED GAP: ABN intake is validated and advertised but not persisted

**Ideal.** Ask for a Provider tax fact only when its authoritative storage and readback contract exist. If the entry release does not own that fact yet, remove the field and tax-invoice/GST claim from activation. If it is retained, show “provided/recorded” versus “verified” accurately and carry the normalized value through the owner identity readback.

**Current and gap.** The visible Step 1 requires an ABN and says it supports “GST attribution and Australian Tax Invoice issuance” (`src/components/ae/supply/supplier-onboarding-wizard/components/ProviderIdentityFields.tsx:69-83`). The wizard validates the normalized ABN and sends `abn` (`src/components/ae/supply/supplier-onboarding-wizard/useSupplierOnboardingWizard.ts:65-94`); focused tests cover checksum acceptance and rejection (`src/components/ae/supply/supplier-onboarding-wizard/provider-identity-validation.test.ts:41-47`). The workspace callback destructures only `{ name, website }` and sends no ABN (`src/components/ae/offerings/provider-workspace/useProviderWorkspaceInventory.ts:28-37`); its contract omits ABN (`src/components/ae/offerings/provider-workspace/provider-workspace.contracts.ts:27-38`); the server mutation accepts only name, slug, website, and provider identifier (`src/components/ae/offerings/provider-identity.functions.ts:19-30`; `convex/catalogOfferingMutations.ts:83-88`) and creates an unpublished business with no tax fact (`convex/catalogOfferingMutations.ts:145-171`). The parent’s runtime observation confirms this is the visible activation path (`R`). This is a contract mismatch, not a conclusion about tax law.

**Path, reuse, dependency.** Keep `/owner/operations` and the existing fields/diagnostics. Decide whether the product entry lane owns a persisted tax fact. Do not add an ABR integration or hand-rolled verification. If yes, extend one authoritative identity/tax contract and its readback; if no, remove the unconsumed request and claims. Existing money tax-profile code can be reused only if it is the accepted owner of the fact.

**Acceptance.** A valid normalized ABN either appears in an authoritative identity readback after save, or the UI no longer requests/claims it. An invalid checksum refuses before mutation. A retry does not create a second Provider business. No UI says “verified” when the source only records user input.

**Confidence:** `S+T+R`; source and inspected tests establish the mismatch, and the local observation establishes the current visible screen. This is a confirmed source-contract gap, not evidence of a P0 production incident.

### 2. P1 — CONFIRMED GAP: connection recovery points to a route that does not exist

**Ideal.** Every `Action required` Provider state lands on the existing connection panel, focuses the affected connection, and preserves the Tool context. A Provider should never be sent to a dead route.

**Current and gap.** Credential loss and cleanup produce `/owner/supply/connections` (`src/modules/capability-supply/provider-tool-status.ts:216-243`), and the detail surface emits that handoff anchor (`src/components/ae/supply/AeProviderToolDetail.tsx:221`). The current owner route tree has `/owner/supply/connections/new` and an OAuth callback, while the working connection panel is embedded in `/owner/operations#provider-connections` (`src/components/ae/offerings/ProviderWorkspaceReadinessSection.tsx:38-61`). The general `provider-connections` hash currently does not auto-open that deferred panel: `useProviderWorkspaceSheets` only recognizes `provider-connection-*` hashes (`src/components/ae/offerings/provider-workspace/useProviderWorkspaceSheets.ts:113-133`). Focused UI and projection tests currently assert the missing destination (`tests/unit/ui/provider-tool-detail.test.tsx:129-152`; `tests/unit/ui/supply-funnel-publisher-home.test.tsx:67-92`). This makes an otherwise truthful blocker unrecoverable through the asserted handoff.

**Path, reuse, dependency.** Repair the handoff and the existing workspace hash behavior together. Either use the existing `provider-connection-*` hash when a connection ref is known, or wire the general `provider-connections` hash in `useProviderWorkspaceSheets.ts:113-133` to open and focus the deferred panel before using `/owner/operations#provider-connections`. Do not make an href-only substitution. Reuse `AeOwnerProviderConnections`, `focusSection`, and existing `AeSection`. A compatibility redirect may be added only if a current external caller requires the old path; it should render the existing panel, not a new screen.

**Acceptance.** Render each credential-lost and cleanup-pending CTA; follow it through the router; assert the existing connections panel appears, focus is moved to the section/connection, no credential is exposed, and recheck/reconnect preserves the Tool’s current source digest and publication state. Update the two focused tests to assert the real destination.

**Confidence:** `S+T`; route and handoff are visible in source and inspected tests currently encode the defect. Hosted navigation remains unverified; this is a confirmed source-contract gap, not evidence of a P0 production incident.

### 3. P2 — VERIFY: activation copy must match its separate commercial states

**Ideal.** Activation should answer one question at each return: “What is the next action before this Tool can be published, become buyer-available, or receive a payout?” Identity, payout readiness, and first Tool publication are separate states. Optional payout setup should not look like a completed selling guarantee.

**Current and gap.** The wizard presents “Supplier activation,” says it starts selling and receiving automated AUD payouts, and exposes three steps (`src/components/ae/supply/supplier-onboarding-wizard/AeSupplierOnboardingWizard.tsx:48-90`). Step 1 leads to Payouts; Step 2 can be skipped and describes Stripe-hosted bank/KYC; Step 3 sends the owner to Add Tool (`src/components/ae/supply/supplier-onboarding-wizard/components/PayoutsStep.tsx:16-65`; `src/components/ae/supply/supplier-onboarding-wizard/components/FirstToolStep.tsx:10-35`). The parent observed the same three-step runtime checklist and disabled later steps (`R`). The gap is the missing distinction between “identity exists,” “payout can receive a settled Provider amount,” “Tool is published,” and “Tool is currently routeable.”

**Path, reuse, dependency.** Keep the existing wizard and stepper. Add state copy and a single next-action summary derived from the existing Provider/tool/payout readbacks; do not introduce a second activation state machine. Product/commercial ownership must decide whether payouts are required before publication in each lane.

**Acceptance.** Test profile success, payout skip, Stripe return, first Tool draft, submitted, published, and routeability-blocked states as separate transitions. Each state has one accurate primary action and does not claim selling, payout, or buyer availability until its existing source fact says so. A refresh resumes the same step without silently marking an unpersisted step complete.

**Confidence:** `S+T+R`; the state and copy are source-backed, focused tests cover wizard transitions, and runtime confirms the entry presentation. Whether the copy is acceptable commercial policy is an owner decision.

### 4. P2 — Source GAP / runtime VERIFY: empty Provider profile copy contradicts the public read path

**Ideal.** The owner-facing state should accurately say whether an empty Provider identity is public, private, or waiting for its first Tool. Broader identity/distribution bridging is a separate roadmap question; external directory metadata should remain clearly labelled as metadata and must not silently become a claimed Provider identity.

**Current and gap.** Self-serve creation stores a programmable Provider with website and hostname identifier, `unpublished` status, and `claimed` trust tier (`convex/catalogOfferingMutations.ts:145-171`). The public listing copy says an empty Provider profile remains visible while its catalogue is prepared (`src/components/ae/listing/AeProviderListingPage.tsx:56-67`), but the public business projection is omitted unless the business is published and has at least one offering (`convex/catalogPublicReads.ts:344-355`). That copy/read-path mismatch is confirmed. The listing describes listed Tools and buyer-ready states (`src/components/ae/listing/AeProviderListingPage.tsx:77-130`, `:137-196`), while the x402 directory separately presents a hostname, indexed Tools, networks and reported Calls (`src/components/ae/market/DirectoryProviderHeader.tsx:27-50`). The broader gap between owner identity and demand distribution is a roadmap observation, not a separate current-release defect established here.

**Path, reuse, dependency.** Keep the owner identity, canonical public listing, and external x402 directory as distinct objects. Correct the empty-state copy or the read path so one contract is true; do not add a claim flow as part of this repair. On existing `/owner/operations`, `AeFactList`/status primitives may later show `unpublished`, `published`, `listed`, `ready now`, and `inspect only`. On `/for-providers`, explain that external x402 discovery is metadata and canonical publication is a separate owner step only when that future distribution work is scheduled. Do not auto-claim directory hosts.

**Acceptance.** Create identity with no Tool; verify the owner sees the exact unpublished state and no public claim is emitted. Publish, withdraw, and republish one Tool; verify listing, ready count, and owner state change consistently. An external hostname remains metadata until an explicit supported admission/claim contract exists.

**Confidence:** `S`; source establishes the empty-profile copy/read-path mismatch. No hosted buyer discovery or Provider claim journey was run, and the broader distribution vision remains unverified roadmap scope.

### 5. P2 — VERIFY hypothesis: source-native publication may concentrate too many decisions

**Ideal.** One primary decision per stage: choose source, choose Tool, describe commercial/operational terms, review and attest. Default safe values should be visible; advanced effects/data fields should be progressively disclosed without hiding a material consequence.

**Current and gap.** The four-stage flow is explicit and source-native (`src/components/ae/supply/AeSupplySourceNativeStart.tsx:174-208`). Terms pass name, description, category, service area, availability, price, connection, external effect, data release, financial exposure, data classification, and attestations (`src/components/ae/supply/SupplyPublicationFlow.tsx:117-166`). This is a decision-inventory hypothesis, not a confirmed defect: source-only inspection cannot establish the number of visible controls, visual salience, completion time, or user confusion. The inspected focused test proves the happy path, exact digest/revision, unsupported source handling, and no protocol-reconstruction fields (`tests/unit/ui/supply-source-native-start.test.tsx:218-320`).

**Path, reuse, dependency.** First run a bounded Provider task test. If users miss or cannot complete the terms, group them into “buyer-visible facts,” “access and source,” and “effects/data” using the existing `Field`/`RadioGroup`/`Alert`/`AeFactList`; otherwise retain the current flow. Do not create a generic form framework or rewrite source protocols. The Provider must still attest to material facts.

**Acceptance.** Keyboard and screen-reader traversal reaches every stage and returns to an edited stage without losing source digest/revision. Unsupported candidates remain actionable with a correction. A refresh resumes a draft. Submission payload retains exact pricing, connection, consequences, and attestations; no raw key or wallet secret field appears. Add focused tests for each terms group’s collapsed/expanded and validation states.

**Confidence:** `S+T`; source and inspected tests establish the flow and decisions. The cognitive-load concern is `VERIFY` until user evidence, completion telemetry, or a live keyboard/compact walkthrough exists.

### 6. P2 — VERIFY hypothesis: the workspace may combine too many jobs

**Ideal.** The first viewport should establish the next action, then separate Tools, availability/connections, earnings, and administration. Identity and offboarding can remain secondary, but they must be findable without knowing a hash or opening a generic settings disclosure.

**Current and gap.** `/owner/operations` is the only Supply navigation destination (`src/routes/_operator/owner.operations.tsx:16-50`). Once inventory exists, the page renders Tools, Tool availability, Earnings, then a collapsed “Provider settings and administration” disclosure containing identity and offboarding (`src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx:106-147`). The loader also reads lifecycle, connections, payouts, public status, and offboarding together (`src/routes/_operator/owner.operations.tsx:37-48`). This may increase scanning cost, but many sections and a collapsed secondary administration disclosure alone do not establish a defect without user evidence. No cold Provider task observation measured failure to find a panel.

**Path, reuse, dependency.** Validate the current one-shell route with a bounded cold task first. If findability fails, add a concise “Next action” block and small in-page links from existing continuation/blocker facts, reusing `AeSection`, `SummaryCard`, `AeFactList`, `AeEmptyState`, and current focus helpers. Do not create a “Provider Center” route or duplicate data loader.

**Acceptance.** From a cold owner page, a keyboard user can reach each job with labelled links and return focus after a deferred panel opens. Loading, empty, conflict, unavailable, and action-required states stay local to their section. The first action reflects the most urgent blocker, while destructive offboarding is still visually secondary.

**Confidence:** `S`; source establishes composition only. `VERIFY`: no complete desktop/compact/keyboard runtime walk or Provider user evidence was performed.

### 7. P2 — VERIFY: readiness-check labels must preserve the existing status distinctions

**Ideal.** Show a plain-language state, one next action, and the minimum facts needed to decide. Keep Tool version/source/publication separate from routeability and observed delivery. Put opaque references, reason codes, and provenance behind a technical disclosure. Label a readiness probe as a readiness probe.

**Current and strengths.** The status model distinguishes source, routeability, authority, connection, validation, publication, freshness, delivery, useful outcome, continuation, and owner handoff (`src/modules/capability-supply/provider-tool-status.ts:33-110`). The detail surface shows “Available to buyers,” a first reason, one primary action, a fact list, separate “Delivery and Qualified Use,” technical details disclosure, and guarded Withdraw/Republish actions (`src/components/ae/supply/AeProviderToolDetail.tsx:74-180`, `:240-277`). This is a retained strength: it keeps delivery, payment, publication, and buyer availability from collapsing into one status.

**Current gap and path.** “Qualified Use,” “routeable,” source digest, and Tool/Provider references are useful evidence but not all Provider language. The test playground calls `onRecheck` and returns a local status-200 projection with `verifiedAt` (`src/components/ae/supply/AeProviderToolDetail.tsx:141-160`), which can be read as a successful buyer execution if its label is not explicit. Keep the current state model and components; rename or subtitle the action to “Run readiness check,” and place raw evidence in the existing disclosure. Do not add another status model.

**Acceptance.** For every status and blocker, assert one displayed reason and one safe continuation. A readiness check never creates a buyer Call, Charge, earnings, delivery, or payout. Withdrawal preserves existing Calls/evidence; republish requires current source/authority/contract. Screen-reader text distinguishes Tool availability from observed delivery.

**Confidence:** `S+T`; status and detail contracts are source-backed, with focused handoff tests. Runtime availability labels and test-console interpretation remain unverified.

### 8. P2 — ROADMAP / VERIFY: earnings and payouts are a foundation, not a mandated reporting expansion

**Ideal when reporting maturity is funded.** Give the Provider an honest summary of source-recorded earnings, payout readiness, pending/settled transfer evidence, and the scope of history. Link to the official hosted payout account for KYC/bank details. When AE does not own statements or tax documents, say so and provide the safe support path. This is a roadmap option, not a mandate for a new reporting surface in the entry release.

**Current and gap.** Earnings are deferred inside the workspace and expose payout readiness (`src/components/ae/offerings/ProviderWorkspaceEarningsSection.tsx:28-45`). The card says setup/test calls do not create earnings, shows only the first ten currencies, and warns when the latest 100 ledger entries cap totals (`src/components/ae/supply/earnings-card/AeSupplyEarningsCard.tsx:60-68`, `:120-135`). These caps and disclosures are retained strengths because they prevent false completeness. Stripe-hosted payout actions are the maintained boundary, and no raw bank account is stored (`src/components/ae/supply/supplier-onboarding-wizard/components/PayoutsStep.tsx:16-65`). The absence of a standalone reporting route is a roadmap gap to verify against Provider needs, not a current-release defect.

**Path, reuse, dependency.** Keep `/owner/operations#earnings`, `AeSupplyEarningsCard`, `PayoutActionBar`, and official Stripe Connect/Express hosted surfaces. Do not handroll KYC, bank storage, or a second payout dashboard. Retain the current scope/truncation disclosures. Only add a reporting surface after Provider research and an explicit commercial/tax owner establish the need.

**Acceptance.** Exercise no-account, empty, unavailable, unauthenticated, ready, pending, transfer-unknown, and truncated ledger states. Stripe return restores focus and reads authoritative readiness. Setup/test actions leave earnings unchanged. Totals are never presented as complete when capped; transfer retry follows existing idempotency/reconciliation contracts.

**Confidence:** `S+T`; source and inspected earnings tests establish the limits and hosted boundary. The reporting-expansion need is `VERIFY`; external Stripe dashboard and settlement behavior are unverified.

### 9. P2 — VERIFY hypothesis: offboarding may be too hidden for a high-consequence job

**Ideal if findability evidence shows a problem.** A Provider can find “Leave safely” from the workspace, understand the freeze and obligations before confirming, see blockers, resume or cancel only when allowed, and retain history. The action should remain secondary and clearly destructive. The collapsed disclosure is a hypothesis for testing, not evidence that owners resort to support.

**Current and strengths.** The complete component is under a collapsed settings disclosure (`src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx:132-147`). Once opened, it uses Clerk reverification, idempotency keys, explicit `Freezing`, `Action required`, `Retired`, and `Cancelled` states, blocker copy, and a confirmation that says freeze cannot be rolled back (`src/components/ae/offerings/ProviderWorkspaceOffboardingSection.tsx:19-160`). Unit and integration tests cover blockers, ownership isolation, pre-freeze cancellation, post-freeze refusal, routeability freeze, and bounded retirement (`tests/unit/capability-supply/provider-offboarding.test.ts:9-42`; `tests/integration/capability-provider-offboarding.test.ts:63-73`, `:163-270`).

**Path, reuse, dependency.** Run a cold findability and keyboard task first. If the task fails, add a labelled secondary “Offboard Provider” link in the workspace administration summary and preserve `#offboarding` focus. Otherwise retain the current disclosure. Keep `AeConfirmDialog`; add no new retirement service or destructive shortcut. Hosted offboarding remains a release evidence dependency, as the maturity register records (`docs/operations/alpha-maturity-register.md:443-445`).

**Acceptance.** A cold owner can reach the section with keyboard and a direct hash. Confirming freezes routeability before retirement; unresolved Calls, obligations, payouts, or connections produce a named blocker and continuation. Repeated start/resume/cancel requests converge by idempotency key, and retained history remains readable. No UI claims deletion when only Provider retirement occurred.

**Confidence:** `S+T`; the source and inspected tests establish the workflow. `VERIFY`: hosted journey, visual discoverability, and user findability remain unverified.

### 10. P2 — Publication has no Provider-facing demand feedback, and support is not attached to Provider recovery

**Ideal.** After publication, show privacy-safe signals about where a Tool is discoverable, whether buyers can use it, and which demand gaps are known. When a Provider is blocked, the same surface should provide a safe support continuation with a correlation/reference value. Future demand signals must inform Provider decisions without exposing buyer data, auto-matching, or auto-purchasing.

**Current and gap.** The inventory exposes price, lifecycle, usage and an Activity link (`src/components/ae/offerings/AeOwnerOfferings.tsx:114-194`); the public landing correctly says publication does not guarantee demand or payout (`src/components/ae/supply/AeSupplyLanding.tsx:141-145`). There is no Provider demand-gap, buyer-fit, or distribution feedback surface in the current owner route. `/support` exists and accepts a safe reference (`src/routes/support.tsx:9-27`; `src/components/ae/support/help/components/PrivateSupportSection.tsx:10-30`), but Provider status handoffs generally stop at local recheck/reconnect/status actions. This is a future-market opportunity, not an entry-release blocker; Jev later matching remains outside the current buyer-only campaign.

**Path, reuse, dependency.** For the entry release, link Provider errors to `/support` only when a safe reference exists and retain local recovery first. For the future market, add a read-only section to the existing workspace using `AeSection`, `AeFactList`, and current exposure controls; do not create a demand database, ranking service, or automatic purchase path. Product, privacy, and demand owners must define the permitted signal before implementation.

**Acceptance.** Current release: every unrecoverable Provider error offers a safe reference and `/support` continuation without credentials, raw inputs, or private buyer data. Future release: a consented signal is owner-scoped, stale/withdrawn Tools disappear, no buyer identity is exposed, and no signal can authorize a Call. Validate against a held-out demand/matching measure before claiming improved distribution.

**Confidence:** `S`; current inventory/support source is present, while absence of a demand surface is bounded source inspection. No demand feedback or support handoff was observed in hosted runtime.

## Retained strengths

- **Source-first admission is the right seam.** The flow discovers native OpenAPI/MCP/Agent Plugin/x402 sources, selects exact candidates, retains source digest/revision, and keeps unsupported candidates visible with a correction. Tests cover refresh/resume and secrets-safe connection handoff (`src/components/ae/supply/AeSupplySourceNativeStart.tsx:20-166`; `tests/unit/ui/supply-source-native-start.test.tsx:63-216`).
- **Publication is separated from readiness and commercial outcomes.** Landing copy, status facts, and the Tool detail keep publication, routeability, delivery, useful outcome, earnings and payout distinct (`src/components/ae/supply/AeSupplyLanding.tsx:141-145`; `src/modules/capability-supply/provider-tool-status.ts:56-110`).
- **Pricing follows the existing canonical chain.** Owner inventory projects `pricingConfigJson` through `displayPriceFromPricingConfig`, and tests assert the rendered AUD amount (`src/components/ae/offerings/provider-workspace-projection.ts:118-133`; `tests/unit/components/ae-owner-offerings-inventory.test.tsx:116-126`). No new price formatter is needed.
- **Credential and payout boundaries are appropriately delegated.** The source flow uses owner-controlled connections without raw provider keys, and payouts use Stripe-hosted KYC/bank surfaces (`src/components/ae/supply/AeOwnerProviderConnections.tsx:19-81`; `src/components/ae/supply/supplier-onboarding-wizard/components/PayoutsStep.tsx:16-65`).
- **Lifecycle and offboarding controls are robust in source.** Status blockers fail closed; withdrawal/republish are confirmed; offboarding is reverifiable, idempotent, and obligation-aware. Preserve these controls while improving findability.
- **The existing design language is reusable.** DS-13 already directs providers toward an `AeCollectionRail` and ordered rows, with current legal/source copy retained (`docs/operations/design-system-maturity-register.md:200-207`). Use existing `AeOperatorPage`, `AeSection`, `AeCollectionRail`, `AeFactList`, `AeConfirmDialog`, `Field`, `Alert`, and Stripe’s official hosted SDK/surfaces.

## Accessibility and cognitive-load audit

The audit has no defensible visual measurements for contrast, rendered size, viewport fit, or timing. Those require a live desktop/compact/keyboard pass. The source does provide useful contracts: repeated actions use `min-h-touch`, sections have labels, asynchronous panels expose `aria-busy`/live feedback, the native flow marks the current step, and hash panels move focus (`src/components/ae/offerings/provider-workspace/useProviderWorkspaceSheets.ts:121-133`; `src/components/ae/supply/AeSupplySourceNativeStart.tsx:176-208`). Focused tests assert roles, labels, links, and focus-preserving row actions (`tests/unit/components/ae-owner-offerings-inventory.test.tsx:128-141`).

The cognitive-load procedure applied here counts remembered objects and decisions rather than inventing a visual score:

- Entry asks the Provider to remember source, Tool, authority, price, effects, evidence, publication, demand, and payout. The landing page reduces this to source fit plus four ordered steps; retain that grouping.
- Activation asks for identity, tax fact, payout, and first Tool. Make the next blocker and the effect of “Skip for now” explicit.
- Publication asks for source, candidate, terms, consequences, and attestations. Keep the four stages and reduce simultaneous visible choices through grouped progressive disclosure.
- Workspace asks for inventory, availability, earnings, identity, and exit. Keep the one route but provide an explicit next-action summary and labelled in-page links.
- Maintenance asks the Provider to interpret state, buyer availability, source health, publication, freshness, delivery, and qualified use. Put internal evidence behind the existing disclosure and use plain labels for the primary action.

Validation must include keyboard traversal, screen-reader names for state/action pairs, focus after deferred panel open and hash navigation, error announcements, compact layout, empty/conflict/unavailable states, and no raw secret exposure. These are acceptance checks, not claims that measurements have already passed.

## Sequencing and validation plan

**Entry-release order:**

1. Resolve the ABN contract mismatch or remove the unconsumed request/claim.
2. Repair connection handoff to the existing workspace panel.
3. Make activation state and payout optionality truthful.
4. Preserve source-native publication and add focused keyboard/resume coverage.
5. Add workspace next-action and reachable secondary administration links.
6. Keep hosted Stripe, Provider listing, support, and offboarding evidence explicit; do not substitute local tests for deployment proof.

**Future market order:** clarify public identity versus x402 directory metadata, add consented demand feedback, and decide whether Provider reporting/documents needs an AE-owned surface. These are product decisions and roadmap work; they do not gate the current Jev buyer journey.

**Behavioral validation commands (when the bounded fixes are implemented):**

```sh
node --version   # required: v22.x
npm --version    # required: 11.5.1
npm exec vitest run \
  src/components/ae/supply/supplier-onboarding-wizard/provider-identity-validation.test.ts \
  src/components/ae/offerings/provider-workspace/useProviderWorkspaceInventory.test.ts \
  tests/unit/ui/provider-tool-detail.test.tsx \
  tests/unit/ui/supply-funnel-publisher-home.test.tsx \
  tests/unit/ui/supply-source-native-start.test.tsx \
  tests/unit/capability-supply/provider-offboarding.test.ts
git diff --check -- docs/improvements/2026-09-21/platform-experience/provider.md
```

The current audit itself was docs-only and made no deployment, purchase, payout, external source, or network mutation. The focused test files above were inspected as evidence and were not executed by this subtask; no subagent test execution occurred. A hosted Provider connect/publish/withdraw/offboard journey remains open, consistent with `docs/operations/alpha-maturity-register.md:443-445` and its Provider supply rows (`:846-852`).
