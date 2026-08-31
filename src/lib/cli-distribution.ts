import cliPackage from '../../packages/cli/package.json'

import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export const AE_CLI_VERSION = cliPackage.version
export const AE_CLI_ARCHIVE_FILENAME = `agentic-economy-cli-${AE_CLI_VERSION}.tgz`
export const AE_MCP_INSTALLER_VERSION = '2.3.0'

export type AeMcpHarness = 'claude-code' | 'codex' | 'cursor'

export function aeCliArchiveUrl(baseUrl: string): string {
  return `${trimTrailingSlashes(baseUrl)}/downloads/${AE_CLI_ARCHIVE_FILENAME}`
}

export function aeCliInstallCommand(baseUrl: string): string {
  return `npm install --global "${aeCliArchiveUrl(baseUrl)}"`
}

export function aeCliEaccesFallbackCommand(baseUrl: string): string {
  return `npm install --global --prefix "$HOME/.local" "${aeCliArchiveUrl(baseUrl)}"`
}

export function aeMcpInstallCommand(
  baseUrl: string,
  harness: AeMcpHarness | '<agent>' = '<agent>',
): string {
  return `npx --yes add-mcp@${AE_MCP_INSTALLER_VERSION} "${trimTrailingSlashes(baseUrl)}/mcp" --name agentic-economy --transport http --global --agent "${harness}" --yes`
}

export function aeMcpListCommand(
  harness: AeMcpHarness | '<agent>' = '<agent>',
): string {
  return `npx --yes add-mcp@${AE_MCP_INSTALLER_VERSION} list --global --agent "${harness}"`
}
