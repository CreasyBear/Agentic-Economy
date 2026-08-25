import { describe, expect, it } from 'vitest'

import {
  IsolationProofError,
  SecretCanaryError,
  generateIsolationMatrix,
  proveSecretCanaryIsolation,
  type SecretCanaryArtifact,
} from '../../../src/modules/authority/recovery/public'
import { accountRef } from '../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../src/modules/principal-account/principal/public'

const ACCOUNT = accountRef('acc_00000000000040008000000000000021')
const OTHER = accountRef('acc_00000000000040008000000000000022')
const actors = Object.freeze({
  owner: principalRef('prn_00000000000040008000000000000021'),
  member: principalRef('prn_00000000000040008000000000000022'),
  stranger: principalRef('prn_00000000000040008000000000000023'),
  workload: principalRef('prn_00000000000040008000000000000024'),
})
const surfaces = Object.freeze([
  { surfaceRef: 'http:recover', owningAccountRef: ACCOUNT, resourceRef: `account:${ACCOUNT}` },
  { surfaceRef: 'job:reconcile', owningAccountRef: ACCOUNT, resourceRef: `account:${ACCOUNT}` },
])

describe('P2-05 generated isolation matrix', () => {
  it('generates all seven cases for every surface, freezes evidence, and preserves unknown external state on fail-closed denial', async () => {
    const proof = await generateIsolationMatrix({
      surfaces, actors, wrongAccountRef: OTHER, currentGeneration: 3,
      evaluate: async (probe) => {
        if (probe.caseKind === 'wrong_account') return Object.freeze({ kind: 'denied' as const, reason: 'wrong_account', externalState: 'provider_future_state' })
        if (probe.caseKind === 'missing_workload') return Object.freeze({ kind: 'denied' as const, reason: 'workload_context_missing' })
        if (probe.caseKind === 'stranger' || probe.caseKind === 'stale_generation') return Object.freeze({ kind: 'denied' as const, reason: 'authority_denied' })
        return Object.freeze({ kind: 'allowed' as const })
      },
    })
    expect(proof.rows).toHaveLength(14)
    expect(proof.surfaceCount).toBe(2)
    expect(proof.caseCount).toBe(14)
    expect(Object.isFrozen(proof)).toBe(true)
    expect(Object.isFrozen(proof.rows)).toBe(true)
    expect(proof.rows.every(Object.isFrozen)).toBe(true)
    expect(proof.rows.filter((row) => row.decision.kind === 'denied')).toHaveLength(8)
    const missingWorkloads = proof.rows.filter((row) => row.caseKind === 'missing_workload')
    expect(missingWorkloads).toHaveLength(2)
    expect(missingWorkloads.every((row) => row.decision.kind === 'denied')).toBe(true)
    expect(missingWorkloads.every((row) => row.decision.kind === 'denied' && row.decision.reason === 'workload_context_missing')).toBe(true)
    expect(missingWorkloads.every((row) => !('actorPrincipalRef' in row))).toBe(true)
    expect(proof.rows.find((row) => row.caseKind === 'wrong_account')?.decision).toEqual({ kind: 'denied', reason: 'wrong_account', externalState: 'provider_future_state' })
  })

  it('rejects incomplete/duplicate inventories and any cross-account, stranger, or stale-generation allowance', async () => {
    await expect(generateIsolationMatrix({ surfaces: [], actors, wrongAccountRef: OTHER, currentGeneration: 3, evaluate: async () => ({ kind: 'denied', reason: 'none' }) })).rejects.toMatchObject({ code: 'isolation_surface_inventory_invalid' })
    await expect(generateIsolationMatrix({ surfaces: [surfaces[0]!, surfaces[0]!], actors, wrongAccountRef: OTHER, currentGeneration: 3, evaluate: async () => ({ kind: 'denied', reason: 'none' }) })).rejects.toMatchObject({ code: 'isolation_surface_inventory_invalid' })
    await expect(generateIsolationMatrix({ surfaces, actors, wrongAccountRef: ACCOUNT, currentGeneration: 3, evaluate: async () => ({ kind: 'denied', reason: 'none' }) })).rejects.toMatchObject({ code: 'isolation_account_context_invalid' })
    await expect(generateIsolationMatrix({ surfaces, actors: { ...actors, stranger: actors.owner }, wrongAccountRef: OTHER, currentGeneration: 3, evaluate: async () => ({ kind: 'denied', reason: 'none' }) })).rejects.toMatchObject({ code: 'isolation_account_context_invalid' })
    await expect(generateIsolationMatrix({ surfaces, actors, wrongAccountRef: OTHER, currentGeneration: 0, evaluate: async () => ({ kind: 'denied', reason: 'none' }) })).rejects.toMatchObject({ code: 'isolation_generation_invalid' })
    for (const caseKind of ['stranger', 'wrong_account', 'stale_generation', 'missing_workload'] as const) {
      await expect(generateIsolationMatrix({ surfaces, actors, wrongAccountRef: OTHER, currentGeneration: 3, evaluate: async (probe) => probe.caseKind === caseKind ? ({ kind: 'allowed' }) : probe.caseKind === 'owner' || probe.caseKind === 'member' || probe.caseKind === 'workload' ? ({ kind: 'allowed' }) : ({ kind: 'denied', reason: 'denied' }) })).rejects.toMatchObject({ code: 'isolation_negative_case_allowed' })
    }
    for (const caseKind of ['owner', 'member', 'workload'] as const) {
      await expect(generateIsolationMatrix({ surfaces, actors, wrongAccountRef: OTHER, currentGeneration: 3, evaluate: async (probe) => probe.caseKind === caseKind ? ({ kind: 'denied', reason: 'denied' }) : probe.caseKind === 'owner' || probe.caseKind === 'member' || probe.caseKind === 'workload' ? ({ kind: 'allowed' }) : ({ kind: 'denied', reason: 'denied' }) })).rejects.toMatchObject({ code: 'isolation_positive_case_denied' })
    }
    await expect(generateIsolationMatrix({ surfaces, actors, wrongAccountRef: OTHER, currentGeneration: 3, evaluate: async () => ({ kind: 'future' } as never) })).rejects.toMatchObject({ code: 'isolation_decision_invalid' })
    await expect(generateIsolationMatrix({ surfaces, actors, wrongAccountRef: OTHER, currentGeneration: 3, evaluate: async (probe) => probe.caseKind === 'owner' ? ({ kind: 'allowed' }) : ({ kind: 'denied', reason: '' }) })).rejects.toMatchObject({ code: 'isolation_decision_invalid' })
    expect(new IsolationProofError('isolation_generation_invalid').message).toBe('isolation_generation_invalid')
  })
})

