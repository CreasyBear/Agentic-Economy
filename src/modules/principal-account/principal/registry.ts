const PRINCIPAL_REF_PATTERN = /^prn_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const DISPLAY_NAME_MAX_LENGTH = 200

declare const principalRefBrand: unique symbol

export type PrincipalRef = string & Readonly<{ [principalRefBrand]: 'PrincipalRef' }>

export const PRINCIPAL_KINDS = ['human', 'organization', 'agent', 'workload'] as const
export type PrincipalKind = typeof PRINCIPAL_KINDS[number]

export const PRINCIPAL_LIFECYCLES = ['active', 'suspended', 'merged', 'retired'] as const
export type PrincipalLifecycle = typeof PRINCIPAL_LIFECYCLES[number]

export type Principal = Readonly<{
  principalRef: PrincipalRef
  kind: PrincipalKind
  displayName: string
  lifecycle: PrincipalLifecycle
  revision: number
  createdAt: number
  updatedAt: number
  mergedIntoPrincipalRef?: PrincipalRef
}>

export type PrincipalRegistryErrorCode =
  | 'credential_rotation_principal_transfer_forbidden'
  | 'invalid_principal_display_name'
  | 'invalid_principal_ref'
  | 'invalid_principal_timestamp'
  | 'principal_kind_mismatch'
  | 'principal_lifecycle_transition_forbidden'
  | 'principal_merge_cycle'
  | 'principal_merge_self_forbidden'
  | 'principal_merge_target_inactive'
  | 'principal_merge_target_missing'
  | 'principal_not_found'
  | 'principal_ref_conflict'
  | 'principal_revision_conflict'

export class PrincipalRegistryError extends Error {
  readonly code: PrincipalRegistryErrorCode

  constructor(code: PrincipalRegistryErrorCode) {
    super(code)
    this.name = 'PrincipalRegistryError'
    this.code = code
  }
}

export type PrincipalRegistryTransaction = Readonly<{
  get(principalRef: PrincipalRef): Promise<Principal | undefined>
  insert(principal: Principal): Promise<void>
  replace(principal: Principal, expectedRevision: number): Promise<void>
  replaceMany(replacements: readonly Readonly<{
    principal: Principal
    expectedRevision: number
  }>[]): Promise<void>
}>

export type PrincipalRegistryStore = Readonly<{
  transact<Result>(operation: (transaction: PrincipalRegistryTransaction) => Promise<Result>): Promise<Result>
}>

export type PrincipalContinuity = Readonly<{
  principalRef: PrincipalRef
  kind: PrincipalKind
  revision: number
}>

export type PrincipalRegistryOptions = Readonly<{
  now?: () => number
  randomUuid?: () => string
}>

export function principalRef(value: string): PrincipalRef {
  if (!PRINCIPAL_REF_PATTERN.test(value)) throw new PrincipalRegistryError('invalid_principal_ref')
  return value as PrincipalRef
}

export function generatePrincipalRef(randomUuid: () => string = () => globalThis.crypto.randomUUID()): PrincipalRef {
  const uuid = randomUuid()
  if (!UUID_PATTERN.test(uuid)) throw new PrincipalRegistryError('invalid_principal_ref')
  return principalRef(`prn_${uuid.replaceAll('-', '')}`)
}

export class PrincipalRegistry {
  readonly #store: PrincipalRegistryStore
  readonly #now: () => number
  readonly #randomUuid: () => string

  constructor(store: PrincipalRegistryStore, options: PrincipalRegistryOptions = {}) {
    this.#store = store
    this.#now = options.now ?? (() => Date.now())
    this.#randomUuid = options.randomUuid ?? (() => globalThis.crypto.randomUUID())
  }

