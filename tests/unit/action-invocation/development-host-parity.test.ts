import { describe, expect, it } from 'vitest'

import {
  buildDevelopmentHostParityEvidence,
  digestDevelopmentHostParityMaterial,
  type DevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-evidence'
import {
  verifyDevelopmentHostParityEvidence,
} from '@/modules/capability-supply/development-host-parity-verifier'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { buildDevelopmentPublishedOperationEvidence } from '@/modules/capability-supply/development-published-operation-evidence'
import { loadDynamicPublishedAdapterSnapshot } from '@/modules/action-invocation'

const provenance = {
  sourceBaseCommit: 'ebe35bdbd3b4707b356607e8dc615d3e29babe8d',
  evidenceCommit: '1111111111111111111111111111111111111111',
  evidenceTreeDigest: '2222222222222222222222222222222222222222',
} as const

describe('ADR-010 development host parity', () => {
  it('drives the complete matrix independently through both thin hosts', async () => {
    const packet = await buildDevelopmentHostParityEvidence(provenance)
    expect(() => verifyDevelopmentHostParityEvidence(packet, {
      sourceBaseCommit: provenance.sourceBaseCommit,
      evidenceCommit: provenance.evidenceCommit,
      evidenceTreeDigest: provenance.evidenceTreeDigest,
    })).not.toThrow()
    expect(packet.evals.every((entry) => entry.passed)).toBe(true)
    expect(packet.evals.map((entry) => entry.name)).toEqual([
      'authoritative_clarification_and_projection',
      'material_correction_real_authority_fence',
      'success',
      'zero_effect_preflight_refusal',
      'source_refusal',
      'post_release_source_refusal',
      'provider_timeout_parity',
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
      && host.releasedRefusal.failureCode === null
      && host.releasedRefusal.state === 'reconciliation_required'
      && host.releasedRefusal.snapshot.attempts[0]!.rows[0]!.release.state === 'possibly_released'
      && host.releasedRefusal.snapshot.paymentAttempts[0]!.state === 'reconciliation_required'
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
      packet.hosts[1].releasedRefusal.snapshot.sourceRows[0].observedResolution.message =
        'published_operation_payment_reconciliation_required:forged_refusal'
    }],
    ['released refusal provider evidence', (packet: any) => {
      packet.hosts[0].releasedRefusal.snapshot.paymentAttempts[0].evidenceRefs =
        ['mock:forged-provider-receipt']
    }],
    ['timeout reclassified', (packet: any) => {
      packet.hosts[0].timeout.releaseClassification = 'not_released'
    }],
    ['coordinated rich and structured invention', (packet: any) => {
      for (const host of packet.hosts) {
        host.correction.rich.semantics.continuations.push('invented_payment')
        host.correction.structured.semantics.continuations.push('invented_payment')
        host.correction.rich.semanticDigest = canonicalDigest(host.correction.rich.semantics)
        host.correction.structured.semanticDigest =
          canonicalDigest(host.correction.structured.semantics)
      }
    }],
    ['coordinated rich and structured owner identity', (packet: any) => {
      for (const host of packet.hosts) {
        host.correction.rich.semantics.identity.owner.callerRef = 'caller:forged'
        host.correction.structured.semantics.identity.owner.callerRef = 'caller:forged'
        host.correction.rich.semanticDigest = canonicalDigest(host.correction.rich.semantics)
        host.correction.structured.semanticDigest =
          canonicalDigest(host.correction.structured.semantics)
      }
    }],
    ['coordinated underlying origin and owner', (packet: any) => {
      for (const host of packet.hosts) {
        const snapshot = host.correction.snapshot
        snapshot.controls[0].control.owner.callerRef = 'caller:forged'
        snapshot.inputWork[0].owner.callerRef = 'caller:forged'
        snapshot.sourceRows[0].owner.callerRef = 'caller:forged'
      }
    }],
    ['input work material', (packet: any) => {
      packet.hosts[0].correction.snapshot.inputWork[0].knownInput.symbol = 'DOGE'
    }],
    ['input history epoch', (packet: any) => {
      packet.hosts[0].correction.snapshot.inputHistory.at(-1).invocationVersion = 1
    }],
    ['command CAS epoch', (packet: any) => {
      packet.hosts[0].correction.snapshot.commands.at(-1).value.material.expectedInvocationVersion = 1
      packet.hosts[0].correction.snapshot.commands.at(-1).value.digest =
        canonicalDigest(packet.hosts[0].correction.snapshot.commands.at(-1).value.material)
      packet.hosts[0].correction.snapshot.history[0].rows.at(-1).commandDigest =
        packet.hosts[0].correction.snapshot.commands.at(-1).value.digest
    }],
    ['corrected source material', (packet: any) => {
      for (const host of packet.hosts) {
        host.correction.snapshot.sourceRows[0].input.input.symbol = 'DOGE'
        host.correction.snapshot.sourceRows[0].input.inputDigest =
          canonicalDigest(host.correction.snapshot.sourceRows[0].input.input)
      }
    }],
    ['reserved clarification question', (packet: any) => {
      for (const host of packet.hosts) {
        host.clarification.gatheringSnapshot.inputWork[0].missingFields.push('credential')
        host.clarification.gatheringSnapshot.inputWork[0].requiredFields.push('credential')
      }
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
      sourceBaseCommit: provenance.sourceBaseCommit,
      evidenceCommit: '3333333333333333333333333333333333333333',
      evidenceTreeDigest: provenance.evidenceTreeDigest,
    })).toThrow('host_parity_revision_provenance_invalid')

    const baseTamper = clone(original)
    baseTamper.provenance.sourceBaseCommit = '4444444444444444444444444444444444444444'
    redigestPacket(baseTamper)
    expect(() => verifyDevelopmentHostParityEvidence(baseTamper))
      .toThrow('host_parity_source_base_invalid')
  })

  it('refuses archived v2 snapshots rather than silently reinterpreting their payment meaning', async () => {
    const packet = await buildDevelopmentHostParityEvidence(provenance)
    const liveFixture = buildDevelopmentPublishedOperationEvidence()
    const scenario = packet.hosts[1].success
    const legacy = clone(scenario.snapshot)
    delete legacy.inputWork
    delete legacy.inputHistory
    delete legacy.operations
    delete legacy.paymentAttempts
    legacy.format = 'dynamic-published-action-invocation:development:v2'
    for (const row of legacy.sourceRows) {
      delete row.origin
      delete row.owner
    }
    expect(() => loadDynamicPublishedAdapterSnapshot(legacy, {
      operation: liveFixture.operation,
      descriptor: liveFixture.descriptor,
      actor: packet.hosts[1].actor,
      origin: {
        kind: 'standalone',
        callerRef: packet.hosts[1].actor.callerRef,
        principalRef: packet.hosts[1].actor.principalRef,
      },
      issuedAuthority: {
        reference: scenario.authorityRef,
        accepted: { kind: 'approve_each', authorityRef: scenario.authorityRef },
        materialInputDigest: legacy.sourceRows[0].prepared.materialInputDigest,
      },
      expectedEffectCount: 1,
      expectedSemanticClaim: {
        ownerInvocationRef: scenario.invocationRef,
        status: 'completed',
        outcomeResultRef: legacy.sourceRows[0].resultIdentity.sourceResultRef,
      },
    })).toThrow('dynamic_published_snapshot_schema_invalid')

    const unsupportedV1 = clone(legacy)
    unsupportedV1.format = 'dynamic-published-action-invocation:development:v1'
    expect(() => loadDynamicPublishedAdapterSnapshot(unsupportedV1, {} as any))
      .toThrow('dynamic_published_snapshot_schema_invalid')
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
  packet.packetDigest = digestDevelopmentHostParityMaterial(material)
}
