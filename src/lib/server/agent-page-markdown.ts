import { agentMarkdownResponse } from '@/lib/http/agent-content-negotiation'
import {
  AgentCatalogMarkdownLimit,
  buildBusinessMarkdown,
  buildCatalogMarkdown,
  buildMissingBusinessMarkdown,
  buildSiteBriefMarkdown,
  buildUnknownPageMarkdown,
} from '@/modules/discovery/public'
import {
  readPublicOfferingRegistryBusinessDetail,
  readPublicOfferingRegistryPage,
  readPublicOfferingRegistrySearchPage,
} from '@/modules/registry/registry.functions'

/**
 * Binds a public page path to the same source read its HTML route performs, and
 * answers with markdown. A slug that is not published answers 404 rather than a
 * generic page, so a caller cannot mistake an unknown business for a listed one.
 */
export async function respondWithAgentPageMarkdown(
  request: Request,
  path: string,
  canonicalBaseUrl: string,
): Promise<Response> {
  const options = { canonicalBaseUrl }

  if (path === '/' || path === '') {
    return agentMarkdownResponse(buildSiteBriefMarkdown(options))
  }

  if (path === '/registry') {
    const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    const page = query.length === 0
      ? await readPublicOfferingRegistryPage({ limit: AgentCatalogMarkdownLimit })
      : await readPublicOfferingRegistrySearchPage({ query, limit: AgentCatalogMarkdownLimit })
    return agentMarkdownResponse(buildCatalogMarkdown(page.items, {
      ...options,
      ...(query.length === 0 ? {} : { query }),
      total: page.pagination.total,
    }))
  }

  const slug = readSlugPath(path)
  if (slug === undefined) {
    return agentMarkdownResponse(buildUnknownPageMarkdown(path, options), 406)
  }

  const detail = await readPublicOfferingRegistryBusinessDetail({ slug })
  return detail.kind === 'found'
    ? agentMarkdownResponse(buildBusinessMarkdown(detail.business, options))
    : agentMarkdownResponse(buildMissingBusinessMarkdown(slug, options), 404)
}

/**
 * `/$slug` is the widest route in the tree, so a page route that happens to be
 * one segment long would otherwise be reported as a missing business.
 */
const nonBusinessPagePaths = new Set([
  'about', 'agent-access', 'claim', 'developers', 'engine', 'for-agents',
  'help', 'privacy', 'registry', 'terms',
])

/** Only a single-segment, slug-shaped path that names no page can name a business. */
function readSlugPath(path: string): string | undefined {
  const segments = path.split('/').filter((segment) => segment.length > 0)
  const slug = segments[0]
  return segments.length === 1
    && slug !== undefined
    && !nonBusinessPagePaths.has(slug)
    && /^[a-z0-9][a-z0-9-]{0,120}$/u.test(slug)
    ? slug
    : undefined
}
