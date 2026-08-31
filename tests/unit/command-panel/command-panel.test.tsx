// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/resize-observer'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'
import {
  initialCommandPanelPages,
  popCommandPanelPage,
  pushCommandPanelPage,
  type CommandPanelStack,
} from '@/components/ae/command-panel/command-panel-state'
import {
  readRecentOperationRefs,
  rememberRecentOperationRef,
} from '@/components/ae/command-panel/recent-operations'
import {
  formatOperationAuthentication,
  formatOperationPrice,
  formatOperationReadiness,
} from '@/modules/market/operation-view-model'
import { operationDetailOutputSchema } from '@/modules/capability-supply/public'
import type {
  PublicOperationDescriptor,
} from '@/modules/capability-supply/public'
import type { PublicOperationDetailRouteResult } from '@/modules/registry/operation-detail-route.functions'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('command panel page-stack machine', () => {
  it('keeps the search root, grows inspect layers, and pops with a close request', () => {
    expect(initialCommandPanelPages).toEqual([{ kind: 'operations-search' }])

    const stacked = pushCommandPanelPage(initialCommandPanelPages, {
      kind: 'operation-inspect',
      operationRef: 'operation:v1:abc',
    })
    expect(stacked).toHaveLength(2)

    const popped = popCommandPanelPage(stacked)
    expect(popped.closeRequested).toBe(false)
    expect(popped.pages).toEqual([{ kind: 'operations-search' }])

    const closedFromRoot = popCommandPanelPage([{ kind: 'operations-search' }])
    expect(closedFromRoot.closeRequested).toBe(true)
    expect(closedFromRoot.pages).toEqual([{ kind: 'operations-search' }])
  })

  it('stops growing the deck once the depth cap is reached', () => {
    let pages: CommandPanelStack = initialCommandPanelPages
    for (let index = 0; index < 12; index += 1) {
      pages = pushCommandPanelPage(pages, { kind: 'operations-search' })
    }
    expect(pages).toHaveLength(8)
  })
})

describe('recent public Operations', () => {
  it('keeps only the five newest distinct validated public references', () => {
    const operationRefs = Array.from(
      { length: 7 },
      (_, index) => `operation:v1:${index.toString(16).repeat(64)}`,
    )
    for (const operationRef of operationRefs) rememberRecentOperationRef(operationRef)
    rememberRecentOperationRef('not-a-public-operation-ref')

    expect(readRecentOperationRefs()).toEqual(operationRefs.slice(-5).reverse())
  })
})

