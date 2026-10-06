// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AeRecordPageHeader as PageHeader } from '@/components/ae/shared/record-page-header/AeRecordPageHeader'

afterEach(cleanup)

describe('AE record header', () => {
  it('preserves exact record identity, native breadcrumb destinations and the current crumb', () => {
    const reference = `provider:${'a'.repeat(180)}`
    render(<PageHeader title={`Provider ${reference}`} description="Current provider evidence"
      breadcrumbs={[
        { id: 'admin', label: 'Admin', renderLink: ({ children, ...props }) => <a href="/admin" {...props}>{children}</a> },
        { id: reference, label: reference },
      ]}
      detail={<span>{reference}</span>}
    />)
    expect(screen.getAllByRole('heading', { level: 1 }).map((node) => node.textContent)).toEqual([`Provider ${reference}`])
    const navigation = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(within(navigation).getByRole('link', { name: 'Admin' }).getAttribute('href')).toBe('/admin')
    expect(within(navigation).getByText(reference).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('Current provider evidence')).toBeTruthy()
  })

  it('renders only supplied status and guarded actions without simulated success or side effects', () => {
    const suppress = vi.fn()
    const view = render(<PageHeader title="Provider one" description="Evidence" breadcrumbs={[]}
      actions={<><span>Under review</span><button type="button" onClick={suppress}>Suppress Provider</button></>}
    />)
    expect(suppress).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Suppress Provider' }))
    expect(suppress).toHaveBeenCalledOnce()
    view.rerender(<PageHeader title="Provider one" description="Evidence" breadcrumbs={[]} actions={<span>Suppressed</span>} />)
    expect(screen.getByText('Suppressed')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Suppress Provider' })).toBeNull()
    expect(screen.queryByText('Under review')).toBeNull()
  })
})
