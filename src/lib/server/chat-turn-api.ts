import { auth } from '@clerk/tanstack-react-start/server'
import { createUIMessageStream, createUIMessageStreamResponse } from 'ai'
import { ConvexError } from 'convex/values'
import { z } from 'zod'

import { buildProblem, gatewayFailureToProblem } from '@/lib/errors'
import { degrade } from '@/lib/observability/degrade'
import { authRefusalProblem, authenticateAgentAccess, resolveAgentAccessPrincipal, type AgentAccessApiKeyAuth, type AgentAccessPrincipal, type AgentAccessPrincipalResolver } from '@/lib/server/agent-access-auth'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { callPublicSourceMutation, callPublicSourceQuery, callSourceMutation, callSourceQuery, sourceMutation, sourceQuery, ConvexSourceError } from '@/lib/server/convex-source'
import { projectedPart } from '@/lib/server/chat-turn-projection'
import { isJsonContentType } from '@/lib/server/json-content-type'
import { resolveCanonicalOrigin } from '@/lib/server/canonical-url'
import { problem, zodIssueDetail } from '@/lib/server/problem'
import { rateLimitedResponse, withHttpRateLimit } from '@/lib/server/rate-limit'
import { runWithRequestCorrelation, withRequestCorrelationHeader } from '@/lib/server/request-correlation'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { productionMoneyManifestReady } from '@/lib/deployment/env-schema'
import { projectStreamJourneyProblem, type CallEvent, type ChatTurnFailureReason, type TurnEvent, type WorkState } from '@/modules/actions/contract'

const startTurn = sourceMutation<Record<string, unknown>, TurnSnapshot>('chatTurns:startTurn')
const cancelTurn = sourceMutation<Record<string, unknown>, CancelResult>('chatTurns:cancelTurn')
const readTurn = sourceQuery<Record<string, unknown>, TurnSnapshot>('chatTurns:readTurn')
const readDeltas = sourceQuery<Record<string, unknown>, TurnDeltas>('chatTurns:readDeltas')
const bodySchema = z.strictObject({
  prompt: z.string().trim().min(1).max(2_000),
  threadId: z.string().min(1).optional(),
  clientTurnId: z.string().trim().min(1).max(200),
})
const turnRefSchema = z.string().regex(/^turn_[0-9a-f-]{36}$/u)
const terminal = new Set<WorkState>(['completed', 'failed', 'canceled', 'rejected', 'auth-required', 'input-required'])
const MAX_BODY_BYTES = 18 * 1024
const POLL_MS = 300
const STREAM_WINDOW_MS = 60_000

type KeyPrincipal = AgentAccessPrincipal & Readonly<{ kind: 'agent_key' }>
type TurnPrincipal = KeyPrincipal | Readonly<{ kind: 'clerk' }>
type TurnSnapshot = Readonly<{
  turnRef: string; threadId: string; promptMessageId: string; sequence: number; state: WorkState
  deadlineAt?: number; cancelRequestedAt?: number; failureReason?: ChatTurnFailureReason; failureCallRefs?: readonly string[]
  callRefs?: readonly string[]; inFlightCallRefs?: readonly string[]
}>
type CancelResult = Readonly<{ kind: 'stopped' | 'in_flight'; turnRef: string; inFlightEffects: readonly { callRef: string }[] }>
type StreamMessage = Readonly<{ streamId: string; status: 'streaming' | 'finished' | 'aborted' }>
type StreamDelta = Readonly<{ streamId: string; start: number; end: number; parts: readonly unknown[] }>
type TurnDeltas = Readonly<{
  turnRef: string; sequence: number; state: WorkState; deadlineAt?: number
  failureReason?: ChatTurnFailureReason; failureCallRefs?: readonly string[]
  streams: { kind: 'list'; messages: readonly StreamMessage[] } | { kind: 'deltas'; deltas: readonly StreamDelta[] }
}>
type StreamArgs = Readonly<{ kind: 'list' }> | Readonly<{ kind: 'deltas'; cursors: readonly { streamId: string; cursor: number }[] }>
export type ChatTurnSource = Readonly<{
  start(input: Readonly<{ prompt: string; threadId?: string; clientTurnId: string }>): Promise<TurnSnapshot>
  cancel(turnRef: string): Promise<CancelResult>
  read(turnRef: string): Promise<TurnSnapshot>
  deltas(turnRef: string, streamArgs: StreamArgs): Promise<TurnDeltas>
}>
export type ChatTurnOptions = Readonly<{
  authenticate?: () => Promise<AgentAccessApiKeyAuth>
  resolvePrincipal?: AgentAccessPrincipalResolver
  clerkAuth?: () => Promise<Readonly<{ isAuthenticated: boolean; userId?: string | null }>>
  source?: (principal: TurnPrincipal) => ChatTurnSource
}>

