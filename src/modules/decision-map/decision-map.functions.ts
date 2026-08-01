import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { isRecord } from '@/modules/common/is-record'
import { getAnswerThread, resolveOrCreateSessionId } from '@/modules/answer-thread/public'

import {
  decisionMapChoiceInputSchema,
  decisionMapConstraintChangeInputSchema,
  type DecisionMapChoiceInput,
  type DecisionMapConstraintChangeInput,
  type DecisionMapSnapshot,
  readDecisionMapByThread,
  recordDecisionMapChoice,
  recordDecisionMapConstraintChange,
} from './public'
import { assertDecisionMapThreadOwner } from './internal/session-ownership'

export type DecisionMapMutationServerResult = Readonly<
  | { kind: 'ok'; snapshot: DecisionMapSnapshot }
  | { kind: 'stale'; reason: string }
  | { kind: 'error'; reason: string }
>

const readInputSchema = z.strictObject({ threadId: z.string().trim().min(1).max(80) })

export const readDecisionMapServer = createServerFn()
  .validator((data) => readInputSchema.parse(data))
  .handler(async ({ data }): Promise<DecisionMapSnapshot | null> => {
    try {
      const sessionId = await requireOwnedThread(data.threadId, getRequest())
      return await readDecisionMapByThread(data.threadId, sessionId)
    } catch {
      return null
    }
  })

export const recordDecisionMapChoiceServer = createServerFn({ method: 'POST' })
  .validator((data) => decisionMapChoiceInputSchema.parse(data))
  .handler(async ({ data }): Promise<DecisionMapMutationServerResult> => {
    try {
      const sessionId = await requireOwnedThread(data.threadId, getRequest())
      const result = await recordDecisionMapChoice(data as DecisionMapChoiceInput, getRequest(), sessionId)
      return { kind: 'ok', snapshot: acknowledgedSnapshot(result) }
    } catch (error) {
      return mutationError(error)
    }
  })

export const recordDecisionMapConstraintChangeServer = createServerFn({ method: 'POST' })
  .validator((data) => decisionMapConstraintChangeInputSchema.parse(data))
  .handler(async ({ data }): Promise<DecisionMapMutationServerResult> => {
    try {
      const sessionId = await requireOwnedThread(data.threadId, getRequest())
      const result = await recordDecisionMapConstraintChange(data as DecisionMapConstraintChangeInput, getRequest(), sessionId)
      return { kind: 'ok', snapshot: acknowledgedSnapshot(result) }
    } catch (error) {
      return mutationError(error)
    }
  })

async function requireOwnedThread(threadId: string | undefined, request: Request): Promise<string> {
  const thread = threadId === undefined ? null : await getAnswerThread(threadId)
  const { sessionId } = resolveOrCreateSessionId(request)
  assertDecisionMapThreadOwner(threadId, sessionId, thread)
  return sessionId
}

function acknowledgedSnapshot(result: unknown): DecisionMapSnapshot {
  const record = isRecord(result) ? result : undefined
  if (isRecord(record?.snapshot)) return record.snapshot as DecisionMapSnapshot
  if (record !== undefined) return record as DecisionMapSnapshot
  throw new Error('The decision map returned no acknowledged snapshot.')
}

function mutationError(error: unknown): DecisionMapMutationServerResult {
  const code = isRecord(error) && typeof error.code === 'string' ? error.code : ''
  const reason = error instanceof Error && error.message.trim().length > 0 ? error.message : 'The decision could not be saved. Nothing changed.'
  if (reason === 'thread_forbidden') return { kind: 'error', reason: 'This decision map does not belong to the current session. Nothing changed.' }
  return code.includes('stale') || code.includes('generation') || code.includes('revision') ? { kind: 'stale', reason: 'That choice belongs to an earlier version. I haven’t applied it. Load the latest map and choose again.' } : { kind: 'error', reason }
}

