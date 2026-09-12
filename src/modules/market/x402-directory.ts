import { z } from 'zod'

export type X402DirectoryField = Readonly<{
  name: string
  path: string
  location: 'body' | 'queryParams' | 'pathParams' | 'headers' | 'output'
  source: 'schema' | 'example'
  type?: string
  required?: boolean
  description?: string
  enumValues?: readonly string[]
  defaultJson?: string
  exampleJson?: string
  constraints?: readonly string[]
}>

export type X402DirectoryContract = Readonly<{
  fields: readonly X402DirectoryField[]
  type?: string
  schemaJson?: string
  exampleJson?: string
  schemaOmitted?: true
  exampleOmitted?: true
  fieldsTruncated?: true
}>

export type X402DirectoryEntry = Readonly<{
  resource: string
  title: string
  serviceName?: string
  iconUrl?: string
  skillUrl?: string
  category?: string
  input?: X402DirectoryContract
  output?: X402DirectoryContract
  description: string
  protocol: string
  method?: string
  methodLabel?: string
  outputSummary?: string
  schemaSummary?: string
  tags?: readonly string[]
  curated?: true
  bundleSlugs?: readonly string[]
  provenance?: Readonly<{ directory: 'Coinbase Bazaar'; metadata: 'provider_declared'; updatedAt?: string }>
  activity?: Readonly<{ calls30d?: number; payers30d?: number; lastCalledAt?: string }>
  provider: string
  prices: readonly Readonly<{ network: string; networkLabel?: string; scheme: string; amount: string; asset?: string; symbol?: string; decimalAmount?: string }>[]
  metadataJson: string
}>

export type X402DirectoryPage =
  | Readonly<{
      kind: 'ok'
      items: readonly X402DirectoryEntry[]
      total?: number
      offset: number
      limit: number
      nextOffset?: number
      previousOffset?: number
      partialResults?: boolean
      mode?: 'browse' | 'search'
      appliedFilters?: X402DirectoryFilters
    }>
  | Readonly<{ kind: 'unavailable'; reason: 'query_invalid' | 'source_unavailable' }>

function canonicalProviderHost(value: string): string | undefined {
  if (/[\s\/\\@?#:%]/u.test(value)) return undefined
  try {
    const url = new URL(`https://${value}`)
    if (url.username !== '' || url.password !== '' || url.port !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') return undefined
    const host = url.hostname.toLowerCase()
    return host.includes('.') && host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) ? host : undefined
  } catch { return undefined }
}

export const x402DirectoryFilterSchema = z.strictObject({
  // Accept official CAIP-2 identifiers and the SDK's legacy network aliases.
  network: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9:_-]*$/u).optional(),
  provider: z.string().trim().min(3).max(253)
    // Canonicalise once and report the refusal from the same place, so the
    // parsed value never depends on re-running the check.
    .transform((value, ctx) => {
      const host = canonicalProviderHost(value)
      if (host === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Enter a Provider hostname.' })
        return z.NEVER
      }
      return host
    }).optional(),
  maxUsdPrice: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
})
export type X402DirectoryFilters = z.infer<typeof x402DirectoryFilterSchema>

export const x402DirectoryInputSchema = x402DirectoryFilterSchema.extend({
  query: z.string().max(256).optional(),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
})
export const x402DirectoryResolveInputSchema = x402DirectoryInputSchema.extend({ resource: z.string().min(1).max(8192) })
export type X402DirectoryInput = z.infer<typeof x402DirectoryInputSchema>
export type X402DirectoryResolveInput = z.infer<typeof x402DirectoryResolveInputSchema>
export type X402DirectoryResolution = Readonly<{ kind: 'ready'; toolRef: string }> | Readonly<{ kind: 'unavailable'; reason: string }>

const X402_PENDING_TOOL_REF_PREFIX = 'x402:'

/**
 * The `/tools/$toolRef` route's one identifier for a catalogue entry that has
 * not yet been admitted into the capability supply as a Tool. The route
 * loader resolves it (the same server round trip the retired Tool detail
 * dialog performed) before reading the Tool descriptor.
 */
export function x402PendingToolRef(resource: string): string {
  return `${X402_PENDING_TOOL_REF_PREFIX}${encodeURIComponent(resource)}`
}

export function readX402PendingResource(toolRef: string): string | undefined {
  if (!toolRef.startsWith(X402_PENDING_TOOL_REF_PREFIX)) return undefined
  try {
    const resource = decodeURIComponent(toolRef.slice(X402_PENDING_TOOL_REF_PREFIX.length))
    return resource.length > 0 ? resource : undefined
  } catch { return undefined }
}
