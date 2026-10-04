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

describe('HomeOnboardingRequestSection', () => {
  it('shows the exact pending request and review destination, preserving the opaque state', () => {
    renderSection({ onboarding: request('pending') })

    const { progress, statuses } = progressStatuses()
    expect(statuses).toEqual(['current', 'upcoming', 'upcoming'])
    expect(progress).toHaveAttribute('aria-label', 'Access request progress')
    expect(within(progress).getAllByRole('listitem')[0]?.querySelector('[aria-current="step"]')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Codex · Production')
    fireEvent.click(screen.getByText('Request 12345678'))
    expect(screen.getByText(grantRef)).toBeInTheDocument()

    const review = screen.getByRole('link', { name: 'Review access request' })
    expect(review).toHaveAttribute('href', '/agent-access/authorize')
    expect(JSON.parse(review.getAttribute('data-search') ?? '{}')).toEqual({ grant_ref: grantRef, state: 'opaque-callback-state' })
  })

  it.each([
    ['pending', ['current', 'upcoming', 'upcoming'], 0],
    ['issuing', ['complete', 'current', 'upcoming'], 1],
    ['approved', ['complete', 'complete', 'current'], 2],
    ['exchanging', ['complete', 'complete', 'current'], 2],
    ['exchanged', ['complete', 'complete', 'complete'], -1],
  ] as const)('maps %s to explicit Arc Stepper statuses', (phase, expected, currentIndex) => {
    renderSection({ onboarding: request(phase) })

    const { progress, statuses } = progressStatuses()
    expect(statuses).toEqual(expected)
    if (currentIndex >= 0) {
      expect(within(progress).getAllByRole('listitem')[currentIndex]).toHaveAttribute('data-status', 'current')
      expect(within(progress).getAllByRole('listitem')[currentIndex]?.querySelector('[aria-current="step"]')).toBeInTheDocument()
    }
  })

  it('records the exchange without claiming that the Agent authenticated, made a Call, or received a delivery', () => {
    renderSection({ onboarding: request('exchanged') })

    const { progress, statuses } = progressStatuses()
    expect(statuses).toEqual(['complete', 'complete', 'complete'])
    expect(progress).toHaveTextContent('Access exchange recorded')
    expect(screen.getByRole('heading', { name: 'Access returned to your Agent' })).toBeInTheDocument()
    expect(screen.getByText(/Authenticated requests, Calls and delivery are observed separately below\./)).toBeInTheDocument()
    expect(progress).not.toHaveTextContent(/connected|delivered/i)
  })

  it.each([
    ['denied', 'Request declined'],
    ['expired', 'Request expired'],
  ] as const)('shows %s as an error and removes the review action', (phase, message) => {
    renderSection({ onboarding: request(phase) })

    const { progress, statuses } = progressStatuses()
    expect(statuses).toEqual(['error', 'upcoming', 'upcoming'])
    expect(within(within(progress).getAllByRole('listitem')[0]!).getByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Review access request' })).not.toBeInTheDocument()
  })

  it.each([
    ['no request', undefined, validSearch],
    ['refused request', { kind: 'refused', reason: 'not_found' }, validSearch],
    ['unavailable request', { kind: 'unavailable' }, validSearch],
    ['invalid search', request('pending'), { ...validSearch, requestInvalid: true }],
  ] as const)('omits progress for %s', (_label, onboarding, search) => {
    renderSection({ onboarding, search })

    expect(screen.queryByRole('group', { name: 'Access request progress' })).not.toBeInTheDocument()
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
