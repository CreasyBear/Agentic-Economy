/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import type { AgentOnboardingRequest } from '@/modules/agent-access/public'
import type { AgentAccessSearch } from '@/modules/agent-access/agent-lifecycle.view-model'
import { HomeOnboardingRequestSection } from '@/components/ae/agent-access/home/components/HomeOnboardingRequestSection'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, className }: { to: string; search?: Record<string, string>; children: ReactNode; className?: string }) =>
    <a href={to} data-search={JSON.stringify(search)} className={className}>{children}</a>,
}))

afterEach(cleanup)

const grantRef = 'grant_exact_request_12345678'
const validSearch: AgentAccessSearch = { grantRef, state: 'opaque-callback-state' }

function request(phase: Extract<AgentOnboardingRequest, { kind: 'request' }>['phase']): AgentOnboardingRequest {
  return {
    kind: 'request',
    grantRef,
    revision: 4,
    clientName: 'Codex',
    flow: 'authorization_code',
    environment: 'production',
    phase,
    createdAt: 1,
    expiresAt: 2,
  }
}

function renderSection({
  onboarding,
  search = validSearch,
  onCheck = vi.fn(),
  checking = false,
}: {
  onboarding?: AgentOnboardingRequest | undefined
  search?: AgentAccessSearch
  onCheck?: () => void
  checking?: boolean
} = {}) {
  render(<HomeOnboardingRequestSection search={search} onCheck={onCheck} checking={checking}
    {...(onboarding === undefined ? {} : { request: onboarding })} />)
  return onCheck
}

function progressStatuses() {
  const progress = screen.getByRole('group', { name: 'Access request progress' })
  const statuses = within(progress).getAllByRole('listitem').map(item => item.getAttribute('data-status'))
  return { progress, statuses }
}

