// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectorySavedToolsProvider, useDirectorySavedTools } from '@/components/ae/market/DirectorySavedTools'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { toSavedDirectoryRowModel } from '@/modules/market/directory-card.view-model'
import type { SavedToolListItem, SavedToolSaveInput } from '@/modules/market/saved-tools.contracts'

const auth = vi.hoisted(() => ({ userId: 'alice' as string | null }))
const list = vi.hoisted(() => vi.fn())
const save = vi.hoisted(() => vi.fn())
const remove = vi.hoisted(() => vi.fn())
vi.mock('@clerk/tanstack-react-start', () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: auth.userId !== null, userId: auth.userId }) }))
vi.mock('@/modules/market/market.functions', () => ({ listSavedToolsForOwner: list, saveToolForOwner: save, removeToolForOwner: remove }))

const ref = `operation:v1:${'a'.repeat(64)}`
const resource = 'https://example.com/weather'
const compactId = `registry:${canonicalDigest({ source: 'coinbase', resource }).slice(7)}`
const entry = { resource, title: 'Current weather feed', description: 'Current provider description', provider: 'example.com', protocol: 'http', prices: [{ network: 'eip155:8453', scheme: 'exact', amount: '0.02 USDC', symbol: 'USDC', decimalAmount: '0.02' }], metadataJson: '{}', audEstimate: 'A$0.02' }
const savedByOwner = new Map<string, SavedToolListItem[]>()
const current = () => savedByOwner.get(auth.userId ?? '') ?? []

function Controls() {
  const saved = useDirectorySavedTools()
  return <>
    <p role="status">{saved.status}</p>
    <p>Items: {saved.savedTools.length}</p>
    {saved.savedTools.map(item => <div key={item.identity.kind === 'ae_callable' ? item.identity.toolRef : item.identity.resource}>
      <span>{toSavedDirectoryRowModel(item).title} · {toSavedDirectoryRowModel(item).price}</span>
      <button type="button" onClick={() => saved.toggleIdentity(item.identity)}>Remove saved Tool</button>
    </div>)}
    <button type="button" onClick={() => saved.toggleIdentity({ kind: 'ae_callable', toolRef: ref })}>Toggle admitted</button>
    <button type="button" onClick={() => saved.toggleIdentity({ kind: 'external_listing', id: compactId })}>Toggle Bazaar</button>
    <span>Admitted saved: {String(saved.isSavedIdentity({ kind: 'ae_callable', toolRef: ref }))}</span>
    <span>Bazaar saved: {String(saved.isSavedIdentity({ kind: 'external_listing', id: compactId }))}</span>
    {saved.saveError && <p role="alert">{saved.saveError}</p>}
  </>
}

function show() { return render(<StrictMode><DirectorySavedToolsProvider><Controls /></DirectorySavedToolsProvider></StrictMode>) }

beforeEach(() => {
  auth.userId = 'alice'
  savedByOwner.clear()
  list.mockImplementation(async () => ({ kind: 'available', items: [...current()] }))
  save.mockImplementation(async ({ data }: { data: SavedToolSaveInput }) => {
    const identity = data.kind === 'ae_callable' ? data : 'id' in data ? { kind: 'external_listing' as const, resource } : data
    if (!auth.userId) return { kind: 'refused', code: 'unauthenticated' }
    if (!current().some(item => JSON.stringify(item.identity) === JSON.stringify(identity))) {
      savedByOwner.set(auth.userId, [...current(), { identity, createdAt: 1, detail: identity.kind === 'external_listing' ? { kind: 'found', entry } : { kind: 'not_found' } }])
    }
    return { kind: 'saved', identity, createdAt: 1 }
  })
  remove.mockImplementation(async ({ data }: { data: SavedToolListItem['identity'] }) => {
    if (!auth.userId) return { kind: 'error', code: 'unauthenticated' }
    savedByOwner.set(auth.userId, current().filter(item => JSON.stringify(item.identity) !== JSON.stringify(data)))
    return { kind: 'removed' }
  })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('account-bound Saved Tools', () => {
  it('revisits an admitted Tool from another browser and removes it from the same account', async () => {
    const first = show()
    await screen.findByText('ready')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle admitted' }))
    await waitFor(() => expect(screen.getByText('Admitted saved: true')).toBeTruthy())
    expect(save).toHaveBeenCalledWith({ data: { kind: 'ae_callable', toolRef: ref } })
    first.unmount()
    show()
    await waitFor(() => expect(screen.getByText('Admitted saved: true')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved Tool' }))
    await waitFor(() => expect(screen.getByText('Admitted saved: false')).toBeTruthy())
    expect(remove).toHaveBeenCalledWith({ data: { kind: 'ae_callable', toolRef: ref } })
  })

  it('resolves compact Bazaar identity to a durable resource, shows current AUD, and remains removable when detail disappears', async () => {
    const first = show()
    await screen.findByText('ready')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Bazaar' }))
    await waitFor(() => expect(screen.getByText('Bazaar saved: true')).toBeTruthy())
    expect(screen.getByText('Current weather feed · A$0.02')).toBeTruthy()
    expect(save).toHaveBeenCalledWith({ data: { kind: 'external_listing', id: compactId } })
    first.unmount()
    savedByOwner.set('alice', [{ identity: { kind: 'external_listing', resource }, createdAt: 1, detail: { kind: 'not_found' } }])
    show()
    await screen.findByText(/Tool no longer available/)
    fireEvent.click(screen.getByRole('button', { name: 'Remove saved Tool' }))
    await waitFor(() => expect(screen.getByText('Bazaar saved: false')).toBeTruthy())
    expect(remove).toHaveBeenCalledWith({ data: { kind: 'external_listing', resource } })
  })

  it('never exposes one buyer’s collection after switching account or signing out', async () => {
    savedByOwner.set('alice', [{ identity: { kind: 'external_listing', resource }, createdAt: 1, detail: { kind: 'found', entry } }])
    const first = show()
    await waitFor(() => expect(screen.getByText('Bazaar saved: true')).toBeTruthy())
    first.unmount()
    auth.userId = 'bob'
    const second = show()
    await waitFor(() => expect(screen.getByText('Items: 0')).toBeTruthy())
    expect(screen.getByText('Bazaar saved: false')).toBeTruthy()
    second.unmount()
    auth.userId = null
    show()
    expect(screen.getByText('signed_out')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle admitted' }))
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps a failed owner write unsaved and permits an explicit retry', async () => {
    save.mockRejectedValueOnce(new Error('network unavailable'))
    show()
    await screen.findByText('ready')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle admitted' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Your saved tools didn’t change. Try again.')
    expect(screen.getByText('Admitted saved: false')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle admitted' }))
    await waitFor(() => expect(screen.getByText('Admitted saved: true')).toBeTruthy())
  })
})
