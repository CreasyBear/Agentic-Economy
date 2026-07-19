import { describe, expect, it, vi } from 'vitest'

import {
  createRequestOwnedDevelopmentHost,
  createStandaloneAgentDevelopmentHost,
  type DynamicPublishedActionInvocationAdapter,
} from '@/modules/action-invocation'
import {
  buildDevelopmentHostParityEvidence,
  verifyDevelopmentHostParityEvidence,
  type DevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

describe('ADR-010 development host parity', () => {
  it('binds distinct host identity and lineage instead of accepting host-injected trust fields', () => {
    const prepare = vi.fn(() => ({ invocationRef: 'invocation:one' }))
    const decide = vi.fn(() => ({ kind: 'refused', code: 'invalid_control_state' }))
    const acquire = vi.fn(() => ({ kind: 'refused', code: 'invalid_control_state' }))
    const adapter = {
      prepare,
      decide,
      acquire,
      executeAcquired: vi.fn(),
      reconcile: vi.fn(),
      cancel: vi.fn(),
      inspect: vi.fn(),
      exportSnapshot: vi.fn(),
    } as unknown as DynamicPublishedActionInvocationAdapter
    const requestActor = { callerRef: 'human:request-owner', principalRef: 'principal:customer' }
    const agentActor = { callerRef: 'agent:external', principalRef: 'principal:customer' }
    const requestHost = createRequestOwnedDevelopmentHost({
      adapter, actor: requestActor, requestRef: 'request:existing', revision: 4,
    })
    const agentHost = createStandaloneAgentDevelopmentHost({ adapter, actor: agentActor })

    requestHost.prepare({ symbol: 'BTC', convert: 'USD' }, 1_000)
    agentHost.decide({
      invocationRef: 'invocation:one',
      expectedInvocationVersion: 1,
      authorityRef: 'authority:one',
      accept: true,
    })

    expect(prepare).toHaveBeenCalledWith({
      actor: requestActor,
      origin: { kind: 'request_owned', requestRef: 'request:existing', revision: 4 },
      value: { symbol: 'BTC', convert: 'USD' },
      freshnessMs: 1_000,
    })
    expect(decide).toHaveBeenCalledWith({
      actor: agentActor,
      origin: { kind: 'standalone', ...agentActor },
      invocationRef: 'invocation:one',
      expectedInvocationVersion: 1,
      authorityRef: 'authority:one',
      accept: true,
    })
  })

  it('reconstructs parity from durable snapshots and rejects coordinated tampering', async () => {
    const packet = await buildDevelopmentHostParityEvidence()
    expect(() => verifyDevelopmentHostParityEvidence(packet)).not.toThrow()
    expect(packet.hostReads[0].semanticRead.identity.callerRef)
      .not.toBe(packet.hostReads[1].semanticRead.identity.callerRef)
    expect(packet.hostReads[0].semanticRead.identity.principalRef)
      .toBe(packet.hostReads[1].semanticRead.identity.principalRef)
    expect(packet.effects).toEqual({ payment: 2, provider: 2 })
    expect(packet.dynamicEvidence.recovery).toMatchObject({
      uncertainty: 'reconciliation_required',
      retryBeforeReconcile: 'refused',
      staleWorker: 'refused',
      cancellation: 'unsupported',
      paymentEffects: 1,
      providerEffects: 1,
    })

    const identityAttack = clone(packet)
    identityAttack.dynamicEvidence.cases[0]!.snapshot.controls[0]!.control.owner.principalRef =
      'principal:attacker'
    redigestDynamic(identityAttack)
    redigestPacket(identityAttack)
    expect(() => verifyDevelopmentHostParityEvidence(identityAttack))
      .toThrow('dynamic_published_snapshot_semantics_invalid')

    const materialAttack = clone(packet)
    ;(materialAttack.dynamicEvidence.cases[0]!.snapshot.sourceRows[0]!.operation as any)
      .identity.endpoint.method = 'POST'
    redigestDynamic(materialAttack)
    redigestPacket(materialAttack)
    expect(() => verifyDevelopmentHostParityEvidence(materialAttack))
      .toThrow('dynamic_published_snapshot_semantics_invalid')

    const generationAttack = clone(packet)
    generationAttack.dynamicEvidence.cases[1]!.snapshot.attempts[0]!.rows[0]!.effectGeneration = 9
    redigestDynamic(generationAttack)
    redigestPacket(generationAttack)
    expect(() => verifyDevelopmentHostParityEvidence(generationAttack)).toThrow()

    const staleReceipt = clone(packet)
    staleReceipt.hostReads[0].readAt = '2000-01-01T00:00:00.000Z'
    redigestReceipt(staleReceipt.hostReads[0])
    redigestPacket(staleReceipt)
    expect(() => verifyDevelopmentHostParityEvidence(staleReceipt))
      .toThrow('host_read_receipt_stale')

    const swapped = clone(packet)
    const first = swapped.hostReads[0]
    swapped.hostReads[0] = swapped.hostReads[1]
    swapped.hostReads[1] = first
    redigestPacket(swapped)
    expect(() => verifyDevelopmentHostParityEvidence(swapped))
      .toThrow('host_read_not_reconstructed_from_durable_source')
  })
})

function clone(packet: DevelopmentHostParityEvidence): any {
  return JSON.parse(JSON.stringify(packet))
}

function redigestDynamic(packet: any): void {
  const { packetDigest: _discarded, ...material } = packet.dynamicEvidence
  packet.dynamicEvidence.packetDigest = canonicalDigest(material as StableHashValue)
}

function redigestReceipt(receipt: any): void {
  const { receiptDigest: _discarded, ...material } = receipt
  receipt.semanticDigest = canonicalDigest(receipt.semanticRead as StableHashValue)
  receipt.receiptDigest = canonicalDigest(material as StableHashValue)
}

function redigestPacket(packet: any): void {
  const { packetDigest: _discarded, ...material } = packet
  packet.packetDigest = canonicalDigest(material as StableHashValue)
}
