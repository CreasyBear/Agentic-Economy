import type {
  Account,
  AccountOwnership,
  AccountRef,
  Membership,
} from '../account/public'
import type { Principal, PrincipalRef } from '../principal/public'

const PRINCIPAL_REF_PATTERN = /^prn_[0-9a-f]{32}$/u
const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const ATTRIBUTION_MAX_LENGTH = 500

export const WORKLOAD_KINDS = ['job', 'cron', 'callback', 'reconciliation'] as const
export type WorkloadKind = typeof WORKLOAD_KINDS[number]

export type WorkloadContext = Readonly<{
  workloadKind: WorkloadKind
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  correlationRef: string
  idempotencyRef: string
  purpose: string
  source: string
}>

export type AdmittedWorkloadContext = WorkloadContext & Readonly<{
  principalRevision: number
  activeAccountRevision: number
  accessVia: 'ownership' | 'membership'
}>

export type CrossAccountWorkloadAttribution = Readonly<{
  workloadKind: WorkloadKind
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  counterpartyAccountRef: AccountRef
  activeAccountRevision: number
  counterpartyAccountRevision: number
  correlationRef: string
  idempotencyRef: string
  purpose: string
  source: string
}>

export type WorkloadContextStore = Readonly<{
  getPrincipal(principalRef: PrincipalRef): Promise<Principal | undefined>
  getAccount(accountRef: AccountRef): Promise<Account | undefined>
  getOwnership(account: Account): Promise<AccountOwnership | undefined>
  getActiveMembership(accountRef: AccountRef, principalRef: PrincipalRef): Promise<Membership | undefined>
}>

export type WorkloadContextErrorCode =
  | 'workload_account_access_forbidden'
  | 'workload_account_inactive'
  | 'workload_account_missing'
  | 'workload_account_ref_invalid'
  | 'workload_context_field_invalid'
  | 'workload_context_shape_invalid'
  | 'workload_cross_account_self_forbidden'
  | 'workload_idempotency_ref_invalid'
  | 'workload_kind_invalid'
  | 'workload_principal_inactive'
  | 'workload_principal_kind_required'
  | 'workload_principal_missing'
  | 'workload_principal_ref_invalid'
  | 'workload_record_integrity_invalid'
  | 'workload_correlation_ref_invalid'

export class WorkloadContextError extends Error {
  readonly code: WorkloadContextErrorCode

  constructor(code: WorkloadContextErrorCode) {
    super(code)
    this.name = 'WorkloadContextError'
    this.code = code
  }
}

const WORKLOAD_CONTEXT_KEYS = [
  'activeAccountRef',
  'actorPrincipalRef',
  'correlationRef',
  'idempotencyRef',
  'purpose',
  'source',
  'workloadKind',
] as const

export function createWorkloadContext(input: unknown): WorkloadContext {
  const record = exactRecord(input, WORKLOAD_CONTEXT_KEYS)
  const workloadKind = workloadKindValue(record.workloadKind)
  const actorPrincipalRef = principalRefValue(record.actorPrincipalRef)
  const activeAccountRef = accountRefValue(record.activeAccountRef)
  const correlationRef = opaqueRefValue(record.correlationRef, 'workload_correlation_ref_invalid')
  const idempotencyRef = opaqueRefValue(record.idempotencyRef, 'workload_idempotency_ref_invalid')
  const purpose = attributionValue(record.purpose)
  const source = attributionValue(record.source)
  return Object.freeze({
    workloadKind,
    actorPrincipalRef,
    activeAccountRef,
    correlationRef,
    idempotencyRef,
    purpose,
    source,
  })
}

export class WorkloadContextAdmission {
  readonly #store: WorkloadContextStore

  constructor(store: WorkloadContextStore) {
    this.#store = store
  }

