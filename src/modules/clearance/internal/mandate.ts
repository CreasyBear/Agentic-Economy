import { z } from 'zod'

import { stableHash } from '@/modules/common/stable-hash'
import type { SourceHash } from '@/modules/common/ids'

import {
  ClearanceActionClassValues,
  clearanceActionClassSchema,
  type ClearanceActionClass,
} from './clearance-schema'

export const ClearanceMandateVersion = 'clearance-mandate:v1' as const

export const ClearanceMandateStatusValues = ['active', 'revoked', 'expired'] as const
export type ClearanceMandateStatus = (typeof ClearanceMandateStatusValues)[number]

export const ClearanceMandateRefusalReasonValues = [
  'clearance_mandate_required',
  'clearance_mandate_principal_mismatch',
  'clearance_mandate_action_class_mismatch',
  'clearance_mandate_action_ref_mismatch',
  'clearance_mandate_scope_not_allowed',
  'clearance_mandate_amount_cap_exceeded',
  'clearance_mandate_expired',
  'clearance_mandate_revoked',
  'clearance_mandate_not_active',
] as const
export type ClearanceMandateRefusalReason = (typeof ClearanceMandateRefusalReasonValues)[number]

export type ClearanceMandate = Readonly<{
  mandateId: string
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  allowedScopes: readonly string[]
  status: ClearanceMandateStatus
  createdAt: number
  expiresAt: number
  revokedAt?: number | undefined
  maxAmountCents?: number | undefined
  sourceVersion: typeof ClearanceMandateVersion
  sourceHash: SourceHash
}>

export type CreateClearanceMandateInput = Readonly<{
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  allowedScopes: readonly string[]
  mandateId?: string | undefined
  status?: ClearanceMandateStatus | undefined
  issuedAt?: number | undefined
  createdAt?: number | undefined
  expiresAt: number
  revokedAt?: number | undefined
  maxAmountCents?: number | undefined

}>
export type EvaluateClearanceMandateInput = Readonly<{
  mandate: ClearanceMandate | undefined
  principalId: string
  actionClass: ClearanceActionClass
  actionRef: string
  scope?: string | undefined
  amountCents?: number | undefined
  now: number
}>

export type ClearanceMandateEvaluation =
  | Readonly<{
      kind: 'accepted'
      mandate: ClearanceMandate
    }>
  | Readonly<{
      kind: 'rejected'
      reason: ClearanceMandateRefusalReason
      mandateId?: string | undefined
    }>

export const clearanceMandateSchema = z.strictObject({
    mandateId: z.string().min(1),
    principalId: z.string().min(1),
    actionClass: clearanceActionClassSchema,
    actionRef: z.string().min(1),
    allowedScopes: z.array(z.string().min(1)).min(1),
    status: z.enum(ClearanceMandateStatusValues),
    createdAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().nonnegative(),
    revokedAt: z.number().int().nonnegative().optional(),
    maxAmountCents: z.number().int().nonnegative().optional(),
    sourceVersion: z.literal(ClearanceMandateVersion),
    sourceHash: z.string().min(1),
  })

export function createClearanceMandate(input: CreateClearanceMandateInput): ClearanceMandate {
  const allowedScopes = Array.from(new Set(input.allowedScopes)).sort()
  const createdAt = input.createdAt ?? input.issuedAt ?? 0
  const status = input.status ?? 'active'
  const sourceHash = stableHash({
    version: ClearanceMandateVersion,
    principalId: input.principalId,
    actionClass: input.actionClass,
    actionRef: input.actionRef,
    allowedScopes,
    status,
    createdAt,
    expiresAt: input.expiresAt,
    revokedAt: input.revokedAt ?? null,
    maxAmountCents: input.maxAmountCents ?? null,
  })

  return {
    mandateId: input.mandateId ?? `clearanceMandate:${sourceHash}`,
    principalId: input.principalId,
    actionClass: input.actionClass,
    actionRef: input.actionRef,
    allowedScopes,
    status,
    createdAt,
    expiresAt: input.expiresAt,
    ...(input.revokedAt === undefined ? {} : { revokedAt: input.revokedAt }),
    ...(input.maxAmountCents === undefined ? {} : { maxAmountCents: input.maxAmountCents }),
    sourceVersion: ClearanceMandateVersion,
    sourceHash,
  }
}

export function evaluateClearanceMandate(input: EvaluateClearanceMandateInput): ClearanceMandateEvaluation {
  const mandate = input.mandate
  if (mandate === undefined) {
    return { kind: 'rejected', reason: 'clearance_mandate_required' }
  }

  if (mandate.principalId !== input.principalId) {
    return {
      kind: 'rejected',
      reason: 'clearance_mandate_principal_mismatch',
      mandateId: mandate.mandateId,
    }
  }

  if (!ClearanceActionClassValues.includes(input.actionClass) || mandate.actionClass !== input.actionClass) {
    return {
      kind: 'rejected',
      reason: 'clearance_mandate_action_class_mismatch',
      mandateId: mandate.mandateId,
    }
  }

  if (mandate.actionRef !== input.actionRef) {
    return {
      kind: 'rejected',
      reason: 'clearance_mandate_action_ref_mismatch',
      mandateId: mandate.mandateId,
    }
  }

  if (mandate.status === 'revoked') {
    return { kind: 'rejected', reason: 'clearance_mandate_revoked', mandateId: mandate.mandateId }
  }

  if (mandate.status === 'expired' || mandate.expiresAt <= input.now) {
    return { kind: 'rejected', reason: 'clearance_mandate_expired', mandateId: mandate.mandateId }
  }

  if (mandate.status !== 'active') {
    return { kind: 'rejected', reason: 'clearance_mandate_not_active', mandateId: mandate.mandateId }
  }

  if (input.scope !== undefined && !mandate.allowedScopes.includes(input.scope)) {
    return {
      kind: 'rejected',
      reason: 'clearance_mandate_scope_not_allowed',
      mandateId: mandate.mandateId,
    }
  }

  if (
    input.amountCents !== undefined &&
    mandate.maxAmountCents !== undefined &&
    input.amountCents > mandate.maxAmountCents
  ) {
    return {
      kind: 'rejected',
      reason: 'clearance_mandate_amount_cap_exceeded',
      mandateId: mandate.mandateId,
    }
  }

  return { kind: 'accepted', mandate }
}
