import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({ kind: 'prepared' as const })),
  release: vi.fn(async () => ({ kind: 'recorded' as const })),
  recover: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found' as const,
    invocationRef: String(args.invocationRef),
    operationRef: 'operation:test',
    state: 'terminal' as const,
  })),
}))

vi.mock('@/modules/capability-execution/invocation-worker/runPreparation', () => ({
  prepareInvocationRun: mocks.prepare,
}))
vi.mock('@/modules/capability-execution/invocation-worker/runRelease', () => ({
  releaseInvocationRun: mocks.release,
}))
vi.mock('@/modules/capability-execution/invocation-worker/recover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-execution/invocation-worker/recover')>()),
  recoverCapabilityOperationInvocation: mocks.recover,
}))

import { recover, run } from '../../../convex/capabilityOperationInvocationWorker'

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
const runBoundary = (run as unknown as { _handler: Handler })._handler
const recoverBoundary = (recover as unknown as { _handler: Handler })._handler

const INVOCATION_REF = 'invocation:canonical'
const PRINCIPAL_REF = `prn_${'1'.repeat(32)}`
const ACCOUNT_REF = `acc_${'2'.repeat(32)}`
const CREDENTIAL_REF = 'ak_live_locator'

function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

function context(result: 'authorized' | 'refused' = 'authorized') {
  return {
    runMutation: vi.fn(async (reference: unknown) => {
      if (functionPath(reference) !== 'capabilityOperationInvocations:reconcileInvocationWorkloadAuthority') {
        throw new Error(`unexpected_mutation:${functionPath(reference)}`)
      }
      return result === 'refused' ? { kind: 'refused' } : {
        kind: 'authorized',
        authority: {
          principalId: PRINCIPAL_REF,
          accountRef: ACCOUNT_REF,
          credentialId: CREDENTIAL_REF,
          grantRef: `grt_${'3'.repeat(32)}`,
          grantGeneration: 4,
          policyDigest: 'sha256:policy',
          expiresAt: 9_999_999,
        },
      }
    }),
  }
}

function authorizedAuthority() {
  return {
    kind: 'authorized' as const,
    authority: {
      principalId: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      credentialId: CREDENTIAL_REF,
      grantRef: `grt_${'3'.repeat(32)}`,
      grantGeneration: 4,
      policyDigest: 'sha256:policy',
      expiresAt: 9_999_999,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('capability operation invocation worker authority boundary', () => {
  it('reconciles invocation-bound authority before run and preserves the valid result', async () => {
    const ctx = context()
    await expect(runBoundary(ctx, { invocationRef: INVOCATION_REF })).resolves.toEqual({ kind: 'recorded' })
    expect(ctx.runMutation).toHaveBeenCalledTimes(2)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })

  it('denies revoked or expired authority before claim, money, or provider execution', async () => {
    const ctx = context('refused')
    await expect(runBoundary(ctx, { invocationRef: INVOCATION_REF })).resolves.toEqual({ kind: 'none' })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('reconciles again after preparation and denies authority revoked before release', async () => {
    const ctx = context()
    ctx.runMutation
      .mockResolvedValueOnce(authorizedAuthority())
      .mockResolvedValueOnce({ kind: 'refused' })

    await expect(runBoundary(ctx, { invocationRef: INVOCATION_REF })).resolves.toEqual({ kind: 'none' })
    expect(ctx.runMutation).toHaveBeenCalledTimes(2)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('reconciles recovery against exact persisted Principal and credential provenance', async () => {
    const ctx = context()
    await expect(recoverBoundary(ctx, {
      invocationRef: INVOCATION_REF,
      principalId: PRINCIPAL_REF,
      credentialId: CREDENTIAL_REF,
      mode: 'status',
    })).resolves.toMatchObject({ kind: 'found', state: 'terminal' })
    expect(mocks.recover).toHaveBeenCalledTimes(1)

    await expect(recoverBoundary(ctx, {
      invocationRef: INVOCATION_REF,
      principalId: 'caller-forged-principal',
      credentialId: CREDENTIAL_REF,
      mode: 'status',
    })).resolves.toEqual({
      kind: 'refused', invocationRef: INVOCATION_REF, code: 'invocation_not_found', retryable: false,
    })
    expect(mocks.recover).toHaveBeenCalledTimes(1)
  })
})
