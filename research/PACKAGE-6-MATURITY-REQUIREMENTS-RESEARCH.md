# Package 6 maturity requirements research

**Status:** research input for planning; not an implementation claim  
**Researched:** 2026-09-04, Australia/Perth  
**Repository baseline:** `main` at `6c9a943ef`, with a pre-existing dirty worktree  
**Question:** Which mature, current requirements should Package 6 bring into agent onboarding, Provider onboarding content, product language and contextual guidance without rebuilding commodity mechanics?

## Executive decision

Package 6 should make the existing product understandable, installable, resumable and truthful. It should not create another onboarding subsystem.

The minimum mature shape is:

```text
understand value
  -> inspect public supply
  -> choose one native client or Provider source path
  -> enter an official hosted/client ceremony only when required
  -> return to authoritative current state
  -> prove the first useful read
  -> continue from one durable next action
```

The Package 5 precedent remains controlling: adopt official transport, identity, payment, hosted-onboarding and protocol mechanics; own only Agentic Economy's Operation, authority, commercial and evidence semantics. A successful redirect, installed configuration, green client badge, payment acceptance or Provider response is never by itself proof of the next AE state.

Package 6 should close at **controlled maturity (L1)** for all onboarding and guidance surfaces and expose the **production controls (L2)** already present at consequential boundaries. It must not manufacture a polished L3 appearance over unproved staging, distribution or market behavior.

## Authority and method

