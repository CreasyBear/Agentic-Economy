import { z } from 'zod'

import {
  AbuseBucketStateValues,
  AdminActionValues,
  AdminMembershipAuditEventTypeValues,
  AdminMembershipStateValues,
  AdminRoleValues,
  ClaimFingerprintStatusValues,
  DisputeStatusValues,
  SuppressionRuleStatusValues,
} from '@/modules/security/public'

export const AdminRoleSchema = z.enum(AdminRoleValues)
export const AdminMembershipStateSchema = z.enum(AdminMembershipStateValues)
export const AdminActionSchema = z.enum(AdminActionValues)
export const AdminMembershipAuditEventTypeSchema = z.enum(AdminMembershipAuditEventTypeValues)
export const SuppressionRuleStatusSchema = z.enum(SuppressionRuleStatusValues)
export const DisputeStatusSchema = z.enum(DisputeStatusValues)
export const AbuseBucketStateSchema = z.enum(AbuseBucketStateValues)
export const ClaimFingerprintStatusSchema = z.enum(ClaimFingerprintStatusValues)
