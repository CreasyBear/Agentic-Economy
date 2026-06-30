import { createFileRoute } from '@tanstack/react-router'

import { AeChat } from '@/components/ae/chat/AeChat'
import { getPublicThreadProjection } from '@/modules/answer-thread/public'
import { buildPublicThreadSeo } from '@/modules/seo/public'

export const Route = createFileRoute('/t/$threadId')({
  loader: async ({ params }) => {
    const projection = await getPublicThreadProjection(params.threadId)
    if (projection === null) {
      return { projection, seo: undefined }
    }

    const firstTurn = projection.turns.at(0)
    return {
      projection,
      seo: buildPublicThreadSeo({
        threadId: projection.threadId,
        title: projection.title,
        ...(firstTurn === undefined ? {} : { firstTurnOneLine: firstTurn.oneLine }),
        options: { canonicalBaseUrl: 'https://ae.example' },
      }),
    }
  },
  head: ({ loaderData }) => {
    if (loaderData?.seo === undefined) {
      return {
        meta: [
          { title: 'Thread unavailable | Agentic Economy' },
          { name: 'robots', content: 'noindex' },
        ],
      }
    }

    const seo = loaderData.seo
    return {
      meta: [
        { title: seo.title },
        { name: 'description', content: seo.description },
        { name: 'robots', content: seo.indexDirective },
        { property: 'og:title', content: seo.title },
        { property: 'og:description', content: seo.description },
        { property: 'og:type', content: seo.ogType },
        { property: 'og:url', content: seo.canonicalUrl },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: seo.title },
        { name: 'twitter:description', content: seo.description },
      ],
      links: [{ rel: 'canonical', href: seo.canonicalUrl }],
    }
  },
  component: ThreadPage,
})

function ThreadPage() {
  const { threadId } = Route.useParams()
  return <AeChat threadId={threadId} />
}
