/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentOperatorConsole } from '@/components/ae/console/agent-operator-console/AeAgentOperatorConsole'
import type { AgentCredentialSource, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { toast } from '@/lib/ui/toast'
import { AeAccountFundingPanel } from '@/components/ae/console/AeCreditTopUpPanel'
import type { AccountFundingPort } from '@/modules/money/account-funding.contracts'
import { AeOwnerCredit } from '@/components/ae/console/owner-credit/AeOwnerCredit'
import { CreditAccountingPanel } from '@/components/ae/console/owner-credit/components/CreditAccountingPanel'
import { useOwnerCredit } from '@/components/ae/console/owner-credit/useOwnerCredit'
import type { MoneyDocumentView } from '@/lib/server/money-documents.functions'
import type { AccountHistoryResult, CreditPaymentSession } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingBeginInput, AccountFundingConstraints } from '@/modules/money/server'

const clerkIdentity = vi.hoisted(() => ({ userId: 'user_owner' }))
const creditReads = vi.hoisted(() => ({
  balance: vi.fn(), history: vi.fn(), constraints: vi.fn(), begin: vi.fn(), funding: vi.fn(),
  documents: vi.fn(), reconciliation: vi.fn(), obligations: vi.fn(),
  statement: vi.fn(), dailyClose: vi.fn(), sign: vi.fn(), render: vi.fn(), documentUrl: vi.fn(), capture: vi.fn(),
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
  renderOwnerMoneyDocumentServer: creditReads.render,
  readOwnerMoneyDocumentUrlServer: creditReads.documentUrl,
}))
vi.mock('@/lib/observability/capture-client-exception', () => ({ captureClientExceptionOnClient: creditReads.capture }))
vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ userId: clerkIdentity.userId }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: { to: string; params?: Record<string, string>; children: ReactNode }) => (
    <a href={params?.toolRef === undefined ? to : to.replace('$toolRef', encodeURIComponent(params.toolRef))} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}))


