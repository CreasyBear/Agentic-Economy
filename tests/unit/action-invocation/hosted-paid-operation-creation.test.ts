import { describe, expect, it } from 'vitest'

import {
  createHostedPaidOperation,
  type HostedPaidOperationCreationRecord,
} from '@/modules/action-invocation/hosted-paid-operation-creation'

describe('hosted paid-operation creation', () => {
  it('admits only an evaluator fixture selector and binds server-owned consequence facts', async () => {
    const saved: HostedPaidOperationCreationRecord[] = []
    const service = fixtureService(saved)

    await expect(service.create({
      actor: { principalRef: 'principal:evaluator', callerRef: 'caller:session' },
      setup: { providerKey: 'A' },
    })).resolves.toMatchObject({
      kind: 'created',
      record: {
        providerKey: 'A',
        provider: {
          providerId: 'provider:a',
          amount: { currency: 'USD', amountMinor: 1 },
          recipient: 'recipient:a',
          endpoint: 'https://mock-a.invalid/btc-usd',
        },
        materialInput: { symbol: 'BTC', convert: 'USD' },
      },
    })
    expect(saved).toHaveLength(1)
    expect(saved[0]?.authorityRef).toBeTruthy()
    expect(saved[0]?.provider).toEqual(expect.objectContaining({ providerId: 'provider:a' }))

    await expect(service.create({
      actor: { principalRef: 'principal:not-admitted', callerRef: 'caller:session' },
      setup: { providerKey: 'A' },
    })).resolves.toEqual({ kind: 'refused', code: 'principal_not_allowlisted' })
    await expect(service.create({
      actor: { principalRef: 'principal:evaluator', callerRef: 'caller:session' },
      setup: { providerKey: 'A', amount: 0 } as never,
    })).resolves.toEqual({ kind: 'refused', code: 'setup_shape_invalid' })
  })

  it('creates four distinct consequence identities only after safe terminal truth', async () => {
    const saved: HostedPaidOperationCreationRecord[] = []
    const service = fixtureService(saved)
    const first = await service.create({
      actor: { principalRef: 'principal:evaluator', callerRef: 'caller:session' },
      setup: { providerKey: 'A' },
    })
    expect(first.kind).toBe('created')
    if (first.kind !== 'created') return

    await expect(service.switchProvider({
      actor: first.record.actor,
      previous: { ...first.record, terminalTruth: 'uncertain' },
      setup: { providerKey: 'B' },
    })).resolves.toEqual({ kind: 'refused', code: 'provider_switch_not_safe' })
    expect(saved).toHaveLength(1)

    const switched = await service.switchProvider({
      actor: first.record.actor,
      previous: { ...first.record, terminalTruth: 'safely_terminal' },
      setup: { providerKey: 'B' },
    })
    expect(switched.kind).toBe('created')
    if (switched.kind !== 'created') return
    expect([
      switched.record.invocationRef,
      switched.record.authorityRef,
      switched.record.paymentIdentifier,
      switched.record.effectIdentity,
    ]).not.toEqual(expect.arrayContaining([
      first.record.invocationRef,
      first.record.authorityRef,
      first.record.paymentIdentifier,
      first.record.effectIdentity,
    ]))
  })
})

function fixtureService(saved: HostedPaidOperationCreationRecord[]) {
  let sequence = 0
  let boundProvider: string | undefined
  return createHostedPaidOperation({
    reserveAdmission: async ({ principalRef }) => principalRef === 'principal:evaluator'
      ? { kind: 'admitted', reservationRef: 'reservation:1' }
      : { kind: 'refused', code: 'principal_not_allowlisted' },
    resolveProvider: (key) => ({
      A: {
        providerId: 'provider:a',
        sourceRef: 'source:a',
        recipient: 'recipient:a',
        endpoint: 'https://mock-a.invalid/btc-usd',
        operationKey: 'btc-usd-a',
        operationRevision: '1',
      },
      B: {
        providerId: 'provider:b',
        sourceRef: 'source:b',
        recipient: 'recipient:b',
        endpoint: 'https://mock-b.invalid/btc-usd',
        operationKey: 'btc-usd-b',
        operationRevision: '2',
      },
    })[key],
    persistProviderBinding: async ({ provider }) => { boundProvider = provider.providerId },
    nextIdentity: (kind) => `${kind}:${++sequence}`,
    persistCreated: async (record) => {
      expect(boundProvider).toBe(record.provider.providerId)
      saved.push(record)
    },
  })
}
