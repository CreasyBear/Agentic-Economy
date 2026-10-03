/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/public'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: mocks.query }))
vi.mock('./CommercialPolicyTable', () => ({
  CommercialPolicyTable: ({ onSelect }: { onSelect: (family: 'tax') => void }) =>
    <button type="button" onClick={() => onSelect('tax')}>Select Tax</button>,
}))

import { CommercialPolicyActions } from './CommercialPolicyActions'

afterEach(() => {
  cleanup()
  mocks.query.mockReset()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

describe('commercial policy family selection', () => {
  it('moves focus to the selected family editor after a table action', async () => {
    mocks.query.mockImplementation((_reference: unknown, args: { family?: string }) => args.family === undefined
      ? { kind: 'ready' }
      : { kind: 'ready', environment: 'production', family: args.family,
          conflict: false, requiresSecondApproval: false, requirements: PACKAGE4_FORMANCE_REQUIREMENTS, current: null })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queueMicrotask(() => callback(0))
      return 1
    })
    const scroll = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll })
    render(<CommercialPolicyActions environment="production" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select Tax' }))
    const heading = await screen.findByRole('heading', { name: 'Prepare Tax policy' })
    await waitFor(() => expect(document.activeElement).toBe(heading))
    expect(scroll).toHaveBeenCalledWith({ block: 'start' })
  })
})
