/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AeCopyCommand', () => {
  it('keeps masked display separate from lazily resolved clipboard content', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const secret = 'canary-secret-never-in-rendered-command'
    const copyText = vi.fn(() => `curl $ORIGIN/tool -H 'Authorization: Bearer ${secret}'`)
    const { container } = render(<AeCopyCommand label="Agent command" code="curl $ORIGIN/tool -H 'Authorization: Bearer ••••'" copyText={copyText} />)

    expect(copyText).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain(secret)
    const source = screen.getByLabelText('Selectable Agent command')
    expect(source.tagName).toBe('PRE')
    expect(source.tabIndex).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Agent command' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`curl ${window.location.origin}/tool -H 'Authorization: Bearer ${secret}'`))
    expect(copyText).toHaveBeenCalledOnce()
    expect(screen.getByRole('status').textContent).toBe('Agent command copied.')
    expect(source.textContent).toContain('$ORIGIN')
    expect(container.textContent).not.toContain(secret)
  })

  it('removes previously visible secret text immediately when display is masked', () => {
    const secret = 'canary-visible-until-mask'
    const { container, rerender } = render(<AeCopyCommand label="Agent config" code={secret} resolveOrigin={false} />)
    expect(container.textContent).toContain(secret)

    rerender(<AeCopyCommand label="Agent config" code="••••" copyText={secret} resolveOrigin={false} />)

    expect(container.textContent).not.toContain(secret)
    expect(screen.getByLabelText('Selectable Agent config').textContent).toBe('••••')
  })

  it('preserves literal origin when requested and leaves selectable recovery after clipboard denial', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<AeCopyCommand label="Literal command" code="curl $ORIGIN/tool" resolveOrigin={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy Literal command' }))

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copy failed. Select the command and copy it manually.'))
    expect(writeText).toHaveBeenCalledWith('curl $ORIGIN/tool')
    expect(screen.getByLabelText('Selectable Literal command').textContent).toBe('curl $ORIGIN/tool')
    expect(screen.getByRole('button', { name: 'Copy Literal command' })).toBeTruthy()
  })
})
