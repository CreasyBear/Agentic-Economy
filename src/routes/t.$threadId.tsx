import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'

import { AeCustomerRecord } from '@/components/ae/inquiries/AeCustomerRecord'
import { AeChat } from '@/components/ae/chat/AeChat'
import {
  blockTelemetryForPrivateRecord,
  readPrivateRecordAccessKey,
  securePrivateRecordLocation,
} from '@/lib/observability/private-route-safety'
import { readThreadRouteServer, unavailableThreadRouteReadback } from '@/modules/answer-thread/thread-route'

type ThreadRouteSearch = { k?: string }

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
          { title: 'Chat unavailable | Agentic Economy' },
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
  headers: () => ({
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  }),
  component: ThreadPage,
})

function ThreadPage() {
  const { threadId } = Route.useParams()
  const { projection } = Route.useLoaderData()
  const [accessKey, setAccessKey] = useState<string>()
  useEffect(() => {
    securePrivateRecordLocation(window.location, window.history)
    const bootstrappedAccessKey = readPrivateRecordAccessKey(threadId)
    if (bootstrappedAccessKey !== undefined) {
      blockTelemetryForPrivateRecord()
      setAccessKey(bootstrappedAccessKey)
    }
  }, [threadId])
  return accessKey === undefined
    ? <AeChat threadId={threadId} initialProjection={projection} />
    : <AeCustomerRecord threadId={threadId} recordAccessKey={accessKey} />
}


