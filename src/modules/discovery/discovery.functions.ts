import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import {
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
import { readPublicBusinessPageServer } from '@/modules/catalog/owner-claim.functions'
import { selectPublicInquiryTarget } from '@/modules/inquiries/route-readbacks'
import { buildBusinessToolDescriptors } from '@/modules/business-tools/internal/descriptors'

export type PublicDiscoverySourcePort = {
  manifest: (input: ReadCatalogDiscoveryManifestInput) => Promise<ReadCatalogDiscoveryManifestResult>
  llms: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
  sitemap: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
}

const readCatalogDiscoveryManifestQuery = sourceQuery<
  ReadCatalogDiscoveryManifestInput,
  ReadCatalogDiscoveryManifestResult
>('discovery:readCatalogDiscoveryManifest')
const readLlmsTxtQuery = sourceQuery<BuildDiscoveryFileOptions, DiscoveryFileBuildResult>('discovery:readLlmsTxt')
const readSitemapXmlQuery = sourceQuery<BuildDiscoveryFileOptions, DiscoveryFileBuildResult>(
  'discovery:readSitemapXml'
)


export async function readPublicCatalogDiscoveryManifest(
  input: ReadCatalogDiscoveryManifestInput
): Promise<ReadCatalogDiscoveryManifestResult> {
  return getPublicDiscoverySourcePort().manifest(input)
}

export async function readPublicOfferingDiscoveryManifest(
  input: ReadCatalogDiscoveryManifestInput,
): Promise<BuildOfferingDiscoveryManifestResult> {
  const detail = await readPublicOfferingRegistryBusinessDetail({ slug: input.slug })
  const invocable = await readInvocableInquiry(input.slug)
  return buildOfferingDiscoveryManifest({
    ...(detail.kind === 'found' ? { business: detail.business } : {}),
    canonicalBaseUrl: input.canonicalBaseUrl,
    now: input.now,
    inquiryAdmitted: invocable !== undefined,
    tools: invocable === undefined
      ? []
      : buildBusinessToolDescriptors({
          businessSlug: input.slug,
          capabilityKind: invocable.capabilityKind,
          baseUrl: input.canonicalBaseUrl,
        }),
  })
}

export type InvocableInquiry = Readonly<{ capabilityKind: string }>

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
  return { capabilityKind: target.capabilityKind }
}

export async function readPublicLlmsTxt(options: BuildDiscoveryFileOptions): Promise<DiscoveryFileBuildResult> {
  return getPublicDiscoverySourcePort().llms(options)
}

export async function readPublicSitemapXml(options: BuildDiscoveryFileOptions): Promise<DiscoveryFileBuildResult> {
  return getPublicDiscoverySourcePort().sitemap(options)
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
    llms: (options) => callPublicSourceQuery(readLlmsTxtQuery, options),
    sitemap: (options) => callPublicSourceQuery(readSitemapXmlQuery, options),
  }
}