describe('P2-05 secret-canary isolation proof', () => {
  const clean = (): SecretCanaryArtifact[] => [
    { sink: 'convex_row' as const, textFragments: ['sec_1'] },
    { sink: 'log' as const, textFragments: ['done'] },
    { sink: 'error' as const, textFragments: ['unavailable'] },
    { sink: 'audit' as const, textFragments: ['dual-attributed'] },
    { sink: 'environment' as const, textFragments: ['PROJECT_ID'] },
    { sink: 'snapshot' as const, byteFragments: [Uint8Array.from([1, 2, 3])] },
  ]

  it('requires exact sink coverage and detects text and binary canaries without reflecting material', () => {
    const canary = new TextEncoder().encode('never-reflect-this-canary')
    expect(() => proveSecretCanaryIsolation(new Uint8Array(), clean())).toThrowError(SecretCanaryError)
    expect(() => proveSecretCanaryIsolation(canary, clean().slice(0, 5))).toThrowError('secret_canary_sink_inventory_invalid')
    expect(() => proveSecretCanaryIsolation(canary, [...clean(), clean()[0]!])).toThrowError('secret_canary_sink_inventory_invalid')
    expect(() => proveSecretCanaryIsolation(canary, clean().map((artifact) => artifact.sink === 'log' ? { sink: artifact.sink } : artifact))).toThrowError('secret_canary_sink_inventory_invalid')
    expect(() => proveSecretCanaryIsolation(canary, clean().map((artifact) => artifact.sink === 'log' ? { sink: artifact.sink, textFragments: [''] } : artifact))).toThrowError('secret_canary_sink_inventory_invalid')
    expect(() => proveSecretCanaryIsolation(canary, clean().map((artifact) => artifact.sink === 'snapshot' ? { sink: artifact.sink, byteFragments: [new Uint8Array()] } : artifact))).toThrowError('secret_canary_sink_inventory_invalid')
    expect(() => proveSecretCanaryIsolation(canary, clean().map((artifact) => artifact.sink === 'log' ? { ...artifact, textFragments: ['never-reflect-this-canary'] } : artifact))).toThrowError('secret_canary_detected')
    expect(() => proveSecretCanaryIsolation(canary, clean().map((artifact) => artifact.sink === 'snapshot' ? { ...artifact, byteFragments: [Uint8Array.from(canary)] } : artifact))).toThrowError('secret_canary_detected')
    try {
      proveSecretCanaryIsolation(canary, clean().map((artifact) => artifact.sink === 'log' ? { ...artifact, textFragments: ['never-reflect-this-canary'] } : artifact))
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('never-reflect-this-canary')
    }
  })

  it('counts every fragment while returning only non-sensitive proof metadata', () => {
    const artifacts = clean()
    artifacts[0] = { sink: 'convex_row', textFragments: ['row'], byteFragments: [Uint8Array.from([4])] }
    const proof = proveSecretCanaryIsolation(new TextEncoder().encode('canary'), artifacts)
    expect(proof.artifactCount).toBe(7)
    expect(Object.isFrozen(proof)).toBe(true)
    expect(Object.isFrozen(proof.checkedSinks)).toBe(true)
    expect(new SecretCanaryError('secret_canary_invalid').message).toBe('secret_canary_invalid')
  })
})