function expectRecordedRequestFacts(title: string, description: string) {
  expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  expect(screen.getByText(description)).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Codex · Production')
  fireEvent.click(screen.getByText('Request 12345678'))
  expect(screen.getByText(grantRef)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Check request status' })).toBeInTheDocument()
}

describe('HomeOnboardingRequestSection', () => {
  it.each([
    [
      'pending', ['current', 'upcoming', 'upcoming'], 0,
      'Your Agent is asking for access',
      'Review the requested access. Your approval stays separate from any permission to purchase a Tool.',
      true, undefined,
    ],
    [
      'issuing', ['complete', 'current', 'upcoming'], 1,
      'Preparing the approved access',
      'The request is in progress. Check its recorded status before submitting another approval or starting another request.',
      false, undefined,
    ],
    [
      'approved', ['complete', 'complete', 'current'], 2,
      'Access approved; waiting for your Agent',
      'Keep working in your Agent. This page follows this exact request and updates automatically.',
      false, undefined,
    ],
    [
      'exchanging', ['complete', 'complete', 'current'], 2,
      'Your Agent is collecting its access',
      'The request is in progress. Check its recorded status before submitting another approval or starting another request.',
      false, undefined,
    ],
    [
      'denied', ['error', 'upcoming', 'upcoming'], -1,
      'This access request was declined',
      'Continue in the same Agent task and request fresh access. If an Agent already exists, renew its access. Retain any existing Call reference; reconnecting does not retry a purchase.',
      false, 'Request declined',
    ],
    [
      'expired', ['error', 'upcoming', 'upcoming'], -1,
      'This access request expired',
      'Continue in the same Agent task and request fresh access. If an Agent already exists, renew its access. Retain any existing Call reference; reconnecting does not retry a purchase.',
      false, 'Request expired',
    ],
  ] as const)('preserves %s facts and recorded request behavior', (phase, expected, currentIndex, title, description, hasReview, error) => {
    renderSection({ onboarding: request(phase) })

    expectRecordedRequestFacts(title, description)
    const { progress, statuses } = progressStatuses()
    expect(statuses).toEqual(expected)
    if (currentIndex >= 0) {
      expect(within(progress).getAllByRole('listitem')[currentIndex]).toHaveAttribute('data-status', 'current')
      expect(within(progress).getAllByRole('listitem')[currentIndex]?.querySelector('[aria-current="step"]')).toBeInTheDocument()
    } else {
      expect(within(within(progress).getAllByRole('listitem')[0]!).getByText(error!)).toBeInTheDocument()
      expect(within(progress).getAllByRole('listitem')[0]?.querySelector('[aria-current="step"]')).toBeNull()
    }
    expect(progress).toHaveAttribute('aria-label', 'Access request progress')
    if (hasReview) {
      const review = screen.getByRole('link', { name: 'Review access request' })
      expect(review).toHaveAttribute('href', '/agent-access/authorize')
      expect(JSON.parse(review.getAttribute('data-search') ?? '{}')).toEqual({ grant_ref: grantRef, state: 'opaque-callback-state' })
    } else {
      expect(screen.queryByRole('link', { name: 'Review access request' })).not.toBeInTheDocument()
    }
  })

  it('records the exchange without claiming that the Agent authenticated, made a Call, or received a delivery', () => {
    const onCheck = vi.fn()
    renderSection({ onboarding: request('exchanged'), onCheck })

    expectRecordedRequestFacts('Access returned to your Agent', 'The access exchange is recorded. Authenticated requests, Calls and delivery are observed separately below.')
    expect(screen.queryByRole('group', { name: 'Access request progress' })).not.toBeInTheDocument()
    expect(screen.queryByText('Review access')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check request status' }))
    expect(onCheck).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no request', undefined, 'Keep working in your Agent. This page follows this exact request and updates automatically.'],
    ['unavailable request', { kind: 'unavailable' }, 'Keep working in your Agent. This page follows this exact request and updates automatically.'],
    ['refused request', { kind: 'refused', reason: 'not_found' }, 'This request is no longer available. Existing owned Calls can still be followed by their reference.'],
  ] as const)('preserves %s content without inventing request facts', (_label, onboarding, description) => {
    renderSection({ onboarding })

    expect(screen.getByRole('heading', { name: 'Checking this access request' })).toBeInTheDocument()
    expect(screen.getByText(description)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No other Agent is substituted for this request.')
    expect(screen.queryByRole('group', { name: 'Access request progress' })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Request /)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Review access request' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check request status' })).toBeInTheDocument()
  })

  it('preserves invalid-search content and the original review URL and callback state', () => {
    renderSection({ onboarding: request('pending'), search: { ...validSearch, requestInvalid: true } })

    expect(screen.getByRole('heading', { name: 'Your Agent is asking for access' })).toBeInTheDocument()
    expect(screen.getByText('The request link is incomplete. Open the exact verification link supplied by your Agent.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Codex · Production')
    expect(screen.queryByRole('group', { name: 'Access request progress' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Request 12345678'))
    expect(screen.getByText(grantRef)).toBeInTheDocument()
    const review = screen.getByRole('link', { name: 'Review access request' })
    expect(review).toHaveAttribute('href', '/agent-access/authorize')
    expect(JSON.parse(review.getAttribute('data-search') ?? '{}')).toEqual({ grant_ref: grantRef, state: 'opaque-callback-state' })
  })

  it('disables the existing status check while checking and calls its callback once otherwise', () => {
    const onCheck = vi.fn()
    renderSection({ onboarding: request('pending'), onCheck, checking: true })

    const disabledCheck = screen.getByRole('button', { name: 'Checking…' })
    expect(disabledCheck).toBeDisabled()
    fireEvent.click(disabledCheck)
    expect(onCheck).not.toHaveBeenCalled()

    cleanup()
    renderSection({ onboarding: request('pending'), onCheck })
    fireEvent.click(screen.getByRole('button', { name: 'Check request status' }))
    expect(onCheck).toHaveBeenCalledTimes(1)
  })
})
