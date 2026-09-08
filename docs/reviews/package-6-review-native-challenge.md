# Package 6 native integration and adversarial challenge

**Reviewed:** 5 September 2026  
**Scope:** OpenAI plugin/auth/distribution readiness, native MCP fallbacks, four anonymous public tools, and the shared skill.  
**Boundary:** Read-only review of the dirty `main` checkout. No source, branch, deployment, registration, installation, or production change was made. This file is the only review artifact added.

## Verdict

The chosen shape is sound: one plugin can combine one remote MCP server and one maintained skill, the same skill is served at `/SKILL.md`, public discovery precedes account connection, and Codex's explicit `mcp add` plus `mcp login` path is a legitimate fallback. The implementation is not ready for a public OpenAI claim. `app.aecon.ai` does not resolve, no registered connection or installed-client evidence exists, and the current OAuth server does not process the OAuth `resource` parameter required by the current OpenAI/MCP authorization contract. ChatGPT's protected-tool-triggered linking path is also absent from the serialized tool contract.

These are three different conclusions:

1. **Approach:** supported and appropriately bounded.
2. **Local implementation:** plugin/skill/public discovery exist; native auth compatibility has defects.
3. **Actual client/publication proof:** blocked and absent.

Package 6 should remain open. This does not require Package 6 to rebuild Package 4/5 commercial controls. The production, legal, support, publisher, real-Operation and commercial gates correctly remain release gates.

## Findings

### P1 — OAuth ignores the protected `resource` requested by OpenAI clients

**Classification:** implementation defect; public native auth release blocker. No exploit is claimed without a deployed reproducer.

OpenAI's current authentication guide says an authenticated plugin must follow the MCP authorization contract, including echoing the `resource` parameter through the authorization flow and rejecting tokens that are not for the MCP resource. It says ChatGPT appends `resource` to both authorization and token requests ([OpenAI authentication guide](https://developers.openai.com/plugins/build/auth)).

