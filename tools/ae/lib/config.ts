import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import * as lockfile from 'proper-lockfile'
import { z } from 'zod'
import { MARKET_TOOLS_CALL_SCOPE, MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { CliFailure } from './output'

export type StoredConnectionProfile = 'market' | 'provider'

const connectionSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.string().min(1).default('Bearer'),
  scope: z.string().optional(),
  profile: z.enum(['market', 'provider']).default('market'),
  connectedAt: z.string().datetime(),
})

const configSchema = z.object({
  version: z.literal(1),
  connections: z.record(z.string(), connectionSchema),
  lastThreadIds: z.record(z.string(), z.string().min(1)).default({}),
})

export type AgentConfigReadFailureReason = 'unreadable' | 'invalid_json' | 'invalid_shape'

/**
 * A local configuration failure is actionable CLI state, not an absent
 * connection. Keep the diagnostic structural: never include file contents or
 * values from the credential document.
 */
export class AgentConfigReadFailure extends CliFailure {
  readonly configPath: string
  readonly reason: AgentConfigReadFailureReason
  readonly issues: readonly Readonly<{ field: string; code: string }>[]

  constructor(path: string, reason: AgentConfigReadFailureReason, issues: readonly Readonly<{
    field: string
    code: string
  }>[] = []) {
    super(`AE CLI configuration at ${path} is ${configFailureSummary(reason)}.`, {
      kind: 'FAILED_PRECONDITION',
      code: `cli_config_${reason}`,
      detail: {
        configPath: path,
        reason,
        ...(issues.length === 0 ? {} : { issues }),
      },
      suggestion: 'Repair or move the configuration file; AE left it unchanged and did not discard stored connections.',
      nextCommand: 'ae config --json',
    })
    this.name = 'AgentConfigReadFailure'
    this.configPath = path
    this.reason = reason
    this.issues = issues
  }
}

function configFailureSummary(reason: AgentConfigReadFailureReason): string {
  switch (reason) {
    case 'unreadable': return 'not readable'
    case 'invalid_json': return 'not valid JSON'
    case 'invalid_shape': return 'not a valid AE connection document'
  }
}

export type StoredConnection = z.infer<typeof connectionSchema>
export type StoredConnectionSummary = Readonly<{
  origin: string
  tokenType: string
  profile: StoredConnectionProfile
  scope?: string
  connectedAt: string
}>

export type AgentConfigInspection = Readonly<{
  configPath: string
  mcpPath: string
  mcpPresent: boolean
  config: Readonly<{
    state: 'missing' | 'ready' | 'invalid'
    reason?: AgentConfigReadFailureReason
    issues?: readonly Readonly<{ field: string; code: string }>[]
  }>
  connections: readonly StoredConnectionSummary[]
}>

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
  return { version: 1, connections: {}, lastThreadIds: {} }
}

function readConfig(): z.infer<typeof configSchema> {
  const path = configPath()
  if (!existsSync(path)) return emptyConfig()

  let source: string
  try {
    source = readFileSync(path, 'utf8')
  } catch {
    throw new AgentConfigReadFailure(path, 'unreadable')
  }

  let document: unknown
  try {
    document = JSON.parse(source)
  } catch {
    throw new AgentConfigReadFailure(path, 'invalid_json')
  }

  const parsed = configSchema.safeParse(document)
  if (!parsed.success) {
    throw new AgentConfigReadFailure(
      path,
      'invalid_shape',
      parsed.error.issues.map((issue) => ({
        field: safeConfigIssueField(issue.path),
        code: issue.code,
      })),
    )
  }
  return parsed.data
}

function safeConfigIssueField(path: readonly PropertyKey[]): string {
  const segments = path.map((segment, index) => (
    index === 1 && path[0] === 'connections' ? '<origin>' : String(segment)
  ))
  return segments.join('.') || '<root>'
}

/**
 * Serialise a read-modify-write cycle across ae processes (CWE-362). Callers
 * stay synchronous, so acquire with lockSync and wait out ELOCKED ourselves.
 */
function withConfigLock<T>(mutate: () => T): T {
  const directory = configDirectory()
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const deadline = Date.now() + 10_000
  for (let wait = 10; ; wait = Math.min(wait * 2, 200)) {
    try {
      const release = lockfile.lockSync(directory, { stale: 30_000, realpath: false })
      try { return mutate() } finally { release() }
    } catch (error) {
      if ((error as { code?: string }).code !== 'ELOCKED' || Date.now() > deadline) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait)
    }
  }
}

