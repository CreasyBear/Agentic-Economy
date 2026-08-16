/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>{children}</a>
  ),
}))

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: () => undefined,
}))

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

describe('AePublicShell immersive layout', () => {
  afterEach(cleanup)

  it('omits the footer from the immersive chat shell', () => {
    const { container } = render(
      <AePublicShell immersive>
        <div>Chat</div>
      </AePublicShell>,
    )

    const outerShell = container.firstElementChild as HTMLElement
    const main = screen.getByRole('main')
    const appShellMain = main.parentElement
    expect([...outerShell.classList]).toEqual(expect.arrayContaining(['h-dvh', 'flex', 'flex-col', 'overflow-hidden']))
    expect([...(appShellMain?.classList ?? [])]).toEqual(expect.arrayContaining(['min-h-0', 'flex-1', 'flex-col']))
    expect([...main.classList]).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']))
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })

  it('preserves the document-flow shell for non-immersive pages', () => {
    const { container } = render(
      <AePublicShell>
        <div>Page</div>
      </AePublicShell>,
    )

    const outerShell = container.firstElementChild as HTMLElement
    const main = screen.getByRole('main')
    const footer = screen.getByRole('contentinfo')

    expect(outerShell.classList).toContain('min-h-dvh')
    expect(outerShell.classList).not.toContain('h-dvh')
    expect(outerShell.classList).not.toContain('overflow-hidden')
    expect(main.className).toBe('')
    expect(footer.classList).not.toContain('fixed')
    expect(footer.classList).not.toContain('flex-none')
  })
})
