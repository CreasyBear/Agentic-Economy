/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'
import { AGENT_PAGE } from '@/content/brand-copy'

describe('agent door page', () => {
  afterEach(cleanup)

  it('shows one selected native connection path without exposing protocol work', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const rootRoute = createRootRoute()
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        createRoute({ getParentRoute: () => rootRoute, path: '/status' }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    render(
      <RouterContextProvider router={router}>
        <AeAgentDoorPage canonicalBaseUrl="https://ae.example" availability="Paid calls open soon." />
      </RouterContextProvider>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Connect your Agent.' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const heroRegion = screen.getByRole('region', { name: 'Connect your Agent.' })
    expect(heroRegion.contains(screen.getByRole('heading', { level: 1, name: 'Connect your Agent.' }))).toBe(true)
    expect(screen.getByRole('region', { name: 'Agent connection' }).getAttribute('id')).toBe('agent-setup')
    expect(screen.getByRole('region', { name: 'Agent connection' }).getAttribute('tabindex')).toBe('-1')
    expect(screen.getByText(AGENT_PAGE.subhead)).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Choose your Agent app' })).toBeTruthy()
    const connectAgent = screen.getByRole('link', { name: 'Connect an Agent' })
    expect(connectAgent.getAttribute('href')).toBe('#agent-setup')
    expect(screen.queryByRole('button', { name: 'Copy setup commands' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    expect(screen.getByRole('button', { name: 'Copy setup commands' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy Claude Code MCP command' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy Cursor MCP command' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Six-step agent quickstart' })).toBeNull()
    expect(document.querySelector('[data-slot="ae-site-browser"]')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Read the skill' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open Agents' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Set a Spending policy' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Review Spending policy' })).toBeNull()
    expect(screen.getByRole('heading', { name: AGENT_PAGE.faqHeading })).toBeTruthy()
    expect(screen.getByRole('button', { name: AGENT_PAGE.faqQuestions[0].question })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Copy setup commands' }))
    await screen.findByText('Codex MCP command copied.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Claude Code' }))
    expect(screen.queryByText('Claude Code MCP command copied.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup commands' }))
    await screen.findByText('Claude Code MCP command copied.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Agent app' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cursor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup commands' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3))
    expect(writeText).toHaveBeenNthCalledWith(1, [
      'codex mcp add agentic-economy --url "https://ae.example/mcp"',
      'codex mcp login agentic-economy',
    ].join('\n'))
    expect(writeText).toHaveBeenNthCalledWith(2, 'claude mcp add --transport http --scope user agentic-economy "https://ae.example/mcp"')
    expect(writeText).toHaveBeenNthCalledWith(3, `cursor --add-mcp '{"name":"agentic-economy","url":"https://ae.example/mcp"}'`)

    const pageText = document.body.textContent ?? ''
    expect(pageText).not.toContain('browse Tools before connecting')
    expect(pageText).toContain('Your Account balance never grants permission to spend')
    expect(pageText).toContain('Enable agentic-economy in Cursor, then follow its OAuth prompt.')
    expect(pageText).not.toMatch(/whoami|Agent Principal|token exchange|bearer|api key|ae connect|npm install|add-mcp@/iu)
  })
})
