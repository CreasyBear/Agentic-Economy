import { Validator, type Schema } from '@cfworker/json-schema'

import { isRecord } from '@/modules/common/is-record'
import { validHttpsUrl } from './publication-importer-types'
import pluginSchema from './agent-plugins-1.0.0/plugin.schema.json'
import mcpSchema from './agent-plugins-1.0.0/mcp.schema.json'

const PLUGIN_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
const MCP_SCHEMA_ID = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'
const MAX_REMOTE_SERVERS = 8

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
  if (!matchesSchema(pluginSchema, pluginJson) || !matchesSchema(mcpSchema, mcpJson)) {
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
  for (const [name, server] of Object.entries(mcpJson.mcpServers)) {
    if (!isRecord(server) || server.type !== 'streamable-http') {
      unsupportedServerNames.push(name)
      continue
    }
    if (server.headers !== undefined) {
      return { kind: 'refused', reason: 'agent_plugin_embedded_credentials' }
    }
    const url = typeof server.url === 'string' ? validHttpsUrl(server.url) : undefined
    if (url === undefined) {
      return { kind: 'refused', reason: 'agent_plugin_remote_invalid' }
    }
    servers.push({ name, url })
    if (servers.length > MAX_REMOTE_SERVERS) {
      return { kind: 'refused', reason: 'agent_plugin_server_limit_exceeded' }
    }
  }
  if (servers.length === 0) return { kind: 'refused', reason: 'agent_plugin_remote_missing' }
  return { kind: 'valid', pluginName: pluginJson.name, servers, unsupportedServerNames }
}

function matchesSchema(schema: unknown, value: unknown): boolean {
  try {
    return new Validator(structuredClone(schema) as Schema, '2020-12', false).validate(value).valid
  } catch {
    return false
  }
}
