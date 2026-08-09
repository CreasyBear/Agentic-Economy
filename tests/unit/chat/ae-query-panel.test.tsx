/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeQueryPanel, type AeQueryPanelProps } from '@/components/ae/chat/AeQueryPanel'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'

describe('AeQueryPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('can render session-aware follow-up guidance in the compact composer', () => {
    render(
      <AeQueryPanel
        onSubmit={() => undefined}
        showExamples={false}
        placeholder="Narrow, compare, or ask the business"
        loopHint="Narrow or compare the matches, then ask the business when one fits."
      />,
    )

    expect(screen.getByPlaceholderText('Narrow, compare, or ask the business')).toBeTruthy()
    expect(
      screen.getByText(
        'Narrow or compare the matches, then ask the business when one fits.',
      ),
    ).toBeTruthy()
    expect(screen.queryByText('Cited answers from published business details.')).toBeNull()
  })

  it('hides business timing controls for data follow-ups', () => {
    render(
      <AeQueryPanel
        onSubmit={() => undefined}
        showExamples={false}
        showTiming={false}
        placeholder="Ask a follow-up or try another live data lookup"
      />,
    )

    expect(screen.getByPlaceholderText('Ask a follow-up or try another live data lookup')).toBeTruthy()
    expect(screen.queryByText('When do you need this?')).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('hides the timing choice during a turn and restores the prior selection when idle', async () => {
    const submitted: Array<Parameters<AeQueryPanelProps['onSubmit']>> = []
    const onSubmit: AeQueryPanelProps['onSubmit'] = (query, timing, timingDate) => {
      submitted.push([query, timing, timingDate])
    }
    const panel = (busy: boolean) => <AeQueryPanel onSubmit={onSubmit} showExamples={false} busy={busy} />
    const view = render(panel(false))

    fireEvent.click(screen.getByRole('radio', { name: 'This week' }))
    expect(screen.getByRole('radio', { name: 'This week' }).getAttribute('aria-checked')).toBe('true')

    view.rerender(panel(true))
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryAllByRole('radio')).toEqual([])
    expect(screen.queryByText('When do you need this?')).toBeNull()

    view.rerender(panel(false))
    expect(screen.getByRole('radio', { name: 'This week' }).getAttribute('aria-checked')).toBe('true')

    const input = screen.getByRole('searchbox', { name: 'What do you need done?' })
    fireEvent.change(input, { target: { value: 'Emergency plumber Brunswick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => {
      expect(submitted).toEqual([['Emergency plumber Brunswick', 'this_week', undefined]])
    })
  })

  it('hides the chosen-date control during a turn and restores the entered date when idle', () => {
    const panel = (busy: boolean) => <AeQueryPanel onSubmit={() => undefined} showExamples={false} busy={busy} />
    const view = render(panel(false))

    fireEvent.click(screen.getByRole('radio', { name: 'Choose a date' }))
    const date = screen.getByLabelText('Date') as HTMLInputElement
    fireEvent.change(date, { target: { value: '2099-01-31' } })
    expect(date.value).toBe('2099-01-31')

    view.rerender(panel(true))
    expect(screen.queryByLabelText('Date')).toBeNull()

    view.rerender(panel(false))
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2099-01-31')
    expect(screen.getByRole('radio', { name: 'Choose a date' }).getAttribute('aria-checked')).toBe('true')
  })

  it.each([199, 200, 201])('enforces the shared %i-character query limit before submit', async (length) => {
    const submitted: Array<Parameters<AeQueryPanelProps['onSubmit']>> = []
    render(
      <AeQueryPanel
        onSubmit={(...args) => submitted.push(args)}
        showExamples={false}
        showTiming={false}
      />,
    )

    const query = 'q'.repeat(length)
    const searchbox = screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLTextAreaElement
    expect(searchbox.maxLength).toBe(QUERY_MAX_LENGTH)
    fireEvent.change(searchbox, { target: { value: query } })
    expect(searchbox.value).toBe(query)
    expect(screen.getByText(`${length} / ${QUERY_MAX_LENGTH} characters`)).toBeTruthy()

    const form = searchbox.closest('form')
    if (form === null) throw new Error('The follow-up composer must be a form.')
    fireEvent.submit(form)

    if (length > QUERY_MAX_LENGTH) {
      await screen.findByText(
        `Keep your question to ${QUERY_MAX_LENGTH} characters or fewer before asking.`,
      )
      expect(submitted).toEqual([])
      expect(screen.getByRole('searchbox', { name: 'What do you need done?' })).toBe(searchbox)
      expect(searchbox.closest('form')).toBe(form)
      expect(searchbox.value).toBe(query)
    } else {
      await waitFor(() => {
        expect(submitted).toEqual([[query, 'flexible', undefined]])
      })
    }
  })

  it('does not submit Enter while the query field is composing text', async () => {
    const submitted: Array<Parameters<AeQueryPanelProps['onSubmit']>> = []
    render(
      <AeQueryPanel
        onSubmit={(...args) => submitted.push(args)}
        showExamples={false}
        showTiming={false}
      />,
    )

    const searchbox = screen.getByRole('searchbox', { name: 'What do you need done?' })
    fireEvent.change(searchbox, { target: { value: '東京' } })
    fireEvent.compositionStart(searchbox)
    fireEvent.keyDown(searchbox, { key: 'Enter' })
    expect(submitted).toEqual([])

    fireEvent.compositionEnd(searchbox)
    fireEvent.keyDown(searchbox, { key: 'Enter' })
    await waitFor(() => {
      expect(submitted).toEqual([['東京', 'flexible', undefined]])
    })
  })
})
