import cliPackage from '../../packages/cli/package.json'

import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  AGENT_ACCESS_OAUTH_SAFE_MCP_SCOPES,
} from '@/modules/agent-access/oauth-state'

export const AE_CLI_VERSION = cliPackage.version
export const AE_CLI_ARCHIVE_FILENAME = `agentic-economy-cli-${AE_CLI_VERSION}.tgz`

export type NativeMcpClientId = 'codex' | 'claude-code' | 'cursor'
export type AeMcpHarness = NativeMcpClientId

export type NativeMcpClientDefinition = Readonly<{
  id: NativeMcpClientId
  displayName: string
  setupCommand: (baseUrl: string) => string
  authenticationInstruction: string
  reconnectInstruction: string
  statusCommand: string
}>

export const AE_MCP_CONNECTION_SCOPES = AGENT_ACCESS_OAUTH_SAFE_MCP_SCOPES

export const AE_MCP_WHOAMI_TOOL_NAME = `ae_${'agentAccess.whoami'.replace(/\./g, '_')}` as const

export function aeCliArchiveUrl(baseUrl: string): string {
  return `${trimTrailingSlashes(baseUrl)}/downloads/${AE_CLI_ARCHIVE_FILENAME}`
}

export function aeCliInstallCommand(baseUrl: string): string {
  return `npm install --global "${aeCliArchiveUrl(baseUrl)}"`
}

export function aeCliEaccesFallbackCommand(baseUrl: string): string {
  return `npm install --global --prefix "$HOME/.local" "${aeCliArchiveUrl(baseUrl)}"`
}

const mcpEndpoint = (baseUrl: string) => `${trimTrailingSlashes(baseUrl)}/mcp`

export const NATIVE_MCP_CLIENTS: readonly NativeMcpClientDefinition[] = Object.freeze([
  Object.freeze({
    id: 'codex',
    displayName: 'Codex',
    setupCommand: (baseUrl: string) => [
      `codex mcp add agentic-economy --url "${mcpEndpoint(baseUrl)}"`,
      'codex mcp login agentic-economy',
    ].join('\n'),
    authenticationInstruction: 'Run both lines. Codex opens browser approval during login.',
    reconnectInstruction: 'Run codex mcp login agentic-economy, then return to Codex.',
    statusCommand: 'codex mcp get agentic-economy',
  }),
  Object.freeze({
    id: 'claude-code',
    displayName: 'Claude Code',
    setupCommand: (baseUrl: string) => `claude mcp add --transport http --scope user agentic-economy "${mcpEndpoint(baseUrl)}"`,
    authenticationInstruction: 'In Claude Code, open /mcp, select agentic-economy, then choose Authenticate.',
    reconnectInstruction: 'In Claude Code, open /mcp, select agentic-economy, then choose Authenticate.',
    statusCommand: 'claude mcp get agentic-economy',
  }),
  Object.freeze({
    id: 'cursor',
    displayName: 'Cursor',
    setupCommand: (baseUrl: string) => `cursor --add-mcp '${JSON.stringify({ name: 'agentic-economy', url: mcpEndpoint(baseUrl) })}'`,
    authenticationInstruction: 'Enable agentic-economy in Cursor, then follow its OAuth prompt.',
    reconnectInstruction: 'Enable agentic-economy in Cursor, then follow its OAuth prompt.',
    statusCommand: 'cursor --status',
  }),
])

export function nativeMcpClient(id: NativeMcpClientId): NativeMcpClientDefinition {
  const client = NATIVE_MCP_CLIENTS.find((definition) => definition.id === id)
  if (client === undefined) throw new Error(`Unknown native MCP client: ${id}`)
  return client
}

export function aeMcpInstallCommand(
  baseUrl: string,
  harness: AeMcpHarness,
): string {
  return nativeMcpClient(harness).setupCommand(baseUrl)
}

export function aeMcpAuthenticateInstruction(harness: AeMcpHarness): string {
  return nativeMcpClient(harness).authenticationInstruction
}

export function aeMcpListCommand(
  harness: AeMcpHarness,
): string {
  return nativeMcpClient(harness).statusCommand
}
