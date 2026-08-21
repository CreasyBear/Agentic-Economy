/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { AeChatWelcome } from '@/components/ae/chat/AeChatWelcome'
import { AeQueryPanel, type AeQueryPanelProps } from '@/components/ae/chat/AeQueryPanel'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'

describe('AeQueryPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('composes the canonical restrained welcome roles', () => {
    render(<AeChatWelcome />)

    const heading = screen.getByRole('heading', { level: 1, name: 'What do you need done?' })
    expect(heading.getAttribute('data-slot')).toBe('empty-title')
    expect(heading.parentElement?.getAttribute('data-slot')).toBe('empty-header')
    expect(
      screen.getByText('Ask about a task, a service, or current information.')
        .getAttribute('data-slot'),
    ).toBe('empty-description')
  })

  it('renders one plain-language source disclosure with landing examples', () => {
    render(<AeQueryPanel onSubmit={() => undefined} />)

    expect(
      screen.getAllByText(
        'Answers can use published business information or available live data.',
      ),
    ).toHaveLength(1)
    expect(screen.queryByText('Answers based on business information.')).toBeNull()
  })

  it('can render meaningful product-boundary guidance in the compact composer', () => {
    render(
      <AeQueryPanel
        onSubmit={() => undefined}
        showExamples={false}
        placeholder="Ask a follow-up"
        loopHint="Compare the published details first."
      />,
    )

    expect(screen.getByPlaceholderText('Ask a follow-up')).toBeTruthy()
    expect(screen.getByText('Compare the published details first.')).toBeTruthy()
  })

  it('hides business timing controls for data follow-ups', () => {
    render(
      <AeQueryPanel
        onSubmit={() => undefined}
        showExamples={false}
        showTiming={false}
        placeholder="Ask a follow-up"
      />,
    )

    expect(screen.getByPlaceholderText('Ask a follow-up')).toBeTruthy()
    expect(screen.queryByText('When do you need this?')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'When do you need this?' })).toBeNull()
  })

  it('hides the timing choice during a turn and restores the prior selection when idle', async () => {
    const submitted: Array<Parameters<AeQueryPanelProps['onSubmit']>> = []
    const onSubmit: AeQueryPanelProps['onSubmit'] = (query, timing, timingDate) => {
      submitted.push([query, timing, timingDate])
    }
    const panel = (busy: boolean) => <AeQueryPanel onSubmit={onSubmit} showExamples={false} busy={busy} />
    const view = render(panel(false))

    const timing = screen.getByRole('combobox', { name: 'When do you need this?' })
    fireEvent.click(timing)
    fireEvent.click(screen.getByRole('option', { name: 'This week' }))
    expect(timing.textContent).toContain('This week')

    view.rerender(panel(true))
    expect(screen.queryByRole('combobox', { name: 'When do you need this?' })).toBeNull()
    expect(screen.queryByRole('option')).toBeNull()
    expect(screen.queryByText('When do you need this?')).toBeNull()

    view.rerender(panel(false))
    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('This week')

    const input = screen.getByRole('searchbox', { name: 'What do you need done?' })
    fireEvent.change(input, { target: { value: 'Emergency plumber Brunswick' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      expect(submitted).toEqual([['Emergency plumber Brunswick', 'this_week', undefined]])
    })
  })

  it('hides the chosen-date control during a turn and restores the entered date when idle', () => {
    const panel = (busy: boolean) => <AeQueryPanel onSubmit={() => undefined} showExamples={false} busy={busy} />
    const view = render(panel(false))

    const timing = screen.getByRole('combobox', { name: 'When do you need this?' })
    fireEvent.click(timing)
    fireEvent.click(screen.getByRole('option', { name: 'Choose a date' }))
    const date = screen.getByLabelText('Date') as HTMLInputElement
    fireEvent.change(date, { target: { value: '2099-01-31' } })
    expect(date.classList.contains('text-base')).toBe(true)
    expect(date.classList.contains('md:text-xs')).toBe(true)
    expect(date.required).toBe(true)
    expect(date.min).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(date.value).toBe('2099-01-31')

    view.rerender(panel(true))
    expect(screen.queryByLabelText('Date')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'When do you need this?' })).toBeNull()

    view.rerender(panel(false))
    expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe('2099-01-31')
    expect(screen.getByRole('combobox', { name: 'When do you need this?' }).textContent).toContain('Choose a date')
  })

  it('turns the busy submit control into the active stop action', () => {
    const stopped: string[] = []
    render(
      <AeQueryPanel
        onSubmit={() => undefined}
        onStop={() => stopped.push('stopped')}
        showExamples={false}
        busy
      />,
    )

    const stop = screen.getByRole('button', { name: 'Stop generating' })
    expect(stop.getAttribute('type')).toBe('button')
    expect(stop.hasAttribute('disabled')).toBe(false)
    fireEvent.click(stop)
    expect(stopped).toEqual(['stopped'])
  })

  it('keeps Send discoverable and reports an actionable empty-field error with focus', async () => {
    const submitted: Array<Parameters<AeQueryPanelProps['onSubmit']>> = []
    render(
      <AeQueryPanel
        onSubmit={(...args) => submitted.push(args)}
        showExamples={false}
        showTiming={false}
      />,
    )

    const searchbox = screen.getByRole('searchbox', { name: 'What do you need done?' })
    const send = screen.getByRole('button', { name: 'Send' })
    await waitFor(() => expect(send.hasAttribute('disabled')).toBe(false))
    fireEvent.click(send)

    expect(
      screen.getByText('Enter a question or describe what you need before sending.'),
    ).toBeTruthy()
    expect(searchbox.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(searchbox)
    expect(submitted).toEqual([])
  })

  it('accepts an over-limit paste, renders its count, and refuses submission with focus', async () => {
    const submitted: Array<Parameters<AeQueryPanelProps['onSubmit']>> = []
    render(
      <AeQueryPanel
        onSubmit={(...args) => submitted.push(args)}
        showExamples={false}
        showTiming={false}
      />,
    )

    const searchbox = screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLTextAreaElement
    expect(screen.queryByText(`0 / ${QUERY_MAX_LENGTH} characters`)).toBeNull()
    expect(searchbox.maxLength).toBe(-1)

    const query = 'q'.repeat(QUERY_MAX_LENGTH + 1)
    expect(
      fireEvent.paste(searchbox, { clipboardData: { getData: () => query } }),
    ).toBe(true)
    fireEvent.change(searchbox, { target: { value: query } })
    expect(searchbox.value).toBe(query)
    expect(searchbox.getAttribute('aria-invalid')).toBeNull()
    expect(
      screen.getByText(`${QUERY_MAX_LENGTH + 1} / ${QUERY_MAX_LENGTH} characters`),
    ).toBeTruthy()

    const send = screen.getByRole('button', { name: 'Send' })
    await waitFor(() => expect(send.hasAttribute('disabled')).toBe(false))
    fireEvent.click(send)

    const error = screen.getByText(
      `Your question is too long. Keep it to ${QUERY_MAX_LENGTH} characters or fewer.`,
    )
    expect(error.classList.contains('text-destructive')).toBe(true)
    expect(searchbox.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(searchbox)
    expect(submitted).toEqual([])
  })

  it.each([199, 200])('submits a valid %i-character query', async (length) => {
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
    fireEvent.change(searchbox, { target: { value: query } })
    expect(screen.getByText(`${length} / ${QUERY_MAX_LENGTH} characters`)).toBeTruthy()
    fireEvent.submit(searchbox.closest('form')!)

    await waitFor(() => {
      expect(submitted).toEqual([[query, 'flexible', undefined]])
    })
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

  it('wraps short landing labels and submits their full original values', async () => {
    const submitted: Array<Parameters<AeQueryPanelProps['onSubmit']>> = []
    render(
      <AeQueryPanel
        onSubmit={(...args) => submitted.push(args)}
        showTiming={false}
      />,
    )

    const chip = screen.getByRole('button', { name: 'Search operations' })
    const suggestions = chip.parentElement
    expect(suggestions?.classList.contains('flex-wrap')).toBe(true)
    expect(suggestions?.closest('[data-slot="scroll-area"]')).toBeNull()

    fireEvent.click(chip)
    expect(
      (screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLTextAreaElement).value,
    ).toBe('What admitted operations can I inspect?')
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(submitted).toEqual([
        ['What admitted operations can I inspect?', 'flexible', undefined],
      ])
    })
  })

  it('keeps the interpolated near-me query behind the short landing label', () => {
    render(
      <AeQueryPanel
        onSubmit={() => undefined}
        showTiming={false}
        searchContext={{
          mode: 'near_me',
          location: {
            label: 'Footscray, VIC',
            suburb: 'Footscray',
            stateTerritory: 'VIC',
            countryCode: 'AU',
            source: 'user_selected',
          },
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Local weather' }))
    expect(
      (screen.getByRole('searchbox', { name: 'What do you need done?' }) as HTMLTextAreaElement).value,
    ).toBe('What is the current weather in Footscray?')
  })
})
