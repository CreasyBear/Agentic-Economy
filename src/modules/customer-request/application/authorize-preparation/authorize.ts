import { canonicalDigest } from '@/modules/common/canonical-digest'
import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'

import {
  preparationResultView,
  runPreparationEgress,
} from '../preparation-egress'
import type {
  AuthorizePreparationInput,
  AuthorizePreparationPorts,
  AuthorizePreparationResult,
} from './types'

export async function authorizePreparation(
  input: AuthorizePreparationInput,
  ports: AuthorizePreparationPorts,
): Promise<AuthorizePreparationResult> {
  const current = await ports.loadCurrent(input.requestRef)
  if (current.kind === 'needs_attention') return projectNeedsAttention({
    requestRef: input.requestRef, revision: 0,
    summary: 'This earlier request used a retired contract format. Start a new request to continue.',
  })
  if (current.kind !== 'current') return { kind: 'refused', reason: 'request_not_found' }
  const requestPrincipalId = current.aggregate.snapshot.principalId
  const ownsDirectRequest = requestPrincipalId === input.tokenIdentifier
  const agentPrincipal = ownsDirectRequest
    ? null
    : await ports.getAgentPrincipal(requestPrincipalId)
  if (!ownsDirectRequest && agentPrincipal?.ownerId !== input.ownerId) {
    return { kind: 'refused', reason: 'request_not_found' }
  }
  if (current.aggregate.snapshot.revision !== input.revision) return {
    kind: 'conflict', requestRef: input.requestRef, reason: 'revision_changed',
  }
  if (current.aggregate.plan.actions.length !== 1 || current.aggregate.plan.actions[0] === undefined) {
    return projectNeedsAttention({
      requestRef: input.requestRef, revision: input.revision,
      summary: 'This request needs an action choice before AE can prepare it.',
    })
  }
  const result = await ports.prepare({
    commandKey: input.commandKey(requestPrincipalId),
    commandDigest: input.commandDigest,
    principalId: requestPrincipalId,
    requestId: input.requestRef,
    expectedRevision: input.revision,
    actionId: current.aggregate.plan.actions[0].actionId,
    preparationRef: input.preparationRef,
    approvalActor: {
      kind: 'clerk_owner',
      requestPrincipalId,
      ownerId: input.ownerId,
      credentialId: input.credentialId,
      authenticationEvidenceRef: input.authenticationEvidenceRef,
      approvedAt: input.now,
    },
    now: input.now,
  })
  if ((result.kind === 'stored' || result.kind === 'replayed') && result.preparation.kind === 'ready_for_routing') {
    return await runPreparationEgress(
      current.aggregate,
      result.preparation,
      {
        principalId: requestPrincipalId,
        commandKey: input.egressCommandKey(requestPrincipalId),
        commandDigest: canonicalDigest({
          requestRef: input.requestRef,
          revision: input.revision,
          preparationRef: result.preparation.preparationRef,
          idempotencyKey: input.idempotencyKey,
        }),
      },
      ports,
    )
  }
  return preparationResultView(current.aggregate, result, input.requestRef, input.revision)
}
