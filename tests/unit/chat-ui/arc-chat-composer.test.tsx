/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatComposer } from '@/components/ae/chat/chat-session/components/ChatComposer'
import { ChatSuggestedActions } from '@/components/ae/chat/chat-session/components/ChatSuggestedActions'
import type { ChatComposerProps } from '@/components/ae/chat/chat-session/chat-session.contracts'
import { chatSuggestions } from '@/lib/public/chat-ia'

afterEach(cleanup)
function props(overrides: Partial<ChatComposerProps> = {}): ChatComposerProps {
  return { prompt: 'Find a weather Tool', busy: false, disabled: false, error: '', browseMarketOnError: false, status: '', anonymousMessageLimitReached: false, onPromptChange: vi.fn(), onSubmit: vi.fn(), ...overrides }
}

it('submits the native form on Enter while Shift Enter and an active IME stay with the draft', async () => {
  const current = props()
  render(<ChatComposer {...current} />)
  const field = screen.getByRole('textbox', { name: 'Message' })
  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true })
  fireEvent.keyDown(field, { key: 'Enter', isComposing: true })
  expect(current.onSubmit).not.toHaveBeenCalled()
  await act(async () => { fireEvent.keyDown(field, { key: 'Enter' }) })
  await waitFor(() => expect(current.onSubmit).toHaveBeenCalledOnce())
})

it('counts Unicode characters rather than code units and keeps an over-limit draft editable', async () => {
  const current = props({ prompt: '😀'.repeat(2_000) })
  const view = render(<ChatComposer {...current} />)
  expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(false)
  expect(screen.getByText('2,000 / 2,000')).toBeTruthy()
  view.rerender(<ChatComposer {...current} prompt={'😀'.repeat(2_001)} />)
  const field = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement
  expect(field.disabled).toBe(false)
  expect(field.value).toBe('😀'.repeat(2_001))
  expect((screen.getByRole('button', { name: 'Send message' }) as HTMLButtonElement).disabled).toBe(true)
  await act(async () => { fireEvent.keyDown(field, { key: 'Enter' }) })
  expect(current.onSubmit).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'Edited question' } })
  expect(current.onPromptChange).toHaveBeenCalledWith('Edited question')
})

it('stops a busy response through its own callback without submitting or acknowledging a result', async () => {
  const current = props({ busy: true, onStop: vi.fn() })
  const view = render(<ChatComposer {...current} />)
  expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull()
  await act(async () => {
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Stop generating' }))
  })
  expect(current.onStop).toHaveBeenCalledOnce()
  expect(current.onSubmit).not.toHaveBeenCalled()
  view.rerender(<ChatComposer {...props({ busy: true })} />)
  expect((screen.getByRole('button', { name: 'Sending message' }) as HTMLButtonElement).disabled).toBe(true)
})

it('passes the exact existing suggested prompt and never submits the surrounding form', () => {
  const pick = vi.fn(), submit = vi.fn(event => event.preventDefault())
  render(<form onSubmit={submit}><ChatSuggestedActions onPick={pick} /></form>)
  for (const suggestion of chatSuggestions) fireEvent.click(screen.getByRole('button', { name: suggestion.prompt }))
  expect(pick.mock.calls).toEqual(chatSuggestions.map(suggestion => [suggestion.prompt]))
  expect(submit).not.toHaveBeenCalled()
})
