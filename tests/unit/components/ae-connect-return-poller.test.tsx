/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('@/lib/ui/toast', () => ({
  toast: toastMock,
}))

import { AeConnectReturnPoller } from '@/components/ae/supply/AeConnectReturnPoller'
import {
  RESTRICTED_DIAGNOSTIC,
  SHELL,
  TACTILE,
  TIMEOUT_DIAGNOSTIC,
} from '@/components/ae/supply/connect-return-poller-copy'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'

const businessId = 'biz_1'
const audExact = { currency: 'AUD', units: '50000000', exponent: 6 }

function connectReadiness(
  accountState: 'submitted' | 'ready' | 'restricted',
  details: Readonly<{
    detailsSubmitted: boolean
    recipientCapabilityActive: boolean
    version: number
    stripeAccountId?: string
    payoutState?: 'held_kyc' | 'held_threshold' | 'review'
  }>,
): OwnerConnectReadinessReadback {
  const stripeAccountId = details.stripeAccountId ?? 'acct_test'
  return {
    kind: 'available',
    businessId,
    accountsTruncated: false,
    accounts: [
      {
        currency: 'AUD',
        account: {
          businessId,
          currency: 'AUD',
          exponent: 6,
          stripeAccountId,
          state: accountState,
          detailsSubmitted: details.detailsSubmitted,
          recipientCapabilityActive: details.recipientCapabilityActive,
          requirementsDigest: 'sha256:requirements',
          createdAt: 1,
          updatedAt: 2,
          version: details.version,
        },
        payout: {
          businessId,
          accountState,
          providerNet: audExact,
          minimumPayout: audExact,
          evidence: 'source',
          ...(details.payoutState === undefined ? {} : { payoutState: details.payoutState }),
        },
      },
    ],
  }
}

function shellFromContainer(container: HTMLElement): HTMLElement {
  return container.querySelector('.rounded-lg.border.bg-card') as HTMLElement
}

