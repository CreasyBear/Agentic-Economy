import {
  SecretPlaneError,
  secretGeneration,
  secretRef,
  type SecretGeneration,
  type SecretGenerationValidator,
  type SecretMaterialSource,
  type SecretPointer,
  type SecretPointerStore,
  type SecretRef,
  type SecretStore,
  type SecretTarget,
} from './secret-plane'

const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u

export type SecretLifecycleState =
  | 'prepared'
  | 'active'
  | 'failed_validation'
  | 'external_effect_unknown'
  | 'pointer_conflict'

export type SecretLifecycleOperation = 'provision' | 'rotate'

export type SecretLifecycleRecord = Readonly<{
  operationRef: string
  idempotencyRef: string
  operation: SecretLifecycleOperation
  secretRef: SecretRef
  targetGeneration: SecretGeneration
  previousGeneration?: SecretGeneration
  previousRevision: number
  state: SecretLifecycleState
  createdAt: number
  updatedAt: number
}>

export type SecretLifecycleJournal = Readonly<{
  getByIdempotency(idempotencyRef: string): Promise<SecretLifecycleRecord | undefined>
  insertPrepared(record: SecretLifecycleRecord): Promise<void>
  replace(record: SecretLifecycleRecord, expectedState: SecretLifecycleState): Promise<void>
}>

export interface SecretPointerControl extends SecretPointerStore {
  initializeActive(target: SecretTarget): Promise<void>
}

export type SecretLifecycleResult = Readonly<{
  operationRef: string
  secretRef: SecretRef
  activeGeneration: SecretGeneration
  pointerRevision: number
  state: 'active'
}>

export type SecretLifecycleRequest = Readonly<{
  secretRef: SecretRef
  idempotencyRef: string
  materialSource: SecretMaterialSource
}>

export type SecretLifecycleReconcileRequest = Readonly<{
  idempotencyRef: string
}>

export type SecretLifecycleErrorCode =
  | 'secret_lifecycle_ambiguous'
  | 'secret_lifecycle_conflict'
  | 'secret_lifecycle_invalid'
  | 'secret_lifecycle_validation_failed'

export class SecretLifecycleError extends Error {
  readonly code: SecretLifecycleErrorCode

  constructor(code: SecretLifecycleErrorCode) {
    super(code)
    this.name = 'SecretLifecycleError'
    this.code = code
  }
}

export type ProductionSecretLifecycleServiceOptions = Readonly<{
  store: SecretStore
  pointerControl: SecretPointerControl
  validator: SecretGenerationValidator
  journal: SecretLifecycleJournal
  now?: () => number
  randomUuid?: () => string
}>

export class ProductionSecretLifecycleService {
  readonly #store: SecretStore
  readonly #pointers: SecretPointerControl
  readonly #validator: SecretGenerationValidator
  readonly #journal: SecretLifecycleJournal
  readonly #now: () => number
  readonly #randomUuid: () => string

  constructor(options: ProductionSecretLifecycleServiceOptions) {
    this.#store = options.store
    this.#pointers = options.pointerControl
    this.#validator = options.validator
    this.#journal = options.journal
    this.#now = options.now ?? (() => Date.now())
    this.#randomUuid = options.randomUuid ?? (() => globalThis.crypto.randomUUID())
  }