const keyReadback: AgentCredentialSource = {
  key: {
    keyId: 'key_ui_1',
    name: 'UI assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'read_only',
    scopes: ['market_tools:call', 'customer_requests:read_only'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: `prn_${'1'.repeat(32)}`,
    credentialId: 'key_ui_1',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'read_only',
    toolAccess: 'all_admitted',
    toolRefs: [],
    lifecycle: 'active',
    expiresAt: 604_800_000,
    budget: {
      maximumSpendPerCall: { currency: 'AUD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'AUD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'AUD', units: '10000', exponent: 2 },
      maximumConcurrentCalls: 2,
    },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  principalId: 'clerk_api_key:key_ui_1',
  activity: [],
  usage: {
    periodStartAt: Date.UTC(2026, 8, 1),
    periodEndAt: Date.UTC(2026, 9, 1),
    callCount: 2,
    completedCallCount: 2,
    outcomeUnknownCallCount: 0,
    settledSpend: { currency: 'AUD', units: '5005000', exponent: 6 },
    amountCoverage: 'complete',
    updatedAt: Date.UTC(2026, 8, 2),
  },
  dataState: 'source',
}
const keyDirectory = projectAgentDirectory([keyReadback], [canonicalAgentRecord([keyReadback])])
const emptyDirectory: AgentDirectoryProjection = { items: [], details: [] }
const accountBalance: AccountFundingBalance = {
  kind: 'available',
  accountRef: 'account:owner',
  balance: { currency: 'AUD', units: '12500000', exponent: 6 },
  locked: false,
  version: 1,
}
const fundingConstraints: AccountFundingConstraints = {
  kind: 'available',
  environment: 'sandbox',
  currency: 'AUD',
  exponent: 6,
  minimumPrincipalUnits: '5000000',
  maximumPrincipalUnits: '25000000000',
  incrementUnits: '10000',
  serviceFeeBps: 500,
  taxOnServiceFeeBps: 1000,
  legalCustomerMaximumAccessibleUnits: '4999999999',
  policyDigest: `sha256:${'f'.repeat(64)}`,
}

function am09ReturnedCheckout(input: Readonly<{
  externalRef: string
  status: CreditPaymentSession['evidence']['status']
  checkoutStatus: NonNullable<CreditPaymentSession['evidence']['checkoutStatus']>
}>): CreditPaymentSession {
  return {
    kind: 'hosted_redirect',
    evidence: {
      provider: 'stripe',
      externalRef: input.externalRef,
      amount: { currency: 'AUD', units: '11550000', exponent: 6 },
      status: input.status,
      checkoutStatus: input.checkoutStatus,
      paymentStatus: input.status === 'succeeded' ? 'paid' : 'unpaid',
      checkoutMode: 'hosted_page',
      checkoutExpiresAt: 3_600_000,
      requestDigest: 'digest:request',
      metadataDigest: 'digest:metadata',
      checkoutSessionDigest: 'digest:checkout',
      evidenceDigest: 'digest:evidence',
      evidenceRef: `stripe:checkout:${input.externalRef}`,
      observedAt: 1,
    },
    checkoutUrl: `https://checkout.stripe.com/c/pay/${input.externalRef}`,
    expiresAt: 3_600_000,
  }
}

const emptyAccountHistory: AccountHistoryResult = {
  kind: 'available',
  entries: [],
  snapshotAt: 1_788_120_000_000,
  continueCursor: '',
  isDone: true,
  coverage: 'complete',
  sourceLinkCoverage: 'unavailable',
  source: 'formance_transaction_cursor',
  ordering: 'recorded_transaction_sequence_desc',
}


afterEach(() => {
  cleanup()
  clerkIdentity.userId = 'user_owner'
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function openLedger() {
  fireEvent.click(screen.getByRole('tab', { name: 'Ledger' }))
}

describe('owner credit administration reads', () => {
  const emptyPage = { page: [], continueCursor: '', isDone: true }
  const document: MoneyDocumentView = {
    documentRef: 'document:original', kind: 'statement', amountUnits: '12500000', residualUnits: '0',
    sourceTransactionRefs: ['transaction:one'], policyRefs: ['policy:one'], policyDigest: 'a'.repeat(64),
    renderInputDigest: 'b'.repeat(64), templateVersion: 'ae.money-document:html:v1',
    state: 'issued', sourceCount: 1, rendered: true, createdAt: 1_788_120_000_000,
  }
  function deferredPage() {
    let resolve!: (value: { page: MoneyDocumentView[]; continueCursor: string; isDone: boolean }) => void
    let reject!: (reason: Error) => void
    const promise = new Promise<{ page: MoneyDocumentView[]; continueCursor: string; isDone: boolean }>((done, fail) => {
      resolve = done
      reject = fail
    })
    return { promise, resolve, reject }
  }
  function Accounting() {
    const props = useOwnerCredit()
    return <>
      <button type="button" onClick={() => { void props.onCreditRefresh?.() }}>Refresh accounting</button>
      <CreditAccountingPanel {...props} />
    </>
  }
  function expectPending() {
    expect(screen.getByRole('group', { name: 'Accounting records' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Loading accounting records…')).toBeTruthy()
  }
  function expectNoEmptySuccess() {
    expect(screen.queryByText('No accounting documents yet')).toBeNull()
    expect(screen.queryByText('No reconciliation differences')).toBeNull()
    expect(screen.queryByText('No Provider obligations')).toBeNull()
  }
  beforeEach(() => {
    creditReads.balance.mockReset().mockResolvedValue(accountBalance)
    creditReads.history.mockReset().mockResolvedValue(emptyAccountHistory)
    creditReads.constraints.mockReset().mockResolvedValue(fundingConstraints)
    creditReads.documents.mockReset().mockResolvedValue(emptyPage)
    creditReads.reconciliation.mockReset().mockResolvedValue(emptyPage)
    creditReads.obligations.mockReset().mockResolvedValue(emptyPage)
  })

  it('waits for all administration reads before presenting successful empty results', async () => {
    const pending = deferredPage()
    creditReads.documents.mockReturnValueOnce(pending.promise)
    render(<Accounting />)
    expectPending()
    expectNoEmptySuccess()
    await act(async () => { pending.resolve(emptyPage) })
    await waitFor(() => expect(screen.getByRole('group', { name: 'Accounting records' }).getAttribute('aria-busy')).toBe('false'))
    expect(screen.getByText('No accounting documents yet')).toBeTruthy()
    expect(screen.getByText('No reconciliation differences')).toBeTruthy()
    expect(screen.getByText('No Provider obligations')).toBeTruthy()
    expect(screen.queryByText('Loading accounting records…')).toBeNull()
  })

  it('turns delayed read failures into unavailable states without an intermediate empty success', async () => {
    const pending = deferredPage()
    creditReads.documents.mockReturnValueOnce(pending.promise)
    creditReads.reconciliation.mockReturnValueOnce(pending.promise)
    creditReads.obligations.mockReturnValueOnce(pending.promise)
    render(<Accounting />)
    expectPending()
    expectNoEmptySuccess()
    await act(async () => { pending.reject(new Error('administration unavailable')) })
    await waitFor(() => expect(screen.getByRole('group', { name: 'Accounting records' }).getAttribute('aria-busy')).toBe('false'))
    expect(screen.getByText('Documents unavailable')).toBeTruthy()
    expect(screen.getByText('Reconciliation unavailable')).toBeTruthy()
    expect(screen.getByText('Provider obligations unavailable')).toBeTruthy()
    expectNoEmptySuccess()
  })

  it.each([true, false])('preserves settled records and lets only the newest refresh publish (older first: %s)', async (olderFirst) => {
    const older = deferredPage(), newer = deferredPage()
    creditReads.documents.mockResolvedValueOnce({ ...emptyPage, page: [document] })
      .mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    render(<Accounting />)
    await screen.findByText('document:original')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh accounting' }))
    expectPending()
    expect(screen.getByText('document:original')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh accounting' }))
    if (olderFirst) {
      await act(async () => { older.resolve({ ...emptyPage, page: [{ ...document, documentRef: 'document:stale' }] }) })
      expectPending()
      expect(screen.getByText('document:original')).toBeTruthy()
      expect(screen.queryByText('document:stale')).toBeNull()
    }
    await act(async () => { newer.resolve({ ...emptyPage, page: [{ ...document, documentRef: 'document:newest' }] }) })
    await screen.findByText('document:newest')
    if (!olderFirst) {
      await act(async () => { older.resolve({ ...emptyPage, page: [{ ...document, documentRef: 'document:stale' }] }) })
    }
    expect(screen.getByText('document:newest')).toBeTruthy()
    expect(screen.queryByText('document:stale')).toBeNull()
    expect(screen.queryByText('document:original')).toBeNull()
    expect(screen.getByRole('group', { name: 'Accounting records' }).getAttribute('aria-busy')).toBe('false')
  })

  it('ignores an older failure after the latest refresh has succeeded', async () => {
    const older = deferredPage()
    creditReads.documents.mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ ...emptyPage, page: [document] })
    render(<Accounting />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh accounting' }))
    await screen.findByText('document:original')
    await act(async () => { older.reject(new Error('stale request failed')) })
    expect(screen.getByText('document:original')).toBeTruthy()
    expect(screen.queryByText('Documents unavailable')).toBeNull()
    expect(screen.getByRole('group', { name: 'Accounting records' }).getAttribute('aria-busy')).toBe('false')
  })

  it('requests the previous completed UTC month so repeated statement creation has a stable closed interval', async () => {
    creditReads.statement.mockReset().mockResolvedValue({ kind: 'created', documentRef: 'statement:previous' })
    const now = new Date()
    render(<Accounting />)
    await waitFor(() => expect(screen.getByRole('group', { name: 'Accounting records' }).getAttribute('aria-busy')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'Create previous month’s statement' }))
    await waitFor(() => expect(creditReads.statement).toHaveBeenCalledWith({ data: {
      periodStart: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      periodEnd: Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    } }))
  })

  it('reviews prepared close HTML and CSV through read-only URLs without issuing or signing the record', async () => {
    creditReads.documents.mockResolvedValue({ ...emptyPage, page: [{ ...document, kind: 'daily_close', state: 'awaiting_signature' }] })
    creditReads.documentUrl.mockReset().mockResolvedValue('https://storage.example/close')
    creditReads.render.mockReset(); creditReads.sign.mockReset()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<Accounting />)
    fireEvent.click(await screen.findByRole('button', { name: 'View details for Daily close, document:original' }))
    const drawer = await screen.findByRole('dialog')
    expect(screen.queryByText('Issued')).toBeNull()
    expect(within(drawer).getByRole('button', { name: 'Sign close' })).toBeTruthy()
    fireEvent.click(within(drawer).getByRole('button', { name: 'Review close' }))
    await waitFor(() => expect(creditReads.documentUrl).toHaveBeenCalledWith({ data: { documentRef: document.documentRef, format: 'html' } }))
    fireEvent.click(within(drawer).getByRole('button', { name: 'Review CSV' }))
    await waitFor(() => expect(creditReads.documentUrl).toHaveBeenCalledWith({ data: { documentRef: document.documentRef, format: 'csv' } }))
    expect(open).toHaveBeenCalledTimes(2)
    expect(creditReads.render).not.toHaveBeenCalled()
    expect(creditReads.sign).not.toHaveBeenCalled()
    expect(screen.queryByText('Issued')).toBeNull()
    open.mockRestore()
  })

  it('offers neither review nor signature when an awaiting close has no prepared files', async () => {
    render(<CreditAccountingPanel documents={[{ ...document, kind: 'daily_close', state: 'awaiting_signature', rendered: false }]}
      onOpenDocument={vi.fn()} onSignDailyClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'View details for Daily close, document:original' }))
    const drawer = await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Review close' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Review CSV' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sign close' })).toBeNull()
    expect(within(drawer).getByText('Awaiting owner signature')).toBeTruthy()
  })

  it('filters documents by kind, full reference, or status and the Arc clear control restores all rows', () => {
    render(<CreditAccountingPanel documents={[
      { ...document, documentRef: 'money-document:statement:full-secret-reference', state: 'failed' },
      { ...document, documentRef: 'money-document:tax:other', kind: 'tax_invoice', state: 'issued' },
    ]} />)
    const search = screen.getByRole('searchbox', { name: 'Search documents' })
    const table = screen.getByRole('table', { name: 'Accounting documents' })
    const expectOnly = (reference: string) => {
      const rows = within(table).getAllByRole('row').slice(1)
      expect(rows).toHaveLength(1)
      expect(within(rows[0]!).getByRole('button', { name: new RegExp(reference, 'u') })).toBeTruthy()
    }
    const clearAndExpectBoth = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      expect(within(table).getAllByRole('row')).toHaveLength(3)
    }

    fireEvent.change(search, { target: { value: 'tax invoice' } })
    expectOnly('money-document:tax:other')
    clearAndExpectBoth()

    fireEvent.change(search, { target: { value: 'full-secret-reference' } })
    expectOnly('money-document:statement:full-secret-reference')
    clearAndExpectBoth()

    fireEvent.change(search, { target: { value: 'needs attention' } })
    expectOnly('money-document:statement:full-secret-reference')
  })

  it('sorts adjacent large document amounts exactly with BigInt values', () => {
    const high = { ...document, documentRef: 'document:high', amountUnits: '9007199254740992000001' }
    const low = { ...document, documentRef: 'document:low', amountUnits: '9007199254740992000000' }
    expect(Number(BigInt(high.amountUnits))).toBe(Number(BigInt(low.amountUnits)))
    render(<CreditAccountingPanel documents={[high, low]} />)
    const table = screen.getByRole('table', { name: 'Accounting documents' })

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Amount' }))

    const rows = within(table).getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByRole('button', { name: 'View details for Statement, document:low' })).toBeTruthy()
    expect(within(rows[1]!).getByRole('button', { name: 'View details for Statement, document:high' })).toBeTruthy()
  })

  it('shows the current selected document in the drawer and closes on refresh, removal, and Escape with focus return', async () => {
    const onOpenDocument = vi.fn(async () => undefined)
    const { rerender } = render(<CreditAccountingPanel documents={[document]} onOpenDocument={onOpenDocument} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open document' }))
    await waitFor(() => expect(screen.getByText('Link prepared')).toBeTruthy())

    const viewDetails = screen.getByRole('button', { name: 'View details for Statement, document:original' })
    viewDetails.focus()
    fireEvent.click(viewDetails)
    let drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('A$12.50')).toBeTruthy()

    const refreshed = { ...document, amountUnits: '7500000', state: 'failed' as const }
    rerender(<CreditAccountingPanel documents={[refreshed]} />)
    drawer = screen.getByRole('dialog')
    expect(within(drawer).getByText('A$7.50')).toBeTruthy()
    expect(within(drawer).getByText('Needs attention')).toBeTruthy()

    fireEvent.keyDown(drawer, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(window.document.activeElement).toBe(screen.getByRole('button', { name: 'View details for Statement, document:original' })))

    fireEvent.click(screen.getByRole('button', { name: 'View details for Statement, document:original' }))
    await screen.findByRole('dialog')
    rerender(<CreditAccountingPanel documents={[]} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    rerender(<CreditAccountingPanel documents={[refreshed]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View details for Statement, document:original' }))
    await screen.findByRole('dialog')
    rerender(<CreditAccountingPanel documents={[refreshed]} unavailable={{ documents: true }} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    rerender(<CreditAccountingPanel documents={[refreshed]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('explains a blocked rounding adjustment without claiming a payment or signature', () => {
    render(<CreditAccountingPanel documents={[{ ...document, kind: 'daily_close', state: 'failed', rendered: false,
      failureCode: 'statement_adjustment_requires_approved_policy' }]} onOpenDocument={vi.fn()} onSignDailyClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'View details for Daily close, document:original' }))
    expect(screen.getByText(/No ledger adjustment was made\./u).getAttribute('role')).toBe('status')
    expect(screen.queryByRole('button', { name: 'Sign close' })).toBeNull()
    expect(screen.queryByText('Issued')).toBeNull()
  })
})

describe('promotional credit presentation', () => {
  it('shows total and its funding sources without substituting total for purchased credit', () => {
    render(<AeOwnerCredit accountBalance={{ kind: 'available', accountRef: 'account:promo',
      balance: { currency: 'AUD', units: '5000000', exponent: 6 },
      totalBalance: { currency: 'AUD', units: '15000000', exponent: 6 },
      promotionalBalance: { currency: 'AUD', units: '10000000', exponent: 6 },
      nextPromotionalExpiryAt: Date.UTC(2027, 0, 1), locked: false, version: 1,
    }} />)
    expect(screen.getAllByText('A$15.00').length).toBeGreaterThan(0)
    expect(screen.getByText('Purchased credit')).toBeTruthy()
    expect(screen.getByText('Promotional credit')).toBeTruthy()
    expect(screen.getByText(/Next promotional credit expiry:/)).toBeTruthy()
  })
})

describe('owner credit target', () => {
  it('renders booked Account transactions instead of Agent activity approximations', () => {
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={emptyAccountHistory}
    />)
    openLedger()

    expect(screen.queryByText('Weather lookup')).toBeNull()
    expect(screen.getByText('No booked Account transactions yet')).toBeTruthy()
  })

  it('keeps compact scan rows and reveals the exact unattributed transaction in an Arc drawer', async () => {
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={{
        ...emptyAccountHistory,
        entries: [{
          transactionId: '42',
          transactionRef: 'transaction:42',
          occurredAt: 1_788_119_000_000,
          recordedAt: 1_788_120_000_000,
          kind: 'call_spend',
          accountEffect: { currency: 'AUD', units: '-1', exponent: 6 },
          documentEffectUnits: '0',
          reverted: false,
          revertedAt: null,
          sourceRef: null,
          sourceDigest: `sha256:${'a'.repeat(64)}`,
        }],
      }}
    />)
    openLedger()

    expect(screen.getByText('Call purchase')).toBeTruthy()
    expect(screen.getByText('−A$0.01')).toBeTruthy()
    const table = screen.getByRole('table', { name: 'Booked Account transactions' })
    expect(table.querySelector('details')).toBeNull()
    expect(within(table).queryByText('transaction:42')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    const open = screen.getByRole('button', { name: 'View Call purchase transaction 42' })
    fireEvent.click(open)
    const details = await screen.findByRole('dialog', { name: 'Account transaction' })
    expect(within(details).getByText('Transaction ID').parentElement?.textContent).toContain('42')
    expect(within(details).getByText('Reference').parentElement?.textContent).toContain('transaction:42')
    expect(within(details).getByText(`sha256:${'a'.repeat(64)}`)).toBeTruthy()
    expect(within(details).getByText('−A$0.01')).toBeTruthy()
    expect(within(details).queryByRole('link', { name: /Call receipt/u })).toBeNull()
    fireEvent.click(within(details).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View Call purchase transaction 42' })))
  })

  it('reveals only the selected record and links attributed Calls to their native receipts', async () => {
    const entry = {
      transactionId: '43', transactionRef: 'transaction:43',
      occurredAt: 1_788_119_000_000, recordedAt: 1_788_120_000_000,
      accountEffect: { currency: 'AUD' as const, units: '-6', exponent: 6 as const },
      documentEffectUnits: '0', reverted: false, revertedAt: null,
      sourceRef: 'call:known', sourceDigest: `sha256:${'b'.repeat(64)}`,
    }
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={{ ...emptyAccountHistory, entries: [
        { ...entry, kind: 'call_spend', transactionId: '43' },
        { ...entry, kind: 'funding', transactionId: '44', transactionRef: 'transaction:44', accountEffect: { ...entry.accountEffect, units: '6' } },
        { ...entry, kind: 'funding_reversal', transactionId: '45', transactionRef: 'transaction:45' },
        { ...entry, kind: 'document_adjustment', transactionId: '46', transactionRef: 'transaction:46' },
        { ...entry, kind: 'unmapped', transactionId: '47', transactionRef: 'transaction:47' },
      ] }}
    />)
    openLedger()
    expect(screen.queryByRole('link', { name: /View Call receipt/u })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View Call purchase transaction 43' }))
    let details = await screen.findByRole('dialog', { name: 'Account transaction' })
    const receiptLinks = within(details).getAllByRole('link', { name: /View Call receipt/u })
    expect(receiptLinks).toHaveLength(1)
    expect(receiptLinks[0]?.getAttribute('href')).toBe('/calls/call%3Aknown')
    expect(within(details).getByText('call:known').closest('a')).toBeNull()
    expect(within(details).queryByText('transaction:44')).toBeNull()
    fireEvent.click(within(details).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    for (const [label, id, source] of [
      ['Credit added', '44', 'Funding'],
      ['Credit reversed', '45', 'Funding reversal'],
      ['Document adjustment', '46', 'Accounting document'],
      ['Account movement', '47', 'Not attributed'],
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: `View ${label} transaction ${id}` }))
      details = await screen.findByRole('dialog', { name: 'Account transaction' })
      expect(within(details).getByText(source)).toBeTruthy()
      expect(within(details).queryByRole('link', { name: /View Call receipt/u })).toBeNull()
      if (id === '44') expect(within(details).getByRole('link', { name: /View funding receipt/u }).getAttribute('href')).toBe('/owner/settings/receipts#funding-receipt-call%3Aknown')
      fireEvent.click(within(details).getByRole('button', { name: 'Close' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
    expect(screen.getByText('Credit added')).toBeTruthy()
    expect(screen.getByText('Credit reversed')).toBeTruthy()
    expect(screen.getByText('Document adjustment')).toBeTruthy()
    expect(screen.getByText('Account movement')).toBeTruthy()
  })

  it('opens the exact transaction after sorting and filtering the Arc scan table', async () => {
    const entry = {
      occurredAt: 1_788_119_000_000, recordedAt: 1_788_120_000_000,
      kind: 'funding' as const, accountEffect: { currency: 'AUD' as const, units: '3000000', exponent: 6 as const },
      documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
    }
    render(<AeOwnerCredit accountBalance={accountBalance} accountHistory={{ ...emptyAccountHistory, entries: [
      { ...entry, transactionId: '44', transactionRef: 'transaction:44' },
      { ...entry, transactionId: '42', transactionRef: 'transaction:42', kind: 'call_spend', accountEffect: { ...entry.accountEffect, units: '-1000000' } },
      { ...entry, transactionId: '43', transactionRef: 'transaction:43', accountEffect: { ...entry.accountEffect, units: '2000000' } },
    ] }} />)
    openLedger()
    const table = screen.getByRole('table', { name: 'Booked Account transactions' })
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Balance effect' }))
    expect(within(table).getAllByRole('button', { name: /^View .+ transaction/u }).map(button => button.getAttribute('data-ae-row-action-id'))).toEqual(['42', '43', '44'])
    fireEvent.change(screen.getByPlaceholderText('Filter Account history…'), { target: { value: 'Credit added' } })
    expect(within(table).getAllByRole('button', { name: /^View .+ transaction/u }).map(button => button.getAttribute('data-ae-row-action-id'))).toEqual(['43', '44'])
    fireEvent.click(screen.getByRole('button', { name: 'View Credit added transaction 43' }))
    const details = await screen.findByRole('dialog', { name: 'Account transaction' })
    expect(within(details).getByText('transaction:43')).toBeTruthy()
    expect(within(details).getByText('+A$2.00')).toBeTruthy()
    expect(within(details).queryByText('transaction:42')).toBeNull()
    expect(within(details).queryByText('transaction:44')).toBeNull()
  })

  it('keeps financial documents and owned reconciliation evidence on the Account surface', async () => {
    const onCreateStatement = vi.fn(async () => undefined)
    const onOpenDocument = vi.fn(async () => undefined)
    render(<AeOwnerCredit
      accountBalance={{ ...accountBalance, locked: true }}
      accountHistory={emptyAccountHistory}
      documents={[{
        documentRef: 'money-document:statement:one',
        kind: 'statement',
        amountUnits: '12500000',
        residualUnits: '0',
        sourceTransactionRefs: ['journal:call:one'],
        policyRefs: ['commercial-policy:sandbox:v1'],
        policyDigest: `sha256:${'a'.repeat(64)}`,
        renderInputDigest: `sha256:${'b'.repeat(64)}`,
        templateVersion: 'ae.money-document:html:v1',
        state: 'issued',
        sourceCount: 1,
        rendered: false,
        createdAt: 1_788_120_000_000,
      }]}
      reconciliationCases={[{
        caseRef: 'reconciliation:one',
        accountRef: 'account:owner',
        kind: 'projection_mismatch',
        status: 'open',
        ownerPrincipalRef: 'system:money-reconciliation',
        transactionRef: 'journal:call:one',
        reasonCode: 'projection_checksum_mismatch',
        evidenceRefs: ['evidence:projection:one'],
        createdAt: 1_788_120_000_000,
        updatedAt: 1_788_120_000_000,
      }]}
      onCreateStatement={onCreateStatement}
      onOpenDocument={onOpenDocument}
    />)

    expect(screen.getByText(/locked for reconciliation/i)).toBeTruthy()
    fireEvent.click(screen.getByText('Accounting records and administration'))
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeTruthy()
    expect(screen.getByText('Statement')).toBeTruthy()
    expect(screen.getByText('money-document:statement:one')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Reconciliation' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect reconciliation case reconciliation:one' }))
    const reconciliationDetails = await screen.findByRole('dialog', { name: 'Reconciliation case' })
    expect(within(reconciliationDetails).getByText('projection checksum mismatch')).toBeTruthy()
    expect(within(reconciliationDetails).getByText('reconciliation:one')).toBeTruthy()
    fireEvent.keyDown(reconciliationDetails, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Create previous month’s statement' }))
    await waitFor(() => expect(onCreateStatement).toHaveBeenCalledOnce())
    expect((await screen.findByText('Statement generation started. Its status remains visible below.')).getAttribute('role')).toBe('status')

    fireEvent.click(screen.getByRole('button', { name: 'Open document' }))
    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith('money-document:statement:one'))
  })

  it('keeps document operations scoped to their exact record and action', async () => {
    const pending = new Map<string, { resolve: () => void; reject: () => void }>()
    const onOpenDocument = vi.fn((documentRef: string) => new Promise<void>((resolve, reject) => {
      pending.set(documentRef, { resolve: () => resolve(), reject: () => reject(new Error('open unavailable')) })
    }))
    const onCreateStatement = vi.fn(() => { throw new Error('statement unavailable') })
    const baseDocument = {
      amountUnits: '12500000',
      residualUnits: '0',
      sourceTransactionRefs: ['journal:call:one'],
      policyRefs: ['commercial-policy:sandbox:v1'],
      policyDigest: `sha256:${'a'.repeat(64)}`,
      renderInputDigest: `sha256:${'b'.repeat(64)}`,
      templateVersion: 'ae.money-document:html:v1' as const,
      state: 'issued' as const,
      sourceCount: 1,
      rendered: false,
      createdAt: 1_788_120_000_000,
    }
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={emptyAccountHistory}
      documents={[
        { ...baseDocument, documentRef: 'money-document:statement:one', kind: 'statement' },
        { ...baseDocument, documentRef: 'money-document:tax:two', kind: 'tax_invoice' },
      ]}
      onCreateStatement={onCreateStatement}
      onOpenDocument={onOpenDocument}
    />)

    fireEvent.click(screen.getByText('Accounting records and administration'))
    const table = screen.getByRole('table', { name: 'Accounting documents' })
    const documentRows = () => within(table).getAllByRole('row').slice(1)
    const statementRow = () => documentRows()[0]!
    const taxRow = () => documentRows()[1]!
    fireEvent.click(within(statementRow()).getByRole('button', { name: 'Open document' }))

    expect(screen.getByRole('button', { name: 'Create previous month’s statement' }).hasAttribute('disabled')).toBe(false)
    expect(within(statementRow()).getByRole('button', { name: 'Opening…' }).hasAttribute('disabled')).toBe(true)
    expect(within(statementRow()).getByText('Opening Statement…')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create previous month’s statement' }))
    expect(await screen.findByText('Statement creation could not be confirmed. Refresh documents before trying again.')).toBeTruthy()

    fireEvent.click(within(taxRow()).getByRole('button', { name: 'Open document' }))
    expect(within(taxRow()).getByText('Opening Tax invoice…')).toBeTruthy()
    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledTimes(2))

    await act(async () => {
      pending.get('money-document:statement:one')?.resolve()
      pending.get('money-document:tax:two')?.reject()
      await Promise.resolve()
    })

    expect(within(statementRow()).getByText('Link prepared')).toBeTruthy()
    expect(within(taxRow()).getByText('Could not open')).toBeTruthy()
    expect(within(taxRow()).getByRole('status').getAttribute('title')).toBe('Tax invoice could not be opened. This record remains available.')

    fireEvent.click(within(statementRow()).getByRole('button', { name: 'View details for Statement, money-document:statement:one' }))
    let drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Statement link prepared. If no tab opened, try opening it again.')).toBeTruthy()
    fireEvent.keyDown(drawer, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(within(taxRow()).getByRole('button', { name: 'View details for Tax invoice, money-document:tax:two' }))
    drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('Tax invoice could not be opened. This record remains available.')).toBeTruthy()
  })

  it('AM-11 does not label a preparing document as issued', async () => {
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={emptyAccountHistory}
      documents={[{
        documentRef: 'money-document:funding_receipt:am11-preparing',
        kind: 'funding_receipt',
        amountUnits: '5000000',
        residualUnits: '0',
        sourceTransactionRefs: ['formance:tx:am11-preparing'],
        policyRefs: ['commercial-policy:sandbox:v1'],
        policyDigest: `sha256:${'a'.repeat(64)}`,
        renderInputDigest: `sha256:${'b'.repeat(64)}`,
        templateVersion: 'ae.money-document:html:v1',
        state: 'rendering',
        sourceCount: 1,
        rendered: false,
        createdAt: 1_788_120_000_000,
      }]}
      onOpenDocument={vi.fn()}
    />)

    fireEvent.click(screen.getByText('Accounting records and administration'))
    expect(screen.getByText('Funding receipt')).toBeTruthy()
    expect(screen.getByText('money-document:funding_receipt:am11-preparing')).toBeTruthy()
    expect(screen.getByText('Preparing')).toBeTruthy()
    expect(screen.getByText('Recorded')).toBeTruthy()
    expect(screen.queryByText('Issued')).toBeNull()
    expect(screen.getByRole('button', { name: 'View details for Funding receipt, money-document:funding_receipt:am11-preparing' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open document' })).toBeNull()
  })

  it('AM-11 keeps a failed document listed without offering Open', async () => {
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={emptyAccountHistory}
      documents={[{
        documentRef: 'money-document:adjustment:am11-failed',
        kind: 'adjustment',
        amountUnits: '5780000',
        residualUnits: '0',
        sourceTransactionRefs: ['formance:tx:am11-failed'],
        policyRefs: ['commercial-policy:sandbox:v1'],
        policyDigest: `sha256:${'a'.repeat(64)}`,
        renderInputDigest: `sha256:${'b'.repeat(64)}`,
        templateVersion: 'ae.money-document:html:v1',
        state: 'failed',
        sourceCount: 1,
        rendered: false,
        createdAt: 1_788_120_000_000,
      }]}
      onOpenDocument={vi.fn()}
    />)

    fireEvent.click(screen.getByText('Accounting records and administration'))
    expect(screen.getByText('Adjustment document')).toBeTruthy()
    expect(screen.getByText('money-document:adjustment:am11-failed')).toBeTruthy()
    expect(screen.getByText('Needs attention')).toBeTruthy()
    expect(screen.getByText('Recorded')).toBeTruthy()
    expect(screen.queryByText('Issued')).toBeNull()
    expect(screen.getByRole('button', { name: 'View details for Adjustment document, money-document:adjustment:am11-failed' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open document' })).toBeNull()
  })

  it('deduplicates transaction identity across recoverable pagination', async () => {
    const read = vi.fn(async () => ({
      ...emptyAccountHistory,
      coverage: 'partial' as const,
      entries: [
        {
          transactionId: '2', transactionRef: 'transaction:2', occurredAt: 2, recordedAt: 2,
          kind: 'funding' as const, accountEffect: { currency: 'AUD' as const, units: '10000000', exponent: 6 as const },
          documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
        },
        {
          transactionId: '1', transactionRef: 'transaction:1', occurredAt: 1, recordedAt: 1,
          kind: 'document_adjustment' as const, accountEffect: { currency: 'AUD' as const, units: '0', exponent: 6 as const },
          documentEffectUnits: '-5', reverted: true, revertedAt: 3, sourceRef: null, sourceDigest: null,
        },
      ],
    }))
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={{
        ...emptyAccountHistory,
        entries: [{
          transactionId: '2', transactionRef: 'transaction:2', occurredAt: 2, recordedAt: 2,
          kind: 'funding', accountEffect: { currency: 'AUD', units: '10000000', exponent: 6 },
          documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
        }],
        continueCursor: 'cursor:next',
        isDone: false,
      }}
      accountHistoryPort={{ read }}
    />)
    openLedger()

    expect(screen.queryByText('Some transaction attribution is incomplete')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(read).toHaveBeenCalledWith({ cursor: 'cursor:next' }))
    await waitFor(() => {
      expect(screen.getByText('Some transaction attribution is incomplete')).toBeTruthy()
      expect(screen.getAllByText('Credit added')).toHaveLength(1)
      expect(screen.getByText('Document adjustment')).toBeTruthy()
      expect(screen.getByText('No Balance change')).toBeTruthy()
      expect(screen.getByText('−A$0.01')).toBeTruthy()
      expect(screen.getByText('Reverted')).toBeTruthy()
    })
  })

  it('keeps booked rows and retries the same cursor after pagination fails', async () => {
    const continuation = {
      ...emptyAccountHistory,
      entries: [{
        transactionId: '1', transactionRef: 'transaction:1', occurredAt: 1, recordedAt: 1,
        kind: 'funding' as const, accountEffect: { currency: 'AUD' as const, units: '5000000', exponent: 6 as const },
        documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
      }],
    }
    const read = vi.fn()
      .mockRejectedValueOnce(new Error('history unavailable'))
      .mockResolvedValueOnce(continuation)
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={{ ...emptyAccountHistory, continueCursor: 'cursor:retry', isDone: false }}
      accountHistoryPort={{ read }}
    />)
    openLedger()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getByText('More history could not be loaded')).toBeTruthy())
    expect(screen.getByText('No booked Account transactions yet')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getByText('Credit added')).toBeTruthy())
    expect(read).toHaveBeenNthCalledWith(1, { cursor: 'cursor:retry' })
    expect(read).toHaveBeenNthCalledWith(2, { cursor: 'cursor:retry' })
  })

  it('ignores a late continuation after fresh Account history replaces its source', async () => {
    let resolveContinuation: ((result: AccountHistoryResult) => void) | undefined
    const read = vi.fn(() => new Promise<AccountHistoryResult>((resolve) => {
      resolveContinuation = resolve
    }))
    const { rerender } = render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={{ ...emptyAccountHistory, snapshotAt: 1, continueCursor: 'cursor:old', isDone: false,
        entries: [{
          transactionId: '7', transactionRef: 'transaction:old', occurredAt: 7, recordedAt: 7,
          kind: 'funding', accountEffect: { currency: 'AUD', units: '1000000', exponent: 6 },
          documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
        }],
      }}
      accountHistoryPort={{ read }}
    />)
    openLedger()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(read).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'View Credit added transaction 7' }))
    const details = await screen.findByRole('dialog', { name: 'Account transaction' })
    expect(within(details).getByText('transaction:old')).toBeTruthy()

    rerender(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={{
        ...emptyAccountHistory,
        snapshotAt: 2,
        entries: [{
          transactionId: '9', transactionRef: 'transaction:fresh', occurredAt: 9, recordedAt: 9,
          kind: 'call_spend', accountEffect: { currency: 'AUD', units: '-1000000', exponent: 6 },
          documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
        }],
      }}
      accountHistoryPort={{ read }}
    />)
    resolveContinuation?.({
      ...emptyAccountHistory,
      snapshotAt: 1,
      entries: [{
        transactionId: '8', transactionRef: 'transaction:stale', occurredAt: 8, recordedAt: 8,
        kind: 'funding', accountEffect: { currency: 'AUD', units: '1000000', exponent: 6 },
        documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
      }],
    })

    await waitFor(() => expect(screen.getByText('Call purchase')).toBeTruthy())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('transaction:old')).toBeNull()
    expect(screen.queryByText('Credit added')).toBeNull()
  })

  it('never renders an unavailable balance as zero', () => {
    render(<AeOwnerCredit accountHistory={emptyAccountHistory} />)
    expect(screen.getByText('Credit unavailable')).toBeTruthy()
    expect(document.body.textContent).not.toContain('A$0.00')
  })

  it('retains last authoritative balance and booked rows when refreshes fail', () => {
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={{
        ...emptyAccountHistory,
        entries: [{
          transactionId: '7', transactionRef: 'transaction:7', occurredAt: 7, recordedAt: 7,
          kind: 'funding', accountEffect: { currency: 'AUD', units: '5000000', exponent: 6 },
          documentEffectUnits: '0', reverted: false, revertedAt: null, sourceRef: null, sourceDigest: null,
        }],
      }}
      unavailable={{ balance: true, history: true }}
    />)

    expect(screen.getByText('A$12.50')).toBeTruthy()
    expect(screen.getByText('Balance could not be refreshed')).toBeTruthy()
    openLedger()
    expect(screen.getByText('Credit history could not be refreshed')).toBeTruthy()
    expect(screen.getByText('Credit added')).toBeTruthy()
  })
})

