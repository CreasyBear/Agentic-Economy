import { describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'

import { operationEnvironmentMismatchNextAction } from '@/modules/capability-execution/operation-invoke-contracts'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { projectOuterResult, run } from '../../../convex/capabilityOperationInvocationWorker'
import {
  canonicalProjectionSnapshot,
  fixture,
  outerDispatch,
  principal,
  validOutput,
} from './operation-invoke-harness'

describe('operation.invoke recover/reconcile', () => {
  it('keeps a valid partial response reconcilable instead of completing it', async () => {
    const { operation, operationRef, descriptor } = fixture()
    const snapshot = canonicalProjectionSnapshot(operationRef, operation.operationId, operation.identity.contractVersion)
    const runQuery = vi.fn(async (reference: unknown) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'actionInvocationControl:readControl') return snapshot.control
      if (path === 'actionInvocationControl:readAttempt') return snapshot.attempt
      throw new Error(`unexpected_query:${path}`)
    })
    const runMutation = vi.fn().mockResolvedValue({ kind: 'recorded' })
    const ctx = { runQuery, runMutation } as unknown as Parameters<typeof projectOuterResult>[0]

    await projectOuterResult(
      ctx,
      outerDispatch(operationRef),
      operation,
      descriptor,
      {
        transport: 'http',
        disposition: 'partial',
        releaseStarted: true,
        requestDigest: 'sha256:request',
        responseDigest: 'sha256:response',
        outputJson: JSON.stringify(validOutput()),
      },
      '2026-08-09T00:00:00.000Z',
    )

    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projection: expect.objectContaining({
          state: 'reconciliation_required',
          dispatchState: 'reconciliation_required',
          attemptRef: 'operation-attempt:operation-invocation:test:1',
          result: expect.objectContaining({
            kind: 'reconciliation_required',
            evidence: expect.objectContaining({
              attemptRef: 'operation-attempt:operation-invocation:test:1',
              effectGeneration: 1,
              retry: 'reconcile_before_retry',
            }),
          }),
        }),
      }),
    )
  })

  it('keeps a released schema-invalid response reconcilable instead of refusing pre-release', async () => {
    const { operation, operationRef, descriptor } = fixture()
    const snapshot = canonicalProjectionSnapshot(operationRef, operation.operationId, operation.identity.contractVersion)
    const runQuery = vi.fn(async (reference: unknown) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'actionInvocationControl:readControl') return snapshot.control
      if (path === 'actionInvocationControl:readAttempt') return snapshot.attempt
      throw new Error(`unexpected_query:${path}`)
    })
    const runMutation = vi.fn().mockResolvedValue({ kind: 'recorded' })
    const ctx = { runQuery, runMutation } as unknown as Parameters<typeof projectOuterResult>[0]

    await projectOuterResult(
      ctx,
      outerDispatch(operationRef),
      operation,
      descriptor,
      {
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest: 'sha256:request',
        responseDigest: 'sha256:response',
        outputJson: JSON.stringify({ unexpected: true }),
      },
      '2026-08-09T00:00:00.000Z',
    )
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projection: expect.objectContaining({
          state: 'reconciliation_required',
          dispatchState: 'reconciliation_required',
          result: expect.objectContaining({ kind: 'reconciliation_required' }),
        }),
      }),
    )
  })
  it('refuses persisted production dispatch before worker provider readers for development evidence', async () => {
    const { operation, operationRef } = fixture()
    const productionPrincipal: AgentAccessPrincipal = { ...principal, environment: 'production' }
    const dispatch = {
      invocationRef: 'operation-invocation:worker-environment',
      principalId: productionPrincipal.principalId,
      ownerId: productionPrincipal.ownerId,
      credentialId: productionPrincipal.credentialId,
      applicationRef: productionPrincipal.applicationRef,
      environment: productionPrincipal.environment,
      state: 'pending' as const,
      operationRef,
      idempotencyKey: 'idem:worker-environment',
      inputDigest: 'sha256:worker-input',
      requestDigest: 'sha256:worker-request',
      grantGeneration: 1,
      operationJson: JSON.stringify(operation),
      inputJson: JSON.stringify({ symbol: 'BTC', convert: 'USD' }),
      dispatchState: 'enqueued' as const,
    }
    const principalRow = {
      ...productionPrincipal,
      lifecycle: 'active' as const,
      grantGeneration: 1,
    }
    const runQuery = vi.fn()
      .mockResolvedValueOnce(dispatch)
      .mockResolvedValueOnce(dispatch)
      .mockResolvedValueOnce(principalRow)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ operationJson: JSON.stringify(operation) })
    const runMutation = vi.fn(async (reference: unknown, _args: Record<string, unknown>) => {
      const path = typeof reference === 'string' ? reference : getFunctionName(reference as never)
      if (path === 'capabilityOperationInvocations:reconcileInvocationWorkloadAuthority') {
        return {
          kind: 'authorized' as const,
          authority: {
            principalId: productionPrincipal.principalId,
            accountRef: productionPrincipal.ownerId,
            credentialId: productionPrincipal.credentialId,
            grantRef: 'delegation-grant:worker-environment',
            grantGeneration: 1,
            policyDigest: 'sha256:worker-environment-policy',
            expiresAt: Date.now() + 60_000,
          },
        }
      }
      return { kind: 'accepted' as const }
    })
    const workerAction = run as unknown as {
      _handler: (ctx: unknown, args: { invocationRef: string }) => Promise<unknown>
    }
    const handler = workerAction._handler

    const result = await handler({ runQuery, runMutation }, { invocationRef: dispatch.invocationRef })

    expect(result).toEqual({ kind: 'recorded' })
    expect(runQuery).toHaveBeenCalledTimes(6)
    const recordCall = runMutation.mock.calls.find(([reference]) => (
      getFunctionName(reference as never) === 'capabilityOperationInvocations:record'
    ))
    expect(recordCall?.[1]).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        operationRef,
        code: 'environment_mismatch',
        retryable: false,
        nextAction: operationEnvironmentMismatchNextAction,
      },
    })
  })
})
