import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'

import type { PlanEnvelope, PlanStatus, PlanStepStatus } from './plan-contract'
import type { PlanEvent, PlanEventKind } from './metrics'

export type StoredEnginePlan = Readonly<{
  planId: string
  threadId: string
  revision: number
  revisionOf?: number
  contractJson: string
  planDigest: string
  status: PlanStatus
  stepStatusesJson: string
  outcomeJson?: string
  createdAt: number
  expiresAt: number
  operationKey?: string
  payloadDigest?: string
}>

export type StoredEnginePlanWithEvents = Readonly<{
  plan: StoredEnginePlan
  events: readonly PlanEvent[]
}>

export type RecordEnginePlanEventInput = Readonly<{
  planId: string
  expectedRevision?: number
  expectedPlanDigest?: string
  kind: Exclude<PlanEventKind, 'plan_authored' | 'plan_revised'>
  stepId?: string
  toolCallId?: string
  payloadJson: string
  costUsd?: number
  at: number
  outcomeJson?: string
  operationKey?: string
  sourceWriteRequest?: Request
}>
type SourceWriteMutationArgs = Readonly<{
  operationKey: string
  correlationId?: string
  sourceWrite?: SourceWriteAdmission
}>

type RecordRevisionMutationArgs = Readonly<{
  planId: string
  threadId: string
  revision: number
  revisionOf?: number
  contractJson: string
  planDigest: string
  createdAt: number
  expiresAt: number
  costUsd?: number
  payloadDigest?: string
}> & SourceWriteMutationArgs

type RecordEventMutationArgs = Omit<RecordEnginePlanEventInput, 'sourceWriteRequest' | 'operationKey'> & Readonly<{
  operationKey: string
  expectedRevision?: number
  expectedPlanDigest?: string
}> & SourceWriteMutationArgs


const recordRevisionMutation = sourceMutation<
  RecordRevisionMutationArgs,
  { planId: string; revision: number; seq: number }
>('enginePlans:recordPlanRevision')
const recordEventMutation = sourceMutation<
  RecordEventMutationArgs,
  { planId: string; seq: number; status?: 'expired' }
>('enginePlans:recordPlanEvent')
const readPlanQuery = sourceQuery<{ threadId: string; pseudonymousSessionId?: string }, StoredEnginePlanWithEvents | null>(
  'enginePlans:readPlanWithEvents',
)

type EnginePlanStorePort = Readonly<{
  read(threadId: string, pseudonymousSessionId?: string): Promise<StoredEnginePlanWithEvents | null>
  recordRevision(
    envelope: PlanEnvelope,
    options: Readonly<{ authoredAt: number; costUsd?: number; sourceWriteRequest?: Request }>,
  ): Promise<{ planId: string; revision: number; seq: number }>
  recordEvent(input: RecordEnginePlanEventInput): Promise<{ planId: string; seq: number; status?: 'expired' }>
}>

let testPort: EnginePlanStorePort | undefined

export function setEnginePlanStorePortForTests(port: EnginePlanStorePort | undefined): () => void {
  const previous = testPort
  testPort = port
  return () => {
    testPort = previous
  }
}

export async function readStoredEnginePlan(
  threadId: string,
  pseudonymousSessionId?: string,
): Promise<StoredEnginePlanWithEvents | null> {
  return testPort === undefined
    ? await callPublicSourceQuery(readPlanQuery, {
        threadId,
        ...(pseudonymousSessionId === undefined ? {} : { pseudonymousSessionId }),
      })
    : await testPort.read(threadId, pseudonymousSessionId)
}

export async function persistEnginePlanRevision(
  envelope: PlanEnvelope,
  options: Readonly<{ authoredAt: number; costUsd?: number; sourceWriteRequest?: Request }>,
): Promise<{ planId: string; revision: number; seq: number }> {
  if (testPort !== undefined) return await testPort.recordRevision(envelope, options)
  const operationKey = `engine_plan:${envelope.planId}:revision:${envelope.revision}`
  const args = {
    planId: envelope.planId,
    threadId: envelope.threadId,
    revision: envelope.revision,
    ...(envelope.revisionOf === undefined ? {} : { revisionOf: envelope.revisionOf }),
    contractJson: JSON.stringify(envelope.contract),
    planDigest: envelope.planDigest,
    createdAt: options.authoredAt,
    expiresAt: envelope.bounds.expiresAt,
    operationKey,
    ...(options.costUsd === undefined ? {} : { costUsd: options.costUsd }),
  }
  return await callPublicSourceMutation(
    recordRevisionMutation,
    options.sourceWriteRequest === undefined
      ? args
      : await withPlanSourceWrite(args, options.sourceWriteRequest),
  )
}

export async function persistEnginePlanEvent(
  input: RecordEnginePlanEventInput,
): Promise<{ planId: string; seq: number; status?: 'expired' }> {
  if (testPort !== undefined) return await testPort.recordEvent(input)
  const operationKey = input.operationKey
    ?? `engine_plan:${input.planId}:${input.kind}:${input.stepId ?? 'plan'}:${input.at}`
  const { sourceWriteRequest, operationKey: _ignored, ...args } = input
  const mutationArgs = {
    ...args,
    operationKey,
  }
  return await callPublicSourceMutation(
    recordEventMutation,
    sourceWriteRequest === undefined
      ? mutationArgs
      : await withPlanSourceWrite(mutationArgs, sourceWriteRequest),
  )
}

export function activePlanFromStored(stored: StoredEnginePlanWithEvents): Readonly<{
  contract: PlanEnvelope['contract']
  stepStatuses: Record<string, PlanStepStatus>
}> {
  return {
    contract: JSON.parse(stored.plan.contractJson) as PlanEnvelope['contract'],
    stepStatuses: JSON.parse(stored.plan.stepStatusesJson) as Record<string, PlanStepStatus>,
  }
}

async function withPlanSourceWrite<T extends Record<string, unknown>>(
  args: T,
  request: Request,
): Promise<T & Required<SourceWriteMutationArgs>> {
  const operationKey = typeof args.operationKey === 'string'
    ? args.operationKey
    : `engine_plan:${String(args.planId)}:${String(args.kind ?? args.revision ?? 'unknown')}:${String(args.stepId ?? args.at ?? args.createdAt)}`
  const correlationId = operationKey
  return {
    ...args,
    operationKey,
    correlationId,
    sourceWrite: await sourceWriteAdmissionFromRequest({
      request,
      scope: 'answer_thread',
      operationKey,
      correlationId,
    }),
  }
}
