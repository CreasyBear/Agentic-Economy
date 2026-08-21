import { z } from 'zod'

import {
  AuditEventTypeValues,
  AuditTargetTypeValues,
  FunnelEventTypeValues,
} from './literals'

export const AuditTargetTypeSchema = z.enum(AuditTargetTypeValues)
export const AuditEventTypeSchema = z.enum(AuditEventTypeValues)
export const FunnelEventTypeSchema = z.enum(FunnelEventTypeValues)
