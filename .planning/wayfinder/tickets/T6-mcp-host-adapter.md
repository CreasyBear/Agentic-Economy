# T6 — MCP host adapter over the action registry (Soar-shaped distribution)

Labels: `wayfinder:task` (AFK-capable). Status: open, unclaimed. Raised by founder question 2026-07-30.

## Question

Expose AE as an installable MCP server the way flysoar.ai does: keyless public tools now (`registry.services_list`, `registry.services_search`, the sandbox quote, catalog detail), key-gated Customer Request tools later (after T3 decides issuance). The action registry already carries zod schemas and agent descriptors (`describeActionForAgent`), and ADR-009/010 mandate one action plane across hosts — so this is a thin host adapter, not new product meaning. Define: transport (streamable HTTP on the existing origin vs stdio package), tool naming, how `surfaces` gates which actions are exposed, and the install one-liner for Codex/Claude. No new claims: tools describe exactly the current boundaries.

## Resolution

Resolved 2026-07-30 (plan: MCP host adapter over the action registry).

- **Transport**: Streamable HTTP at `/mcp` on the existing origin (`src/routes/mcp.ts` → `src/lib/server/mcp-api.ts`), stateless (`sessionIdGenerator: undefined`), fresh `McpServer` + `WebStandardStreamableHTTPServerTransport` per request, `@modelcontextprotocol/sdk@1.30.0` pinned. No stdio package. GET/DELETE are SDK-handled 2025-06-18 client compatibility.
- **Exposure gate**: `'mcp'` added to `ActionSurface`; the host serves exactly `listActions().filter(a => a.surfaces.includes('mcp'))` and throws at construction if any such action is not `readOnly` — one source of truth for the anonymous tool count.
- **Tool set (4, anonymous, read-only)**: `registry.services_list`, `registry.services_search`, `registry.detail`, and the newly registered `sandbox.checkup_quote` (the former route-inline sandbox quote composition moved into the action seam; wire shape of `POST /api/sandbox/$slug/checkup-quote` unchanged). `registry.list`/`registry.search` deliberately excluded (T8: services projection is the public shape).
- **Naming**: deterministic `ae_` + action id with `.` → `_` (`mcpToolName` in `src/modules/actions/index.ts`): `ae_registry_services_list`, `ae_registry_services_search`, `ae_registry_detail`, `ae_sandbox_checkup_quote`.
- **Install**: `claude mcp add --transport http agentic-economy <origin>/mcp`; `codex mcp add agentic-economy --url <origin>/mcp`. Published in `/SKILL.md` (tool list generated from the registry) and one line in `/llms.txt`.
- **Key-gated tier**: deferred to T3; the read-only guard in `createAeMcpServer` is the seam an authenticated tier replaces. No OAuth/well-known metadata in this slice.
- **Evidence class**: labelled local/dev contract behavior only; no hosted or real-supply claim.

## Research

Soar shape study landed: `.planning/research/2026-07-30-flysoar-cli-shape.md` (2026-07-30). Key transfers: progressive authority tiers (anonymous read → OAuth effectful → discovery-gated advanced), well-known OAuth metadata, safety-labelled tool descriptions, build-wired SKILL.md/llms.txt publication. One source of truth for the anonymous tool count (Soar's page/metadata disagree — avoid).
