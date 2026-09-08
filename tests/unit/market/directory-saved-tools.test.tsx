// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DIRECTORY_SAVED_TOOLS_STORAGE_KEY, DirectorySavedToolsProvider, useDirectorySavedTools, type SavedDirectoryTool,
} from '@/components/ae/market/DirectorySavedTools'

function tool(id: number): SavedDirectoryTool {
  return { entry: {
    resource: `https://example.com/weather/${id}`, title: `Weather ${id}`, description: 'Forecast for a location.',
    protocol: 'http', method: 'GET', provider: 'example.com', metadataJson: '{"description":"Public directory metadata"}',
    prices: [{ amount: '0.01 USDC', network: 'eip155:8453', scheme: 'exact' }],
    tags: ['weather'], provenance: { directory: 'Coinbase Bazaar', metadata: 'provider_declared', updatedAt: '2026-09-08T10:00:00Z' },
  }, search: { query: 'weather forecast', offset: 0, network: 'eip155:8453', provider: 'example.com', maxUsdPrice: 1 } }
}

function Controls({ selected = tool(1) }: Readonly<{ selected?: SavedDirectoryTool }>) {
  const { savedTools, toggleSavedTool, isSaved, hydrated, storageState, saveError } = useDirectorySavedTools()
  return <>
    <button type="button" disabled={!hydrated} onClick={() => toggleSavedTool(selected)}>{isSaved(selected.entry.resource) ? 'Remove Tool' : 'Save Tool'}</button>
    <p>{savedTools.length} saved Tools</p>
    <p>{storageState}</p>
    {saveError === undefined ? null : <p role="alert">{saveError}</p>}
    <output aria-label="Saved snapshot">{JSON.stringify(savedTools)}</output>
  </>
}
function show(selected?: SavedDirectoryTool) {
  return render(<StrictMode><DirectorySavedToolsProvider><Controls {...(selected === undefined ? {} : { selected })} /></DirectorySavedToolsProvider></StrictMode>)
}
function persist(items: readonly SavedDirectoryTool[]) {
  window.localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, JSON.stringify({ version: 1, items }))
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })

