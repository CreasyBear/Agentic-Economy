/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement('a', { href: to }, children),
  useRouter: () => ({ invalidate: vi.fn() }),
}))

import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'
import { Route } from '@/routes/for-providers'

afterEach(cleanup)

describe('provider supply route', () => {
  it('declares the business supply landing route', () => {
    expect(Route).toBeDefined()
  })

  it('opens Add Tool from the single primary call to action', () => {
    render(createElement(AeSupplyLanding, { tools: [], publishedTools: [] }))

    const primaryCta = screen.getByRole('link', { name: 'Add Tool' })
    expect(primaryCta.getAttribute('href')).toBe('/owner/operations/new')
    expect(screen.getAllByRole('link', { name: 'Add Tool' })).toHaveLength(1)
  })
})
