import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  runSpendingPolicyDevelopmentEvidence,
  verifySpendingPolicyEvidence,
} from '../../../tools/dev/spending-policy-evidence-packet'

describe('spending-policy executable evidence packet', () => {
  it('requires command, packet path, and revision when invoked as the package CLI', () => {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      resolve('tools/dev/spending-policy-evidence-packet.ts'),
    ], { encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}\n${result.stderr}`).toContain('command_path_and_revision_required')
  })

    it('derives a pass from actual grant, execution, release, refusal, revocation and reconciliation records', async () => {
    const evidence = await runSpendingPolicyDevelopmentEvidence()
    expect(verifySpendingPolicyEvidence(evidence)).toMatchObject({
      verdict: 'PASS_FOR_DECLARED_CLASS',
      authorityUseCount: 4,
    })
    expect(evidence.comparison).toMatchObject({
      spendingPolicyPrincipalGrantDecisions: 1,
      spendingPolicyRepeatPrincipalDecisions: 0,
    })
  })

  it.each([
    ['grant evidence', (copy: any) => { copy.grantEvidence.principalRef = 'tampered' }],
    ['spending policy generation', (copy: any) => { copy.spendingPolicySnapshot.mandates[0].generation = 99 }],
    ['use actor', (copy: any) => { copy.spendingPolicySnapshot.uses[0].principalRef = 'tampered' }],
    ['missing reconstructed use', (copy: any) => { copy.spendingPolicySnapshot.uses = copy.spendingPolicySnapshot.uses.slice(1) }],
    ['use material', (copy: any) => { copy.spendingPolicySnapshot.uses[0].preparedMaterialDigest = 'tampered' }],
    ['effect linkage', (copy: any) => { copy.operations[0].durable.attempts[0].effectGeneration = 99 }],
    ['capacity settlement', (copy: any) => { copy.spendingPolicySnapshot.uses[0].state = 'not_released' }],
    ['reconciliation', (copy: any) => { copy.observations.reconciliations[0].useState = 'uncertain' }],
    ['revocation', (copy: any) => { copy.observations.revokeRace.providerEffects = 1 }],
    ['duplicate execution identity', (copy: any) => { copy.operations[1].executionRef = copy.operations[0].executionRef }],
    ['duplicate authority-use identity', (copy: any) => {
      copy.spendingPolicySnapshot.uses[1].authorityUseRef = copy.spendingPolicySnapshot.uses[0].authorityUseRef
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
    const evidence = structuredClone(await runSpendingPolicyDevelopmentEvidence())
    mutate(evidence)
    const validOuterChecksum = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
    expect(validOuterChecksum).toHaveLength(64)
    expect(() => verifySpendingPolicyEvidence(evidence)).toThrow()
  })
})
