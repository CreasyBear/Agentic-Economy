import { describe, expect, it } from 'vitest'

import {
  SecretPlane,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type SecretGenerationValidator,
  type SecretPointer,
  type SecretPointerAdvanceRequest,
  type SecretPointerStore,
  type SecretStore,
} from '../../src/modules/secrets/public'

class ContractPointerStore implements SecretPointerStore {
  readonly pointers = new Map<string, SecretPointer>()

  async getActive(ref: SecretPointer['secretRef']): Promise<SecretPointer | undefined> {
    return this.pointers.get(ref)
  }

  async advanceActive(request: SecretPointerAdvanceRequest): Promise<void> {
    const current = this.pointers.get(request.secretRef)
    if (
      current === undefined ||
      current.activeGeneration !== request.expectedActiveGeneration ||
      current.revision !== request.expectedRevision
    ) {
      throw new Error('stale pointer')
    }
    const advanced = Object.freeze({
      secretRef: request.secretRef,
      activeGeneration: request.newGeneration,
      revision: current.revision + 1,
    })
    this.pointers.set(request.secretRef, advanced)
  }
}

class ContractSecretStore implements SecretStore {
  readonly material = new Map<string, Uint8Array>()

  async withSecret(target: { secretRef: SecretPointer['secretRef']; generation: SecretPointer['activeGeneration'] }, operation: Parameters<SecretStore['withSecret']>[1]): Promise<void> {
    const value = this.material.get(`${target.secretRef}:${target.generation}`)
    if (value === undefined) throw new Error('vault unavailable')
    await withEphemeralSecretMaterial(value, operation)
  }

  async putGeneration(target: { secretRef: SecretPointer['secretRef']; generation: SecretPointer['activeGeneration'] }, material: Parameters<SecretStore['putGeneration']>[1]): Promise<void> {
    await material.useUtf8(async (value) => {
      this.material.set(`${target.secretRef}:${target.generation}`, new TextEncoder().encode(value))
    })
  }

  async deleteGeneration(target: { secretRef: SecretPointer['secretRef']; generation: SecretPointer['activeGeneration'] }): Promise<void> {
    this.material.delete(`${target.secretRef}:${target.generation}`)
  }
}

describe('P2-04 Infisical secret-plane contract', () => {
  it('retrieves only the canonical generation JIT and advances rotation only after validation', async () => {
    const ref = secretRef('sec_00000000000000000000000000000001')
    const first = secretGeneration('sgn_00000000000000000000000000000001')
    const next = secretGeneration('sgn_00000000000040008000000000000002')
    const pointers = new ContractPointerStore()
    pointers.pointers.set(ref, Object.freeze({ secretRef: ref, activeGeneration: first, revision: 1 }))
    const store = new ContractSecretStore()
    store.material.set(`${ref}:${first}`, new TextEncoder().encode('initial-canary'))
    const validator: SecretGenerationValidator = {
      validate: async (_target, lease) => {
        let valid = false
        await lease.useUtf8(async (value) => {
          valid = value === 'rotated-canary'
        })
        return valid
      },
    }
    const plane = new SecretPlane({
      store,
      pointerStore: pointers,
      validator,
      randomUuid: () => '00000000-0000-4000-8000-000000000002',
    })

    let matchedActiveGeneration = false
    await plane.withActiveSecret({ secretRef: ref }, async (lease) => {
      await lease.useUtf8(async (value) => {
        matchedActiveGeneration = value === 'initial-canary'
      })
    })
    expect(matchedActiveGeneration).toBe(true)

    const rotated = await plane.rotate({ secretRef: ref }, {
      withMaterial: async (operation) => await withEphemeralSecretMaterial(
        new TextEncoder().encode('rotated-canary'),
        operation,
      ),
    })
    expect(rotated).toEqual({
      secretRef: ref,
      previousGeneration: first,
      activeGeneration: next,
      pointerRevision: 2,
    })
    expect(JSON.stringify(rotated)).not.toContain('rotated-canary')
  })
})
