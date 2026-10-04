/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { useBillingSpending } from '@/components/ae/settings/billing/useBillingSettings'
import type { readOwnerSpendServer } from '@/lib/server/call-history.functions'

type BudgetRead = Readonly<{
  kind: 'missing' | 'configured'
  revision: number
  enabled: boolean
  ceilingUnits: string
}>

type SpendRead = Awaited<ReturnType<typeof readOwnerSpendServer>>

const runtime = vi.hoisted(() => ({
  budgetRead: undefined as BudgetRead | undefined,
  configure: vi.fn(),
  readOwnerSpend: vi.fn(),
  captureClientException: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: () => runtime.configure,
  usePaginatedQuery: () => ({ results: [], status: 'LoadingFirstPage', loadMore: vi.fn() }),
  useQuery: () => runtime.budgetRead,
}))

vi.mock('@tanstack/react-start', () => ({ useServerFn: (fn: unknown) => fn }))
vi.mock('@/lib/server/call-history.functions', () => ({ readOwnerSpendServer: runtime.readOwnerSpend }))
vi.mock('@/lib/server/money-documents.functions', () => ({ readOwnerMoneyDocumentUrlServer: vi.fn() }))
vi.mock('@/modules/money/money.functions', () => ({ readStripeReceiptUrlServer: vi.fn() }))
vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: runtime.captureClientException,
}))

type Deferred<T> = Readonly<{
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}>

const queuedReads: Deferred<SpendRead>[] = []

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function budget(enabled: boolean): BudgetRead {
  return { kind: 'configured', revision: 0, enabled, ceilingUnits: '100' }
}

function availableSpend(spendUnits: string): SpendRead {
  return {
    kind: 'available',
    currency: 'AUD',
    exponent: 6,
    spendUnits,
    transactionCountUnits: '1',
    periodStartAt: 0,
    periodEndAt: 1,
    observedAt: 1,
    source: 'formance_transaction_cursor',
    authoritativeForConsequences: false,
  }
}

async function waitForReadCount(count: number): Promise<void> {
  await waitFor(() => expect(runtime.readOwnerSpend).toHaveBeenCalledTimes(count))
}

async function resolveRead(read: Deferred<SpendRead>, value: SpendRead): Promise<void> {
  await act(async () => {
    read.resolve(value)
    await read.promise
  })
}

async function rejectRead(read: Deferred<SpendRead>, reason: Error): Promise<void> {
  await act(async () => {
    read.reject(reason)
    await read.promise.catch(() => undefined)
  })
}

async function startSaveRefresh(result: { current: ReturnType<typeof useBillingSpending> }): Promise<{ saving: Promise<void> }> {
  let saving!: Promise<void>
  act(() => {
    saving = result.current.onSaveMonthlySpendCeiling({
      enabled: true,
      ceilingUnits: '100',
      expectedRevision: 0,
    })
  })
  await waitForReadCount(2)
  return { saving }
}

beforeEach(() => {
  runtime.budgetRead = budget(true)
  runtime.configure.mockReset().mockResolvedValue(undefined)
  runtime.readOwnerSpend.mockReset().mockImplementation(() => {
    const read = queuedReads.shift()
    if (read === undefined) throw new Error('unexpected_owner_spend_read')
    return read.promise
  })
  runtime.captureClientException.mockReset()
  queuedReads.length = 0
})

afterEach(() => {
  cleanup()
})

describe('useBillingSpending request freshness', () => {
  it('keeps the newer result when an older read resolves last', async () => {
    const first = deferred<SpendRead>()
    const second = deferred<SpendRead>()
    queuedReads.push(first)

    const hook = renderHook(() => useBillingSpending())
    await waitForReadCount(1)

    queuedReads.push(second)
    const { saving } = await startSaveRefresh(hook.result)
    await resolveRead(second, availableSpend('250'))
    await saving
    expect(hook.result.current.monthSpend).toEqual({ kind: 'available', spendUnits: '250' })

    await resolveRead(first, availableSpend('100'))
    expect(hook.result.current.monthSpend).toEqual({ kind: 'available', spendUnits: '250' })
  })

  it('does not publish an older result while a newer read is pending', async () => {
    const first = deferred<SpendRead>()
    const second = deferred<SpendRead>()
    queuedReads.push(first)

    const hook = renderHook(() => useBillingSpending())
    await waitForReadCount(1)

    queuedReads.push(second)
    const { saving } = await startSaveRefresh(hook.result)
    await resolveRead(first, availableSpend('100'))
    expect(hook.result.current.monthSpend).toEqual({ kind: 'unavailable' })

    await resolveRead(second, availableSpend('250'))
    await saving
    expect(hook.result.current.monthSpend).toEqual({ kind: 'available', spendUnits: '250' })
  })

  it('captures a stale read failure without replacing the newer result', async () => {
    const first = deferred<SpendRead>()
    const second = deferred<SpendRead>()
    const staleFailure = new Error('stale read failed')
    queuedReads.push(first)

    const hook = renderHook(() => useBillingSpending())
    await waitForReadCount(1)

    queuedReads.push(second)
    const { saving } = await startSaveRefresh(hook.result)
    await resolveRead(second, availableSpend('250'))
    await saving
    await rejectRead(first, staleFailure)

    expect(runtime.captureClientException).toHaveBeenCalledWith(staleFailure)
    expect(hook.result.current.monthSpend).toEqual({ kind: 'available', spendUnits: '250' })
  })

  it('sets the state unavailable when the newest read fails', async () => {
    const first = deferred<SpendRead>()
    const second = deferred<SpendRead>()
    const currentFailure = new Error('current read failed')
    queuedReads.push(first)

    const hook = renderHook(() => useBillingSpending())
    await waitForReadCount(1)
    await resolveRead(first, availableSpend('100'))

    queuedReads.push(second)
    const { saving } = await startSaveRefresh(hook.result)
    await rejectRead(second, currentFailure)
    await saving

    expect(runtime.captureClientException).toHaveBeenCalledWith(currentFailure)
    expect(hook.result.current.monthSpend).toEqual({ kind: 'unavailable' })
  })

  it('keeps a disabled budget empty when a pending read resolves and refreshes after re-enable', async () => {
    const first = deferred<SpendRead>()
    const second = deferred<SpendRead>()
    queuedReads.push(first)

    const hook = renderHook(() => useBillingSpending())
    await waitForReadCount(1)

    runtime.budgetRead = budget(false)
    hook.rerender()
    await waitFor(() => expect(hook.result.current.monthSpend).toEqual({ kind: 'empty' }))
    expect(runtime.readOwnerSpend).toHaveBeenCalledTimes(1)

    await resolveRead(first, availableSpend('100'))
    expect(hook.result.current.monthSpend).toEqual({ kind: 'empty' })
    expect(runtime.readOwnerSpend).toHaveBeenCalledTimes(1)

    queuedReads.push(second)
    runtime.budgetRead = budget(true)
    hook.rerender()
    await waitForReadCount(2)
    await resolveRead(second, availableSpend('250'))
    expect(hook.result.current.monthSpend).toEqual({ kind: 'available', spendUnits: '250' })
  })
})
