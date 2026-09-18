/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import '../../setup/jsdom-platform'

import { useAeMutationToast } from '@/hooks/useAeMutationToast'
import { toast } from '@/lib/ui/toast'

vi.mock('@/lib/ui/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useAeMutationToast (W-43)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers toast.success on successful mutation promise', async () => {
    const { result } = renderHook(() => useAeMutationToast())

    let outcome = ''
    await act(async () => {
      outcome = await result.current.executeWithToast(
        Promise.resolve('saved_data'),
        { success: 'Settings updated successfully' }
      )
    })

    expect(outcome).toBe('saved_data')
    expect(toast.success).toHaveBeenCalledWith('Settings updated successfully', undefined)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('triggers toast.error and re-throws when mutation rejects', async () => {
    const { result } = renderHook(() => useAeMutationToast())

    await expect(
      act(async () => {
        await result.current.executeWithToast(
          Promise.reject(new Error('Network timeout')),
          { success: 'Updated' }
        )
      })
    ).rejects.toThrow('Network timeout')

    expect(toast.error).toHaveBeenCalledWith('Network timeout')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('copies text and notifies via toast.success', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    const { result } = renderHook(() => useAeMutationToast())

    let copied = false
    await act(async () => {
      copied = await result.current.copyWithToast('test_api_key_123', 'API key copied!')
    })

    expect(copied).toBe(true)
    expect(writeTextMock).toHaveBeenCalledWith('test_api_key_123')
    expect(toast.success).toHaveBeenCalledWith('API key copied!')
  })
})
