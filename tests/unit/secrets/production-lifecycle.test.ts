import { describe, expect, it, vi } from 'vitest'

import {
  ProductionSecretLifecycleService,
  secretGeneration,
  secretRef,
  withEphemeralSecretMaterial,
  type SecretGeneration,
  type SecretGenerationCreation,
  type SecretGenerationValidator,
  type SecretLifecycleJournal,
  type SecretLifecycleRecord,
  type SecretMaterialLease,
  type SecretMaterialSource,
  type SecretPointer,
  type SecretPointerControl,
  type SecretStore,
  type SecretTarget,
} from '../../../src/modules/secrets/public'

const REF = secretRef('sec_11111111111111111111111111111111')
const FIRST = secretGeneration('sgn_11111111111111111111111111111111')
const NEXT = secretGeneration('sgn_22222222222242228222222222222222')

class DurableJournal implements SecretLifecycleJournal {
  readonly records = new Map<string, SecretLifecycleRecord>()

  async getByIdempotency(idempotencyRef: string): Promise<SecretLifecycleRecord | undefined> {
    return this.records.get(idempotencyRef)
  }

  async insertPrepared(record: SecretLifecycleRecord): Promise<void> {
    if (this.records.has(record.idempotencyRef)) throw new Error('journal_conflict')
    this.records.set(record.idempotencyRef, structuredClone(record))
  }

  async replace(record: SecretLifecycleRecord, expectedState: SecretLifecycleRecord['state']): Promise<void> {
    if (this.records.get(record.idempotencyRef)?.state !== expectedState) throw new Error('journal_conflict')
    this.records.set(record.idempotencyRef, structuredClone(record))
  }
}

class PointerControl implements SecretPointerControl {
  pointer: SecretPointer | undefined = { secretRef: REF, activeGeneration: FIRST, revision: 1 }

  async getActive(): Promise<SecretPointer | undefined> {
    return this.pointer
  }

  async initializeActive(target: SecretTarget): Promise<void> {
    if (this.pointer !== undefined) throw new Error('pointer_exists')
    this.pointer = { secretRef: target.secretRef, activeGeneration: target.generation, revision: 1 }
  }

  async advanceActive(request: {
    secretRef: typeof REF
    expectedActiveGeneration: SecretGeneration
    expectedRevision: number
    newGeneration: SecretGeneration
  }): Promise<void> {
    if (this.pointer?.activeGeneration !== request.expectedActiveGeneration
      || this.pointer.revision !== request.expectedRevision) throw new Error('pointer_conflict')
    this.pointer = {
      secretRef: request.secretRef,
      activeGeneration: request.newGeneration,
      revision: request.expectedRevision + 1,
    }
  }
}

function fixture(overrides: Readonly<{
  pointer?: PointerControl
  create?: (target: SecretTarget, material: SecretMaterialLease) => Promise<SecretGenerationCreation>
  withSecret?: SecretStore['withSecret']
  validate?: SecretGenerationValidator['validate']
  journal?: DurableJournal
  now?: () => number
  randomUuid?: () => string
}> = {}) {
  const pointer = overrides.pointer ?? new PointerControl()
  const journal = overrides.journal ?? new DurableJournal()
  const events: string[] = []
  const store: SecretStore = {
    withSecret: overrides.withSecret ?? (async (target, operation) => {
      events.push(`read:${target.generation}`)
      await withEphemeralSecretMaterial(Uint8Array.from([7, 8, 9]), operation)
    }),
    createGeneration: overrides.create ?? (async (target) => {
      events.push(`write:${target.generation}`)
      return { kind: 'created', discard: async () => { events.push(`discard:${target.generation}`) } }
    }),
  }
  const validator: SecretGenerationValidator = {
    validate: overrides.validate ?? (async (target) => {
      events.push(`validate:${target.generation}`)
      return true
    }),
  }
  const service = new ProductionSecretLifecycleService({
    store,
    pointerControl: pointer,
    validator,
    journal,
    now: overrides.now ?? (() => 1_000),
    randomUuid: overrides.randomUuid ?? (() => '22222222-2222-4222-8222-222222222222'),
  })
  const materialSource: SecretMaterialSource = {
    withMaterial: async (operation) => await withEphemeralSecretMaterial(Uint8Array.from([1, 2, 3]), operation),
  }
  return { events, journal, materialSource, pointer, service }
}

