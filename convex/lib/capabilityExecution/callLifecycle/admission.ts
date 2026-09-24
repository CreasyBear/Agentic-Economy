import type { MutationCtx } from '../../../_generated/server'
import {
  requireSourceWrite,
} from '../../../sourceWriteAdmission'
import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'
import { isRecord } from '@/modules/common/is-record'
import type { AdmitArgs } from './admissionTypes'

export type {
  CallPrincipal,
  AdmitArgs,
  ReserveArgs,
  ReserveResult,
  AbandonArgs,
  AbandonResult,
  PendingApprovalView,
  ApprovalDecisionResult,
} from './admissionTypes'

export {
  reserveHandler,
  abandonHandler,
} from './admissionReserve'

export {
  listPendingCallApprovalsHandler,
  decideCallApprovalHandler,
} from './admissionApprovals'

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
