/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  AeSiteAuthPanel,
  AeSiteAuthSubmit,
  AeSiteBrowser,
  AeSiteCover,
  AeSiteResourceList,
} from '@/components/ae/website'

describe('site kit surfaces from Opensource UI', () => {
  it('frames live content in desktop chrome with an honest URL', () => {
    render(
      <AeSiteBrowser url="/sign-in">
        <p>Signed surface</p>
      </AeSiteBrowser>,
    )

    const frame = screen.getByText('/sign-in').closest('[data-slot="ae-site-browser"]')
    expect(frame).not.toBeNull()
    expect(screen.getByText('Signed surface')).toBeTruthy()
    expect(frame?.textContent).not.toMatch(/bidyut|cursor\.com|product hunt/i)
  })

  it('lists machine files as lettered rows without a logo wall', () => {
    render(
      <nav aria-label="Machine-readable files">
        <AeSiteResourceList
          items={[
            { name: 'llms.txt', description: 'Public Operation index', href: '/llms.txt', letter: 'L' },
            { name: 'SKILL.md', description: 'Assistant procedure', href: '/SKILL.md', letter: 'S' },
          ]}
        />
      </nav>,
    )

    const files = screen.getByRole('navigation', { name: 'Machine-readable files' })
    const llms = within(files).getByRole('link', { name: /llms\.txt/ })
    expect(llms.getAttribute('href')).toBe('/llms.txt')
    expect(llms.classList.contains('min-h-touch')).toBe(true)
    expect(files.textContent).not.toMatch(/logo wall|Product Hunt/i)
  })

  it('renders a catalog cover without stock photography', () => {
    render(
      <AeSiteCover
        eyebrow="Catalog"
        title="Live list"
        meta="Inspect before you call"
        href="/market?window=30d"
      />,
    )

    const cover = screen.getByRole('link', { name: /Live list/ })
    expect(cover.getAttribute('href')).toBe('/market?window=30d')
    expect(cover.querySelector('img')).toBeNull()
  })

  it('hosts auth copy and an ink submit without Clerk chrome', () => {
    render(
      <AeSiteAuthPanel
        eyebrow="Account"
        title="Local preview sign-in is off"
        titleId="sign-in-context-heading"
        body="This browser journey does not connect a Clerk account. Nothing is signed in or authorized."
        footer={<a href="/sign-up">Create one</a>}
      >
        <AeSiteAuthSubmit>Sign in</AeSiteAuthSubmit>
      </AeSiteAuthPanel>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Local preview sign-in is off' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in' }).classList.contains('min-h-touch')).toBe(true)
    expect(screen.getByRole('link', { name: 'Create one' }).getAttribute('href')).toBe('/sign-up')
  })
})
