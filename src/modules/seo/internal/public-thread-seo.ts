import type { BuildPublicThreadSeoInput, PublicThreadSeoContract } from '@/modules/seo/public'

/**
 * Share-page SEO for a public answer thread. Threads are user-generated query
 * transcripts, so they are `noindex` by default - OG tags exist for link
 * previews in chat/social, not for search indexing. The description is the
 * first turn's one-line answer (boundary-honest by construction via the gate),
 * falling back to the thread title.
 */
export function buildPublicThreadSeo(input: BuildPublicThreadSeoInput): PublicThreadSeoContract {
  const canonicalBaseUrl = trimTrailingSlash(input.options?.canonicalBaseUrl ?? 'https://ae.example')
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '')
}
