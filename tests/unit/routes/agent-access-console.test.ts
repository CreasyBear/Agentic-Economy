import { describe, expect, it } from 'vitest'

import {
  enrichAgentDirectoryActivity,
  projectAgentDirectory,
  readAgentCredentialSources,
} from '@/modules/agent-access/agent-access-console'
import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import type { ChargeState, MoneyQueryPort } from '@/modules/money/public'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'

const ownerId = 'owner-console-1'
const principalId = `prn_${'1'.repeat(32)}`

const key: AgentAccessKeyInventoryItem = {
  keyId: 'key_console_1',
  name: 'Console assistant',
  applicationRef: 'agentic-economy',
  environment: 'sandbox',
  authorityMode: 'read_only',
  scopes: ['market_tools:call', 'customer_requests:read_only'],
  revoked: false,
  expired: false,
}

const account = {
  principalId,
  accountId: ownerId,
  balance: { currency: 'USD', units: '2500', exponent: 2 },
  autoRecharge: {
    enabled: false,
    threshold: { currency: 'USD', units: '0', exponent: 2 },
    rechargeAmount: { currency: 'USD', units: '0', exponent: 2 },
  },
  evidence: 'labelled_local_dev' as const,
}

const usage = {
  activityRef: 'usage-console-1',
  credentialId: key.keyId,
  serviceRef: 'service:quote',
  offeringRef: 'offering:quote',
  businessId: 'business:one',
  callRef: 'invocation:one',
  attemptRef: 'attempt:one',
  operationKey: 'quote.latest',
  priceDigest: 'price:one',
  chargeState: 'paid' as ChargeState,
  grossAmount: { currency: 'USD', units: '500', exponent: 2 },
  transactionRef: 'transaction:one',
  observedAt: 10,
}

function moneyPort(operationKey = usage.operationKey): MoneyQueryPort {
  const activity = { ...usage, operationKey }
  return {
    readCreditAccount: async () => account,
    listCreditActivity: async () => ({ page: [activity], isDone: true, continueCursor: '' }),
    readKeyUsage: async () => ({
      credentialId: key.keyId,
      callCount: 1,
      paidCallCount: 1,
      freeCallCount: 0,
      grossSpend: usage.grossAmount,
      states: ['paid'] as const,
    }),
    readProviderEarnings: async () => { throw new Error('unused') },
    readPayoutStatus: async () => { throw new Error('unused') },
  }
}

const grant = {
  principalId,
  credentialId: key.keyId,
  applicationRef: key.applicationRef,
  environment: key.environment,
  authorityMode: key.authorityMode,
  toolAccess: 'all_admitted' as const,
  toolRefs: [],
  lifecycle: 'active' as const,
  expiresAt: 10_000,
  budget: {
    maximumSpendPerCall: { currency: 'USD', units: '100', exponent: 2 },
    maximumDailySpend: { currency: 'USD', units: '500', exponent: 2 },
    maximumMonthlySpend: { currency: 'USD', units: '2000', exponent: 2 },
    maximumConcurrentCalls: 1,
  },
  rate: { maximumCallsPerMinute: 10, maximumCallsPerHour: 100 },
}

describe('agent access money seam', () => {
  it('reads exact key balance, bounded activity, and per-key spend from the public query port', async () => {
    const [result] = await readAgentCredentialSources([key], moneyPort(), [grant])

    expect(result).toMatchObject({
      principalId,
      account: { balance: { currency: 'USD', units: '2500', exponent: 2 }, evidence: 'labelled_local_dev' },
      dataState: 'source',
    })
    expect(result?.activity).toHaveLength(1)
    expect(result?.activity[0]).toMatchObject({ credentialId: 'key_console_1', grossAmount: { currency: 'USD', units: '500', exponent: 2 }, chargeState: 'paid' })
    expect(result?.usage).toMatchObject({ credentialId: 'key_console_1', callCount: 1, paidCallCount: 1, grossSpend: { currency: 'USD', units: '500', exponent: 2 } })
  })

  it('projects canonical Tool and Provider labels onto task activity', async () => {
    const toolRef = `operation:v1:${'a'.repeat(64)}`
    const [readback] = await readAgentCredentialSources([key], moneyPort(toolRef), [grant])
    if (readback === undefined) throw new Error('expected agent readback')
    const enriched = await enrichAgentDirectoryActivity(projectAgentDirectory(
      [readback],
      [canonicalAgentRecord([readback])],
    ), {
      isToolRef: (value) => value === toolRef,
      compare: async ({ toolRefs }) => {
        expect(toolRefs).toEqual([toolRef])
        return {
          kind: 'ok',
          tools: [{
            toolRef,
            offering: { label: 'Extract invoice fields' },
            business: { name: 'Ledger Labs' },
          }],
        }
      },
    })

    expect(enriched.details[0]?.activity[0]?.tool).toEqual({
      label: 'Extract invoice fields',
      provider: 'Ledger Labs',
    })
    expect(enriched.details[0]?.activity[0]).not.toHaveProperty('operation')
    expect(enriched.details[0]?.activity[0]).not.toHaveProperty('supplier')
  })

  it('groups multiple credentials by canonical principal without merging independent agents', () => {
    const secondCredential = {
      key: { ...key, keyId: 'key_console_2', createdAt: 20 },
      grant: { ...grant, credentialId: 'key_console_2' },
      principalId,
      activity: [],
      dataState: 'empty' as const,
    }
    const otherPrincipal = {
      key: { ...key, keyId: 'key_console_3', name: 'Independent agent', createdAt: 30 },
      grant: { ...grant, principalId: `prn_${'2'.repeat(32)}`, credentialId: 'key_console_3' },
      principalId: `prn_${'2'.repeat(32)}`,
      activity: [],
      dataState: 'empty' as const,
    }
    const firstCredential = {
      key: { ...key, createdAt: 10 },
      grant,
      principalId,
      activity: [],
      dataState: 'empty' as const,
    }
    const directory = projectAgentDirectory(
      [firstCredential, secondCredential, otherPrincipal],
      [
        canonicalAgentRecord([firstCredential, secondCredential]),
        canonicalAgentRecord([otherPrincipal]),
      ],
    )

    expect(directory.items).toHaveLength(2)
    expect(directory.details.find(({ agent }) => agent.principalRef === principalId)?.credentials)
      .toHaveLength(2)
    expect(directory.details.find(({ agent }) => agent.principalRef === otherPrincipal.principalId)?.credentials)
      .toHaveLength(1)
    expect(JSON.stringify(directory)).not.toContain('secret')
  })

  it('keeps current credential authentication separate from broader Agent activity', () => {
    const source = {
      key: { ...key, createdAt: 90_000 },
      grant,
      principalId,
      activity: [],
      dataState: 'source' as const,
    }
    const canonical = canonicalAgentRecord([source])
    const current = canonical.credentials[0]
    if (current === undefined) throw new Error('expected canonical credential')

    const directory = projectAgentDirectory([source], [{
      ...canonical,
      lastSeenAt: 150_000,
      credentials: [{ ...current, lastAuthenticatedAt: 60_000 }],
    }])

    expect(directory.items[0]).toMatchObject({
      lastAuthenticatedAt: 60_000,
      lastSeenAt: 150_000,
    })
    expect(directory.details[0]?.credentials[0]).toMatchObject({
      lastAuthenticatedAt: 60_000,
    })
  })

})