  async register(input: Readonly<{ kind: PrincipalKind; displayName: string }>): Promise<Principal> {
    const ref = generatePrincipalRef(this.#randomUuid)
    const timestamp = validTimestamp(this.#now())
    const kind = validKind(input.kind)
    const displayName = validDisplayName(input.displayName)

    return await this.#store.transact(async (transaction) => {
      if (await transaction.get(ref) !== undefined) throw new PrincipalRegistryError('principal_ref_conflict')
      const principal = freezePrincipal({
        principalRef: ref,
        kind,
        displayName,
        lifecycle: 'active',
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      await transaction.insert(principal)
      return principal
    })
  }

  async get(ref: PrincipalRef): Promise<Principal | undefined> {
    const validRef = principalRef(ref)
    return await this.#store.transact(async (transaction) => await transaction.get(validRef))
  }

  async rename(input: Readonly<{
    principalRef: PrincipalRef
    expectedRevision: number
    displayName: string
  }>): Promise<Principal> {
    const ref = principalRef(input.principalRef)
    const displayName = validDisplayName(input.displayName)
    const timestamp = validTimestamp(this.#now())
    return await this.#store.transact(async (transaction) => {
      const current = await requiredPrincipal(transaction, ref)
      assertRevision(current, input.expectedRevision)
      if (current.lifecycle === 'merged' || current.lifecycle === 'retired') {
        throw new PrincipalRegistryError('principal_lifecycle_transition_forbidden')
      }
      if (current.displayName === displayName) return current
      assertMonotonicTimestamp(timestamp, current.updatedAt)
      const updated = freezePrincipal({
        ...current,
        displayName,
        revision: current.revision + 1,
        updatedAt: timestamp,
      })
      await transaction.replace(updated, current.revision)
      return updated
    })
  }

  async resolveCanonical(ref: PrincipalRef): Promise<Principal> {
    const validRef = principalRef(ref)
    return await this.#store.transact(async (transaction) => {
      const visited = new Set<PrincipalRef>()
      let currentRef = validRef
      while (true) {
        if (visited.has(currentRef)) throw new PrincipalRegistryError('principal_merge_cycle')
        visited.add(currentRef)
        const current = await requiredPrincipal(transaction, currentRef)
        if (current.lifecycle !== 'merged') return current
        if (current.mergedIntoPrincipalRef === undefined) {
          throw new PrincipalRegistryError('principal_merge_target_missing')
        }
        currentRef = principalRef(current.mergedIntoPrincipalRef)
      }
    })
  }

  async setLifecycle(input: Readonly<{
    principalRef: PrincipalRef
    expectedRevision: number
    lifecycle: 'active' | 'suspended' | 'retired'
  }>): Promise<Principal> {
    const ref = principalRef(input.principalRef)
    const timestamp = validTimestamp(this.#now())
    return await this.#store.transact(async (transaction) => {
      const current = await requiredPrincipal(transaction, ref)
      assertRevision(current, input.expectedRevision)
      if (current.lifecycle === input.lifecycle) return current
      if (!lifecycleTransitionAllowed(current.lifecycle, input.lifecycle)) {
        throw new PrincipalRegistryError('principal_lifecycle_transition_forbidden')
      }
      assertMonotonicTimestamp(timestamp, current.updatedAt)
      const updated = freezePrincipal({
        ...current,
        lifecycle: input.lifecycle,
        revision: current.revision + 1,
        updatedAt: timestamp,
      })
      await transaction.replace(updated, current.revision)
      return updated
    })
  }

  async merge(input: Readonly<{
    sourcePrincipalRef: PrincipalRef
    targetPrincipalRef: PrincipalRef
    expectedSourceRevision: number
    expectedTargetRevision: number
  }>): Promise<Readonly<{ source: Principal; target: Principal }>> {
    const sourceRef = principalRef(input.sourcePrincipalRef)
    const targetRef = principalRef(input.targetPrincipalRef)
    if (sourceRef === targetRef) {
      throw new PrincipalRegistryError('principal_merge_self_forbidden')
    }
    const timestamp = validTimestamp(this.#now())
    return await this.#store.transact(async (transaction) => {
      const source = await requiredPrincipal(transaction, sourceRef)
      const target = await requiredPrincipal(transaction, targetRef)
      assertRevision(source, input.expectedSourceRevision)
      assertRevision(target, input.expectedTargetRevision)
      if (source.kind !== target.kind) throw new PrincipalRegistryError('principal_kind_mismatch')
      if (source.lifecycle !== 'active' && source.lifecycle !== 'suspended') {
        throw new PrincipalRegistryError('principal_lifecycle_transition_forbidden')
      }
      if (target.lifecycle !== 'active') throw new PrincipalRegistryError('principal_merge_target_inactive')
      assertMonotonicTimestamp(timestamp, Math.max(source.updatedAt, target.updatedAt))

      const mergedSource = freezePrincipal({
        ...source,
        lifecycle: 'merged',
        mergedIntoPrincipalRef: target.principalRef,
        revision: source.revision + 1,
        updatedAt: timestamp,
      })
      const updatedTarget = freezePrincipal({
        ...target,
        revision: target.revision + 1,
        updatedAt: timestamp,
      })
      await transaction.replaceMany([
        { principal: mergedSource, expectedRevision: source.revision },
        { principal: updatedTarget, expectedRevision: target.revision },
      ])
      return Object.freeze({ source: mergedSource, target: updatedTarget })
    })
  }

  async proveCredentialRotationContinuity(input: Readonly<{
    currentPrincipalRef: PrincipalRef
    replacementPrincipalRef: PrincipalRef
    expectedRevision: number
  }>): Promise<PrincipalContinuity> {
    const currentRef = principalRef(input.currentPrincipalRef)
    const replacementRef = principalRef(input.replacementPrincipalRef)
    if (currentRef !== replacementRef) {
      throw new PrincipalRegistryError('credential_rotation_principal_transfer_forbidden')
    }
    return await this.#store.transact(async (transaction) => {
      const current = await requiredPrincipal(transaction, currentRef)
      assertRevision(current, input.expectedRevision)
      if (current.lifecycle === 'merged' || current.lifecycle === 'retired') {
        throw new PrincipalRegistryError('principal_lifecycle_transition_forbidden')
      }
      return Object.freeze({
        principalRef: current.principalRef,
        kind: current.kind,
        revision: current.revision,
      })
    })
  }
}

function validDisplayName(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > DISPLAY_NAME_MAX_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new PrincipalRegistryError('invalid_principal_display_name')
  }
  return normalized
}

function validKind(value: PrincipalKind): PrincipalKind {
  if (!PRINCIPAL_KINDS.includes(value)) throw new PrincipalRegistryError('principal_kind_mismatch')
  return value
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new PrincipalRegistryError('invalid_principal_timestamp')
  return value
}

function assertMonotonicTimestamp(value: number, prior: number): void {
  if (value < prior) throw new PrincipalRegistryError('invalid_principal_timestamp')
}

function assertRevision(principal: Principal, expectedRevision: number): void {
  if (principal.revision !== expectedRevision) throw new PrincipalRegistryError('principal_revision_conflict')
}

async function requiredPrincipal(
  transaction: PrincipalRegistryTransaction,
  ref: PrincipalRef,
): Promise<Principal> {
  const principal = await transaction.get(ref)
  if (principal === undefined) throw new PrincipalRegistryError('principal_not_found')
  return principal
}

function lifecycleTransitionAllowed(
  current: PrincipalLifecycle,
  next: 'active' | 'suspended' | 'retired',
): boolean {
  if (next === 'retired') return current === 'active' || current === 'suspended'
  return (current === 'active' && next === 'suspended') || (current === 'suspended' && next === 'active')
}

function freezePrincipal(principal: Principal): Principal {
  return Object.freeze(principal)
}
