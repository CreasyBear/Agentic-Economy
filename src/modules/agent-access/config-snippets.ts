export type AgentAccessConfigSnippetId = 'cursor' | 'claude' | 'python' | 'curl'

export const AGENT_ACCESS_SNIPPET_DESTINATIONS: Readonly<Record<AgentAccessConfigSnippetId, string>> = {
  cursor: 'Add to .cursor/mcp.json (project) or ~/.cursor/mcp.json (user).',
  claude: 'Run in your terminal to install the MCP tool.',
  python: 'Save as verify_access.py and run with Python 3. Uses the standard library; verifies account access without making a purchase.',
  curl: 'Run in your terminal to verify the credential (account whoami — not a purchase).',
}

export const AGENT_ACCESS_SNIPPET_COPY_HINTS: Readonly<Record<AgentAccessConfigSnippetId, string>> = {
  cursor: 'Copied to clipboard — paste into ~/.cursor/mcp.json',
  claude: 'Copied to clipboard — paste into your terminal',
  python: 'Copied to clipboard — paste into your Python agent script',
  curl: 'Copied to clipboard — paste into your terminal',
}

export type AgentAccessConfigSnippets = Readonly<{
  cursor: string
  claude: string
  python: string
  curl: string
}>

function trimTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '')
}

export const AGENT_ACCESS_SNIPPET_DOWNLOADS: Readonly<
  Record<AgentAccessConfigSnippetId, { filename: string; label: string; mime: string }>
> = {
  cursor: {
    filename: 'mcp.json',
    label: 'Download mcp.json',
    mime: 'application/json;charset=utf-8',
  },
  claude: {
    filename: '.env',
    label: 'Download .env',
    mime: 'text/plain;charset=utf-8',
  },
  python: {
    filename: '.env',
    label: 'Download .env',
    mime: 'text/plain;charset=utf-8',
  },
  curl: {
    filename: '.env',
    label: 'Download .env',
    mime: 'text/plain;charset=utf-8',
  },
}

export function buildAgentAccessEnvFile(input: Readonly<{
  secret: string
  canonicalBaseUrl: string
}>): string {
  return `AGENTIC_ECONOMY_API_KEY=${input.secret}\nAGENTIC_ECONOMY_BASE_URL=${trimTrailingSlashes(input.canonicalBaseUrl)}\n`
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

  const pythonCode = `import json
from urllib.request import Request, urlopen

request = Request(
    ${JSON.stringify(`${base}/api/v1/account`)},
    headers={"Authorization": ${JSON.stringify(`Bearer ${input.secret}`)}, "Accept": "application/json"},
)
with urlopen(request, timeout=30) as response:
    print(json.dumps(json.load(response), indent=2))`

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
