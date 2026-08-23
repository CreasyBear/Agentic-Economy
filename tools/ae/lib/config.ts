import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { z } from 'zod'

const connectionSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().min(1).default('Bearer'),
  scope: z.string().optional(),
  connectedAt: z.string().datetime(),
})

const configSchema = z.object({
  version: z.literal(1),
  connections: z.record(z.string(), connectionSchema),
})

export type StoredConnection = z.infer<typeof connectionSchema>

function configDirectory(): string {
  const override = process.env.AE_CONFIG_DIR?.trim()
  if (override !== undefined && override.length > 0) return override
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return xdg !== undefined && xdg.length > 0 ? join(xdg, 'ae') : join(homedir(), '.config', 'ae')
}

export function configPath(): string {
  return join(configDirectory(), 'config.json')
}

export function mcpConfigPath(): string {
  return join(configDirectory(), 'mcp.json')
}

function emptyConfig(): z.infer<typeof configSchema> {
  return { version: 1, connections: {} }
}

function readConfig(): z.infer<typeof configSchema> {
  const path = configPath()
  if (!existsSync(path)) return emptyConfig()
  try {
    return configSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return emptyConfig()
  }
}

export function readStoredConnection(baseUrl: string): StoredConnection | undefined {
  return readConfig().connections[new URL(baseUrl).origin]
}

export function storeConnection(input: Readonly<{
  baseUrl: string
  accessToken: string
  tokenType?: string
  scope?: string
}>): string {
  const path = configPath()
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const current = readConfig()
  const origin = new URL(input.baseUrl).origin
  const next = {
    version: 1 as const,
    connections: {
      ...current.connections,
      [origin]: {
        accessToken: input.accessToken,
        tokenType: input.tokenType ?? 'Bearer',
        ...(input.scope === undefined ? {} : { scope: input.scope }),
        connectedAt: new Date().toISOString(),
      },
    },
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(next, undefined, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  chmodSync(temporary, 0o600)
  renameSync(temporary, path)
  chmodSync(path, 0o600)
  return path
}

export function storeMcpConnection(input: Readonly<{ baseUrl: string; accessToken: string }>): string {
  const path = mcpConfigPath()
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const document = {
    mcpServers: {
      'agentic-economy': {
        type: 'streamable-http',
        url: `${new URL(input.baseUrl).origin}/mcp`,
        headers: { Authorization: `Bearer ${input.accessToken}` },
      },
    },
  }
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(document, undefined, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  chmodSync(temporary, 0o600)
  renameSync(temporary, path)
  chmodSync(path, 0o600)
  return path
}

export function resolveAgentAccessCredential(baseUrl: string): Readonly<{
  accessToken: string
  origin: string
  source: 'environment' | 'stored'
}> | undefined {
  const environmentToken = process.env.AE_API_KEY?.trim()
  if (environmentToken !== undefined && environmentToken.length > 0) {
    const environmentOrigin = process.env.AE_API_KEY_ORIGIN?.trim()
    return {
      accessToken: environmentToken,
      origin: environmentOrigin ?? '',
      source: 'environment',
    }
  }
  const stored = readStoredConnection(baseUrl)
  return stored === undefined
    ? undefined
    : { accessToken: stored.accessToken, origin: new URL(baseUrl).origin, source: 'stored' }
}
