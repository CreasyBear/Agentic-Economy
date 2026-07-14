// @vitest-environment jsdom

import { useMemo, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

describe('operator shell nested chrome', () => {
  it('replaces actions, breadcrumbs, and badges when nested route chrome changes', async () => {
    render(<OperatorShellHarness />)

    expect(await screen.findByText('Action one')).toBeTruthy()
    expect(screen.getAllByText('First crumb').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Update chrome' }))

    expect(await screen.findByText('Action two')).toBeTruthy()
    expect(screen.queryByText('Action one')).toBeNull()
    expect(screen.getAllByText('Second crumb').length).toBeGreaterThan(0)
    expect(screen.queryByText('First crumb')).toBeNull()
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
  })
})

function OperatorShellHarness() {
  const [version, setVersion] = useState<'one' | 'two'>('one')
  const actions = useMemo(() => <button type="button">Action {version}</button>, [version])
  const breadcrumbs = useMemo(() => [
    { label: version === 'one' ? 'First crumb' : 'Second crumb', href: `/admin/${version}` },
  ], [version])
  const navBadges = useMemo(() => ({ '/admin/inquiries': version === 'one' ? 2 : 5 }), [version])

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Outer shell"
      description="Outer shell description"
      currentPath="/admin"
    >
      <button type="button" onClick={() => setVersion('two')}>Update chrome</button>
      <AeOperatorShell
        operatorRole="admin"
        title="Nested shell"
        description="Nested shell description"
        currentPath="/admin/inquiries"
        actions={actions}
        breadcrumbs={breadcrumbs}
        navBadges={navBadges}
      >
        <div>Nested content</div>
      </AeOperatorShell>
    </AeOperatorShell>
  )
}
