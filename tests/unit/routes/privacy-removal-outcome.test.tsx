/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeMocks = vi.hoisted(() => ({
  openRemoval: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}))

vi.mock('@tanstack/react-start', () => ({
  createClientOnlyFn: (fn: (...args: never[]) => unknown) => fn,
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: () => Symbol('open-removal-server'),
    }
    return builder
  },
  useServerFn: () => routeMocks.openRemoval,
}))

vi.mock('@/hooks/use-client-mounted', () => ({ useClientMounted: () => true }))
vi.mock('@/components/ae/layout/AePublicPage', () => ({
  AePublicPage: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/lib/ui/toast', () => ({ toast: { success: vi.fn() } }))

import { Route as PrivacyRemovalRoute } from '@/routes/privacy.remove-business'

afterEach(() => {
  cleanup()
  routeMocks.openRemoval.mockReset()
})

describe('privacy removal unknown outcomes', () => {
  it('retains entered information and prevents a blind duplicate submission', async () => {
    routeMocks.openRemoval.mockRejectedValue(new Error('private transport detail'))
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    fireEvent.change(screen.getByLabelText('Your email'), {
      target: { value: 'owner@example.com' },
    })
    fireEvent.change(screen.getByLabelText('What should change?'), {
      target: { value: 'Remove the duplicate supplier profile.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))

    await waitFor(() => expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('alert').textContent).toContain('The request outcome could not be confirmed.')
    expect(screen.getByRole('alert').textContent).not.toContain('private transport detail')
    expect(screen.getByDisplayValue('owner@example.com')).toBeTruthy()
    expect(screen.getByDisplayValue('Remove the duplicate supplier profile.')).toBeTruthy()
    const disabled = screen.getByRole<HTMLButtonElement>('button', { name: 'Outcome not confirmed' })
    expect(disabled.disabled).toBe(true)

    const form = disabled.closest('form')
    if (form === null) throw new Error('privacy_removal_form_missing')
    fireEvent.submit(form)
    expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1)
  })

  it('also blocks a duplicate when the server resolves a retryable source outage', async () => {
    routeMocks.openRemoval.mockResolvedValue({
      kind: 'error',
      code: 'dispute_invalid_target',
      retryable: true,
      reason: 'Please try again.',
    })
    const Component = PrivacyRemovalRoute.options.component
    if (Component === undefined) throw new Error('privacy_removal_component_missing')
    render(<Component />)

    fireEvent.change(screen.getByLabelText('Your email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('What should change?'), { target: { value: 'Remove duplicate.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))

    expect(await screen.findByRole('button', { name: 'Outcome not confirmed' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('alert').textContent).toContain('Contact support before submitting another request.')
    expect(routeMocks.openRemoval).toHaveBeenCalledTimes(1)
  })
})
