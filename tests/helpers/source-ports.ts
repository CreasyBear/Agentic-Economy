import { brandNonEmpty } from '@/modules/common/ids'
import {
  buildLlmsTxt,
  buildSitemapXml,
  regenerateDiscoveryManifest,
} from '@/modules/discovery/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import { setPublicDiscoverySourcePortForTests } from '@/modules/discovery/discovery.functions'
import {
  getPublicBusinessCatalogBySlug,
  listPublicBusinessCatalog,
  searchPublicBusinessCatalog,
} from '@/modules/registry/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'

export async function withDiscoverySourcePortForTest(
  state: DiscoverySourceState,
  run: () => Promise<void>
): Promise<void> {
  const reset = setPublicDiscoverySourcePortForTests({
    manifest: ({ slug, canonicalBaseUrl, now }) => {
      const result = regenerateDiscoveryManifest(
        state,
        { slug: brandNonEmpty(slug, 'Slug') },
        {
          ...(canonicalBaseUrl === undefined ? {} : { canonicalBaseUrl }),
          now,
        }
      )

      if (result.kind === 'ok') {
        return Promise.resolve({ kind: 'available', manifest: result.manifest })
      }

      return Promise.resolve({ kind: 'hidden', reason: 'not_public' })
    },
    llms: (options) => Promise.resolve(buildLlmsTxt(state, options)),
    sitemap: (options) => Promise.resolve(buildSitemapXml(state, options)),
  })

  try {
    await run()
  } finally {
    reset()
  }
}

export async function withRegistrySourcePortForTest(
  state: RegistrySourceState,
  run: () => Promise<void>
): Promise<void> {
  const reset = setPublicRegistrySourcePortForTests({
    list: (input) => Promise.resolve(listPublicBusinessCatalog(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessCatalog(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessCatalogBySlug(state, input)),
  })

  try {
    await run()
  } finally {
    reset()
  }
}
