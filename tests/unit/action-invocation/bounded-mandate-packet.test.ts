import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  runBoundedMandateDevelopmentEvidence,
  verifyBoundedMandateEvidence,
} from '../../../tools/dev/bounded-mandate-evidence-packet'

describe('bounded mandate executable evidence packet', () => {
  it('derives a pass from actual grant, invocation, release, refusal, revocation and reconciliation records', async () => {
    const evidence = await runBoundedMandateDevelopmentEvidence()
    expect(verifyBoundedMandateEvidence(evidence)).toMatchObject({
      verdict: 'PASS_FOR_DECLARED_CLASS',
      authorityUseCount: 4,
    })
    expect(evidence.comparison).toMatchObject({
      boundedMandatePrincipalGrantDecisions: 1,
      boundedMandateRepeatPrincipalDecisions: 0,
    })
  })

  it.each([
    ['grant evidence', (copy: any) => { copy.grantEvidence.principalRef = 'tampered' }],
    ['mandate generation', (copy: any) => { copy.mandateSnapshot.mandates[0].generation = 99 }],
    ['use actor', (copy: any) => { copy.mandateSnapshot.uses[0].principalRef = 'tampered' }],
    ['missing reconstructed use', (copy: any) => { copy.mandateSnapshot.uses = copy.mandateSnapshot.uses.slice(1) }],
    ['use material', (copy: any) => { copy.mandateSnapshot.uses[0].preparedMaterialDigest = 'tampered' }],
    ['effect linkage', (copy: any) => { copy.operations[0].durable.attempts[0].effectGeneration = 99 }],
    ['capacity settlement', (copy: any) => { copy.mandateSnapshot.uses[0].state = 'not_released' }],
    ['reconciliation', (copy: any) => { copy.observations.reconciliations[0].useState = 'uncertain' }],
    ['revocation', (copy: any) => { copy.observations.revokeRace.providerEffects = 1 }],
    ['duplicate invocation identity', (copy: any) => { copy.operations[1].invocationRef = copy.operations[0].invocationRef }],
    ['duplicate authority-use identity', (copy: any) => {
      copy.mandateSnapshot.uses[1].authorityUseRef = copy.mandateSnapshot.uses[0].authorityUseRef
    }],
    ['duplicate attempt identity', (copy: any) => {
      copy.operations[1].durable.attempts[0].attemptRef = copy.operations[0].durable.attempts[0].attemptRef
    }],
    ['duplicate evidence identity', (copy: any) => {
      copy.observations.reconciliations[1].evidenceRef = copy.observations.reconciliations[0].evidenceRef
    }],
    ['reordered release event', (copy: any) => {
      const events = copy.operations[0].events
      copy.operations[0].events = [events[1], events[0]]
    }],
    ['exception compensation class', (copy: any) => {
      copy.observations.exceptionCases.find((item: any) => item.stage === 'pre_release_execution').useState = 'uncertain'
    }],
    ['post-release uncertainty class', (copy: any) => {
      copy.observations.exceptionCases.find((item: any) => item.stage === 'post_release_execution').useState = 'not_released'
    }],
  ])('rejects valid outer-checksum tampering of %s', async (_label, mutate) => {
    const evidence = structuredClone(await runBoundedMandateDevelopmentEvidence())
    mutate(evidence)
    const validOuterChecksum = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
    expect(validOuterChecksum).toHaveLength(64)
    expect(() => verifyBoundedMandateEvidence(evidence)).toThrow()
  })
})