describe('AeConnectReturnPoller (W-33)', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  const pendingReadiness = connectReadiness('submitted', {
    detailsSubmitted: true,
    recipientCapabilityActive: false,
    version: 1,
  })

  const readyReadiness = connectReadiness('ready', {
    detailsSubmitted: true,
    recipientCapabilityActive: true,
    version: 2,
  })

  it('T1: displays verifying state with radar copy', () => {
    const { container } = render(
      <AeConnectReturnPoller
        initialReadiness={pendingReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(pendingReadiness)}
      />,
    )

    expect(screen.getByText(/verifying your payout setup with stripe/i)).toBeInTheDocument()
    expect(shellFromContainer(container)).toHaveClass(SHELL)
  })

  it('T2: polling transitions to ready, celebratory copy, link, and toast once', async () => {
    const pollMock = vi
      .fn()
      .mockResolvedValueOnce(pendingReadiness)
      .mockResolvedValueOnce(readyReadiness)

    render(
      <AeConnectReturnPoller
        initialReadiness={pendingReadiness}
        onPollReadiness={pollMock}
        pollIntervalMs={50}
      />,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/payouts enabled\. your tools are now ready to monetize/i),
      ).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /add your first tool/i })).toHaveAttribute(
      'href',
      '/owner/operations/new',
    )
    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledTimes(1)
    })
    expect(toastMock.success).toHaveBeenCalledWith('Payout setup verified', {
      description: 'Your bank account is ready to receive automated settlements.',
    })
  })

  it('T3: restricted displays Rule 4 labels, copy, and resume callback', () => {
    const onResumeVerification = vi.fn()
    const restrictedReadiness = connectReadiness('restricted', {
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      version: 2,
    })

    render(
      <AeConnectReturnPoller
        initialReadiness={restrictedReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(restrictedReadiness)}
        onResumeVerification={onResumeVerification}
      />,
    )

    expect(screen.getByText('What happened')).toBeInTheDocument()
    expect(screen.getByText('Financial impact')).toBeInTheDocument()
    expect(screen.getByText('Next step')).toBeInTheDocument()
    expect(screen.getByText(RESTRICTED_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
    expect(screen.getByText(RESTRICTED_DIAGNOSTIC.financialImpact)).toBeInTheDocument()
    expect(screen.getByText(RESTRICTED_DIAGNOSTIC.nextStep)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /resume stripe verification/i }))
    expect(onResumeVerification).toHaveBeenCalledTimes(1)
  })

  it('T4: timeout shows Rule 4 playbook and Check again returns to verifying', async () => {
    render(
      <AeConnectReturnPoller
        initialReadiness={pendingReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(pendingReadiness)}
        pollIntervalMs={20}
        maxPollTimeMs={1}
      />,
    )

    await waitFor(
      () => {
        expect(screen.getByText(TIMEOUT_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
      },
      { timeout: 3_000 },
    )
    expect(screen.getByText('What happened')).toBeInTheDocument()
    expect(screen.getByText(TIMEOUT_DIAGNOSTIC.nextStep)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /check again/i }))
    expect(screen.getByText(/verifying your payout setup with stripe/i)).toBeInTheDocument()
  })

  it('T5: container has min-h shell in verifying, ready, restricted, and timeout', async () => {
    const restrictedReadiness = connectReadiness('restricted', {
      detailsSubmitted: true,
      recipientCapabilityActive: false,
      version: 2,
    })

    const verifying = render(
      <AeConnectReturnPoller
        initialReadiness={pendingReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(pendingReadiness)}
      />,
    )
    expect(shellFromContainer(verifying.container)).toHaveClass(SHELL)
    verifying.unmount()

    const ready = render(
      <AeConnectReturnPoller
        initialReadiness={readyReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(readyReadiness)}
      />,
    )
    expect(shellFromContainer(ready.container)).toHaveClass(SHELL)
    ready.unmount()

    const restricted = render(
      <AeConnectReturnPoller
        initialReadiness={restrictedReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(restrictedReadiness)}
      />,
    )
    expect(shellFromContainer(restricted.container)).toHaveClass(SHELL)
    restricted.unmount()

    const timeoutView = render(
      <AeConnectReturnPoller
        initialReadiness={pendingReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(pendingReadiness)}
        pollIntervalMs={20}
        maxPollTimeMs={1}
      />,
    )
    await waitFor(
      () => {
        expect(screen.getByText(TIMEOUT_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
      },
      { timeout: 3_000 },
    )
    expect(shellFromContainer(timeoutView.container)).toHaveClass(SHELL)
  })

  it('T6: action buttons include TACTILE class', async () => {
    const restrictedReadiness = connectReadiness('restricted', {
      detailsSubmitted: true,
      recipientCapabilityActive: false,
      version: 2,
    })

    const ready = render(
      <AeConnectReturnPoller
        initialReadiness={readyReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(readyReadiness)}
      />,
    )
    expect(screen.getByRole('link', { name: /add your first tool/i }).className).toContain(
      'active:scale-[0.96]',
    )
    ready.unmount()

    render(
      <AeConnectReturnPoller
        initialReadiness={restrictedReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(restrictedReadiness)}
        onResumeVerification={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /update verification documents/i }).className).toContain(
      TACTILE.split(' ')[0],
    )
  })

  it('T7: detailsSubmitted false shows restricted playbook instead of verifying', () => {
    const kycIncomplete = connectReadiness('submitted', {
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      version: 1,
    })

    render(
      <AeConnectReturnPoller
        initialReadiness={kycIncomplete}
        onPollReadiness={vi.fn().mockResolvedValue(kycIncomplete)}
      />,
    )

    expect(screen.queryByText(/verifying your payout setup with stripe/i)).not.toBeInTheDocument()
    expect(screen.getByText(RESTRICTED_DIAGNOSTIC.whatHappened)).toBeInTheDocument()
  })

  it('T8: initial ready status triggers toast.success once', () => {
    render(
      <AeConnectReturnPoller
        initialReadiness={readyReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(readyReadiness)}
      />,
    )

    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(toastMock.success).toHaveBeenCalledWith('Payout setup verified', {
      description: 'Your bank account is ready to receive automated settlements.',
    })
  })
})