describe('assistant access components', () => {
  it('offers native client authentication and agent-owned connection verification', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example/" />)

    expect(screen.getByRole('group', { name: 'Choose your Agent app' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    expect(document.body.textContent).toContain('codex mcp add agentic-economy --url "https://ae.example/mcp"')
    expect(document.body.textContent).toContain('codex mcp login agentic-economy')
    expect(screen.getByText(/Only a delivered Tool result and receipt completes first use/u)).toBeTruthy()
    expect(screen.queryByText('claude mcp add --transport http --scope user agentic-economy "https://ae.example/mcp"')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    expect(screen.getByText('claude mcp add --transport http --scope user agentic-economy "https://ae.example/mcp"')).toBeTruthy()
    expect(screen.getByText(/open \/mcp, select agentic-economy, then choose Authenticate/u)).toBeTruthy()
    expect(screen.queryByText('codex mcp login agentic-economy')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }))
    expect(screen.getByText('cursor --add-mcp \'{"name":"agentic-economy","url":"https://ae.example/mcp"}\'')).toBeTruthy()
    expect(screen.getByText(/follow its OAuth prompt/u)).toBeTruthy()
    expect(document.body.textContent).not.toContain('ae_agentAccess_whoami')
    expect(screen.queryByRole('button', { name: 'Create agent access key' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/npm install|ae doctor|ae connect|AE_API_KEY=/u)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    const copyButton = screen.getByRole('button', { name: 'Copy setup commands' })
    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith([
      'codex mcp add agentic-economy --url "https://ae.example/mcp"',
      'codex mcp login agentic-economy',
    ].join('\n'))
    const status = await screen.findByText('Codex MCP command copied.')
    expect(status.getAttribute('role')).toBe('status')
  })

  it('normalizes the deployment origin without exposing or asking users to manage a key', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://AE.Example:443/" />)

    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    expect(document.body.textContent).toContain('codex mcp add agentic-economy --url "https://AE.Example:443/mcp"')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup commands' }))
    expect(writeText).toHaveBeenCalledWith('cursor --add-mcp \'{"name":"agentic-economy","url":"https://AE.Example:443/mcp"}\'')
    expect(screen.queryByText(/ae_secret/u)).toBeNull()
    expect(screen.queryByRole('link', { name: /agent-access\.json/u })).toBeNull()
  })

  it('itemizes Australian GST on the loaded amount and platform fee in the funding quote', () => {
    render(
      <AeAccountFundingPanel
        port={{ begin: vi.fn(), read: vi.fn() }}
        constraints={fundingConstraints}
      />,
    )

    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })

    const quote = within(screen.getByLabelText('Funding quote'))
    expect(quote.getByText('Platform fee')).toBeTruthy()
    expect(quote.getByText('A$0.50')).toBeTruthy()
    expect(quote.getByText('Australian GST (10%)')).toBeTruthy()
    expect(quote.getByText('A$1.05')).toBeTruthy()
    expect(screen.getByText(/Adds A\$1\.05 Australian GST \(10%\) on the loaded amount and platform fee\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i })).toBeTruthy()
  })

  it('states the payment outcome when funding is unavailable', () => {
    render(<AeAccountFundingPanel />)
    expect(screen.getByRole('alert').textContent).toContain(
      'No payment was made. Nothing was charged.',
    )
  })

  it('keeps quote geometry when the amount is empty or invalid', () => {
    render(<AeAccountFundingPanel port={{ begin: vi.fn(), read: vi.fn() }} constraints={fundingConstraints} />)

    expect(screen.getByRole('group', { name: 'Funding quote and payment' })).toBeTruthy()
    expect(screen.getByText(/Enter or choose an amount to see credit, fee, GST, and total\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose an amount to continue' }).hasAttribute('disabled')).toBe(true)

    const input = screen.getByLabelText(/other amount/i)
    fireEvent.change(input, { target: { value: '1.00' } })
    fireEvent.blur(input)
    expect(screen.getByRole('group', { name: 'Funding quote and payment' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toMatch(/Enter at least A\$5\.00/)
  })

  it('celebrates a succeeded return with toast and available-credit copy', async () => {
    window.history.replaceState(null, '', '/owner/credit?funding=cs_succeeded')
    const session = am09ReturnedCheckout({
      externalRef: 'cs_succeeded',
      status: 'succeeded',
      checkoutStatus: 'complete',
    })
    const read = vi.fn(async () => session)
    render(
      <AeAccountFundingPanel
        port={{ begin: vi.fn(), read }}
        constraints={fundingConstraints}
        accountBalance={accountBalance}
      />,
    )

    await waitFor(() => expect(read).toHaveBeenCalled())
    await waitFor(() => expect(toast.success).toHaveBeenCalledOnce())
    expect(toast.success).toHaveBeenCalledWith('Payment received', {
      description: 'Available credit is now A$12.50. Paid Calls can use it immediately.',
    })
    expect(screen.getByText(/Credit is available in your balance above and ready for Calls\./)).toBeTruthy()
  })

  it('failed checkout states the balance is unchanged and offers Add more credit', async () => {
    window.history.replaceState(null, '', '/owner/credit?funding=cs_failed_copy')
    const session = am09ReturnedCheckout({
      externalRef: 'cs_failed_copy',
      status: 'failed',
      checkoutStatus: 'complete',
    })
    render(<AeAccountFundingPanel port={{ begin: vi.fn(), read: vi.fn(async () => session) }} constraints={fundingConstraints} />)

    expect(await screen.findByText(/Nothing was charged\./u)).toBeTruthy()
    expect(screen.getByText(/Your balance is unchanged\./u)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add more credit' })).toBeTruthy()
  })

  it('offers policy-valid top-up choices while preserving exact manual entry', () => {
    render(
      <AeAccountFundingPanel
        port={{ begin: vi.fn(), read: vi.fn() }}
        constraints={fundingConstraints}
      />,
    )

    const suggestedAmounts = screen.getByRole('radiogroup', { name: 'Choose a credit amount' })
    expect(suggestedAmounts.textContent).toContain('A$5.00')
    expect(suggestedAmounts.textContent).toContain('A$10.00')
    expect(suggestedAmounts.textContent).toContain('A$25.00')

    const tenDollarChoice = screen.getByRole('radio', { name: '+A$10.00' })
    expect(tenDollarChoice.querySelector('.font-mono')).toBeTruthy()
    expect(tenDollarChoice.querySelector('.tabular-nums')).toBeTruthy()
    fireEvent.click(tenDollarChoice)
    expect(tenDollarChoice.getAttribute('aria-checked')).toBe('true')
    expect((screen.getByLabelText(/other amount/i) as HTMLInputElement).value).toBe('10')
    const quotedPayment = screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i })
    expect(screen.getByRole('group', { name: 'Funding quote and payment' }).contains(quotedPayment)).toBe(true)

    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '7.50' } })
    expect(tenDollarChoice.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('button', { name: /pay A\$8\.67 and add A\$7\.50/i })).toBeTruthy()
  })

  it.each([
    { value: 'not-an-amount', message: /Enter a valid AUD amount/u },
    { value: '1.00', message: /Enter at least A\$5\.00/u },
    { value: '5.005', message: /A\$0\.01 increments/u },
  ])('keeps $value visible with an accessible correction before allowing exact payment', async ({ value, message }) => {
    const begin = vi.fn(async (_input: AccountFundingBeginInput) => ({
      kind: 'refused' as const,
      code: 'stripe_setup_required' as const,
      retryable: false,
    }))
    render(<AeAccountFundingPanel port={{ begin, read: vi.fn() }} constraints={fundingConstraints} />)

    const input = screen.getByLabelText(/other amount/i) as HTMLInputElement
    fireEvent.change(input, { target: { value } })
    fireEvent.blur(input)

    expect(input.value).toBe(value)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('alert').textContent).toMatch(message)
    expect(screen.getByRole('group', { name: 'Funding quote and payment' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose an amount to continue' }).hasAttribute('disabled')).toBe(true)

    fireEvent.change(input, { target: { value: '10.00' } })
    expect(input.value).toBe('10.00')
    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledOnce())
    expect(begin).toHaveBeenCalledWith({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      expectedPolicyDigest: fundingConstraints.policyDigest,
      idempotencyKey: expect.any(String),
    })
  })

  it('refreshes a changed funding quote before an explicit payment with the new policy digest', async () => {
    const refreshedConstraints = {
      ...fundingConstraints,
      serviceFeeBps: 100,
      policyDigest: `sha256:${'a'.repeat(64)}`,
    }
    let rerender: ReturnType<typeof render>['rerender'] | undefined
    const onRefresh = vi.fn(async () => {
      rerender?.(<AeAccountFundingPanel
        port={{ begin, read: vi.fn() }}
        constraints={refreshedConstraints}
        onRefresh={onRefresh}
      />)
    })
    const begin = vi.fn(async (_input: AccountFundingBeginInput) => ({
      kind: 'refused' as const,
      code: begin.mock.calls.length === 1 ? 'price_changed' as const : 'stripe_setup_required' as const,
      retryable: begin.mock.calls.length === 1,
    }))
    const rendered = render(<AeAccountFundingPanel
      port={{ begin, read: vi.fn() }}
      constraints={fundingConstraints}
      onRefresh={onRefresh}
    />)
    rerender = rendered.rerender

    const input = screen.getByLabelText(/other amount/i)
    fireEvent.change(input, { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: /pay A\$11\.11 and add A\$10\.00/i })).toBeTruthy()
    expect(begin).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.11 and add A\$10\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(2))
    expect(begin.mock.calls[1]?.[0]).toMatchObject({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      expectedPolicyDigest: refreshedConstraints.policyDigest,
    })
    expect(await screen.findByText(/No payment was made\. Nothing was charged\./u)).toBeTruthy()
  })

  it('does not offer a stale payment when funding quote refresh fails', async () => {
    const begin = vi.fn(async (_input: AccountFundingBeginInput) => ({
      kind: 'refused' as const,
      code: 'price_changed' as const,
      retryable: true,
    }))
    const onRefresh = vi.fn(async () => {
      throw new Error('quote source unavailable')
    })
    const { rerender } = render(<AeAccountFundingPanel
      port={{ begin, read: vi.fn() }}
      constraints={fundingConstraints}
      onRefresh={onRefresh}
    />)

    const input = screen.getByLabelText(/other amount/i)
    fireEvent.change(input, { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce())
    expect(begin).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toContain('could not be refreshed')
    expect((screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }) as HTMLButtonElement).disabled).toBe(true)

    rerender(<AeAccountFundingPanel
      port={{ begin, read: vi.fn() }}
      onRefresh={onRefresh}
    />)
    expect(screen.queryByRole('button', { name: /pay /i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh funding quote' }))
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2))
    expect(begin).toHaveBeenCalledOnce()
  })

  it('restores an owner draft and reuses the original command after session loss without exposing it to another owner', async () => {
    const begin = vi.fn<AccountFundingPort['begin']>(async () => { throw new Error('response lost') })
    const port: AccountFundingPort = { begin, read: vi.fn() }
    render(<AeAccountFundingPanel port={port} constraints={fundingConstraints} />)
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(1))
    const firstKey = begin.mock.calls[0]?.[0].idempotencyKey
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user_owner')).toBe(firstKey)
    cleanup()

    render(<AeAccountFundingPanel port={port} constraints={fundingConstraints} />)
    expect((screen.getByLabelText(/other amount/i) as HTMLInputElement).value).toBe('10.00')
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(2))
    expect(begin.mock.calls[1]?.[0].idempotencyKey).toBe(firstKey)
    cleanup()

    clerkIdentity.userId = 'user_other'
    render(<AeAccountFundingPanel port={port} constraints={fundingConstraints} />)
    expect((screen.getByLabelText(/other amount/i) as HTMLInputElement).value).toBe('')
    expect(window.sessionStorage.getItem('ae.account-funding.attempt.user_other')).toBeNull()
  })

  it('starts a bound hosted Checkout Session and redirects without persisting payment material', async () => {
    const session: CreditPaymentSession = {
      kind: 'hosted_redirect',
      evidence: {
        provider: 'stripe',
        externalRef: 'cs_test_bound',
        amount: { currency: 'AUD', units: '1155', exponent: 2 },
        status: 'pending',
        checkoutStatus: 'open',
        paymentStatus: 'unpaid',
        checkoutMode: 'hosted_page',
        checkoutExpiresAt: 3_600_000,
        requestDigest: 'digest:request',
        metadataDigest: 'digest:metadata',
        checkoutSessionDigest: 'digest:checkout-session',
        evidenceDigest: 'digest:evidence',
        evidenceRef: 'stripe:checkout:cs_test_bound',
        observedAt: 1,
      },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_bound',
      expiresAt: 3_600_000,
    }
    const begin = vi.fn(async (_input: AccountFundingBeginInput) => ({
      kind: 'ok' as const,
      commandRef: 'funding:one',
      session,
    }))
    const read = vi.fn(async () => session)
    const redirectToCheckout = vi.fn()
    render(
      <AeAccountFundingPanel
        port={{ begin, read }}
        constraints={fundingConstraints}
        redirectToCheckout={redirectToCheckout}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Enter an amount' })).toBeNull()
    expect(begin).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })
    expect(screen.getAllByText('A$10.00').length).toBeGreaterThan(0)
    const quote = within(screen.getByLabelText('Funding quote'))
    expect(quote.getByText('Platform fee')).toBeTruthy()
    expect(quote.getByText('A$0.50')).toBeTruthy()
    expect(quote.getByText('A$1.05')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))

    await waitFor(() => expect(redirectToCheckout).toHaveBeenCalledWith(session.checkoutUrl))
    expect(begin).toHaveBeenCalledWith({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      expectedPolicyDigest: fundingConstraints.policyDigest,
      idempotencyKey: expect.any(String),
    })
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.user_owner')).not.toContain('checkout.stripe.com')
    expect(read).not.toHaveBeenCalled()
    const continueButton = await screen.findByRole('button', { name: 'Continue secure payment' })
    expect(screen.getByRole('button', { name: 'Refresh payment status' })).toBeTruthy()
    fireEvent.click(continueButton)
    expect(redirectToCheckout).toHaveBeenCalledTimes(2)

    const firstKey = begin.mock.calls[0]?.[0]?.idempotencyKey
    cleanup()
    read.mockResolvedValue({ ...session, evidence: { ...session.evidence, status: 'succeeded' } })
    render(<AeAccountFundingPanel port={{ begin, read }} constraints={fundingConstraints} redirectToCheckout={redirectToCheckout} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add more credit' }))
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.user_owner')).toBeNull()
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '5.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$5\.78 and add A\$5\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(2))
    expect(begin.mock.calls[1]?.[0]?.idempotencyKey).not.toBe(firstKey)
    expect(begin.mock.calls[1]?.[0]?.amount.units).toBe('5000000')
  })

  it('preserves the exact checkout when browser navigation is blocked', async () => {
    const session: CreditPaymentSession = {
      kind: 'hosted_redirect',
      evidence: {
        provider: 'stripe', externalRef: 'cs_blocked', amount: { currency: 'AUD', units: '11550000', exponent: 6 },
        status: 'pending', checkoutStatus: 'open', paymentStatus: 'unpaid', checkoutMode: 'hosted_page',
        checkoutExpiresAt: 3_600_000, requestDigest: 'digest:request', metadataDigest: 'digest:metadata',
        checkoutSessionDigest: 'digest:checkout', evidenceDigest: 'digest:evidence', evidenceRef: 'stripe:checkout:cs_blocked', observedAt: 1,
      },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_blocked',
      expiresAt: 3_600_000,
    }
    const begin = vi.fn(async () => ({ kind: 'ok' as const, commandRef: 'funding:blocked', session }))
    const redirectToCheckout = vi.fn(() => { throw new Error('popup blocked') })
    render(<AeAccountFundingPanel port={{ begin, read: vi.fn() }} constraints={fundingConstraints} redirectToCheckout={redirectToCheckout} />)

    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))

    expect(await screen.findByText(/This payment attempt is preserved/u)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue secure payment' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh payment status' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add more credit' })).toBeNull()
  })

  it.each(['refused', 'transport failure'] as const)('resumes confirmed checkout, then requires status refresh after %s', async (failure) => {
    const locator = { externalRef: 'cs_readback', idempotencyKey: 'funding:readback' }
    window.sessionStorage.setItem('ae.account-funding.recovery.user_owner', JSON.stringify(locator))
    const session: CreditPaymentSession = {
      kind: 'hosted_redirect',
      evidence: {
        provider: 'stripe', externalRef: locator.externalRef, amount: { currency: 'AUD', units: '11550000', exponent: 6 },
        status: 'pending', checkoutStatus: 'open', paymentStatus: 'unpaid', checkoutMode: 'hosted_page',
        checkoutExpiresAt: 3_600_000, requestDigest: 'digest:request', metadataDigest: 'digest:metadata',
        checkoutSessionDigest: 'digest:checkout', evidenceDigest: 'digest:evidence', evidenceRef: 'stripe:checkout:cs_readback', observedAt: 1,
      },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_readback',
      expiresAt: 3_600_000,
    }
    const read = vi.fn<AccountFundingPort['read']>(async () => session)
    const redirectToCheckout = vi.fn()
    render(<AeAccountFundingPanel port={{ begin: vi.fn(), read }} constraints={fundingConstraints} redirectToCheckout={redirectToCheckout} />)

    await waitFor(() => expect(read).toHaveBeenCalledWith(locator))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue secure payment' }))
    expect(redirectToCheckout).toHaveBeenCalledWith(session.checkoutUrl)
    expect(screen.queryByRole('button', { name: /pay /i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add more credit' })).toBeNull()
    if (failure === 'refused') {
      read.mockResolvedValueOnce({ kind: 'refused', code: 'stripe_setup_required', retryable: false })
    } else {
      read.mockRejectedValueOnce(new Error('status source unavailable'))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Refresh payment status' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Continue secure payment' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Refresh payment status' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /pay /i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add more credit' })).toBeNull()
    expect(read).toHaveBeenLastCalledWith(locator)
  })

  it('keeps an unreadable stored attempt recoverable through the same locator', async () => {
    const locator = { commandRef: 'sha256:stored-attempt', idempotencyKey: 'funding:stored-attempt' }
    window.sessionStorage.setItem('ae.account-funding.recovery.user_owner', JSON.stringify(locator))
    const read = vi.fn<AccountFundingPort['read']>(async () => ({ kind: 'refused', code: 'stripe_setup_required', retryable: false }))
    const begin = vi.fn()
    render(<AeAccountFundingPanel port={{ begin, read }} constraints={fundingConstraints} />)

    expect(await screen.findByText(/remains unresolved/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /pay /i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add more credit' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh payment status' }))
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    expect(read).toHaveBeenNthCalledWith(1, locator)
    expect(read).toHaveBeenNthCalledWith(2, locator)
    expect(begin).not.toHaveBeenCalled()
  })

  it('quotes from the supplied authoritative constraints rather than a fixed client policy', () => {
    render(<AeAccountFundingPanel
      port={{ begin: vi.fn(), read: vi.fn() }}
      constraints={{ ...fundingConstraints, serviceFeeBps: 100 }}
    />)
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })
    expect(screen.getByRole('button', { name: /pay A\$11\.11 and add A\$10\.00/i })).toBeTruthy()
  })

  it('persists and reuses an outcome-unknown command locator without offering a retry', async () => {
    const begin = vi.fn(async (_input: { idempotencyKey: string }) => ({
      kind: 'outcome_unknown' as const,
      code: 'funding_outcome_unknown' as const,
      retryable: false as const,
      commandRef: 'sha256:topup-command-unknown',
      status: 'outcome_unknown' as const,
    }))
    const read = vi.fn(async () => ({ kind: 'refused' as const, code: 'funding_outcome_unknown' as const, retryable: true }))
    const port: AccountFundingPort = { begin, read }
    render(<AeAccountFundingPanel port={port} constraints={fundingConstraints} />)

    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))

    expect(await screen.findByText(/do not start another payment/i)).toBeTruthy()
    const raw = window.sessionStorage.getItem('ae.account-funding.recovery.user_owner')
    const locator = raw === null ? undefined : JSON.parse(raw) as { commandRef: string; idempotencyKey: string }
    expect(locator).toMatchObject({ commandRef: 'sha256:topup-command-unknown' })
    expect(locator?.idempotencyKey).toBe(begin.mock.calls[0]?.[0]?.idempotencyKey)
    expect(screen.queryByRole('button', { name: /pay /i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add more credit' })).toBeNull()

    cleanup()
    render(<AeAccountFundingPanel port={port} constraints={fundingConstraints} />)
    await waitFor(() => expect(read).toHaveBeenCalledWith(locator))
  })

  it('AM-09 lets a failed Checkout start another payment with a new command', async () => {
    window.history.replaceState(null, '', '/owner/credit?funding=cs_am09_failed')
    const session = am09ReturnedCheckout({
      externalRef: 'cs_am09_failed',
      status: 'failed',
      checkoutStatus: 'complete',
    })
    const begin = vi.fn()
    const read = vi.fn(async () => session)
    render(<AeAccountFundingPanel port={{ begin, read }} constraints={fundingConstraints} />)

    expect(await screen.findByText(/Nothing was charged\./u)).toBeTruthy()
    expect(screen.getByText(/Your balance is unchanged\./u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue secure payment' })).toBeNull()
    expect(begin).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Add more credit' }))
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.user_owner')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('funding')).toBeNull()
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '5.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$5\.78 and add A\$5\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(1))
    expect(begin.mock.calls[0]?.[0]?.idempotencyKey).toMatch(/^account-funding:/u)
    expect(begin.mock.calls[0]?.[0]?.amount.units).toBe('5000000')
  })

  it('AM-09 lets an expired Checkout start another payment with a new command', async () => {
    window.history.replaceState(null, '', '/owner/credit?funding=cs_am09_expired')
    const session = am09ReturnedCheckout({
      externalRef: 'cs_am09_expired',
      status: 'pending',
      checkoutStatus: 'expired',
    })
    const begin = vi.fn()
    const read = vi.fn(async () => session)
    render(<AeAccountFundingPanel port={{ begin, read }} constraints={fundingConstraints} />)

    expect(await screen.findByText(/checkout expired before payment finished/i)).toBeTruthy()
    expect(screen.queryByText(/still processing/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Continue secure payment' })).toBeNull()
    expect(begin).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Add more credit' }))
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.user_owner')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('funding')).toBeNull()
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '5.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$5\.78 and add A\$5\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(1))
    expect(begin.mock.calls[0]?.[0]?.idempotencyKey).toMatch(/^account-funding:/u)
  })

  it('keeps unavailable top-up from starting payment or changing credit', async () => {
    const begin = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    const read = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    render(
      <AeAccountFundingPanel port={{ begin, read }} constraints={fundingConstraints} />
    )
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$11\.55 and add A\$10\.00/i }))

    expect(begin).toHaveBeenCalledOnce()
    expect(await screen.findByText(/account funding is unavailable/i)).toBeTruthy()
    expect(screen.getByText(/No payment was made\. Nothing was charged\. Your balance is unchanged\./u)).toBeTruthy()
    expect(screen.queryByText('Payment received')).toBeNull()
  })

  it('renders Agent usage without presenting a per-credential balance', () => {
    render(
      <AeAgentOperatorConsole
        directory={keyDirectory}
        loading={false}
        onDisconnectAgent={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )
    expect(screen.queryByRole('heading', { name: 'Credit' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open Credit' })).toBeNull()
    expect(screen.queryByText('Rotate, replace, or recover a key')).toBeNull()
    expect(screen.queryByText('Provider reauthorization required')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: `View UI assistant (Sandbox · ${keyReadback.principalId})` }))
    expect(screen.queryByText(/USD 12\.5/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(screen.getByText('A$5.01')).toBeTruthy()
    expect(screen.queryByText('Balance')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Spending policy' }))
    expect(screen.getAllByText('Browse only').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sandbox').length).toBeGreaterThan(0)
    expect(screen.queryByText('30/min · 300/hour')).toBeNull()
    expect(screen.queryByText('USD 25.00')).toBeNull()
  })

  it('shows a known empty UTC period as zero Calls instead of an unavailable read', () => {
    const emptyPeriodDirectory = projectAgentDirectory(
      [keyReadback],
      [canonicalAgentRecord([keyReadback])],
      [],
      [{
        principalRef: keyReadback.principalId,
        activity: [],
        activityIsDone: true,
        usage: {
          periodStartAt: Date.UTC(2026, 8, 1),
          periodEndAt: Date.UTC(2026, 9, 1),
          callCount: 0,
          completedCallCount: 0,
          outcomeUnknownCallCount: 0,
          settledSpend: { currency: 'AUD', units: '0', exponent: 6 },
          amountCoverage: 'complete' as const,
          updatedAt: Date.UTC(2026, 8, 1),
        },
        dataState: 'empty' as const,
      }],
    )
    render(
      <AeAgentOperatorConsole
        directory={emptyPeriodDirectory}
        loading={false}
        onDisconnectAgent={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: `View UI assistant (Sandbox · ${keyReadback.principalId})` }))
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(screen.getByText('Calls this UTC month', { selector: 'dt' }).nextElementSibling?.textContent).toBe('0')
    expect(screen.getAllByText('A$0.00').length).toBeGreaterThan(0)
    expect(screen.getByText('No usage yet')).toBeTruthy()
    expect(screen.queryByText('Usage details are temporarily unavailable')).toBeNull()
  })

  it('keeps the known balance when canonical history is unavailable', () => {
    const onCreditRefresh = vi.fn()
    render(
      <AeOwnerCredit
        accountBalance={accountBalance}
        accountHistory={{ kind: 'unavailable', code: 'source_unavailable' }}
        onCreditRefresh={onCreditRefresh}
      />,
    )
    expect(screen.getByText('A$12.50')).toBeTruthy()
    openLedger()
    expect(screen.getByText('Credit history unavailable')).toBeTruthy()
    expect(screen.getByText(/No missing transaction or amount is being inferred/)).toBeTruthy()
    expect(screen.queryByText('No booked Account transactions yet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onCreditRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows only safe approval facts and guards concurrent decisions', () => {
    const onDecideApproval = vi.fn()
    render(
      <AeAgentOperatorConsole
        directory={emptyDirectory}
        loading={false}
        onDisconnectAgent={() => undefined}
        approvals={[{
          callRef: 'call:approval:one',
          toolRef: 'market.email.send:v1',
          authorityRequest: {
            kind: 'approval_required',
            toolRef: 'market.email.send:v1',
            consequence: 'communication',
            retryClass: 'reconcile_before_retry',
            maximumSpend: { currency: 'USD', units: '125', exponent: 2 },
            dataFields: ['recipient.email', 'message.subject'],
          },
          createdAt: 1,
          decisionContext: {
            agent: {
              principalRef: 'principal:agent:one',
              applicationRef: 'application:agent:one',
              currentDisplayName: 'Inbox assistant',
            },
            purpose: null,
            acceptedQuote: {
              kind: 'available',
              quoteRef: 'quote:one',
              tool: { name: 'Send an email', description: 'Sends one email to the selected recipient.' },
              provider: { ref: 'provider:mail:one', name: null },
              maximumSpend: { currency: 'AUD', units: '1250000', exponent: 6 },
              dataUse: [{
                effectId: 'release-recipient',
                inputPointer: '/recipient/email',
                classification: 'personal',
                phase: 'execution',
                recipient: { kind: 'selected_binding' },
                purposes: ['message_delivery'],
              }],
              effects: [{
                effectId: 'send-message',
                class: 'external_state_change',
                authority: 'explicit',
                reversibility: 'irreversible',
              }],
            },
          },
        }]}
        approvalsLoading={false}
        approvalDecision={{ callRef: 'call:approval:one', decision: 'approve' }}
        approvalStatus="market.email.send:v1 approved once."
        onRetryApprovals={() => undefined}
        onDecideApproval={onDecideApproval}
        accessUnavailable
      />,
    )

    expect(screen.getByRole('heading', { name: 'Waiting for approval' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Send an email' }).getAttribute('href')).toBe('/tools/market.email.send%3Av1')
    expect(screen.getByText('Sends one email to the selected recipient.')).toBeTruthy()
    expect(screen.getByText('Inbox assistant (current account label)')).toBeTruthy()
    expect(screen.getByText('Not recorded for this Call')).toBeTruthy()
    expect(screen.getByText('provider:mail:one (name not recorded)')).toBeTruthy()
    expect(screen.getByText('Sends a communication')).toBeTruthy()
    expect(screen.getByText('A$1.25')).toBeTruthy()
    expect(screen.getByText('Changes external state · irreversible')).toBeTruthy()
    expect(screen.getByText('Personal data: recipient.email to selected Provider during execution for message delivery')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('market.email.send:v1 approved once.')
    const approveButton = screen.getByRole('button', { name: 'Approving once…' })
    const declineButton = screen.getByRole('button', { name: 'Decline' })
    expect(approveButton.hasAttribute('disabled')).toBe(true)
    expect(declineButton.hasAttribute('disabled')).toBe(true)
    fireEvent.click(declineButton)
    expect(onDecideApproval).not.toHaveBeenCalled()
    expect(screen.queryByText(/call:approval:one|credential|transport|input/iu)).toBeNull()
  })

  it('does not allow approval when accepted Quote decision facts are unavailable', () => {
    const onDecideApproval = vi.fn()
    const onRetryApprovals = vi.fn()
    render(
      <AeAgentOperatorConsole
        directory={emptyDirectory}
        loading={false}
        onDisconnectAgent={() => undefined}
        approvals={[{
          callRef: 'call:approval:legacy',
          toolRef: 'market.email.send:v1',
          authorityRequest: {
            kind: 'approval_required',
            toolRef: 'market.email.send:v1',
            consequence: 'communication',
            retryClass: 'reconcile_before_retry',
            maximumSpend: { currency: 'USD', units: '900', exponent: 2 },
            dataFields: [],
          },
          createdAt: 1,
        }]}
        approvalsLoading={false}
        onRetryApprovals={onRetryApprovals}
        onDecideApproval={onDecideApproval}
        accessUnavailable
      />,
    )

    expect(screen.getByRole('heading', { name: 'Tool details unavailable' })).toBeTruthy()
    expect(screen.getByText('Decision facts are incomplete')).toBeTruthy()
    expect(screen.getByText('Accepted Quote unavailable')).toBeTruthy()
    expect(screen.queryByText('USD 9.00')).toBeNull()
    expect(screen.getByRole('button', { name: 'Approve once' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Decline' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh decision details' }))
    expect(onRetryApprovals).toHaveBeenCalledOnce()
  })
})
