export function isDirectPublicationSource(
  value: unknown,
): value is Readonly<{ kind: 'ae_envelope'; documentJson: string }> {
  return typeof value === 'object' && value !== null
    && 'kind' in value && value.kind === 'ae_envelope'
    && 'documentJson' in value && typeof value.documentJson === 'string'
}

export function decodeConvexPublicationSource(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return value
  try {
    if (value.kind === 'openapi_http' && 'documentJson' in value && typeof value.documentJson === 'string') {
      const { documentJson, ...source } = value
      return { ...source, document: JSON.parse(documentJson) }
    }
    if (value.kind === 'mcp' && 'toolJson' in value && typeof value.toolJson === 'string') {
      const { toolJson, ...source } = value
      return { ...source, tool: JSON.parse(toolJson) }
    }
    if (value.kind === 'x402' && 'resourceJson' in value && typeof value.resourceJson === 'string') {
      const { resourceJson, ...source } = value
      return { ...source, resource: JSON.parse(resourceJson) }
    }
  } catch {
    return undefined
  }
  return value
}
