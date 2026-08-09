import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import type {
  BuildPublicThreadSeoInput,
  BuildSharedThreadSeoInput,
  PublicSharedThreadSeoContract,
  PublicThreadSeoContract,
} from '@/modules/seo/public'

/**
 * Share-page SEO for a public answer thread. Threads are user-generated query
 * transcripts, so they are `noindex` by default - OG tags exist for link
 * previews in chat/social, not for search indexing. The description is the
 * first turn's one-line answer (boundary-honest by construction via the gate),
 * falling back to the thread title.
 */
export function buildPublicThreadSeo(input: BuildPublicThreadSeoInput): PublicThreadSeoContract {
  const canonicalBaseUrl = trimTrailingSlashes(input.options?.canonicalBaseUrl ?? 'https://ae.example')
  const canonicalUrl = `${canonicalBaseUrl}/t/${input.threadId}`
  const description = input.firstTurnOneLine?.trim() || input.title.trim()

  return {
    threadId: input.threadId,
    title: `${input.title} | Agentic Economy`,
    description,
    canonicalUrl,
    indexDirective: 'noindex',
    ogType: 'article',
  }
}

export function buildSharedThreadSeo(input: BuildSharedThreadSeoInput): PublicSharedThreadSeoContract {
  const canonicalBaseUrl = trimTrailingSlashes(input.options?.canonicalBaseUrl ?? 'https://ae.example')
  const description = input.firstTurnOneLine?.trim() || input.title.trim()

  return {
    shareToken: input.shareToken,
    title: `${input.title} | Agentic Economy`,
    description,
    canonicalUrl: `${canonicalBaseUrl}/s/${input.shareToken}`,
    indexDirective: 'noindex',
    ogType: 'article',
  }
}
