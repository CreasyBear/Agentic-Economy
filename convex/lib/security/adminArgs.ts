import { v } from 'convex/values'

import { literalUnion } from '../../../src/modules/common/convex-literals'
import { RemovalDisputeReasonCodeValues } from '../../../src/modules/security/public'
import { sourceWriteArgs } from '../../sourceWriteAdmission'

export const visibilityTargetType = v.union(v.literal('business'), v.literal('service'), v.literal('capability'))
export const removalReason = literalUnion(RemovalDisputeReasonCodeValues)

export const openRemovalDisputeArgsValue = v.object({
  businessId: v.string(),
  targetType: visibilityTargetType,
  targetRef: v.string(),
  reasonCode: removalReason,
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  contactName: v.optional(v.string()),
  evidence: v.array(
    v.object({
      label: v.string(),
      mediaType: v.union(
        v.literal('text/plain'),
        v.literal('image/jpeg'),
        v.literal('image/png'),
        v.literal('application/pdf'),
      ),
      byteLength: v.number(),
      privateRef: v.string(),
    }),
  ),
  publicMessage: v.optional(v.string()),
  csrfToken: v.optional(v.string()),
  csrfCookie: v.optional(v.string()),
  origin: v.optional(v.string()),
  ...sourceWriteArgs,
  operationKey: v.string(),
  correlationId: v.string(),
})
