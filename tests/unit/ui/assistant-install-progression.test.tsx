// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeAgentApprovalsSection } from '@/components/ae/console/AeAgentApprovalsSection'

afterEach(cleanup)

function renderWithRouter(ui: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/agent-access'] }),
  })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}

describe('Agent connection progression', () => {
  it('presents app selection, setup and authoritative confirmation in order', () => {
    const checkConnection = vi.fn()
    renderWithRouter(
      <AeAssistantInstallFunnel
        canonicalBaseUrl="https://ae.example/"
        onCheckConnection={checkConnection}
      />,
    )

    const progression = screen.getByRole('navigation', { name: 'Agent connection steps' })
    expect(within(progression).getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringContaining('Choose your Agent app'),
      expect.stringContaining('Connect and approve access'),
    ])
    expect(within(progression).getByRole('status').textContent).toContain('Step 1 of 2')
    const appStep = screen.getByRole('group', { name: 'Choose your Agent app' })
    fireEvent.click(within(appStep).getByRole('button', { name: 'Codex' }))

    const connectStep = screen.getByRole('group', { name: 'Connect and approve access' })
    expect(within(progression).getByRole('status').textContent).toContain('Step 2 of 2')
    expect(within(connectStep).getByRole('region', { name: 'Codex MCP command' }).textContent).toContain('https://ae.example/mcp')
    expect(within(connectStep).queryByRole('region', { name: 'Claude Code MCP command' })).toBeNull()
    expect(within(connectStep).queryByRole('region', { name: 'Cursor MCP command' })).toBeNull()
    expect(screen.getByText(/Your Account balance never grants permission to spend/u)).toBeTruthy()
    expect(screen.getByText(/Only a delivered Tool result and receipt completes first use/u)).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Open Agents' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review Spending policy' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Check approved access' }))
    expect(checkConnection).toHaveBeenCalledOnce()
    expect(within(progression).getByRole('status').textContent).toContain('Step 2 of 2')
    expect(screen.queryByText('Connection complete')).toBeNull()
  })

  it('makes an in-progress confirmation explicit and non-repeatable', () => {
    renderWithRouter(
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
    const checkConnection = vi.fn()
    renderWithRouter(
      <AeAssistantInstallFunnel
        canonicalBaseUrl="https://ae.example/"
        resumeToolRef={`operation:v1:${'a'.repeat(64)}`}
        onCheckConnection={checkConnection}
      />,
    )

    expect(screen.getByText('Selected Tool saved for this setup')).toBeTruthy()
    expect(screen.getByText(/Keep its input in your Agent’s task/u)).toBeTruthy()
    expect(screen.getByText(/setup creates no Call/u)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Connect an app or script with a manual key' }).getAttribute('href'))
      .toBe(`/owner/settings/agent-keys?issue=manual&resumeTool=${encodeURIComponent(`operation:v1:${'a'.repeat(64)}`)}`)
    expect(checkConnection).not.toHaveBeenCalled()
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
