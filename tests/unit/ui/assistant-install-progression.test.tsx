// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeAgentApprovalsSection } from '@/components/ae/console/AeAgentApprovalsSection'

afterEach(cleanup)

describe('Agent connection progression', () => {
  it('presents one ordered connect, sign-in and authoritative confirmation path', () => {
    const checkConnection = vi.fn()
    render(
      <AeAssistantInstallFunnel
        canonicalBaseUrl="https://ae.example/"
        onCheckConnection={checkConnection}
      />,
    )

    const progression = screen.getByRole('list', { name: 'Agent connection steps' })
    expect(within(progression).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('Start the connection'),
      expect.stringContaining('Approve access in the browser'),
      expect.stringContaining('Confirm the connection'),
    ])
    expect(screen.getByText(/Connection is complete only when it appears in Agents/u)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open Agents' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review Spending policy' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    expect(checkConnection).toHaveBeenCalledOnce()
  })

  it('makes an in-progress confirmation explicit and non-repeatable', () => {
    render(
      <AeAssistantInstallFunnel
        canonicalBaseUrl="https://ae.example/"
        checkingConnection
        onCheckConnection={() => undefined}
      />,
    )

    const action = screen.getByRole('button', { name: 'Checking connection…' })
    expect(action.hasAttribute('disabled')).toBe(true)
  })

  it('keeps selected Tool context visible without claiming setup creates a Call', () => {
    render(
      <AeAssistantInstallFunnel
        canonicalBaseUrl="https://ae.example/"
        resumeToolRef={`operation:v1:${'a'.repeat(64)}`}
      />,
    )

    expect(screen.getByText('Selected Tool saved for this setup')).toBeTruthy()
    expect(screen.getByText(/one return action to that Tool/u)).toBeTruthy()
    expect(screen.getByText(/No Call is created during setup/u)).toBeTruthy()
  })
})

describe('scoped Agent read failures', () => {
  it('announces the initial approvals load without inventing decisions, then clears when empty', () => {
    const onDecide = vi.fn()
    const view = render(<AeAgentApprovalsSection approvals={[]} loading onRetry={() => undefined} onDecide={onDecide} />)

    expect(screen.getByRole('status', { name: 'Loading waiting approvals' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    view.rerender(<AeAgentApprovalsSection approvals={[]} loading={false} onRetry={() => undefined} onDecide={onDecide} />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Waiting for approval' })).toBeNull()
    expect(onDecide).not.toHaveBeenCalled()
  })

  it('keeps an unavailable approvals read neutral and exactly retryable', () => {
    const onRetry = vi.fn()
    render(<AeAgentApprovalsSection
      approvals={[]}
      loading={false}
      error="Waiting approvals are temporarily unavailable."
      onRetry={onRetry}
      onDecide={() => undefined}
    />)

    const alert = screen.getByRole('alert')
    expect(alert.className).not.toContain('text-destructive')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh approvals' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
