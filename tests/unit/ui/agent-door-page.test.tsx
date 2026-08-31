/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AGENT_INSTRUCTION,
  AGENT_PAGE,
  AGENT_SETUP_INSTRUCTION,
  AGENT_STARTER_INSTRUCTION,
} from '@/content/brand-copy'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'

describe('agent door page', () => {
  afterEach(cleanup)

  it('separates executable setup from the first real market task', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAgentDoorPage canonicalBaseUrl="https://ae.example" />)

    expect(screen.getByRole('heading', { level: 1, name: AGENT_PAGE.heading })).toBeTruthy()
    expect(screen.getByText(AGENT_PAGE.harnesses)).toBeTruthy()
    expect(screen.getByText(AGENT_PAGE.subhead)).toBeTruthy()
    expect(screen.getByRole('heading', { name: AGENT_SETUP_INSTRUCTION.heading })).toBeTruthy()
    expect(screen.getByText(AGENT_SETUP_INSTRUCTION.code)).toBeTruthy()
    expect(screen.getByRole('heading', { name: AGENT_STARTER_INSTRUCTION.heading })).toBeTruthy()
    expect(screen.getByText(AGENT_STARTER_INSTRUCTION.code)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: AGENT_INSTRUCTION.heading })).toBeNull()
    expect(screen.queryByText(AGENT_INSTRUCTION.code)).toBeNull()
    expect(screen.getByRole('button', { name: `Copy ${AGENT_SETUP_INSTRUCTION.label}` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `Copy ${AGENT_STARTER_INSTRUCTION.label}` })).toBeTruthy()
    expect(screen.getAllByText(/npm install --global "https:\/\/ae\.example\/downloads\/agentic-economy-cli-0\.1\.0\.tgz"/u)).not.toHaveLength(0)
    expect(screen.getAllByText(/ae --version/u)).not.toHaveLength(0)
    expect(screen.queryByText(/npx @agentic-economy\/cli/u)).toBeNull()
    expect(screen.getByRole('link', { name: 'Publish an Operation' })).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-browser"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: `Copy ${AGENT_SETUP_INSTRUCTION.label}` }))
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    const copied = String(writeText.mock.calls[0]?.[0])
    expect(copied).toContain(`npm install --global "${window.location.origin}/downloads/agentic-economy-cli-0.1.0.tgz"`)
    expect(copied).toContain('ae --version')
    expect(copied).toContain(`npx --yes add-mcp@2.3.0 "${window.location.origin}/mcp"`)
    expect(copied).toContain('npx --yes add-mcp@2.3.0 list --global --agent "<agent>"')
    expect(copied).toContain(`ae doctor --base-url "${window.location.origin}" --json`)
    expect(copied).toContain('npm install --global --prefix "$HOME/.local"')
    expect(copied).toContain('Do not connect unless a selected callable Operation requires it.')
    expect(copied).toContain('buyer warnings only mean paid or authenticated calls are not connected yet')
    expect(copied).not.toContain('research the latest developments')
    expect(copied).not.toContain('$ORIGIN')

    fireEvent.click(screen.getByRole('button', { name: `Copy ${AGENT_STARTER_INSTRUCTION.label}` }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
    const starter = String(writeText.mock.calls[1]?.[0])
    expect(starter).toContain('research the latest developments in AI coding agents')
    expect(starter).toContain('total price, required inputs, readiness, and access requirements')
    expect(starter).toContain('ask me to approve the exact total')
    expect(starter).toContain('sources and the Agentic Economy evidence or receipt')
    expect(starter).toContain('single exact next command')
  })
})
