/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { verifyCustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import type { CustomerRequestServiceAssertion } from '@/modules/agent-access/service-auth-envelope'
import { readMarketFlowVolumes } from '@/modules/market/market-flow.server'
import * as marketFlowFunctions from '@/modules/market/market-flow.functions'
import { convexTestWithMarketComponents } from '../../helpers/convex-fixtures'

const SERVER_KEY = 'market-flow-lookup-test-token-at-least-32-chars'
const payTo = `0x${'ab'.repeat(20)}`
const lookupVolumes = makeFunctionReference<'action', {
  payTos: string[]
  serviceAuth: CustomerRequestServiceAssertion
}, { payTo: string; amountAtomic: string }[]>('marketFlowRefresh:lookupVolumes')

function unsigned(): CustomerRequestServiceAssertion {
  return {
    principalId: 'ae:server-function',
    ownerId: 'ae:server-function',
    credentialId: 'ae:server-function',
    scopes: ['market_flow:lookup'],
    issuedAt: Date.now(),
    signature: 'unsigned',
  }
}

describe('market flow volume lookup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setPublicSourceTransportForTests(undefined)
    delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  })

  it('does not expose a public page function for fresh Coinbase lookups', () => {
    expect(marketFlowFunctions).not.toHaveProperty('readMarketFlowVolumesServer')
  })

  it('refuses an unsigned lookup before any Coinbase request', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVER_KEY
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const backend = convexTestWithMarketComponents()
    await expect(backend.action(lookupVolumes, { payTos: [payTo], serviceAuth: unsigned() }))
      .rejects.toThrow(/authentication_required/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs the bounded payee list for the server-owned lookup', async () => {
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVER_KEY
    const calls: unknown[] = []
    setPublicSourceTransportForTests({
      query: () => Promise.reject(new Error('query_not_used')),
      mutation: () => Promise.reject(new Error('mutation_not_used')),
      action: (_action, args) => {
        calls.push(args)
        return Promise.resolve([])
      },
    })
    await expect(readMarketFlowVolumes([payTo, payTo])).resolves.toEqual([])
    expect(calls).toHaveLength(1)
    const call = calls[0] as { payTos: string[]; serviceAuth: CustomerRequestServiceAssertion }
    expect(call.payTos).toEqual([payTo, payTo])
    await expect(verifyCustomerRequestServiceAssertion({
      key: SERVER_KEY,
      operation: 'marketFlowRefresh.lookupVolumes',
      command: { payTos: [payTo, payTo] },
      assertion: call.serviceAuth,
    })).resolves.toBe(true)
  })
})
