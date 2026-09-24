import { v, type Infer } from 'convex/values'
import type { MutationCtx } from '../../../_generated/server'
import {
  requireSourceWrite,
  sourceWriteAdmissionArg,
  sourceWriteRequestArg,
} from '../../../sourceWriteAdmission'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import { principalAndSourceArgs } from './contracts'

export type CallPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: string[]
  authorityMode: 'read_only' | 'approval_required' | 'spending_policy' | 'unrestricted_test_only'
}>

export type AdmitArgs = {
  operationKey: string
  correlationId: string
  sourceWrite?: Infer<typeof sourceWriteAdmissionArg>
  sourceWriteRequest?: Infer<typeof sourceWriteRequestArg>
  principal: CallPrincipal
  toolRef: string
  input: Record<string, JsonValue>
  idempotencyKey: string
}

export const callArgs = {
  ...principalAndSourceArgs,
  quoteRef: v.string(),
  idempotencyKey: v.string(),
} as const

export function assertJsonObject(value: unknown): asserts value is Record<string, JsonValue> {
  if (!isRecord(value) || !isBoundedJsonValue(value)) throw new Error('operation_invocation_json_invalid')
}

export async function admitHandler(
  ctx: MutationCtx,
  args: AdmitArgs,
): Promise<{ kind: 'accepted' }> {
  assertJsonObject(args.input)
  const admission = await requireSourceWrite(ctx, args, 'protected_action')
  if (admission.kind === 'rejected') throw new Error(`operation_invoke_source_write_rejected:${admission.reason}`)
  return { kind: 'accepted' as const }
}