  async admit(input: unknown): Promise<AdmittedWorkloadContext> {
    const context = createWorkloadContext(input)
    const principal = await this.#store.getPrincipal(context.actorPrincipalRef)
    if (principal === undefined) throw new WorkloadContextError('workload_principal_missing')
    if (principal.principalRef !== context.actorPrincipalRef) {
      throw new WorkloadContextError('workload_record_integrity_invalid')
    }
    if (principal.kind !== 'workload') throw new WorkloadContextError('workload_principal_kind_required')
    if (principal.lifecycle !== 'active') throw new WorkloadContextError('workload_principal_inactive')

    const account = await this.#requiredActiveAccount(context.activeAccountRef)
    const ownership = await this.#store.getOwnership(account)
    if (ownership === undefined
      || ownership.ownershipRef !== account.currentOwnershipRef
      || ownership.accountRef !== account.accountRef
      || ownership.lifecycle !== 'active') {
      throw new WorkloadContextError('workload_record_integrity_invalid')
    }

    let accessVia: AdmittedWorkloadContext['accessVia']
    if (ownership.ownerPrincipalRef === principal.principalRef) {
      accessVia = 'ownership'
    } else {
      const membership = await this.#store.getActiveMembership(account.accountRef, principal.principalRef)
      if (membership === undefined) throw new WorkloadContextError('workload_account_access_forbidden')
      if (membership.accountRef !== account.accountRef
        || membership.memberPrincipalRef !== principal.principalRef
        || membership.lifecycle !== 'active') {
        throw new WorkloadContextError('workload_record_integrity_invalid')
      }
      accessVia = 'membership'
    }

    return Object.freeze({
      ...context,
      principalRevision: principal.revision,
      activeAccountRevision: account.revision,
      accessVia,
    })
  }

  async attributeCrossAccount(input: unknown): Promise<CrossAccountWorkloadAttribution> {
    const record = exactRecord(input, ['context', 'counterpartyAccountRef'])
    const admitted = await this.admit(record.context)
    const counterpartyAccountRef = accountRefValue(record.counterpartyAccountRef)
    if (counterpartyAccountRef === admitted.activeAccountRef) {
      throw new WorkloadContextError('workload_cross_account_self_forbidden')
    }
    const counterparty = await this.#requiredActiveAccount(counterpartyAccountRef)
    return Object.freeze({
      workloadKind: admitted.workloadKind,
      actorPrincipalRef: admitted.actorPrincipalRef,
      activeAccountRef: admitted.activeAccountRef,
      counterpartyAccountRef,
      activeAccountRevision: admitted.activeAccountRevision,
      counterpartyAccountRevision: counterparty.revision,
      correlationRef: admitted.correlationRef,
      idempotencyRef: admitted.idempotencyRef,
      purpose: admitted.purpose,
      source: admitted.source,
    })
  }

  async #requiredActiveAccount(ref: AccountRef): Promise<Account> {
    const account = await this.#store.getAccount(ref)
    if (account === undefined) throw new WorkloadContextError('workload_account_missing')
    if (account.accountRef !== ref) throw new WorkloadContextError('workload_record_integrity_invalid')
    if (account.lifecycle !== 'active') throw new WorkloadContextError('workload_account_inactive')
    return account
  }
}

function exactRecord(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new WorkloadContextError('workload_context_shape_invalid')
  }
  const record = input as Record<string, unknown>
  const actualKeys = Object.keys(record).sort()
  const expectedKeys = [...keys].sort()
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new WorkloadContextError('workload_context_shape_invalid')
  }
  return record
}

function workloadKindValue(value: unknown): WorkloadKind {
  if (typeof value !== 'string' || !WORKLOAD_KINDS.includes(value as WorkloadKind)) {
    throw new WorkloadContextError('workload_kind_invalid')
  }
  return value as WorkloadKind
}

function principalRefValue(value: unknown): PrincipalRef {
  if (typeof value !== 'string' || !PRINCIPAL_REF_PATTERN.test(value)) {
    throw new WorkloadContextError('workload_principal_ref_invalid')
  }
  return value as PrincipalRef
}

function accountRefValue(value: unknown): AccountRef {
  if (typeof value !== 'string' || !ACCOUNT_REF_PATTERN.test(value)) {
    throw new WorkloadContextError('workload_account_ref_invalid')
  }
  return value as AccountRef
}

function opaqueRefValue(value: unknown, code: WorkloadContextErrorCode): string {
  if (typeof value !== 'string' || !OPAQUE_REF_PATTERN.test(value)) throw new WorkloadContextError(code)
  return value
}

function attributionValue(value: unknown): string {
  if (typeof value !== 'string') throw new WorkloadContextError('workload_context_field_invalid')
  const normalized = value.trim()
  if (normalized.length === 0
    || normalized.length > ATTRIBUTION_MAX_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new WorkloadContextError('workload_context_field_invalid')
  }
  return normalized
}