describe('operator command panel', () => {
  it('opens as a centered modal with cmd+k or ctrl+k and closes again with truthful aria-expanded', async () => {
    renderPanel()

    const trigger = screen.getByRole('button', { name: 'Search' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command console' })
    expect(dialog.getAttribute('data-slot')).toBe('dialog-content')
    expect(dialog.className).toContain('sm:max-w-3xl')
    expect(dialog.querySelector('[data-slot="command"]')).toBeTruthy()
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeTruthy()
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('focuses the search input when slash is pressed while open', async () => {
    renderPanel()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')

    fireEvent.keyDown(dialog, { key: '/' })
    await waitFor(() => {
      const active = document.activeElement
      expect(active instanceof HTMLInputElement && active.type === 'text').toBe(true)
      expect((active as HTMLInputElement).getAttribute('aria-label')).toBe('Search operations')
    })
  })

  it('lets the dialog primitive dismiss an outside press and restore its trigger', async () => {
    renderPanel()

    const trigger = screen.getByRole('button', { name: 'Search' })
    fireEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Command console' })).toBeTruthy()

    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    if (!(overlay instanceof HTMLElement)) throw new Error('dialog_overlay_missing')
    fireEvent.pointerDown(overlay)
    fireEvent.click(overlay)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('provides a compact root Close and touch-visible Back on inspection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('data-slot')).toBe('dialog-close')

    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    const back = await screen.findByRole('button', { name: 'Back' })
    expect(back.className).toContain('min-h-touch')
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('min-h-touch')
    const inactiveItems = Array.from(document.querySelectorAll('[data-slot="command-item"]'))
    expect(inactiveItems.length).toBeGreaterThan(0)
    expect(inactiveItems.every((item) => item.getAttribute('aria-disabled') === 'true')).toBe(true)
    fireEvent.click(back)
    const restoredInput = await screen.findByRole('combobox', { name: 'Search operations' })
    expect((restoredInput as HTMLInputElement).value).toBe('weather')
    expect(screen.getByRole('option', { name: /Weather forecast/ })).toBeTruthy()
    expect(restoredInput.hasAttribute('disabled')).toBe(false)
    await waitFor(() => expect(document.activeElement).toBe(restoredInput))

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('renders mocked catalog results, roles them, and pushes inspect on Enter', async () => {
    const searchCalls: Array<{ url: string; body: unknown }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        searchCalls.push({
          url: String(url),
          body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        })
        return jsonResponse(operationSearchPayload())
      }),
    )
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({ readDetail })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    expect(input.getAttribute('data-slot')).toBe('command-input')
    fireEvent.change(input, { target: { value: 'weather forecast' } })

    await waitFor(() => {
      expect(searchCalls.length).toBeGreaterThan(0)
      const firstCall = searchCalls[0]
      if (firstCall === undefined) throw new Error('search_call_missing')
      expect(firstCall.url.endsWith('/api/v1/market-operations/search')).toBe(true)
      expect(firstCall.body).toMatchObject({ query: 'weather forecast', limit: 12 })
    })

    const option = await screen.findByRole('option', { name: /Weather forecast/ })
    expect(option.getAttribute('data-slot')).toBe('command-item')
    expect(option.closest('[data-slot="command-group"]')).toBeTruthy()
    expect(option.getAttribute('aria-selected')).toBe('true')
    expect(option.textContent).toContain('Price on request')
    expect(option.textContent).toContain('Ready now')
    expect(option.textContent).toContain('AE account invocation')
    const listbox = screen.getByRole('listbox', { name: 'Matching operations' })
    expect(listbox.getAttribute('data-slot')).toBe('command-list')
    expect(input.getAttribute('aria-controls')).toBe(listbox.getAttribute('id'))
    expect(screen.getByText(/1 matched · showing 1/)).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(readDetail).toHaveBeenCalledWith(TEST_OPERATION_REF)

    // Inspect composes the same market formatters the catalog tiles use.
    const fixture = detailFixture()
    expect(await screen.findByText(formatOperationPrice(fixture.commercial.price))).toBeTruthy()
    expect(screen.getByText(formatOperationAuthentication(fixture.authentication))).toBeTruthy()
    expect(screen.getByText('Connection required')).toBeTruthy()
    expect(screen.queryByText(formatOperationReadiness(fixture.availability.posture))).toBeNull()
    expect(screen.getByText('Charged per call.')).toBeTruthy()
    expect(screen.getByText(/Connect an agent before/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Connect agent' }).getAttribute('href')).toBe('/for-agents')
    expect(screen.queryByRole('button', { name: 'Copy Call command' })).toBeNull()
    expect(
      screen.getByRole('link', { name: /Open full Operation details/ }).getAttribute('href'),
    ).toBe(`/operations/${encodeURIComponent(TEST_OPERATION_REF)}`)
  })

  it('opens the newly selected Operation when ArrowDown and Enter arrive in one input turn', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(twoOperationSearchPayload())))
    const readDetail = vi.fn(async (operationRef: string): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(operationRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(readDetail).toHaveBeenCalledTimes(1)
    expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF)
    expect(await screen.findByRole('link', { name: 'Open full Operation details' })).toBeTruthy()
  })

  it('delegates mounted-choice Home, End, pointer selection, and activation to cmdk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(twoOperationSearchPayload())))
    const readDetail = vi.fn(async (operationRef: string): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(operationRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    const [first, second] = await screen.findAllByRole('option')
    if (first === undefined || second === undefined) throw new Error('two_options_required')

    fireEvent.keyDown(input, { key: 'End' })
    await waitFor(() => expect(second.getAttribute('aria-selected')).toBe('true'))
    fireEvent.keyDown(input, { key: 'Home' })
    await waitFor(() => expect(first.getAttribute('aria-selected')).toBe('true'))

    fireEvent.pointerMove(second)
    await waitFor(() => expect(second.getAttribute('aria-selected')).toBe('true'))
    fireEvent.click(second)

    expect(readDetail).toHaveBeenCalledTimes(1)
    expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF)
  })

  it('keeps a selected Operation when an authoritative refresh still contains it', async () => {
    const fetchSearch = vi.fn(async () => jsonResponse(twoOperationSearchPayload()))
    vi.stubGlobal('fetch', fetchSearch)

    renderPanel({ openImmediately: true })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    const options = await screen.findAllByRole('option')
    const second = options[1]
    if (second === undefined) throw new Error('second_option_required')
    fireEvent.pointerMove(second)
    await waitFor(() => expect(second.getAttribute('aria-selected')).toBe('true'))

    fireEvent.change(input, { target: { value: 'weather forecast' } })
    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /Currency exchange rate/ }).getAttribute('aria-selected'),
      ).toBe('true')
    })
  })

  it('ignores an older search response that resolves after the current query', async () => {
    let resolveFirst: ((response: Response) => void) | undefined
    let resolveSecond: ((response: Response) => void) | undefined
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    const secondResponse = new Promise<Response>((resolve) => {
      resolveSecond = resolve
    })
    const fetchSearch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { query: string }
      return await (body.query === 'first' ? firstResponse : secondResponse)
    })
    vi.stubGlobal('fetch', fetchSearch)

    renderPanel({ openImmediately: true })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'first' } })
    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(1))
    fireEvent.change(input, { target: { value: 'second' } })
    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(2))

    if (resolveSecond === undefined) throw new Error('second_search_not_started')
    resolveSecond(jsonResponse({ ...twoOperationSearchPayload(), query: 'second' }))
    expect(await screen.findByRole('option', { name: /Currency exchange rate/ })).toBeTruthy()

    if (resolveFirst === undefined) throw new Error('first_search_not_started')
    resolveFirst(jsonResponse({ ...operationSearchPayload(), query: 'first' }))
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))
    expect(screen.getByRole('option', { name: /Currency exchange rate/ })).toBeTruthy()
  })

  it('preserves ArrowDown and Enter until deferred search results can open the second Operation', async () => {
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    const fetchSearch = vi.fn(async () => await deferredSearch)
    vi.stubGlobal('fetch', fetchSearch)
    const readDetail = vi.fn(async (operationRef: string): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(operationRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'twitter' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(readDetail).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(resolveSearch).toBeTypeOf('function'))
    if (resolveSearch === undefined) throw new Error('deferred_search_not_started')
    resolveSearch(jsonResponse(twoOperationSearchPayload()))

    await waitFor(() => {
      expect(readDetail).toHaveBeenCalledTimes(1)
      expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF)
    })
    expect(await screen.findByRole('link', { name: 'Open full Operation details' })).toBeTruthy()
  })

  it('preserves End and Enter until deferred server results can open the last Operation', async () => {
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    vi.stubGlobal('fetch', vi.fn(async () => await deferredSearch))
    const readDetail = vi.fn(async (operationRef: string): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(operationRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(input, { key: 'End' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByRole('listbox', { name: 'Matching operations' }).getAttribute('aria-busy')).toBe('true')
    if (resolveSearch === undefined) throw new Error('deferred_search_not_started')
    resolveSearch(jsonResponse(twoOperationSearchPayload()))

    await waitFor(() => expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF))
  })

  it('uses the live input query when change, ArrowDown, and Enter precede the React commit', async () => {
    rememberRecentOperationRef(RECENT_TEST_OPERATION_REF)
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    const fetchSearch = vi.fn(async () => await deferredSearch)
    vi.stubGlobal('fetch', fetchSearch)
    const readDetail = vi.fn(async (operationRef: string): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(operationRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    expect(screen.getByRole('option', { name: new RegExp(RECENT_TEST_OPERATION_REF) })).toBeTruthy()

    act(() => {
      fireEvent.change(input, { target: { value: 'twitter' } })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    expect(readDetail).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(1))
    if (resolveSearch === undefined) throw new Error('deferred_search_not_started')
    resolveSearch(jsonResponse(twoOperationSearchPayload()))

    await waitFor(() => {
      expect(readDetail).toHaveBeenCalledTimes(1)
      expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF)
    })
  })

  it('keeps final-query intent across character input commits queued in one turn', async () => {
    rememberRecentOperationRef(RECENT_TEST_OPERATION_REF)
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    const fetchSearch = vi.fn(async () => await deferredSearch)
    vi.stubGlobal('fetch', fetchSearch)
    const readDetail = vi.fn(async (operationRef: string): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(operationRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    expect(screen.getByRole('option', { name: new RegExp(RECENT_TEST_OPERATION_REF) })).toBeTruthy()

    act(() => {
      for (const value of ['t', 'tw', 'twi', 'twit', 'twitt', 'twitte', 'twitter']) {
        fireEvent.input(input, { target: { value } })
      }
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    expect(readDetail).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchSearch).toHaveBeenCalledTimes(1))
    if (resolveSearch === undefined) throw new Error('deferred_search_not_started')
    resolveSearch(jsonResponse(twoOperationSearchPayload()))

    await waitFor(() => {
      expect(readDetail).toHaveBeenCalledTimes(1)
      expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF)
    })
  })

  it('copies the public reference and ready-to-run inspect and call commands', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({
      openImmediately: true,
      readDetail,
      readBuyerCredentialPresence: async () => true,
    })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText(/single safe next step/)).toBeTruthy()
    expect(screen.getByText(formatOperationReadiness(detailFixture().availability.posture))).toBeTruthy()
    expect(screen.queryByText('Connection required')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copy Call Operation' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Connect agent' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy Operation reference' }))
    expect(writeText).toHaveBeenLastCalledWith(TEST_OPERATION_REF)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Inspect command' }))
    expect(writeText).toHaveBeenLastCalledWith(`ae inspect '${TEST_OPERATION_REF}'`)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Call Operation' }))
    expect(writeText).toHaveBeenLastCalledWith(
      `ae call '${TEST_OPERATION_REF}' --input '{"from":"USD","to":"EUR","note":"today'\\''s rate"}' --wait`,
    )
  })

  it('fails buyer-access lookup closed instead of exposing a call command', async () => {
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({
      openImmediately: true,
      readDetail,
      readBuyerCredentialPresence: async () => {
        throw new Error('buyer access unavailable')
      },
    })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByRole('link', { name: 'Connect agent' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy Call command' })).toBeNull()
  })

  it('shows up to five recently inspected public operation references before search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather forecast' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })
    await screen.findByRole('link', { name: 'Open full Operation details' })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search operations' }), {
      target: { value: '' },
    })
    const recent = await screen.findByRole('option', { name: new RegExp(TEST_OPERATION_REF) })
    expect(recent.textContent).toContain(TEST_OPERATION_REF)
    expect(readRecentOperationRefs()).toContain(TEST_OPERATION_REF)
    expect(window.localStorage.getItem('ae:command-panel:recent-operation-refs:v1')).not.toContain('weather forecast')
  })

  it('does not offer a call command without a published input example and guides setup when uncallable', async () => {
    const fixture = detailFixture()
    const { inputExamples: _inputExamples, ...contractWithoutExamples } = fixture.contract
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: {
        ...fixture,
        contract: contractWithoutExamples,
        availability: { posture: 'unavailable', reason: 'setup_required' },
        navigation: [],
      },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText(/not currently callable/iu)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Find callable alternatives' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Continue supplier setup' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy Call command' })).toBeNull()
  })

  it('gives an unavailable Operation one primary route back to current supply', async () => {
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'unavailable',
      schemaVersion: 'registry-operations:v1',
      operationRef: TEST_OPERATION_REF,
      reason: 'temporarily_unavailable',
      navigation: [],
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    const action = await screen.findByRole('link', { name: 'Browse current Operations' })
    expect(action.getAttribute('href')).toBe('/market?window=30d#operations')
  })

  it('turns a rejected detail read into the same actionable unavailable state', async () => {
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => {
      throw new Error('network unavailable')
    })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText('Operation unavailable')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse current Operations' })).toBeTruthy()
    expect(screen.queryByText('Loading operation…')).toBeNull()
  })

  it('does not label an invoke-less routeable descriptor ready', async () => {
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: {
        ...detailFixture(),
        availability: { posture: 'routeable' },
        navigation: [],
      },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText('Setup required')).toBeTruthy()
    expect(screen.queryByText('Ready now')).toBeNull()
    expect(screen.getByRole('link', { name: 'Find callable alternatives' })).toBeTruthy()
  })

  it('pops one inspect layer per Escape before closing, then survives ⌘K flicker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(operationSearchPayload())),
    )
    let detailReads = 0
    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => {
      detailReads += 1
      return { kind: 'found', schemaVersion: 'registry-operations:v1' as const, operation: detailFixture() }
    })

    renderPanel({ readDetail })
    const trigger = screen.getByRole('button', { name: 'Search' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })
    await screen.findByRole('option', { name: /Weather forecast/ })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/Open full Operation details/)).toBeTruthy()
    expect(detailReads).toBe(1)

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText(/Open full Operation details/)).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
      expect((screen.getByRole('combobox', { name: 'Search operations' }) as HTMLInputElement).value).toBe('')
    })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await screen.findByRole('dialog')
    expect(detailReads).toBe(1)
  })

  it('surfaces honest failure copy when the catalog cannot answer', async () => {
    const fetchSearch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(operationSearchPayload()))
    vi.stubGlobal('fetch', fetchSearch)

    renderPanel({ openImmediately: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })

    expect(await screen.findByText(/temporarily unavailable/)).toBeTruthy()
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.getAttribute('data-slot')).toBe('button')
    fireEvent.click(retry)
    expect(await screen.findByRole('option', { name: /Weather forecast/ })).toBeTruthy()
    expect(fetchSearch).toHaveBeenCalledTimes(2)
  })

  it('turns a no-match result into clear and browse continuations', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      ...operationSearchPayload(),
      items: [],
      matchedCount: 0,
    })))

    const readDetail = vi.fn(async (): Promise<PublicOperationDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation: detailFixture(),
    }))
    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'teleport a sandwich' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText(/No Operations matched/)).toBeTruthy()
    expect(readDetail).not.toHaveBeenCalled()
    const browse = screen.getByRole('link', { name: 'Browse current Operations' })
    expect(browse.getAttribute('href')).toBe('/market?window=30d#operations')
    const clear = screen.getByRole('button', { name: 'Clear search' })
    expect(clear.getAttribute('data-slot')).toBe('button')
    fireEvent.click(clear)
    expect((input as HTMLInputElement).value).toBe('')
  })

  it('rejects the retired keyless authentication discriminator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(operationSearchPayload({ kind: 'keyless' }))),
    )

    renderPanel({ openImmediately: true })
    const input = await screen.findByRole('combobox', { name: 'Search operations' })
    fireEvent.change(input, { target: { value: 'weather' } })

    expect(await screen.findByText(/catalog returned something unreadable/)).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Weather forecast/ })).toBeNull()
  })
})

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** Shared canonical-ref constant valid under the published operationRef regex. */
const TEST_OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const SECOND_TEST_OPERATION_REF = `operation:v1:${'b'.repeat(64)}`
const RECENT_TEST_OPERATION_REF = `operation:v1:${'c'.repeat(64)}`

