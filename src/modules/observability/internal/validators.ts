import { z } from 'zod'

import { brandNonEmpty } from '@/modules/common/ids'
import type { OwnerActivationState } from '@/modules/observability/public'
import {
  ActivationStageValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  OperatorControlKeyValues,
} from './literals'

export const AuditTargetTypeSchema = z.enum(AuditTargetTypeValues)
export const AuditEventTypeSchema = z.enum(AuditEventTypeValues)
export const OperatorControlKeySchema = z.enum(OperatorControlKeyValues)
export const FunnelEventTypeSchema = z.enum(FunnelEventTypeValues)
const ActivationStageSchema = z.enum(ActivationStageValues)

const OwnerActivationStateSchema = z.object({
  businessId: z.string().min(1),
  stage: ActivationStageSchema,
  publishSeen: z.boolean(),
  statusSeen: z.boolean(),
  capabilityHealthSeen: z.boolean(),
  sharedOrInterestSubmitted: z.boolean(),
  attributionRecorded: z.boolean(),
  frictionCode: z.string().optional(),
  failureCode: z.string().optional(),
  lastEventAt: z.number(),
})

export function parseOwnerActivationStateRow(row: Record<string, unknown>): OwnerActivationState {
  const parsed = OwnerActivationStateSchema.parse(row)
  return {
    businessId: brandNonEmpty(parsed.businessId, 'BusinessId'),
    stage: parsed.stage,
    publishSeen: parsed.publishSeen,
    statusSeen: parsed.statusSeen,
    capabilityHealthSeen: parsed.capabilityHealthSeen,
    sharedOrInterestSubmitted: parsed.sharedOrInterestSubmitted,
    attributionRecorded: parsed.attributionRecorded,
    lastEventAt: parsed.lastEventAt,
    ...(parsed.frictionCode === undefined ? {} : { frictionCode: parsed.frictionCode }),
    ...(parsed.failureCode === undefined ? {} : { failureCode: parsed.failureCode }),
  }
}
