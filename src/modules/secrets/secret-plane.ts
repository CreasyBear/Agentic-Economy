const SECRET_REF_PATTERN = /^sec_[0-9a-f]{32}$/u
const SECRET_GENERATION_PATTERN = /^sgn_[0-9a-f]{32}$/u

declare const secretRefBrand: unique symbol
declare const secretGenerationBrand: unique symbol

export type SecretRef = string & { readonly [secretRefBrand]: true }
export type SecretGeneration = string & { readonly [secretGenerationBrand]: true }

export type SecretPlaneErrorCode =
  | 'invalid_secret_ref'
  | 'invalid_secret_generation'
  | 'secret_pointer_not_found'
  | 'secret_store_unavailable'
  | 'secret_store_authentication_failed'
  | 'secret_store_invalid_response'
  | 'invalid_secret_material'
  | 'secret_generation_validation_failed'
  | 'secret_generation_collision'
  | 'secret_pointer_advance_failed'
  | 'secret_pointer_reconciliation_failed'
  | 'secret_pointer_stale'
  | 'secret_operation_failed'
  | 'secret_lease_expired'

const ERROR_MESSAGES: Readonly<Record<SecretPlaneErrorCode, string>> = Object.freeze({
  invalid_secret_ref: 'Secret reference is invalid.',
  invalid_secret_generation: 'Secret generation is invalid.',
  secret_pointer_not_found: 'No active secret generation is available.',
  secret_store_unavailable: 'Secret storage is unavailable.',
  secret_store_authentication_failed: 'Secret storage authentication failed.',
  secret_store_invalid_response: 'Secret storage returned an invalid response.',
  invalid_secret_material: 'Secret material is invalid.',
  secret_generation_validation_failed: 'The new secret generation did not validate.',
  secret_generation_collision: 'The new secret generation collides with the active generation.',
  secret_pointer_advance_failed: 'The active secret generation could not be advanced.',
  secret_pointer_reconciliation_failed: 'The active secret generation could not be reconciled.',
  secret_pointer_stale: 'The active secret generation changed before use.',
  secret_operation_failed: 'The secret-scoped operation failed.',
  secret_lease_expired: 'Secret material is no longer available.',
})

export class SecretPlaneError extends Error {
  readonly code: SecretPlaneErrorCode

  constructor(code: SecretPlaneErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = 'SecretPlaneError'
    this.code = code
  }
}

export function secretRef(value: string): SecretRef {
  if (!SECRET_REF_PATTERN.test(value)) throw new SecretPlaneError('invalid_secret_ref')
  return value as SecretRef
}

export function secretGeneration(value: string): SecretGeneration {
  if (!SECRET_GENERATION_PATTERN.test(value)) throw new SecretPlaneError('invalid_secret_generation')
  return value as SecretGeneration
}

export interface SecretTarget {
  readonly secretRef: SecretRef
  readonly generation: SecretGeneration
}

export interface SecretMaterialLease {
  readonly byteLength: number
  /**
   * Supplies the sole mutable view of the leased bytes. The view is zeroed when
   * the enclosing lease callback exits, and callback return values are ignored.
   * Consumers must not deliberately copy leased bytes into durable storage.
   */
  useBytes(operation: (material: Uint8Array) => Promise<void>): Promise<void>
}

class EphemeralSecretMaterial implements SecretMaterialLease {
  readonly #bytes: Uint8Array
  #active = true

  constructor(material: Uint8Array) {
    this.#bytes = Uint8Array.from(material)
  }

  get byteLength(): number {
    this.#assertActive()
    return this.#bytes.byteLength
  }

