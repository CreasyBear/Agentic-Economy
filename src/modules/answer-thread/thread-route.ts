import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'

import { getOwnedThreadProjection, parsePublicThreadProjection, type PublicThreadProjection, readAnswerSessionId } from '@/modules/answer-thread/public'
import { buildPublicThreadSeo, type PublicThreadSeoContract } from '@/modules/seo/public'
import { resolveCanonicalBaseUrl } from '@/lib/server/canonical-url'


export type ThreadRouteReadback = {
  projection: PublicThreadProjection | null
  seo: PublicThreadSeoContract | undefined
}

const threadRouteParamsSchema = z.object({
  threadId: z.string().min(1).max(160),
})

export const readThreadRouteServer = createServerFn()
  .validator((data) => threadRouteParamsSchema.parse(data))
  .handler(({ data }) => loadThreadRouteReadback(data.threadId, getRequest()))

export async function loadThreadRouteReadback(threadId: string, request?: Request): Promise<ThreadRouteReadback> {
  try {
    const pseudonymousSessionId = request === undefined ? undefined : readAnswerSessionId(request)
    if (pseudonymousSessionId === undefined) {
      return unavailableThreadRouteReadback()
    }
    const projection = parsePublicThreadProjection(
      await getOwnedThreadProjection(threadId, pseudonymousSessionId),
      threadId,
    )
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
        options: { canonicalBaseUrl: resolveCanonicalBaseUrl(request).baseUrl },
      }),
    }
  } catch {
    return unavailableThreadRouteReadback()
  }
}

export function unavailableThreadRouteReadback(): ThreadRouteReadback {
  return { projection: null, seo: undefined }
}
