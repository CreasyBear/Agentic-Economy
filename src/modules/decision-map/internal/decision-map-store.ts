import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import {
  sourceWriteAdmissionFromContext,
  sourceWriteAdmissionFromRequest,
} from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

import type {
  DecisionMapAuthorInput,
  DecisionMapChoiceInput,
  DecisionMapConstraintChangeInput,
  DecisionMapSnapshot,
} from './contract'

export type DecisionMapEvent = Readonly<{
  projectId: string
  threadId: string
  generation: number
  revision: number
  seq: number
  kind: string
  operationKey: string
  payloadJson: string
  payloadDigest: string
  at: number
}>

export type DecisionMapReadResult = Readonly<{
  snapshot: DecisionMapSnapshot
  events: readonly DecisionMapEvent[]
}>

export type PersistDecisionMapDraftInput = DecisionMapAuthorInput & Readonly<{
  operationKey?: string
  ownerSessionId: string
}>

export type DecisionMapStorePort = Readonly<{
  readDecisionMapByThread(threadId: string, ownerSessionId: string): Promise<DecisionMapSnapshot | null>
  persistDecisionMapDraft(
    input: PersistDecisionMapDraftInput,
    sourceWriteRequest?: Request,
  ): Promise<DecisionMapSnapshot>
  recordDecisionMapChoice(
    input: DecisionMapChoiceInput,
    contextOrRequest?: unknown,
  ): Promise<DecisionMapSnapshot | DecisionMapMutationResult>
  recordDecisionMapConstraintChange(
    input: DecisionMapConstraintChangeInput,
    contextOrRequest?: unknown,
  ): Promise<DecisionMapSnapshot | DecisionMapMutationResult>
}>

type SourceWriteMutationArgs = Readonly<{
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
}>

type CreateMutationArgs = Readonly<{
  projectId: string
  threadId: string
  ownerSessionId: string
  draftJson: string
  generation?: number
  revision?: number
  createdAt?: number
  updatedAt?: number
  now?: number
}> & SourceWriteMutationArgs

type ChoiceMutationArgs = DecisionMapChoiceInput & SourceWriteMutationArgs & Readonly<{ ownerSessionId: string }>
type ConstraintMutationArgs = DecisionMapConstraintChangeInput & SourceWriteMutationArgs & Readonly<{ ownerSessionId: string }>
export type DecisionMapMutationResult = Readonly<{
  kind: 'applied' | 'replayed'
  snapshot: DecisionMapSnapshot
  replayed: boolean
  operationKey: string
  seq?: number
  event?: { kind: string; operationKey: string; seq: number }
  decisionRecord?: DecisionMapSnapshot['decisionRecords'][number]
  changedDetail?: string
  preservedNodeIds?: readonly string[]
  affectedNodeIds?: readonly string[]
  reopenedNodeIds?: readonly string[]
}>

type DecisionMapReadMutationResult = DecisionMapReadResult | null

const readDecisionMapQuery = sourceQuery<{ threadId: string; ownerSessionId: string }, DecisionMapReadMutationResult>(
  'decisionMaps:getByThread',
)
const createDecisionMapMutation = sourceMutation<CreateMutationArgs, DecisionMapMutationResult>(
  'decisionMaps:create',
)
const recordChoiceMutation = sourceMutation<ChoiceMutationArgs, DecisionMapMutationResult>(
  'decisionMaps:recordChoice',
)
const recordConstraintChangeMutation = sourceMutation<ConstraintMutationArgs, DecisionMapMutationResult>(
  'decisionMaps:recordConstraintChange',
)

let testPort: DecisionMapStorePort | undefined

export function setDecisionMapStorePortForTests(port: DecisionMapStorePort | undefined): () => void {
  const previous = testPort
  testPort = port
  return () => {
    testPort = previous
  }
}

export async function readDecisionMapByThread(threadId: string, ownerSessionId: string): Promise<DecisionMapSnapshot | null> {
  if (testPort !== undefined) return testPort.readDecisionMapByThread(threadId, ownerSessionId)
  const result = await callPublicSourceQuery(readDecisionMapQuery, { threadId, ownerSessionId })
  return result?.snapshot ?? null
}