  async useBytes(operation: (material: Uint8Array) => Promise<void>): Promise<void> {
    this.#assertActive()
    await operation(this.#bytes)
  }

  expire(): void {
    this.#bytes.fill(0)
    this.#active = false
  }

  #assertActive(): void {
    if (!this.#active) throw new SecretPlaneError('secret_lease_expired')
  }
}

export async function withEphemeralSecretMaterial(
  material: Uint8Array,
  operation: (lease: SecretMaterialLease) => Promise<void>,
): Promise<void> {
  const lease = new EphemeralSecretMaterial(material)
  try {
    await operation(lease)
  } finally {
    lease.expire()
  }
}

export interface SecretStore {
  withSecret(target: SecretTarget, operation: (lease: SecretMaterialLease) => Promise<void>): Promise<void>
  /** Atomically creates without replacing; duplicates return no deletion authority. */
  createGeneration(target: SecretTarget, material: SecretMaterialLease): Promise<SecretGenerationCreation>
}

export type SecretGenerationCreation =
  | { readonly kind: 'already-exists' }
  | {
    readonly kind: 'created'
    /** Attempt-local authority to discard only the generation this create produced. */
    discard(): Promise<void>
  }

export interface SecretMaterialSource {
  withMaterial(operation: (lease: SecretMaterialLease) => Promise<void>): Promise<void>
}

export interface SecretPointer {
  readonly secretRef: SecretRef
  readonly activeGeneration: SecretGeneration
  readonly revision: number
}

export interface SecretPointerAdvanceRequest {
  readonly secretRef: SecretRef
  readonly expectedActiveGeneration: SecretGeneration
  readonly expectedRevision: number
  readonly newGeneration: SecretGeneration
}

export interface SecretPointerStore {
  getActive(secretRef: SecretRef): Promise<SecretPointer | undefined>
  /** Compare-and-swap in one canonical transaction. No receipt proves state. */
  advanceActive(request: SecretPointerAdvanceRequest): Promise<void>
}

export interface SecretGenerationValidator {
  validate(target: SecretTarget, lease: SecretMaterialLease): Promise<boolean>
}

export interface SecretRotationResult {
  readonly secretRef: SecretRef
  readonly previousGeneration: SecretGeneration
  readonly activeGeneration: SecretGeneration
  readonly pointerRevision: number
}

export interface SecretPlaneOptions {
  readonly store: SecretStore
  readonly pointerStore: SecretPointerStore
  readonly validator: SecretGenerationValidator
  readonly randomUuid?: () => string
}

export class SecretPlane {
  readonly #store: SecretStore
  readonly #pointerStore: SecretPointerStore
  readonly #validator: SecretGenerationValidator
  readonly #randomUuid: () => string

  constructor(options: SecretPlaneOptions) {
    this.#store = options.store
    this.#pointerStore = options.pointerStore
    this.#validator = options.validator
    this.#randomUuid = options.randomUuid ?? (() => crypto.randomUUID())
  }

  async withActiveSecret(
    input: { readonly secretRef: SecretRef },
    operation: (lease: SecretMaterialLease) => Promise<void>,
  ): Promise<void> {
    const pointer = await this.#getActivePointer(input.secretRef)
    try {
      await this.#store.withSecret(
        { secretRef: pointer.secretRef, generation: pointer.activeGeneration },
        async (lease) => {
          const current = await this.#getActivePointer(pointer.secretRef)
          if (
            current.activeGeneration !== pointer.activeGeneration ||
            current.revision !== pointer.revision
          ) {
            throw new SecretPlaneError('secret_pointer_stale')
          }
          await operation(lease)
        },
      )
    } catch (error) {
      if (error instanceof SecretPlaneError) throw error
      throw new SecretPlaneError('secret_operation_failed')
    }
  }

  async rotate(input: {
    readonly secretRef: SecretRef
  }, materialSource: SecretMaterialSource): Promise<SecretRotationResult> {
    const current = await this.#getActivePointer(input.secretRef)
    const prepared = await this.#createFreshGeneration(current, materialSource)
    const { target, creation } = prepared
    const { generation } = target

    let valid = false
    let validationFailed = false
    try {
      await this.#store.withSecret(target, async (lease) => {
        try {
          valid = (await this.#validator.validate(target, lease)) === true
        } catch {
          validationFailed = true
          throw new SecretPlaneError('secret_generation_validation_failed')
        }
      })
    } catch {
      await this.#discard(creation)
      throw new SecretPlaneError(validationFailed
        ? 'secret_generation_validation_failed'
        : 'secret_store_unavailable')
    }
    if (!valid) {
      await this.#discard(creation)
      throw new SecretPlaneError('secret_generation_validation_failed')
    }

