// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const clerkMocks = vi.hoisted(() => ({ prompts: 0 }))

vi.mock('@clerk/tanstack-react-start', () => ({
  useReverification: <T>(fetcher: (...args: never[]) => Promise<T>) => async (...args: never[]): Promise<T> => {
    const result = await fetcher(...args)
    if (typeof result === 'object' && result !== null && 'clerk_error' in result) {
      clerkMocks.prompts += 1
      return await fetcher(...args)
    }
    return result
  },
}))

vi.mock('@clerk/shared/authorization-errors', () => ({
  reverificationError: (level: string) => ({ clerk_error: { level } }),
}))

import { useTypedReverification } from './useTypedReverification'

type Result =
  | Readonly<{ kind: 'refused'; code: 'step_up_required' }>
  | Readonly<{ kind: 'completed'; value: string }>

afterEach(() => {
  vi.clearAllMocks()
  clerkMocks.prompts = 0
})

describe('useTypedReverification', () => {
  it('retries once, returns a second refusal without looping, and resets for the next call', async () => {
    const responses: Result[] = [
      { kind: 'refused', code: 'step_up_required' },
      { kind: 'completed', value: 'retried result' },
      { kind: 'refused', code: 'step_up_required' },
      { kind: 'refused', code: 'step_up_required' },
    ]
    const request = vi.fn(async (_requestId: string): Promise<Result> => {
      const next = responses.shift()
      if (next === undefined) throw new Error('Unexpected request')
      return next
    })
    const { result } = renderHook(() => useTypedReverification(
      request,
      (response) => response.kind === 'refused' ? 'strict' : null,
    ))

    let retriedResult: Result | undefined
    await act(async () => { retriedResult = await result.current('first') })
    expect(retriedResult).toEqual({ kind: 'completed', value: 'retried result' })
    expect(request).toHaveBeenNthCalledWith(1, 'first')
    expect(request).toHaveBeenNthCalledWith(2, 'first')
    expect(clerkMocks.prompts).toBe(1)

    let secondRefusal: Result | undefined
    await act(async () => { secondRefusal = await result.current('second') })
    expect(secondRefusal).toEqual({ kind: 'refused', code: 'step_up_required' })
    expect(request).toHaveBeenNthCalledWith(3, 'second')
    expect(request).toHaveBeenNthCalledWith(4, 'second')
    expect(request).toHaveBeenCalledTimes(4)
    expect(clerkMocks.prompts).toBe(2)
  })
})
