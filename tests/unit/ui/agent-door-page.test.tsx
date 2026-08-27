/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AGENT_INSTRUCTION, AGENT_PAGE, AGENT_SETUP_INSTRUCTION } from '@/content/brand-copy'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'

describe('agent door page', () => {
  afterEach(cleanup)

  it('uses a setup paste, names the harnesses, and keeps the copy control', () => {
    render(<AeAgentDoorPage canonicalBaseUrl="https://ae.example" />)

    expect(screen.getByRole('heading', { level: 1, name: AGENT_PAGE.heading })).toBeTruthy()
    expect(screen.getByText(AGENT_PAGE.harnesses)).toBeTruthy()
    expect(screen.getByText(AGENT_PAGE.subhead)).toBeTruthy()
    expect(screen.getByRole('heading', { name: AGENT_SETUP_INSTRUCTION.heading })).toBeTruthy()
    expect(screen.getByText(AGENT_SETUP_INSTRUCTION.code)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: AGENT_INSTRUCTION.heading })).toBeNull()
    expect(screen.queryByText(AGENT_INSTRUCTION.code)).toBeNull()
    expect(screen.getByRole('button', { name: `Copy ${AGENT_SETUP_INSTRUCTION.label}` })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'List a tool' })).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-browser"]')).toBeNull()
  })
})
