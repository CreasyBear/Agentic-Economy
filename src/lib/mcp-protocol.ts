// The SDK's LATEST_PROTOCOL_VERSION remains its legacy handshake default.
// Our HTTP handler explicitly serves the current per-request revision as well.
export const MCP_LATEST_PROTOCOL_VERSION = '2026-07-28' as const

/** Site-relative MCP transport endpoint, served by src/routes/mcp.ts. */
export const MCP_HTTP_ENDPOINT_PATH = '/mcp' as const
