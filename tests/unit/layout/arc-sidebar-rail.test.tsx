// @vitest-environment jsdom
import { useEffect } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { SidebarRail, SidebarRailNavigation, type SidebarRailGroup } from '@/components/arc/blocks/sidebar-rail/sidebar-rail'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

const groups: readonly SidebarRailGroup[] = [{
  id: 'workspace', label: 'Workspace', context: <span>Live workspace</span>,
  items: ['Market', 'Settings'].map((label, index) => ({
    id: label, label, icon: <svg aria-hidden="true" />, active: index === 0,
    renderLink: ({ children, onClick, ...props }) => <a href={index === 0 ? '/market' : '/owner/settings'}
      {...props} onClick={event => { event.preventDefault(); onClick() }}>{children}</a>,
  })),
}]

function frame(enabled = true, content = <div>Routed page</div>) {
  return <SidebarRail enabled={enabled} brand={<a href="/">AE home</a>}
    header={trigger => <header>{trigger}<span>Persistent header</span></header>}
    navigation={(collapsed, onNavigate) => <SidebarRailNavigation groups={groups} collapsed={collapsed} onNavigate={onNavigate} />}
  >{content}</SidebarRail>
}

describe('Arc app navigation frame', () => {
  it('keeps native destination names when collapsed and derives current state only from supplied records', () => {
    render(frame())
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    const nav = screen.getByRole('navigation', { name: 'App navigation' })
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/owner/settings')
    expect(screen.queryByText('Live workspace')).toBeNull()
    fireEvent.click(within(nav).getByRole('link', { name: 'Settings' }))
    expect(within(nav).getByRole('link', { name: 'Market' }).getAttribute('aria-current')).toBe('page')
    expect(within(nav).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByText('Live workspace')).toBeTruthy()
  })

  it('preserves the routed subtree and header while authentication changes layout eligibility', () => {
    const mounted = vi.fn()
    const unmounted = vi.fn()
    function RoutedPage() {
      useEffect(() => { mounted(); return unmounted }, [])
      return <input aria-label="Unsaved draft" defaultValue="original" />
    }
    const content = <RoutedPage />
    const view = render(frame(false, content))
    const input = screen.getByRole('textbox', { name: 'Unsaved draft' })
    const header = screen.getByText('Persistent header')
    fireEvent.change(input, { target: { value: 'unsaved input' } })
    view.rerender(frame(true, content))
    view.rerender(frame(false, content))
    expect(screen.getByRole('textbox', { name: 'Unsaved draft' })).toBe(input)
    expect((input as HTMLInputElement).value).toBe('unsaved input')
    expect(screen.getByText('Persistent header')).toBe(header)
    expect(mounted).toHaveBeenCalledOnce()
    expect(unmounted).not.toHaveBeenCalled()
    expect(screen.queryByRole('navigation', { name: 'App navigation' })).toBeNull()
    expect(document.querySelector('[data-enabled]')).toBeNull()
  })

  it('opens a named compact Drawer and restores focus after Escape and native destination selection', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0, y: 0, width: 380, height: 800, top: 0, left: 0, right: 380, bottom: 800, toJSON: () => ({}),
    }))
    render(frame())
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    trigger.focus()
    fireEvent.click(trigger)
    let drawer = await screen.findByRole('dialog', { name: 'App navigation' })
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true))
    expect(within(drawer).getByRole('button', { name: 'Close navigation' })).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'App navigation' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    fireEvent.click(trigger)
    drawer = await screen.findByRole('dialog', { name: 'App navigation' })
    fireEvent.click(within(drawer).getByRole('link', { name: 'Settings' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'App navigation' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(screen.getByText('Routed page')).toBeTruthy()
  })
})
