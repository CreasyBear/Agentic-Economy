import { isRecord } from '@/modules/common/is-record'
import type { PreparedPublicationMaterial } from '@/modules/capability-supply/public'

import type { SupplyEndpointConfigValue } from './AeSupplyEndpointConfigStep'

export function supplyEndpointConfigFromPrepared(
  material: PreparedPublicationMaterial | undefined,
): SupplyEndpointConfigValue | undefined {
  if (material === undefined || material.sourceKind === 'ae_envelope') return undefined

  let descriptor: unknown
  let contractDocument: unknown
  try {
    descriptor = JSON.parse(material.sourceDescriptorJson)
    contractDocument = JSON.parse(material.documentJson)
  } catch {
    return undefined
  }
  if (!isRecord(descriptor) || !isRecord(contractDocument)) return undefined

  const config = material.binding.adapter.config
  if (!isRecord(config)) return undefined
  const requestTimeoutMs = config.requestTimeoutMs
  if (typeof requestTimeoutMs !== 'number') return undefined

  const { contractFormat: _contractFormat, inputSchema: _inputSchema, outputSchema: _outputSchema, ...contract } = contractDocument
  const common = {
    sourceRevision: material.sourceRevision,
    contract,
    commercial: {
      offering: material.offering,
      bindingId: material.binding.bindingId,
    },
    evidenceRefs: material.evidenceRefs,
    requestTimeoutMs,
    authority: material.binding.authority,
  }

  if (material.sourceKind === 'openapi_http') {
    const selector = material.sourceSelector as Readonly<{
      path: string
      method: 'get' | 'post'
    }>
    const fixedQuery = (config.fixedQuery ?? []) as readonly Readonly<{
      parameter: string
      value: string
    }>[]
    return {
      sourceKind: 'openapi_http',
      ...common,
      documentJson: JSON.stringify(descriptor, null, 2),
      operation: { path: selector.path, method: selector.method },
      fixedQuery,
    }
  }

  if (material.sourceKind === 'mcp') {
    const selector = material.sourceSelector as Readonly<{
      toolName: string
      protocolVersion: string
    }>
    return {
      sourceKind: 'mcp',
      ...common,
      serverUrl: String(descriptor.serverUrl),
      toolJson: JSON.stringify(descriptor.tool, null, 2),
      protocolVersion: selector.protocolVersion,
    }
  }

  if (material.sourceKind === 'agent_plugin_mcp') {
    const selector = material.sourceSelector as Readonly<{
      serverName: string
      toolName: string
      protocolVersion: string
    }>
    return {
      sourceKind: 'agent_plugin_mcp',
      ...common,
      manifestJson: JSON.stringify(descriptor.manifest, null, 2),
      serverName: selector.serverName,
      toolJson: JSON.stringify(descriptor.tool, null, 2),
      protocolVersion: selector.protocolVersion,
    }
  }

  return {
    sourceKind: 'x402',
    ...common,
    resourceJson: JSON.stringify(descriptor, null, 2),
  }
}