  async provision(input: SecretLifecycleRequest): Promise<SecretLifecycleResult> {
    const request = this.#canonicalRequest(input)
    const replay = await this.#journal.getByIdempotency(request.idempotencyRef)
    if (replay !== undefined) return await this.#resolveReplay(replay, 'provision', request.secretRef)
    if (await this.#readPointer(request.secretRef) !== undefined) {
      throw new SecretLifecycleError('secret_lifecycle_conflict')
    }

    const target = Object.freeze({ secretRef: request.secretRef, generation: this.#newGeneration() })
    const timestamp = this.#timestamp()
    const prepared = Object.freeze({
      operationRef: this.#newOperationRef(),
      idempotencyRef: request.idempotencyRef,
      operation: 'provision' as const,
      secretRef: request.secretRef,
      targetGeneration: target.generation,
      previousRevision: 0,
      state: 'prepared' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await this.#journal.insertPrepared(prepared)
    try {
      await this.#writeAndValidate(target, request.materialSource)
      await this.#pointers.initializeActive(target)
      const active = await this.#requireExactPointer(target, 1)
      const completed = await this.#transition(prepared, 'active')
      return result(completed, active)
    } catch (error) {
      if (error instanceof SecretLifecycleError) {
        await this.#recordKnownFailure(prepared, error)
        throw error
      }
      return await this.#throwAmbiguous(prepared)
    }
  }

  async rotate(input: SecretLifecycleRequest): Promise<SecretLifecycleResult> {
    const request = this.#canonicalRequest(input)
    const replay = await this.#journal.getByIdempotency(request.idempotencyRef)
    if (replay !== undefined) return await this.#resolveReplay(replay, 'rotate', request.secretRef)

    const previous = await this.#requirePointer(request.secretRef)
    const target = Object.freeze({
      secretRef: request.secretRef,
      generation: this.#newGeneration(),
    })
    const timestamp = this.#timestamp()
    const prepared = Object.freeze({
      operationRef: this.#newOperationRef(),
      idempotencyRef: request.idempotencyRef,
      operation: 'rotate' as const,
      secretRef: request.secretRef,
      targetGeneration: target.generation,
      previousGeneration: previous.activeGeneration,
      previousRevision: previous.revision,
      state: 'prepared' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await this.#journal.insertPrepared(prepared)

    try {
      await this.#writeAndValidate(target, request.materialSource)
      await this.#pointers.advanceActive({
        secretRef: request.secretRef,
        expectedActiveGeneration: previous.activeGeneration,
        expectedRevision: previous.revision,
        newGeneration: target.generation,
      })
      const active = await this.#requireExactPointer(target, previous.revision + 1)
      const completed = await this.#transition(prepared, 'active')
      return result(completed, active)
    } catch (error) {
      if (error instanceof SecretLifecycleError) {
        await this.#recordKnownFailure(prepared, error)
        throw error
      }
      return await this.#throwAmbiguous(prepared)
    }
  }

  async reconcile(input: SecretLifecycleReconcileRequest): Promise<SecretLifecycleResult> {
    if (!OPAQUE_REF_PATTERN.test(input.idempotencyRef)) throw new SecretLifecycleError('secret_lifecycle_invalid')
    const record = await this.#journal.getByIdempotency(input.idempotencyRef)
    if (record === undefined) throw new SecretLifecycleError('secret_lifecycle_conflict')
    const pointer = await this.#readPointer(record.secretRef).catch(() => undefined)
    const targetRevision = record.previousRevision + 1
    if (pointer?.secretRef === record.secretRef
      && pointer.activeGeneration === record.targetGeneration
      && pointer.revision === targetRevision) {
      const active = record.state === 'active' ? record : await this.#transition(record, 'active')
      return result(active, pointer)
    }
    if (record.state === 'failed_validation') {
      throw new SecretLifecycleError('secret_lifecycle_validation_failed')
    }
    const stillPrevious = record.operation === 'rotate'
      && pointer?.activeGeneration === record.previousGeneration
      && pointer?.revision === record.previousRevision
    const stillAbsent = record.operation === 'provision' && pointer === undefined
    if (stillPrevious || stillAbsent || pointer === undefined) {
      throw new SecretLifecycleError('secret_lifecycle_ambiguous')
    }
    if (record.state !== 'pointer_conflict') await this.#transition(record, 'pointer_conflict')
    throw new SecretLifecycleError('secret_lifecycle_conflict')
  }

  async #writeAndValidate(target: SecretTarget, materialSource: SecretMaterialSource): Promise<void> {
    let creation: Awaited<ReturnType<SecretStore['createGeneration']>> | undefined
    let sourceEntered = false
    await materialSource.withMaterial(async (material) => {
      if (sourceEntered) throw new SecretLifecycleError('secret_lifecycle_conflict')
      sourceEntered = true
      creation = await this.#store.createGeneration(target, material)
    })
    if (creation?.kind !== 'created') throw new SecretLifecycleError('secret_lifecycle_conflict')
    let valid = false
    try {
      await this.#store.withSecret(target, async (lease) => {
        valid = await this.#validator.validate(target, lease)
      })
    } catch {
      throw new SecretPlaneError('secret_store_unavailable')
    }
    if (!valid) {
      await creation.discard().catch(() => undefined)
      throw new SecretLifecycleError('secret_lifecycle_validation_failed')
    }
  }

  #canonicalRequest(input: SecretLifecycleRequest): SecretLifecycleRequest {
    if (!OPAQUE_REF_PATTERN.test(input.idempotencyRef)) throw new SecretLifecycleError('secret_lifecycle_invalid')
    return Object.freeze({
      secretRef: secretRef(input.secretRef),
      idempotencyRef: input.idempotencyRef,
      materialSource: input.materialSource,
    })
  }