function operationSearchPayload(authentication: unknown = { kind: 'ae_api_key' }) {
  return {
    kind: 'ok',
    schemaVersion: 'registry-operations:v1',
    query: 'weather forecast',
    items: [
      {
        operationRef: TEST_OPERATION_REF,
        capabilityId: 'get.open-meteo.forecast',
        title: 'Weather forecast',
        summary: 'Forecast by coordinates.',
        supplier: { name: 'Open-Meteo', slug: 'open-meteo' },
        price: { kind: 'on_request' },
        authentication,
        availability: { posture: 'routeable' },
        navigation: [],
      },
    ],
    matchedCount: 1,
    ranking: [],
    pagination: { limit: 12, hasMore: false },
    navigation: [],
  }
}

function twoOperationSearchPayload() {
  const first = operationSearchPayload()
  const firstItem = first.items[0]
  if (firstItem === undefined) throw new Error('operation_search_fixture_missing')
  return {
    ...first,
    items: [
      firstItem,
      {
        ...firstItem,
        operationRef: SECOND_TEST_OPERATION_REF,
        capabilityId: 'convert.currency.exchange-rate',
        title: 'Currency exchange rate',
        summary: 'Current exchange rate for a currency pair.',
      },
    ],
    matchedCount: 2,
  }
}

