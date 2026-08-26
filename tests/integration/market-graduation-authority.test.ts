import { getFunctionName } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import { validatePaymentRequired } from '@x402/core/schemas'

const networkBoundary = vi.hoisted(() => ({
  validateTarget: vi.fn(async () => true),
  send: vi.fn(async () => new Response(null, { status: 503 })),
}))

vi.mock('@/modules/network-guard/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/network-guard/public')>()
  return {
    ...actual,
    defaultDnsResolver: vi.fn(),
    isPublicHttpTarget: networkBoundary.validateTarget,
  }
})

vi.mock('@/modules/network-guard/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/network-guard/server')>()
  return { ...actual, sendGuardedHttpRequest: networkBoundary.send }
})

import { internal } from '../../convex/_generated/api'
import {
  run as marketGraduationRun,
  sweep as marketGraduationSweep,
} from '../../convex/marketRegistryGraduation'
import {
  PHASE_2_CRON_ACCOUNT_REF,
  PHASE_2_CRON_PRINCIPAL_REF,
  type WorkloadCronSnapshot,
} from '../../convex/workloadCron'
import { convexTestWithMarketComponents } from '../helpers/convex-fixtures'
import {
  encodeX402PaymentRequiredHeader,
  type X402PaymentRequired,
} from '@/modules/capability-supply/server'
import timezonePin from '@/modules/capability-supply/internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json'

const WORKLOAD: WorkloadCronSnapshot = Object.freeze({
  name: 'refresh Agentic Economy API registry',
  workloadKind: 'cron',
  actorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
  activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
  correlationRef: 'cron:market-registry-graduation:test',
  idempotencyRef: 'cron:market-registry-graduation:test',
  purpose: 'refresh Agentic Economy API registry',
  source: 'convex/workloadCron:refreshAgenticEconomyApiRegistry',
  principalRevision: 3,
  activeAccountRevision: 5,
  accessVia: 'membership',
  admittedAt: 1,
})

