import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  AE_CLI_ARCHIVE_FILENAME,
  AE_CLI_VERSION,
  aeCliArchiveUrl,
  aeCliEaccesFallbackCommand,
  aeCliInstallCommand,
  AE_MCP_CONNECTION_SCOPES,
  AE_MCP_WHOAMI_TOOL_NAME,
  NATIVE_MCP_CLIENTS,
  nativeMcpClient,
  aeMcpAuthenticateInstruction,
  aeMcpInstallCommand,
  aeMcpListCommand,
} from '@/lib/cli-distribution'

describe('CLI distribution', () => {
  it('derives the versioned archive and setup commands from the CLI package', async () => {
    const cliPackage = JSON.parse(await readFile(resolve('packages/cli/package.json'), 'utf8')) as { version: string }

    expect(AE_CLI_VERSION).toBe(cliPackage.version)
    expect(AE_CLI_ARCHIVE_FILENAME).toBe(`agentic-economy-cli-${cliPackage.version}.tgz`)
    expect(aeCliArchiveUrl('https://ae.example/')).toBe(`https://ae.example/downloads/${AE_CLI_ARCHIVE_FILENAME}`)
    expect(aeCliInstallCommand('https://ae.example/')).toBe(`npm install --global "https://ae.example/downloads/${AE_CLI_ARCHIVE_FILENAME}"`)
    expect(aeCliEaccesFallbackCommand('https://ae.example/')).toBe(`npm install --global --prefix "$HOME/.local" "https://ae.example/downloads/${AE_CLI_ARCHIVE_FILENAME}"`)
    expect(AE_MCP_CONNECTION_SCOPES).toEqual([
      'market_operations:invoke',
      'customer_requests:approve_each',
      'offline_access',
    ])
    expect(AE_MCP_WHOAMI_TOOL_NAME).toBe('ae_agentAccess_whoami')
    expect(NATIVE_MCP_CLIENTS.map(({ id }) => id)).toEqual(['codex', 'claude-code', 'cursor'])
    expect(nativeMcpClient('codex')).toMatchObject({
      id: 'codex',
      displayName: 'Codex',
      authenticationInstruction: 'Run both lines. Codex opens browser approval during login.',
    })
    expect(aeMcpInstallCommand('https://ae.example/', 'codex')).toBe([
      'codex mcp add agentic-economy --url "https://ae.example/mcp"',
      'codex mcp login agentic-economy',
    ].join('\n'))
    expect(aeMcpInstallCommand('https://ae.example/', 'claude-code')).toBe('claude mcp add --transport http --scope user agentic-economy "https://ae.example/mcp"')
    expect(aeMcpInstallCommand('https://ae.example/', 'cursor')).toBe('cursor --add-mcp \'{"name":"agentic-economy","url":"https://ae.example/mcp"}\'')
    expect(aeMcpAuthenticateInstruction('codex')).toBe('Run both lines. Codex opens browser approval during login.')
    expect(aeMcpAuthenticateInstruction('claude-code')).toBe('In Claude Code, open /mcp, select agentic-economy, then choose Authenticate.')
    expect(aeMcpAuthenticateInstruction('cursor')).toBe('Enable agentic-economy in Cursor, then follow its OAuth prompt.')
    expect(aeMcpListCommand('codex')).toBe('codex mcp get agentic-economy')
    expect(aeMcpListCommand('claude-code')).toBe('claude mcp get agentic-economy')
    expect(aeMcpListCommand('cursor')).toBe('cursor --status')

    await expect(access(resolve('public/downloads', AE_CLI_ARCHIVE_FILENAME))).resolves.toBeUndefined()
  })
})