/** Runtime-validated through the published detail contract — no casts. */
export function detailFixture(operationRef: string = TEST_OPERATION_REF): PublicOperationDescriptor {
  const parsed = operationDetailOutputSchema.parse({
    kind: 'found',
    schemaVersion: 'registry-operations:v1',
    operation: {
      operationRef,
      operationId: 'op_test_a',
      callVia: '/api/v1/operations/call',
      paymentLane: 'brokered',
      contract: {
        capabilityId: 'fx.convert',
        version: 1,
        inputJsonSchema: {},
        outputJsonSchema: {},
        customerAnnotations: [],
        inputExamples: [{
          label: 'Currency pair',
          input: { from: 'USD', to: 'EUR', note: "today's rate" },
        }],
      },
      business: { businessId: 'b_acme', slug: 'acme-tools', name: 'Acme Tools' },
      offering: {
        offeringRef: 'offering:v1:x',
        revision: 2,
        label: 'Currency conversion',
        summary: 'Convert between currencies.',
      },
      summary: 'Convert USD to EUR at live rates.',
      commercial: {
        price: { kind: 'fixed', amount: { currency: 'USD', units: '25', exponent: 2 } },
        materialTerms: [{ label: 'Terms note', value: 'Charged per call.' }],
        relationship: { kind: 'direct', summary: 'Served by Acme.' },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      cancellation: { kind: 'adapter_managed' },
      recovery: { idempotency: 'required', recovery: 'retry_safe' },
      authentication: { kind: 'x402' },
      transport: { method: 'POST', requestTimeoutMs: 30000 },
      provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
      availability: { posture: 'routeable' },
      navigation: [{
        relation: 'invoke',
        pathTemplate: '/api/v1/operations/call',
        method: 'POST',
        actionId: 'agentic-economy.operation-invoke',
        authentication: 'required',
        surfaces: ['http', 'cli', 'mcp', 'chat'],
      }],
    },
  })
  if (parsed.kind !== 'found') throw new Error('fixture_parse_wrong_branch')
  return parsed.operation
}

function PanelHarness(props: {
  initialOpen: boolean
  readDetail?: (operationRef: string) => Promise<PublicOperationDetailRouteResult>
  readBuyerCredentialPresence?: () => Promise<boolean>
}): ReactElement {
  const [open, setOpen] = useState(props.initialOpen)
  return (
    <CommandPanelProvider
      open={open}
      onOpenChange={setOpen}
      {...(props.readDetail === undefined ? {} : { readDetail: props.readDetail })}
      {...(props.readBuyerCredentialPresence === undefined
        ? {}
        : { readBuyerCredentialPresence: props.readBuyerCredentialPresence })}
    >
      <AeCommandPanel />
    </CommandPanelProvider>
  )
}

function renderPanel(options: {
  readDetail?: (operationRef: string) => Promise<PublicOperationDetailRouteResult>
  readBuyerCredentialPresence?: () => Promise<boolean>
  openImmediately?: boolean
} = {}): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/$operationRef' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <PanelHarness
        initialOpen={options.openImmediately === true}
        {...(options.readDetail === undefined ? {} : { readDetail: options.readDetail })}
        {...(options.readBuyerCredentialPresence === undefined
          ? {}
          : { readBuyerCredentialPresence: options.readBuyerCredentialPresence })}
      />
    </RouterContextProvider>,
  )
}
