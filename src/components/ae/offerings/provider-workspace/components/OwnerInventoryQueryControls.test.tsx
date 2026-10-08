// @vitest-environment jsdom
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerInventoryQueryControls } from './OwnerInventoryQueryControls'

afterEach(cleanup)
describe('server inventory query controls', () => {
  it('submits a whole-inventory text search in relevance order and starts a new cursor chain', () => {
    const apply = vi.fn()
    render(<OwnerInventoryQueryControls query={{ sort: 'name_asc', cursor: 'opaque-current-page' }} onApply={apply} />)
    fireEvent.change(screen.getByLabelText('Search all Tools'), { target: { value: '  weather forecast  ' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Search and sort all Provider Tools' }))
    expect(apply).toHaveBeenCalledWith({ q: 'weather forecast', sort: 'relevance' })
    expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true)
  })
  it('resets a no-match search to the first recent-tools page', () => {
    const apply = vi.fn()
    render(<OwnerInventoryQueryControls query={{ q: 'no-match', sort: 'relevance', cursor: 'opaque' }} onApply={apply} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset search' }))
    expect(apply).toHaveBeenCalledWith({ sort: 'updated_desc' })
    expect((screen.getByLabelText('Search all Tools') as HTMLInputElement).value).toBe('')
  })
  it('retains global name order when text is empty and follows a restored URL query', () => {
    const apply = vi.fn()
    const view = render(<OwnerInventoryQueryControls query={{ sort: 'name_desc', cursor: 'opaque' }} onApply={apply} />)
    fireEvent.submit(screen.getByRole('form', { name: 'Search and sort all Provider Tools' }))
    expect(apply).toHaveBeenCalledWith({ sort: 'name_desc' })
    view.rerender(<OwnerInventoryQueryControls query={{ q: 'restored-query', sort: 'relevance' }} onApply={apply} />)
    expect((screen.getByLabelText('Search all Tools') as HTMLInputElement).value).toBe('restored-query')
  })
})
