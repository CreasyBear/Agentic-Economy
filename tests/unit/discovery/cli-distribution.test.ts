import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  AE_CLI_ARCHIVE_FILENAME,
  AE_CLI_VERSION,
  AE_MCP_INSTALLER_VERSION,
  aeCliArchiveUrl,
  aeCliEaccesFallbackCommand,
  aeCliInstallCommand,
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
    expect(AE_MCP_INSTALLER_VERSION).toBe('2.3.0')
    expect(aeMcpInstallCommand('https://ae.example/', 'codex')).toBe('npx --yes add-mcp@2.3.0 "https://ae.example/mcp" --name agentic-economy --transport http --global --agent "codex" --yes')
    expect(aeMcpListCommand('codex')).toBe('npx --yes add-mcp@2.3.0 list --global --agent "codex"')

    await expect(access(resolve('public/downloads', AE_CLI_ARCHIVE_FILENAME))).resolves.toBeUndefined()
  })
})