function sourceFor(request: Request, body: string, correlationId: string, principal: TurnPrincipal): ChatTurnSource {
  const isKey = principal.kind === 'agent_key'
  const principalArgs = isKey ? { ...principal } : { kind: 'clerk' as const }
  async function invoke<T>(name: 'start' | 'cancel' | 'read' | 'deltas', command: Record<string, unknown>): Promise<T> {
    const operationKey = canonicalDigest({ contract: `chat.turn.${name}`, principal: principalArgs, command })
    const args: Record<string, unknown> = { ...command, principal: principalArgs }
    if (isKey || (name === 'start' && process.env.AE_DEPLOYMENT_ENVIRONMENT === 'production')) {
      const signed = { ...args, operationKey, correlationId }
      const admission = await sourceWriteAdmissionFromRequest({ request, command: signed, body, scope: 'protected_action', operationKey, correlationId })
      Object.assign(args, { operationKey, correlationId, sourceWrite: admission, sourceWriteRequest: sourceWriteRequestFromAdmission(admission) })
    }
    switch (name) {
      case 'start': return await (isKey ? callPublicSourceMutation(startTurn, args) : callSourceMutation(startTurn, args)) as T
      case 'cancel': return await (isKey ? callPublicSourceMutation(cancelTurn, args) : callSourceMutation(cancelTurn, args)) as T
      case 'read': return await (isKey ? callPublicSourceQuery(readTurn, args) : callSourceQuery(readTurn, args)) as T
      case 'deltas': return await (isKey ? callPublicSourceQuery(readDeltas, args) : callSourceQuery(readDeltas, args)) as T
    }
  }
  return {
    start: (input) => invoke('start', input),
    cancel: (turnRef) => invoke('cancel', { turnRef }),
    read: (turnRef) => invoke('read', { turnRef }),
    deltas: (turnRef, streamArgs) => invoke('deltas', { turnRef, streamArgs }),
  }
}

async function admit(request: Request, body: string, correlationId: string, options: ChatTurnOptions): Promise<TurnPrincipal | Response> {
  if (request.headers.has('authorization')) {
    const resolvePrincipal = options.resolvePrincipal ?? (options.authenticate === undefined
      ? resolveAgentAccessPrincipal(request, body, correlationId) : undefined)
    const result = await authenticateAgentAccess({
      request,
      ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
      ...(resolvePrincipal === undefined ? {} : { resolvePrincipal }),
      requiredScope: 'market_tools:call', consequenceResource: 'surface:http:chat-turns',
    })
    return result.kind === 'authenticated'
      ? { ...result.principal, kind: 'agent_key' }
      : authRefusalProblem(request, result, 'market_tools:call', undefined, correlationId)
  }
  try {
    const session = await (options.clerkAuth ?? auth)()
    if (session.isAuthenticated && session.userId) return { kind: 'clerk' }
    return authRefusalProblem(request, { kind: 'refused', status: 401, reason: 'authentication_required' }, 'market_tools:call', undefined, correlationId)
  } catch (cause) {
    return degrade(cause, authRefusalProblem(request, { kind: 'refused', status: 503, reason: 'source_unavailable', retryable: true }, 'market_tools:call', undefined, correlationId), { site: 'chatTurnAdmit', reason: 'source_unavailable' })
  }
}

