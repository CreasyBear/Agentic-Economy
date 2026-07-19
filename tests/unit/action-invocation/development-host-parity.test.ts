import { describe, expect, it } from 'vitest'

import {
  buildDevelopmentHostParityEvidence,
  normalizedOutcomeEvidenceResult,
  type DevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-evidence'
import {
  verifyDevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-verifier'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import { runDevelopmentHostScenarioMatrix } from '@/modules/capability-supply/development-host-scenarios'

const provenance = {
  sourceBaseCommit: 'feda5070296c9a0cbc72e3aeb285f0961ee94ec2',
  evidenceCommit: '1111111111111111111111111111111111111111',
  evidenceTreeDigest: '2222222222222222222222222222222222222222',
} as const

describe('ADR-010 development host parity', () => {
  it('drives the complete matrix independently through both thin hosts', async () => {
    const debugHosts = await runDevelopmentHostScenarioMatrix(buildDevelopmentPublishedOperationEvidence())
    expect(normalizedOutcomeEvidenceResult(debugHosts[0].success.snapshot))
      .toEqual(normalizedOutcomeEvidenceResult(debugHosts[1].success.snapshot))
    const packet = await buildDevelopmentHostParityEvidence(provenance)
    expect(() => verifyDevelopmentHostParityEvidence(packet, {
      evidenceCommit: provenance.evidenceCommit,
      evidenceTreeDigest: provenance.evidenceTreeDigest,
    })).not.toThrow()
    expect(packet.evals.every((entry) => entry.passed)).toBe(true)
    expect(packet.evals.map((entry) => entry.name)).toEqual([
      'success',
      'zero_effect_preflight_refusal',
      'source_refusal',
      'post_release_source_refusal',
      'uncertainty_reconcile_before_retry',
      'duplicate_stale_and_cancellation_fences',
      'process_cold_resume_without_transcript_cache',
      'standalone_result_request_reference_only',
    ])
    expect(packet.hosts[0].actor).toEqual({
      callerRef: 'human:request-owned-host',
      principalRef: 'principal:host-parity-customer',
    })
    expect(packet.hosts[1].actor).toEqual({
      callerRef: 'agent:standalone-external-host',
      principalRef: 'principal:host-parity-customer',
    })
    expect(packet.hostReads[0].readRef).not.toBe(packet.hostReads[1].readRef)
    expect(packet.hostReads[0].semanticRead.authority.reference)
      .not.toBe(packet.hostReads[1].semanticRead.authority.reference)
    expect(packet.parity.sameFields).toContain('authority.bounds')
    expect(packet.parity.differentFields).toContain('authority.reference')
    expect(packet.parity.normalizedScenarioDigests).toHaveLength(2)
    expect(packet.hosts.every((host) => (
      host.releasedRefusal.effects.payment === 1
      && host.releasedRefusal.effects.provider === 1
      && host.releasedRefusal.failureCode === 'output_schema_invalid'
      && host.releasedRefusal.snapshot.attempts[0]!.rows[0]!.release.state === 'possibly_released'
    ))).toBe(true)
    expect(packet.hosts[1].completedResultReuse).toMatchObject({
      firstKind: 'attached',
      secondKind: 'replayed',
      bothNoEffect: true,
      referencePayloadAuthorityFree: true,
      controlSnapshotUnchanged: true,
      authorityRecordCountBefore: 1,
      authorityRecordCountAfter: 1,
    })
  })

  it.each([
    ['caller', (packet: any) => {
      packet.hosts[0].success.snapshot.controls[0].control.owner.callerRef = 'human:forged'
    }],
    ['origin', (packet: any) => {
      packet.hosts[1].success.snapshot.controls[0].control.origin.callerRef = 'agent:forged'
    }],
    ['authority', (packet: any) => {
      packet.hosts[0].success.snapshot.controls[0].authorityBinding.reference = 'authority:copied'
    }],
    ['attempt', (packet: any) => {
      packet.hosts[1].success.snapshot.attempts[0].rows[0].attemptRef = 'attempt:copied'
    }],
    ['lease', (packet: any) => {
      packet.hosts[0].success.snapshot.attempts[0].rows[0].lease.owner = 'worker:forged'
    }],
    ['idempotency', (packet: any) => {
      packet.hosts[1].success.snapshot.attempts[0].rows[0].idempotency.operationKey = 'operation:forged'
    }],
    ['semantic owner', (packet: any) => {
      packet.hosts[0].success.snapshot.semanticClaims[0].ownerInvocationRef = 'invocation:copied'
    }],
    ['outcome', (packet: any) => {
      packet.hosts[1].success.snapshot.attempts[0].rows[0].outcome.businessOutcome = 'forged'
    }],
    ['release', (packet: any) => {
      packet.hosts[0].success.snapshot.attempts[0].rows[0].release.state = 'not_released'
    }],
    ['evidence', (packet: any) => {
      packet.hosts[1].success.snapshot.history[0].rows[0].commandDigest = 'sha256:forged'
    }],
    ['result', (packet: any) => {
      packet.hosts[0].success.snapshot.sourceRows[0].resultIdentity.resultDigest = 'sha256:forged'
    }],
    ['operation material', (packet: any) => {
      packet.hosts[1].success.snapshot.sourceRows[0].operation.identity.endpoint.method = 'POST'
    }],
    ['released refusal result content', (packet: any) => {
      packet.hosts[1].releasedRefusal.snapshot.sourceRows[0].observedResolution.result.failureCode =
        'forged_refusal'
    }],
    ['released refusal provider evidence', (packet: any) => {
      packet.hosts[0].releasedRefusal.snapshot.sourceRows[0]
        .observedResolution.result.providerReceipt = 'mock:forged-provider-receipt'
    }],
  ])('rejects coordinated %s tampering after attacker redigests the packet', async (_name, mutate) => {
    const packet = clone(await buildDevelopmentHostParityEvidence(provenance))
    mutate(packet)
    redigestPacket(packet)
    expect(() => verifyDevelopmentHostParityEvidence(packet)).toThrow()
  })

  it('rejects equal refs, copied receipts, host swaps, stale reads, and stale provenance', async () => {
    const original = await buildDevelopmentHostParityEvidence(provenance)

    const equalRefs = clone(original)
    equalRefs.hostReads[1].readRef = equalRefs.hostReads[0].readRef
    redigestReceipt(equalRefs.hostReads[1])
    redigestPacket(equalRefs)
    expect(() => verifyDevelopmentHostParityEvidence(equalRefs)).toThrow()

    const copied = clone(original)
    copied.hostReads[1] = clone(copied.hostReads[0])
    redigestPacket(copied)
    expect(() => verifyDevelopmentHostParityEvidence(copied)).toThrow()

    const swapped = clone(original)
    ;[swapped.hostReads[0], swapped.hostReads[1]] = [swapped.hostReads[1], swapped.hostReads[0]]
    redigestPacket(swapped)
    expect(() => verifyDevelopmentHostParityEvidence(swapped)).toThrow()

    const stale = clone(original)
    stale.hostReads[0].readAt = '2000-01-01T00:00:00.000Z'
    redigestReceipt(stale.hostReads[0])
    redigestPacket(stale)
    expect(() => verifyDevelopmentHostParityEvidence(stale)).toThrow()

    expect(() => verifyDevelopmentHostParityEvidence(original, {
      evidenceCommit: '3333333333333333333333333333333333333333',
      evidenceTreeDigest: provenance.evidenceTreeDigest,
    })).toThrow('host_parity_revision_provenance_invalid')
  })
})

function clone<T>(value: T): any {
  return JSON.parse(JSON.stringify(value))
}

function redigestReceipt(receipt: any): void {
  receipt.semanticDigest = canonicalDigest(receipt.semanticRead as StableHashValue)
  const { receiptDigest: _discarded, ...material } = receipt
  receipt.receiptDigest = canonicalDigest(material as StableHashValue)
}

function redigestPacket(packet: DevelopmentHostParityEvidence | any): void {
  const { packetDigest: _discarded, ...material } = packet
  packet.packetDigest = canonicalDigest(material as StableHashValue)
}