AE publishes coherent protected-resource and authorization-server documents in [`src/lib/http/oauth-challenge.ts:34`](../../src/lib/http/oauth-challenge.ts#L34) and [`src/lib/server/agent-access-oauth-api.ts:740`](../../src/lib/server/agent-access-oauth-api.ts#L740). However, authorization request parsing reads client ID, redirect URI, state, response type, PKCE challenge, scopes and authorization details, but never reads or validates `resource` ([`src/lib/server/agent-access-oauth-api.ts:325`](../../src/lib/server/agent-access-oauth-api.ts#L325)). Authorization-code and refresh exchanges likewise omit it ([`src/lib/server/agent-access-oauth-api.ts:793`](../../src/lib/server/agent-access-oauth-api.ts#L793), [`src/lib/server/agent-access-oauth-api.ts:814`](../../src/lib/server/agent-access-oauth-api.ts#L814)). A repository search found no OAuth `resource` request handling.

The issued bearer is an opaque AE/Clerk API key and AE validates current key state, scopes and the stored Principal binding ([`src/lib/server/agent-access-auth.ts:128`](../../src/lib/server/agent-access-auth.ts#L128)). That may make the token practically single-service today, but it does not satisfy or prove the required protocol binding. Do not inflate this into a demonstrated cross-resource token vulnerability; the proven defect is failure to process a required native-client parameter.

**Gate:** accept and validate the exact canonical resource through authorization and token exchange using an officially supported implementation, then prove the flow in the named OpenAI clients.

### P1 — ChatGPT protected-tool linking is not represented on the wire

**Classification:** implementation defect for the claimed ChatGPT first-protected-action journey; it does not prove that every OAuth route is broken.

The current OpenAI guide is explicit that ChatGPT's tool-level OAuth UI requires both per-tool `securitySchemes` plus protected-resource metadata, and a tool error carrying `_meta["mcp/www_authenticate"]`. It also recommends per-tool declarations for mixed anonymous/authenticated servers ([OpenAI authentication guide, “Triggering authentication UI”](https://developers.openai.com/plugins/build/auth#triggering-authentication-ui)).

AE's anonymous `tools/list` contains exactly four public reads and hides every protected tool ([`tests/unit/server/mcp-api-tools-list.test.ts:17`](../../tests/unit/server/mcp-api-tools-list.test.ts#L17)). The server registers title, description, input schema and standard annotations, with neither `securitySchemes` nor auth metadata ([`src/lib/server/mcp-api.ts:276`](../../src/lib/server/mcp-api.ts#L276)). A direct protected `tools/call` returns an HTTP 401 `WWW-Authenticate` response before a tool result exists ([`src/lib/server/mcp-api.ts:442`](../../src/lib/server/mcp-api.ts#L442)). The public tool list therefore gives ChatGPT no protected tool whose invocation can trigger the documented tool-level linking flow.

This does **not** justify “OAuth cannot work.” Codex documents a separate resource-level flow, `codex mcp login <server-name>`, and AE's recommended Codex setup explicitly runs `mcp add` then `mcp login` ([`src/lib/cli-distribution.ts:41`](../../src/lib/cli-distribution.ts#L41); [official Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp)). ChatGPT may also connect an account from plugin settings or during installation. Those paths are plausible but have no same-revision client evidence here. The unsupported claim is specifically that selecting the first protected action can initiate native linking from this serialized catalogue.

**Gate:** prove the chosen ChatGPT connection path using its actual scanned tool metadata. If first-protected-tool linking remains the claim, emit the metadata and result challenge required by the current guide through an officially supported SDK/integration.

### P1 — `app.aecon.ai` is not a deployable distribution origin

**Classification:** external/deployment blocker, not a source defect by itself.

The plugin MCP configuration, manifest, shared skill and public copy consistently choose `https://app.aecon.ai` ([`plugins/agentic-economy/.mcp.json:1`](../../plugins/agentic-economy/.mcp.json#L1), [`plugins/agentic-economy/.codex-plugin/plugin.json:5`](../../plugins/agentic-economy/.codex-plugin/plugin.json#L5), [`plugins/agentic-economy/skills/use-agentic-economy/SKILL.md:23`](../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md#L23)). On review, `dig` returned no A or AAAA record for `app.aecon.ai`, and HTTPS `/mcp` failed before connection with `Could not resolve host`. The apex `aecon.ai` did resolve and returned HTTP 308, which does not establish that the chosen subdomain, MCP route, OAuth metadata, privacy page or support path exists.

The origin choice is reasonable. The current release claim is correctly blocked. Do not silently fall back to the apex, another deployment URL or a guessed directory link because OAuth resource/audience and registered-client bindings are origin-specific.

### P1 — no installed plugin, registered connection or public listing is proved

**Classification:** external OpenAI registration/review blocker.

The package includes a `.codex-plugin/plugin.json`, `.mcp.json`, assets and one skill. OpenAI documents this as a supported distributable shape and says the public directory is shared by ChatGPT and Codex ([OpenAI packaging guide](https://developers.openai.com/plugins/build/plugins)). The same guide describes a registered developer-mode connection with a `plugin_asdk_app...` ID and `.app.json`/manifest `apps` wiring for testing a complete plugin. AE has no `.app.json`, registered connection ID, scan result, installed-client capture or directory URL. This makes complete native testing and publication unproved; it is not evidence that `.mcp.json` packaging is invalid.

The submission guide requires a production MCP URL, tool scan, authentication configuration, reviewer credentials when required, domain verification when challenged, at least five positive and three negative cases, and regions whose publisher/support/legal posture is ready ([OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission)). The release guide lists these as future steps, so its status line is truthful ([`docs/guides/package-6-plugin-release.md:41`](../guides/package-6-plugin-release.md#L41)).

### P2 — installed SDK 1.30.0 cannot express the current OpenAI auth extension through `registerTool`

**Classification:** SDK integration gap; not proof of actual client acceptance or rejection.

Installed and registry-current `@modelcontextprotocol/sdk` is 1.30.0. Its `registerTool` type admits `title`, `description`, input/output schemas, annotations and `_meta`, but no top-level `securitySchemes` ([`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:150`](../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts#L150)). Its runtime destructures only those fields and serializes only them into `tools/list` ([`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:67`](../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js#L67), [`node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js:699`](../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js#L699)). Passing an undocumented extra config property would therefore be silently discarded by this high-level path.

The low-level server can register a custom list handler, and the wire schema is loose enough to carry extensions. That is mechanical possibility, not an officially supported integration or proof that OpenAI clients accept it. The release guide is right to prohibit SDK patching and invented auth tools. Its claim should say the current high-level SDK path strips the documented OpenAI field, while resolution remains blocked on an official supported implementation and real-client proof.

### P2 — “four tools” must mean four anonymous public tools

**Classification:** claim precision; implementation is correct for its stated tier.

AE intentionally multiplexes one MCP endpoint by caller tier. Anonymous `tools/list` contains exactly `list`, `search`, `describe` and `compare`, under 8 KiB ([`tests/unit/server/mcp-api-tools-list.test.ts:17`](../../tests/unit/server/mcp-api-tools-list.test.ts#L17)). After authentication, the list expands to the protected buyer or Provider actions admitted by scopes ([`src/lib/server/mcp-api.ts:281`](../../src/lib/server/mcp-api.ts#L281), [`tests/unit/server/mcp-api-tools-list.test.ts:177`](../../tests/unit/server/mcp-api-tools-list.test.ts#L177)).

This meets the accepted “exactly four anonymous MCP tools” decision. Public material must not say the server or plugin has only four tools. The useful, accurate claim is “four anonymous public discovery tools; scoped tools appear after connection.”

### P2 — package and `/SKILL.md` share one source, but public parity is deployment-blocked

**Classification:** locally implemented; public proof blocked.

The plugin has one skill file. The public builder imports that exact Markdown as raw text and returns it unchanged ([`src/modules/discovery/internal/agent-skill.ts:1`](../../src/modules/discovery/internal/agent-skill.ts#L1)); `/SKILL.md` serves that builder ([`src/routes/SKILL[.]md.ts:24`](../../src/routes/SKILL[.]md.ts#L24)). This is stronger than two copies with a parity test.

The skill still contains absolute `app.aecon.ai` instructions and support claims ([`plugins/agentic-economy/skills/use-agentic-economy/SKILL.md:23`](../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md#L23)). Local identity is proved; reachability, mailbox delivery and published-snapshot parity are not.

## Adversarial challenge of peer conclusions

### “Cancel” leaves the pending Provider connection attempt usable

**Finding survives, with narrower impact.** Both manual-credential and MCP OAuth “Cancel” controls only navigate back to the saved draft ([`src/routes/_operator/owner.supply.connections.new.tsx:163`](../../src/routes/_operator/owner.supply.connections.new.tsx#L163), [`src/routes/_operator/owner.supply.connections.new.tsx:239`](../../src/routes/_operator/owner.supply.connections.new.tsx#L239)). The connection-attempt contract has an explicit `cancelled` state ([`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff-contract.ts:26`](../../src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff-contract.ts#L26)), but these controls perform no cancellation. A pending unexpired attempt remains accepted by manual completion and MCP OAuth start ([`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:281`](../../src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts#L281), [`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:371`](../../src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts#L371)).

The defect is the UI action/lifecycle mismatch and the retained handoff until expiry. It does not revoke an existing Provider credential, cancel an already-started third-party authorization, or make the handoff usable by an unauthorised person; normal owner and reverification checks still apply.

### MCP OAuth start turns a read outage into `not_found`

**Finding survives, with narrower journey impact.** Manual HTTP completion maps a thrown attempt read to `source_unavailable` ([`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:275`](../../src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts#L275)). MCP OAuth start calls `safeReadOwnerAttempt`, which catches every read error as `not_found` ([`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:369`](../../src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts#L369), [`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:808`](../../src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts#L808)). The page renders that result as “no longer available” and advises starting again ([`src/routes/_operator/owner.supply.connections.new.tsx:289`](../../src/routes/_operator/owner.supply.connections.new.tsx#L289)).

The false message occurs when the page loaded successfully and the second read during Start later fails. The initial route loader does not catch read exceptions ([`src/routes/_operator/owner.supply.connections.new.tsx:23`](../../src/routes/_operator/owner.supply.connections.new.tsx#L23)), so it is not proved that every entry outage renders this custom message. The POST error also does not automatically discard the loaded attempt or draft. The proven impact is wrong outage classification and advice that can cause an unnecessary replacement attempt.

### Provider landing renders both outage and a false empty-market claim

**Finding survives.** The route correctly creates a `sourceError` on read failure, but also passes empty tool and Operation arrays ([`src/routes/for-providers.tsx:17`](../../src/routes/for-providers.tsx#L17)). The landing renders the outage alert, then still renders the proof section; an empty Operation array is unconditionally described as “No Operations are published yet. Be the first” ([`src/components/ae/supply/AeSupplyLanding.tsx:84`](../../src/components/ae/supply/AeSupplyLanding.tsx#L84), [`src/components/ae/supply/AeSupplyAgentProof.tsx:24`](../../src/components/ae/supply/AeSupplyAgentProof.tsx#L24)). A user therefore sees contradictory outage and authoritative-empty claims in one page. This is a bounded false-empty rendering defect, not evidence that the catalogue itself lost data.

### Consumed MCP connection return cannot resume its exact connected draft

**Finding survives.** The HTTP consumed-attempt branch returns with connection, environment and draft ([`src/routes/_operator/owner.supply.connections.new.tsx:66`](../../src/routes/_operator/owner.supply.connections.new.tsx#L66)). The MCP branch handles every non-pending state inside `McpOAuthHandoff` and, for `consumed`, returns only the draft ([`src/routes/_operator/owner.supply.connections.new.tsx:187`](../../src/routes/_operator/owner.supply.connections.new.tsx#L187)). Connected-draft resumption requires the exact stored `connectionRef`; omitting it produces `not_found` ([`src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts:368`](../../src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts#L368)). The result is a fresh Add service form instead of the promised saved Operation. This applies to revisiting a consumed MCP attempt; the normal successful OAuth callback includes connection and draft and remains a separate green path.

### Resume failures silently become an empty Add service form

**Finding survives.** The Add service loader preserves `not_found` or `source_changed`, but the component only passes initial state when resume is `available`; all other results are silently omitted ([`src/routes/_operator/owner.offerings.new.tsx:29`](../../src/routes/_operator/owner.offerings.new.tsx#L29), [`src/routes/_operator/owner.offerings.new.tsx:62`](../../src/routes/_operator/owner.offerings.new.tsx#L62)). Pending/expired/cancel-return journeys can therefore land on an empty form with no explanation of whether the draft was missing or its source changed. This is lost guidance and false fresh-state presentation, not proof that the draft record was deleted.

### Ambiguous manual connection completion is not recoverable from its own advice

**Finding survives without a duplicate-effect claim.** After the manual connection POST throws, the UI clears the credential and advises trying again with the same credential, without reading the attempt or connection state ([`src/routes/_operator/owner.supply.connections.new.tsx:99`](../../src/routes/_operator/owner.supply.connections.new.tsx#L99)). If the first response was lost after consumption, the server's next entry sees a non-pending attempt and returns `not_found` before it can converge on the previous result ([`src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts:275`](../../src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts#L275)). The proven issue is that the UI cannot distinguish no connection from an unknown committed outcome and its suggested retry does not recover the consumed result. Existing preparation/finalization controls may prevent duplicate creation; no duplicate Provider effect was reproduced.

The analogous OAuth callback uses the title “Service not connected” for every non-connected result while its body correctly says AE could not confirm the connection ([`src/routes/_operator/owner.supply.connections.oauth.callback.tsx:61`](../../src/routes/_operator/owner.supply.connections.oauth.callback.tsx#L61)). The title overstates an uncertain result; this is wording/state projection, not evidence that connection definitely failed.

## Release gates that remain legitimate

- Deploy the selected canonical origin and verify DNS, TLS, `/mcp`, both OAuth metadata documents, privacy, terms, support and callback behavior.
- Correct the OAuth `resource` handling and select an officially supported way to emit any required OpenAI tool-auth metadata.
- Register and scan the server in OpenAI developer tooling; test the complete plugin package and shared skill as installed snapshots.
- Prove Codex CLI resource-level login separately from ChatGPT plugin/account connection. Record exact client versions and same-revision results; do not infer one from the other.
- Prove all four anonymous discovery tools, scoped post-auth tools, revoke/reconnect, fresh-task behavior and the first useful result.
- Complete publisher, reviewer-account, domain, legal, support, real-Operation and production/commercial gates without manufacturing test money or bypasses.

## Lightweight verification performed

- Read the current product charter, whitepaper, canonical vocabulary, roadmaps, Package 6 research, build plan and release guide.
- Inspected the plugin tree, shared skill route, MCP tier projection, OAuth metadata/authorization/token paths, Codex setup generator, installed SDK declarations and runtime serialization.
- Confirmed npm registry current SDK version `1.30.0` on 5 September 2026.
- Checked DNS and bounded HTTPS reachability for `app.aecon.ai`; the subdomain did not resolve. Confirmed only that the apex `aecon.ai` resolves and redirects.
- Read current official OpenAI plugin packaging, authentication, connect/test, submission and Codex MCP documentation.

No heavy tests were run. Existing local tests demonstrate serialized MCP behavior against SDK 1.30.0; they do not demonstrate acceptance by ChatGPT, Codex, the submission scanner or a deployed OAuth flow.