function writeConfig(next: z.infer<typeof configSchema>): string {
  const path = configPath()
  const directory = dirname(path)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  chmodSync(directory, 0o700)
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, `${JSON.stringify(next, undefined, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  chmodSync(temporary, 0o600)
  renameSync(temporary, path)
  chmodSync(path, 0o600)
  return path
}

function profileForScope(scope: string | undefined): StoredConnectionProfile {
  return scope?.split(/\s+/u).includes(MARKET_SUPPLY_MANAGE_SCOPE) === true ? 'provider' : 'market'
}

function connectionKey(origin: string, profile: StoredConnectionProfile): string {
  return profile === 'market' ? origin : `${origin}#provider`
}

function originForConnectionKey(key: string): string {
  return key.endsWith('#provider') ? key.slice(0, -'#provider'.length) : key
}

export function readStoredConnection(baseUrl: string, profile: StoredConnectionProfile = 'market'): StoredConnection | undefined {
  return readConfig().connections[connectionKey(new URL(baseUrl).origin, profile)]
}

/** One non-secret continuation handle per exact AE origin. */
export function lastChatThread(baseUrl: string): string | undefined {
  return readConfig().lastThreadIds[new URL(baseUrl).origin]
}

export function rememberChatThread(baseUrl: string, threadId: string): void {
  withConfigLock(() => {
    const current = readConfig()
    writeConfig({
      ...current,
      lastThreadIds: { ...current.lastThreadIds, [new URL(baseUrl).origin]: threadId },
    })
  })
}

/** Safe local inventory: never returns bearer material. */
export function listStoredConnections(): readonly StoredConnectionSummary[] {
  return Object.entries(readConfig().connections)
    .map(([key, connection]) => ({
      origin: originForConnectionKey(key),
      tokenType: connection.tokenType,
      profile: connection.profile,
      ...(connection.scope === undefined ? {} : { scope: connection.scope }),
      connectedAt: connection.connectedAt,
    }))
    .toSorted((left, right) => left.origin.localeCompare(right.origin) || left.profile.localeCompare(right.profile))
}

/** Read-only, secret-free state for `ae config`; malformed files remain untouched. */
export function inspectAgentConfig(): AgentConfigInspection {
  const path = configPath()
  const mcpPath = mcpConfigPath()
  if (!existsSync(path)) {
    return {
      configPath: path,
      mcpPath,
      mcpPresent: existsSync(mcpPath),
      config: { state: 'missing' },
      connections: [],
    }
  }
  try {
    return {
      configPath: path,
      mcpPath,
      mcpPresent: existsSync(mcpPath),
      config: { state: 'ready' },
      connections: listStoredConnections(),
    }
  } catch (error) {
    if (!(error instanceof AgentConfigReadFailure)) throw error
    return {
      configPath: path,
      mcpPath,
      mcpPresent: existsSync(mcpPath),
      config: {
        state: 'invalid',
        reason: error.reason,
        ...(error.issues.length === 0 ? {} : { issues: error.issues }),
      },
      connections: [],
    }
  }
}

/** Remove only the stored credential for one exact origin. */
export function removeStoredConnection(baseUrl: string, profile?: StoredConnectionProfile): Readonly<{
  origin: string
  removed: boolean
  configPath: string
}> {
  const origin = new URL(baseUrl).origin
  return withConfigLock(() => {
  const current = readConfig()
  const keys = profile === undefined
    ? [connectionKey(origin, 'market'), connectionKey(origin, 'provider')]
    : [connectionKey(origin, profile)]
  if (!keys.some((key) => current.connections[key] !== undefined)) {
    return { origin, removed: false, configPath: configPath() }
  }
  const connections = { ...current.connections }
  for (const key of keys) delete connections[key]
  const writtenAt = writeConfig({ ...current, connections })
  return { origin, removed: true, configPath: writtenAt }
  })
}

export function storeConnection(input: Readonly<{
  baseUrl: string
  accessToken: string
  tokenType?: string
  scope?: string
  profile?: StoredConnectionProfile
}>): string {
  const origin = new URL(input.baseUrl).origin
  return withConfigLock(() => {
  const current = readConfig()
  const profile = input.profile ?? profileForScope(input.scope)
  const next = {
    version: 1 as const,
    lastThreadIds: current.lastThreadIds,
    connections: {
      ...current.connections,
      [connectionKey(origin, profile)]: {
        accessToken: input.accessToken,
        tokenType: input.tokenType ?? 'Bearer',
        profile,
        ...(input.scope === undefined ? {} : { scope: input.scope }),
        connectedAt: new Date().toISOString(),
      },
    },
  }
  return writeConfig(next)
  })
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

export function resolveAgentAccessCredential(baseUrl: string, requiredScope: string = MARKET_TOOLS_CALL_SCOPE): Readonly<{
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
  const profile: StoredConnectionProfile = requiredScope === MARKET_SUPPLY_MANAGE_SCOPE ? 'provider' : 'market'
  const stored = readStoredConnection(baseUrl, profile)
  return stored === undefined
    ? undefined
    : { accessToken: stored.accessToken, origin: new URL(baseUrl).origin, source: 'stored' }
}
