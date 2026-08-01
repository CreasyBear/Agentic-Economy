import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

import { readLlmFollowUpChipsEnabled } from '@/modules/answer/public'
import {
  appendSessionCookie,
  buildFollowUpChips,
  buildDeterministicFollowUpChips,
  checkAnswerFollowUpChipsRateLimit,
  generateLlmFollowUpChips,
  resolveOrCreateSessionId,
} from '@/modules/answer-thread/public'
import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'

const followUpChipsRequestSchema = z.object({
  query: z.string().trim().min(1).max(200),
  providers: z.array(z.record(z.string(), z.unknown())).default([]),
})

export const Route = createFileRoute('/api/answer/follow-up-chips')({
  server: {
    handlers: {
      POST: ({ request }) => handleFollowUpChipsRequest(request),
    },
  },
})

const MAX_FOLLOW_UP_CHIPS_BODY_BYTES = 64 * 1024

export async function handleFollowUpChipsRequest(request: Request): Promise<Response> {
  const { sessionId, setCookie } = resolveOrCreateSessionId(request)

  const boundedBody = await readBoundedRequestText(request, MAX_FOLLOW_UP_CHIPS_BODY_BYTES)
  if (!boundedBody.ok) {
    return jsonError('payload_too_large', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(boundedBody.text)
  } catch {
    return jsonError('invalid_body', 400)
  }

  const parsed = followUpChipsRequestSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError('invalid_body', 400)
  }

  const rateLimit = checkAnswerFollowUpChipsRateLimit(sessionId)
  if (rateLimit.kind === 'limited') {
    return jsonError('rate_limited', 429)
  }

  const providers = normalizeProviders(parsed.data.providers)
  const turn = {
    turnId: 'preview',
    seq: 1,
    query: parsed.data.query,
    intent: 'refine_search' as const,
    status: 'complete' as const,
    oneLine: '',
    workLog: [],
    artifacts: providers.length > 0 ? [providerCardsArtifact(providers)] : [],
  }

  if (!readLlmFollowUpChipsEnabled()) {
    return withSession(jsonResponse({ chips: buildDeterministicFollowUpChips(turn) }), sessionId, setCookie, request)
  }

  const llmChips = await generateLlmFollowUpChips({
    query: parsed.data.query,
    providers,
    signal: request.signal,
  })

  return withSession(
    jsonResponse({
      chips: buildFollowUpChips({ turn, llmChips }),
    }),
    sessionId,
    setCookie,
    request,
  )
}

function providerCardsArtifact(providers: readonly AnswerSource[]): AnswerArtifact {
  return {
    kind: 'provider-cards',
    providers,
  }
}

function normalizeProviders(raw: readonly Record<string, unknown>[]): AnswerSource[] {
  return raw.filter(isCompleteAnswerSource) as AnswerSource[]
}

function isCompleteAnswerSource(provider: Record<string, unknown>): provider is AnswerSource {
  return (
    typeof provider.citationIndex === 'number' &&
    typeof provider.slug === 'string' &&
    provider.slug.length > 0 &&
    typeof provider.name === 'string' &&
    typeof provider.detailUrl === 'string'
  )
}

function jsonResponse(body: unknown): Response {
  return Response.json(body, { headers: { 'Cache-Control': 'no-store' } })
}

function jsonError(code: string, status: number): Response {
  return Response.json({ error: code }, { status })
}

function withSession(response: Response, sessionId: string, setCookie: boolean, request: Request): Response {
  return appendSessionCookie(response, sessionId, setCookie, request)
}
