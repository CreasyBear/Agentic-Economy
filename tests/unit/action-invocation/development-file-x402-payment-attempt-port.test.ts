import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createDevelopmentFileX402PaymentAttemptPort } from '@/modules/action-invocation/development-file-x402-payment-attempt-port'

const child = join(process.cwd(), 'tools/dev/x402-payment-attempt-child.ts')

describe('development file x402 payment attempt port', () => {
  it('atomically restores attempt, authorization event, settlement, and evidence after SIGKILL', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ae-x402-development-'))
    const file = join(directory, 'payment-state.json')

    const killedAfterCommit = runChild('persist-then-crash', file, 'settled')
    expect(killedAfterCommit.signal).toBe('SIGKILL')

    const freshProcess = runChild('read', file)
    expect(freshProcess.status).toBe(0)
    const restored = JSON.parse(freshProcess.stdout) as {
      attempts: Array<Record<string, unknown>>
      authorizationEvents: Array<Record<string, unknown>>
    }
    expect(restored.attempts).toEqual([
      expect.objectContaining({
        state: 'settled',
        custodyRef: `sha256:${'a'.repeat(64)}`,
        settledAmount: { currency: 'USDC', amountMinor: 37 },
        evidenceRefs: ['sha256:settlement-evidence'],
      }),
    ])
    expect(restored.authorizationEvents).toEqual([
      expect.objectContaining({ authorization: 'created' }),
    ])

    const killedBeforeCommit = runChild('crash-before-persist', file, 'prepared')
    expect(killedBeforeCommit.signal).toBe('SIGKILL')
    expect(JSON.parse(runChild('read', file).stdout)).toEqual(restored)
  })

  it('refuses raw custody material before it reaches the file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ae-x402-development-'))
    const file = join(directory, 'payment-state.json')
    const port = createDevelopmentFileX402PaymentAttemptPort(file)
    const authorizationEvent = {
      invocationRef: 'invocation:raw',
      attemptRef: 'attempt:raw',
      effectGeneration: 1,
      operationKey: 'operation:raw',
      queryRelease: 'released' as const,
      authorization: 'created' as const,
      recordedAt: 1,
      challengeDigest: 'challenge',
      authorizationDigest: 'authorization',
    }
    expect(() => port.persist({
      authorizationEvent,
      attempt: {
        paymentIdentifier: 'payment:raw',
        invocationRef: authorizationEvent.invocationRef,
        attemptRef: authorizationEvent.attemptRef,
        effectGeneration: authorizationEvent.effectGeneration,
        operationKey: authorizationEvent.operationKey,
        challengeDigest: 'challenge',
        scheme: 'exact',
        network: 'network',
        asset: 'USDC',
        payTo: 'recipient',
        amount: '1',
        providerEndpoint: 'https://provider.invalid',
        operationRevision: 'revision',
        authorizationDigest: 'authorization',
        custodyRef: 'raw-auth-payload',
        state: 'prepared',
        preparedAt: 1,
        evidenceRefs: [],
      },
    })).toThrow('x402_payment_custody_reference_invalid')
  })
})

function runChild(command: string, file: string, state?: string) {
  return spawnSync(process.execPath, [
    '--import',
    'tsx',
    child,
    command,
    file,
    ...(state === undefined ? [] : [state]),
  ], { encoding: 'utf8' })
}
