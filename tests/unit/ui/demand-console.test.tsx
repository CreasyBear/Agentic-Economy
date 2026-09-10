/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentOperatorConsole } from '@/components/ae/console/AeAgentOperatorConsole'
import type { AgentCredentialSource, AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { projectAgentDirectory } from '@/modules/agent-access/agent-access-console'
import { canonicalAgentRecord } from '../../helpers/agent-directory-fixture'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeAccountFundingPanel, type AccountFundingPort } from '@/components/ae/console/AeCreditTopUpPanel'
import { AeOwnerCredit } from '@/components/ae/console/AeOwnerCredit'
import type { CreditPaymentSession } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingBeginInput } from '@/modules/money/server'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: { to: string; params?: Record<string, string>; children: ReactNode }) => (
    <a href={params?.toolRef === undefined ? to : to.replace('$toolRef', encodeURIComponent(params.toolRef))} {...props}>{children}</a>
  ),
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


afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

describe('owner credit target', () => {
  it('preserves refused Call state and unknown amount in activity details', () => {
    const source = {
        ...keyReadback,
        activity: [{
          callRef: 'call:refused',
          credentialRef: 'credential:key_ui_1',
          toolRef: 'tool:weather',
          toolLabel: 'Weather lookup',
          providerRef: 'provider:weather',
          state: 'refused' as const,
          deliveryState: 'not_delivered' as const,
          paymentState: 'not_applicable' as const,
          createdAt: 2,
          updatedAt: 2,
        }],
      } as const
    render(<AeOwnerCredit
      directory={projectAgentDirectory([source], [canonicalAgentRecord([source])])}
      accountBalance={accountBalance}
      loading={false}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'View Weather lookup' }))
    expect(screen.getByText('Call refused')).toBeTruthy()
    expect(screen.getAllByText('Amount unknown').length).toBeGreaterThan(0)
    expect(screen.getByText('Not applicable')).toBeTruthy()
  })

  it('reads the current Tool Provider from the charge detail sheet', () => {
    const source: AgentCredentialSource = {
      ...keyReadback,
      activity: [{
        callRef: 'call:tool-provider',
        credentialRef: 'credential:key_ui_1',
        toolRef: `operation:v1:${'a'.repeat(64)}`,
        toolLabel: 'Extract invoice fields',
        providerRef: 'provider:ledger-labs',
        state: 'completed' as const,
        deliveryState: 'delivered' as const,
        paymentState: 'settled' as const,
        audAmountUnits: '500000',
        createdAt: 3,
        updatedAt: 3,
        tool: { label: 'Extract invoice fields', provider: 'Ledger Labs' },
      }],
    }
    render(<AeOwnerCredit
      directory={projectAgentDirectory([source], [canonicalAgentRecord([source])])}
      accountBalance={accountBalance}
      loading={false}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'View Extract invoice fields' }))
    expect(screen.getByText('Provider')).toBeTruthy()
    expect(screen.getByText('Ledger Labs')).toBeTruthy()
  })

  it('keeps financial documents and owned reconciliation evidence on the Account surface', async () => {
    const onCreateStatement = vi.fn(async () => undefined)
    const onOpenDocument = vi.fn(async () => undefined)
    render(<AeOwnerCredit
      directory={emptyDirectory}
      accountBalance={{ ...accountBalance, locked: true }}
      loading={false}
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
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeTruthy()
    expect(screen.getByText('Statement')).toBeTruthy()
    expect(screen.getByText('money-document:statement:one')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Reconciliation' })).toBeTruthy()
    expect(screen.getByText('projection checksum mismatch')).toBeTruthy()
    expect(screen.getByText('reconciliation:one')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Create current statement' }))
    await waitFor(() => expect(onCreateStatement).toHaveBeenCalledOnce())
    expect(screen.getByRole('status').textContent).toContain('Document generation started.')

    fireEvent.click(screen.getByRole('button', { name: 'Open document' }))
    await waitFor(() => expect(onOpenDocument).toHaveBeenCalledWith('money-document:statement:one'))
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
    expect(screen.getByText(/browse Tools before connecting/u)).toBeTruthy()
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
        redirectToCheckout={redirectToCheckout}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /continue to stripe/i }))
    expect(screen.getByText('Enter a valid AUD funding amount before starting payment.')).toBeTruthy()
    expect(begin).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/account funding amount/i), { target: { value: '10.00' } })
    expect(screen.queryByText('Enter a valid AUD funding amount before starting payment.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /continue to stripe/i }))

    await waitFor(() => expect(redirectToCheckout).toHaveBeenCalledWith(session.checkoutUrl))
    expect(begin).toHaveBeenCalledWith({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      idempotencyKey: expect.any(String),
    })
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.v1')).not.toContain('checkout.stripe.com')
    expect(read).not.toHaveBeenCalled()

    const firstKey = begin.mock.calls[0]?.[0]?.idempotencyKey
    cleanup()
    read.mockResolvedValue({ ...session, evidence: { ...session.evidence, status: 'succeeded' } })
    render(<AeAccountFundingPanel port={{ begin, read }} redirectToCheckout={redirectToCheckout} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add more credit' }))
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.v1')).toBeNull()
    fireEvent.change(screen.getByLabelText(/account funding amount/i), { target: { value: '5.00' } })
    fireEvent.click(screen.getByRole('button', { name: /continue to stripe/i }))
    await waitFor(() => expect(begin).toHaveBeenCalledTimes(2))
    expect(begin.mock.calls[1]?.[0]?.idempotencyKey).not.toBe(firstKey)
    expect(begin.mock.calls[1]?.[0]?.amount.units).toBe('5000000')
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
    render(<AeAccountFundingPanel port={port} />)

    fireEvent.change(screen.getByLabelText(/account funding amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /continue to stripe/i }))

    expect(await screen.findByText(/do not retry with a new payment/i)).toBeTruthy()
    const raw = window.sessionStorage.getItem('ae.account-funding.recovery.v1')
    const locator = raw === null ? undefined : JSON.parse(raw) as { commandRef: string; idempotencyKey: string }
    expect(locator).toMatchObject({ commandRef: 'sha256:topup-command-unknown' })
    expect(locator?.idempotencyKey).toBe(begin.mock.calls[0]?.[0]?.idempotencyKey)
    expect(screen.queryByRole('button', { name: /continue to stripe/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add more credit' })).toBeNull()

    cleanup()
    render(<AeAccountFundingPanel port={port} />)
    await waitFor(() => expect(read).toHaveBeenCalledWith(locator))
  })

  it('keeps unavailable top-up from starting payment or changing credit', async () => {
    const begin = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    const read = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    render(
      <AeAccountFundingPanel port={{ begin, read }} />
    )
    fireEvent.change(screen.getByLabelText(/account funding amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /continue to stripe/i }))

    expect(begin).toHaveBeenCalledOnce()
    expect(await screen.findByText(/account funding is unavailable/i)).toBeTruthy()
    expect(screen.getByText(/no payment started.*balance did not change/i)).toBeTruthy()
    expect(screen.queryByText(/payment succeeded|credit added/i)).toBeNull()
  })

  it('renders Agent usage without presenting a per-credential balance', () => {
    render(
      <AeAgentOperatorConsole
        directory={keyDirectory}
        loading={false}
        onRevokeCredential={() => undefined}
        onDisconnectAgent={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Credit' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Credit' })).toBeTruthy()
    expect(screen.queryByText('Rotate, replace, or recover a key')).toBeNull()
    expect(screen.queryByText('Provider reauthorization required')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View UI assistant' }))
    expect(screen.queryByText(/USD 12\.5/u)).toBeNull()
    expect(screen.getByText(/AUD 5\.005/u)).toBeTruthy()
    expect(screen.queryByText('Balance')).toBeNull()
    expect(screen.getAllByText('Browse only').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sandbox').length).toBeGreaterThan(0)
    expect(screen.getByText('30/min · 300/hour')).toBeTruthy()
    expect(screen.getByText('USD 25.00')).toBeTruthy()
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
        onRevokeCredential={() => undefined}
        onDisconnectAgent={() => undefined}
        approvals={[]}
        approvalsLoading={false}
        onRetryApprovals={() => undefined}
        onDecideApproval={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'View UI assistant' }))
    expect(screen.getByText('Calls this month').nextElementSibling?.textContent).toBe('0')
    expect(screen.getAllByText('AUD 0.000000').length).toBeGreaterThan(0)
    expect(screen.getByText('No usage yet')).toBeTruthy()
    expect(screen.queryByText('Usage details are temporarily unavailable')).toBeNull()
  })

  it('shows failed owner activity as unavailable instead of a known empty period', () => {
    const unavailablePeriodDirectory = projectAgentDirectory(
      [keyReadback],
      [canonicalAgentRecord([keyReadback])],
      [],
      [{
        principalRef: keyReadback.principalId,
        activity: [],
        activityIsDone: true,
        dataState: 'unavailable' as const,
      }],
    )
    const onCreditRefresh = vi.fn()
    render(
      <AeOwnerCredit
        directory={unavailablePeriodDirectory}
        accountBalance={accountBalance}
        loading={false}
        onCreditRefresh={onCreditRefresh}
      />,
    )
    expect(screen.getByText('Some Agent activity or usage is unavailable. Coverage is incomplete.')).toBeTruthy()
    expect(screen.getByText('Activity unavailable')).toBeTruthy()
    expect(screen.getByText('Activity could not be read right now. Refresh to try again.')).toBeTruthy()
    expect(screen.queryByText('No activity yet')).toBeNull()
    expect(screen.queryByText('Browsing does not create a Call.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh activity' }))
    expect(onCreditRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows only safe approval facts and guards concurrent decisions', () => {
    const onDecideApproval = vi.fn()
    render(
      <AeAgentOperatorConsole
        directory={emptyDirectory}
        loading={false}
        onRevokeCredential={() => undefined}
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
    expect(screen.getByRole('link', { name: 'market.email.send:v1' }).getAttribute('href')).toBe('/tools/market.email.send%3Av1')
    expect(screen.getByText('Sends a communication')).toBeTruthy()
    expect(screen.getByText('USD 1.25')).toBeTruthy()
    expect(screen.getByText('recipient.email, message.subject')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('market.email.send:v1 approved once.')
    const approveButton = screen.getByRole('button', { name: 'Approving once…' })
    const declineButton = screen.getByRole('button', { name: 'Decline' })
    expect(approveButton.hasAttribute('disabled')).toBe(true)
    expect(declineButton.hasAttribute('disabled')).toBe(true)
    fireEvent.click(declineButton)
    expect(onDecideApproval).not.toHaveBeenCalled()
    expect(screen.queryByText(/call:approval:one|credential|transport|input/iu)).toBeNull()
  })
})
