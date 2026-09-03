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
import type { AccountFundingBeginInput, AccountFundingBalance } from '@/modules/money/server'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...props }: { to: string; params?: Record<string, string>; children: ReactNode }) => (
    <a href={params?.operationRef === undefined ? to : to.replace('$operationRef', encodeURIComponent(params.operationRef))} {...props}>{children}</a>
  ),
}))

const keyReadback: AgentCredentialSource = {
  key: {
    keyId: 'key_ui_1',
    name: 'UI assistant',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    scopes: ['market_operations:invoke', 'customer_requests:inspect_only'],
    revoked: false,
    expired: false,
  },
  grant: {
    principalId: `prn_${'1'.repeat(32)}`,
    credentialId: 'key_ui_1',
    applicationRef: 'agentic-economy',
    environment: 'sandbox',
    authorityMode: 'inspect_only',
    operationAccess: 'all_admitted',
    operationRefs: [],
    lifecycle: 'active',
    expiresAt: 604_800_000,
    budget: {
      maximumSpendPerInvocation: { currency: 'USD', units: '500', exponent: 2 },
      maximumDailySpend: { currency: 'USD', units: '2500', exponent: 2 },
      maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
      maximumConcurrentInvocations: 2,
    },
    rate: { maximumCallsPerMinute: 30, maximumCallsPerHour: 300 },
  },
  principalId: 'clerk_api_key:key_ui_1',
  account: {
    principalId: 'clerk_api_key:key_ui_1',
    accountId: 'owner:key_ui_1',
    balance: { currency: 'USD', units: '1250', exponent: 2 },
    autoRecharge: {
      enabled: false,
      threshold: { currency: 'USD', units: '0', exponent: 2 },
      rechargeAmount: { currency: 'USD', units: '0', exponent: 2 },
    },
    evidence: 'labelled_local_dev',
  },
  activity: [],
  usage: {
    credentialId: 'key_ui_1',
    callCount: 2,
    paidCallCount: 1,
    freeCallCount: 1,
    grossSpend: { currency: 'USD', units: '5005', exponent: 3 },
    states: ['paid', 'free_tier'],
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
  it('uses the shared funding continuation after an insufficient-credit call', () => {
    const source = {
        ...keyReadback,
        activity: [{
          activityRef: 'activity:insufficient',
          credentialId: 'key_ui_1',
          serviceRef: 'service:weather',
          offeringRef: 'offering:weather',
          businessId: 'business:weather',
          operationKey: 'weather.lookup',
          invocationRef: 'invocation:insufficient',
          attemptRef: 'attempt:insufficient',
          grossAmount: { currency: 'USD', units: '500', exponent: 2 },
          chargeState: 'insufficient_credit',
          priceDigest: `sha256:${'a'.repeat(64)}`,
          observedAt: 2,
        }],
      } as const
    render(<AeOwnerCredit
      directory={projectAgentDirectory([source], [canonicalAgentRecord([source])])}
      accountBalance={accountBalance}
      loading={false}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'View Call declined for insufficient credit' }))
    const continuation = screen.getByRole('link', { name: 'Add credit' })
    expect(continuation.getAttribute('href')).toBe('/owner/credit#fund')
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
  it('shows the one-command activation and call path', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example/" />)

    expect(screen.getByRole('heading', { name: 'Install once. Verify both entry points.' })).toBeTruthy()
    expect(screen.getByText(/npm install --global "https:\/\/ae\.example\/downloads\/agentic-economy-cli-0\.1\.0\.tgz"/u)).toBeTruthy()
    expect(screen.getByText(/ae --version/u)).toBeTruthy()
    expect(screen.getByText(/ae search "weather forecast"/u)).toBeTruthy()
    expect(screen.getByText(/add-mcp@2\.3\.0 "https:\/\/ae\.example\/mcp"/u)).toBeTruthy()
    expect(screen.getByText(/ae doctor --base-url "https:\/\/ae\.example" --json/u)).toBeTruthy()
    expect(screen.getByText(/ae inspect "\$AE_OPERATION_REF"/u)).toBeTruthy()
    expect(screen.getByText(/ae call "\$AE_OPERATION_REF" --input "\$AE_INPUT_JSON"/u)).toBeTruthy()
    expect(screen.getByText(/returns the exact connection or authority step/iu)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Create agent access key' })).toBeNull()
    expect(screen.queryByText(/AE_API_KEY=/u)).toBeNull()

    const copyButton = screen.getByRole('button', { name: 'Copy Call command' })
    fireEvent.click(copyButton)

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('--input "$AE_INPUT_JSON"'))
    const status = await screen.findByText('Call command copied.')
    expect(status.getAttribute('role')).toBe('status')
  })

  it('copies setup without exposing or asking users to manage the key', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://AE.Example:443/" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy Install and verify command' }))
    expect(writeText).toHaveBeenCalledWith('npm install --global "https://AE.Example:443/downloads/agentic-economy-cli-0.1.0.tgz"\nae --version')
    expect(screen.queryByText(/ae_secret/u)).toBeNull()
    expect(screen.queryByRole('link', { name: /agent-access\.json/u })).toBeNull()
  })

  it('starts a bound hosted Checkout Session and redirects without persisting payment material', async () => {
    const session: CreditPaymentSession = {
      evidence: {
        provider: 'stripe',
        externalRef: 'cs_test_bound',
        amount: { currency: 'AUD', units: '1055', exponent: 2 },
        status: 'pending',
        requestDigest: 'digest:request',
        metadataDigest: 'digest:metadata',
        checkoutSessionDigest: 'digest:checkout-session',
        evidenceDigest: 'digest:evidence',
        evidenceRef: 'stripe:checkout:cs_test_bound',
        observedAt: 1,
      },
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_bound',
    }
    const begin = vi.fn(async (_input: AccountFundingBeginInput) => ({ kind: 'ok' as const, commandRef: 'funding:one', session }))
    const read = vi.fn(async () => ({
      ...session,
      evidence: { ...session.evidence, status: 'pending' as const },
    }))
    const port: AccountFundingPort = { begin, read }
    const onRefresh = vi.fn()
    const redirectToCheckout = vi.fn()
    render(
      <AeAccountFundingPanel
        port={port}
        onRefresh={onRefresh}
        redirectToCheckout={redirectToCheckout}
      />
    )

    fireEvent.change(screen.getByLabelText(/account funding amount/i), { target: { value: '10.00' } })
    const quote = screen.getByLabelText('Funding quote')
    expect(quote.textContent).toContain('Account principalAUD 10.00')
    expect(quote.textContent).toContain('Service feeAUD 0.50')
    expect(quote.textContent).toContain('Tax on service feeAUD 0.05')
    expect(quote.textContent).toContain('Total paymentAUD 10.55')
    fireEvent.click(screen.getByRole('button', { name: /continue to stripe checkout/i }))

    await waitFor(() => expect(redirectToCheckout).toHaveBeenCalledWith(session.checkoutUrl))
    expect(begin).toHaveBeenCalledWith({
      amount: { currency: 'AUD', units: '10000000', exponent: 6 },
      idempotencyKey: expect.any(String),
    })
    expect(begin.mock.calls[0]?.[0]).not.toHaveProperty('accountRef')
    expect(window.sessionStorage.getItem('ae.account-funding.recovery.v1')).not.toContain('checkout.stripe.com')
    expect(read).not.toHaveBeenCalled()
    expect(screen.queryByText('Payment verified')).toBeNull()
    expect(screen.getByText(/still being verified|canonical server readback/i)).toBeTruthy()
    expect(onRefresh).not.toHaveBeenCalled()
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
    fireEvent.click(screen.getByRole('button', { name: /continue to stripe checkout/i }))

    expect(await screen.findByText(/do not retry with a new payment/i)).toBeTruthy()
    const raw = window.sessionStorage.getItem('ae.account-funding.recovery.v1')
    const locator = raw === null ? undefined : JSON.parse(raw) as { commandRef: string; idempotencyKey: string }
    expect(locator).toMatchObject({ commandRef: 'sha256:topup-command-unknown' })
    expect(locator?.idempotencyKey).toBe(begin.mock.calls[0]?.[0]?.idempotencyKey)
    expect(screen.queryByRole('button', { name: /fund account/i })).toBeNull()

    cleanup()
    render(<AeAccountFundingPanel port={port} />)
    await waitFor(() => expect(read).toHaveBeenCalledWith(locator))
  })

  it('keeps unavailable top-up from starting payment or changing credit', async () => {
    const begin = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    const read = vi.fn(async () => ({ kind: 'refused' as const, code: 'stripe_setup_required' as const, retryable: false }))
    render(
      <AeAccountFundingPanel
        port={{ begin, read }}
      />
    )
    fireEvent.change(screen.getByLabelText(/account funding amount/i), { target: { value: '10.00' } })
    fireEvent.click(screen.getByRole('button', { name: /continue to stripe checkout/i }))

    expect(begin).toHaveBeenCalledOnce()
    expect(await screen.findByText(/account funding is unavailable/i)).toBeTruthy()
    expect(screen.getByText(/no payment started.*balance did not change/i)).toBeTruthy()
    expect(screen.queryByText(/payment succeeded|credit added/i)).toBeNull()
  })

  it('renders per-assistant balance, spend, and permission without internal identifiers', () => {
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
    expect(screen.getByRole('list')).toBeTruthy()
    expect(screen.getByText('Rotate, replace, or recover a key')).toBeTruthy()
    expect(screen.getByText('Provider reauthorization required')).toBeTruthy()
    expect(screen.getByText('Outcome uncertain')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View UI assistant' }))
    expect(screen.getAllByText(/USD 12\.5/u).length).toBeGreaterThan(0)
    expect(screen.getByText(/USD 5\.005/u)).toBeTruthy()
    expect(screen.getByText('Browse only')).toBeTruthy()
    expect(screen.getAllByText('Development').length).toBeGreaterThan(0)
    expect(screen.getByText('30/min · 300/hour')).toBeTruthy()
    expect(screen.getByText('USD 25.00')).toBeTruthy()
    expect(screen.queryByText(/scope:|data:|principal|clerk_api_key/u)).toBeNull()
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
          invocationRef: 'invocation:approval:one',
          operationRef: 'market.email.send:v1',
          authorityRequest: {
            kind: 'approve_each',
            operationRef: 'market.email.send:v1',
            consequence: 'communication',
            retryClass: 'reconcile_before_retry',
            maximumSpend: { currency: 'USD', units: '125', exponent: 2 },
            dataFields: ['recipient.email', 'message.subject'],
          },
          createdAt: 1,
        }]}
        approvalsLoading={false}
        approvalDecision={{ invocationRef: 'invocation:approval:one', decision: 'approve' }}
        approvalStatus="market.email.send:v1 approved once."
        onRetryApprovals={() => undefined}
        onDecideApproval={onDecideApproval}
        accessUnavailable
      />,
    )

    expect(screen.getByRole('heading', { name: 'Waiting for approval' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'market.email.send:v1' }).getAttribute('href')).toBe('/operations/market.email.send%3Av1')
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
    expect(screen.queryByText(/invocation:approval:one|credential|transport|input/iu)).toBeNull()
  })
})