describe('production secret lifecycle', () => {
  it('advances only after validation', async () => {
    const subject = fixture()
    const result = await subject.service.rotate({
      secretRef: REF,
      idempotencyRef: 'secret:rotate:one',
      materialSource: subject.materialSource,
    })

    expect(subject.events).toEqual([`write:${NEXT}`, `read:${NEXT}`, `validate:${NEXT}`])
    expect(subject.pointer.pointer).toEqual({ secretRef: REF, activeGeneration: NEXT, revision: 2 })
    expect(result).toEqual({
      operationRef: 'sop_22222222222242228222222222222222',
      secretRef: REF,
      activeGeneration: NEXT,
      pointerRevision: 2,
      state: 'active',
    })
  })

  it('keeps ambiguous external effects durable and never blindly retries them', async () => {
    let writes = 0
    const subject = fixture({
      create: async () => {
        writes += 1
        throw new Error('transport_closed_after_request')
      },
    })
    const request = {
      secretRef: REF,
      idempotencyRef: 'secret:rotate:ambiguous',
      materialSource: subject.materialSource,
    }

    await expect(subject.service.rotate(request)).rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })
    await expect(subject.service.rotate(request)).rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })
    await expect(subject.service.reconcile({ idempotencyRef: request.idempotencyRef }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })

    expect(writes).toBe(1)
    expect(subject.journal.records.get(request.idempotencyRef)).toMatchObject({
      state: 'external_effect_unknown',
      previousGeneration: FIRST,
      targetGeneration: NEXT,
    })
    expect(subject.pointer.pointer).toEqual({ secretRef: REF, activeGeneration: FIRST, revision: 1 })
  })

  it('provisions an absent pointer after the provider generation validates', async () => {
    const pointer = new PointerControl()
    pointer.pointer = undefined
    const subject = fixture({ pointer })

    const result = await subject.service.provision({
      secretRef: REF,
      idempotencyRef: 'secret:provision:one',
      materialSource: subject.materialSource,
    })

    expect(subject.events).toEqual([`write:${NEXT}`, `read:${NEXT}`, `validate:${NEXT}`])
    expect(result).toMatchObject({ activeGeneration: NEXT, pointerRevision: 1, state: 'active' })
    expect(subject.pointer.pointer).toEqual({ secretRef: REF, activeGeneration: NEXT, revision: 1 })
  })

  it('fails closed on validation and never persists or returns secret material', async () => {
    const subject = fixture({ validate: async () => false })
    const request = {
      secretRef: REF,
      idempotencyRef: 'secret:rotate:invalid-generation',
      materialSource: subject.materialSource,
    }

    await expect(subject.service.rotate(request))
      .rejects.toMatchObject({ code: 'secret_lifecycle_validation_failed' })
    await expect(subject.service.rotate(request))
      .rejects.toMatchObject({ code: 'secret_lifecycle_validation_failed' })

    const record = subject.journal.records.get(request.idempotencyRef)
    expect(record).toMatchObject({ state: 'failed_validation', previousGeneration: FIRST })
    expect(subject.events).toEqual([`write:${NEXT}`, `read:${NEXT}`, `discard:${NEXT}`])
    expect(subject.pointer.pointer).toEqual({ secretRef: REF, activeGeneration: FIRST, revision: 1 })
    expect(JSON.stringify({ record })).not.toMatch(/1,2,3|7,8,9|material|credential|token/i)
  })

  it('reconciles a committed pointer after an ambiguous receipt and returns exact replays without new writes', async () => {
    class CommitThenThrowPointer extends PointerControl {
      override async advanceActive(request: Parameters<PointerControl['advanceActive']>[0]): Promise<void> {
        await super.advanceActive(request)
        throw new Error('receipt_lost')
      }
    }
    const subject = fixture({ pointer: new CommitThenThrowPointer() })
    const request = { secretRef: REF, idempotencyRef: 'secret:rotate:lost-receipt', materialSource: subject.materialSource }
    await expect(subject.service.rotate(request)).rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })
    await expect(subject.service.reconcile({ idempotencyRef: request.idempotencyRef }))
      .resolves.toMatchObject({ activeGeneration: NEXT, pointerRevision: 2 })
    await expect(subject.service.rotate(request)).resolves.toMatchObject({ activeGeneration: NEXT })
    await expect(subject.service.reconcile({ idempotencyRef: request.idempotencyRef }))
      .resolves.toMatchObject({ activeGeneration: NEXT })
    expect(subject.events.filter((event) => event.startsWith('write:'))).toHaveLength(1)
  })

  it('rejects pointer, replay, collision, identifier, clock and UUID corruption conservatively', async () => {
    const existing = fixture()
    await expect(existing.service.provision({ secretRef: REF, idempotencyRef: 'secret:existing', materialSource: existing.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })

    const absentPointer = new PointerControl(); absentPointer.pointer = undefined
    const absent = fixture({ pointer: absentPointer })
    await expect(absent.service.rotate({ secretRef: REF, idempotencyRef: 'secret:absent', materialSource: absent.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })

    const collision = fixture({ create: async () => ({ kind: 'already-exists' }) })
    const collisionRequest = { secretRef: REF, idempotencyRef: 'secret:collision', materialSource: collision.materialSource }
    await expect(collision.service.rotate(collisionRequest)).rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    await expect(collision.service.rotate(collisionRequest)).rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    await expect(collision.service.provision(collisionRequest)).rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })

    await expect(existing.service.rotate({ secretRef: REF, idempotencyRef: '', materialSource: existing.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_invalid' })
    await expect(existing.service.reconcile({ idempotencyRef: '' })).rejects.toMatchObject({ code: 'secret_lifecycle_invalid' })
    await expect(existing.service.reconcile({ idempotencyRef: 'missing' })).rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    const badClock = fixture({ now: () => -1 })
    await expect(badClock.service.rotate({ secretRef: REF, idempotencyRef: 'secret:bad-clock', materialSource: badClock.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_invalid' })
    const badGeneration = fixture({ randomUuid: () => 'bad' })
    await expect(badGeneration.service.rotate({ secretRef: REF, idempotencyRef: 'secret:bad-generation', materialSource: badGeneration.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_invalid' })
    let calls = 0
    const badOperation = fixture({ randomUuid: () => ++calls === 1 ? '22222222-2222-4222-8222-222222222222' : 'bad' })
    await expect(badOperation.service.rotate({ secretRef: REF, idempotencyRef: 'secret:bad-operation', materialSource: badOperation.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_invalid' })
  })

  it('preserves terminal validation and pointer conflicts during reconciliation', async () => {
    const invalid = fixture({
      validate: async () => false,
      create: async () => ({ kind: 'created', discard: async () => { throw new Error('cleanup_unknown') } }),
    })
    const invalidRequest = { secretRef: REF, idempotencyRef: 'secret:invalid-terminal', materialSource: invalid.materialSource }
    await expect(invalid.service.rotate(invalidRequest)).rejects.toMatchObject({ code: 'secret_lifecycle_validation_failed' })
    await expect(invalid.service.reconcile({ idempotencyRef: invalidRequest.idempotencyRef }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_validation_failed' })

    const ambiguous = fixture({ create: async () => { throw new Error('unknown') } })
    const ambiguousRequest = { secretRef: REF, idempotencyRef: 'secret:pointer-conflict', materialSource: ambiguous.materialSource }
    await expect(ambiguous.service.rotate(ambiguousRequest)).rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })
    ambiguous.pointer.pointer = { secretRef: REF, activeGeneration: secretGeneration('sgn_33333333333343338333333333333333'), revision: 2 }
    await expect(ambiguous.service.reconcile({ idempotencyRef: ambiguousRequest.idempotencyRef }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    await expect(ambiguous.service.reconcile({ idempotencyRef: ambiguousRequest.idempotencyRef }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
  })

  it('uses safe defaults and converts read, validation, CAS and journal ambiguity to non-sensitive errors', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const uuid = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('22222222-2222-4222-8222-222222222222')
    const base = fixture()
    const defaults = new ProductionSecretLifecycleService({
      store: { createGeneration: async () => ({ kind: 'already-exists' }), withSecret: async () => undefined },
      pointerControl: base.pointer,
      validator: { validate: async () => true }, journal: base.journal,
    })
    await expect(defaults.rotate({ secretRef: REF, idempotencyRef: 'secret:defaults', materialSource: base.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
    clock.mockRestore(); uuid.mockRestore()

    const unavailable = fixture({ withSecret: async () => { throw new Error('vault_down') } })
    await expect(unavailable.service.rotate({ secretRef: REF, idempotencyRef: 'secret:vault-down', materialSource: unavailable.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })

    const journal = new DurableJournal()
    journal.replace = async () => { throw new Error('journal_down') }
    const journalFailure = fixture({ journal, validate: async () => false })
    await expect(journalFailure.service.rotate({ secretRef: REF, idempotencyRef: 'secret:journal-down', materialSource: journalFailure.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })
  })

  it('handles provision validation, external ambiguity and malformed pointer post-state', async () => {
    const invalidPointer = new PointerControl(); invalidPointer.pointer = undefined
    const invalid = fixture({ pointer: invalidPointer, validate: async () => false })
    await expect(invalid.service.provision({ secretRef: REF, idempotencyRef: 'secret:provision-invalid', materialSource: invalid.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_validation_failed' })

    const unknownPointer = new PointerControl(); unknownPointer.pointer = undefined
    const unknown = fixture({ pointer: unknownPointer, create: async () => { throw new Error('unknown') } })
    await expect(unknown.service.provision({ secretRef: REF, idempotencyRef: 'secret:provision-unknown', materialSource: unknown.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })
    await expect(unknown.service.reconcile({ idempotencyRef: 'secret:provision-unknown' }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })
    unknown.pointer.getActive = async () => { throw new Error('pointer_read_down') }
    await expect(unknown.service.reconcile({ idempotencyRef: 'secret:provision-unknown' }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_ambiguous' })

    class MalformedPointer extends PointerControl {
      override async initializeActive(target: SecretTarget): Promise<void> {
        this.pointer = { secretRef: target.secretRef, activeGeneration: FIRST, revision: 1 }
      }
    }
    const malformedPointer = new MalformedPointer(); malformedPointer.pointer = undefined
    const malformed = fixture({ pointer: malformedPointer })
    await expect(malformed.service.provision({ secretRef: REF, idempotencyRef: 'secret:provision-malformed', materialSource: malformed.materialSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })

    const repeated = fixture()
    const repeatedSource: SecretMaterialSource = {
      withMaterial: async (operation) => {
        await withEphemeralSecretMaterial(Uint8Array.from([1]), operation)
        await withEphemeralSecretMaterial(Uint8Array.from([2]), operation)
      },
    }
    await expect(repeated.service.rotate({ secretRef: REF, idempotencyRef: 'secret:repeated-source', materialSource: repeatedSource }))
      .rejects.toMatchObject({ code: 'secret_lifecycle_conflict' })
  })
})
