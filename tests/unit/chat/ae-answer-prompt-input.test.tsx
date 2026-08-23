/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeAnswerPromptInput } from '@/components/ae/chat/AeAnswerPromptInput'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'

afterEach(cleanup)

describe('AeAnswerPromptInput submission', () => {
  it('submits the trimmed query before clearing the textbox', () => {
    const query = '  find a local electrician  '
    let searchbox: HTMLTextAreaElement | undefined
    const onSubmit = vi.fn(() => {
      expect(searchbox?.value).toBe(query)
    })

    render(<AeAnswerPromptInput onSubmit={onSubmit} examples={[]} showTiming={false} />)
    searchbox = screen.getByRole('searchbox', { name: 'Search the operation market' }) as HTMLTextAreaElement
    fireEvent.change(searchbox, { target: { value: query } })
    fireEvent.submit(screen.getByRole('search'))

    expect(onSubmit).toHaveBeenCalledWith('find a local electrician', 'flexible', undefined)
    expect(searchbox.value).toBe('')
  })

  it.each([
    '   ',
    'q'.repeat(QUERY_MAX_LENGTH + 1),
  ])('does not clear an invalid query: %j', (query) => {
    const onSubmit = vi.fn()
    render(<AeAnswerPromptInput onSubmit={onSubmit} examples={[]} showTiming={false} />)
    const searchbox = screen.getByRole('searchbox', { name: 'Search the operation market' }) as HTMLTextAreaElement

    fireEvent.change(searchbox, { target: { value: query } })
    fireEvent.submit(screen.getByRole('search'))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(searchbox.value).toBe(query)
  })

  it('does not clear the query when onSubmit throws synchronously', () => {
    const query = 'find a local electrician'
    const onSubmit = vi.fn(() => {
      throw new Error('submission failed')
    })
    render(<AeAnswerPromptInput onSubmit={onSubmit} examples={[]} showTiming={false} />)
    const searchbox = screen.getByRole('searchbox', { name: 'Search the operation market' }) as HTMLTextAreaElement

    fireEvent.change(searchbox, { target: { value: query } })
    const errors: ErrorEvent[] = []
    const handleError = (event: ErrorEvent) => {
      errors.push(event)
      event.preventDefault()
    }
    window.addEventListener('error', handleError)
    try {
      fireEvent.submit(screen.getByRole('search'))
    } finally {
      window.removeEventListener('error', handleError)
    }

    expect(errors[0]?.error).toMatchObject({ message: 'submission failed' })
    expect(searchbox.value).toBe(query)
  })
})
