import { Validator, type Schema } from '@cfworker/json-schema'

import { isRecord } from '@/modules/common/is-record'
import { validHttpsUrl } from './publication-importer-types'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import pluginSchema from './agent-plugins-1.0.0/plugin.schema.json'
import mcpSchema from './agent-plugins-1.0.0/mcp.schema.json'

const PLUGIN_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const MCP_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
const MAX_REMOTE_SERVERS = 8

const mcpServerSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: (mcpSchema as Readonly<Record<string, unknown>>).$defs,
  $ref: '#/$defs/server',
}

export type AgentPluginRemoteServer = Readonly<{
  name: string
  url: string
}>

export type AgentPluginSourceValidation =
  | Readonly<{
      kind: 'valid'
      pluginName: string
      servers: readonly AgentPluginRemoteServer[]
      unsupportedServerNames: readonly string[]
    }>
  | Readonly<{ kind: 'refused'; reason: string }>

export function validateAgentPluginSource(
  pluginJson: unknown,
  mcpJson: unknown,
): AgentPluginSourceValidation {
  if (!matchesSchema(pluginSchema, pluginJson) || !validMcpEnvelope(mcpJson)) {
    return { kind: 'refused', reason: 'agent_plugin_schema_invalid' }
  }
  if (!isRecord(pluginJson) || !isRecord(mcpJson)) {
    return { kind: 'refused', reason: 'agent_plugin_schema_invalid' }
  }
  if (pluginJson.$schema !== PLUGIN_SCHEMA_ID || mcpJson.$schema !== MCP_SCHEMA_ID) {
    return { kind: 'refused', reason: 'agent_plugin_version_mismatch' }
  }
  if (typeof pluginJson.name !== 'string' || !isRecord(mcpJson.mcpServers)) {
    return { kind: 'refused', reason: 'agent_plugin_schema_invalid' }
  }

  const servers: AgentPluginRemoteServer[] = []
  const unsupportedServerNames: string[] = []
  const entries = Object.entries(mcpJson.mcpServers)
  if (entries.length > MAX_REMOTE_SERVERS) {
    return { kind: 'refused', reason: 'agent_plugin_server_limit_exceeded' }
  }
  for (const [name, server] of entries) {
    if (!matchesSchema(mcpServerSchema, server) || !isRecord(server) || server.type !== 'streamable-http') {
      unsupportedServerNames.push(name)
      continue
    }
    if (server.headers !== undefined) {
      unsupportedServerNames.push(name)
      continue
    }
    const url = typeof server.url === 'string' ? validHttpsUrl(server.url) : undefined
    if (url === undefined) {
      unsupportedServerNames.push(name)
      continue
    }
    servers.push({ name, url })
  }
  if (servers.length === 0) return { kind: 'refused', reason: 'agent_plugin_remote_missing' }
  return { kind: 'valid', pluginName: pluginJson.name, servers, unsupportedServerNames }
}

function validMcpEnvelope(value: unknown): value is Readonly<{
  $schema: string
  mcpServers: Readonly<Record<string, unknown>>
}> {
  if (!isRecord(value) || value.$schema !== MCP_SCHEMA_ID || !isRecord(value.mcpServers)) return false
  return Object.keys(value).every((key) => key === '$schema' || key === 'mcpServers')
}

function matchesSchema(schema: unknown, value: unknown): boolean {
  try {
    return new Validator(structuredClone(schema) as Schema, '2020-12', false).validate(value).valid
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'matchesSchema', reason: 'invalid_response' })
  }
}
