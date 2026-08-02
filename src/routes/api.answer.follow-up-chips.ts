import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { jsonError } from '@/lib/server/json-error'
import { response as jsonResponse } from '@/lib/server/no-store-response'
import { assertHttpAdmission, rateLimitedResponse, requestAdmissionKey } from '@/lib/server/rate-limit'

import {
  AnswerSourceSchema,
  readLlmFollowUpChipsEnabled,
  type AnswerArtifact,
  type AnswerSource,
} from '@/modules/answer/public'
import {
  appendSessionCookie,
  buildFollowUpChips,
  buildDeterministicFollowUpChips,
  generateLlmFollowUpChips,
  resolveOrCreateSessionId,
} from '@/modules/answer-thread/public'

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

  const boundedBody = await readBoundedRequestJson(request, MAX_FOLLOW_UP_CHIPS_BODY_BYTES)
  if (!boundedBody.ok) {
    return jsonError(boundedBody.code === 'payload_too_large' ? 'payload_too_large' : 'invalid_body', boundedBody.code === 'payload_too_large' ? 413 : 400)
  }

  const parsed = followUpChipsRequestSchema.safeParse(boundedBody.value)
  if (!parsed.success) {
    return jsonError('invalid_body', 400)
  }

  const admission = await assertHttpAdmission(request, 'answer-follow-up-chips', { key: requestAdmissionKey(request) })
  if (!admission.ok) {
    return rateLimitedResponse(admission.retryAfter)
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
    return appendSessionCookie(jsonResponse({ chips: buildDeterministicFollowUpChips(turn) }, 200), sessionId, setCookie, request)
  }

  const llmChips = await generateLlmFollowUpChips({
    query: parsed.data.query,
    providers,
    signal: request.signal,
  })

  return appendSessionCookie(
    jsonResponse({
      chips: buildFollowUpChips({ turn, llmChips }),
    }, 200),
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
  return raw.flatMap((provider) => {
    const parsed = AnswerSourceSchema.safeParse(provider)
    return parsed.success ? [parsed.data as AnswerSource] : []
  })
}


