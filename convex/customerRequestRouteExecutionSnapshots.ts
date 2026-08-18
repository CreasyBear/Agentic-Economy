import type {
  AttemptRecordSnapshot,
  DispatchRecordSnapshot,
  RunRecordSnapshot,
} from '@/modules/customer-request/route-execution/machines'
import type { RouteStepGrant } from '@/modules/customer-request/route-mandate-admission'

import type { MutationCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

export type RouteStepGrantSnapshot = (value: unknown) => RouteStepGrant

export function toRunRecord(_run: never): RunRecordSnapshot {
  return unlistedCustomerRequestTables()
}

export function toAttemptRecord(
  _attempt: never,
  _toGrant?: RouteStepGrantSnapshot,
): AttemptRecordSnapshot {
  return unlistedCustomerRequestTables()
}

export function toDispatchRecord(_dispatch: never): DispatchRecordSnapshot {
  return unlistedCustomerRequestTables()
}

export async function requireRun(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<never> {
  return unlistedCustomerRequestTables()
}

export async function requireAttempt(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<never> {
  return unlistedCustomerRequestTables()
}

export async function requireDispatch(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<never> {
  return unlistedCustomerRequestTables()
}

export async function requireDispatchByAttempt(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<never> {
  return unlistedCustomerRequestTables()
}
