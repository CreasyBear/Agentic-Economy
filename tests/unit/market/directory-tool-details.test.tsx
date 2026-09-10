/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { DirectoryToolDetails } from '@/components/ae/market/DirectoryToolDetails'
import type { SavedDirectoryTool } from '@/components/ae/market/DirectorySavedTools'

const { prepare, readDetail } = vi.hoisted(() => ({ prepare: vi.fn(), readDetail: vi.fn() }))
vi.mock('@/modules/market/x402-directory.functions', () => ({ prepareX402DirectoryResourceServer: prepare }))
vi.mock('@/modules/registry/tool-detail-route.functions', () => ({ readPublicToolDetailRouteServer: readDetail }))
const selected: SavedDirectoryTool = { entry: {
  resource: 'https://search.example.com/query', title: 'Web search', provider: 'search.example.com', description: 'Search useful sources.', protocol: 'http', metadataJson: '{}',
  prices: [{ network: 'eip155:8453', networkLabel: 'Base', scheme: 'exact', amount: '0.01 USDC' }],
  activity: { calls30d: 204, payers30d: 0 },
  input: { fields: [{ name: 'query', path: '/queryParams/query', location: 'queryParams', source: 'schema', type: 'string', required: true, description: 'Words to search for' }], schemaJson: '{"type":"object","properties":{"queryParams":{"type":"object"}}}', exampleJson: '{"queryParams":{"query":"provider wrapper"}}' },
  output: { fields: [], exampleJson: '{"results":[{"title":"Published result"}]}' },
}, search: { query: 'original search', network: 'eip155:8453', provider: 'search.example.com', maxUsdPrice: 0.02, offset: 20 } }
const found = { kind: 'found', tool: { contract: { inputJsonSchema: { type: 'object', properties: { query: { type: 'string', title: 'Search query' } }, required: ['query'] }, inputExamples: [{ input: { query: 'canonical search' } }] } } }
function show(initial: SavedDirectoryTool = selected) {
  const root = createRootRoute()
  const router = createRouter({ routeTree: root.addChildren([createRoute({ getParentRoute: () => root, path: '/market' }), createRoute({ getParentRoute: () => root, path: '/tools/$toolRef' })]), history: createMemoryHistory({ initialEntries: ['/market'] }) })
  const onSave = vi.fn(), onClose = vi.fn(), onProviderSelect = vi.fn()
  const props = { window: '30d' as const, saved: false, onSave, onClose, onCloseAutoFocus: vi.fn(), onProviderSelect }
  const view = render(<RouterContextProvider router={router}><DirectoryToolDetails {...props} selected={initial} /></RouterContextProvider>)
  return { ...view, onSave, onClose, onProviderSelect, select(next: SavedDirectoryTool) { view.rerender(<RouterContextProvider router={router}><DirectoryToolDetails {...props} selected={next} /></RouterContextProvider>) } }
}
afterEach(() => { cleanup(); vi.resetAllMocks() })
describe('directory Tool details', () => {
  it('prepares with the original search filters and passes the exact AE contract to the lazy input workspace', async () => {
    prepare.mockResolvedValue({ kind: 'ready', toolRef: 'tool:v1:search' })
    readDetail.mockResolvedValue(found)
    show()
    expect(screen.getByRole('dialog', { name: 'Web search' })).toBeTruthy()
    expect(screen.getByText('Words to search for')).toBeTruthy()
    expect(screen.getByText('204')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
    await waitFor(() => expect(readDetail).toHaveBeenCalledWith({ data: { toolRef: 'tool:v1:search' } }))
    expect(prepare).toHaveBeenCalledWith({ data: { resource: selected.entry.resource, ...selected.search } })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare request' }))
    const field = await screen.findByRole('textbox', { name: /Search query/u })
    expect((field as HTMLInputElement).value).toBe('canonical search')
    fireEvent.change(field, { target: { value: 'edited search' } })
    await waitFor(() => expect(screen.getByText('ae call \'tool:v1:search\' --input \'{"query":"edited search"}\' --json')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /^Run|Submit$/u })).toBeNull()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Contract' }))
    const listing = screen.getByText(text => text.startsWith(`${window.location.origin}/market?`))
    const url = new URL(listing.textContent!)
    expect(url.searchParams.get('resource')).toBe(selected.entry.resource)
    expect(url.searchParams.get('query')).toBe('original search')
    expect(url.searchParams.get('maxUsdPrice')).toBe('0.02')
  })
  it('ignores a canonical response from a previously selected Tool', async () => {
    prepare.mockImplementation(({ data }: { data: { resource: string } }) => Promise.resolve({ kind: 'ready', toolRef: data.resource.endsWith('/other') ? 'tool:v1:other' : 'tool:v1:search' }))
    let finishOld!: (value: unknown) => void
    readDetail.mockImplementation(({ data }: { data: { toolRef: string } }) => data.toolRef === 'tool:v1:search' ? new Promise(resolve => { finishOld = resolve }) : Promise.resolve({ ...found, tool: { contract: { ...found.tool.contract, inputExamples: [{ input: { query: 'second Tool' } }] } } }))
    const view = show()
    await waitFor(() => expect(readDetail).toHaveBeenCalledTimes(1))
    view.select({ ...selected, entry: { ...selected.entry, title: 'Other search', resource: 'https://search.example.com/other' } })
    await waitFor(() => expect(readDetail).toHaveBeenCalledTimes(2))
    await act(async () => { finishOld(found) })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare request' }))
    expect((await screen.findByRole('textbox', { name: /Search query/u }) as HTMLInputElement).value).toBe('second Tool')
    expect(screen.getByText('ae call \'tool:v1:other\' --input \'{"query":"second Tool"}\' --json')).toBeTruthy()
  })
  it('recovers from unavailable admission and still provides save and Provider navigation', async () => {
    prepare.mockResolvedValueOnce({ kind: 'unavailable', reason: 'source_unavailable' }).mockResolvedValueOnce({ kind: 'ready', toolRef: 'tool:v1:search' })
    readDetail.mockResolvedValue(found)
    const view = show()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry preparation' }))
    await screen.findByRole('link', { name: 'View input contract' })
    expect(prepare).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Save Tool' }))
    expect(view.onSave).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'search.example.com' }))
    expect(view.onProviderSelect).toHaveBeenCalledWith('search.example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(view.onClose).toHaveBeenCalledOnce()
  })
  it('withholds prepared commands when the canonical contract fails and recovers after retry', async () => {
    prepare.mockResolvedValue({ kind: 'ready', toolRef: 'tool:v1:search' })
    readDetail.mockRejectedValueOnce(new Error('Source unavailable')).mockResolvedValueOnce(found)
    show()
    await screen.findByRole('button', { name: 'Retry preparation' })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare request' }))
    await screen.findByText('Explore the input published by this Provider.')
    expect(screen.queryByRole('button', { name: 'Copy prepared call command' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry preparation' }))
    expect((await screen.findByRole('textbox', { name: /Search query/u }) as HTMLInputElement).value).toBe('canonical search')
    expect(screen.getByRole('button', { name: 'Copy prepared call command' })).toBeTruthy()
  })
  it('uses qualified safe Provider images and falls back to the actual published response on image failure', async () => {
    prepare.mockResolvedValue({ kind: 'unavailable', reason: 'source_unavailable' })
    show({ ...selected, entry: { ...selected.entry, output: { fields: [], exampleJson: '{"image_url":"https://images.example.com/preview?id=1"}' } } })
    const image = screen.getByRole('img', { name: 'Provider example output' })
    expect(image.getAttribute('src')).toBe('https://images.example.com/preview?id=1')
    fireEvent.error(image)
    expect(screen.queryByRole('img', { name: 'Provider example output' })).toBeNull()
    expect(screen.getByText('The example image is unavailable. Its published response is below.')).toBeTruthy()
    await screen.findByRole('button', { name: 'Retry preparation' })
  })
  it.each(['{"url":"https://example.com/unqualified"}', '{"image_url":"javascript:alert(1)"}', '{"image_url":"https://secret:password@example.com/a.png"}'])('does not infer image media from unsafe or unqualified values: %s', async exampleJson => {
    prepare.mockResolvedValue({ kind: 'unavailable', reason: 'source_unavailable' })
    show({ ...selected, entry: { ...selected.entry, output: { fields: [], exampleJson } } })
    expect(screen.queryByRole('img', { name: 'Provider example output' })).toBeNull()
    await screen.findByRole('button', { name: 'Retry preparation' })
  })
})

it('keeps the full first token amount and network visible when the display price is compact', async () => {
  prepare.mockResolvedValue({ kind: 'unavailable', reason: 'source_unavailable' })
  const amount = '20000 atomic units (EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)'
  const network = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'
  show({ ...selected, entry: { ...selected.entry, title: 'StableEnrich', serviceName: 'StableEnrich', description: 'Search with Exa; returns sources.', prices: [{ network, amount, scheme: 'exact' }], metadataJson: '{}' } })
  expect(screen.getByRole('dialog', { name: 'Search with Exa' })).toBeTruthy()
  expect(screen.getByText('See payment details')).toBeTruthy()
  expect(screen.getByText('Token amount')).toBeTruthy()
  expect(screen.getByText(amount)).toBeTruthy()
  expect(screen.getByText(network)).toBeTruthy()
  await screen.findByRole('button', { name: 'Retry preparation' })
})
