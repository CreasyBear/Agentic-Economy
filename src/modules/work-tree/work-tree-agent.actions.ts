import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  applyWorkTreeThroughSource,
  decideWorkTreeThroughSource,
  workTreeApplyInputSchema,
  workTreeApplyResultSchema,
  workTreeDecisionInputSchema,
  workTreeDecisionResultSchema,
  type WorkTreeApplyInput,
  type WorkTreeApplyResult,
  type WorkTreeDecisionInput,
  type WorkTreeDecisionResult,
} from './work-tree.functions'

const workTreeApplyParameters: readonly ActionParameter[] = [
  {
    name: 'projectId',
    type: 'string',
    description: 'The durable opaque WorkTree project reference returned by workTree.create.',
    required: true,
  },
  {
    name: 'operationKey',
    type: 'string',
    description: 'A stable retry key for this exact gardener operation.',
    required: true,
  },
  {
    name: 'correlationId',
    type: 'string',
    description: 'correlationId is trace metadata only; it does not participate in the replay digest.',
    required: true,
  },
  {
    name: 'verb',
    type: 'object',
    description: 'Exactly one elaborate, study, or propose_decision gardener verb with its current fences.',
    required: true,
  },
]

const workTreeDecisionParameters: readonly ActionParameter[] = [
  {
    name: 'projectId',
    type: 'string',
    description: 'The durable opaque WorkTree project reference returned by workTree.create.',
    required: true,
  },
  {
    name: 'nodeId',
    type: 'string',
    description: 'The exact WorkTree node receiving the person decision.',
    required: true,
  },
  {
    name: 'kind',
    type: 'enum',
    description: 'Lock, adjust, or park the exact current decision item.',
    required: true,
    enum: ['lock', 'adjust', 'park'],
  },
  {
    name: 'expectedGeneration',
    type: 'number',
    description: 'The WorkTree generation read with the decision item.',
    required: true,
  },
  {
    name: 'expectedRevision',
    type: 'number',
    description: 'The WorkTree revision read with the decision item.',
    required: true,
  },
  {
    name: 'proposalDigest',
    type: 'string',
    description: 'The exact proposal digest read with the decision item.',
    required: true,
  },
  {
    name: 'idempotencyKey',
    type: 'string',
    description: 'A stable retry key for this exact decision payload; reuse it only for an exact retry, never a different decision.',
    required: true,
  },
  {
    name: 'stepUp',
    type: 'object',
    description: 'Explicit per-item acknowledgement for a protected Lock. An agent must include the opaque approvalRef issued by the human owner; the source rejects missing, expired, mismatched, or already-consumed artifacts.',
    required: false,
  },
  {
    name: 'repeatGrant',
    type: 'object',
    description: 'Optional human-issued repeat-use limits for an eligible low-risk Lock; agents cannot self-grant and the source binds the grant to the exact decision.',
    required: false,
  },
  {
    name: 'guestAssertion',
    type: 'string',
    description: 'Opaque server-minted browser guest assertion; never a caller-chosen principal.',
    required: false,
  },
]

export const workTreeApplyAction = defineAction<WorkTreeApplyInput, WorkTreeApplyResult>({
  id: 'workTree.apply',
  name: 'Apply a WorkTree gardener step',
  summary: 'Apply one bounded elaboration, study start, or decision proposal to the current WorkTree.',
  boundaries: [
    'Accepts only elaborate, study, or propose_decision; no arbitrary tree patch is accepted.',
    'The source rechecks the current generation, revision, proposal digest, graph limits, and node status.',
    'Does not contact a provider, claim BAS fulfilment, charge money, or treat a transcript as authority.',
    'A durable receipt is returned; an unknown result must be reconciled from current WorkTree readback before retrying.',
  ],
  schema: workTreeApplyInputSchema,
  outputSchema: workTreeApplyResultSchema,
  parameters: workTreeApplyParameters,
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['development_work_tree'],
    spendExposure: 'none',
    approval: 'approve_each',
  },
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'workTree.apply:v1',
    consequenceClass: 'external_effect',
    materialInputPaths: ['projectId', 'operationKey', 'verb'],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['durable WorkTree apply receipt', 'current WorkTree readback link'],
    safeContinuations: ['inspect the returned WorkTree readback', 'reconcile an unknown result before retrying'],
    invalidationConditions: [
      'WorkTree generation or revision changes',
      'proposal digest or target node changes',
      'principal, authority scope, or action version changes',
      'operation key is reused with a different verb',
    ],
  },
  run: async ({ data }): Promise<WorkTreeApplyResult> => await applyWorkTreeThroughSource(data),
})

export const workTreeDecideAction = defineAction<WorkTreeDecisionInput, WorkTreeDecisionResult>({
  id: 'workTree.decide',
  name: 'Decide a WorkTree item',
  summary: 'Lock, adjust, or park one exact current WorkTree decision item and receive a durable receipt or reconcile-before-retry result.',
  boundaries: [
    'Accepts only lock, adjust, or park for the exact node and proposal digest supplied by the current readback.',
    'The source binds the decision to the authenticated principal and rechecks generation, revision, and proposal digest.',
    'An optional repeatGrant is accepted only from an authenticated human for an eligible low-risk Lock; agents, protected decisions, and non-Lock decisions cannot issue repeat permission.',
    'A refused decision makes no WorkTree or receipt state change; an unknown result must be reconciled from current WorkTree readback before retrying.',
    'This development fixture does not book, pay, dispatch, contact a provider, or claim customer or BAS fulfilment.',
  ],
  schema: workTreeDecisionInputSchema,
  outputSchema: workTreeDecisionResultSchema,
  parameters: workTreeDecisionParameters,
  readOnly: false,
  effect: {
    class: 'external_state_change',
    reversible: false,
    recipientKind: 'none',
    dataClasses: ['development_work_tree'],
    spendExposure: 'none',
    approval: 'approve_each',
  },
  surfaces: ['http', 'agentJson'],
  invocationContract: {
    version: 'workTree.decide:v1',
    consequenceClass: 'external_effect',
    materialInputPaths: [
      'projectId', 'nodeId', 'kind', 'expectedGeneration', 'expectedRevision', 'proposalDigest', 'idempotencyKey', 'stepUp', 'repeatGrant', 'guestAssertion',
    ],
    authorityRequirement: 'principal',
    retryClass: 'reconcile_before_retry',
    expectedEvidence: ['durable WorkTree decision receipt', 'current WorkTree readback link'],
    safeContinuations: ['inspect the returned decision receipt and current WorkTree readback', 'reconcile an unknown result before retrying'],
    invalidationConditions: [
      'WorkTree generation or revision changes',
      'proposal digest or target node changes',
      'principal, authority scope, or action version changes',
      'idempotency key is reused with a different decision payload',
    ],
  },
  run: async ({ data }): Promise<WorkTreeDecisionResult> => await decideWorkTreeThroughSource(data),
})