function sourceProblem(error: unknown, request: Request, correlationId: string): Response {
  if (error instanceof ConvexSourceError && (error.status === 401 || error.status === 403)) {
    return authRefusalProblem(request, { kind: 'refused', status: error.status, reason: error.status === 401 ? 'authentication_required' : 'scope_required' }, 'market_tools:call', undefined, correlationId)
  }
  if (error instanceof ConvexError && typeof error.data === 'object' && error.data !== null && 'code' in error.data) {
    switch (error.data.code) {
      case 'turn_conflict': return problem({ status: 409, kind: 'ALREADY_EXISTS', code: 'turn_conflict' })
      case 'turn_fenced': return problem({ status: 409, kind: 'FAILED_PRECONDITION', code: 'turn_fenced' })
      case 'turn_invalid': return problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'turn_invalid' })
      case 'turn_not_found': return problem({ status: 404, kind: 'NOT_FOUND', code: 'turn_not_found' })
      case 'unauthenticated': return authRefusalProblem(request, { kind: 'refused', status: 401, reason: 'authentication_required' }, 'market_tools:call', undefined, correlationId)
      case 'permission_denied': return authRefusalProblem(request, { kind: 'refused', status: 403, reason: 'scope_required' }, 'market_tools:call', undefined, correlationId)
      case 'rate_limited': {
        const retryAfter = 'retryAfter' in error.data && typeof error.data.retryAfter === 'number' && Number.isFinite(error.data.retryAfter)
          ? error.data.retryAfter : 5_000
        return rateLimitedResponse(retryAfter)
      }
    }
  }
  const unavailable = error instanceof TypeError || error instanceof ConvexSourceError && error.status === 503
  return problem({ ...gatewayFailureToProblem({ kind: 'error', code: unavailable ? 'source_unavailable' : 'chat_turn_failed', retryable: unavailable }), status: unavailable ? 503 : 500 })
}

function turnEvent(turn: TurnSnapshot, correlationId: string, sequence: number): TurnEvent {
  return {
    kind: 'turn', turnRef: turn.turnRef as TurnEvent['turnRef'],
    contextId: turn.threadId as TurnEvent['contextId'], state: turn.state, sequence,
    ...(turn.deadlineAt === undefined ? {} : { deadlineAt: turn.deadlineAt }),
    eventId: `${turn.turnRef}:${sequence}`, correlationId,
    ...(turn.failureReason === undefined ? {} : {
      failureReason: turn.failureReason,
      ...(turn.failureCallRefs === undefined ? {} : { failureCallRefs: turn.failureCallRefs }),
    }),
  }
}


function streamTurn(request: Request, turn: TurnSnapshot, source: ChatTurnSource, correlationId: string): Response {
  const origin = resolveCanonicalOrigin(request)
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      let sequence = turn.sequence
      let current = turn
      writer.write({ type: 'data-ae-state', data: turnEvent(current, correlationId, sequence++) })
      const cursors = new Map<string, number>()
      const toolNames = new Map<string, string>()
      const deadline = Date.now() + STREAM_WINDOW_MS
      while (!request.signal.aborted && Date.now() < deadline) {
        try {
          const listed = await source.deltas(turn.turnRef, { kind: 'list' })
          if (listed.streams.kind !== 'list') throw new Error('chat_stream_invalid')
          for (const message of listed.streams.messages) if (!cursors.has(message.streamId)) cursors.set(message.streamId, 0)
          if (cursors.size) {
            const received = await source.deltas(turn.turnRef, { kind: 'deltas', cursors: [...cursors].map(([streamId, cursor]) => ({ streamId, cursor })) })
            if (received.streams.kind !== 'deltas') throw new Error('chat_stream_invalid')
            for (const delta of received.streams.deltas) {
              if (!cursors.has(delta.streamId) || delta.start !== cursors.get(delta.streamId)) throw new Error('chat_stream_gap')
              cursors.set(delta.streamId, delta.end)
              for (const part of delta.parts) {
                for (const projected of projectedPart(part, toolNames, turn, correlationId, sequence, origin)) {
                  writer.write(projected)
                  sequence++
                  if (projected.type === 'data-ae-receipt' && (projected.data as CallEvent).payment === 'outcome_unknown') {
                    const callRef = (projected.data as CallEvent).callRef
                    const guidance = projectStreamJourneyProblem({
                      ...buildProblem({ status: 409, kind: 'FAILED_PRECONDITION', code: 'outcome_unknown', detail: 'Call outcome is unknown; read its status before retrying.', retryable: true }), requestId: correlationId,
                      refs: { callRef }, next: [{ action: 'call.status', args: { callRef }, authority: 'same_principal' }],
                    }, { origin })
                    writer.write({ type: guidance.type, data: guidance.value })
                    sequence++
                  }
                }
              }
            }
          }
          if (listed.state !== current.state) {
            current = {
              ...current, state: listed.state,
              ...(listed.deadlineAt === undefined ? {} : { deadlineAt: listed.deadlineAt }),
              ...(listed.failureReason === undefined ? {} : {
                failureReason: listed.failureReason,
                ...(listed.failureCallRefs === undefined ? {} : { failureCallRefs: listed.failureCallRefs }),
              }),
            }
            writer.write({ type: 'data-ae-state', data: turnEvent(current, correlationId, sequence++) })
          }
          if (terminal.has(listed.state)) break
          const { promise, resolve } = Promise.withResolvers<void>()
          setTimeout(resolve, POLL_MS)
          await promise
        } catch (error) {
          const failure = sourceProblem(error, request, correlationId)
          const body = await failure.json() as Record<string, unknown>
          const projected = projectStreamJourneyProblem({
            ...body, requestId: correlationId,
            next: failure.status === 401 || failure.status === 403 ? body.next
              : [{ action: 'journey.status', args: { ref: { kind: 'turn', ref: turn.turnRef } }, authority: 'same_principal' }],
          }, { origin })
          writer.write({ type: projected.type, data: projected.value })
          break
        }
      }
    },
  })
  return withRequestCorrelationHeader(createUIMessageStreamResponse({
    stream, headers: { 'Cache-Control': 'no-store' },
  }), correlationId)
}

