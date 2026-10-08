/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { ProviderFacetPicker } from '@/components/ae/market/ProviderFacetPicker'
import type { X402DirectoryProvidersPage } from '@/modules/market/x402-directory-catalogue'

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/modules/market/x402-directory-index.functions', () => ({ readX402DirectoryProvidersServer: mocks.read }))

afterEach(() => { cleanup(); vi.useRealTimers(); mocks.read.mockReset() })

function page(hosts: readonly string[], cursor?: string): X402DirectoryProvidersPage {
  return {
    kind: 'ok', page: hosts.map(key => ({ key, label: key, count: 2 })),
    continueCursor: cursor ?? '', isDone: cursor === undefined,
    coverage: { source: 'coinbase', generation: 'picker-test', indexedTotal: 100, reportedTotal: 100,
      reportedTotalAtStart: 100, sourceChangedDuringScan: false, duplicateObservations: 0,
      pagesFetched: 1, startedAt: 1, completedAt: 2, completeness: 'completed_observed_scan' },
  }
}

async function settleLookup() {
  await act(async () => { vi.advanceTimersByTime(200) })
}

it('finds Hosts beyond the twelve suggestions, preserves the latest lookup, and resets selection, clear and reopen with the real Arc combobox', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  const change = vi.fn()
  const initialHosts = Array.from({ length: 12 }, (_, index) => `host-${index}.example`)
  let resolveObsolete!: (result: X402DirectoryProvidersPage) => void
  const obsolete = new Promise<X402DirectoryProvidersPage>(resolve => { resolveObsolete = resolve })
  mocks.read.mockImplementation(({ data }: { data: { providerPrefix?: string; providerCursor?: string } }) => {
    if (data.providerCursor === 'whole-next') return Promise.resolve(page(['z-late.example']))
    if (data.providerPrefix === 'old') return obsolete
    if (data.providerPrefix === 'alpha') return Promise.resolve(page(['alpha.example']))
    if (data.providerPrefix === 'z') return Promise.resolve(page(['z-late.example']))
    if (data.providerPrefix === 'reopen') return Promise.resolve(page(['reopen.example']))
    return Promise.resolve(page(initialHosts, 'whole-next'))
  })
  function Picker() {
    const [selected, setSelected] = useState<string>()
    return <ProviderFacetPicker selected={selected} onChange={host => { change(host); setSelected(host) }} />
  }
  render(<Picker />)
  const input = screen.getByRole('combobox', { name: 'Directory Hosts' }) as HTMLInputElement
  expect(mocks.read).not.toHaveBeenCalled()
  act(() => input.focus())
  await settleLookup()
  expect(screen.getAllByRole('option')).toHaveLength(12)
  fireEvent.click(screen.getByRole('button', { name: 'Load more matching Hosts' }))
  await act(async () => {})
  expect(mocks.read).toHaveBeenLastCalledWith({ data: { providerCursor: 'whole-next' } })
  expect(screen.getByRole('option', { name: 'z-late.example' })).toBeTruthy()

  fireEvent.input(input, { target: { value: 'old' } })
  await settleLookup()
  expect(mocks.read).toHaveBeenLastCalledWith({ data: { providerPrefix: 'old' } })
  fireEvent.input(input, { target: { value: 'alpha' } })
  expect(screen.queryByRole('option', { name: 'z-late.example' })).toBeNull()
  await settleLookup()
  expect(screen.getByRole('option', { name: 'alpha.example' })).toBeTruthy()
  await act(async () => { resolveObsolete(page(['old.example'])) })
  expect(screen.getByRole('option', { name: 'alpha.example' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'old.example' })).toBeNull()

  fireEvent.click(screen.getByRole('option', { name: 'alpha.example' }))
  expect(change).toHaveBeenLastCalledWith('alpha.example')
  await settleLookup()
  expect(mocks.read).toHaveBeenLastCalledWith({ data: {} })
  fireEvent.click(input)
  fireEvent.input(input, { target: { value: 'z' } })
  await settleLookup()
  expect(screen.getByRole('option', { name: 'z-late.example' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
  expect(change).toHaveBeenLastCalledWith(undefined)
  await settleLookup()
  expect(input.value).toBe('')
  expect(mocks.read).toHaveBeenLastCalledWith({ data: {} })
  expect(screen.getByRole('option', { name: 'host-0.example' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'z-late.example' })).toBeNull()

  fireEvent.input(input, { target: { value: 'reopen' } })
  await settleLookup()
  expect(screen.getByRole('option', { name: 'reopen.example' })).toBeTruthy()
  fireEvent.keyDown(input, { key: 'Escape' })
  await settleLookup()
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input.value).toBe('')
  expect(screen.getByRole('option', { name: 'host-0.example' })).toBeTruthy()
  expect(screen.queryByRole('option', { name: 'reopen.example' })).toBeNull()
  expect(change.mock.calls).toEqual([['alpha.example'], [undefined]])
})
