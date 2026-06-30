import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { AeChat } from '@/components/ae/chat/AeChat'
import { getPublicThreadProjection } from '@/modules/answer-thread/public'
import { buildPublicThreadSeo } from '@/modules/seo/public'

type ThreadRouteReadback = {
  projection: Awaited<ReturnType<typeof getPublicThreadProjection>>
  seo: ReturnType<typeof buildPublicThreadSeo> | undefined
}

const threadRouteParamsSchema = z.object({
  threadId: z.string().min(1).max(160),
})

export const readThreadRouteServer = createServerFn()
  .validator((data) => threadRouteParamsSchema.parse(data))
  .handler(({ data }) => loadThreadRouteReadback(data.threadId))

export const Route = createFileRoute('/t/$threadId')({
  loader: ({ params }) =>
    readThreadRouteServer({ data: { threadId: params.threadId } }).catch(() => unavailableThreadRouteReadback()),
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
  const { projection } = Route.useLoaderData()
  return <AeChat threadId={threadId} initialProjection={projection} />
}

export async function loadThreadRouteReadback(threadId: string): Promise<ThreadRouteReadback> {
  try {
    const projection = await getPublicThreadProjection(threadId)
    if (projection === null) {
      return unavailableThreadRouteReadback()
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
  } catch {
    return unavailableThreadRouteReadback()
  }
}

function unavailableThreadRouteReadback(): ThreadRouteReadback {
  return { projection: null, seo: undefined }
}
