import { getFunctionName, type FunctionReference } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import { completeWork, run } from '../../../convex/capabilityProviderConnectionCleanup'
import { providerConnectionCleanupRequestDigest } from '@/modules/capability-supply/provider-connection'

type Mutation = (
  reference: FunctionReference<'mutation', 'internal', Record<string, unknown>, unknown>,
  args: Record<string, unknown>,
) => Promise<unknown>
type MutationContext = { runMutation: Mutation }
type Query = (
  reference: FunctionReference<'query', 'internal', Record<string, unknown>, unknown>,
  args: Record<string, unknown>,
) => Promise<unknown>
type ActionContext = { runQuery: Query }
type Handler = (ctx: MutationContext, args: Record<string, unknown>) => Promise<null>
type WorkerHandler = (ctx: ActionContext, args: Record<string, unknown>) => Promise<unknown>
type RegisteredCleanup = { _handler: Handler }
type RegisteredWorker = { _handler: WorkerHandler }

const registeredCleanup = completeWork as unknown as RegisteredCleanup
const handler = registeredCleanup._handler
const registeredWorker = run as unknown as RegisteredWorker
const workerHandler = registeredWorker._handler
const context = {
  connectionRef: 'connection:test',
  commandId: 'provider-cleanup:v1:test',
  expectedAuthorityGeneration: 1,
  expectedAuthorityDigest: `sha256:${'a'.repeat(64)}`,
  requestDigest: `sha256:${'b'.repeat(64)}`,
  cleanupAttempt: 1,
}

function callbackContext(workKind: 'lease_drain' | 'cleanup') {
  return { ...context, workKind }
}

describe('provider cleanup Workpool callback', () => {
  it('forwards attempt identity to target reads and refuses stale worker attempts', async () => {
    const revocationRef = 'provider-revocation:v1:test'
    const target = {
      connectionRef: context.connectionRef,
      providerRef: 'provider:one',
      providerAccountRef: 'account:one',
      adapterId: 'http-json:v1',
      credentialRef: 'redacted',
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: context.expectedAuthorityGeneration,
      authorityDigest: context.expectedAuthorityDigest,
      lifecycle: 'revocation_pending' as const,
      revocationRef,
      cleanupAttempt: 1,
    }
    const requestDigest = providerConnectionCleanupRequestDigest({
      revocationRef,
      cleanupAttempt: 1,
      connectionRef: target.connectionRef,
      expectedAuthorityGeneration: target.authorityGeneration,
      expectedAuthorityDigest: target.authorityDigest,
      adapterId: target.adapterId,
    })
    const runQuery = vi.fn<Query>(async () => target)
    const result = await workerHandler({ runQuery }, {
      ...context,
      requestDigest,
      workKind: 'cleanup',
    })
    expect(result).toMatchObject({ kind: 'cleanup', result: { outcome: 'unsupported' } })
    const queryCall = runQuery.mock.calls.at(0)
    if (queryCall === undefined) throw new Error('cleanup target query missing')
    expect(getFunctionName(queryCall[0])).toBe('capabilityProviderConnections:readCleanupTarget')
    expect(queryCall[1]).toMatchObject({ cleanupAttempt: 1 })

    runQuery.mockResolvedValue({ ...target, cleanupAttempt: 2 })
    const stale = await workerHandler({ runQuery }, {
      ...context,
      requestDigest,
      workKind: 'cleanup',
    })
    expect(stale).toMatchObject({
      kind: 'cleanup',
      result: { outcome: 'outcome_unknown', reasonCode: 'cleanup_request_mismatch' },
    })
  })
  it('advances a bounded lease drain only after its action completes successfully', async () => {
    const runMutation = vi.fn<Mutation>(async () => null)
    const ctx: MutationContext = { runMutation }

    await handler(ctx, {
      workId: 'workpool:drain',
      context: callbackContext('lease_drain'),
      result: { kind: 'success', returnValue: { kind: 'lease_drain' } },
    })

    expect(runMutation).toHaveBeenCalledTimes(1)
    const call = runMutation.mock.calls.at(0)
    if (call === undefined) throw new Error('lease drain mutation call missing')
    expect(getFunctionName(call[0])).toBe('capabilityProviderConnections:advanceLeaseDrain')
    expect(call[1]).toMatchObject({
      ...context,
      workKind: 'lease_drain',
      workId: 'workpool:drain',
    })
  })

  it('records bounded cleanup outcomes and converts worker failure to an unknown outcome', async () => {
    const runMutation = vi.fn<Mutation>(async () => null)
    const ctx: MutationContext = { runMutation }

    await handler(ctx, {
      workId: 'workpool:cleanup',
      context: callbackContext('cleanup'),
      result: {
        kind: 'success',
        returnValue: {
          kind: 'cleanup',
          result: { outcome: 'unsupported', reasonCode: 'cleanup_adapter_unsupported', evidenceRefs: ['provider_cleanup:adapter_unsupported'] },
        },
      },
    })
    const recordedCall = runMutation.mock.calls.at(0)
    if (recordedCall === undefined) throw new Error('cleanup mutation call missing')
    expect(getFunctionName(recordedCall[0])).toBe('capabilityProviderConnections:recordCleanupResult')
    expect(recordedCall[1]).toMatchObject({
      connectionRef: context.connectionRef,
      commandId: context.commandId,
      expectedAuthorityGeneration: context.expectedAuthorityGeneration,
      expectedAuthorityDigest: context.expectedAuthorityDigest,
      cleanupAttempt: 1,
      requestDigest: context.requestDigest,
      workId: 'workpool:cleanup',
      outcome: 'unsupported',
      reasonCode: 'cleanup_adapter_unsupported',
      evidenceRefs: ['provider_cleanup:adapter_unsupported'],
    })

    runMutation.mockClear()
    await handler(ctx, {
      workId: 'workpool:lost',
      context: callbackContext('cleanup'),
      result: { kind: 'failed', error: 'provider secret must not cross the callback boundary' },
    })
    const failedCall = runMutation.mock.calls.at(0)
    if (failedCall === undefined) throw new Error('failed cleanup mutation call missing')
    expect(getFunctionName(failedCall[0])).toBe('capabilityProviderConnections:recordCleanupResult')
    expect(failedCall[1]).toMatchObject({
      connectionRef: context.connectionRef,
      commandId: context.commandId,
      expectedAuthorityGeneration: context.expectedAuthorityGeneration,
      expectedAuthorityDigest: context.expectedAuthorityDigest,
      cleanupAttempt: 1,
      requestDigest: context.requestDigest,
      workId: 'workpool:lost',
      outcome: 'outcome_unknown',
      reasonCode: 'cleanup_action_failed',
      evidenceRefs: ['provider_cleanup:cleanup_action_failed'],
    })
    expect(JSON.stringify(failedCall[1])).not.toContain('provider secret')
  })
})
