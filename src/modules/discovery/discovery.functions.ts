import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import {
  buildOfferingLlmsUrlsFromSlugs,
  buildSitemapXmlFromSlugs,
} from '@/modules/discovery/public'
import type {
  BuildOfferingDiscoveryManifestResult,
  BuildDiscoveryFileOptions,
  DiscoveryFileBuildResult,
} from '@/modules/discovery/public'
import { buildOfferingDiscoveryManifest } from '@/modules/discovery/public'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'

export type PublicDiscoverySourcePort = {
  llms: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
  sitemap: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
}
let publicDiscoverySourcePortForTests: PublicDiscoverySourcePort | undefined

export function setPublicDiscoverySourcePortForTests(port: PublicDiscoverySourcePort | undefined): () => void {
  const previous = publicDiscoverySourcePortForTests
  publicDiscoverySourcePortForTests = port
  return () => {
    publicDiscoverySourcePortForTests = previous
  }
}

type DiscoveryBusinessSlugPageArgs = {
  surface: 'llms' | 'sitemap'
  paginationOpts: {
    cursor: string | null
    numItems: number
  }
}

type DiscoveryBusinessSlugPage = {
  page: string[]
  isDone: boolean
  continueCursor: string
}

const readLlmsTxtQuery = sourceQuery<
  BuildDiscoveryFileOptions & { totalBusinesses?: number },
  DiscoveryFileBuildResult
>('discovery:readLlmsTxt')
const readDiscoveryBusinessSlugPageQuery = sourceQuery<
  DiscoveryBusinessSlugPageArgs,
  DiscoveryBusinessSlugPage
>('discovery:readDiscoveryBusinessSlugPage')


export async function readPublicOfferingDiscoveryManifest(
  input: { slug: string; canonicalBaseUrl: string; now: number },
): Promise<BuildOfferingDiscoveryManifestResult> {
  const detail = await readPublicOfferingRegistryBusinessDetail({ slug: input.slug })
  return buildOfferingDiscoveryManifest({
    ...(detail.kind === 'found' ? { business: detail.business } : {}),
    canonicalBaseUrl: input.canonicalBaseUrl,
    now: input.now,
  })
}

export async function readPublicLlmsTxt(options: BuildDiscoveryFileOptions): Promise<DiscoveryFileBuildResult> {
  return getPublicDiscoverySourcePort().llms(options)
}

export async function readPublicSitemapXml(options: BuildDiscoveryFileOptions): Promise<DiscoveryFileBuildResult> {
  return getPublicDiscoverySourcePort().sitemap(options)
}

const DISCOVERY_SOURCE_PAGE_SIZE = 50

async function readAllDiscoveryBusinessSlugs(surface: DiscoveryBusinessSlugPageArgs['surface']): Promise<string[]> {
  const slugs: string[] = []
  let cursor: string | null = null
  while (true) {
    const page: DiscoveryBusinessSlugPage = await callPublicSourceQuery(readDiscoveryBusinessSlugPageQuery, {
      surface,
      paginationOpts: { cursor, numItems: DISCOVERY_SOURCE_PAGE_SIZE },
    })
    slugs.push(...page.page)
    if (page.isDone) {
      return slugs
    }
    cursor = page.continueCursor
  }
}


function getPublicDiscoverySourcePort(): PublicDiscoverySourcePort {
  if (publicDiscoverySourcePortForTests !== undefined) {
    return publicDiscoverySourcePortForTests
  }
  return {
    llms: async (options) => {
      const slugs = await readAllDiscoveryBusinessSlugs('llms')
      const result = await callPublicSourceQuery(readLlmsTxtQuery, {
        ...options,
        totalBusinesses: slugs.length,
      })
      return {
        body: result.body,
        urls: [...buildOfferingLlmsUrlsFromSlugs(slugs, options)],
      }
    },
    sitemap: async (options) => {
      const slugs = await readAllDiscoveryBusinessSlugs('sitemap')
      return buildSitemapXmlFromSlugs(slugs, options)
    },
  }
}
