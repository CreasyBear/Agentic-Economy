/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
import type { AccountHistoryResult, CreditPaymentSession } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingBeginInput, AccountFundingConstraints } from '@/modules/money/server'

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
      maximumSpendPerCall: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
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
      amount: { currency: 'AUD', units: '10550000', exponent: 6 },
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
  vi.clearAllMocks()
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function openLedger() {
  fireEvent.click(screen.getByRole('tab', { name: 'Ledger' }))
}

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

  it('keeps transaction identity and unavailable source links explicit', () => {
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
          accountEffect: { currency: 'AUD', units: '-500000', exponent: 6 },
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
    expect(screen.getByText('−A$0.50')).toBeTruthy()
    fireEvent.click(screen.getByText('Transaction details'))
    expect(screen.getByText(/Transaction ID:/).parentElement?.textContent).toContain('42')
    expect(screen.getByText(/Source link:/).parentElement?.textContent).toContain('Unavailable from Account history')
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
    expect(screen.getByText('projection checksum mismatch')).toBeTruthy()
    expect(screen.getByText('reconciliation:one')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create current statement' }))
    await waitFor(() => expect(onCreateStatement).toHaveBeenCalledOnce())
    expect(screen.getByRole('status').textContent).toContain('Statement generation started.')

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
    const openButtons = screen.getAllByRole('button', { name: 'Open document' })
    fireEvent.click(openButtons[0]!)

    expect(screen.getByRole('button', { name: 'Create current statement' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: 'Open document' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Opening Statement…')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create current statement' }))
    expect(await screen.findByText('Statement creation could not be confirmed. Refresh documents before trying again.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open document' }))
    expect(screen.getByText('Opening Tax invoice…')).toBeTruthy()
    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledTimes(2))

    await act(async () => {
      pending.get('money-document:statement:one')?.resolve()
      pending.get('money-document:tax:two')?.reject()
      await Promise.resolve()
    })

    expect(screen.getByText('Statement link prepared. If no tab opened, try opening it again.')).toBeTruthy()
    expect(screen.getByText('Tax invoice could not be opened. This record remains available.')).toBeTruthy()
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
    expect(screen.getByRole('button', { name: 'Preparing…' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Open document' })).toBeNull()
  })

  it('AM-11 keeps a failed document listed without offering Open', async () => {
    render(<AeOwnerCredit
      accountBalance={accountBalance}
      accountHistory={emptyAccountHistory}
      documents={[{
        documentRef: 'money-document:adjustment:am11-failed',
        kind: 'adjustment',
        amountUnits: '5280000',
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
    expect(screen.getByRole('button', { name: 'Preparing…' }).hasAttribute('disabled')).toBe(true)
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
      expect(screen.getByText('−<A$0.01')).toBeTruthy()
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
      accountHistory={{ ...emptyAccountHistory, snapshotAt: 1, continueCursor: 'cursor:old', isDone: false }}
      accountHistoryPort={{ read }}
    />)
    openLedger()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(read).toHaveBeenCalledOnce())

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

    expect(screen.getByRole('heading', { name: 'Connect with Codex' })).toBeTruthy()
    expect(document.body.textContent).toContain('codex mcp add agentic-economy --url "https://ae.example/mcp"')
    expect(document.body.textContent).toContain('codex mcp login agentic-economy')
    expect(screen.getByText(/Connection is complete only when it appears in Agents/u)).toBeTruthy()
    expect(screen.getByText(/A live result confirms the connection; installing it alone does not/u)).toBeTruthy()
    expect(screen.queryByText('claude mcp add --transport http --scope user agentic-economy "https://ae.example/mcp"')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Use Claude Code or Cursor' }))
    expect(screen.getByText('claude mcp add --transport http --scope user agentic-economy "https://ae.example/mcp"')).toBeTruthy()
    expect(screen.getByText(/open \/mcp, select agentic-economy, then choose Authenticate/u)).toBeTruthy()
    expect(screen.getByText('cursor --add-mcp \'{"name":"agentic-economy","url":"https://ae.example/mcp"}\'')).toBeTruthy()
    expect(screen.getByText(/follow its OAuth prompt/u)).toBeTruthy()
    expect(document.body.textContent).not.toContain('ae_agentAccess_whoami')
    expect(screen.queryByRole('button', { name: 'Create agent access key' })).toBeNull()
    expect(document.body.textContent).not.toMatch(/npm install|ae doctor|ae connect|AE_API_KEY=/u)

    const copyButton = screen.getByRole('button', { name: 'Copy Codex MCP command' })
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

    expect(document.body.textContent).toContain('codex mcp add agentic-economy --url "https://AE.Example:443/mcp"')
    fireEvent.click(screen.getByRole('button', { name: 'Use Claude Code or Cursor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Cursor MCP command' }))
    expect(writeText).toHaveBeenCalledWith('cursor --add-mcp \'{"name":"agentic-economy","url":"https://AE.Example:443/mcp"}\'')
    expect(screen.queryByText(/ae_secret/u)).toBeNull()
    expect(screen.queryByRole('link', { name: /agent-access\.json/u })).toBeNull()
  })

  it('itemizes Australian GST on the platform fee in the funding quote', () => {
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
    expect(quote.getByText('A$0.05')).toBeTruthy()
    expect(screen.getByText(/Includes A\$0\.05 Australian GST \(10%\) on the platform fee\./)).toBeTruthy()
    expect(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i })).toBeTruthy()
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

    const suggestedAmounts = screen.getByRole('group', { name: 'Choose a credit amount' })
    expect(suggestedAmounts.textContent).toContain('A$5.00')
    expect(suggestedAmounts.textContent).toContain('A$10.00')
    expect(suggestedAmounts.textContent).toContain('A$25.00')

    const tenDollarChoice = screen.getByRole('button', { name: '+A$10.00' })
    expect(tenDollarChoice.className).toMatch(/font-mono/)
    expect(tenDollarChoice.className).toMatch(/tabular-nums/)
    fireEvent.click(tenDollarChoice)
    expect(tenDollarChoice.getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByLabelText(/other amount/i) as HTMLInputElement).value).toBe('10')
    const quotedPayment = screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i })
    expect(screen.getByRole('group', { name: 'Funding quote and payment' }).contains(quotedPayment)).toBe(true)

    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '7.50' } })
    expect(tenDollarChoice.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /pay A\$7\.92 and add A\$7\.50/i })).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }))
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
    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: /pay A\$10\.11 and add A\$10\.00/i })).toBeTruthy()
    expect(begin).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.11 and add A\$10\.00/i }))
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
    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce())
    expect(begin).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toContain('could not be refreshed')
    expect((screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }) as HTMLButtonElement).disabled).toBe(true)

    rerender(<AeAccountFundingPanel
      port={{ begin, read: vi.fn() }}
      onRefresh={onRefresh}
    />)
    expect(screen.queryByRole('button', { name: /pay /i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh funding quote' }))
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(2))
    expect(begin).toHaveBeenCalledOnce()
  })

  it('starts a bound hosted Checkout Session and redirects without persisting payment material', async () => {
    const session: CreditPaymentSession = {
      kind: 'hosted_redirect',
      evidence: {
        provider: 'stripe',
        externalRef: 'cs_test_bound',
        amount: { currency: 'AUD', units: '1055', exponent: 2 },
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
    expect(quote.getByText('A$0.05')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }))

    await waitFor(() => expect(redirectToCheckout).toHaveBeenCalledWith(session.checkoutUrl))
    expect(begin).toHaveBeenCalledWith({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      expectedPolicyDigest: fundingConstraints.policyDigest,
      idempotencyKey: expect.any(String),
    })
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.v1')).not.toContain('checkout.stripe.com')
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
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.v1')).toBeNull()
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '5.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$5\.28 and add A\$5\.00/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(2))
    expect(begin.mock.calls[1]?.[0]?.idempotencyKey).not.toBe(firstKey)
    expect(begin.mock.calls[1]?.[0]?.amount.units).toBe('5000000')
  })

  it('preserves the exact checkout when browser navigation is blocked', async () => {
    const session: CreditPaymentSession = {
      kind: 'hosted_redirect',
      evidence: {
        provider: 'stripe', externalRef: 'cs_blocked', amount: { currency: 'AUD', units: '10550000', exponent: 6 },
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
    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }))

    expect(await screen.findByText(/This payment attempt is preserved/u)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue secure payment' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh payment status' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add more credit' })).toBeNull()
  })

  it.each(['refused', 'transport failure'] as const)('resumes confirmed checkout, then requires status refresh after %s', async (failure) => {
    const locator = { externalRef: 'cs_readback', idempotencyKey: 'funding:readback' }
    window.sessionStorage.setItem('ae.account-funding.recovery.v1', JSON.stringify(locator))
    const session: CreditPaymentSession = {
      kind: 'hosted_redirect',
      evidence: {
        provider: 'stripe', externalRef: locator.externalRef, amount: { currency: 'AUD', units: '10550000', exponent: 6 },
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
    window.sessionStorage.setItem('ae.account-funding.recovery.v1', JSON.stringify(locator))
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
    expect(screen.getByRole('button', { name: /pay A\$10\.11 and add A\$10\.00/i })).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }))

    expect(await screen.findByText(/do not start another payment/i)).toBeTruthy()
    const raw = window.sessionStorage.getItem('ae.account-funding.recovery.v1')
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
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.v1')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('funding')).toBeNull()
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '5.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$5\.28 and add A\$5\.00/i }))
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
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.v1')).toBeNull()
    expect(new URL(window.location.href).searchParams.get('funding')).toBeNull()
    fireEvent.change(screen.getByLabelText(/other amount/i), { target: { value: '5.00' } })
    fireEvent.click(screen.getByRole('button', { name: /pay A\$5\.28 and add A\$5\.00/i }))
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
    fireEvent.click(screen.getByRole('button', { name: /pay A\$10\.55 and add A\$10\.00/i }))

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
    fireEvent.click(screen.getByRole('button', { name: 'View UI assistant' }))
    expect(screen.queryByText(/USD 12\.5/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(screen.getByText(/AUD 5\.005/u)).toBeTruthy()
    expect(screen.queryByText('Balance')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Spending policy' }))
    expect(screen.getAllByText('Browse only').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sandbox').length).toBeGreaterThan(0)
    expect(screen.getByText('30/min · 300/hour')).toBeTruthy()
    expect(screen.getAllByText('USD 25.00').length).toBeGreaterThan(0)
    expect(screen.queryByText(/scope:|data:|principal|clerk_api_key/u)).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'View UI assistant' }))
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }))
    expect(screen.getByText('Calls this month').nextElementSibling?.textContent).toBe('0')
    expect(screen.getAllByText('AUD 0.000000').length).toBeGreaterThan(0)
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
    expect(screen.getByText('AUD 1.250000')).toBeTruthy()
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
