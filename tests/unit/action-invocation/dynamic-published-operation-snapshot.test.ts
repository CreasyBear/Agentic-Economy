import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  buildDevelopmentDynamicInvocationEvidence,
  verifyDevelopmentDynamicInvocationEvidence,
} from '../../../tools/dev/fixtures/capability-supply/development-dynamic-invocation-evidence'

describe('dynamic PublishedOperation Action Invocation snapshot', () => {
  it('rejects redigested snapshot and evidence attacks from immutable anchors', async () => {
    const base = await buildDevelopmentDynamicInvocationEvidence()
    expect(base.evidenceContract.reconstructionMetadataOnly)
      .toBe('timestamps_and_order_without_external_root')
    expect(base.claimCeiling).toContain(
      'Timestamps and order metadata have no independent provenance',
    )
    const attacks: readonly [string, (packet: any) => void][] = [
      ['owner', (packet) => { packet.cases[0].snapshot.controls[0].control.owner.principalRef = 'principal:attacker' }],
      ['origin', (packet) => { packet.cases[0].snapshot.controls[0].control.origin = { kind: 'standalone', callerRef: 'x', principalRef: 'y' } }],
      ['mode', (packet) => { packet.cases[0].snapshot.controls[0].control.acceptedAuthority.kind = 'standing_mandate_use' }],
      ['coordinated authority reference', (packet) => {
        const control = packet.cases[0].snapshot.controls[0]
        control.control.authority.reference = 'authority:forged'
        control.control.acceptedAuthority.authorityRef = 'authority:forged'
        control.authorityBinding.reference = 'authority:forged'
        control.authorityBinding.acceptedBasis.authorityRef = 'authority:forged'
      }],
      ['generation', (packet) => { packet.cases[0].snapshot.attempts[0].rows[0].effectGeneration = 7 }],
      ['coordinated attempt material and effect', (packet) => {
        const snapshot = packet.cases[0].snapshot
        const attempt = snapshot.attempts[0].rows[0]
        attempt.idempotency.materialInputDigest = 'sha256:forged-material'
        attempt.idempotency.effectIdentity = canonicalDigest({
          actionId: snapshot.controls[0].control.action.id,
          operationKey: attempt.idempotency.operationKey,
          materialInputDigest: attempt.idempotency.materialInputDigest,
        })
        const transition = snapshot.history[0].rows.at(-1).attemptTransition
        const prior = {
          ...attempt,
          release: { state: 'not_released' },
          outcome: { state: 'running' },
        }
        transition.priorDigest = canonicalDigest(prior)
        transition.nextDigest = canonicalDigest(attempt)
      }],
      ['publication', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.publicationRevision = 99 }],
      ['config', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.transport.configJson = '{}' }],
      ['payment', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.payment.payTo = '0xattacker' }],
      ['price', (packet) => { packet.cases[0].snapshot.sourceRows[0].operation.identity.price.amount.units = '999' }],
      ['input', (packet) => { packet.cases[0].snapshot.sourceRows[0].input.input.symbol = 'ETH' }],
      ['output', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.output = { data: { forged: true } } }],
      ['challenge', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.paymentChallengeDigest = 'sha256:forged' }],
      ['evidence', (packet) => { packet.cases[0].snapshot.sourceRows[0].observedResolution.result.providerReceipt = 'forged:evidence' }],
      ['result', (packet) => { packet.cases[0].snapshot.sourceRows[0].resultIdentity.resultDigest = 'sha256:forged' }],
      ['attempt', (packet) => { packet.cases[0].snapshot.attempts[0].rows[0].attemptRef = 'attempt:forged' }],
      ['effects', (packet) => { packet.cases[0].paymentEffects = 2 }],
      ['coordinated command material and history', (packet) => {
        const snapshot = packet.cases[0].snapshot
        const command = snapshot.commands.at(-1)
        command.value.material.control = { state: 'awaiting_authority' }
        command.value.digest = canonicalDigest(command.value.material)
        const row = snapshot.history[0].rows.find(
          (candidate: any) => candidate.commandId === command.commandId,
        )
        row.commandDigest = command.value.digest
        command.value.result = { kind: 'applied', invocationVersion: row.invocationVersion }
      }],
      ['semantic invocation swap', (packet) => {
        packet.semanticReuse.invocations[1].invocationRef =
          packet.semanticReuse.invocations[0].invocationRef
      }],
      ['semantic attempt swap', (packet) => {
        packet.semanticReuse.invocations[1].attemptRef =
          packet.semanticReuse.invocations[0].attemptRef
      }],
      ['semantic generation', (packet) => {
        packet.semanticReuse.invocations[1].effectGeneration = 7
      }],
      ['semantic index', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.sourceRows[0].semanticIdentityDigest =
          'sha256:forged-semantic-index'
      }],
      ['semantic owner', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.semanticClaims[0].ownerInvocationRef =
          packet.semanticReuse.invocations[1].invocationRef
      }],
      ['semantic base', (packet) => {
        const snapshot = packet.semanticReuse.invocations[1].snapshot
        snapshot.sourceRows[0].semanticBaseKey = 'sha256:forged-base'
        snapshot.semanticClaims[0].semanticBaseKey = 'sha256:forged-base'
      }],
      ['semantic status', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.semanticClaims[0].status = 'uncertain'
      }],
      ['semantic outcome', (packet) => {
        packet.semanticReuse.invocations[1].snapshot.semanticClaims[0].outcome.observedResolution =
          { state: 'threw', execution: 'runner_threw', message: 'forged' }
      }],
      ['semantic result reference', (packet) => {
        const entry = packet.semanticReuse.invocations[1]
        entry.snapshot.sourceRows[0].resultIdentity.sourceResultRef = 'result:forged'
        entry.snapshot.controls[0].sourceResultRef = 'result:forged'
        packet.semanticReuse.sharedOutcomeRef = 'result:forged'
      }],
      ['prepared continuation material', (packet) => {
        const snapshot = packet.processKill.snapshot
        snapshot.sourceRows[0].prepared.materialInputDigest = 'sha256:forged-prepared'
        snapshot.controls[0].preparedMaterialDigest = 'sha256:forged-prepared'
        snapshot.controls[0].authorityBinding.digest = 'sha256:forged-prepared'
        snapshot.attempts[0].rows[0].idempotency.materialInputDigest = 'sha256:forged-prepared'
      }],
      ['schema', (packet) => { packet.cases[0].snapshot.untrusted = true }],
    ]
    for (const [name, attack] of attacks) {
      const packet: any = JSON.parse(JSON.stringify(base))
      attack(packet)
      const { packetDigest: _prior, ...material } = packet
      packet.packetDigest = canonicalDigest(material)
      expect(() => verifyDevelopmentDynamicInvocationEvidence(packet), name).toThrow()
    }
  })
})
