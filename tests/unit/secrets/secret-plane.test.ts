import { describe, expect, it } from 'vitest'

import {
  SecretPlane,
  SecretPlaneError,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type SecretGenerationValidator,
  type SecretGenerationCreation,
  type SecretMaterialLease,
  type SecretMaterialSource,
  type SecretPointer,
  type SecretPointerAdvanceRequest,
  type SecretPointerStore,
  type SecretRef,
  type SecretStore,
  type SecretTarget,
} from '../../../src/modules/secrets/public'

const REF = secretRef('sec_11111111111111111111111111111111')
const OTHER_REF = secretRef('sec_22222222222222222222222222222222')
const FIRST = secretGeneration('sgn_11111111111111111111111111111111')
const NEXT = secretGeneration('sgn_00000000000040008000000000000002')
const THIRD = secretGeneration('sgn_00000000000040008000000000000003')
const CANARY = 'core-plane-canary'

class MemorySecretStore implements SecretStore {
  readonly material = new Map<string, Uint8Array>()
  readonly events: string[] = []
  failRead = false
  failWrite = false
  failDelete = false
  lastReadTarget?: SecretTarget
  beforeOperation?: () => void

  async withSecret(target: SecretTarget, operation: (lease: SecretMaterialLease) => Promise<void>): Promise<void> {
    this.events.push(`read:${target.generation}`)
    this.lastReadTarget = target
    if (this.failRead) throw new Error(`provider ${CANARY}`)
    const material = this.material.get(this.#key(target))
    if (material === undefined) throw new Error('missing')
    this.beforeOperation?.()
    await withEphemeralSecretMaterial(material, operation)
  }

  async createGeneration(target: SecretTarget, material: SecretMaterialLease): Promise<SecretGenerationCreation> {
    this.events.push(`write:${target.generation}`)
    if (this.failWrite) throw new Error(`provider ${CANARY}`)
    if (this.material.has(this.#key(target))) return Object.freeze({ kind: 'already-exists' })
    await material.useBytes(async (bytes) => {
      this.material.set(this.#key(target), Uint8Array.from(bytes))
    })
    return Object.freeze({
      kind: 'created',
      discard: async () => {
        this.events.push(`delete:${target.generation}`)
        if (this.failDelete) throw new Error(`provider ${CANARY}`)
        this.material.delete(this.#key(target))
      },
    })
  }

  #key(target: SecretTarget): string {
    return `${target.secretRef}:${target.generation}`
  }
}

class MemoryPointerStore implements SecretPointerStore {
  pointer: SecretPointer | undefined = Object.freeze({ secretRef: REF, activeGeneration: FIRST, revision: 1 })
  readonly events: string[] = []
  failGet = false
  failGetAfter?: number
  getCount = 0
  failAdvance = false
  commitThenThrow = false
  forgedAdvance?: SecretPointer

  async getActive(): Promise<SecretPointer | undefined> {
    this.events.push('pointer:read')
    this.getCount += 1
    if (this.failGet || (this.failGetAfter !== undefined && this.getCount > this.failGetAfter)) {
      throw new Error(`database ${CANARY}`)
    }
    return this.pointer
  }

  async advanceActive(request: SecretPointerAdvanceRequest): Promise<void> {
    this.events.push('pointer:advance')
    if (this.failAdvance) throw new Error(`database ${CANARY}`)
    if (this.forgedAdvance !== undefined) return this.forgedAdvance as never
    const current = this.pointer
    if (
      current === undefined ||
      current.secretRef !== request.secretRef ||
      current.activeGeneration !== request.expectedActiveGeneration ||
      current.revision !== request.expectedRevision
    ) {
      throw new Error('stale')
    }
    this.pointer = Object.freeze({
      secretRef: request.secretRef,
      activeGeneration: request.newGeneration,
      revision: current.revision + 1,
    })
    if (this.commitThenThrow) throw new Error(`ambiguous ${CANARY}`)
  }
}

function source(value = CANARY): SecretMaterialSource {
  return {
    withMaterial: async (operation) => await withEphemeralSecretMaterial(
      new TextEncoder().encode(value),
      operation,
    ),
  }
}

function setup(validation: boolean | 'throw' = true, useDefaultUuid = false) {
  const store = new MemorySecretStore()
  store.material.set(`${REF}:${FIRST}`, new TextEncoder().encode('current'))
  const pointerStore = new MemoryPointerStore()
  const validator: SecretGenerationValidator = {
    validate: async (target, lease) => {
      store.events.push(`validate:${target.generation}`)
      await lease.useBytes(async () => undefined)
      if (validation === 'throw') throw new Error(`validator ${CANARY}`)
      return validation
    },
  }
  const plane = new SecretPlane({
    store,
    pointerStore,
    validator,
    ...(useDefaultUuid ? {} : { randomUuid: () => '00000000-0000-4000-8000-000000000002' }),
  })
  return { plane, store, pointerStore }
}

async function expectSafeFailure(operation: Promise<unknown>, code: string): Promise<void> {
  let failure: unknown
  try {
    await operation
  } catch (error) {
    failure = error
  }
  expect(failure).toMatchObject({ code })
  expect(JSON.stringify(failure)).not.toContain(CANARY)
}

describe('SecretPlane', () => {
  it('uses opaque identifiers and rejects malformed references and generations', () => {
    expect(REF).toBe('sec_11111111111111111111111111111111')
    expect(FIRST).toBe('sgn_11111111111111111111111111111111')
    expect(() => secretRef('provider-owned-secret')).toThrowError(new SecretPlaneError('invalid_secret_ref'))
    expect(() => secretGeneration('1')).toThrowError(new SecretPlaneError('invalid_secret_generation'))
  })

  it('resolves the canonical pointer and ignores credential/provider-shaped request fields', async () => {
    const context = setup()
    let matchedCanonicalMaterial = false
    await context.plane.withActiveSecret({
      secretRef: REF,
      credentialRef: 'cred_forged',
      providerId: 'provider-fake',
      generation: secretGeneration('sgn_ffffffffffffffffffffffffffffffff'),
    } as { secretRef: SecretRef }, async (lease) => {
      await lease.useBytes(async (bytes) => {
        matchedCanonicalMaterial = new TextDecoder().decode(bytes) === 'current'
      })
    })
    expect(matchedCanonicalMaterial).toBe(true)
    expect(context.store.lastReadTarget).toEqual({ secretRef: REF, generation: FIRST })
  })

  it('fails closed for missing, mismatched, unavailable and unreadable canonical pointers', async () => {
    const missing = setup()
    missing.pointerStore.pointer = undefined
    await expectSafeFailure(missing.plane.withActiveSecret({ secretRef: REF }, async () => undefined), 'secret_pointer_not_found')

    const mismatched = setup()
    mismatched.pointerStore.pointer = Object.freeze({ secretRef: OTHER_REF, activeGeneration: FIRST, revision: 1 })
    await expectSafeFailure(mismatched.plane.withActiveSecret({ secretRef: REF }, async () => undefined), 'secret_pointer_not_found')

    const unavailable = setup()
    unavailable.pointerStore.failGet = true
    await expectSafeFailure(unavailable.plane.withActiveSecret({ secretRef: REF }, async () => undefined), 'secret_store_unavailable')

    const vault = setup()
    vault.store.failRead = true
    let admitted = false
    await expectSafeFailure(vault.plane.withActiveSecret({ secretRef: REF }, async () => {
      admitted = true
    }), 'secret_operation_failed')
    expect(admitted).toBe(false)
  })

  it('sanitizes callback failures while preserving the fixed expired-lease signal', async () => {
    const context = setup()
    await expectSafeFailure(context.plane.withActiveSecret({ secretRef: REF }, async () => {
      throw new Error(CANARY)
    }), 'secret_operation_failed')
    await expect(context.plane.withActiveSecret({ secretRef: REF }, async () => {
      throw new SecretPlaneError('secret_lease_expired')
    })).rejects.toMatchObject({ code: 'secret_lease_expired' })
  })

  it('writes and validates the new generation before atomically requesting pointer advance', async () => {
    const context = setup()
    const result = await context.plane.rotate({ secretRef: REF }, source('next'))
    expect(result).toEqual({
      secretRef: REF,
      previousGeneration: FIRST,
      activeGeneration: NEXT,
      pointerRevision: 2,
    })
    expect(context.store.events).toEqual([
      `write:${NEXT}`,
      `read:${NEXT}`,
      `validate:${NEXT}`,
    ])
    expect(context.pointerStore.events).toEqual(['pointer:read', 'pointer:advance', 'pointer:read'])
    expect(context.pointerStore.pointer?.activeGeneration).toBe(NEXT)
    expect(JSON.stringify(result)).not.toContain('next')
  })

  it('uses a generated opaque generation when no deterministic generator is supplied', async () => {
    const context = setup(true, true)
    const result = await context.plane.rotate({ secretRef: REF }, source('next'))
    expect(result.activeGeneration).toMatch(/^sgn_[0-9a-f]{32}$/u)
  })

  it('does not advance when writing, reading, validation, or cleanup fails', async () => {
    const write = setup()
    write.store.failWrite = true
    await expectSafeFailure(write.plane.rotate({ secretRef: REF }, source()), 'secret_store_unavailable')
    expect(write.pointerStore.events).toEqual(['pointer:read'])
    expect(write.store.events).toEqual([`write:${NEXT}`])

    const read = setup()
    read.store.failRead = true
    await expectSafeFailure(read.plane.rotate({ secretRef: REF }, source()), 'secret_store_unavailable')
    expect(read.pointerStore.events).toEqual(['pointer:read'])

    const invalid = setup(false)
    invalid.store.failDelete = true
    await expectSafeFailure(invalid.plane.rotate({ secretRef: REF }, source()), 'secret_generation_validation_failed')
    expect(invalid.pointerStore.events).toEqual(['pointer:read'])
    expect(invalid.store.events).toContain(`delete:${NEXT}`)
    expect(invalid.store.material.has(`${REF}:${NEXT}`)).toBe(true)

    const validatorError = setup('throw')
    await expectSafeFailure(validatorError.plane.rotate({ secretRef: REF }, source()), 'secret_generation_validation_failed')
    expect(validatorError.pointerStore.events).toEqual(['pointer:read'])
    expect(validatorError.store.events).toContain(`delete:${NEXT}`)
    expect(validatorError.store.material.has(`${REF}:${NEXT}`)).toBe(false)
  })

  it('rejects stale advance and forged rotation results and removes the uncommitted generation', async () => {
    const stale = setup()
    stale.pointerStore.failAdvance = true
    await expectSafeFailure(stale.plane.rotate({ secretRef: REF }, source()), 'secret_pointer_advance_failed')
    expect(stale.store.material.has(`${REF}:${NEXT}`)).toBe(false)

    const forgeries: SecretPointer[] = [
      Object.freeze({ secretRef: OTHER_REF, activeGeneration: NEXT, revision: 2 }),
      Object.freeze({ secretRef: REF, activeGeneration: FIRST, revision: 2 }),
      Object.freeze({ secretRef: REF, activeGeneration: NEXT, revision: 99 }),
    ]
    for (const forged of forgeries) {
      const context = setup()
      context.pointerStore.forgedAdvance = forged
      await expectSafeFailure(context.plane.rotate({ secretRef: REF }, source()), 'secret_pointer_advance_failed')
      expect(context.pointerStore.pointer?.activeGeneration).toBe(FIRST)
      expect(context.store.material.has(`${REF}:${NEXT}`)).toBe(false)
    }
  })

  it('rechecks generation immediately before use and reconciles pointer state after advance', async () => {
    const stale = setup()
    let admitted = false
    stale.store.beforeOperation = () => {
      stale.pointerStore.pointer = Object.freeze({ secretRef: REF, activeGeneration: NEXT, revision: 2 })
    }
    await expectSafeFailure(stale.plane.withActiveSecret({ secretRef: REF }, async () => {
      admitted = true
    }), 'secret_pointer_stale')
    expect(admitted).toBe(false)

    for (const invalid of [
      Object.freeze({ secretRef: REF, activeGeneration: FIRST, revision: 0 }),
      Object.freeze({ secretRef: REF, activeGeneration: 'provider-generation' as typeof FIRST, revision: 1 }),
    ]) {
      const context = setup()
      context.pointerStore.pointer = invalid
      await expectSafeFailure(context.plane.withActiveSecret({ secretRef: REF }, async () => undefined), 'secret_pointer_not_found')
    }

    const uncertain = setup()
    uncertain.pointerStore.failGetAfter = 1
    await expectSafeFailure(uncertain.plane.rotate({ secretRef: REF }, source()), 'secret_pointer_reconciliation_failed')
    expect(uncertain.store.material.has(`${REF}:${NEXT}`)).toBe(true)

    const committed = setup()
    committed.pointerStore.commitThenThrow = true
    await expect(committed.plane.rotate({ secretRef: REF }, source())).resolves.toMatchObject({
      activeGeneration: NEXT,
      pointerRevision: 2,
    })
  })

  it('fails closed if a material source escapes or generates an invalid generation identifier', async () => {
    const sourceFailure = setup()
    await expectSafeFailure(sourceFailure.plane.rotate({ secretRef: REF }, {
      withMaterial: async () => {
        throw new Error(CANARY)
      },
    }), 'secret_store_unavailable')
    expect(sourceFailure.store.events).toEqual([])

    const omittedSource = setup()
    await expectSafeFailure(omittedSource.plane.rotate({ secretRef: REF }, {
      withMaterial: async () => undefined,
    }), 'secret_store_unavailable')
    expect(omittedSource.store.events).toEqual([])

    const postCreateSourceFailure = setup()
    await expectSafeFailure(postCreateSourceFailure.plane.rotate({ secretRef: REF }, {
      withMaterial: async (operation) => {
        await withEphemeralSecretMaterial(new TextEncoder().encode(CANARY), operation)
        throw new Error(CANARY)
      },
    }), 'secret_store_unavailable')
    expect(postCreateSourceFailure.store.events).toEqual([`write:${NEXT}`, `delete:${NEXT}`])
    expect(postCreateSourceFailure.store.material.has(`${REF}:${NEXT}`)).toBe(false)

    const invalidGeneration = setup()
    const plane = new SecretPlane({
      store: invalidGeneration.store,
      pointerStore: invalidGeneration.pointerStore,
      validator: { validate: async () => true },
      randomUuid: () => 'forged-provider-generation',
    })
    await expectSafeFailure(plane.rotate({ secretRef: REF }, source()), 'invalid_secret_generation')
  })

  it('rejects a generated active-generation collision before write and never deletes active material', async () => {
    const context = setup()
    const plane = new SecretPlane({
      store: context.store,
      pointerStore: context.pointerStore,
      validator: { validate: async () => true },
      randomUuid: () => '11111111-1111-1111-1111-111111111111',
    })
    await expect(plane.rotate({ secretRef: REF }, source('replacement'))).rejects.toMatchObject({
      code: 'secret_generation_collision',
    })
    expect(context.store.events).toEqual([])
    expect(context.pointerStore.pointer).toEqual({ secretRef: REF, activeGeneration: FIRST, revision: 1 })
    expect(new TextDecoder().decode(context.store.material.get(`${REF}:${FIRST}`))).toBe('current')
  })

  it('retries an inactive-generation collision without deleting the concurrent or orphaned secret', async () => {
    const context = setup()
    context.store.material.set(`${REF}:${NEXT}`, new TextEncoder().encode('concurrent-orphan'))
    const generated = [
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ]
    const plane = new SecretPlane({
      store: context.store,
      pointerStore: context.pointerStore,
      validator: { validate: async () => true },
      randomUuid: () => generated.shift()!,
    })

    await expect(plane.rotate({ secretRef: REF }, source('replacement'))).resolves.toMatchObject({
      activeGeneration: THIRD,
    })
    expect(new TextDecoder().decode(context.store.material.get(`${REF}:${NEXT}`))).toBe('concurrent-orphan')
    expect(context.store.material.has(`${REF}:${THIRD}`)).toBe(true)
  })

  it('accepts exactly one material-source callback and cleans only its proven creation', async () => {
    const context = setup()
    const plane = new SecretPlane({
      store: context.store,
      pointerStore: context.pointerStore,
      validator: { validate: async () => true },
      randomUuid: () => '00000000-0000-4000-8000-000000000002',
    })
    await expectSafeFailure(plane.rotate({ secretRef: REF }, {
      withMaterial: async (operation) => {
        await withEphemeralSecretMaterial(new TextEncoder().encode('first'), operation)
        await withEphemeralSecretMaterial(new TextEncoder().encode('second'), operation)
      },
    }), 'secret_store_unavailable')
    expect(context.store.events).toEqual([`write:${NEXT}`, `delete:${NEXT}`])
    expect(context.store.material.has(`${REF}:${NEXT}`)).toBe(false)
  })
})
