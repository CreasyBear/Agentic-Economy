/** @vitest-environment jsdom */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const mocks = vi.hoisted(() => ({ ensureSupplier: vi.fn(), invalidate: vi.fn(async () => undefined) }))

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')
  return {
    Await: ({ children, promise }: { children: (value: unknown) => ReactNode; promise: Promise<unknown> }) => {
      const [value, setValue] = React.useState<unknown>()
      React.useEffect(() => { void promise.then(setValue) }, [promise])
      return value === undefined ? null : children(value)
    },
    Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
    useLocation: () => ({ pathname: '/owner/operations', hash: '', search: {} }),
    useRouter: () => ({ invalidate: mocks.invalidate }),
  }
})
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: () => mocks.ensureSupplier,
}))

import { ProviderIdentityForm } from '@/components/ae/offerings/AeProviderWorkspace'

afterEach(() => {
  cleanup()
  mocks.ensureSupplier.mockReset()
  mocks.invalidate.mockReset()
  mocks.invalidate.mockResolvedValue(undefined)
})

describe('provider identity unknown outcomes', () => {
  it('requires status reload after a source-unavailable refusal and retains entered values', async () => {
    mocks.ensureSupplier.mockResolvedValue({ kind: 'refused', code: 'source_unavailable' })
    render(<ProviderIdentityForm />)
    fireEvent.change(screen.getByLabelText('Provider name'), { target: { value: 'Example Provider' } })
    fireEvent.change(screen.getByLabelText('Provider website'), { target: { value: 'https://provider.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create provider workspace' }))

    const blocked = await screen.findByRole<HTMLButtonElement>('button', { name: 'Outcome not confirmed' })
    expect(blocked.disabled).toBe(true)
    expect(screen.getByDisplayValue('Example Provider')).toBeTruthy()
    expect(screen.getByDisplayValue('https://provider.example')).toBeTruthy()
    expect(mocks.ensureSupplier).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reload provider status' }))
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create provider workspace' })).toBeTruthy())
    expect(mocks.ensureSupplier).toHaveBeenCalledTimes(1)
  })
})
