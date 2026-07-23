import { describe, expect, it } from 'vitest'

import {
  createHostedPaidOperation,
  type HostedPaidOperationCreationRecord,
} from '@/modules/action-invocation/hosted-paid-operation-creation'
import type { HostedPaidOperationAggregate } from '@/modules/action-invocation/hosted-paid-operation-port'
import type { ActionResult } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'

type Result = ActionResult & { ok: boolean }

describe('hosted paid-operation creation', () => {
  it('admits only an evaluator fixture selector and binds server-owned consequence facts', async () => {
    const saved: HostedPaidOperationCreationRecord[] = []
    const aggregates: HostedPaidOperationAggregate<Result>[] = []
    const service = fixtureService(saved, aggregates)

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
    expect(aggregates).toHaveLength(1)
    expect(aggregates[0]).toMatchObject({
      header: { selectedSourceRef: 'source:a' },
      invocation: {
        invocationVersion: 1,
        control: { state: 'awaiting_authority' },
        attempts: [],
      },
      interpretation: {
        operation: {
          providerId: 'provider:a',
          materialInputs: { symbol: 'BTC', convert: 'USD' },
        },
      },
    })
    expect(saved[0]?.authorityRef).toBeTruthy()
    expect(saved[0]?.provider).toEqual(expect.objectContaining({ providerId: 'provider:a' }))
    const proposal = (saved[0] as HostedPaidOperationCreationRecord & Readonly<{
      paymentProposal?: Readonly<Record<string, unknown> & { proposalDigest: string }>
    }> | undefined)?.paymentProposal
    expect(proposal).toMatchObject({
      paymentIdentifier: saved[0]?.paymentIdentifier,
      providerId: 'provider:a',
      operationKey: 'btc-usd-a',
      operationRevision: '1',
      providerEndpoint: 'https://mock-a.invalid/btc-usd',
      scheme: 'exact',
      network: 'eip155:84532',
      asset: 'USDC',
      payTo: 'recipient:a',
      amount: '0.01',
    })
    if (proposal === undefined) throw new Error('source_owned_payment_proposal_missing')
    const { proposalDigest, ...material } = proposal
    expect(proposalDigest).toBe(canonicalDigest(material as never))

    await expect(service.create({
      actor: { principalRef: 'principal:not-admitted', callerRef: 'caller:session' },
      setup: { providerKey: 'A' },
    })).resolves.toEqual({ kind: 'refused', code: 'principal_not_allowlisted' })
    await expect(service.create({
      actor: { principalRef: 'principal:evaluator', callerRef: 'caller:session' },
      setup: { providerKey: 'A', amount: 0 } as never,
    })).resolves.toEqual({ kind: 'refused', code: 'setup_shape_invalid' })
    await expect(service.create({
      actor: { principalRef: 'principal:evaluator', callerRef: 'caller:session' },
      setup: {
        providerKey: 'A',
        paymentProposal: { providerEndpoint: 'https://caller.invalid' },
      } as never,
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

function fixtureService(
  saved: HostedPaidOperationCreationRecord[],
  aggregates: HostedPaidOperationAggregate<Result>[] = [],
) {
  let sequence = 0
  let createCalls = 0
  return createHostedPaidOperation<Result>({
    reserveAdmission: async ({ principalRef }) => principalRef === 'principal:evaluator'
      ? { kind: 'admitted', reservationRef: 'reservation:1' }
      : { kind: 'refused', code: 'principal_not_allowlisted' },
    resolveProvider: (key) => ({
      A: {
        providerId: 'provider:a',
        providerName: 'Provider A',
        sourceRef: 'source:a',
        recipient: 'recipient:a',
        endpoint: 'https://mock-a.invalid/btc-usd',
        operationKey: 'btc-usd-a',
        operationRevision: '1',
      },
      B: {
        providerId: 'provider:b',
        providerName: 'Provider B',
        sourceRef: 'source:b',
        recipient: 'recipient:b',
        endpoint: 'https://mock-b.invalid/btc-usd',
        operationKey: 'btc-usd-b',
        operationRevision: '2',
      },
    })[key],
    nextIdentity: (kind) => `${kind}:${++sequence}`,
    createInitial: async ({ record, aggregate }) => {
      createCalls += 1
      expect(createCalls).toBe(saved.length + 1)
      expect(aggregate.header.selectedSourceRef).toBe(record.provider.sourceRef)
      saved.push(record)
      aggregates.push(aggregate)
      return { kind: 'created' }
    },
  })
}
