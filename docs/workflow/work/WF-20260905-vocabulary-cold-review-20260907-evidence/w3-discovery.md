# Wave 3 discovery and onboarding audit

## Scope and basis

This was a static, bounded review at HEAD a51e17b221c6b73851c5873502d8150120ef3aad,
after source cutover 3770b43bac9bf3ea11478664ee8249ec4ddf505e. I read PRODUCT.md
and CONTEXT.md first. The reviewed boundary covered:

- Public /for-agents onboarding, its Agent Door and install funnel, /SKILL.md,
  llms/discovery routes, well-known UCP/API catalog/OAuth metadata, schema and
  example payloads.
- Discovery builders, page markdown, CLI distribution, plugin manifest/MCP
  descriptor, packaged agent skill, and CLI README/package metadata.
- Chat tool registration, chat generation/message transport and presentation,
  call/recovery action descriptors, and quote/call examples and related tests.

No source files were changed and no tests or external effects were run.

## Confirmed findings

### D1 — Public agent onboarding still teaches the retired market noun

- Severity: P2 (user-facing canonical vocabulary and discoverability)
- Confidence: 10/10
- Location: src/components/ae/console/AeAssistantInstallFunnel.tsx:23,33
- Evidence:
  - The rendered section says: “You can browse Operations before connecting.”
  - The follow-up instruction says: “ask it to find an Operation for your task.”
  - src/routes/for-agents.tsx renders AeAgentDoorPage, which renders this funnel.
    The same page's primary action already says “Browse Tools”, making the
    contradiction visible on one public onboarding page.
- Trigger: A human or agent visits /for-agents and follows the connection
  instructions after installing the native MCP connection.
- Impact: The setup funnel tells a new user to use an AE-owned term that is no
  longer the canonical market object. An agent following the prompt can ask
  for an Operation while the current public discovery contract and packaged
  skill teach Tool. This is a discoverability/trust papercut; the MCP command
  itself is unaffected.
- Minimal correction: Change “browse Operations” to “browse Tools” and “find an
  Operation” to “find a Tool”. Add a narrow UI assertion for these two rendered
  strings so future cutover work cannot leave the public funnel behind.
- Provenance: git blame attributes both lines to 971660119a80a58013c67e2dafee5e47fe7edca8
  (2026-09-05), before the Tool/Quote/Call cutover. No source change was made
  in this audit.

### D2 — Plugin install metadata still prompts for retired Operations

- Severity: P3 (install-time guidance mismatch; same root vocabulary drift)
- Confidence: 10/10
- Location: plugins/agentic-economy/.codex-plugin/plugin.json:17,27-28
- Evidence:
  - interface.longDescription says: “Search public Operations...”
  - interface.defaultPrompt contains “Find an Operation...” and “Compare the
    terms of these Operations.”
  - The adjacent packaged skill consistently instructs agents to search,
    describe, compare, quote, and call a Tool, and the actual MCP discovery
    actions are named for tools.
- Trigger: A user installs the plugin or selects one of its default composer
  prompts.
- Impact: Install-time UI sends the user/model toward the retired noun even
  though the installed skill and live discovery contract use Tool. This can
  produce confusing prompts and makes the plugin appear out of sync with the
  current product vocabulary. It does not alter MCP registration or call
  authorization.
- Minimal correction: Replace the three Operation references with Tool/Tools
  wording while preserving the existing Call and recovery prompts. Extend the
  narrow plugin metadata test to reject these AE-owned retired nouns in the
  long description and default prompts; do not apply such a check to protocol
  fields or historical evidence.
- Provenance: git blame attributes the metadata to 971660119a80a58013c67e2dafee5e47fe7edca8
  (2026-09-05), before the Tool/Quote/Call cutover. No source change was made
  in this audit.

## Unfinished leads and gaps (not confirmed defects)

### G1 — Public SKILL.md host substitution is unresolved

src/routes/SKILL[.]md.ts:25-29 resolves canonicalBaseUrl and routingBaseUrl, but
src/modules/discovery/internal/agent-skill.ts:6-10 ignores both options and
returns the raw packaged skill. That skill hardcodes app.aecon.ai links for
native alternatives (line 34), provider setup (line 76), and API/help (lines
89-90). A preview or separately hosted allowlisted origin could therefore
serve a skill whose instructions send users to production.

This remains a design/verification gap rather than a confirmed defect:
tests/seo/agent-skill.test.ts:11-20,42 deliberately require the public response
to equal the packaged skill for every content-negotiation choice, and the
plugin and public route may intentionally be canonical-production assets.
Product/deployment owners should decide whether /SKILL.md is always a
production pointer. If it is host-relative, template/substitute the links and
update the package-parity contract; if it is canonical-only, remove the unused
builder options or add an explicit test/documented invariant.

### G2 — Chat recovery and anonymous-to-authenticated continuation need a product decision

convex/chatTools.ts:29-36 registers six chat tools, while the call recovery
descriptors in src/modules/capability-execution/call-recovery.actions.ts:235,
276,318 expose status/cancel/reconcile through HTTP/MCP/CLI surfaces. The chat
card in src/modules/chat/tool-card.ts:479-491 can suggest ae status or
ae reconcile, but does not expose those recovery actions as in-chat tools.

Separately, src/components/ae/chat/Chat.tsx:232-244 and its presentation helper
keep the anonymous transcript in an in-memory visual handoff, while
convex/chatMessages.ts:70-144 sends the authenticated backend only the new
prompt. If chat is expected to own recovery or preserve anonymous context
across sign-in, the user can receive a CLI-only next step and the model loses
the prior context. The packaged skill explicitly says the host owns the task
and does not store the user's project or conversation, and chat may
intentionally stop at presenting the continuation. Confirm the intended
boundary before changing tools, persistence, or handoff behavior.

## Counterevidence and exclusions

- “Operation” occurrences in operator-only pages, compatibility routes,
  fixtures, test names, status copy, and internal implementation were not
  promoted to findings; this review was limited to served discovery,
  onboarding/install assets, chat integration, and handoff/example surfaces.
- invocationRef, operationRef, operationId, operation:v1, operation-commitment,
  and upstream OpenAPI operationId/Operation ID are protected protocol,
  evidence, opaque identifier, or historical vocabulary in CONTEXT.md. They
  must retain their exact spelling and are not stale UI copy.
- The chat call schema uses the canonical pre-projection capabilityCalls.call
  result intentionally; no schema defect was established.
- Quote continuation idempotency keys differ from the chat-generated key, but
  both satisfy the stable-key contract accepted by readForCall. No duplicate
  call or replay defect was established.

