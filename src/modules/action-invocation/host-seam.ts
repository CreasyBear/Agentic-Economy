import type { StableHashValue } from '@/modules/common/stable-hash'

import type {
  ActionInvocationOrigin,
  ActionInvocationView,
  InvocationActor,
  InvocationDecision,
} from './contracts'
import type {
  DynamicPublishedAdapterSnapshot,
} from './dynamic-published-adapter'
import type { DynamicPublishedInvocationResult } from './dynamic-published-contract'
import type { ReconciliationEvidence } from './reconciliation-evidence'

export type ActionInvocationHostSeam = Readonly<{
  prepare(input: Readonly<{
    origin: ActionInvocationOrigin
    actor: InvocationActor
    value: StableHashValue
    freshnessMs: number
  }>): ActionInvocationView<DynamicPublishedInvocationResult>
  decide(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    accept: boolean
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  acquire(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    authorityRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    leaseOwner: string
    leaseMs: number
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  executeAcquired(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    leaseOwner: string
    effectGeneration: number
  }>): Promise<InvocationDecision<DynamicPublishedInvocationResult>>
  reconcile(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    attemptRef: string
    actor: InvocationActor
    origin: ActionInvocationOrigin
    evidence: ReconciliationEvidence
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  cancel(input: Readonly<{
    invocationRef: string
    expectedInvocationVersion: number
    actor: InvocationActor
    origin: ActionInvocationOrigin
  }>): InvocationDecision<DynamicPublishedInvocationResult>
  inspect(invocationRef: string): ActionInvocationView<DynamicPublishedInvocationResult> | undefined
  exportSnapshot(): DynamicPublishedAdapterSnapshot
}>
