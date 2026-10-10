/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const source = vi.hoisted(() => ({
  intent: undefined as undefined | null | { text: string | null },
  answer: vi.fn(async (_args: { text: string }) => null),
}))

vi.mock('convex/react', () => ({ useQuery: () => source.intent, useMutation: () => source.answer }))

import { HomeIntentQuestion } from '@/components/ae/agent-access/home/components/HomeIntentQuestion'

afterEach(() => {
  cleanup()
  source.answer.mockReset()
})

describe('HomeIntentQuestion', () => {
  it('renders while the owner has not answered and says the team reads it', () => {
    source.intent = { text: null }
    render(<HomeIntentQuestion />)
    expect(screen.getByText(/The AE team reads your answer/u)).toBeInTheDocument()
    expect(screen.getByText('Up to 500 characters.')).toBeInTheDocument()
  })

  it('says why a blank save does nothing instead of disabling Save', () => {
    source.intent = { text: null }
    render(<HomeIntentQuestion />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Type a goal, or choose Skip.')
    expect(source.answer).not.toHaveBeenCalled()
  })

  it('counts characters near the limit', () => {
    source.intent = { text: null }
    render(<HomeIntentQuestion />)
    fireEvent.change(screen.getByLabelText('Your goal'), { target: { value: 'x'.repeat(420) } })
    expect(screen.getByText('420 of 500 characters')).toBeInTheDocument()
  })

  it('hides Skip while a goal is typed, so the draft is not discarded', () => {
    source.intent = { text: null }
    render(<HomeIntentQuestion />)
    fireEvent.change(screen.getByLabelText('Your goal'), { target: { value: 'reconcile invoices' } })
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull()
  })

  it.each([[undefined], [null], [{ text: '' }], [{ text: 'build invoices' }]])('stays hidden for %j', (intent) => {
    source.intent = intent
    const { container } = render(<HomeIntentQuestion />)
    expect(container).toBeEmptyDOMElement()
  })

  it('saves the typed goal', async () => {
    source.intent = { text: null }
    render(<HomeIntentQuestion />)
    fireEvent.change(screen.getByLabelText('Your goal'), { target: { value: 'reconcile invoices' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(source.answer).toHaveBeenCalledWith({ text: 'reconcile invoices' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Thanks. The AE team will use this to suggest Tools.')
  })

  it('skips with an empty answer', async () => {
    source.intent = { text: null }
    render(<HomeIntentQuestion />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await waitFor(() => expect(source.answer).toHaveBeenCalledWith({ text: '' }))
  })

  it('shows a save error on the field when saving fails', async () => {
    source.intent = { text: null }
    source.answer.mockRejectedValueOnce(new Error('offline'))
    render(<HomeIntentQuestion />)
    fireEvent.change(screen.getByLabelText('Your goal'), { target: { value: 'goal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Could not save. Try again.')).toBeInTheDocument()
    expect(screen.queryByText('Could not skip. Try again.')).toBeNull()
    fireEvent.change(screen.getByLabelText('Your goal'), { target: { value: 'goal two' } })
    await waitFor(() => expect(screen.queryByText('Could not save. Try again.')).toBeNull())
    expect(screen.getByLabelText('Your goal')).not.toHaveAttribute('aria-invalid')
  })

  it('names the skip, not a save, when skipping fails', async () => {
    source.intent = { text: null }
    source.answer.mockRejectedValueOnce(new Error('offline'))
    render(<HomeIntentQuestion />)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not skip. Try again.')
    expect(screen.getByLabelText('Your goal')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Could not save. Try again.')).toBeNull()
  })
})
