/**
 * @vitest-environment jsdom
 *
 * Contract: only the latest invocation of each read lane, within the current
 * effect lifetime, may publish that lane's data, unavailable state, or pending
 * flag. Existing facts stay visible while a refresh is pending or fails.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { useOwnerCredit } from '@/components/ae/console/owner-credit/useOwnerCredit'
import type { MoneyDocumentView, MoneyProviderObligationView, MoneyReconciliationCaseView } from '@/lib/server/money-documents.functions'
import type { AccountHistoryResult } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingConstraints } from '@/modules/money/server'

const creditReads = vi.hoisted(() => ({
  balance: vi.fn(),
  history: vi.fn(),
  constraints: vi.fn(),
  begin: vi.fn(),
  funding: vi.fn(),
  documents: vi.fn(),
  reconciliation: vi.fn(),
  obligations: vi.fn(),
  statement: vi.fn(),
  dailyClose: vi.fn(),
  sign: vi.fn(),
  documentUrl: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-start')>(),
  useServerFn: (fn: unknown) => fn,
}))
vi.mock('@/modules/money/money.functions', () => ({
  readAccountFundingBalanceServer: creditReads.balance,
  readAccountFundingConstraintsServer: creditReads.constraints,
  beginAccountFundingServer: creditReads.begin,
  readAccountFundingServer: creditReads.funding,
}))
vi.mock('@/lib/server/call-history.functions', () => ({ readOwnerAccountHistoryServer: creditReads.history }))
vi.mock('@/lib/server/money-documents.functions', () => ({
  readOwnerMoneyDocumentsServer: creditReads.documents,
  readOwnerMoneyReconciliationServer: creditReads.reconciliation,
  readOwnerProviderObligationsServer: creditReads.obligations,
  createOwnerStatementServer: creditReads.statement,
  createOwnerDailyCloseServer: creditReads.dailyClose,
  signOwnerDailyCloseServer: creditReads.sign,
  readOwnerMoneyDocumentUrlServer: creditReads.documentUrl,
}))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: creditReads.capture }))

type LaneName = 'balance' | 'history' | 'constraints'
type LaneValue = AccountFundingBalance | AccountHistoryResult | AccountFundingConstraints
type OwnerCredit = ReturnType<typeof useOwnerCredit>
type Page<T> = Readonly<{ page: T[]; continueCursor: string; isDone: boolean }>

const values = {
  balance: (generation: number): AccountFundingBalance => ({
    kind: 'available',
    accountRef: 'account:owner',
    balance: { currency: 'AUD', units: String(12_500_000 + generation * 1_000_000), exponent: 6 },
    locked: false,
    version: generation + 1,
  }),
  history: (generation: number): AccountHistoryResult => ({
    kind: 'available',
    entries: [],
    snapshotAt: generation + 1,
    continueCursor: `cursor:${generation}`,
    isDone: true,
    coverage: 'complete',
    sourceLinkCoverage: 'unavailable',
    source: 'formance_transaction_cursor',
    ordering: 'recorded_transaction_sequence_desc',
  }),
  constraints: (generation: number): AccountFundingConstraints => ({
    kind: 'available',
    environment: 'sandbox',
    currency: 'AUD',
    exponent: 6,
    minimumPrincipalUnits: String(5_000_000 + generation * 1_000_000),
    maximumPrincipalUnits: '25000000000',
    incrementUnits: '10000',
    serviceFeeBps: 500,
    taxOnServiceFeeBps: 1000,
    legalCustomerMaximumAccessibleUnits: '4999999999',
    policyDigest: `sha256:${String(generation + 1).repeat(64)}`,
  }),
} satisfies Record<LaneName, (generation: number) => LaneValue>

const emptyDocuments: Page<MoneyDocumentView> = { page: [], continueCursor: '', isDone: true }
const emptyReconciliation: Page<MoneyReconciliationCaseView> = { page: [], continueCursor: '', isDone: true }
const emptyObligations: Page<MoneyProviderObligationView> = { page: [], continueCursor: '', isDone: true }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function queueRead(lane: LaneName, response: Promise<LaneValue>) {
  if (lane === 'balance') creditReads.balance.mockReturnValueOnce(response)
  if (lane === 'history') creditReads.history.mockReturnValueOnce(response)
  if (lane === 'constraints') creditReads.constraints.mockReturnValueOnce(response)
}

function nextValue(lane: LaneName, generation: number): LaneValue {
  return values[lane](generation)
}

function currentValue(ownerCredit: OwnerCredit, lane: LaneName): LaneValue | undefined {
  if (lane === 'balance') return ownerCredit.accountBalance
  if (lane === 'history') return ownerCredit.accountHistory
  return ownerCredit.fundingConstraints
}

function isLoading(ownerCredit: OwnerCredit, lane: LaneName): boolean {
  if (lane === 'balance') return ownerCredit.balanceLoading === true
  if (lane === 'history') return ownerCredit.historyLoading === true
  return ownerCredit.constraintsLoading === true
}

function isUnavailable(ownerCredit: OwnerCredit, lane: LaneName): boolean {
  return ownerCredit.unavailable?.[lane] === true
}

function startRefresh(ownerCredit: OwnerCredit) {
  let pending!: Promise<void>
  act(() => { pending = Promise.resolve(ownerCredit.onCreditRefresh?.()) })
  return pending
}

async function settle<T>(pending: Promise<void>, request: ReturnType<typeof deferred<T>>, value: T) {
  await act(async () => {
    request.resolve(value)
    await pending
  })
}

async function seedOwnerCredit() {
  const hook = renderHook(() => useOwnerCredit())
  await waitFor(() => {
    expect(hook.result.current.balanceLoading).toBe(false)
    expect(hook.result.current.historyLoading).toBe(false)
    expect(hook.result.current.constraintsLoading).toBe(false)
    expect(hook.result.current.administrationLoading).toBe(false)
  })
  return hook
}

const laneNames: readonly LaneName[] = ['balance', 'history', 'constraints']

beforeEach(() => {
  Object.values(creditReads).forEach((read) => read.mockReset())
  creditReads.balance.mockResolvedValue(values.balance(0))
  creditReads.history.mockResolvedValue(values.history(0))
  creditReads.constraints.mockResolvedValue(values.constraints(0))
  creditReads.documents.mockResolvedValue(emptyDocuments)
  creditReads.reconciliation.mockResolvedValue(emptyReconciliation)
  creditReads.obligations.mockResolvedValue(emptyObligations)
})

afterEach(() => cleanup())

describe('owner credit read generations', () => {
  for (const lane of laneNames) {
    for (const resolutionOrder of ['older-first', 'newer-first'] as const) {
      it(`${lane}: ${resolutionOrder} keeps only the latest completed request`, async () => {
        const { result } = await seedOwnerCredit()
        const seed = currentValue(result.current, lane)
        const older = deferred<LaneValue>()
        const newer = deferred<LaneValue>()
        queueRead(lane, older.promise)
        queueRead(lane, newer.promise)

        const olderRefresh = startRefresh(result.current)
        const newerRefresh = startRefresh(result.current)
        const olderValue = nextValue(lane, 1)
        const newerValue = nextValue(lane, 2)

        expect(currentValue(result.current, lane)).toBe(seed)
        expect(isLoading(result.current, lane)).toBe(true)

        if (resolutionOrder === 'older-first') {
          await settle(olderRefresh, older, olderValue)
          expect(currentValue(result.current, lane)).toBe(seed)
          expect(isLoading(result.current, lane)).toBe(true)
          expect(isUnavailable(result.current, lane)).toBe(false)

          await settle(newerRefresh, newer, newerValue)
        } else {
          await settle(newerRefresh, newer, newerValue)
          expect(currentValue(result.current, lane)).toBe(newerValue)
          expect(isLoading(result.current, lane)).toBe(false)

          await settle(olderRefresh, older, olderValue)
        }

        expect(currentValue(result.current, lane)).toBe(newerValue)
        expect(isLoading(result.current, lane)).toBe(false)
        expect(isUnavailable(result.current, lane)).toBe(false)
      })
    }

    it(`${lane}: a stale rejection cannot change the latest fact, unavailable flag, or pending state`, async () => {
      const { result } = await seedOwnerCredit()
      const older = deferred<LaneValue>()
      const newer = deferred<LaneValue>()
      const current = deferred<LaneValue>()
      queueRead(lane, older.promise)
      queueRead(lane, newer.promise)
      queueRead(lane, current.promise)

      const olderRefresh = startRefresh(result.current)
      const newerRefresh = startRefresh(result.current)
      const newerValue = nextValue(lane, 2)
      await settle(newerRefresh, newer, newerValue)
      expect(currentValue(result.current, lane)).toBe(newerValue)
      expect(isLoading(result.current, lane)).toBe(false)

      const currentRefresh = startRefresh(result.current)
      const error = new Error(`${lane} stale read failed`)
      await act(async () => {
        older.reject(error)
        await olderRefresh
      })

      expect(currentValue(result.current, lane)).toBe(newerValue)
      expect(isUnavailable(result.current, lane)).toBe(false)
      expect(isLoading(result.current, lane)).toBe(true)
      expect(creditReads.capture).toHaveBeenCalledWith(error)

      await settle(currentRefresh, current, nextValue(lane, 3))
      expect(isLoading(result.current, lane)).toBe(false)
    })

    it(`${lane}: the latest failure retains its fact and marks only that lane unavailable`, async () => {
      const { result } = await seedOwnerCredit()
      const seed = currentValue(result.current, lane)
      const failure = deferred<LaneValue>()
      queueRead(lane, failure.promise)
      for (const otherLane of laneNames) {
        if (otherLane === lane) continue
        const next = nextValue(otherLane, 3)
        if (otherLane === 'balance') creditReads.balance.mockResolvedValueOnce(next as AccountFundingBalance)
        if (otherLane === 'history') creditReads.history.mockResolvedValueOnce(next as AccountHistoryResult)
        if (otherLane === 'constraints') creditReads.constraints.mockResolvedValueOnce(next as AccountFundingConstraints)
      }

      const refresh = startRefresh(result.current)
      const error = new Error(`${lane} current read failed`)
      await act(async () => {
        failure.reject(error)
        await refresh
      })

      expect(currentValue(result.current, lane)).toBe(seed)
      expect(isUnavailable(result.current, lane)).toBe(true)
      expect(isLoading(result.current, lane)).toBe(false)
      for (const otherLane of laneNames) {
        if (otherLane === lane) continue
        expect(currentValue(result.current, otherLane)).toEqual(nextValue(otherLane, 3))
        expect(isUnavailable(result.current, otherLane)).toBe(false)
        expect(isLoading(result.current, otherLane)).toBe(false)
      }
      expect(creditReads.capture).toHaveBeenCalledWith(error)
    })
  }
})

describe('owner credit provided reads', () => {
  it('shows provided reads without calling server reads on mount, and refresh calls the server fresh', async () => {
    const reads = {
      balance: Promise.resolve(values.balance(0)),
      history: Promise.resolve(values.history(0)),
      constraints: Promise.resolve(values.constraints(0)),
      documents: Promise.resolve(emptyDocuments),
      reconciliation: Promise.resolve(emptyReconciliation),
      obligations: Promise.resolve(emptyObligations),
    }
    const { result } = renderHook(() => useOwnerCredit(reads))
    await waitFor(() => expect(result.current.balanceLoading).toBe(false))
    const balance = result.current.accountBalance
    expect(balance?.kind === 'available' && balance.balance.units).toBe('12500000')
    for (const read of [creditReads.balance, creditReads.history, creditReads.constraints, creditReads.documents, creditReads.reconciliation, creditReads.obligations]) {
      expect(read).not.toHaveBeenCalled()
    }
    creditReads.balance.mockResolvedValueOnce(values.balance(2))
    await act(async () => { await result.current.onCreditRefresh?.() })
    expect(creditReads.balance).toHaveBeenCalledTimes(1)
    const refreshed = result.current.accountBalance
    expect(refreshed?.kind === 'available' && refreshed.balance.units).toBe('14500000')
  })
})

describe('owner credit route loader', () => {
  it('starts no money reads on a hover preload and starts them once on entry', async () => {
    const { Route } = await import('@/routes/_operator/owner.credit')
    const { createMemoryHistory, createRootRoute, createRoute, createRouter } = await import('@tanstack/react-router')
    for (const read of [creditReads.balance, creditReads.history, creditReads.constraints, creditReads.documents, creditReads.reconciliation, creditReads.obligations]) {
      read.mockResolvedValue({ kind: 'unavailable' })
    }
    const root = createRootRoute()
    const credit = createRoute({ getParentRoute: () => root, path: '/owner/credit',
      loader: Route.options.loader as () => unknown, ...(Route.options.preload === undefined ? {} : { preload: Route.options.preload }) })
    const home = createRoute({ getParentRoute: () => root, path: '/' })
    const router = createRouter({ routeTree: root.addChildren([home, credit]), defaultPreload: 'intent',
      history: createMemoryHistory({ initialEntries: ['/'] }) })
    await router.load()
    await router.preloadRoute({ to: '/owner/credit' } as never)
    expect(creditReads.balance).not.toHaveBeenCalled()
    expect(creditReads.documents).not.toHaveBeenCalled()
    await router.navigate({ to: '/owner/credit' } as never)
    expect(creditReads.balance).toHaveBeenCalledTimes(1)
    expect(creditReads.obligations).toHaveBeenCalledTimes(1)
  })
})
