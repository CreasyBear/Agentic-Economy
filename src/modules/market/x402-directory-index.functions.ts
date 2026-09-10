import { createServerFn } from '@tanstack/react-start'
import { x402DirectoryProvidersInputSchema, x402DirectoryCatalogueInputSchema, x402DirectoryCatalogueResourceInputSchema } from './x402-directory-catalogue'
import { readX402DirectoryProviders, readX402DirectoryCatalogue, readX402DirectoryCatalogueOverview, readX402DirectoryCatalogueResource, readX402DirectoryAnalytics } from './x402-directory-index.server'
import { x402DirectoryFilterSchema } from './x402-directory'

export const readX402DirectoryCatalogueServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryCatalogueInputSchema.parse(data))
  .handler(async ({ data }) => await readX402DirectoryCatalogue(data))
export const readX402DirectoryCatalogueOverviewServer = createServerFn({ method: 'GET' })
  .handler(async () => await readX402DirectoryCatalogueOverview())
export const readX402DirectoryCatalogueResourceServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryCatalogueResourceInputSchema.parse(data))
  .handler(async ({ data }) => await readX402DirectoryCatalogueResource(data))

export const readX402DirectoryAnalyticsServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryFilterSchema.pick({ network: true }).parse(data))
  .handler(async ({ data }) => await readX402DirectoryAnalytics(data))

export const readX402DirectoryProvidersServer = createServerFn({ method: 'GET' })
  .validator(data => x402DirectoryProvidersInputSchema.parse(data))
  .handler(async ({ data }) => await readX402DirectoryProviders(data))
