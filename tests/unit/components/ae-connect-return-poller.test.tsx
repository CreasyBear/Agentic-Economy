/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

import { AeConnectReturnPoller } from '@/components/ae/supply/AeConnectReturnPoller'
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
          version: details.version,
        },
        payout: {
          businessId,
          accountState,
          providerNet: audExact,
          minimumPayout: audExact,
          evidence: 'source',
        },
      },
    ],
  }
}

describe('AeConnectReturnPoller (W-31)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
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

  it('T1: displays verifying banner while Connect account state is submitted/onboarding_started', () => {
    render(
      <AeConnectReturnPoller
        initialReadiness={pendingReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(pendingReadiness)}
      />,
    )

    expect(screen.getByText(/we are confirming your bank account details/i)).toBeInTheDocument()
  })

  it('T2: polls periodically and transitions to Payouts Active when account reaches ready state', async () => {
    const pollMock = vi.fn()
      .mockResolvedValueOnce(pendingReadiness)
      .mockResolvedValueOnce(readyReadiness)

    render(
      <AeConnectReturnPoller
        initialReadiness={pendingReadiness}
        onPollReadiness={pollMock}
        pollIntervalMs={100}
      />,
    )

    expect(screen.getByText(/we are confirming your bank account details/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText(/your bank account is connected/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: /add your first tool/i })).toHaveAttribute(
      'href',
      '/owner/operations/new',
    )
  })

  it('T3: shows attention state if account state becomes restricted', async () => {
    const restrictedReadiness = connectReadiness('restricted', {
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      version: 2,
    })

    render(
      <AeConnectReturnPoller
        initialReadiness={restrictedReadiness}
        onPollReadiness={vi.fn().mockResolvedValue(restrictedReadiness)}
      />,
    )

    expect(screen.getByText(/action required by stripe/i)).toBeInTheDocument()
  })
})
