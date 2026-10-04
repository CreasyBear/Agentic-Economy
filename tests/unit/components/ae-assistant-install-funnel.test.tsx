/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import type { NativeMcpClientId } from '@/lib/cli-distribution'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: { to: string; search?: Record<string, string>; children: ReactNode }) =>
    <a href={`${to}${search === undefined || Object.keys(search).length === 0 ? '' : `?${new URLSearchParams(search)}`}`} {...props}>{children}</a>,
}))
afterEach(cleanup)
describe('one Agent connection path', () => {
  it.each([
    { rawChoice: 'Codex' }, { rawChoice: ' codex ' }, { rawChoice: 'private-token-canary' },
    { rawChoice: ['codex'] }, { rawChoice: { app: 'cursor' } },
  ])('returns raw invalid route choice $rawChoice to the chooser without echoing it', ({ rawChoice }) => {
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" setupApp={rawChoice as NativeMcpClientId} onSetupAppChange={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Choose your Agent app' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy setup commands' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Completed steps' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue after approval' }).getAttribute('href')).toBe('/agent-access')
    expect(document.body).not.toHaveTextContent('private-token-canary')
  })

  it.each<readonly [NativeMcpClientId, string]>([
    ['codex', 'Codex'],
    ['claude-code', 'Claude Code'],
    ['cursor', 'Cursor'],
  ])('restores the validated %s choice on fresh mount without claiming access or moving focus', (setupApp, displayName) => {
    const onSetupAppChange = vi.fn()
    const check = vi.fn()
    const props = { canonicalBaseUrl: 'https://ae.example', setupApp, onSetupAppChange, onCheckConnection: check }
    const first = render(<AeAssistantInstallFunnel {...props} />)
    expect(screen.getAllByRole('region', { name: `${displayName} MCP command` })).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Choose your Agent app' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Completed steps' })).toHaveTextContent(displayName)
    expect(screen.getByText('Connect and approve access', { selector: 'legend' })).not.toHaveFocus()
    first.unmount()
    render(<AeAssistantInstallFunnel {...props} />)
    expect(screen.getAllByRole('region', { name: `${displayName} MCP command` })).toHaveLength(1)
    expect(screen.getByText('Connect and approve access', { selector: 'legend' })).not.toHaveFocus()
    expect(screen.queryByText('Connection complete')).not.toBeInTheDocument()
    expect(onSetupAppChange).not.toHaveBeenCalled()
    expect(check).not.toHaveBeenCalled()
  })

  it('waits for committed route choice before changing the step or focusing its legend', async () => {
    const onSetupAppChange = vi.fn()
    const view = render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" onSetupAppChange={onSetupAppChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    expect(onSetupAppChange).toHaveBeenLastCalledWith('codex')
    expect(screen.getByRole('group', { name: 'Choose your Agent app' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Codex MCP command' })).not.toBeInTheDocument()
    view.rerender(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" setupApp="codex" onSetupAppChange={onSetupAppChange} />)
    await waitFor(() => expect(screen.getByText('Connect and approve access', { selector: 'legend' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    expect(onSetupAppChange).toHaveBeenLastCalledWith(undefined)
    expect(screen.getByRole('region', { name: 'Codex MCP command' })).toBeInTheDocument()
    view.rerender(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" onSetupAppChange={onSetupAppChange} />)
    await waitFor(() => expect(screen.getByText('Choose your Agent app', { selector: 'legend' })).toHaveFocus())
    expect(screen.queryByRole('region', { name: 'Codex MCP command' })).not.toBeInTheDocument()
    expect(onSetupAppChange).toHaveBeenCalledTimes(2)
  })

  it('carries the chosen app and selected Tool into Agents without an approval claim', () => {
    const resumeToolRef = `operation:v1:${'b'.repeat(64)}`
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" setupApp="cursor" onSetupAppChange={vi.fn()} resumeToolRef={resumeToolRef} />)
    const continuation = new URL(screen.getByRole('link', { name: 'Continue after approval' }).getAttribute('href') ?? '', 'https://ae.example')
    expect(continuation.pathname).toBe('/agent-access')
    expect(Object.fromEntries(continuation.searchParams)).toEqual({ resumeTool: resumeToolRef, setupApp: 'cursor' })
    expect(screen.queryByText('Connection complete')).not.toBeInTheDocument()
  })

  it.each([
    ['Codex', 'codex mcp login agentic-economy'],
    ['Claude Code', 'claude mcp add --transport http --scope user'],
    ['Cursor', 'cursor --add-mcp'],
  ])('shows only the selected %s recipe and copies the real command', async (client, command) => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const check = vi.fn()
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" onCheckConnection={check} />)
    expect(screen.queryByRole('button', { name: 'Copy setup commands' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: client }))
    expect(screen.getByRole('list', { name: 'Completed steps' })).toHaveTextContent(client)
    await waitFor(() => expect(screen.getByText('Connect and approve access', { selector: 'legend' })).toHaveFocus())
    expect(screen.getAllByRole('region', { name: `${client} MCP command` })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup commands' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0]?.[0]).toContain(command)
    expect(writeText.mock.calls[0]?.[0]).toContain('https://ae.example/mcp')
    fireEvent.click(screen.getByRole('button', { name: 'Check approved access' }))
    expect(check).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Connection complete')).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Agent connection steps' })).toHaveTextContent('Step 2 of 2')
  })
  it('changes the chosen app without completing approval or authentication', async () => {
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" />)
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    await waitFor(() => expect(screen.getByText('Choose your Agent app', { selector: 'legend' })).toHaveFocus())
    expect(screen.queryByRole('region', { name: 'Codex MCP command' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }))
    expect(screen.getByRole('region', { name: 'Cursor MCP command' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Codex MCP command' })).not.toBeInTheDocument()
    expect(screen.queryByText('Connection complete')).not.toBeInTheDocument()
  })
  it('retains the setup instructions while the existing access check is pending', () => {
    const check = vi.fn()
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" checkingConnection onCheckConnection={check} />)
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    expect(screen.getByRole('region', { name: 'Codex MCP command' })).toBeInTheDocument()
    const button = screen.getByRole('button', { name: 'Checking connection…' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(check).not.toHaveBeenCalled()
  })
  it.each([
    ['without a selected Tool', undefined, '/owner/settings/agent-keys?issue=manual'],
    [
      'with a selected Tool',
      `operation:v1:${'a'.repeat(64)}`,
      `/owner/settings/agent-keys?issue=manual&resumeTool=${encodeURIComponent(`operation:v1:${'a'.repeat(64)}`)}`,
    ],
  ])('offers custom client setup directly from the app step %s', async (_label, resumeToolRef, expectedHref) => {
    render(<AeAssistantInstallFunnel
      canonicalBaseUrl="https://ae.example"
      {...(resumeToolRef === undefined ? {} : { resumeToolRef })}
    />)

    const customClientLink = screen.getByRole('link', { name: 'Connect another app or script' })
    await waitFor(() => expect(customClientLink).toBeVisible())
    expect(customClientLink.getAttribute('href')).toBe(expectedHref)
    expect(screen.queryByRole('link', { name: 'Issue a manual key' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    expect(screen.queryByRole('link', { name: 'Connect another app or script' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Connecting a custom script or another app?' }))
    expect(screen.getByRole('link', { name: 'Issue a manual key' }).getAttribute('href')).toBe(expectedHref)
  })
  it('preserves the exact selected Tool through manual setup without private task input', async () => {
    const resumeTool = `operation:v1:${'a'.repeat(64)}`
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" resumeToolRef={resumeTool} />)
    fireEvent.click(screen.getByRole('button', { name: 'Connecting a custom script or another app?' }))
    const manual = await screen.findByRole('link', { name: 'Issue a manual key' })
    expect(manual.getAttribute('href')).toBe(`/owner/settings/agent-keys?issue=manual&resumeTool=${encodeURIComponent(resumeTool)}`)
    expect(screen.getByRole('link', { name: 'Continue after approval' }).getAttribute('href')).toBe(`/agent-access?resumeTool=${encodeURIComponent(resumeTool)}`)
  })
})