export async function persistDecisionMapDraft(
  input: PersistDecisionMapDraftInput,
  sourceWriteRequest?: Request,
): Promise<DecisionMapSnapshot> {
  if (testPort !== undefined) return testPort.persistDecisionMapDraft(input, sourceWriteRequest)
  const operationKey = input.operationKey
    ?? `decision_map:${input.threadId}:create:${input.generation ?? 0}:${input.revision ?? 1}`
  const args = {
    projectId: input.projectId,
    threadId: input.threadId,
    ownerSessionId: input.ownerSessionId,
    draftJson: JSON.stringify(input.draft),
    ...(input.generation === undefined ? {} : { generation: input.generation }),
    ...(input.revision === undefined ? {} : { revision: input.revision }),
    ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    ...(input.updatedAt === undefined ? {} : { updatedAt: input.updatedAt }),
    ...(input.now === undefined ? {} : { now: input.now }),
    operationKey,
  }
  const result = await callPublicSourceMutation(
    createDecisionMapMutation,
    sourceWriteRequest === undefined
      ? { ...args, correlationId: operationKey }
      : await withRequestSourceWrite(args, sourceWriteRequest),
  )
  return result.snapshot
}

export async function recordDecisionMapChoice(
  input: DecisionMapChoiceInput,
  contextOrRequest: unknown,
  ownerSessionId: string,
): Promise<DecisionMapMutationResult> {
  if (testPort !== undefined) {
    return toMutationResult(await testPort.recordDecisionMapChoice(input, contextOrRequest), input.operationKey)
  }
  return await callPublicSourceMutation(
    recordChoiceMutation,
    await withContextSourceWrite({ ...input, ownerSessionId }, contextOrRequest),
  )
}

export async function recordDecisionMapConstraintChange(
  input: DecisionMapConstraintChangeInput,
  contextOrRequest: unknown,
  ownerSessionId: string,
): Promise<DecisionMapMutationResult> {
  if (testPort !== undefined) {
    return toMutationResult(await testPort.recordDecisionMapConstraintChange(input, contextOrRequest), input.operationKey)
  }
  return await callPublicSourceMutation(
    recordConstraintChangeMutation,
    await withContextSourceWrite({ ...input, ownerSessionId }, contextOrRequest),
  )
}

function toMutationResult(
  value: DecisionMapSnapshot | DecisionMapMutationResult,
  operationKey: string,
): DecisionMapMutationResult {
  if (isMutationResult(value)) return value
  const decisionRecord = value.decisionRecords.at(-1)
  const report = value.lastChangeReport
  return {
    kind: 'applied',
    snapshot: value,
    replayed: false,
    operationKey,
    ...(decisionRecord === undefined ? {} : { decisionRecord }),
    ...(report === undefined ? {} : {
      changedDetail: report.changedDetail,
      preservedNodeIds: report.preservedNodeIds,
      affectedNodeIds: report.affectedNodeIds,
      reopenedNodeIds: report.reopenedNodeIds,
    }),
  }
}

function isMutationResult(value: DecisionMapSnapshot | DecisionMapMutationResult): value is DecisionMapMutationResult {
  return 'kind' in value && ('replayed' in value || 'operationKey' in value) && 'snapshot' in value
}

async function withRequestSourceWrite<T extends Record<string, unknown>>(
  args: T,
  request: Request,
): Promise<T & SourceWriteMutationArgs> {
  const operationKey = String(args.operationKey)
  return {
    ...args,
    operationKey,
    correlationId: operationKey,
    sourceWrite: await sourceWriteAdmissionFromRequest({
      request,
      scope: 'answer_thread',
      operationKey,
      correlationId: operationKey,
    }),
  }
}

async function withContextSourceWrite<T extends Record<string, unknown> & { operationKey: string }>(
  args: T,
  contextOrRequest: unknown,
): Promise<T & SourceWriteMutationArgs> {
  const operationKey = args.operationKey
  const base = {
    ...args,
    operationKey,
    correlationId: operationKey,
  }
  if (contextOrRequest === undefined) return base
  if (isRequest(contextOrRequest)) {
    return {
      ...base,
      sourceWrite: await sourceWriteAdmissionFromRequest({
        request: contextOrRequest,
        scope: 'answer_thread',
        operationKey,
        correlationId: operationKey,
      }),
    }
  }
  return {
    ...base,
    sourceWrite: await sourceWriteAdmissionFromContext({
      context: contextOrRequest,
      scope: 'answer_thread',
      operationKey,
      correlationId: operationKey,
    }),
  }
}

function isRequest(value: unknown): value is Request {
  return typeof Request !== 'undefined' && value instanceof Request
}
