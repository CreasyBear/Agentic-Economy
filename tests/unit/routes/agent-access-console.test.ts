import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { createAuthenticatedSourceTransport } from '@/lib/server/convex-source'
import { SOURCE_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import {
  currentUtcMonthBounds,
  loadAgentDirectoryReadback,
  projectAgentDirectory,
} from '@/modules/agent-access/agent-access-console'
import type { AgentCredentialSource, AgentOwnerPolicyReadback, AgentOwnerReadback } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const transport = vi.hoisted(() => ({ query: vi.fn(), action: vi.fn(), keys: vi.fn() }))
vi.mock('@/lib/server/convex-source', async (original) => ({
  ...await original<typeof import('@/lib/server/convex-source')>(),
  createAuthenticatedSourceTransport: vi.fn(async () => transport),
}))
vi.mock('@/modules/agent-access/agent-access.functions', () => ({ listAgentAccessKeysServer: transport.keys }))

const principalRef = `prn_${'1'.repeat(32)}`
const secondPrincipalRef = `prn_${'2'.repeat(32)}`
const source: AgentCredentialSource = {
  key: { keyId: 'key:one', name: 'Assistant', applicationRef: 'app:one', environment: 'sandbox', authorityMode: 'read_only', scopes: [], revoked: false, expired: false },
  principalId: principalRef,
  activity: [],
  dataState: 'source',
}
const canonical = canonicalAgentRecord([source])
const secondSource: AgentCredentialSource = {
  ...source,
  key: { ...source.key, keyId: 'key:second', name: 'Assistant', createdAt: 10 },
  principalId: secondPrincipalRef,
}
const secondCanonical = canonicalAgentRecord([secondSource])
const period = currentUtcMonthBounds(Date.UTC(2026, 8, 7))
const call = {
  callRef: 'call:one', credentialRef: 'key:one',
  toolRef: 'tool:one', toolLabel: 'Weather', providerRef: 'provider:one',
  state: 'completed' as const, deliveryState: 'delivered' as const,
  paymentState: 'settled' as const, audAmountUnits: '9007199254740993',
  createdAt: period.periodStartAt, updatedAt: period.periodStartAt + 100,
}
const owner: AgentOwnerReadback = {
  principalRef, activity: [call], activityIsDone: false, activityContinueCursor: 'opaque:activity',
  usage: { ...period, callCount: 51, completedCallCount: 50, outcomeUnknownCallCount: 1,
    settledSpend: { currency: 'AUD', exponent: 6, units: '9007199254740993' },
    amountCoverage: 'complete', updatedAt: call.updatedAt },
  dataState: 'source',
}
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers() })

