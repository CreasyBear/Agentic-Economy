import type { CliOptions } from '../lib/args'
import { inspectAgentConfig } from '../lib/config'
import { usageFailure } from '../lib/help'
import { heading, line, printJson, table } from '../lib/output'

function environmentOverridePresence(): Readonly<Record<string, boolean>> {
  return {
    AE_CLI_BASE_URL: hasEnvironmentValue('AE_CLI_BASE_URL'),
    AE_CANONICAL_BASE_URL: hasEnvironmentValue('AE_CANONICAL_BASE_URL'),
    AE_API_KEY: hasEnvironmentValue('AE_API_KEY'),
    AE_API_KEY_ORIGIN: hasEnvironmentValue('AE_API_KEY_ORIGIN'),
    AE_CONFIG_DIR: hasEnvironmentValue('AE_CONFIG_DIR'),
    XDG_CONFIG_HOME: hasEnvironmentValue('XDG_CONFIG_HOME'),
    CONVEX_URL: hasEnvironmentValue('CONVEX_URL'),
    VITE_CONVEX_URL: hasEnvironmentValue('VITE_CONVEX_URL'),
  }
}

function hasEnvironmentValue(name: string): boolean {
  const value = process.env[name]
  return value !== undefined && value.trim().length > 0
}

/** Inspect effective local CLI state without reading back any credential value. */
export async function runConfigCommand(args: readonly string[], options: CliOptions): Promise<void> {
  if (args.length > 0) throw usageFailure('config', 'config-usage')

  const inspected = inspectAgentConfig()
  const result = {
    kind: 'config' as const,
    baseUrl: {
      origin: new URL(options.baseUrl).origin,
      source: options.baseUrlSource ?? 'caller',
    },
    paths: {
      config: inspected.configPath,
      mcp: inspected.mcpPath,
    },
    environmentOverrides: environmentOverridePresence(),
    config: {
      state: inspected.config.state,
      ...(inspected.config.reason === undefined ? {} : { reason: inspected.config.reason }),
    },
    mcp: { present: inspected.mcpPresent },
    connections: inspected.connections.map(({ origin, profile, scope, connectedAt }) => ({
      origin,
      profile,
      ...(scope === undefined ? {} : { scope }),
      connectedAt,
    })),
  }

  if (options.json) {
    printJson(result)
    return
  }

  heading('AE configuration')
  table([
    ['origin', result.baseUrl.origin],
    ['origin source', result.baseUrl.source],
    ['config', result.paths.config],
    ['config state', result.config.state],
    ['MCP config', result.paths.mcp],
    ['MCP present', result.mcp.present ? 'yes' : 'no'],
  ])
  if (result.config.reason !== undefined) line(`Config reason: ${result.config.reason}`)
  if (result.connections.length === 0) {
    line('No readable stored connection summaries.')
    return
  }
  line()
  for (const connection of result.connections) {
    table([
      ['origin', connection.origin],
      ['profile', connection.profile],
      ['scope', connection.scope ?? 'unknown'],
      ['connected', connection.connectedAt],
    ])
    line()
  }
}
