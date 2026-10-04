/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { useProviderCataloguePages } from '@/components/ae/market/useProviderCataloguePages'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { X402DirectoryCatalogue, X402DirectoryCatalogueInput } from '@/modules/market/x402-directory-catalogue'

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@/modules/market/x402-directory-index.functions', () => ({ readX402DirectoryCatalogueServer: mocks.read }))

afterEach(() => { cleanup(); mocks.read.mockReset() })

const filters: X402DirectoryCatalogueInput = {}

function tool(provider: string, sequence = 0): X402DirectoryEntry {
  return {
    provider,
    resource: `https://${provider}/tool-${sequence}`,
    title: `Tool ${sequence} from ${provider}`,
    description: '',
    protocol: 'http',
    prices: [],
    metadataJson: '{}',
  }
}

function catalogue(providers: readonly string[], indexCursor: string | undefined, isDone: boolean): X402DirectoryCatalogue {
  return {
    kind: 'ok',
    source: 'index',
    page: { kind: 'ok', items: providers.map((provider, index) => tool(provider, index)), offset: 0, limit: 24 },
    searchMethod: 'native_index',
    ...(indexCursor === undefined ? {} : { indexCursor }),
    isDone,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

async function expectIdle(result: { current: { status: string } }) {
  await waitFor(() => expect(result.current.status).toBe('idle'))
}

async function expectPage(result: { current: { items: readonly X402DirectoryEntry[]; pageNumber: number; status: string } }, pageNumber: number, providers: readonly string[]) {
  await waitFor(() => {
    expect(result.current.status).toBe('idle')
    expect(result.current.pageNumber).toBe(pageNumber)
    expect(result.current.items.map(item => item.provider)).toEqual(providers)
  })
}

describe('provider catalogue page cache', () => {
  it('returns an empty idle result when enabled without a catalogue', () => {
    const hook = renderHook(() => useProviderCataloguePages(true, undefined, filters, 1))
    expect(hook.result.current).toMatchObject({ items: [], isDone: true, status: 'idle', pageNumber: 0 })
    expect(mocks.read).not.toHaveBeenCalled()
  })

  it('reuses a completed cursor-filled page after disabling on another catalogue', async () => {
    const firstHosts = ['host-0.example', ...Array.from({ length: 11 }, (_, index) => `host-${index + 1}.example`)]
    const source = catalogue([firstHosts[0]!], 'cursor-first', false)
    const other = catalogue(['other.example'], undefined, true)
    mocks.read.mockResolvedValue(catalogue(firstHosts.slice(1), 'cursor-second', false))

    const hook = renderHook(({ enabled, currentCatalogue }) => useProviderCataloguePages(enabled, currentCatalogue, filters, 1), {
      initialProps: { enabled: true, currentCatalogue: source },
    })
    await expectIdle(hook.result)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(firstHosts)
    expect(mocks.read).toHaveBeenCalledTimes(1)

    hook.rerender({ enabled: false, currentCatalogue: other })
    hook.rerender({ enabled: true, currentCatalogue: source })
    await expectIdle(hook.result)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(firstHosts)
    expect(mocks.read).toHaveBeenCalledTimes(1)
  })

  it('keeps completed page two while disabled and uses both cached pages without reading again', async () => {
    const firstHosts = ['host-0.example', ...Array.from({ length: 11 }, (_, index) => `host-${index + 1}.example`)]
    const secondHosts = ['host-12.example', 'host-13.example']
    const source = catalogue([firstHosts[0]!], 'cursor-first', false)
    mocks.read
      .mockResolvedValueOnce(catalogue(firstHosts.slice(1), 'cursor-second', false))
      .mockResolvedValueOnce(catalogue(secondHosts, undefined, true))

    const hook = renderHook(({ enabled, currentCatalogue, requestedPage }) => useProviderCataloguePages(enabled, currentCatalogue, filters, requestedPage), {
      initialProps: { enabled: true, currentCatalogue: source, requestedPage: 1 },
    })
    await expectIdle(hook.result)
    await act(async () => { await hook.result.current.loadNextPage() })
    await expectIdle(hook.result)
    expect(hook.result.current.pageNumber).toBe(2)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(secondHosts)
    expect(mocks.read).toHaveBeenCalledTimes(2)

    hook.rerender({ enabled: false, currentCatalogue: source, requestedPage: 1 })
    hook.rerender({ enabled: true, currentCatalogue: source, requestedPage: 1 })
    await expectPage(hook.result, 1, firstHosts)
    await act(async () => { await hook.result.current.loadNextPage() })
    await expectIdle(hook.result)
    expect(hook.result.current.pageNumber).toBe(2)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(secondHosts)
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('resets and fills when the catalogue object changes', async () => {
    const firstHosts = ['first-0.example', ...Array.from({ length: 11 }, (_, index) => `first-${index + 1}.example`)]
    const replacementHosts = ['replacement-0.example', ...Array.from({ length: 11 }, (_, index) => `replacement-${index + 1}.example`)]
    const first = catalogue([firstHosts[0]!], 'first-cursor', false)
    const replacement = catalogue([replacementHosts[0]!], 'replacement-cursor', false)
    mocks.read
      .mockResolvedValueOnce(catalogue(firstHosts.slice(1), 'first-next', false))
      .mockResolvedValueOnce(catalogue(replacementHosts.slice(1), 'replacement-next', false))

    const hook = renderHook(({ currentCatalogue }) => useProviderCataloguePages(true, currentCatalogue, filters, 1), {
      initialProps: { currentCatalogue: first },
    })
    await expectIdle(hook.result)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(firstHosts)

    hook.rerender({ currentCatalogue: replacement })
    await expectIdle(hook.result)
    expect(hook.result.current.pageNumber).toBe(1)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(replacementHosts)
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('ignores a manual page response after disabling and restores the last completed page', async () => {
    const firstHosts = ['host-0.example', ...Array.from({ length: 11 }, (_, index) => `host-${index + 1}.example`)]
    const secondHosts = ['host-12.example', 'host-13.example']
    const source = catalogue([firstHosts[0]!], 'cursor-first', false)
    const nextPage = deferred<X402DirectoryCatalogue>()
    mocks.read.mockResolvedValueOnce(catalogue(firstHosts.slice(1), 'cursor-second', false)).mockReturnValueOnce(nextPage.promise)

    const hook = renderHook(({ enabled }) => useProviderCataloguePages(enabled, source, filters, 1), {
      initialProps: { enabled: true },
    })
    await expectIdle(hook.result)
    let pending = Promise.resolve()
    act(() => { pending = hook.result.current.loadNextPage() })
    await waitFor(() => expect(hook.result.current.status).toBe('loading'))
    hook.rerender({ enabled: false })
    await expectIdle(hook.result)

    await act(async () => { nextPage.resolve(catalogue(secondHosts, undefined, true)); await pending })
    expect(hook.result.current.items).toEqual([])
    expect(hook.result.current.pageNumber).toBe(0)

    hook.rerender({ enabled: true })
    await expectPage(hook.result, 1, firstHosts)
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('ignores an old source response after a replacement catalogue starts filling', async () => {
    const oldHosts = ['old-0.example', ...Array.from({ length: 11 }, (_, index) => `old-${index + 1}.example`)]
    const currentHosts = ['current-0.example', ...Array.from({ length: 11 }, (_, index) => `current-${index + 1}.example`)]
    const oldSource = catalogue(['old-0.example'], 'old-cursor', false)
    const currentSource = catalogue(['current-0.example'], 'current-cursor', false)
    const oldRequest = deferred<X402DirectoryCatalogue>()
    mocks.read.mockReturnValueOnce(oldRequest.promise).mockResolvedValueOnce(catalogue(currentHosts.slice(1), 'current-next', false))

    const hook = renderHook(({ currentCatalogue }) => useProviderCataloguePages(true, currentCatalogue, filters, 1), {
      initialProps: { currentCatalogue: oldSource },
    })
    await waitFor(() => expect(hook.result.current.status).toBe('loading'))
    hook.rerender({ currentCatalogue: currentSource })
    await expectIdle(hook.result)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(currentHosts)

    await act(async () => {
      oldRequest.resolve(catalogue(oldHosts.slice(1), 'old-next', false))
      await oldRequest.promise
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(hook.result.current.status).toBe('idle')
    expect(hook.result.current.items.map(item => item.provider)).toEqual(currentHosts)
    expect(mocks.read).toHaveBeenCalledTimes(2)
  })

  it('retries failures without caching partial or failed pages and keeps completed rows', async () => {
    const firstHosts = ['host-0.example', ...Array.from({ length: 11 }, (_, index) => `host-${index + 1}.example`)]
    const secondHosts = ['host-12.example', 'host-13.example']
    const source = catalogue([firstHosts[0]!], 'cursor-first', false)
    mocks.read
      .mockRejectedValueOnce(new Error('initial page unavailable'))
      .mockResolvedValueOnce(catalogue(firstHosts.slice(1), 'cursor-second', false))
      .mockRejectedValueOnce(new Error('next page unavailable'))
      .mockResolvedValueOnce(catalogue(secondHosts, undefined, true))

    const hook = renderHook(({ enabled }) => useProviderCataloguePages(enabled, source, filters, 1), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(hook.result.current.status).toBe('failed'))
    expect(hook.result.current.items.map(item => item.provider)).toEqual([firstHosts[0]])
    expect(mocks.read).toHaveBeenCalledTimes(1)

    hook.rerender({ enabled: false })
    hook.rerender({ enabled: true })
    await expectPage(hook.result, 1, firstHosts)
    expect(mocks.read).toHaveBeenCalledTimes(2)

    await act(async () => { await hook.result.current.loadNextPage() })
    await waitFor(() => expect(hook.result.current.status).toBe('failed'))
    expect(hook.result.current.pageNumber).toBe(1)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(firstHosts)
    expect(mocks.read).toHaveBeenCalledTimes(3)

    hook.rerender({ enabled: false })
    hook.rerender({ enabled: true })
    await expectPage(hook.result, 1, firstHosts)
    expect(mocks.read).toHaveBeenCalledTimes(3)

    await act(async () => { await hook.result.current.loadNextPage() })
    await expectIdle(hook.result)
    expect(hook.result.current.pageNumber).toBe(2)
    expect(hook.result.current.items.map(item => item.provider)).toEqual(secondHosts)
    expect(mocks.read).toHaveBeenCalledTimes(4)
  })
})