export async function handleChatTurnPost(request: Request, options: ChatTurnOptions = {}): Promise<Response> {
  return runWithRequestCorrelation(request, async ({ correlationId }) => {
    try {
      return await withHttpRateLimit(request, 'public-mutation', async () => {
        const bounded = await readBoundedRequestText(request, MAX_BODY_BYTES)
        if (!bounded.ok) return withRequestCorrelationHeader(problem({ status: 413, kind: 'PAYLOAD_TOO_LARGE', code: bounded.code }), correlationId)
        const principal = await admit(request, bounded.text, correlationId, options)
        if (principal instanceof Response) return principal
        if (!(await isJsonContentType(request.headers.get('content-type')))) return withRequestCorrelationHeader(problem({ status: 415, kind: 'UNSUPPORTED_MEDIA_TYPE', code: 'invalid_content_type' }), correlationId)
        let value: unknown
        try { value = JSON.parse(bounded.text) } catch (cause) {
          return degrade(cause, withRequestCorrelationHeader(problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_json' }), correlationId), { site: 'handleChatTurnPost', reason: 'invalid_response' })
        }
        const parsed = bodySchema.safeParse(value)
        if (!parsed.success) return withRequestCorrelationHeader(problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'invalid_input', detail: zodIssueDetail(parsed.error) }), correlationId)
        if (!productionMoneyManifestReady()) return withRequestCorrelationHeader(problem({
          status: 503, kind: 'UNAVAILABLE', code: 'source_unavailable', retryable: true,
          detail: 'Chat purchases are temporarily unavailable.',
        }), correlationId)
        try {
          const source = options.source?.(principal) ?? sourceFor(request, bounded.text, correlationId, principal)
          const turn = await source.start({ prompt: parsed.data.prompt, clientTurnId: parsed.data.clientTurnId, ...(parsed.data.threadId === undefined ? {} : { threadId: parsed.data.threadId }) })
          return streamTurn(request, turn, source, correlationId)
        } catch (error) { return withRequestCorrelationHeader(sourceProblem(error, request, correlationId), correlationId) }
      })
    } catch (error) { return withRequestCorrelationHeader(sourceProblem(error, request, correlationId), correlationId) }
  })
}

export async function handleChatTurnResource(request: Request, turnRef: string, options: ChatTurnOptions = {}): Promise<Response> {
  return runWithRequestCorrelation(request, async ({ correlationId }) => {
    try {
      return await withHttpRateLimit(request, 'public-read', async () => {
        const principal = await admit(request, '', correlationId, options)
        if (principal instanceof Response) return principal
        const parsed = turnRefSchema.safeParse(turnRef)
        if (!parsed.success) return withRequestCorrelationHeader(problem({ status: 400, kind: 'INVALID_ARGUMENT', code: 'malformed_ref' }), correlationId)
        try {
          const source = options.source?.(principal) ?? sourceFor(request, '', correlationId, principal)
          const result = request.method === 'DELETE' ? await source.cancel(turnRef) : await source.read(turnRef)
          return withRequestCorrelationHeader(Response.json(result, { headers: { 'Cache-Control': 'no-store' } }), correlationId)
        } catch (error) { return withRequestCorrelationHeader(sourceProblem(error, request, correlationId), correlationId) }
      })
    } catch (error) { return withRequestCorrelationHeader(sourceProblem(error, request, correlationId), correlationId) }
  })
}