describe('market registry graduation workload authority', () => {
  it('preserves valid graduation and sweep outcomes through the registered handlers', async () => {
    const runQuery = vi.fn(async (reference) => {
      const name = getFunctionName(reference)
      if (name === getFunctionName(internal.workloadCron.reconcile)) return WORKLOAD
      if (name === getFunctionName(internal.marketExternalRegistry.admissionCandidate)) {
        return { kind: 'not_found' as const }
      }
      if (name === getFunctionName(internal.marketExternalRegistry.admissionCandidates)) {
        return {
          kind: 'page' as const,
          candidates: [
            { documentId: 'registry:one', sourceDigest: `sha256:${'1'.repeat(64)}` },
            { documentId: 'registry:two', sourceDigest: `sha256:${'2'.repeat(64)}` },
          ],
          isDone: false,
          continueCursor: 'cursor:next',
        }
      }
      throw new Error(`unexpected market query: ${name}`)
    })
    const runAction = vi.fn()
      .mockResolvedValueOnce({
        kind: 'graduated',
        documentId: 'registry:one',
        publicationRef: 'offering:one',
        published: true,
      })
      .mockResolvedValueOnce({
        kind: 'refused',
        documentId: 'registry:two',
        reason: 'probe_refused',
      })
    const runAfter = vi.fn(async () => 'scheduled:next')
    const actionContext = {
      runQuery,
      runAction,
      runMutation: vi.fn(),
      scheduler: { runAfter },
    }

    const runHandler = (marketGraduationRun as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    await expect(runHandler(actionContext, {
      documentId: 'registry:missing',
      expectedSourceDigest: `sha256:${'0'.repeat(64)}`,
      workload: WORKLOAD,
    })).resolves.toEqual({ kind: 'not_found' })

    const sweepHandler = (marketGraduationSweep as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    await expect(sweepHandler(actionContext, {
      generation: 'generation:current',
      cursor: null,
      workload: WORKLOAD,
    })).resolves.toEqual({ kind: 'advanced', attempted: 2, graduated: 1 })
    expect(runAction.mock.calls.map(([, args]) => args)).toEqual([
      {
        documentId: 'registry:one',
        expectedSourceDigest: `sha256:${'1'.repeat(64)}`,
        workload: WORKLOAD,
      },
      {
        documentId: 'registry:two',
        expectedSourceDigest: `sha256:${'2'.repeat(64)}`,
        workload: WORKLOAD,
      },
    ])
    expect(runAfter).toHaveBeenCalledWith(
      1_000,
      internal.marketRegistryGraduation.sweep,
      {
        generation: 'generation:current',
        cursor: 'cursor:next',
        workload: WORKLOAD,
      },
    )
  })

  it('fails closed before market work when the canonical workload is missing or forged', async () => {
    const backend = convexTestWithMarketComponents()
    await expect(backend.action(
      internal.marketRegistryGraduation.run,
      {
        documentId: 'registry:missing-workload',
        expectedSourceDigest: `sha256:${'3'.repeat(64)}`,
      } as never,
    )).rejects.toThrow()

    const runQuery = vi.fn()
    const handler = (marketGraduationRun as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    await expect(handler({ runQuery }, {
      documentId: 'registry:forged-workload',
      expectedSourceDigest: `sha256:${'4'.repeat(64)}`,
      workload: { ...WORKLOAD, actorPrincipalRef: `prn_${'f'.repeat(32)}` },
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(runQuery).not.toHaveBeenCalled()
  })

  it('preserves admitted x402 graduation while rechecking source and binding the mutation', async () => {
    const paymentRequired = validatePaymentRequired(timezonePin.paymentRequired)
    if (paymentRequired.x402Version !== 2) throw new Error('expected x402 v2 fixture')
    networkBoundary.validateTarget.mockResolvedValue(true)
    networkBoundary.send.mockResolvedValue(new Response(null, {
      status: 402,
      headers: {
        'payment-required': encodeX402PaymentRequiredHeader(paymentRequired as X402PaymentRequired),
      },
    }))
    const candidate = {
      documentId: `registry:${'a'.repeat(64)}`,
      sourceDigest: `sha256:${'b'.repeat(64)}`,
      probeRequest: {
        method: 'GET' as const,
        url: timezonePin.requestUrl,
        headers: [],
      },
    }
    const runHandler = (marketGraduationRun as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler

    for (const published of [1, 0]) {
      let candidateReads = 0
      const runQuery = vi.fn(async (reference) => {
        const name = getFunctionName(reference)
        if (name === getFunctionName(internal.workloadCron.reconcile)) return WORKLOAD
        if (name === getFunctionName(internal.marketExternalRegistry.admissionCandidate)) {
          candidateReads += 1
          return { kind: 'found' as const, candidate }
        }
        throw new Error(`unexpected market query: ${name}`)
      })
      const runMutation = vi.fn(async () => ({ published }))
      await expect(runHandler({ runQuery, runMutation }, {
        documentId: candidate.documentId,
        expectedSourceDigest: candidate.sourceDigest,
        workload: WORKLOAD,
      })).resolves.toEqual({
        kind: 'graduated',
        documentId: candidate.documentId,
        publicationRef: expect.any(String),
        published: published === 1,
      })
      expect(candidateReads).toBe(2)
      expect(runMutation).toHaveBeenCalledWith(
        internal.workloadCron.dispatchConsequence,
        expect.objectContaining({
          name: WORKLOAD.name,
          snapshot: WORKLOAD,
          operation: 'facilitatorDiscovery:reconcile',
        }),
      )
    }

    const changedRunQuery = vi.fn()
      .mockResolvedValueOnce(WORKLOAD)
      .mockResolvedValueOnce({ kind: 'found', candidate })
      .mockResolvedValueOnce({ kind: 'source_changed' })
    const changedRunMutation = vi.fn()
    await expect(runHandler({ runQuery: changedRunQuery, runMutation: changedRunMutation }, {
      documentId: candidate.documentId,
      expectedSourceDigest: candidate.sourceDigest,
      workload: WORKLOAD,
    })).resolves.toEqual({ kind: 'source_changed' })
    expect(changedRunMutation).not.toHaveBeenCalled()

    networkBoundary.validateTarget.mockResolvedValueOnce(false)
    const refusedRunQuery = vi.fn()
      .mockResolvedValueOnce(WORKLOAD)
      .mockResolvedValueOnce({ kind: 'found', candidate })
    await expect(runHandler({ runQuery: refusedRunQuery, runMutation: vi.fn() }, {
      documentId: candidate.documentId,
      expectedSourceDigest: candidate.sourceDigest,
      workload: WORKLOAD,
    })).resolves.toEqual({
      kind: 'refused',
      documentId: candidate.documentId,
      reason: 'target_invalid',
    })
    expect(refusedRunQuery).toHaveBeenCalledTimes(2)
  })

  it('preserves complete and stale sweep outcomes without duplicate scheduling', async () => {
    const sweepHandler = (marketGraduationSweep as unknown as {
      _handler: (ctx: unknown, args: unknown) => Promise<unknown>
    })._handler
    const staleRunQuery = vi.fn()
      .mockResolvedValueOnce(WORKLOAD)
      .mockResolvedValueOnce({ kind: 'stale_generation' })
    const staleRunAction = vi.fn()
    const staleRunAfter = vi.fn()
    await expect(sweepHandler({
      runQuery: staleRunQuery,
      runAction: staleRunAction,
      scheduler: { runAfter: staleRunAfter },
    }, {
      generation: 'generation:stale',
      cursor: null,
      workload: WORKLOAD,
    })).resolves.toEqual({ kind: 'stale_generation', attempted: 0, graduated: 0 })
    expect(staleRunAction).not.toHaveBeenCalled()
    expect(staleRunAfter).not.toHaveBeenCalled()

    const completeRunQuery = vi.fn()
      .mockResolvedValueOnce(WORKLOAD)
      .mockResolvedValueOnce({
        kind: 'page',
        candidates: [
          { documentId: 'registry:refused', sourceDigest: `sha256:${'c'.repeat(64)}` },
          { documentId: 'registry:unpublished', sourceDigest: `sha256:${'d'.repeat(64)}` },
        ],
        isDone: true,
        continueCursor: 'cursor:done',
      })
    const completeRunAction = vi.fn()
      .mockResolvedValueOnce({ kind: 'refused', documentId: 'registry:refused', reason: 'target_invalid' })
      .mockResolvedValueOnce({
        kind: 'graduated',
        documentId: 'registry:unpublished',
        publicationRef: 'offering:unpublished',
        published: false,
      })
    const completeRunAfter = vi.fn()
    await expect(sweepHandler({
      runQuery: completeRunQuery,
      runAction: completeRunAction,
      scheduler: { runAfter: completeRunAfter },
    }, {
      generation: 'generation:complete',
      cursor: 'cursor:current',
      workload: WORKLOAD,
    })).resolves.toEqual({ kind: 'complete', attempted: 2, graduated: 0 })
    expect(completeRunAfter).not.toHaveBeenCalled()
  })
})
