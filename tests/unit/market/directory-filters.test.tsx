/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryFilters } from '@/components/ae/market/DirectoryFilters'
afterEach(cleanup)
it('stages edits, refuses invalid filters, and applies canonical values', () => {
  const apply = vi.fn()
  render(<DirectoryFilters search={{ provider: 'example.com' }} onApply={apply} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filters (1)' }))
  fireEvent.change(screen.getByLabelText('Provider hostname'), { target: { value: 'https://bad.example/path' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show results' }))
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(apply).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Provider hostname'), { target: { value: 'API.EXAMPLE.COM' } })
  fireEvent.change(screen.getByLabelText('Maximum price (USD)'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Show results' }))
  expect(apply).toHaveBeenCalledWith({ provider: 'api.example.com', maxUsdPrice: 0 })
})
it('discards cancelled edits and clears only after applying', () => {
  const apply = vi.fn()
  render(<DirectoryFilters search={{ network: 'base' }} onApply={apply} />)
  fireEvent.click(screen.getByRole('button', { name: 'Filters (1)' }))
  fireEvent.change(screen.getByLabelText('Network'), { target: { value: 'solana' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.click(screen.getByRole('button', { name: 'Filters (1)' }))
  expect((screen.getByLabelText('Network') as HTMLInputElement).value).toBe('base')
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  expect(apply).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Show results' }))
  expect(apply).toHaveBeenCalledWith({})
})

it('returns keyboard focus to the filter trigger after dismissal', async () => {
  render(<DirectoryFilters search={{}} onApply={vi.fn()} />)
  const trigger = screen.getByRole('button', { name: 'Filters' })
  trigger.focus()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(document.activeElement).toBe(trigger))
})
