import { v, type ObjectType, type Validator } from 'convex/values'

import type {
  AdminCommandAction,
  AdminCommandArgs,
} from '@/lib/operator/admin-console/contracts'
import { clerkConsequenceProofValue } from '../authority/consequence/proof'
import { sourceWriteArgs } from '../security/sourceWrite/contracts'
export const ADMIN_OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u

export const adminRefusalValue = v.object({
  kind: v.literal('refused'),
  code: v.string(),
})

export const approvalIntentValue = v.union(
  v.object({ kind: v.literal('execute') }),
  v.object({ kind: v.literal('propose') }),
  v.object({ kind: v.literal('approve'), proposalRef: v.string() }),
)

// Exact source-write fields spread by convex/businesses.ts at its public mutation boundary.
type SourceWriteWireArgs = ObjectType<typeof sourceWriteArgs>

export function adminCommandArgsValue<
  Action extends string,
  Input,
  ReasonCode extends string,
>(
  action: Validator<Action, 'required', string>,
  input: Validator<Input, 'required', string>,
  reasonCode: Validator<ReasonCode, 'required', string>,
) {
  return v.object({
    ...sourceWriteArgs,
    operationKey: v.string(),
    correlationId: v.string(),
    action,
    input,
    reasonCode,
    evidenceRefs: v.array(v.string()),
    expectedStateDigest: v.optional(v.string()),
    approval: approvalIntentValue,
    proof: v.optional(clerkConsequenceProofValue),
  })
}

export function adminCommandReceiptValue<
  Action extends string,
  SuccessCode extends string,
  RefusalCode extends string,
>(
  action: Validator<Action, 'required', string>,
  successCodes: Validator<SuccessCode, 'required', string>,
  refusalCodes: Validator<RefusalCode, 'required', string>,
) {
  return v.union(
    v.object({
      kind: v.literal('completed'),
      action,
      code: successCodes,
      effectRefs: v.array(v.string()),
      auditEventRef: v.string(),
      correlationId: v.string(),
    }),
    v.object({
      kind: v.literal('proposed'),
      action,
      proposalRef: v.string(),
      expiresAt: v.number(),
      correlationId: v.string(),
    }),
    v.object({
      kind: v.literal('refused'),
      action,
      code: refusalCodes,
      correlationId: v.string(),
    }),
  )
}

export type AdminCommandWireArgs<A extends AdminCommandAction> =
  AdminCommandArgs<A> & SourceWriteWireArgs

type WireShapeAssignable = AdminCommandWireArgs<AdminCommandAction> extends
  AdminCommandArgs<AdminCommandAction> & ObjectType<typeof sourceWriteArgs>
  ? true
  : never
const wireShapeAssignable: WireShapeAssignable = true
void wireShapeAssignable
