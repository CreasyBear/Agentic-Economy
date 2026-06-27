import { z } from 'zod'

import {
  ActivationStageValues,
  ActorKindValues,
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
  OperationKeyStatusValues,
  OperatorControlKeyValues,
} from '@/modules/observability/public'

export const OperationKeyStatusSchema = z.enum(OperationKeyStatusValues)
export const ActorKindSchema = z.enum(ActorKindValues)
export const AuditTargetTypeSchema = z.enum(AuditTargetTypeValues)
export const AuditEventTypeSchema = z.enum(AuditEventTypeValues)
export const OperatorControlKeySchema = z.enum(OperatorControlKeyValues)
export const FunnelEventTypeSchema = z.enum(FunnelEventTypeValues)
export const ActivationStageSchema = z.enum(ActivationStageValues)
