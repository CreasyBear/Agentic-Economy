import { describe, expect, it } from 'vitest'

import {
  createHostedSandboxEffectAdapter,
  type HostedSandboxEffectRecord,
} from '@/modules/action-invocation/hosted-sandbox-effect-adapter'

const prepared: HostedSandboxEffectRecord = {
  invocationRef: 'invocation:1',
  attemptRef: 'attempt:1',
  effectGeneration: 1,
  paymentIdentifier: 'payment:1',
  operationKey: 'btc-usd-a',
  operationRevision: '1',
  challengeDigest: 'sha256:challenge',
  providerEndpoint: 'https://mock-a.invalid/btc-usd',
  scheme: 'exact',
  network: 'eip155:84532',
  asset: 'USDC',
  payTo: 'recipient:a',
  amount: '0.01',
  authorizationDigest: 'sha256:authorization',
  custodyRef: `sha256:${'a'.repeat(64)}`,
  state: 'prepared',
  preparedAt: 1,
  evidenceRefs: [],
}

describe('hosted sandbox custody effect adapter', () => {
  it('persists prepared and submission-started before one labelled mock release', async () => {
    const tape: string[] = []
    const records = new Map<string, HostedSandboxEffectRecord>()
    const adapter = createHostedSandboxEffectAdapter({
      prepareCustody: async () => {
        tape.push('custody-prepared')
        return { record: prepared, authorizationMaterial: 'raw-secret-payment' }
      },
      readPreparedCustody: async () => 'raw-secret-payment',
      persist: async (record) => {
        expect(JSON.stringify(record)).not.toContain('raw-secret-payment')
        records.set('effect', record)
        tape.push(`persisted:${record.state}`)
      },
      load: async () => records.get('effect'),
      releaseLabelledMock: async () => {
        tape.push('mock-release')
        return { kind: 'observed', evidenceRefs: [`sha256:${'b'.repeat(64)}`] }
      },
      now: () => 2,
    })

    await expect(adapter.execute()).resolves.toMatchObject({ kind: 'observed' })
    expect(tape).toEqual([
      'custody-prepared',
      'persisted:prepared',
      'persisted:possibly_submitted',
      'mock-release',
      'persisted:observed',
    ])
    expect(adapter.counters()).toEqual({
      prepared: 1,
      submissionStarted: 1,
      mockRelease: 1,
      result: 1,
      uncertainty: 0,
      duplicateOrStaleRefusal: 0,
      unexpectedEffect: 0,
    })
  })

  it('reconstructs possible submission after a crash and never replays release', async () => {
    let durable: HostedSandboxEffectRecord | undefined
    let releases = 0
    const dependencies = {
      prepareCustody: async () => ({
        record: prepared,
        authorizationMaterial: 'raw-secret-payment',
      }),
      readPreparedCustody: async () => 'raw-secret-payment',
      persist: async (record: HostedSandboxEffectRecord) => { durable = record },
      load: async () => durable,
      releaseLabelledMock: async () => {
        releases += 1
        throw new Error('mock_lost_response')
      },
      now: () => 2,
    }
    const first = createHostedSandboxEffectAdapter(dependencies)
    await expect(first.execute()).resolves.toEqual({
      kind: 'uncertain',
      record: expect.objectContaining({ state: 'reconciliation_required' }),
    })
    expect(releases).toBe(1)

    const restored = createHostedSandboxEffectAdapter(dependencies)
    await expect(restored.execute()).resolves.toEqual({
      kind: 'refused',
      code: 'reconciliation_required',
      record: expect.objectContaining({ state: 'reconciliation_required' }),
    })
    expect(releases).toBe(1)
  })
})
