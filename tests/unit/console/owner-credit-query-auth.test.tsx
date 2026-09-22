// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({
  auth: { isAuthenticated: true, isLoading: false },
  queries: [] as unknown[][],
  serverFn: vi.fn(async () => ({ kind: 'available', page: [] })),
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => runtime.auth,
  useQuery: (...args: unknown[]) => {
    if (!runtime.auth.isAuthenticated && args[1] !== 'skip') {
      throw new Error('protected_query_started_without_convex_auth')
    }
    runtime.queries.push(args)
    return undefined
  },
  useMutation: () => vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  useServerFn: () => runtime.serverFn,
}))

vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: vi.fn(),
}))

vi.mock('@/lib/server/call-history.functions', () => ({
  readOwnerAccountHistoryServer: vi.fn(),
  readOwnerSpendServer: vi.fn(),
}))

vi.mock('@/lib/server/money-documents.functions', () => ({
  createOwnerDailyCloseServer: vi.fn(),
  createOwnerStatementServer: vi.fn(),
  readOwnerMoneyDocumentsServer: vi.fn(),
  readOwnerMoneyReconciliationServer: vi.fn(),
  readOwnerProviderObligationsServer: vi.fn(),
  renderOwnerMoneyDocumentServer: vi.fn(),
  signOwnerDailyCloseServer: vi.fn(),
}))

vi.mock('@/modules/money/money.functions', () => ({
  beginAccountFundingServer: vi.fn(),
  createStripeCustomerPortalSessionServer: vi.fn(),
  readAccountFundingBalanceServer: vi.fn(),
  readAccountFundingConstraintsServer: vi.fn(),
  readAccountFundingServer: vi.fn(),
  readSavedPaymentMethodSummaryServer: vi.fn(),
  readStripeReceiptUrlServer: vi.fn(),
}))

import { useOwnerCredit } from '@/components/ae/console/owner-credit/useOwnerCredit'

describe('useOwnerCredit Convex query auth boundary', () => {
  beforeEach(() => {
    runtime.auth = { isAuthenticated: true, isLoading: false }
    runtime.queries = []
    runtime.serverFn.mockClear()
  })

  it('skips protected queries during Convex auth refresh and resumes after authentication', async () => {
    const { rerender } = renderHook(() => useOwnerCredit())
    await waitFor(() => expect(runtime.queries.length).toBeGreaterThanOrEqual(3))
    expect(runtime.queries.slice(-3).map(([, args]) => args)).toEqual([{}, {}, {}])

    await act(async () => {
      runtime.auth = { isAuthenticated: false, isLoading: true }
      rerender()
      await Promise.resolve()
    })
    expect(runtime.queries.slice(-3).map(([, args]) => args)).toEqual(['skip', 'skip', 'skip'])

    await act(async () => {
      runtime.auth = { isAuthenticated: false, isLoading: false }
      rerender()
      await Promise.resolve()
    })
    expect(runtime.queries.slice(-3).map(([, args]) => args)).toEqual(['skip', 'skip', 'skip'])

    await act(async () => {
      runtime.auth = { isAuthenticated: true, isLoading: false }
      rerender()
      await Promise.resolve()
    })
    expect(runtime.queries.slice(-3).map(([, args]) => args)).toEqual([{}, {}, {}])
  })
})
