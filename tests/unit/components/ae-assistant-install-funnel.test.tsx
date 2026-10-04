/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: { to: string; search?: Record<string, string>; children: ReactNode }) =>
    <a href={`${to}${search === undefined || Object.keys(search).length === 0 ? '' : `?${new URLSearchParams(search)}`}`} {...props}>{children}</a>,
}))
afterEach(cleanup)
describe('one Agent connection path', () => {
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
  it('preserves the exact selected Tool through manual setup without private task input', async () => {
    const resumeTool = `operation:v1:${'a'.repeat(64)}`
    render(<AeAssistantInstallFunnel canonicalBaseUrl="https://ae.example" resumeToolRef={resumeTool} />)
    fireEvent.click(screen.getByRole('button', { name: 'Connecting a custom script or another app?' }))
    const manual = await screen.findByRole('link', { name: 'Issue a manual key' })
    expect(manual.getAttribute('href')).toBe(`/owner/settings/agent-keys?issue=manual&resumeTool=${encodeURIComponent(resumeTool)}`)
    expect(screen.getByRole('link', { name: 'Continue after approval' }).getAttribute('href')).toBe(`/agent-access?resumeTool=${encodeURIComponent(resumeTool)}`)
  })
})
