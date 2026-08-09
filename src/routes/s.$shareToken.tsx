import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

import { AeSharedThreadView } from '@/components/ae/chat/AeSharedThreadView'
import {
  getSharedThreadProjection,
  parsePublicThreadProjection,
  type PublicThreadProjection,
} from '@/modules/answer-thread/public'
import {
  buildSharedThreadSeo,
  type PublicSharedThreadSeoContract,
} from '@/modules/seo/public'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'

export type SharedThreadRouteReadback = {
  projection: PublicThreadProjection | null
  seo: PublicSharedThreadSeoContract | undefined
  unavailable?: boolean
}

const shareTokenSchema = z.string().regex(/^[a-f0-9]{64}$/)
const sharedThreadRouteParamsSchema = z.object({ shareToken: shareTokenSchema })

export const readSharedThreadRouteServer = createServerFn()
  .validator((data) => sharedThreadRouteParamsSchema.parse(data))
  .handler(({ data }) => loadSharedThreadRouteReadback(data.shareToken, getRequest()))

export async function loadSharedThreadRouteReadback(
  shareToken: string,
  request?: Request,
): Promise<SharedThreadRouteReadback> {
  if (!shareTokenSchema.safeParse(shareToken).success) {
    return unavailableSharedThreadRouteReadback()
  }

  try {
    const projection = parsePublicThreadProjection(
      await getSharedThreadProjection(shareToken),
    )
    if (projection === null) {
      return unavailableSharedThreadRouteReadback()
    }
    const firstTurn = projection.turns.at(0)
    return {
      projection,
      seo: buildSharedThreadSeo({
        threadId: projection.threadId,
        shareToken,
        title: projection.title,
        ...(firstTurn === undefined ? {} : { firstTurnOneLine: firstTurn.oneLine }),
        options: { canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl },
      }),
    }
  } catch {
    return unavailableSharedThreadRouteReadback()
  }
}

export function unavailableSharedThreadRouteReadback(): SharedThreadRouteReadback {
  return { projection: null, seo: undefined, unavailable: true }
}

export const Route = createFileRoute('/s/$shareToken')({
  loader: ({ params }) =>
    readSharedThreadRouteServer({ data: { shareToken: params.shareToken } }).catch(() => unavailableSharedThreadRouteReadback()),
  head: ({ loaderData }) => {
    if (loaderData?.seo === undefined) {
      return {
        meta: [
          { title: 'Shared answer unavailable | Agentic Economy' },
          { name: 'robots', content: 'noindex, noarchive' },
          { name: 'referrer', content: 'no-referrer' },
        ],
      }
    }

    const seo = loaderData.seo
    return {
      meta: [
        { title: seo.title },
        { name: 'description', content: seo.description },
        { name: 'robots', content: `${seo.indexDirective}, noarchive` },
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
  component: SharedThreadPage,
})

function SharedThreadPage() {
  const { projection } = Route.useLoaderData()
  return <AeSharedThreadView projection={projection} />
}
