import { brandNonEmpty } from '@/modules/common/ids'
import type { CorrelationId, OperationKey, SourceHash } from '@/modules/common/ids'
import { error, ok } from '@/modules/common/result'
import type { ModuleResult } from '@/modules/common/result'
import { stableHash } from '@/modules/common/stable-hash'
import type { AuditEventContract, RedactedPayload } from '@/modules/observability/public'
import { validateAuditEvent } from '@/modules/observability/public'

import {
  ContactFollowUpActionSlug,
  createContactFollowUpGatewayAdmission,
  type ContactFollowUpGatewayAdmission,
  type ContactFollowUpGatewayAdmissionId,
  type ContactFollowUpOperatorControls,
  type ContactFollowUpProposalId,
  type ContactFollowUpSourceState,
  type CreateContactFollowUpGatewayAdmissionCommand,
  type CreateContactFollowUpGatewayAdmissionResult,
} from './contact-follow-up'

export {
  createContactFollowUpGatewayAdmission,
  type ContactFollowUpGatewayAdmission,
  type ContactFollowUpGatewayAdmissionId,
  type CreateContactFollowUpGatewayAdmissionCommand,
  type CreateContactFollowUpGatewayAdmissionResult,
}

export type ConsumeContactFollowUpGatewayAdmissionCommand = {
  gatewayAdmissionId: ContactFollowUpGatewayAdmissionId
  proposalId: ContactFollowUpProposalId
  idempotencyKey: OperationKey
  correlationId: CorrelationId
  now: number
}

export type ConsumeContactFollowUpGatewayAdmissionResult = ModuleResult<
  'contact_follow_up_gateway_consumed',
  'contact_follow_up_gateway_required' | 'contact_follow_up_gateway_expired' | 'contact_follow_up_gateway_replay_rejected',
  {
    state: ContactFollowUpSourceState
    gatewayAdmission: ContactFollowUpGatewayAdmission
    auditEvent: AuditEventContract
  },
  { reason: string; proposalId?: ContactFollowUpProposalId }
>

export function consumeContactFollowUpGatewayAdmission(
  state: ContactFollowUpSourceState,
  command: ConsumeContactFollowUpGatewayAdmissionCommand,
  controls: Pick<ContactFollowUpOperatorControls, 'protectedActionAttemptsEnabled'> = { protectedActionAttemptsEnabled: true }
): ConsumeContactFollowUpGatewayAdmissionResult {
  if (!controls.protectedActionAttemptsEnabled) {
    return error('contact_follow_up_gateway_replay_rejected', false, {
      reason: 'attempts_disabled',
      proposalId: command.proposalId,
    })
  }

  const gatewayAdmission = state.gatewayAdmissions.find((admission) => admission.id === command.gatewayAdmissionId)
  if (gatewayAdmission === undefined || gatewayAdmission.proposalId !== command.proposalId) {
    return error('contact_follow_up_gateway_required', false, {
      reason: 'gateway_admission_required',
      proposalId: command.proposalId,
    })
  }

  if (gatewayAdmission.expiresAt <= command.now) {
    return error('contact_follow_up_gateway_expired', false, {
      reason: 'gateway_expired',
      proposalId: command.proposalId,
    })
  }

  if (gatewayAdmission.status !== 'admitted') {
    return error('contact_follow_up_gateway_replay_rejected', false, {
      reason: gatewayAdmission.status,
      proposalId: command.proposalId,
    })
  }

  const consumed: ContactFollowUpGatewayAdmission = {
    ...gatewayAdmission,
    status: 'consumed',
    consumedAt: command.now,
  }
  const auditEvent = gatewayAuditEvent(consumed, command)

  return ok('contact_follow_up_gateway_consumed', {
    state: {
      ...state,
      gatewayAdmissions: state.gatewayAdmissions.map((admission) =>
        admission.id === consumed.id ? consumed : admission
      ),
      auditEvents: [...state.auditEvents, auditEvent],
    },
    gatewayAdmission: consumed,
    auditEvent,
  })
}

function gatewayAuditEvent(
  admission: ContactFollowUpGatewayAdmission,
  command: ConsumeContactFollowUpGatewayAdmissionCommand
): AuditEventContract {
  const redactedPayload: RedactedPayload = {
    selectedActionSlug: ContactFollowUpActionSlug,
    admissionHash: admission.admissionHash,
    proposalHash: admission.proposalHash,
  }
  const payloadHash = stableHash(redactedPayload)
  const validation = validateAuditEvent({
    eventId: brandNonEmpty(`audit:gateway-consumed:${admission.id}:${command.idempotencyKey}`, 'AuditEventId'),
    eventType: 'protected_action.gateway_consumed',
    actorKind: 'system',
    actorRef: 'contact_follow_up_gateway',
    targetType: 'protected_action',
    targetRef: admission.proposalId,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
    beforeState: 'admitted',
    afterState: 'consumed',
    evidenceRefs: [admission.id],
    redactedPayload,
    payloadHash: payloadHash as SourceHash,
    createdAt: command.now,
  })
  if (!validation.valid) {
    throw new Error(`Invalid contact follow-up gateway audit event: ${validation.reason}`)
  }

  return validation.event
}
