import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import {
  readFixtureCatalogDiscoveryManifest,
  readFixtureLlmsTxt,
  readFixtureSitemapXml,
} from '@/modules/discovery/public'
import type {
  BuildDiscoveryFileOptions,
  DiscoveryFileBuildResult,
  ReadCatalogDiscoveryManifestInput,
  ReadCatalogDiscoveryManifestResult,
} from '@/modules/discovery/public'

export type PublicDiscoverySourcePort = {
  manifest: (input: ReadCatalogDiscoveryManifestInput) => Promise<ReadCatalogDiscoveryManifestResult>
  llms: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
  sitemap: (options: BuildDiscoveryFileOptions) => Promise<DiscoveryFileBuildResult>
}

export type PublicDiscoveryQueryClient = PublicDiscoverySourcePort

const readCatalogDiscoveryManifestQuery = sourceQuery<
  ReadCatalogDiscoveryManifestInput,
  ReadCatalogDiscoveryManifestResult
>('discovery:readCatalogDiscoveryManifest')
const readLlmsTxtQuery = sourceQuery<BuildDiscoveryFileOptions, DiscoveryFileBuildResult>('discovery:readLlmsTxt')
const readSitemapXmlQuery = sourceQuery<BuildDiscoveryFileOptions, DiscoveryFileBuildResult>(
  'discovery:readSitemapXml'
)

let publicDiscoverySourcePortForTests: PublicDiscoverySourcePort | undefined

export function setPublicDiscoverySourcePortForTests(port: PublicDiscoverySourcePort): () => void {
  const previous = publicDiscoverySourcePortForTests
  publicDiscoverySourcePortForTests = port
  return () => {
    publicDiscoverySourcePortForTests = previous
  }
}

export const setPublicDiscoveryQueryClientForTests = setPublicDiscoverySourcePortForTests

export async function readPublicCatalogDiscoveryManifest(
  input: ReadCatalogDiscoveryManifestInput
): Promise<ReadCatalogDiscoveryManifestResult> {
  return getPublicDiscoverySourcePort().manifest(input)
}

export async function readPublicLlmsTxt(options: BuildDiscoveryFileOptions): Promise<DiscoveryFileBuildResult> {
  return getPublicDiscoverySourcePort().llms(options)
}

export async function readPublicSitemapXml(options: BuildDiscoveryFileOptions): Promise<DiscoveryFileBuildResult> {
  return getPublicDiscoverySourcePort().sitemap(options)
}

function getPublicDiscoverySourcePort(): PublicDiscoverySourcePort {
  if (publicDiscoverySourcePortForTests !== undefined) {
    return publicDiscoverySourcePortForTests
  }

  if (usesLocalE2eBypass()) {
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

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}
