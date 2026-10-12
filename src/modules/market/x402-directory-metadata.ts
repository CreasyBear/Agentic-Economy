import { isRecord } from '@/modules/common/is-record'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { X402DirectoryEntry } from './x402-directory'
import { admitBazaarDiscoveryInfo } from '@/modules/capability-supply/public'

/**
 * Requires a supported Bazaar HTTP declaration. Ensures the editor uses the
 * same body/query/path mapping as admission, preserving source metadata.
 * Invariant: no Provider request or authority change. Invalid declarations
 * return undefined so the page retains its source-only presentation.
 */
export function directoryCallableInput(entry: X402DirectoryEntry) {
  let source: unknown
  try { source = JSON.parse(entry.metadataJson) } catch (cause) {
    return degradeBackend(cause, undefined, { site: 'directoryCallableInput', reason: 'invalid_response' })
  }
  const extensions = isRecord(source) ? source.extensions : undefined
  const bazaar = isRecord(extensions) ? extensions.bazaar : undefined
  const info = isRecord(bazaar) ? bazaar.info : undefined
  if (!isRecord(bazaar) || !isRecord(info) || !isRecord(info.input)) return undefined
  const admitted = admitBazaarDiscoveryInfo(bazaar, { input: info.input, output: info.output })
  if (admitted.kind !== 'admitted') return undefined
  return {
    inputSchemaJson: JSON.stringify(admitted.inputSchema),
    ...(admitted.inputExample === undefined ? {} : { sampleInputJson: JSON.stringify(admitted.inputExample) }),
  }
}

/** Published structure, not a judgment of correctness, usefulness or runtime support. */
export function directoryMetadataFlags(entry: X402DirectoryEntry) {
  const meaningfulExample = (json: string | undefined): boolean => {
    if (json === undefined) return false
    try {
      const value: unknown = JSON.parse(json)
      if (value === null) return false
      if (typeof value === 'string') return value.trim().length > 0
      if (Array.isArray(value)) return value.length > 0
      if (isRecord(value)) return Object.keys(value).length > 0
      return typeof value === 'number' || typeof value === 'boolean'
    } catch (cause) { return degradeBackend(cause, false, { site: 'directoryMetadataFlags', reason: 'invalid_response' }) }
  }
  return {
    hasInputFields: (entry.input?.fields.length ?? 0) > 0,
    hasOutputFields: (entry.output?.fields.length ?? 0) > 0,
    hasInputSchema: entry.input?.schemaJson !== undefined || entry.input?.schemaOmitted === true,
    hasOutputSchema: entry.output?.schemaJson !== undefined || entry.output?.schemaOmitted === true,
    hasOutputExample: meaningfulExample(entry.output?.exampleJson),
  }
}

/** Coinbase-supplied curation and collection membership retained in the public observation. */
export function directorySourceLabels(source: unknown): { curated?: true; bundleSlugs?: string[] } {
  if (!isRecord(source)) return {}
  const bundleSlugs = Array.isArray(source.bundleSlugs)
    ? [...new Set(source.bundleSlugs.filter((value): value is string => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 64))].slice(0, 20)
    : []
  return {
    ...(source.curated === true ? { curated: true as const } : {}),
    ...(bundleSlugs.length === 0 ? {} : { bundleSlugs }),
  }
}
