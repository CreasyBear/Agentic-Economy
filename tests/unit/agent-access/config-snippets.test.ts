import { describe, expect, it } from 'vitest'
import {
  AGENT_ACCESS_SNIPPET_COPY_HINTS,
  AGENT_ACCESS_SNIPPET_DESTINATIONS,
  AGENT_ACCESS_SNIPPET_DOWNLOADS,
  buildAgentAccessConfigSnippets,
  buildAgentAccessEnvFile,
} from '@/modules/agent-access/config-snippets'

describe('buildAgentAccessConfigSnippets (W-27)', () => {
  const secret = 'sek_test_1234567890abcdef'
  const canonicalBaseUrl = 'https://market.example.com/'

  it('T1: trims trailing slashes from canonicalBaseUrl and builds valid mcp url', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    expect(snippets.cursor).toContain('https://market.example.com/mcp')
    expect(snippets.cursor).not.toContain('//mcp')
  })

  it('T2: embeds the exact secret in every snippet', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    expect(snippets.cursor).toContain(secret)
    expect(snippets.claude).toContain(secret)
    expect(snippets.python).toContain(secret)
    expect(snippets.curl).toContain(secret)
  })

  it('T3: cursor snippet is valid JSON containing mcpServers configuration with Authorization header', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    const parsed = JSON.parse(snippets.cursor)
    expect(parsed.mcpServers['agentic-economy']).toEqual({
      url: 'https://market.example.com/mcp',
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    })
  })

  it('T4: claude snippet contains http transport, user scope, server name, quoted url, and Authorization header', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    expect(snippets.claude).toContain('claude mcp add')
    expect(snippets.claude).toContain('--transport http')
    expect(snippets.claude).toContain('--scope user')
    expect(snippets.claude).toContain('agentic-economy')
    expect(snippets.claude).toContain('"https://market.example.com/mcp"')
    expect(snippets.claude).toContain(`--header "Authorization: Bearer ${secret}"`)
  })

  it('T5: python snippet imports AgenticEconomy and instantiates client with api_key and base_url', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    expect(snippets.python).toContain('from agentic_economy import AgenticEconomy')
    expect(snippets.python).toContain(`client = AgenticEconomy(api_key="${secret}", base_url="https://market.example.com")`)
  })

  it('T6: curl snippet targets /api/v1/account whoami endpoint with Bearer authorization and does not make purchase calls', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    expect(snippets.curl).toContain('curl -sS "https://market.example.com/api/v1/account"')
    expect(snippets.curl).toContain(`-H "Authorization: Bearer ${secret}"`)
    expect(snippets.curl).toContain('-H "Accept: application/json"')
    expect(snippets.curl).not.toContain('/api/v1/tools/call')
    expect(snippets.curl).not.toContain('tool.quote')
  })

  it('T7a: exports destination and copy-hint metadata for each harness tab', () => {
    expect(AGENT_ACCESS_SNIPPET_DESTINATIONS.cursor).toContain('mcp.json')
    expect(AGENT_ACCESS_SNIPPET_DESTINATIONS.claude).toContain('terminal')
    expect(AGENT_ACCESS_SNIPPET_DESTINATIONS.python).toContain('Python')
    expect(AGENT_ACCESS_SNIPPET_DESTINATIONS.curl).toContain('whoami')
    expect(AGENT_ACCESS_SNIPPET_COPY_HINTS.cursor).toContain('~/.cursor/mcp.json')
    expect(AGENT_ACCESS_SNIPPET_COPY_HINTS.claude).toContain('terminal')
  })

  it('T7: secret containing quotes or backslashes still yields parseable Cursor JSON', () => {
    const awkwardSecret = 'sek_test_"weird"\\secret'
    const snippets = buildAgentAccessConfigSnippets({ secret: awkwardSecret, canonicalBaseUrl })
    const parsed = JSON.parse(snippets.cursor)
    expect(parsed.mcpServers['agentic-economy'].headers.Authorization).toBe(`Bearer ${awkwardSecret}`)
  })

  it('T8: buildAgentAccessEnvFile emits API key and trimmed base URL lines', () => {
    const env = buildAgentAccessEnvFile({ secret, canonicalBaseUrl })
    expect(env).toBe(
      `AGENTIC_ECONOMY_API_KEY=${secret}\nAGENTIC_ECONOMY_BASE_URL=https://market.example.com\n`,
    )
  })

  it('T9: cursor snippet from buildAgentAccessConfigSnippets parses as JSON with mcpServers', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    const parsed = JSON.parse(snippets.cursor) as {
      mcpServers: Record<string, { url: string; headers: { Authorization: string } }>
    }
    expect(Object.keys(parsed.mcpServers)).toContain('agentic-economy')
    const cursorServer = parsed.mcpServers['agentic-economy']
    expect(cursorServer?.url).toBe('https://market.example.com/mcp')
  })

  it('T10: cursor JSON Authorization header uses Bearer prefix with embedded secret', () => {
    const snippets = buildAgentAccessConfigSnippets({ secret, canonicalBaseUrl })
    const parsed = JSON.parse(snippets.cursor) as {
      mcpServers: Record<string, { headers: { Authorization: string } }>
    }
    const cursorServer = parsed.mcpServers['agentic-economy']
    expect(cursorServer?.headers.Authorization).toBe(`Bearer ${secret}`)
  })

  it('T11: AGENT_ACCESS_SNIPPET_DOWNLOADS defines filename, label, and mime per harness', () => {
    expect(AGENT_ACCESS_SNIPPET_DOWNLOADS.cursor).toEqual({
      filename: 'mcp.json',
      label: 'Download mcp.json',
      mime: 'application/json;charset=utf-8',
    })
    expect(AGENT_ACCESS_SNIPPET_DOWNLOADS.claude).toEqual({
      filename: '.env',
      label: 'Download .env',
      mime: 'text/plain;charset=utf-8',
    })
    expect(AGENT_ACCESS_SNIPPET_DOWNLOADS.python.filename).toBe('.env')
    expect(AGENT_ACCESS_SNIPPET_DOWNLOADS.curl.label).toBe('Download .env')
  })
})
