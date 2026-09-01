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
    useLocation: () => ({ pathname: '/owner/offerings', hash: '', search: {} }),
    useRouter: () => ({ invalidate: mocks.invalidate }),
  }
})
vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: () => mocks.ensureSupplier,
}))

import { SupplierIdentityForm } from '@/components/ae/offerings/AeOwnerOperationsWorkspace'

afterEach(() => {
  cleanup()
  mocks.ensureSupplier.mockReset()
  mocks.invalidate.mockReset()
  mocks.invalidate.mockResolvedValue(undefined)
})

describe('supplier identity unknown outcomes', () => {
  it('requires status reload after a source-unavailable refusal and retains entered values', async () => {
    mocks.ensureSupplier.mockResolvedValue({ kind: 'refused', code: 'source_unavailable' })
    render(<SupplierIdentityForm />)
    fireEvent.change(screen.getByLabelText('Supplier name'), { target: { value: 'Example Supplier' } })
    fireEvent.change(screen.getByLabelText('Supplier website'), { target: { value: 'https://supplier.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create supplier workspace' }))

    const blocked = await screen.findByRole<HTMLButtonElement>('button', { name: 'Outcome not confirmed' })
    expect(blocked.disabled).toBe(true)
    expect(screen.getByDisplayValue('Example Supplier')).toBeTruthy()
    expect(screen.getByDisplayValue('https://supplier.example')).toBeTruthy()
    expect(mocks.ensureSupplier).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reload supplier status' }))
    await waitFor(() => expect(mocks.invalidate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create supplier workspace' })).toBeTruthy())
    expect(mocks.ensureSupplier).toHaveBeenCalledTimes(1)
  })
})
