/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const routeMocks = vi.hoisted(() => ({
  ensureSupplier: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  loaderData: { kind: 'not_found' } as unknown,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => {
    const route = { ...options, useLoaderData: () => routeMocks.loaderData }
    return { ...route, options: route }
  },
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  Outlet: () => null,
  useLocation: () => ({ pathname: '/owner/offerings' }),
  useRouter: () => ({ invalidate: routeMocks.invalidate }),
}))

vi.mock('@tanstack/react-start', () => ({
  useServerFn: () => routeMocks.ensureSupplier,
}))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/ae/offerings/AeOwnerOfferings', () => ({
  AeOwnerOfferingsList: () => null,
}))
vi.mock('@/components/ae/offerings/owner-offering.functions', () => ({
  ensureSupplierBusinessServer: Symbol('ensure-supplier'),
  readOwnerOfferingSupplyServer: vi.fn(),
}))
vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))
vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: vi.fn(),
}))

import { Route as OwnerOfferingsRoute } from '@/routes/_operator/owner.offerings'

afterEach(() => {
  cleanup()
  routeMocks.ensureSupplier.mockReset()
  routeMocks.invalidate.mockReset()
  routeMocks.invalidate.mockResolvedValue(undefined)
  routeMocks.loaderData = { kind: 'not_found' }
})

describe('supplier identity unknown outcomes', () => {
  it('requires supplier status reload after a resolved source-unavailable refusal', async () => {
    routeMocks.ensureSupplier.mockResolvedValue({ kind: 'refused', code: 'source_unavailable' })
    const Component = OwnerOfferingsRoute.options.component
    if (Component === undefined) throw new Error('owner_offerings_component_missing')
    render(<Component />)

    fireEvent.change(screen.getByLabelText('Provider name'), { target: { value: 'Example Provider' } })
    fireEvent.change(screen.getByLabelText('Provider website'), { target: { value: 'https://provider.example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create supplier workspace' }))

    const blocked = await screen.findByRole<HTMLButtonElement>('button', { name: 'Outcome not confirmed' })
    expect(blocked.disabled).toBe(true)
    expect(screen.getAllByText(/Reload supplier status before submitting again/i).length).toBeGreaterThan(0)
    expect(routeMocks.ensureSupplier).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Reload supplier status' }))
    await waitFor(() => expect(routeMocks.invalidate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create supplier workspace' })).toBeTruthy())
    expect(routeMocks.ensureSupplier).toHaveBeenCalledTimes(1)
  })
})
