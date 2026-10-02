import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { productionMoneyManifestReady } from '@/lib/deployment/env-schema'
import { callSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'

const startInput = z.strictObject({
  prompt: z.string().trim().min(1).max(2_000),
  clientTurnId: z.string().trim().min(1).max(200),
  threadId: z.string().min(1).optional(),
  continuation: z.strictObject({
    kind: z.literal('search_next_page'), query: z.string(), cursor: z.string(),
  }).optional(),
})
type StartInput = z.output<typeof startInput>
type StartResult = Readonly<{
  threadId: string; turnRef: string; promptMessageId: string; sequence: number
  state: 'submitted' | 'working' | 'input-required' | 'auth-required' | 'completed' | 'failed' | 'canceled' | 'rejected'
  deadlineAt?: number
}>
type StartRefusal = Readonly<{ kind: 'not_started'; code: 'unauthenticated' | 'source_unavailable' }>

const startTurn = sourceMutation<StartInput & {
  principal: { kind: 'clerk' }; operationKey: string; correlationId: string
  sourceWrite?: SourceWriteAdmission; sourceWriteRequest?: SourceWriteAdmissionRequest
}, StartResult>('chatTurns:startTurn')

/** A browser start enters the same full-manifest and source-write boundary as HTTP starts. */
export const startOwnerChatTurnServer = createServerFn({ method: 'POST' })
  .validator(input => startInput.parse(input))
  .handler(async ({ data, context }): Promise<StartResult | StartRefusal> => {
    setResponseHeader('cache-control', 'private, no-store')
    const identity = await auth()
    if (!identity.isAuthenticated || identity.userId === null) return { kind: 'not_started', code: 'unauthenticated' }
    if (!productionMoneyManifestReady()) return { kind: 'not_started', code: 'source_unavailable' }
    const principal = { kind: 'clerk' as const }
    const operationKey = canonicalDigest({ contract: 'chat.turn.start', principal, command: data })
    const correlationId = globalThis.crypto.randomUUID()
    const command = { ...data, principal, operationKey, correlationId }
    if (process.env.AE_DEPLOYMENT_ENVIRONMENT !== 'production') {
      return await callSourceMutation(startTurn, command)
    }
    const sourceWrite = await sourceWriteAdmissionFromContext({
      context, command, scope: 'protected_action', operationKey, correlationId,
    })
    return await callSourceMutation(startTurn, {
      ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    })
  })
