import type { CustomerRequestActionResult } from '../action-result'
import type { StoredAggregateResult } from '../compare-resume/types'
import type {
  PreparationEgressPorts,
  PreparationMutationResult,
} from '../preparation-egress/types'

export type AuthorizePreparationApprovalActor = Readonly<{
  kind: 'clerk_owner'
  requestPrincipalId: string
  ownerId: string
  credentialId: string
  authenticationEvidenceRef: string
  approvedAt: number
}>

export type AuthorizePreparationPorts = Pick<
  PreparationEgressPorts,
  'runEgress' | 'preparationMaterialDigest' | 'preparePreparedAction'
> & Readonly<{
  loadCurrent: (requestId: string) => Promise<StoredAggregateResult>
  getAgentPrincipal: (principalId: string) => Promise<Readonly<{
    ownerId: string
  }> | null>
  prepare: (input: Readonly<{
    commandKey: string
    commandDigest: string
    principalId: string
    requestId: string
    expectedRevision: number
    actionId: string
    preparationRef: string
    approvalActor: AuthorizePreparationApprovalActor
    now: number
  }>) => Promise<PreparationMutationResult>
}>

export type AuthorizePreparationInput = Readonly<{
  requestRef: string
  revision: number
  preparationRef: string
  idempotencyKey: string
  commandDigest: string
  commandKey: (principalId: string) => string
  egressCommandKey: (principalId: string) => string
  tokenIdentifier: string
  ownerId: string
  credentialId: string
  authenticationEvidenceRef: string
  now: number
}>

export type AuthorizePreparationResult = CustomerRequestActionResult
