/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AGENT_INSTRUCTION, AGENT_PAGE } from '@/content/brand-copy'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

import { AeAgentDoorPage } from '@/components/ae/agents/AeAgentDoorPage'

describe('agent door page', () => {
  afterEach(cleanup)

  it('uses the same agent instruction as home and keeps the copy control', () => {
    render(<AeAgentDoorPage canonicalBaseUrl="https://ae.example" />)

    expect(screen.getByRole('heading', { level: 1, name: AGENT_PAGE.heading })).toBeTruthy()
    expect(screen.getByRole('heading', { name: AGENT_INSTRUCTION.heading })).toBeTruthy()
    expect(screen.getByRole('button', { name: `Copy ${AGENT_INSTRUCTION.label}` })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'List a tool' })).toBeTruthy()
    expect(document.querySelector('[data-slot="ae-site-browser"]')).toBeNull()
  })
})