describe('browser-local saved directory Tools', () => {
  it('hydrates the saved source snapshot in Strict Mode without overwriting storage on mount', async () => {
    persist([tool(1)])
    const original = window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)
    const write = vi.spyOn(Storage.prototype, 'setItem')
    show()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Tool' })).toBeTruthy())
    expect(screen.getByText('1 saved Tools')).toBeTruthy()
    expect(write).not.toHaveBeenCalled()
    expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe(original)
    expect(JSON.parse(screen.getByLabelText('Saved snapshot').textContent!)).toEqual([tool(1)])
  })

  it('saves, reloads and removes the exact endpoint with its discovery context', async () => {
    const first = show()
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('1 saved Tools')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!)).toEqual({ version: 1, items: [tool(1)] })
    first.unmount()
    show()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Tool' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tool' }))
    expect(screen.getByText('0 saved Tools')).toBeTruthy()
    expect(JSON.parse(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!)).toEqual({ version: 1, items: [] })
  })

  it.each(['{broken', JSON.stringify({ version: 2, items: [tool(2)] })])('preserves unreadable storage through session saves and removals: %s', async (original) => {
    window.localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, original)
    show()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be loaded'))
    expect(screen.getByText('session')).toBeTruthy()
    expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe(original)
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('1 saved Tools')).toBeTruthy()
    expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe(original)
    expect(screen.getByText('session')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tool' }))
    expect(screen.getByText('0 saved Tools')).toBeTruthy()
    expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe(original)
  })

  it('restores persistence only after a valid external storage change', async () => {
    window.localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, '{broken')
    show()
    persist([tool(2)])
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(JSON.parse(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!).items).toEqual([tool(2)])
    window.dispatchEvent(new StorageEvent('storage', { key: DIRECTORY_SAVED_TOOLS_STORAGE_KEY }))
    await waitFor(() => expect(screen.getByText('browser')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(JSON.parse(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!).items).toEqual([tool(2), tool(1)])
  })

  it('preserves another tab’s saves even before its storage event arrives', () => {
    show()
    persist([tool(2)])
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(JSON.parse(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!).items).toEqual([tool(2), tool(1)])
  })

  it.each([true, false])('preserves the visible toggle intent if another tab already applied it: saved=%s', (saved) => {
    persist(saved ? [tool(1)] : [])
    show()
    persist(saved ? [tool(2)] : [tool(2), tool(1)])
    fireEvent.click(screen.getByRole('button', { name: saved ? 'Remove Tool' : 'Save Tool' }))
    expect(JSON.parse(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!).items).toEqual(saved ? [tool(2)] : [tool(2), tool(1)])
  })

  it('preserves newly corrupt data discovered during a save', () => {
    show()
    window.localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, '{broken')
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('1 saved Tools')).toBeTruthy()
    expect(screen.getByText('session')).toBeTruthy()
    expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe('{broken')
  })

  it('continues in memory when storage cannot be read or written, and supports removal', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError') })
    show()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('1 saved Tools')).toBeTruthy()
    expect(screen.getByText('session')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('session only')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tool' }))
    expect(screen.getByText('0 saved Tools')).toBeTruthy()
  })

  it('retains session changes after a write failure while leaving the stored document unchanged', () => {
    persist([tool(2)])
    const original = window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('2 saved Tools')).toBeTruthy()
    expect(screen.getByText('session')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tool' }))
    expect(screen.getByText('1 saved Tools')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('2 saved Tools')).toBeTruthy()
    expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe(original)
  })

  it('discards unrelated runtime properties instead of persisting credentials or Call inputs', () => {
    const selected = tool(1)
    show({ entry: { ...selected.entry, accessToken: 'DO_NOT_STORE_SECRET' }, search: { ...selected.search, input: { private: 'DO_NOT_STORE_INPUT' }, window: '30d' } } as SavedDirectoryTool)
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    const stored = window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!
    expect(stored).not.toMatch(/DO_NOT_STORE|accessToken|"input"|"window"/u)
    expect(JSON.parse(stored)).toEqual({ version: 1, items: [selected] })
  })

  it('does not silently evict saved Tools when the 100-Tool limit is reached', () => {
    persist(Array.from({ length: 100 }, (_, index) => tool(index + 2)))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('100 saved Tools')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('up to 100 Tools')
    expect(JSON.parse(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)!).items).toHaveLength(100)
  })

  it('rejects a save that would exceed the bounded byte envelope without changing existing saves', () => {
    const largeTools = Array.from({ length: 17 }, (_, index) => {
      const selected = tool(index + 2)
      return { ...selected, entry: { ...selected.entry, metadataJson: ' '.repeat(120000) } }
    })
    persist(largeTools)
    const original = window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)
    const selected = tool(1)
    show({ ...selected, entry: { ...selected.entry, metadataJson: ' '.repeat(128000) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(screen.getByText('17 saved Tools')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('size limit')
    expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe(original)
  })

  it('refreshes saved membership when another browser tab changes the same key', async () => {
    show()
    persist([tool(1)])
    window.dispatchEvent(new StorageEvent('storage', { key: DIRECTORY_SAVED_TOOLS_STORAGE_KEY }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove Tool' })).toBeTruthy())
    persist([])
    window.dispatchEvent(new StorageEvent('storage', { key: DIRECTORY_SAVED_TOOLS_STORAGE_KEY }))
    await waitFor(() => expect(screen.getByText('0 saved Tools')).toBeTruthy())
  })
})

it('reloads rich service evidence, schemas and exact token prices without stripping fields', async () => {
  const rich: SavedDirectoryTool = { ...tool(1), entry: {
    ...tool(1).entry, serviceName: 'Weather API', iconUrl: 'https://cdn.example.com/weather.png', skillUrl: 'https://example.com/SKILL.md', category: 'weather',
    input: { type: 'json', schemaJson: '{"type":"object","properties":{"city":{"type":"string"}}}', exampleJson: '{"city":"Perth"}', fields: [{ name: 'city', path: 'city', location: 'body', source: 'schema', type: 'string', required: true, description: 'The city', enumValues: ['"Perth"'], defaultJson: '"Perth"', exampleJson: '"Perth"', constraints: ['minLength: 1'] }] },
    output: { type: 'json', fields: [], schemaOmitted: true, exampleOmitted: true, fieldsTruncated: true },
    prices: [{ amount: '0.000001 USDC', network: 'eip155:8453', scheme: 'exact', symbol: 'USDC', asset: 'token-address', decimalAmount: '0.000001' }],
  } }
  const first = show(rich)
  fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
  first.unmount()
  show(rich)
  await waitFor(() => expect(JSON.parse(screen.getByLabelText('Saved snapshot').textContent!)).toEqual([rich]))
})

it('refuses corrupted rich evidence on reload without rewriting the saved document', async () => {
  const corrupt = { ...tool(1), entry: { ...tool(1).entry, input: { fields: [], schemaJson: '{invalid' } } }
  const original = JSON.stringify({ version: 1, items: [corrupt] })
  window.localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, original)
  show()
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be loaded'))
  expect(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY)).toBe(original)
  expect(screen.getByText('session')).toBeTruthy()
})
