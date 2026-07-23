import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { AeCustomerRecord } from '@/components/ae/inquiries/AeCustomerRecord'
import { AeChat } from '@/components/ae/chat/AeChat'
import { takeThreadProjectionHandoff } from '@/components/ae/chat/thread-projection-handoff'
import { getPublicThreadProjection, type PublicThreadProjection } from '@/modules/answer-thread/public'
import { buildPublicThreadSeo, type PublicThreadSeoContract } from '@/modules/seo/public'
import {
  blockTelemetryForPrivateRecord,
  readPrivateRecordAccessKey,
  securePrivateRecordLocation,
} from '@/lib/observability/private-route-safety'

type ThreadRouteReadback = {
  projection: PublicThreadProjection | null
  seo: PublicThreadSeoContract | undefined
}

type ThreadRouteSearch = { k?: string }

const threadRouteParamsSchema = z.object({
  threadId: z.string().min(1).max(160),
})

export const readThreadRouteServer = createServerFn()
  .validator((data) => threadRouteParamsSchema.parse(data))
  .handler(({ data }) => loadThreadRouteReadback(data.threadId))

export const Route = createFileRoute('/t/$threadId')({
  validateSearch: (search: Record<string, unknown>): ThreadRouteSearch => {
    const k = typeof search.k === 'string' && search.k.trim().length > 0 ? search.k.trim() : undefined
    return k === undefined ? {} : { k }
  },
  loader: ({ params }) =>
    readThreadRouteServer({ data: { threadId: params.threadId } }).catch(() => unavailableThreadRouteReadback()),
  head: ({ loaderData }) => {
    if (loaderData?.seo === undefined) {
      return {
        meta: [
          { title: 'Thread unavailable | Agentic Economy' },
          { name: 'robots', content: 'noindex' },
          { name: 'referrer', content: 'no-referrer' },
        ],
      }
    }

    const seo = loaderData.seo
    return {
      meta: [
        { title: seo.title },
        { name: 'description', content: seo.description },
        { name: 'robots', content: seo.indexDirective },
        { name: 'referrer', content: 'no-referrer' },
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
  const [projectionHandoff] = useState<PublicThreadProjection | null>(
    () => projection === null ? takeThreadProjectionHandoff(threadId) : null,
  )
  const [accessKey, setAccessKey] = useState<string>()
  useEffect(() => {
    securePrivateRecordLocation(window.location, window.history)
    const bootstrappedAccessKey = readPrivateRecordAccessKey(threadId)
    if (bootstrappedAccessKey !== undefined) {
      blockTelemetryForPrivateRecord()
      setAccessKey(bootstrappedAccessKey)
    }
  }, [projection, threadId])

  const readableProjection = projection ?? projectionHandoff

  return accessKey === undefined
    ? (
        <AeChat
          threadId={threadId}
          initialProjection={readableProjection}
          initialProjectionIsTransient={projection === null && projectionHandoff !== null}
        />
      )
    : <AeCustomerRecord threadId={threadId} accessKey={accessKey} />
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
