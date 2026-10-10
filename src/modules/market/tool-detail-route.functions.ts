import { getRequest } from '@tanstack/react-start/server'
import { awaitBoundedRead, SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { withSignal } from '@/lib/server/request-with-signal'
import { degrade } from '@/lib/observability/degrade'
import type { ToolDetailResult } from '@/modules/capability-supply/public'
import type { ReferenceRate } from '@/modules/money/public'
import { readPersistedReferenceRate } from '@/modules/money/reference-rate.server'
import { readToolListingEvidence } from '@/modules/market/server'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import { readCapabilityToolDetail } from '@/modules/capability-supply/tool-source'
import { registryServicesDetailAction } from '@/modules/registry/registry.actions'
import { readX402DirectoryCatalogueBySlug } from '@/modules/market/x402-directory-index.server'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'

export type PublicToolDetailRouteResult =
  | (ToolDetailResult & Readonly<{ evidence?: MarketListingEvidenceProjection; verifiedBusinessSlug?: string; referenceRate?: ReferenceRate }>)
  | Readonly<{ kind: 'source_unavailable'; toolRef: string }>

const inputSchema = z.strictObject({ toolRef: z.string() })
const OPTIONAL_DETAIL_TIMEOUT_MS = 3_000

export const readPublicToolDetailRouteServer = createServerFn()
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<PublicToolDetailRouteResult> => {
    const request = getRequest()
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS)])
    const options = { signal }
    let result: ToolDetailResult
    try {
      result = await awaitBoundedRead(() => readCapabilityToolDetail(data, options), signal)
    } catch (cause) {
      signal.throwIfAborted()
      return degrade(cause, { kind: 'source_unavailable', toolRef: data.toolRef } as const, {
        site: 'readPublicToolDetailRouteServer',
        reason: 'source_unavailable',
      })
    }
    request.signal.throwIfAborted()
    if (result.kind !== 'found') return result
    // Optional evidence gets at most three seconds and only the remaining page
    // budget. Its timeout must not discard an already-loaded Tool descriptor.
    const optionalSignal = AbortSignal.any([signal, AbortSignal.timeout(OPTIONAL_DETAIL_TIMEOUT_MS)])
    const optionalOptions = { signal: optionalSignal }
    const readOptional = <T>(read: () => Promise<T>, site: string): Promise<T | undefined> =>
      awaitBoundedRead(read, optionalSignal).catch(cause => {
        request.signal.throwIfAborted()
        return degrade(cause, undefined, { site, reason: 'source_unavailable' })
      })
    const price = result.tool.commercial.price
    const needsRate = result.tool.commercial.displayPrice === undefined && (price.kind === 'fixed'
      ? price.amount.currency === 'USDC'
      : price.kind === 'range' && price.minimum.currency === 'USDC')
    const [evidence, service, referenceRate] = await Promise.all([
      readOptional(() => readToolListingEvidence(result.tool, '30d', optionalOptions), 'toolListingEvidence'),
      readOptional(() => registryServicesDetailAction.run({ data: { slug: result.tool.business.slug }, context: { caller: 'ui', request: withSignal(request, optionalSignal) } }), 'toolPublicBusiness'),
      needsRate ? readOptional(() => readPersistedReferenceRate(optionalOptions), 'toolReferenceRate') : undefined,
    ])
    request.signal.throwIfAborted()
    const exactPublicBusiness = service?.kind === 'found'
      && service.service.id === result.tool.business.businessId
      && service.service.ae.publicUrl === `/${result.tool.business.slug}`
      && service.service.ae.source === 'business_published'
      && service.service.ae.disposition === 'current'
    return { ...result, ...(evidence === undefined ? {} : { evidence }), ...(exactPublicBusiness ? { verifiedBusinessSlug: result.tool.business.slug } : {}), ...(referenceRate === undefined ? {} : { referenceRate }) }
  })

const externalById = sourceQuery<{ id: string }, X402DirectoryCatalogueResource>('x402DirectoryIndex:detailById')

/** Rate and external listing are fetched on the server; directory details are not AE admissions. */
export const readDirectoryToolDetailRouteServer = createServerFn({ method: 'GET' })
  .validator((data) => z.union([
    z.strictObject({ providerKey: z.string().min(1).max(253), slug: z.string().min(1).max(200) }),
    z.strictObject({ id: z.string().regex(/^registry:[a-f0-9]{64}$/u) }),
  ]).parse(data))
  .handler(async ({ data }): Promise<Readonly<{ metadata: X402DirectoryCatalogueResource; referenceRate?: ReferenceRate }>> => {
    const metadata = 'id' in data ? await callPublicSourceQuery(externalById, data) : await readX402DirectoryCatalogueBySlug(data)
    if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') return { metadata }
    if (metadata.kind === 'found' && metadata.item.toolRef !== undefined) return { metadata }
    const usdcPrice = metadata.item.entry.prices.some(price => price.scheme === 'exact' && price.symbol === 'USDC')
    const referenceRate = usdcPrice ? await readPersistedReferenceRate().catch(cause => degrade(cause, undefined, { site: 'directoryToolReferenceRate', reason: 'source_unavailable' })) : undefined
    return { metadata, ...(referenceRate === undefined ? {} : { referenceRate }) }
  })