  async #requirePointer(ref: SecretRef): Promise<SecretPointer> {
    const pointer = await this.#readPointer(ref)
    if (pointer === undefined || pointer.secretRef !== ref || pointer.revision < 1) {
      throw new SecretLifecycleError('secret_lifecycle_conflict')
    }
    return pointer
  }

  async #readPointer(ref: SecretRef): Promise<SecretPointer | undefined> {
    try {
      return await this.#pointers.getActive(ref)
    } catch {
      throw new SecretLifecycleError('secret_lifecycle_ambiguous')
    }
  }

  async #requireExactPointer(target: SecretTarget, revision: number): Promise<SecretPointer> {
    const pointer = await this.#requirePointer(target.secretRef)
    if (pointer.activeGeneration !== target.generation || pointer.revision !== revision) {
      throw new SecretLifecycleError('secret_lifecycle_conflict')
    }
    return pointer
  }

  async #resolveReplay(
    replay: SecretLifecycleRecord,
    operation: SecretLifecycleOperation,
    ref: SecretRef,
  ): Promise<SecretLifecycleResult> {
    if (replay.operation !== operation || replay.secretRef !== ref) {
      throw new SecretLifecycleError('secret_lifecycle_conflict')
    }
    if (replay.state === 'failed_validation') {
      throw new SecretLifecycleError('secret_lifecycle_validation_failed')
    }
    if (replay.state === 'pointer_conflict') {
      throw new SecretLifecycleError('secret_lifecycle_conflict')
    }
    if (replay.state !== 'active') throw new SecretLifecycleError('secret_lifecycle_ambiguous')
    const pointer = await this.#requireExactPointer(
      { secretRef: replay.secretRef, generation: replay.targetGeneration },
      replay.previousRevision + 1,
    )
    return result(replay, pointer)
  }

  async #transition(
    record: SecretLifecycleRecord,
    state: Exclude<SecretLifecycleState, 'prepared'>,
  ): Promise<SecretLifecycleRecord> {
    const next = Object.freeze({ ...record, state, updatedAt: this.#timestamp() })
    await this.#journal.replace(next, record.state)
    return next
  }

  async #recordKnownFailure(record: SecretLifecycleRecord, error: SecretLifecycleError): Promise<void> {
    const state = error.code === 'secret_lifecycle_validation_failed'
      ? 'failed_validation'
      : 'pointer_conflict'
    try {
      await this.#transition(record, state)
    } catch {
      throw new SecretLifecycleError('secret_lifecycle_ambiguous')
    }
  }

  async #throwAmbiguous(record: SecretLifecycleRecord): Promise<never> {
    try {
      await this.#transition(record, 'external_effect_unknown')
    } catch {
      // A journal receipt can itself be ambiguous. The durable prepared state
      // remains non-retryable and reconciliation, never a receipt, decides.
    }
    throw new SecretLifecycleError('secret_lifecycle_ambiguous')
  }

  #timestamp(): number {
    const value = this.#now()
    if (!Number.isSafeInteger(value) || value < 0) throw new SecretLifecycleError('secret_lifecycle_invalid')
    return value
  }

  #newGeneration(): SecretGeneration {
    const value = this.#randomUuid()
    if (!UUID_PATTERN.test(value)) throw new SecretLifecycleError('secret_lifecycle_invalid')
    return secretGeneration(`sgn_${value.replaceAll('-', '')}`)
  }

  #newOperationRef(): string {
    const value = this.#randomUuid()
    if (!UUID_PATTERN.test(value)) throw new SecretLifecycleError('secret_lifecycle_invalid')
    return `sop_${value.replaceAll('-', '')}`
  }
}

function result(record: SecretLifecycleRecord, pointer: SecretPointer): SecretLifecycleResult {
  return Object.freeze({
    operationRef: record.operationRef,
    secretRef: record.secretRef,
    activeGeneration: pointer.activeGeneration,
    pointerRevision: pointer.revision,
    state: 'active',
  })
}
