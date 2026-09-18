export type AgentAccessConfigSnippetId = 'cursor' | 'claude' | 'python' | 'curl'

export type AgentAccessConfigSnippets = Readonly<{
  cursor: string
  claude: string
  python: string
  curl: string
}>

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Builds developer quick-start configuration snippets embedding an issued Agentic Economy bearer token.
 * Note: Cursor currently prefers OAuth discovery over static headers if OAuth endpoints are discovered.
 */
export function buildAgentAccessConfigSnippets(input: Readonly<{
  secret: string
  canonicalBaseUrl: string
}>): AgentAccessConfigSnippets {
  const base = trimTrailingSlashes(input.canonicalBaseUrl)
  const mcpUrl = `${base}/mcp`

  const cursorConfig = {
    mcpServers: {
      'agentic-economy': {
        url: mcpUrl,
        headers: {
          Authorization: `Bearer ${input.secret}`,
        },
      },
    },
  }

  const claudeCommand = `claude mcp add --transport http --scope user agentic-economy "${mcpUrl}" --header "Authorization: Bearer ${input.secret}"`

  const pythonCode = `from agentic_economy import AgenticEconomy

client = AgenticEconomy(api_key="${input.secret}", base_url="${base}")`

  const curlCommand = `curl -sS "${base}/api/v1/account" \\
  -H "Authorization: Bearer ${input.secret}" \\
  -H "Accept: application/json"`

  return {
    cursor: JSON.stringify(cursorConfig, null, 2),
    claude: claudeCommand,
    python: pythonCode,
    curl: curlCommand,
  }
}
