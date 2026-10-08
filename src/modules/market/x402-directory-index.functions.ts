import { getRequest } from '@tanstack/react-start/server'
import { awaitBoundedRead, SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import type { CreatePublicConvexClientOptions } from '@/lib/server/convex-source'
import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { x402DirectoryProvidersInputSchema, x402DirectoryCatalogueInputSchema, x402DirectoryCatalogueResourceInputSchema } from './x402-directory-catalogue'
import {
  readX402DirectoryProviders, readX402DirectoryCatalogue, readX402DirectoryCatalogueOverview, readX402DirectoryCatalogueResource,
  readX402DirectoryAnalytics, readX402DirectoryCatalogueBySlug, readX402DirectoryCanonicalUrlForTool,
} from './x402-directory-index.server'
import { x402DirectoryFilterSchema } from './x402-directory'

async function readDirectorySource<T>(read: (options: CreatePublicConvexClientOptions) => Promise<T>): Promise<T> {
  const signal = AbortSignal.any([getRequest().signal, AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS)])
  return awaitBoundedRead(sourceSignal => read({ signal: sourceSignal }), signal)
}

const bySlugInputSchema = z.strictObject({ providerKey: z.string().min(1).max(253), slug: z.string().min(1).max(200) })
const canonicalUrlForToolInputSchema = z.strictObject({ toolRef: z.string().min(1) })

export const readX402DirectoryCatalogueServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryCatalogueInputSchema.parse(data))
  .handler(async ({ data }) => await readDirectorySource(options => readX402DirectoryCatalogue(data, options)))
export const readX402DirectoryCatalogueOverviewServer = createServerFn({ method: 'GET' })
  .handler(async () => await readDirectorySource(options => readX402DirectoryCatalogueOverview(options)))
export const readX402DirectoryCatalogueResourceServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryCatalogueResourceInputSchema.parse(data))
  .handler(async ({ data }) => await readDirectorySource(options => readX402DirectoryCatalogueResource(data, options)))

export const readX402DirectoryAnalyticsServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryFilterSchema.pick({ network: true }).parse(data))
  .handler(async ({ data }) => await readX402DirectoryAnalytics(data))

export const readX402DirectoryProvidersServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryProvidersInputSchema.parse(data))
  .handler(async ({ data }) => await readDirectorySource(options => readX402DirectoryProviders(data, options)))

export const readX402DirectoryCatalogueBySlugServer = createServerFn({ method: 'GET' })
  .validator(data => bySlugInputSchema.parse(data))
  .handler(async ({ data }) => await readX402DirectoryCatalogueBySlug(data))

export const readX402DirectoryCanonicalUrlForToolServer = createServerFn({ method: 'GET' })
  .validator(data => canonicalUrlForToolInputSchema.parse(data))
  .handler(async ({ data }) => await readX402DirectoryCanonicalUrlForTool(data))
