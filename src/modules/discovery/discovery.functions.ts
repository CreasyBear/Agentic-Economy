import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import {
  buildOfferingLlmsUrlsFromSlugs,
  buildSitemapXmlFromSlugs,
  readFixtureCatalogDiscoveryManifest,
  readFixtureLlmsTxt,
  readFixtureSitemapXml,
} from '@/modules/discovery/public'
import type {
  BuildOfferingDiscoveryManifestResult,
  BuildDiscoveryFileOptions,
  DiscoveryFileBuildResult,
  ReadCatalogDiscoveryManifestInput,
  ReadCatalogDiscoveryManifestResult,
} from '@/modules/discovery/public'
import { buildOfferingDiscoveryManifest } from '@/modules/discovery/public'
import { readPublicOfferingRegistryBusinessDetail } from '@/modules/registry/registry.functions'
import { readPublicTargetAdmissionServer } from '@/modules/inquiries/inquiry.functions'
import type { InquiryTargetRef } from '@/modules/inquiries/public'
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { selectPublicInquiryTarget } from '@/modules/inquiries/route-readbacks'
import { buildBusinessToolDescriptor } from '@/modules/business-tools/discovery'

export type PublicDiscoverySourcePort = {
  manifest: (input: ReadCatalogDiscoveryManifestInput) => Promise<ReadCatalogDiscoveryManifestResult>
  llms: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
  sitemap: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
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

const readCatalogDiscoveryManifestQuery = sourceQuery<
  ReadCatalogDiscoveryManifestInput,
  ReadCatalogDiscoveryManifestResult
>('discovery:readCatalogDiscoveryManifest')
const readLlmsTxtQuery = sourceQuery<
  BuildDiscoveryFileOptions & { totalBusinesses?: number },
  DiscoveryFileBuildResult
>('discovery:readLlmsTxt')
const readDiscoveryBusinessSlugPageQuery = sourceQuery<
  DiscoveryBusinessSlugPageArgs,
  DiscoveryBusinessSlugPage
>('discovery:readDiscoveryBusinessSlugPage')


export async function readPublicCatalogDiscoveryManifest(
  input: ReadCatalogDiscoveryManifestInput
): Promise<ReadCatalogDiscoveryManifestResult> {
  return getPublicDiscoverySourcePort().manifest(input)
}

export async function readPublicOfferingDiscoveryManifest(
  input: ReadCatalogDiscoveryManifestInput,
): Promise<BuildOfferingDiscoveryManifestResult> {
  const [detail, invocable] = await Promise.all([
    readPublicOfferingRegistryBusinessDetail({ slug: input.slug }),
    readInvocableInquiry(input.slug),
  ])
  return buildOfferingDiscoveryManifest({
    ...(detail.kind === 'found' ? { business: detail.business } : {}),
    canonicalBaseUrl: input.canonicalBaseUrl,
    now: input.now,
    inquiryAdmitted: invocable !== undefined,
    tools: invocable === undefined
      ? []
      : [buildBusinessToolDescriptor({
          businessSlug: input.slug,
          offeringRef: invocable.target.offeringRef,
          baseUrl: input.canonicalBaseUrl,
        })],
  })
}

export type InvocableInquiry = Readonly<{ target: InquiryTargetRef }>

/**
 * The same admission read the human business page performs, so both surfaces
 * describe one fact. Any failure resolves to not invocable: an agent told to
 * send nothing loses less than one told to send into a refusal.
 */
async function readInvocableInquiry(slug: string): Promise<InvocableInquiry | undefined> {
  const page = await readPublicBusinessPageServer({ data: { slug } })
  if (page.kind === 'not_found') return undefined
  const target = selectPublicInquiryTarget(page.catalog)
  if (target === undefined) return undefined
  const admission = await readPublicTargetAdmissionServer({ data: target })
  if (admission.kind !== 'ok' || !admission.admission.admitted) return undefined
  return { target }
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

  if (isLocalE2EAuthBypassEnabled()) {
    return {
      manifest: (input) => Promise.resolve(readFixtureCatalogDiscoveryManifest(input)),
      llms: (options) => Promise.resolve(readFixtureLlmsTxt(options)),
      sitemap: (options) => Promise.resolve(readFixtureSitemapXml(options)),
    }
  }

  return {
    manifest: (input) => callPublicSourceQuery(readCatalogDiscoveryManifestQuery, input),
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
