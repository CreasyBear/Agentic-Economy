// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const shareMocks = vi.hoisted(() => ({
  copy: vi.fn(),
  revoke: vi.fn(),
  announce: vi.fn(),
}))

vi.mock('@/components/ae/chat/copy-thread-link', () => ({
  copyAnswerThreadShareLink: shareMocks.copy,
  revokeAnswerThreadShare: shareMocks.revoke,
  announceShareFailure: shareMocks.announce,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

import { AeThreadHeader } from '@/components/ae/chat/AeThreadHeader'

describe('owner share controls', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('keeps Ask another visible and puts copy/revoke behind one Thread actions menu', async () => {
    const ask = vi.fn()
    shareMocks.copy.mockResolvedValue({ kind: 'copied', sharePath: '/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    shareMocks.revoke.mockResolvedValue({ kind: 'revoked' })
    render(<AeThreadHeader title="Find a plumber" threadId="thread:1" onNewQuestion={ask} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ask another' }))
    expect(ask).toHaveBeenCalledOnce()

    const trigger = screen.getByRole('button', { name: 'Thread actions' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Copy share link' })).toBeNull()

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    expect(screen.getByRole('menu')).toBeTruthy()
    const copy = screen.getByRole('menuitem', { name: 'Copy share link' })
    const revoke = screen.getByRole('menuitem', { name: 'Revoke share link' })
    expect(copy).toBeTruthy()
    expect(revoke).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()

    fireEvent.click(copy)
    await waitFor(() => expect(shareMocks.copy).toHaveBeenCalledWith('thread:1'))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revoke share link' }))
    await waitFor(() => expect(shareMocks.revoke).toHaveBeenCalledWith('thread:1'))

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    const revoked = screen.getByRole('menuitem', { name: 'Share link revoked' })
    expect(revoked.getAttribute('aria-disabled')).toBe('true')
  })

  it('disables both menu actions while a share request is busy', async () => {
    let resolveCopy: (() => void) | undefined
    shareMocks.copy.mockImplementation(
      () => new Promise<{ kind: 'copied'; sharePath: string }>((resolve) => {
        resolveCopy = () => resolve({
          kind: 'copied',
          sharePath: '/s/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        })
      }),
    )
    render(<AeThreadHeader title="Find a plumber" threadId="thread:1" />)

    const trigger = screen.getByRole('button', { name: 'Thread actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy share link' }))

    await waitFor(() => expect(trigger.getAttribute('aria-busy')).toBe('true'))
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    expect(screen.getByRole('menuitem', { name: 'Preparing share link…' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Revoke share link' }).getAttribute('aria-disabled')).toBe('true')

    resolveCopy?.()
    await waitFor(() => expect(trigger.getAttribute('aria-busy')).not.toBe('true'))
  })
})
