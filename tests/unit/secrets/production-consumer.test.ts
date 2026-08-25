import { describe, expect, it, vi } from 'vitest'

import {
  createScopedSecretConsequenceRuntime,
  ProductionSecretGenerationValidator,
  SecretPlane,
  SecretPlaneError,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type SecretPointerStore,
  type SecretStore,
  type SecretMaterialLease,
  type SecretTarget,
} from '../../../src/modules/secrets/public'

const REF = secretRef('sec_11111111111111111111111111111111')
const GENERATION = secretGeneration('sgn_11111111111111111111111111111111')
const OTHER_REF = secretRef('sec_22222222222222222222222222222222')
const OTHER_GENERATION = secretGeneration('sgn_22222222222222222222222222222222')
const TARGET: SecretTarget = Object.freeze({ secretRef: REF, generation: GENERATION })
const CANARY = 'production-validator-canary'

function consequencePlane(material: string): SecretPlane {
  const store: SecretStore = {
    withSecret: async (_target, operation) => {
      await withEphemeralSecretMaterial(new TextEncoder().encode(material), operation)
    },
    createGeneration: async () => ({ kind: 'already-exists' }),
  }
  const pointerStore: SecretPointerStore = {
    getActive: async (ref) => ({ secretRef: ref, activeGeneration: GENERATION, revision: 1 }),
    advanceActive: async () => undefined,
  }
  return new SecretPlane({
    store,
    pointerStore,
    validator: { validate: async () => false },
  })
}

describe('production secret consumer integration', () => {
  it('validator accepts only a probe that consumes the exact callback-scoped generation', async () => {
    const observed: string[] = []
    const validator = new ProductionSecretGenerationValidator({
      validate: async (target, lease) => {
        expect(target).toEqual(TARGET)
        expect(lease.byteLength).toBe(CANARY.length)
        await lease.useBytes(async (bytes) => {
          observed.push(new TextDecoder().decode(bytes))
        })
      },
    })

    let captured: Uint8Array | undefined
    await withEphemeralSecretMaterial(new TextEncoder().encode(CANARY), async (lease) => {
      await lease.useBytes(async (bytes) => {
        captured = bytes
      })
      await expect(validator.validate(TARGET, lease)).resolves.toBe(true)
    })

    expect(observed).toEqual([CANARY])
    expect(captured).toBeDefined()
    expect([...captured!].every((byte) => byte === 0)).toBe(true)
  })

  it.each([
    ['probe never consumes the lease', async (_target: SecretTarget, _lease: SecretMaterialLease) => undefined],
    ['probe throws a canary-bearing error', async () => { throw new Error(CANARY) }],
    ['probe consumes the lease twice', async (_target: SecretTarget, lease: SecretMaterialLease) => {
      await lease.useBytes(async () => undefined)
      await lease.useBytes(async () => undefined)
    }],
  ])('validator fails closed when %s', async (_description, validate) => {
    const validator = new ProductionSecretGenerationValidator({ validate })
    await withEphemeralSecretMaterial(new TextEncoder().encode(CANARY), async (lease) => {
      await expect(validator.validate(TARGET, lease)).resolves.toBe(false)
    })
  })

  it('validator rejects malformed canonical targets before invoking the production probe', async () => {
    const validate = vi.fn(async () => undefined)
    const validator = new ProductionSecretGenerationValidator({ validate })
    await withEphemeralSecretMaterial(new TextEncoder().encode(CANARY), async (lease) => {
      await expect(validator.validate({
        secretRef: 'provider-owned-ref' as typeof OTHER_REF,
        generation: OTHER_GENERATION,
      }, lease)).resolves.toBe(false)
      await expect(validator.validate({
        secretRef: OTHER_REF,
        generation: 'provider-generation' as typeof OTHER_GENERATION,
      }, lease)).resolves.toBe(false)
    })
    expect(validate).not.toHaveBeenCalled()
  })

  it('consequence runtime fixes vault scope at composition and discards callback returns', async () => {
    const runtime = createScopedSecretConsequenceRuntime({
      platform: consequencePlane('platform-material'),
      customer: consequencePlane('customer-material'),
    })
    let captured: Uint8Array | undefined

    const result = await runtime.customer.execute({ secretRef: REF }, async (lease) => {
      await lease.useBytes(async (bytes) => {
        captured = bytes
        expect(new TextDecoder().decode(bytes)).toBe('customer-material')
        return CANARY as never
      })
      return CANARY as never
    })

    expect(result).toBeUndefined()
    expect(captured).toBeDefined()
    expect([...captured!].every((byte) => byte === 0)).toBe(true)
    expect(Object.keys(runtime).sort()).toEqual(['customer', 'platform'])
  })

  it('consequence runtime fails closed on malformed refs and sanitizes callback failures', async () => {
    const runtime = createScopedSecretConsequenceRuntime({
      platform: consequencePlane('platform-material'),
      customer: consequencePlane('customer-material'),
    })
    await expect(runtime.customer.execute({ secretRef: 'provider-key' }, async () => undefined))
      .rejects.toEqual(new SecretPlaneError('invalid_secret_ref'))
    await expect(runtime.platform.execute({ secretRef: REF }, async () => {
      throw new Error(CANARY)
    })).rejects.toEqual(new SecretPlaneError('secret_operation_failed'))
  })
})