describe('owner Agent projection', () => {
  it('preserves available owner activity and usage with no surviving keys or grants', async () => {
    const credentials: readonly AgentCredentialSource[] = []
    const directory = projectAgentDirectory(credentials, [canonical], [], [owner])
    expect(directory.items).toHaveLength(1)
    expect(directory.items[0]?.usage).toEqual(owner.usage)
    expect(directory.details[0]).toMatchObject({ activity: [{ ...call, credentialRef: 'credential:key:one' }], usage: owner.usage, dataState: 'source', activityTruncated: true })
    expect(directory.details[0]?.credentials).toEqual(expect.arrayContaining([expect.objectContaining({ credentialRef: 'credential:key:one' })]))
    expect(directory.details[0]).not.toHaveProperty('account')
  })

  it('counts one Agent across rotation and retains each Call credential attribution once', () => {
    const rotated: AgentCredentialSource = { ...source, key: { ...source.key, keyId: 'key:two', createdAt: 20 } }
    const newer = { ...call, callRef: 'call:two', credentialRef: 'key:two', createdAt: call.createdAt + 1, updatedAt: call.updatedAt - 1 }
    const directory = projectAgentDirectory([source, rotated], [canonicalAgentRecord([source, rotated])], [], [{
      ...owner, activity: [call, newer, call],
    }])
    expect(directory.items).toHaveLength(1)
    expect(directory.details[0]?.credentials).toHaveLength(2)
    expect(directory.details[0]?.activity.map(({ callRef, credentialRef }) => ({ callRef, credentialRef }))).toEqual([
      { callRef: 'call:two', credentialRef: 'credential:key:two' }, { callRef: 'call:one', credentialRef: 'credential:key:one' },
    ])
    expect(directory.details[0]?.usage?.callCount).toBe(51)
  })

  it('maps only proven credential bindings for terminal and live Calls, preserving unrecognized attribution', () => {
    const rotated: AgentCredentialSource = { ...source, key: { ...source.key, keyId: 'key:two', createdAt: 20 } }
    const externalRefs = ['key:one', 'key:two', 'key:unknown']
    const activity = externalRefs.map((credentialRef, index) => ({ ...call, callRef: `call:${index}`, credentialRef }))
    const liveCalls = activity.map(({ callRef, credentialRef, toolRef, createdAt, updatedAt }) => ({
      callRef, credentialRef, toolRef, createdAt, updatedAt, phase: 'running' as const,
    }))
    const directory = projectAgentDirectory([], [canonicalAgentRecord([source, rotated])], [], [{ ...owner, activity, liveCalls }])
    const detail = directory.details[0]!
    expect(detail.currentCredentialRef).toBe('credential:key:two')
    expect(detail.activity.map(item => item.credentialRef)).toEqual(['credential:key:one', 'credential:key:two', 'key:unknown'])
    expect(detail.liveCalls?.map(item => item.credentialRef)).toEqual(['credential:key:one', 'credential:key:two', 'key:unknown'])
    expect(activity.map(item => item.credentialRef)).toEqual(externalRefs)
    expect(liveCalls.map(item => item.credentialRef)).toEqual(externalRefs)
  })


  it('keeps exact Call progress when monthly usage exceeds its reporting limit', async () => {
    transport.keys.mockResolvedValue([])
    transport.query.mockImplementation(async (ref, args) => {
      switch (getFunctionName(ref)) {
        case 'agentDirectory:listOwnedPage': return { page: [canonical], isDone: true, continueCursor: '' }
        case 'agentAccessPolicy:listOwnerGrantReadbacks': return []
        case 'agentAccessOAuth:listOwnerConnectionReadbacks': return []
        case 'capabilityCallProjections:readOwnerAgentReadback':
          expect(args.callRef).toBe(call.callRef)
          return { activity: { page: [], isDone: true, continueCursor: '' }, usage: { kind: 'unavailable', code: 'usage_window_too_large' },
            watchedCall: { kind: 'observed', live: { ...call, phase: 'finished' }, activity: { ...call, receiptRef: 'receipt:old', accountRef: 'private-source-account' } } }
        default: throw new Error('Unexpected query')
      }
    })
    const directory = await loadAgentDirectoryReadback(null, principalRef, call.callRef)
    expect(directory.details[0]).toMatchObject({ usageUnavailable: true, watchedCall: { kind: 'observed', activity: { callRef: call.callRef, receiptRef: 'receipt:old' } } })
    expect(directory.details[0]?.dataState).not.toBe('unavailable')
    expect(directory.details[0]).not.toHaveProperty('usage')
    expect(JSON.stringify(directory)).not.toContain('private-source-account')
  })

  it('uses UTC calendar boundaries including year rollover', () => {
    expect(currentUtcMonthBounds(Date.parse('2026-12-31T23:59:59.999Z'))).toEqual({
      periodStartAt: Date.UTC(2026, 11, 1), periodEndAt: Date.UTC(2027, 0, 1),
    })
  })

  it('loads canonical Agents without asking the money rail or optional catalogue to serve the directory', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 7))
    transport.keys.mockResolvedValue([])
    const rotated: AgentCredentialSource = { ...source, key: { ...source.key, keyId: 'key:two', createdAt: 20 } }
    const firstCanonical = canonicalAgentRecord([source, rotated])
    transport.action.mockRejectedValue(new Error('Formance unavailable'))
    transport.query.mockImplementation(async (ref, args) => {
      switch (getFunctionName(ref)) {
        case 'agentAccessPolicy:listOwnerGrantReadbacks':
          expect(args).toEqual({ principalRefs: [principalRef, secondPrincipalRef] })
          return [{ principalRef, spendingPolicy: { kind: 'unavailable' } }, {
            principalRef: secondPrincipalRef, spendingPolicy: { kind: 'expired', expiresAt: period.periodStartAt },
          }]
        case 'agentDirectory:listOwnedPage':
          expect(args.paginationOpts).toEqual({ numItems: 25, cursor: null })
          return { page: [firstCanonical, secondCanonical], isDone: false, continueCursor: 'opaque:directory' }
        case 'agentAccessOAuth:listOwnerConnectionReadbacks': return []
        case 'capabilityCallProjections:readOwnerAgentReadback':
          if (args.principalRef === principalRef) {
            expect(args).toEqual({ principalRef, ...period, paginationOpts: { numItems: 50, cursor: null } })
            return {
              activity: { page: [call], isDone: false, continueCursor: 'opaque:activity' },
              usage: { kind: 'available', dimensionKind: 'agent', dimensionRef: principalRef, ...period,
                callCountUnits: '51', completedCountUnits: '50', outcomeUnknownCountUnits: '1',
                amountCoverage: 'incomplete', updatedAt: call.updatedAt, source: 'convex_call_evidence' },
            }
          }
          expect(args).toEqual({ principalRef: secondPrincipalRef, ...period, paginationOpts: { numItems: 50, cursor: null } })
          return {
            activity: { page: [], isDone: true, continueCursor: '' },
            usage: { kind: 'empty', dimensionKind: 'agent', dimensionRef: secondPrincipalRef, ...period },
          }
        default: throw new Error('Unexpected owner read')
      }
    })
    const directory = await loadAgentDirectoryReadback()
    expect(transport.action).not.toHaveBeenCalled()
    expect(directory.nextCursor).toBe('opaque:directory')
    expect(directory.activityCoverage).toBe('recent')
    expect(directory.items).toHaveLength(2)
    const firstAgent = directory.details.find(({ agent }) => agent.principalRef === principalRef)
    const secondAgent = directory.details.find(({ agent }) => agent.principalRef === secondPrincipalRef)
    expect(firstAgent).toMatchObject({ activity: [{ ...call, credentialRef: 'credential:key:one' }], dataState: 'source', usage: { callCount: 51, amountCoverage: 'incomplete' },
      spendingPolicy: { kind: 'unavailable' }, agent: { spendingPolicy: { kind: 'unavailable' } } })
    expect(firstAgent?.credentials).toHaveLength(2)
    expect(firstAgent?.activity).toHaveLength(1)
    expect(firstAgent?.usage).not.toHaveProperty('settledSpend')
    expect(secondAgent).toMatchObject({ activity: [], dataState: 'empty',
      spendingPolicy: { kind: 'expired', expiresAt: period.periodStartAt },
      agent: { spendingPolicy: { kind: 'expired' } } })
    expect(secondAgent?.agent.principalRef).toBe(secondPrincipalRef)
  })

  it('retains the canonical Agent and marks connections unknown when the OAuth read fails', async () => {
    transport.keys.mockResolvedValue([])
    transport.query.mockImplementation(async (ref) => {
      if (getFunctionName(ref) === 'agentDirectory:listOwnedPage') return { page: [canonical], isDone: true, continueCursor: '' }
      if (getFunctionName(ref) === 'agentAccessOAuth:listOwnerConnectionReadbacks') throw new Error('OAuth unavailable')
      if (getFunctionName(ref) === 'capabilityCallProjections:readOwnerAgentReadback') throw new Error('activity unavailable')
      return []
    })
    const directory = await loadAgentDirectoryReadback()
    expect(directory.items).toMatchObject([{ principalRef, connectionsAvailable: false }])
    expect(directory.details[0]).toMatchObject({ connectionsAvailable: false, dataState: 'unavailable', activity: [] })
    expect(directory.details[0]).not.toHaveProperty('usage')
    expect(transport.action).not.toHaveBeenCalled()
  })

  it('keeps canonical credentials visible when the optional Clerk key inventory fails', async () => {
    transport.keys.mockRejectedValue(new Error('Clerk inventory unavailable'))
    transport.query.mockImplementation(async (ref) => {
      if (getFunctionName(ref) === 'agentDirectory:listOwnedPage') return { page: [canonical], isDone: true, continueCursor: '' }
      return []
    })
    const directory = await loadAgentDirectoryReadback()
    expect(directory.items).toMatchObject([{ principalRef, displayName: canonical.displayName }])
    expect(directory.details[0]?.credentials).toHaveLength(1)
    expect(directory.details[0]?.agent.authorityMode).toBe(canonical.authorityMode)
  })

  it('bounds a stalled OAuth connection read without presenting its absence as legacy access', async () => {
    transport.keys.mockResolvedValue([])
    transport.query.mockImplementation(async (ref) => {
      if (getFunctionName(ref) === 'agentDirectory:listOwnedPage') return { page: [canonical], isDone: true, continueCursor: '' }
      if (getFunctionName(ref) === 'agentAccessOAuth:listOwnerConnectionReadbacks') return await Promise.withResolvers<never>().promise
      return []
    })
    const startedAt = performance.now()
    const directory = await loadAgentDirectoryReadback()
    expect(performance.now() - startedAt).toBeLessThan(4_500)
    expect(directory.items).toMatchObject([{ principalRef, connectionsAvailable: false }])
  }, 5_000)

  it('retains canonical Agents when all optional reads stall, then cancels their transport', async () => {
    vi.useFakeTimers()
    transport.keys.mockReturnValue(Promise.withResolvers<never>().promise)
    transport.query.mockImplementation(async ref => getFunctionName(ref) === 'agentDirectory:listOwnedPage'
      ? { page: [canonical], isDone: false, continueCursor: 'opaque:next' }
      : await Promise.withResolvers<never>().promise)
    const pending = loadAgentDirectoryReadback()

    await vi.advanceTimersByTimeAsync(3_000)
    const directory = await pending

    expect(directory.items).toMatchObject([{ principalRef, connectionsAvailable: false, spendingPolicy: { kind: 'unavailable' } }])
    expect(directory.details[0]).toMatchObject({ dataState: 'unavailable', activity: [] })
    expect(directory.details[0]).not.toHaveProperty('usage')
    expect(directory.nextCursor).toBe('opaque:next')
    expect(createAuthenticatedSourceTransport).toHaveBeenCalledOnce()
    expect(vi.mocked(createAuthenticatedSourceTransport).mock.calls[0]?.[0]?.signal?.aborted).toBe(true)
  })

  it('bounds authentication and never starts the primary query after its deadline', async () => {
    vi.useFakeTimers()
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('Directory deadline', 'TimeoutError')), ms)
      return controller.signal
    })
    transport.keys.mockResolvedValue([])
    const authentication = Promise.withResolvers<Awaited<ReturnType<typeof createAuthenticatedSourceTransport>>>()
    vi.mocked(createAuthenticatedSourceTransport).mockReturnValueOnce(authentication.promise)
    const pending = expect(loadAgentDirectoryReadback()).rejects.toMatchObject({ name: 'TimeoutError' })

    await vi.advanceTimersByTimeAsync(SOURCE_READ_TIMEOUT_MS)
    await pending
    authentication.resolve({ query: transport.query, action: transport.action, mutation: vi.fn() })
    await authentication.promise
    expect(transport.query).not.toHaveBeenCalled()
  })

  it('rejects an aborted Account request without reading protected sources', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(loadAgentDirectoryReadback(null, undefined, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(createAuthenticatedSourceTransport).not.toHaveBeenCalled()
    expect(transport.query).not.toHaveBeenCalled()
    expect(transport.keys).not.toHaveBeenCalled()
  })

  it('rejects cancellation during enrichment instead of returning a late private projection', async () => {
    transport.keys.mockResolvedValue([])
    const started = Promise.withResolvers<void>()
    const optional = Promise.withResolvers<never[]>()
    transport.query.mockImplementation(async ref => {
      if (getFunctionName(ref) === 'agentDirectory:listOwnedPage') return { page: [canonical], isDone: true, continueCursor: '' }
      started.resolve()
      return await optional.promise
    })
    const controller = new AbortController()
    const pending = expect(loadAgentDirectoryReadback(null, undefined, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    controller.abort()
    await pending
    const dispatched = transport.query.mock.calls.length
    optional.resolve([])
    await optional.promise
    expect(transport.query).toHaveBeenCalledTimes(dispatched)
    expect(vi.mocked(createAuthenticatedSourceTransport).mock.calls[0]?.[0]?.signal?.aborted).toBe(true)
  })

  it('does not start enrichment when cancellation wins after the primary read', async () => {
    transport.keys.mockResolvedValue([])
    const started = Promise.withResolvers<void>()
    const primary = Promise.withResolvers<{ page: typeof canonical[]; isDone: boolean; continueCursor: string }>()
    transport.query.mockImplementation(ref => {
      if (getFunctionName(ref) === 'agentDirectory:listOwnedPage') {
        started.resolve()
        return primary.promise
      }
      return Promise.reject(new Error('optional read must not start after abort'))
    })
    const controller = new AbortController()
    const pending = expect(loadAgentDirectoryReadback(null, undefined, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    primary.resolve({ page: [canonical], isDone: true, continueCursor: '' })
    queueMicrotask(() => controller.abort())
    await pending
    expect(transport.query).toHaveBeenCalledOnce()
  })

  describe('W-25: Agent directory spend vs limit projection', () => {
    const testGrant: AgentAccessOwnerGrantReadback = {
      principalId: principalRef,
      credentialId: 'key:one',
      applicationRef: 'app:one',
      environment: 'sandbox',
      authorityMode: 'read_only',
      toolAccess: 'all_admitted',
      toolRefs: [],
      lifecycle: 'active',
      expiresAt: period.periodEndAt + 1000,
      budget: {
        maximumSpendPerCall: { currency: 'AUD', exponent: 6, units: '10000000' },
        maximumDailySpend: { currency: 'AUD', exponent: 6, units: '50000000' },
        maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '100000000' },
        maximumConcurrentCalls: 5,
      },
      rate: {
        maximumCallsPerMinute: 60,
        maximumCallsPerHour: 3600,
      },
    }
    const knownPolicy: AgentOwnerPolicyReadback = {
      principalRef,
      spendingPolicy: {
        kind: 'known', principalRef, grantRef: 'grant:one', generation: 1,
        spendingPolicyDigest: 'sha256:owner-grant',
        maximumSpendPerCall: testGrant.budget.maximumSpendPerCall,
        maximumDailySpend: testGrant.budget.maximumDailySpend,
        maximumMonthlySpend: testGrant.budget.maximumMonthlySpend,
        paused: false, expiresAt: testGrant.expiresAt,
      },
      grant: testGrant,
    }

    it('P1: lifts complete spend and authoritative policy limit onto list item and detail', async () => {
      const credentials: readonly AgentCredentialSource[] = [{ ...source, grant: testGrant }]
      const directory = projectAgentDirectory(credentials, [canonical], [], [owner], [knownPolicy])

      expect(directory.items).toHaveLength(1)
      const item = directory.items[0]
      expect(item).toMatchObject({
        monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '9007199254740993' },
        monthlyLimit: { currency: 'AUD', exponent: 6, units: '100000000' },
        monthlySpendCoverage: 'complete',
      })
      expect(directory.details[0]?.agent).toMatchObject({
        monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '9007199254740993' },
        monthlyLimit: { currency: 'AUD', exponent: 6, units: '100000000' },
        monthlySpendCoverage: 'complete',
      })
      expect(directory.details[0]?.spendingPolicy).toMatchObject({
        kind: 'known', principalRef, maximumMonthlySpend: { currency: 'AUD', exponent: 6, units: '100000000' },
      })
    })

    it('P2: empty usage projects spend 0, keeps limit', async () => {
      const credentials: readonly AgentCredentialSource[] = [{ ...source, grant: testGrant }]
      const emptyOwner: AgentOwnerReadback = {
        principalRef,
        activity: [],
        activityIsDone: true,
        usage: {
          ...period,
          callCount: 0,
          completedCallCount: 0,
          outcomeUnknownCallCount: 0,
          settledSpend: { currency: 'AUD', exponent: 6, units: '0' },
          amountCoverage: 'complete',
          updatedAt: period.periodStartAt,
        },
        dataState: 'empty',
      }
      const directory = projectAgentDirectory(credentials, [canonical], [], [emptyOwner], [knownPolicy])

      expect(directory.items[0]).toMatchObject({
        monthlySettledSpend: { currency: 'AUD', exponent: 6, units: '0' },
        monthlyLimit: { currency: 'AUD', exponent: 6, units: '100000000' },
        monthlySpendCoverage: 'complete',
      })
    })

    it('P3: unavailable usage does not invent spend', async () => {
      const credentials: readonly AgentCredentialSource[] = [{ ...source, grant: testGrant }]
      const unavailOwner: AgentOwnerReadback = {
        principalRef,
        activity: [],
        activityIsDone: true,
        dataState: 'unavailable',
      }
      const directory = projectAgentDirectory(credentials, [canonical], [], [unavailOwner], [knownPolicy])

      expect(directory.items[0]?.monthlyLimit).toEqual({ currency: 'AUD', exponent: 6, units: '100000000' })
      expect(directory.items[0]?.monthlySettledSpend).toBeUndefined()
      expect(directory.items[0]?.monthlySpendCoverage).toBeUndefined()
    })

    it('P4: incomplete coverage does not invent settled spend', async () => {
      const credentials: readonly AgentCredentialSource[] = [{ ...source, grant: testGrant }]
      const incompleteOwner: AgentOwnerReadback = {
        principalRef,
        activity: [call],
        activityIsDone: false,
        usage: {
          ...period,
          callCount: 5,
          completedCallCount: 5,
          outcomeUnknownCallCount: 0,
          amountCoverage: 'incomplete',
          updatedAt: call.updatedAt,
        },
        dataState: 'partial',
      }
      const directory = projectAgentDirectory(credentials, [canonical], [], [incompleteOwner], [knownPolicy])

      expect(directory.items[0]?.monthlyLimit).toEqual({ currency: 'AUD', exponent: 6, units: '100000000' })
      expect(directory.items[0]?.monthlySettledSpend).toBeUndefined()
      expect(directory.items[0]?.monthlySpendCoverage).toBe('incomplete')
    })

    it('P5: absent expected grant is unavailable despite settled spend', async () => {
      const credentials: readonly AgentCredentialSource[] = []
      const directory = projectAgentDirectory(credentials, [canonical], [], [owner],
        [{ principalRef, spendingPolicy: { kind: 'unavailable' } }])

      expect(directory.items[0]?.spendingPolicy).toEqual({ kind: 'unavailable' })
      expect(directory.items[0]?.monthlyLimit).toBeUndefined()
      expect(directory.items[0]?.monthlySettledSpend).toEqual({ currency: 'AUD', exponent: 6, units: '9007199254740993' })
      expect(directory.items[0]?.monthlySpendCoverage).toBe('complete')
    })

    it('does not infer a known policy from an unverified grant', async () => {
      const credentials: readonly AgentCredentialSource[] = [{ ...source, grant: testGrant }]
      const directory = projectAgentDirectory(credentials, [canonical], [], [owner])

      expect(directory.details[0]?.spendingPolicy).toEqual({ kind: 'unavailable' })
      expect(directory.items[0]?.monthlyLimit).toBeUndefined()
    })
  })
})
