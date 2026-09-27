import { afterEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import {
  currentUtcMonthBounds,
  enrichAgentDirectoryActivity,
  loadAgentDirectoryReadback,
  projectAgentDirectory,
} from '@/modules/agent-access/agent-access-console'
import type { AgentCredentialSource, AgentOwnerPolicyReadback, AgentOwnerReadback } from '@/modules/agent-access/agent-operator-view-model'
import type { AgentAccessOwnerGrantReadback } from '@/modules/agent-access/policy'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const transport = vi.hoisted(() => ({ query: vi.fn(), action: vi.fn(), keys: vi.fn() }))
vi.mock('@/lib/server/convex-source', async (original) => ({
  ...await original<typeof import('@/lib/server/convex-source')>(),
  createAuthenticatedSourceTransport: async () => transport,
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
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

describe('owner Agent projection', () => {
  it('preserves available owner activity and usage with no surviving keys or grants', async () => {
    const credentials: readonly AgentCredentialSource[] = []
    const directory = projectAgentDirectory(credentials, [canonical], [], [owner])
    expect(directory.items).toHaveLength(1)
    expect(directory.details[0]).toMatchObject({ activity: [call], usage: owner.usage, dataState: 'source', activityTruncated: true })
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
      { callRef: 'call:two', credentialRef: 'key:two' }, { callRef: 'call:one', credentialRef: 'key:one' },
    ])
    expect(directory.details[0]?.usage?.callCount).toBe(51)
  })

  it('enriches current toolRef without replacing Call or payment evidence', async () => {
    const compare = vi.fn(async () => ({ kind: 'ok' as const, tools: [{ toolRef: call.toolRef, listing: { label: 'Weather now' }, business: { name: 'Weather Co' } }] }))
    const directory = await enrichAgentDirectoryActivity(projectAgentDirectory([], [canonical], [], [owner]), {
      compare, isToolRef: (value) => value === call.toolRef,
    })
    expect(compare).toHaveBeenCalledWith({ toolRefs: [call.toolRef] })
    expect(directory.details[0]?.activity[0]).toEqual({ ...call, tool: { label: 'Weather now', provider: 'Weather Co' } })
  })

  it('uses UTC calendar boundaries including year rollover', () => {
    expect(currentUtcMonthBounds(Date.parse('2026-12-31T23:59:59.999Z'))).toEqual({
      periodStartAt: Date.UTC(2026, 11, 1), periodEndAt: Date.UTC(2027, 0, 1),
    })
  })

  it.each([false, true])('loads canonical Agents independently of keys with one shared Account balance (locked=%s)', async (locked) => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 8, 7))
    transport.keys.mockResolvedValue([])
    const rotated: AgentCredentialSource = { ...source, key: { ...source.key, keyId: 'key:two', createdAt: 20 } }
    const firstCanonical = canonicalAgentRecord([source, rotated])
    const balance = { kind: 'available', accountRef: 'account:owner', balance: { currency: 'AUD', exponent: 6, units: '123456789' }, locked, version: 1 }
    transport.action.mockResolvedValue(balance)
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
    const directory = await loadAgentDirectoryReadback({ compare: async () => ({ kind: 'unavailable' }), isToolRef: () => false })
    expect(directory.accountBalance).toEqual(balance)
    expect(transport.action).toHaveBeenCalledTimes(1)
    expect(getFunctionName(transport.action.mock.calls[0]![0])).toBe('moneyAccountFundingFormance:readBalance')
    expect(transport.action.mock.calls[0]![1]).toEqual({})
    expect(directory.nextCursor).toBe('opaque:directory')
    expect(directory.activityCoverage).toBe('recent')
    expect(directory.items).toHaveLength(2)
    const firstAgent = directory.details.find(({ agent }) => agent.principalRef === principalRef)
    const secondAgent = directory.details.find(({ agent }) => agent.principalRef === secondPrincipalRef)
    expect(firstAgent).toMatchObject({ activity: [call], dataState: 'source', usage: { callCount: 51, amountCoverage: 'incomplete' },
      spendingPolicy: { kind: 'unavailable' }, agent: { spendingPolicy: { kind: 'unavailable' } } })
    expect(firstAgent?.credentials).toHaveLength(2)
    expect(firstAgent?.activity).toHaveLength(1)
    expect(firstAgent?.usage).not.toHaveProperty('settledSpend')
    expect(secondAgent).toMatchObject({ activity: [], dataState: 'empty',
      spendingPolicy: { kind: 'expired', expiresAt: period.periodStartAt },
      agent: { spendingPolicy: { kind: 'expired' } } })
    expect(secondAgent?.agent.principalRef).toBe(secondPrincipalRef)
  })

  it('preserves refused balance and unavailable activity without inventing zero values', async () => {
    transport.keys.mockResolvedValue([])
    transport.action.mockResolvedValue({ kind: 'refused', code: 'billing_identity_missing', retryable: false })
    transport.query.mockImplementation(async (ref) => {
      if (getFunctionName(ref) === 'agentDirectory:listOwnedPage') return { page: [canonical], isDone: true, continueCursor: '' }
      if (getFunctionName(ref) === 'capabilityCallProjections:readOwnerAgentReadback') throw new Error('unavailable')
      return []
    })
    const directory = await loadAgentDirectoryReadback({ compare: async () => ({ kind: 'unavailable' }), isToolRef: () => false })
    expect(directory.accountBalance?.kind).toBe('refused')
    expect(directory.details[0]).toMatchObject({ dataState: 'unavailable', activity: [] })
    expect(directory.details[0]).not.toHaveProperty('usage')
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
