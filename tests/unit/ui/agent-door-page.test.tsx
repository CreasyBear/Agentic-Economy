/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AGENT_PAGE,
} from '@/content/brand-copy'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'

describe('agent door page', () => {
  afterEach(cleanup)

  it('shows one selected native connection path without exposing protocol work', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeAgentDoorPage canonicalBaseUrl="https://ae.example" />)

    expect(screen.getByRole('heading', { level: 1, name: AGENT_PAGE.heading })).toBeTruthy()
    expect(screen.getByText(AGENT_PAGE.harnesses)).toBeTruthy()
    expect(screen.getByText(AGENT_PAGE.subhead)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Add Agentic Economy' })).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Agent client' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copy Codex MCP command' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy Claude Code MCP command' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy Cursor MCP command' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Six-step agent quickstart' })).toBeNull()
    expect(document.querySelector('[data-slot="ae-site-browser"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Copy Codex MCP command' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Claude Code' }), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Claude Code MCP command' }))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Cursor' }), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Cursor MCP command' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3))
    expect(writeText).toHaveBeenNthCalledWith(1, [
      `codex mcp add agentic-economy --url "${window.location.origin}/mcp"`,
      'codex mcp login agentic-economy',
    ].join('\n'))
    expect(writeText).toHaveBeenNthCalledWith(2, `claude mcp add --transport http --scope user agentic-economy "${window.location.origin}/mcp"`)
    expect(writeText).toHaveBeenNthCalledWith(3, `cursor --add-mcp '{"name":"agentic-economy","url":"${window.location.origin}/mcp"}'`)

    const pageText = document.body.textContent ?? ''
    expect(pageText).toContain('Public search works immediately')
    expect(pageText).toContain('Enable agentic-economy in Cursor, then follow its OAuth prompt.')
    expect(pageText).not.toMatch(/whoami|Agent Principal|token exchange|scope|bearer|api key|ae connect|npm install|add-mcp@/iu)
  })
})
