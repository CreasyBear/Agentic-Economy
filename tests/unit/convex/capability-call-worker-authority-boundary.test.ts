import { getFunctionName } from 'convex/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(async () => ({ kind: 'prepared' as const })),
  release: vi.fn(async () => ({ kind: 'recorded' as const })),
  recover: vi.fn(async (_ctx: unknown, args: Record<string, unknown>) => ({
    kind: 'found' as const,
    callRef: String(args.callRef),
    toolRef: 'tool:test',
    state: 'terminal' as const,
  })),
}))

vi.mock('@/modules/capability-execution/call-worker/runPreparation', () => ({
  prepareCallRun: mocks.prepare,
}))
vi.mock('@/modules/capability-execution/call-worker/runRelease', () => ({
  releaseCallRun: mocks.release,
}))
vi.mock('@/modules/capability-execution/call-worker/recover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-execution/call-worker/recover')>()),
  recoverCapabilityCall: mocks.recover,
}))

import { recover, run } from '../../../convex/capabilityCallWorker'

type Handler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
const runBoundary = (run as unknown as { _handler: Handler })._handler
const recoverBoundary = (recover as unknown as { _handler: Handler })._handler

const CALL_REF = 'call:canonical'
const PRINCIPAL_REF = `prn_${'1'.repeat(32)}`
const ACCOUNT_REF = `acc_${'2'.repeat(32)}`
const CREDENTIAL_REF = 'ak_live_locator'

function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

function context(result: 'authorized' | 'refused' = 'authorized') {
  return {
    runMutation: vi.fn(async (reference: unknown) => {
      if (functionPath(reference) !== 'capabilityCalls:reconcileCallWorkloadAuthority') {
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
    await expect(runBoundary(ctx, { callRef: CALL_REF })).resolves.toEqual({ kind: 'recorded' })
    expect(ctx.runMutation).toHaveBeenCalledTimes(2)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })

  it('denies revoked or expired authority before claim, money, or provider execution', async () => {
    const ctx = context('refused')
    await expect(runBoundary(ctx, { callRef: CALL_REF })).resolves.toEqual({ kind: 'none' })
    expect(mocks.prepare).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('reconciles again after preparation and denies authority revoked before release', async () => {
    const ctx = context()
    ctx.runMutation
      .mockResolvedValueOnce(authorizedAuthority())
      .mockResolvedValueOnce({ kind: 'refused' })

    await expect(runBoundary(ctx, { callRef: CALL_REF })).resolves.toEqual({ kind: 'none' })
    expect(ctx.runMutation).toHaveBeenCalledTimes(2)
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
    expect(mocks.release).not.toHaveBeenCalled()
  })

  it('reconciles recovery against exact persisted Principal and credential provenance', async () => {
    const ctx = context()
    await expect(recoverBoundary(ctx, {
      callRef: CALL_REF,
      principalId: PRINCIPAL_REF,
      credentialId: CREDENTIAL_REF,
      mode: 'status',
    })).resolves.toMatchObject({ kind: 'found', state: 'terminal' })
    expect(mocks.recover).toHaveBeenCalledTimes(1)

    await expect(recoverBoundary(ctx, {
      callRef: CALL_REF,
      principalId: 'caller-forged-principal',
      credentialId: CREDENTIAL_REF,
      mode: 'status',
    })).resolves.toEqual({
      kind: 'refused', callRef: CALL_REF, code: 'invocation_not_found', retryable: false,
    })
    expect(mocks.recover).toHaveBeenCalledTimes(1)
  })

  it('revalidates replacement recovery authority and denies server-only recovery modes', async () => {
    const recoveryPrincipal = {
      principalId: PRINCIPAL_REF, ownerId: ACCOUNT_REF, credentialId: 'ak_successor',
      applicationRef: 'agentic-economy', environment: 'production',
      scopes: ['market_tools:call'], authorityMode: 'spending_policy',
    }
    const ctx = { runMutation: vi.fn(async (_reference: unknown, _args: unknown) => recoveryPrincipal as typeof recoveryPrincipal | null) }
    const args = {
      callRef: CALL_REF, principalId: PRINCIPAL_REF, credentialId: CREDENTIAL_REF,
      mode: 'status', recoveryPrincipal,
    }
    await expect(recoverBoundary(ctx, args)).resolves.toMatchObject({ kind: 'found' })
    expect(functionPath(ctx.runMutation.mock.calls[0]?.[0])).toBe('capabilityCalls:resolveCallAgentAuthority')
    expect(mocks.recover).toHaveBeenCalledWith(ctx, expect.objectContaining({ credentialId: CREDENTIAL_REF }))
    ctx.runMutation.mockResolvedValueOnce(null)
    await expect(recoverBoundary(ctx, args)).resolves.toMatchObject({ kind: 'refused' })
    for (const mode of ['reconcile_pre_submission', 'reconcile_managed_signing']) {
      await expect(recoverBoundary(ctx, { ...args, mode })).resolves.toMatchObject({ kind: 'refused' })
      await expect(recoverBoundary(ctx, { ...args, mode, recoveryPrincipal: undefined, recoverAsOwner: true }))
        .resolves.toMatchObject({ kind: 'refused' })
    }
    await expect(recoverBoundary(ctx, { ...args, principalId: 'prn_foreign' })).resolves.toMatchObject({ kind: 'refused' })
    expect(mocks.recover).toHaveBeenCalledTimes(1)
  })
})