Product meaning came from [PRODUCT.md](../PRODUCT.md), [CONTEXT.md](../CONTEXT.md), [the Package 6 roadmap](../IMPLEMENTATION_ROADMAP.md#6-onboarding-content-and-language--planned) and [DESIGN.md](../DESIGN.md). Current source and tests were used only to identify the local baseline. The [Package 5 atomic plan](../docs/designs/package-5-atomic-feature-build-plan.md), [Package 5 maturity comparison](./PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md), AE/Locus/Whop/Nevermined/TREG maturity papers and the whole-product papercut register (local reference: `.planning/audits/product-papercut-register-2026-09-03.md`) supplied candidate patterns.

Current wire and vendor mechanics were checked against first-party sources only:

- [MCP 2026-07-28 authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [base protocol](https://modelcontextprotocol.io/specification/2026-07-28/basic/index), [tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) and [official TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [OpenAI Codex MCP](https://developers.openai.com/codex/mcp/), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://cursor.com/docs/mcp) and [Cursor install links](https://cursor.com/docs/mcp/install-links)
- [Clerk redirect behavior](https://clerk.com/docs/guides/development/customize-redirect-urls)
- [Convex durable workflows](https://docs.convex.dev/agents/workflows) and the [official Workflow component](https://www.convex.dev/components/workflow)
- [Stripe hosted connected-account onboarding](https://docs.stripe.com/connect/marketplace/tasks/onboard) and [verification updates](https://docs.stripe.com/connect/handle-verification-updates)
- [Whop connected-account enrollment](https://docs.whop.com/developer/platforms/enroll-connected-accounts), [account links](https://docs.whop.com/api-reference/account-links/create-account-link), [verification resource](https://docs.whop.com/api-reference/verifications/verification) and [troubleshooting](https://docs.whop.com/developer/troubleshooting)
- [Nevermined five-minute setup](https://nevermined.ai/docs/integrate/quickstart/5-minute-setup) and [Agents SDK](https://nevermined.ai/docs/api-reference/typescript/agents)
- [Locus production quickstart](https://docs.paywithlocus.com/quickstart) and [agent integration](https://docs.paywithlocus.com/wrapped-apis/for-agents)
- [Agent Plugins 1.0.0](https://agent-plugins.org/specification), [OpenAPI version index](https://spec.openapis.org/oas/) and [x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [W3C form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/), [W3C multi-page forms](https://www.w3.org/WAI/tutorials/forms/multi-page/), the [GOV.UK Details pattern](https://design-system.service.gov.uk/components/details/), [GOV.UK validation recovery](https://design-system.service.gov.uk/patterns/validation/) and the [Australian Government plain-language guide](https://www.stylemanual.gov.au/writing-and-designing-content/clear-language-and-writing-style/plain-language-and-word-choice)

No live production, paid Call, real Provider publication or external account mutation was performed. Source and test presence does not prove deployed behavior.

## Adopt, adapt, reject and revalidate

| Decision | Bring into Package 6 | Boundary |
|---|---|---|
| **Adopt** | Public discovery before authority; native client installation; hosted identity/KYC/payout ceremonies; authoritative readback; exact error and required-action state; durable references; compact deterministic machine discovery; accessible error identification and correction. | Use the maintained owner of each mechanism. |
| **Adapt** | One recommended path, source-specific Provider fit, progressive disclosure, human-readable role language, first-success proof and one continuation. | Adapt the presentation to AE's Operation and commercial semantics, not vendor ontology. |
| **Reject** | General wallets, agent workflow/orchestration, custom OAuth, custom KYC/KYB, copied vendor status machines, vendor Product/Plan/Company/Agent ontology, client-screen scraping and a universal installer abstraction. | These either sit outside AE's product or duplicate maintained infrastructure. |
| **Revalidate** | Every published client command, MCP protocol revision, OAuth metadata shape, Provider source version, old papercut status and deployment-origin assumption. | Current official docs and one deployed revision control; research snapshots do not. |

## Candidate requirements

### 6A — Agent onboarding

#### P6-A1 — Value and public evidence precede connection

- **Requirement:** A cold user or agent can understand the outcome, search the live catalogue and inspect public Operation facts before being asked to connect. Authentication begins only when the selected action requires authority.
- **Evidence:** PRODUCT defines public catalogue and the short `search -> inspect -> invoke` path. MCP supports tool sets that vary by per-request authorization. The Locus/TREG maturity references and AE-PC-022 converge on public discovery before authority.
- **Current AE baseline/gap:** The public market and anonymous tools exist, and current copy says “Search first.” The `/for-agents` body immediately leads into installation and OAuth; the audited revision found that the stated browse-first sequence and onboarding sequence diverged. The current catalogue and staging behavior were not exercised in this research.
- **Acceptance proof:** From a clean browser and client profile, an unauthenticated user can obtain a real compact candidate and inspect its public facts. The first protected action returns the native authorization challenge without losing the Operation, input or intended action.
- **No-handroll boundary:** Reuse the existing public HTTP/MCP discovery contracts and OAuth challenge. Do not create a preview catalogue, demo-only search or onboarding-specific session.
- **Confidence/freshness:** **High** for the requirement; local live proof must be rerun on the Package 6 revision.

#### P6-A2 — One recommended path, with native alternatives

- **Requirement:** Present one recommended client path first. Each supported alternative receives its own official native action; alternatives are disclosed after the primary path rather than presented as equal first-step choices.
- **Evidence:** The roadmap explicitly requires one recommended installation path and progressive disclosure. Codex, Claude Code and Cursor publish different setup ceremonies; only Cursor documents an install link. There is no universal cross-client installer.
- **Current AE baseline/gap:** [AeAssistantInstallFunnel](../src/components/ae/console/AeAssistantInstallFunnel.tsx) presents three equal tabs and defaults visually to Codex. [cli-distribution.ts](../src/lib/cli-distribution.ts) already centralizes client-specific commands, which is the correct reuse point. The product has not yet stated why Codex is recommended or what evidence could change that choice.
- **Acceptance proof:** The first viewport names one recommended client, why it is recommended and one action. Claude Code and Cursor are reachable through one alternatives disclosure. Each action succeeds in a clean supported client version.
- **No-handroll boundary:** Do not build a universal installer, manipulate client config files directly or emulate a client's OAuth UI. Render official commands/deep links from the existing centralized client definition.
- **Confidence/freshness:** **High** on interaction requirement; **medium** on Codex as the default until usage/customer evidence confirms it.

#### P6-A3 — Native remote MCP ceremony, not credentials in prose

- **Requirement:** The golden path uses one canonical remote Streamable HTTP MCP endpoint and the client's native install/authentication ceremony. Users are never asked to copy API keys, OAuth tokens or secrets into AE instructions.
- **Evidence:** Current Codex supports `codex mcp add ... --url` plus `codex mcp login`; Claude Code supports `claude mcp add --transport http ...` plus `/mcp` or `claude mcp login`; Cursor supports remote MCP and native OAuth. MCP 2026-07-28 requires standards-based Protected Resource Metadata, resource binding and authorization-server discovery.
- **Current AE baseline/gap:** The source already emits native commands and no raw agent key. Cursor's current source command is CLI JSON, while official Cursor documentation now emphasizes Marketplace/Add-to-Cursor installation. Exact current client behavior remains a release proof, not a source claim.
- **Acceptance proof:** Clean-profile tests show configuration, authorization, discovery, logout/revoke and reconnect in every supported client without displaying or persisting an AE token in page copy, command history or client config.
- **No-handroll boundary:** Use the official client and official MCP SDK. Do not add a token paste flow, custom PKCE client, callback listener or client-config writer.
- **Confidence/freshness:** **High**, official docs checked 2026-09-04; client minimum versions are not consistently published.

#### P6-A4 — “First successful connection” means a useful AE readback

- **Requirement:** Keep configured, connected, authenticated and caller-viable as separate states. Onboarding completes only after the client performs one live AE read proving the server, current caller context when authenticated, and a useful market result or a truthful exact blocker.
- **Evidence:** Claude explicitly says `mcp add` only confirms configuration was written and some status values are configuration decisions. Cursor provides no authoritative first-call completion guarantee. Stripe similarly states that browser return is not proof of completed onboarding. The maturity references consistently require current-resource readback.
- **Current AE baseline/gap:** Source contains client status commands and an `ae_agentAccess_whoami` tool, but the public funnel does not present or execute a first-success verification. The unit test title says “verification” while asserting only commands and copy.
- **Acceptance proof:** A black-box journey performs: install → native OAuth where required → tool discovery → public Operation search → authenticated `whoami` or equivalent caller readback. Failure identifies exactly which state failed and gives one next action.
- **No-handroll boundary:** Reuse existing MCP tools and client commands. Do not introduce a parallel ping protocol, synthetic success flag or browser-only completion record.
- **Confidence/freshness:** **High**.

#### P6-A5 — Current MCP authorization and compatibility are release requirements

- **Requirement:** Publish and prove an explicit MCP/client compatibility matrix. The server must satisfy the current authorization contract: Protected Resource Metadata, issuer validation, exact resource/audience binding, least-privilege challenges, `401` for absent/invalid authorization and `403 insufficient_scope` for an authenticated insufficient grant.
- **Evidence:** MCP 2026-07-28 is the current final revision. It prefers Client ID Metadata Documents (CIMD), deprecates Dynamic Client Registration (DCR) but retains it for compatibility, adds issuer validation and requires all scopes needed for one operation to be returned in one challenge. Its core is stateless and no longer has `initialize` or a session header.
- **Current AE baseline/gap:** `package.json` contains official MCP client v2.0.0 and legacy monolithic SDK v1.30.0. Current tests and the September audit include 2025-era initialization. Which revision each route and supported client actually negotiates requires black-box proof. AE's advertised safe scope set includes `offline_access`; the current MCP spec says a protected resource should not advertise `offline_access` as a resource requirement, so metadata/challenge placement needs revalidation rather than a copy change.
- **Acceptance proof:** The support matrix records client build, negotiated protocol revision, registration method, install/auth/search/readback/restart/revoke result and known limitation. Tests exercise current and required legacy negotiation. No support claim is published without passing evidence on the same deployed revision.
- **No-handroll boundary:** If a protocol migration is required, use official MCP SDK v2 and its supported compatibility behavior. Do not build a parallel MCP stack or custom revision negotiation. Keep the migration as a separately scoped prerequisite if it exceeds Package 6 content work.
- **Confidence/freshness:** **High** on the standard; **medium** on AE's present negotiated behavior because it was not run here.

#### P6-A6 — Compact and deterministic cold entry

- **Requirement:** First-use machine context exposes only the compact `search -> inspect -> invoke -> result/recover` path, in deterministic order, with stable schemas and links to deeper material. It must not preload every schema or repeat protocol documentation.
- **Evidence:** MCP 2026-07-28 requires deterministic caller-visible tool lists and adds cache metadata. The AE context-efficient source research, TREG papercuts and AE-PC-023 show that large manifests and tool lists consume context before value.
- **Current AE baseline/gap:** Generated `/llms.txt`, `/SKILL.md`, action registry and discovery parity tests already establish shared sources. The audited technical manifest was 244,527 bytes and the MCP list 37,489 bytes on that revision; those numbers must be remeasured, not assumed current.
- **Acceptance proof:** Exact byte/token budgets are set in the Package 6 plan and measured on the deployed artifacts. A cold agent locates the primary path without loading Provider, operator or full-schema planes. Generated parity tests and a real-client prompt prove the same action order.
- **No-handroll boundary:** Reduce/project the existing generated manifest and action registry. Do not author a second machine guide or tool-search subsystem.
- **Confidence/freshness:** **High** on the requirement; historical payload sizes require remeasurement.

### 6B — Provider onboarding content

#### P6-B1 — Public Provider page is a fit-and-outcome decision

- **Requirement:** Before sign-in, the Provider page explains: who fits, the bounded outcome, supported source families, what evidence/access is required, whether a safe readiness call may cost or cause effects, the normal stages, and what publication does and does not guarantee. It ends with one start-or-resume action.
- **Evidence:** The roadmap asks for time, requirements and outcomes with one clear start. W3C recommends logical form stages and visible progress. Stripe and Whop show that exact verification timing and requirements can change by account and must be read from current resource state.
- **Current AE baseline/gap:** [AeSupplyLanding](../src/components/ae/supply/AeSupplyLanding.tsx) has a strong four-step outline and one CTA, but its preparation section exposes selectors, schemas, decimal exponents, source variants and credential mechanics before sign-in. It gives no evidence-based duration and mixes public fit with implementation reference.
- **Acceptance proof:** A comprehension review can answer “Is this for me?”, “What must I have?”, “Can the test touch my upstream?”, “What happens next?”, “How long is known/unknown?” and “What does Published mean?” without opening protocol docs. No fixed review duration appears unless a current authority provides it.
- **No-handroll boundary:** Re-express existing Package 5 facts. Do not create new onboarding stages, eligibility rules, readiness checks or estimated timings.
- **Confidence/freshness:** **High**.

#### P6-B2 — Protocol mechanics live in versioned source documentation

- **Requirement:** Move selectors, schemas, transport fields, protocol examples, supported subsets and credential mechanics into source-specific documentation. Public copy links to that documentation and names the exact versions AE supports.
- **Evidence:** OpenAPI's current index includes 3.2.0 while Package 5 targets 3.1; MCP's current revision is 2026-07-28; Agent Plugins 1.0.0 is published; x402 v2 has its own normative fields and non-terminal settlement semantics. A generic “OpenAPI/MCP/x402 supported” claim is therefore insufficient.
- **Current AE baseline/gap:** Package 5 source-native preview is the correct implementation authority. Public content currently paraphrases technical selectors and examples. Existing generated developer artifacts can carry exact routes and schemas, but this research did not establish a single Provider documentation landing page.
- **Acceptance proof:** Each supported source family has one versioned page generated from or tested against the existing source contract. Unsupported versions/features are explicit. Links from the public page resolve, examples pass against the Package 6 revision, and version drift fails a documentation parity check.
- **No-handroll boundary:** Link to normative upstream specifications and project existing parser/support facts. Do not rewrite whole protocols, invent a universal schema or add another parser to serve documentation.
- **Confidence/freshness:** **High**; exact AE source-version support must be confirmed from tests before publication.

#### P6-B3 — Sign-in and hosted handoffs preserve the exact draft

- **Requirement:** Starting or resuming Provider onboarding must preserve source, draft/attempt, selected candidate and intended next action through Clerk sign-in and any official hosted/SDK handoff. A browser return triggers authoritative readback; it never marks the step complete by navigation alone.
- **Evidence:** Clerk persists a previous URL through `redirect_url` and current fallback redirect props; Stripe explicitly says `return_url` means only that the hosted flow was exited and requires account retrieval/current requirements. Whop account links are expiring hosted resources with stable company/verification IDs. Package 5 already adopted the same readback doctrine.
- **Current AE baseline/gap:** Sign-in routes use Clerk `fallbackRedirectUrl`, Provider routes carry continuation context, and Package 5 records these papercuts as source-resolved. Staging browser, second-tab, restart and expired-attempt behavior remain release gates.
- **Acceptance proof:** Signed-out start, sign-up instead of sign-in, browser back, second tab, expired external link and fresh-process resume all return to the same durable draft or an exact expired/restart action. Readback—not callback parameters—determines current state.
- **No-handroll boundary:** Use Clerk redirect behavior, official account-link/SDK ceremony and existing Package 5 attempts. Do not add a cookie/session wizard or copy vendor state into an onboarding state machine.
- **Confidence/freshness:** **High** on the pattern; deployed proof outstanding.

#### P6-B4 — Requirements and timing are current evidence, not promises

- **Requirement:** Provider onboarding content distinguishes AE requirements, upstream requirements, verification in progress, current blockers and unknown timing. It displays deadlines/durations only when supplied by the owning authority with freshness.
- **Evidence:** Stripe requirements can move from future to currently due and disable a capability; Stripe advises assuming related functionality remains disabled during verification. Whop exposes current verification status plus machine code and human reason. Neither vendor status establishes AE publication or commercial role.
- **Current AE baseline/gap:** Package 5's eight-state Supplier Operation projection and reason/continuation model are the correct AE surface. Public copy currently provides general stages but no provenance/freshness treatment for time or external requirements.
- **Acceptance proof:** Test fixtures cover current, stale, in-review, action-required and unknown upstream state. The page names the source and observation time, never maps “verified” directly to “Published,” and supplies one current corrective action.
- **No-handroll boundary:** Read official current resources through existing adapters. Do not copy Stripe/Whop enums, create universal review SLAs or infer readiness from redirect/event receipt.
- **Confidence/freshness:** **High**.

### 6C — Product language system

#### P6-C1 — Canonical terms preserve commercial distinctions

- **Requirement:** Every consequential human and machine surface uses `CONTEXT.md` for Operation, Business Principal, Agent Principal, Account, Mandate, Provider, Seller, payment recipient, Invocation, Call, Funding, Charge, Payout, Outcome evidence, Continuation and commercial closure. Short public language may define a term; it may not substitute a false simpler model.
- **Evidence:** PRODUCT and DESIGN require the same object, role and state across public, market and operator modes. WCAG consistent identification supports stable labels for repeating functions.
- **Current AE baseline/gap:** Canonical language is defined. Public/source residue still uses “supplier” as a role, describes “one wallet,” and says Providers are paid after delivery. These conflict with the Account/Prepaid balance model and with separation of delivery, Provider obligation, Payout and commercial closure. Compatibility identifiers using old terms may need to remain.
- **Acceptance proof:** A term inventory over routes, generated documents, action descriptors, errors and CLI output has zero unexplained role/state substitutions. Compatibility exceptions are enumerated, machine-stable and never presented as product truth.
- **No-handroll boundary:** Extend the existing copy map and feature-owned constants. Do not add a CMS, translation framework, runtime terminology mapper or second domain glossary.
- **Confidence/freshness:** **High**.

#### P6-C2 — One owning source per claim or action

- **Requirement:** Brand claims come from the existing brand-copy authority; functional labels/errors remain with the owning feature; machine instructions and schemas project from the existing action/discovery contracts. Repeated text must not become separately editable truth.
- **Evidence:** COPY-MAP.md (local reference: `.planning/COPY-MAP.md`) already defines these ownership lanes. DESIGN requires human/machine parity. OpenAPI exists specifically to let human and machine tooling derive understanding from one interface description.
- **Current AE baseline/gap:** Central brand copy and generated discovery parity exist. The Provider landing and support page still contain substantial local product/technical language, and some public claims have drifted from PRODUCT.
- **Acceptance proof:** Every changed string is assigned an owner. Cross-surface contract tests compare roles, states, action names, price semantics and retry language. No same claim is maintained independently in multiple route components.
- **No-handroll boundary:** Refactor into existing owners only when a second real consumer exists. Do not create a generic content engine, copy database or universal presentation envelope.
- **Confidence/freshness:** **High**.

#### P6-C3 — Claims name evidence and implementation boundary

- **Requirement:** Language distinguishes known, unknown, stale, Provider-claimed, AE-observed, buyer-reported and derived facts. It must not claim principal-reseller completeness, payment, useful delivery, caller viability or production support beyond source plus deployed evidence.
- **Evidence:** PRODUCT's explicit-truth principle and DESIGN's evidence language are direct authorities. x402 v2 permits `settlement_pending`, confirming that settlement can be non-terminal. Nevermined/Whop success concepts remain vendor evidence, not AE commercial truth.
- **Current AE baseline/gap:** The domain model contains provenance and uncertainty. Public “paid after delivery” language collapses separate states; Package 5 is source-complete but release-gated; Package 4 still gates production paid supply.
- **Acceptance proof:** Claim review traces every consequential sentence to a current domain field or release proof. Tests cover unknown/stale/claimed/observed wording. Production-only claims are disabled until their named gate is current.
- **No-handroll boundary:** Reuse existing provenance/state. Do not add confidence scores, universal quality labels or copy-only completion states.
- **Confidence/freshness:** **High**.

### 6D — Contextual guidance

#### P6-D1 — One reason, owner and continuation

- **Requirement:** Every non-terminal or refused state supplies: what happened, what remains unchanged, who can act, one valid next action, retry safety, a stable reference and—only where a Business Principal must act—one owner handoff.
- **Evidence:** CONTEXT defines Continuation exactly this way. MCP current authorization asks servers to emit all scopes needed for one operation in one challenge rather than serial prompts. Whop troubleshooting distinguishes retryable current-state conflict from malformed/auth/permission errors. WCAG 3.3.1/3.3.3 requires textual error identification and known correction suggestions.
- **Current AE baseline/gap:** Existing action contracts, reason codes and support copy cover several safe actions. The papercut audit found generic approval, receipt, Provider and infrastructure failures, missing request references and origin-losing CLI continuations.
- **Acceptance proof:** A contract matrix covers validation, unauthenticated, insufficient authority, insufficient balance, unavailable Operation, possible dispatch, stale state, hosted-action required and infrastructure failure. Each state has exactly one executable continuation or one owner handoff, and no unsafe retry after possible dispatch.
- **No-handroll boundary:** Project existing reason codes/action descriptors. Do not introduce another error taxonomy, workflow engine or page-local retry policy.
- **Confidence/freshness:** **High**.

#### P6-D2 — Empty, zero, unavailable, blocked and unknown are distinct

- **Requirement:** Empty states say what is absent and how value begins; confirmed zero is rendered as zero; unavailable identifies the failed authority/dependency; blocked names the prerequisite; unknown stays unknown. None uses another state's recovery action.
- **Evidence:** PRODUCT/DESIGN prohibit inferred truth. AE-PC-005, 015, 033 and 044 show false-green health, missing receipts framed as money uncertainty, zero displayed as unknown and validation without field identity.
- **Current AE baseline/gap:** Several empty/error components already exist, but the register is point-in-time and must be rerun. Current support says users should retain a request reference even when some error views do not display one.
- **Acceptance proof:** Black-box fixtures render all five states across web and machine surfaces with matching codes, text, amounts and actions. Infrastructure failures expose a copyable safe request reference. A missing/invalid record never becomes “payment may have moved.”
- **No-handroll boundary:** Reuse the existing problem envelope, status presentation and empty-state components. Do not create local state enums or fake zeros.
- **Confidence/freshness:** **High**; individual papercut status requires current rerun.

#### P6-D3 — Advanced diagnostics are disclosed, essential action is not

- **Requirement:** Put request IDs, protocol/version detail, raw reason codes and operator diagnostics behind a labelled disclosure. Keep the user-visible cause, consequence and valid action visible. Do not hide facts most users need.
- **Evidence:** The GOV.UK Details pattern is for information only some users need and explicitly warns against hiding majority-needed content. The roadmap requires advanced diagnostics behind disclosure. W3C requires concise, clear success/error notification.
- **Current AE baseline/gap:** Support currently exposes command-level diagnostics and request-reference guidance on the main page. The Provider landing exposes protocol details in the primary fit decision. Existing UI primitives can express disclosure; no new interaction primitive is justified.
- **Acceptance proof:** Without expanding details, a user can recover. Expanding details gives the exact request reference, code, source observation and support-safe material without secrets/private inputs. Keyboard, screen-reader and 320px/200% zoom checks pass.
- **No-handroll boundary:** Use the existing disclosure/alert/section primitives and browser semantics. Do not create a custom accordion, animated diagnostics console or raw-log viewer.
- **Confidence/freshness:** **High**.

#### P6-D4 — Guidance survives sign-in, restart and external ceremony

- **Requirement:** Any action requiring human authority or external evidence is represented by a durable status reference and can be resumed from a fresh process. Page copy and transient toasts may explain the action but cannot be its only carrier.
- **Evidence:** PRODUCT mandates resumability. Stripe return has no completion state and requires current retrieval. MCP 2026-07-28 is stateless; identity and continuation cannot be inferred from a connection or session. Convex's official Workflow component supports durable long-running work, but Package 6 should consume existing Package 5/Call authorities rather than create a new workflow.
- **Current AE baseline/gap:** Invocation, funding and Provider attempts already expose durable identities and readback paths. Package 5 second-tab/restart/expired-attempt staging proof remains open. Some support actions still route to generic pages or literal `$ORIGIN` commands.
- **Acceptance proof:** Close the browser/client after each handoff point, reopen from only the stable reference and complete/cancel/reconcile without conversation state. The status response still names the same owner, action and retry rule.
- **No-handroll boundary:** Reuse current durable records, existing Workflow only where already selected, and Clerk/vendor returns. Do not add a Package 6 task engine, local-storage wizard or hidden session continuation.
- **Confidence/freshness:** **High**.

#### P6-D5 — Accessible, consistent and private-safe support

- **Requirement:** Success, error and progress messages are announced without moving focus unexpectedly; repeating actions use the same accessible name; multi-stage onboarding shows current progress; support accepts a safe request reference without requiring disclosure of credentials, private inputs or results. A private path must exist for billing, privacy and security matters.
- **Evidence:** WCAG 2.2 covers consistent identification, error identification/suggestion, status messages and error prevention for financial/legal actions. W3C form guidance recommends logical stages, retained input and progress. AE-PC-027 found GitHub-only support unsuitable for private incidents.
- **Current AE baseline/gap:** Existing components include accessible copy feedback, alerts and route tests. Remaining audited risks include SPA focus, placeholder contrast, high-zoom overflow, unannounced loading and GitHub-only support. These are current-audit candidates, not all confirmed open on `main`.
- **Acceptance proof:** WCAG 2.2 AA automated plus keyboard/screen-reader spot checks cover the four Package 6 journeys. A private support route accepts the safe reference and redacts/rejects secrets. Public GitHub support is clearly labelled as public developer support.
- **No-handroll boundary:** Use existing design-system components, Clerk and the selected first-party support capability. Do not build a ticketing platform, focus framework or form component library in Package 6.
- **Confidence/freshness:** **High** on requirement; implementation owner for private support remains open.

#### P6-D6 — Human and machine guidance have one semantic contract

- **Requirement:** Web, HTTP, MCP, CLI and generated documentation use the same state, reason, money role, action name, retry class and durable reference. Human surfaces may explain more; they cannot add hidden authority or a different lifecycle.
- **Evidence:** DESIGN's machine-parity contract is explicit. The Package 5 shared Supplier Operation projection is the working precedent. AE-PC-006, 008, 025, 032 and 044 show the cost of parity drift.
- **Current AE baseline/gap:** Shared action/discovery registries and parity tests exist. Package 5 machine paths are source-complete but real-client proof is open. Support and public pages still contain local guidance outside those registries.
- **Acceptance proof:** Contract tests start from one fixture per state and compare all surfaces. Real-client smoke proves the emitted continuation works unchanged. A repository scan finds no duplicate status label map, retry table or per-surface lifecycle.
- **No-handroll boundary:** Extend the existing action registry, projector and generated artifacts. Do not build a universal response envelope or duplicate human-only state machine.
- **Confidence/freshness:** **High**.

## Material contradictions and version drift

| Area | Current evidence | Package 6 treatment |
|---|---|---|
| MCP revision | MCP 2026-07-28 is final and stateless; current official TypeScript SDK v2 implements it. Earlier AE audits and tests exercised initialization-era MCP. | Make protocol/client compatibility a release gate. Do not silently rewrite transport during content work. |
| Codex documentation | Codex supports current CIMD/DCR and issuer-aware callbacks, but the same current page still describes server `instructions` as arriving during initialization, which the 2026 core removed. A stable shared Codex CIMD document is “coming soon.” | Trust black-box client behavior over prose where the official page contradicts the current spec. Pin evidence to the tested Codex build. |
| Claude Code | Current docs distinguish config-written, approval, authentication and connection. Version 2.1.232+ uses its v2 runtime, while some managed paths remain legacy-compatible. | Do not equate `Added` or a cached status with AE caller viability. Test the exact supported path. |
| Cursor | Current docs favor Marketplace/Add-to-Cursor and OAuth, still document SSE, and publish no protocol-version floor or first-call verification. | Treat the current JSON CLI command as unproved until exercised. Do not promise a universal deep link. |
| Locus maturity paper | The local maturity paper records a Locus Pro OAuth/Agent Connection model. Current public Locus docs instead lead with wallet creation, API keys and a `SKILL.md`; the old `/locus-pro/*` docs were not found as current authority. | Retain only historical patterns such as explicit verification and bounded recovery. Do not cite old Locus mechanics as live or import its wallet/API-key onboarding. |
| Nevermined | Current docs route their index through `docs.nevermined.app` and use Agent/Plan/credit terminology. They still provide official SDK registration and app onboarding. | Use only official SDK mechanics for an authorised Nevermined lane. Never map its Agent/Plan to AE roles. |
| OpenAPI | The official index now includes 3.2.0; Package 5 states OpenAPI 3.1 support. | Public/provider docs must name AE's tested subset rather than imply latest-version support. |
| Stripe | Current marketplace onboarding docs use v2 Account objects/events; AE has an installed Stripe SDK and existing adapter whose exact resource version was not verified here. | Adopt hosted ceremony/readback semantics. Revalidate exact API objects against the existing adapter before changing code or docs. |
| Clerk | Current Clerk Core 3 docs use fallback/force redirect properties and mark older `afterSignIn`/`afterSignUp`/`redirectUrl` props deprecated. AE source uses `fallbackRedirectUrl`. | Preserve the existing supported redirect seam; test exact continuation rather than adding a wrapper. |
| Product terms | The roadmap heading says Supplier onboarding, while current CONTEXT defines Provider as the commercial role and “supplier connection” as a technical relationship. Public copy still uses supplier/wallet/delivery-equals-payment language. | CONTEXT wins for new product language; retain legacy identifiers only for compatibility and document exceptions. |
| Papercut register | The 4.9/10 score and 44 items belong to the September 3 audited revision. Several Package 5 items are source-resolved but not staging-proved. | Rerun the affected journeys on one Package 6 baseline; never close or reopen by reading source alone. |

## Prioritized minimal Package 6 requirement set

These are the minimum requirements to carry into the atomic Package 6 plan. Everything else should remain a non-goal until one of them proves a concrete gap.

| Priority | Requirement | Close condition |
|---:|---|---|
| 1 | **P6-A5 — current MCP/client compatibility** | One deployed revision passes the explicit Codex/Claude/Cursor matrix; migration, if needed, is separately scoped to official SDK v2. |
| 2 | **P6-A4 — first useful read** | Clean client reaches public search and authenticated current-caller readback; native status alone cannot pass. |
| 3 | **P6-A1 — public value before authority** | Search and public inspection work before auth; protected challenge preserves intent. |
| 4 | **P6-A2/A3 — one recommended native path** | One justified primary path and one official action per alternative; no secret paste or universal installer. |
| 5 | **P6-B3 — exact resumability** | Sign-in, hosted returns, second tabs, expiry and restart all recover the same Provider draft from durable state. |
| 6 | **P6-B1/B2 — layered Provider content** | Public fit/time/requirements/outcome page plus versioned, tested source-specific documentation. |
| 7 | **P6-C1/C3 — canonical and truthful language** | No unexplained role/state synonym; no claim outruns evidence or collapses delivery, settlement and closure. |
| 8 | **P6-C2/D6 — one semantic source** | Brand, functional and machine strings stay in their existing authorities; parity tests cover every changed state/action. |
| 9 | **P6-D1 — one reason and next action** | Every refused/non-terminal state names reason, owner, retry safety, reference and at most one continuation plus optional owner handoff. |
| 10 | **P6-D2 — honest state vocabulary** | Empty/zero/unavailable/blocked/unknown fixtures render distinctly across human and machine surfaces. |
| 11 | **P6-D3/D5 — progressive, accessible support** | Essential recovery stays visible; diagnostics disclose safely; Package 6 flows pass WCAG checks and private incidents have a private path. |
| 12 | **P6-A6 — bounded cold context** | Measured byte/token budgets pass; cold entry loads only the primary path and exact selected detail. |

### Explicit non-goals

- General agent runtime, project planning, memory or orchestration.
- Customer crypto wallets or generalized treasury UX.
- New workflow/queue infrastructure.
- KYC/KYB, payout-method or identity-verification infrastructure.
- A vendor-neutral Provider registration framework.
- Migration to Whop, Locus or Nevermined ontology.
- New design system, onboarding framework, documentation CMS or support-ticket platform.
- New commercial-closure, tax, privacy or legal-policy implementation; Packages 4 and 7 own those boundaries.

## Open questions for the Package 6 plan

1. **Which client is the recommended path?** Codex is the current default and project context, but the decision needs customer/use evidence rather than tab order.
2. **What exact client builds and MCP revisions are supported at Package 6 close?** Codex and Cursor publish no simple minimum-version floor.
3. **Does the current AE MCP server fully negotiate 2026-07-28, and which route still depends on the legacy SDK?** This must be answered by source tracing plus black-box negotiation before planning copy.
4. **Is AE's OAuth metadata placement of `offline_access` conformant to the 2026 protected-resource guidance?** Revalidate metadata and challenges; do not infer from the scope constant alone.
5. **Should Cursor's primary action be an official Add-to-Cursor link, Marketplace listing or the current CLI JSON command?** Choose only after clean-profile proof and distribution ownership are established.
6. **Where will source-specific Provider documentation live, and which existing generated contract owns its examples?** No new documentation engine is justified.
7. **Which duration can AE honestly state for each Provider path?** Unknown is acceptable; only current AE or upstream evidence may supply a number.
8. **What is the private first-party support channel and retention boundary?** Package 6 needs the route; Package 7 owns full privacy/terms maturity.
9. **Which papercuts remain open on the Package 6 baseline?** Rerun, do not copy the September 3 statuses.
10. **What is the smallest safe real Operation fixture for onboarding proof?** Package 6 needs it as external evidence but should not absorb catalogue seeding or Package 4 production-money work.

## Planning gate

Do not begin Package 6 implementation until the plan records:

1. the selected recommended client path and supported-client/version matrix;
2. the current deployed MCP revision and any separately scoped compatibility prerequisite;
3. the exact existing owner for every changed claim, state and action;
4. current rerun results for the Package 6-related papercuts;
5. the Provider public/detail content split and source-version truth;
6. black-box proof fixtures for public browse, native connection, Provider resume, every guidance state and fresh-process recovery; and
7. a repository closure scan proving no custom OAuth, credential setup, KYC, workflow, protocol parser, status machine, universal installer, copy framework or duplicate action taxonomy landed.
