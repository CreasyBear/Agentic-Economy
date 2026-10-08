import { getRequest } from '@tanstack/react-start/server'
import { awaitBoundedRead, SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import type { X402DirectoryCatalogueResource } from './x402-directory-catalogue'

const idInput = z.strictObject({ id: z.string().regex(/^registry:[a-f0-9]{64}$/u) })
const byId = sourceQuery<{ id: string }, X402DirectoryCatalogueResource>('x402DirectoryIndex:detailById')

/** Public identity lookup only. An indexed listing never gains authority from its address. */
export const readMarketExternalListingServer = createServerFn({ method: 'GET' })
  .validator(data => idInput.parse(data))
  .handler(async ({ data }): Promise<X402DirectoryCatalogueResource> => {
    const signal = AbortSignal.any([getRequest().signal, AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS)])
    return awaitBoundedRead(sourceSignal => callPublicSourceQuery(byId, data, { signal: sourceSignal }), signal)
  })
