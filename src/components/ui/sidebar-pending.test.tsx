/**
 * @vitest-environment jsdom
 */
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import '../../../tests/setup/jsdom-platform'

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useViewportKind: () => 'unknown',
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('Sidebar unknown viewport', () => {
  it('reserves width without mounting the desktop rail or a closed sheet', async () => {
    const { Sidebar, SidebarProvider } = await import('@/components/ui/sidebar')
    const { container } = render(
      <SidebarProvider>
        <Sidebar>
          <div>nav</div>
        </Sidebar>
      </SidebarProvider>,
    )

    expect(container.querySelector('[data-slot="sidebar-pending"]')).not.toBeNull()
    expect(container.querySelector('[data-slot="sidebar"]')).toBeNull()
    expect(container.querySelector('[data-slot="sidebar-container"]')).toBeNull()
  })
})