    try {
      await this.#pointerStore.advanceActive({
        secretRef: current.secretRef,
        expectedActiveGeneration: current.activeGeneration,
        expectedRevision: current.revision,
        newGeneration: generation,
      })
    } catch {
      // A failed call can be an ambiguous transport result after a committed
      // atomic advance. Canonical post-state below, never the receipt, decides.
    }

    let reconciled: SecretPointer | undefined
    try {
      reconciled = await this.#pointerStore.getActive(current.secretRef)
    } catch {
      throw new SecretPlaneError('secret_pointer_reconciliation_failed')
    }
    if (!this.#isValidPointer(reconciled, current.secretRef) ||
      reconciled.activeGeneration !== generation ||
      reconciled.revision !== current.revision + 1) {
      await this.#discard(creation)
      throw new SecretPlaneError('secret_pointer_advance_failed')
    }

    return Object.freeze({
      secretRef: current.secretRef,
      previousGeneration: current.activeGeneration,
      activeGeneration: generation,
      pointerRevision: reconciled.revision,
    })
  }

  async #createFreshGeneration(
    current: SecretPointer,
    materialSource: SecretMaterialSource,
  ): Promise<{ readonly target: SecretTarget; readonly creation: Extract<SecretGenerationCreation, { kind: 'created' }> }> {
    let prepared: { readonly target: SecretTarget; readonly creation: Extract<SecretGenerationCreation, { kind: 'created' }> } | undefined
    let sourceEntered = false
    try {
      await materialSource.withMaterial(async (material) => {
        if (sourceEntered) throw new SecretPlaneError('secret_store_unavailable')
        sourceEntered = true
        for (let attempt = 0; attempt < 8; attempt += 1) {
          const generation = secretGeneration(`sgn_${this.#randomUuid().replaceAll('-', '')}`)
          if (generation === current.activeGeneration) continue
          const target = Object.freeze({ secretRef: current.secretRef, generation })
          const creation = await this.#store.createGeneration(target, material)
          if (creation.kind === 'already-exists') continue
          prepared = Object.freeze({ target, creation })
          return
        }
      })
    } catch (error) {
      if (prepared !== undefined) await this.#discard(prepared.creation)
      if (error instanceof SecretPlaneError && error.code === 'invalid_secret_generation') throw error
      throw new SecretPlaneError('secret_store_unavailable')
    }
    if (!sourceEntered) throw new SecretPlaneError('secret_store_unavailable')
    if (prepared === undefined) throw new SecretPlaneError('secret_generation_collision')
    return prepared
  }

  async #getActivePointer(ref: SecretRef): Promise<SecretPointer> {
    let pointer: SecretPointer | undefined
    try {
      pointer = await this.#pointerStore.getActive(ref)
    } catch {
      throw new SecretPlaneError('secret_store_unavailable')
    }
    if (!this.#isValidPointer(pointer, ref)) {
      throw new SecretPlaneError('secret_pointer_not_found')
    }
    return pointer
  }

  #isValidPointer(pointer: SecretPointer | undefined, ref: SecretRef): pointer is SecretPointer {
    if (pointer === undefined || pointer.secretRef !== ref || !Number.isInteger(pointer.revision) || pointer.revision < 1) {
      return false
    }
    try {
      secretGeneration(pointer.activeGeneration)
      return true
    } catch {
      return false
    }
  }

  async #discard(creation: Extract<SecretGenerationCreation, { kind: 'created' }>): Promise<void> {
    try {
      await creation.discard()
    } catch {
      // The active pointer still references the previous generation. Cleanup is
      // intentionally best-effort and must never turn an unvalidated write active.
    }
  }
}
