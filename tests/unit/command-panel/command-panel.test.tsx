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
  readRecentToolRefs,
  rememberRecentToolRef,
} from '@/components/ae/command-panel/recent-tools'
import {
  formatToolAuthentication,
  formatToolPrice,
  formatToolReadiness,
} from '@/modules/market/tool-view-model'
import { toolDetailOutputSchema } from '@/modules/capability-supply/public'
import type {
  PublicToolDescriptor,
} from '@/modules/capability-supply/public'
import type { PublicToolDetailRouteResult } from '@/modules/registry/tool-detail-route.functions'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('command panel page-stack machine', () => {
  it('keeps the search root, grows inspect layers, and pops with a close request', () => {
    expect(initialCommandPanelPages).toEqual([{ kind: 'tools-search' }])

    const stacked = pushCommandPanelPage(initialCommandPanelPages, {
      kind: 'tool-detail',
      toolRef: 'operation:v1:abc',
    })
    expect(stacked).toHaveLength(2)

    const popped = popCommandPanelPage(stacked)
    expect(popped.closeRequested).toBe(false)
    expect(popped.pages).toEqual([{ kind: 'tools-search' }])

    const closedFromRoot = popCommandPanelPage([{ kind: 'tools-search' }])
    expect(closedFromRoot.closeRequested).toBe(true)
    expect(closedFromRoot.pages).toEqual([{ kind: 'tools-search' }])
  })

  it('stops growing the deck once the depth cap is reached', () => {
    let pages: CommandPanelStack = initialCommandPanelPages
    for (let index = 0; index < 12; index += 1) {
      pages = pushCommandPanelPage(pages, { kind: 'tools-search' })
    }
    expect(pages).toHaveLength(8)
  })
})

describe('recent public Tools', () => {
  it('keeps only the five newest distinct validated public references', () => {
    const toolRefs = Array.from(
      { length: 7 },
      (_, index) => `operation:v1:${index.toString(16).repeat(64)}`,
    )
    for (const toolRef of toolRefs) rememberRecentToolRef(toolRef)
    rememberRecentToolRef('not-a-public-tool-ref')

    expect(readRecentToolRefs()).toEqual(toolRefs.slice(-5).reverse())
  })
})

describe('operator command panel', () => {
  it('opens as a centered modal with cmd+k or ctrl+k and closes again with truthful aria-expanded', async () => {
    renderPanel()

    const trigger = screen.getByRole('button', { name: 'Find Tools' })
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

  it('honors the advertised slash entry shortcut and ignores repeat, composition, and text entry', async () => {
    renderPanel()

    fireEvent.keyDown(window, { key: '/', repeat: true })
    fireEvent.keyDown(window, { key: '/', isComposing: true })
    fireEvent.keyDown(window, { key: 'k', metaKey: true, repeat: true })
    fireEvent.keyDown(window, { key: 'k', metaKey: true, isComposing: true })
    expect(screen.queryByRole('dialog')).toBeNull()

    const editor = document.createElement('input')
    document.body.append(editor)
    fireEvent.keyDown(editor, { key: '/' })
    expect(screen.queryByRole('dialog')).toBeNull()
    editor.remove()

    fireEvent.keyDown(window, { key: '/' })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    expect(document.activeElement).toBe(input)
  })

  it('focuses the search input when slash is pressed while open', async () => {
    renderPanel()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog')

    fireEvent.keyDown(dialog, { key: '/' })
    await waitFor(() => {
      const active = document.activeElement
      expect(active instanceof HTMLInputElement && active.type === 'text').toBe(true)
      expect((active as HTMLInputElement).getAttribute('aria-label')).toBe('Search Tools')
    })
  })

  it('lets the dialog primitive dismiss an outside press and restore its trigger', async () => {
    renderPanel()

    const trigger = screen.getByRole('button', { name: 'Find Tools' })
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
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    expect(screen.getByRole('button', { name: 'Close' }).getAttribute('data-slot')).toBe('dialog-close')

    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    const back = await screen.findByRole('button', { name: 'Back' })
    expect(back.className).toContain('min-h-touch')
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('min-h-touch')
    const inactiveItems = Array.from(document.querySelectorAll('[data-slot="command-item"]'))
    expect(inactiveItems.length).toBeGreaterThan(0)
    expect(inactiveItems.every((item) => item.getAttribute('aria-disabled') === 'true')).toBe(true)
    fireEvent.click(back)
    const restoredInput = await screen.findByRole('combobox', { name: 'Search Tools' })
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
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(),
    }))

    renderPanel({ readDetail })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    expect(input.getAttribute('data-slot')).toBe('command-input')
    fireEvent.change(input, { target: { value: 'weather forecast' } })

    await waitFor(() => {
      expect(searchCalls.length).toBeGreaterThan(0)
      const firstCall = searchCalls[0]
      if (firstCall === undefined) throw new Error('search_call_missing')
      expect(firstCall.url.endsWith('/api/v1/market-tools/search')).toBe(true)
      expect(firstCall.body).toMatchObject({ query: 'weather forecast', limit: 12 })
    })

    const option = await screen.findByRole('option', { name: /Weather forecast/ })
    expect(option.getAttribute('data-slot')).toBe('command-item')
    expect(option.closest('[data-slot="command-group"]')).toBeTruthy()
    expect(option.getAttribute('aria-selected')).toBe('true')
    expect(option.textContent).toContain('Price confirmed at inspection')
    expect(option.textContent).toContain('Operational')
    const listbox = screen.getByRole('listbox', { name: 'Matching Tools' })
    expect(listbox.getAttribute('data-slot')).toBe('command-list')
    expect(input.getAttribute('aria-controls')).toBe(listbox.getAttribute('id'))
    expect(screen.getByText(/1 matched · showing 1/)).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(readDetail).toHaveBeenCalledWith(TEST_OPERATION_REF)

    // Inspect composes the same market formatters the catalog tiles use.
    const fixture = detailFixture()
    expect(await screen.findByText(formatToolPrice(fixture.commercial.price))).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('region', { name: 'Tool details' }))
    expect(screen.getByText(formatToolAuthentication(fixture.authentication))).toBeTruthy()
    expect(screen.getByText(formatToolReadiness(fixture.availability.posture))).toBeTruthy()
    expect(screen.getByText('Charged per call.')).toBeTruthy()
    expect(screen.getByText(/Paste this reference into your existing agent client/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Copy Tool reference' }).length).toBeGreaterThan(0)
    expect(
      screen.getByRole('link', { name: /Open full Tool details/ }).getAttribute('href'),
    ).toBe(`/tools/${encodeURIComponent(TEST_OPERATION_REF)}`)
  })

  it('exits and resets the modal after navigation to full Tool details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(),
    }))
    const router = renderPanel({ openImmediately: true, readDetail })

    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), {
      key: 'Enter',
    })
    fireEvent.click(await screen.findByRole('link', { name: 'Open full Tool details' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/tools/${encodeURIComponent(TEST_OPERATION_REF)}`,
      )
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Find Tools' }))
    const reopenedInput = await screen.findByRole<HTMLInputElement>('combobox', {
      name: 'Search Tools',
    })
    expect(reopenedInput.value).toBe('')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('opens the newly selected Tool when ArrowDown and Enter arrive in one input turn', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(twoOperationSearchPayload())))
    const readDetail = vi.fn(async (toolRef: string): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(toolRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(2)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(readDetail).toHaveBeenCalledTimes(1)
    expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF)
    expect(await screen.findByRole('link', { name: 'Open full Tool details' })).toBeTruthy()
  })

  it('delegates mounted-choice Home, End, pointer selection, and activation to cmdk', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(twoOperationSearchPayload())))
    const readDetail = vi.fn(async (toolRef: string): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(toolRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
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

  it('keeps a selected Tool when an authoritative refresh still contains it', async () => {
    const fetchSearch = vi.fn(async () => jsonResponse(twoOperationSearchPayload()))
    vi.stubGlobal('fetch', fetchSearch)

    renderPanel({ openImmediately: true })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
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
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
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

  it('preserves ArrowDown and Enter until deferred search results can open the second Tool', async () => {
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    const fetchSearch = vi.fn(async () => await deferredSearch)
    vi.stubGlobal('fetch', fetchSearch)
    const readDetail = vi.fn(async (toolRef: string): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(toolRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
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
    expect(await screen.findByRole('link', { name: 'Open full Tool details' })).toBeTruthy()
  })

  it('preserves End and Enter until deferred server results can open the last Tool', async () => {
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    vi.stubGlobal('fetch', vi.fn(async () => await deferredSearch))
    const readDetail = vi.fn(async (toolRef: string): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(toolRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(input, { key: 'End' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByRole('listbox', { name: 'Matching Tools' }).getAttribute('aria-busy')).toBe('true')
    if (resolveSearch === undefined) throw new Error('deferred_search_not_started')
    resolveSearch(jsonResponse(twoOperationSearchPayload()))

    await waitFor(() => expect(readDetail).toHaveBeenCalledWith(SECOND_TEST_OPERATION_REF))
  })

  it('uses the live input query when change, ArrowDown, and Enter precede the React commit', async () => {
    rememberRecentToolRef(RECENT_TEST_OPERATION_REF)
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    const fetchSearch = vi.fn(async () => await deferredSearch)
    vi.stubGlobal('fetch', fetchSearch)
    const readDetail = vi.fn(async (toolRef: string): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(toolRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
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
    rememberRecentToolRef(RECENT_TEST_OPERATION_REF)
    let resolveSearch: ((response: Response) => void) | undefined
    const deferredSearch = new Promise<Response>((resolve) => {
      resolveSearch = resolve
    })
    const fetchSearch = vi.fn(async () => await deferredSearch)
    vi.stubGlobal('fetch', fetchSearch)
    const readDetail = vi.fn(async (toolRef: string): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(toolRef),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
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

  it('hands the public Tool reference to the existing agent client without browser readiness claims', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText(/Paste this reference into your existing agent client/)).toBeTruthy()
    expect(screen.getByText(formatToolReadiness(detailFixture().availability.posture))).toBeTruthy()
    expect(screen.queryByText('Connection required')).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Copy Tool reference' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Connect agent' })).toBeNull()
    expect(screen.queryByText(/ae call/)).toBeNull()
    expect(screen.queryByText(/ae inspect/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Copy Tool reference' }))[0]!)
    expect(writeText).toHaveBeenLastCalledWith(TEST_OPERATION_REF)
  })

  it('shows up to five recently inspected public Tool references before search', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(),
    }))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather forecast' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })
    await screen.findByRole('link', { name: 'Open full Tool details' })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search Tools' }), {
      target: { value: '' },
    })
    const recent = await screen.findByRole('option', { name: new RegExp(TEST_OPERATION_REF) })
    expect(recent.textContent).toContain(TEST_OPERATION_REF)
    expect(readRecentToolRefs()).toContain(TEST_OPERATION_REF)
    expect(window.localStorage.getItem('ae:command-panel:recent-tool-refs:v1')).not.toContain('weather forecast')
  })

  it('does not offer a call command without a published input example and guides setup when uncallable', async () => {
    const fixture = detailFixture()
    const { inputExamples: _inputExamples, ...contractWithoutExamples } = fixture.contract
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: {
        ...fixture,
        contract: contractWithoutExamples,
        availability: { posture: 'unavailable', reason: 'setup_required' },
        navigation: [],
      },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect((await screen.findAllByText(/not operational/iu)).length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Find Tool alternatives' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Continue supplier setup' })).toBeNull()
    expect(screen.queryByText(/ae call/)).toBeNull()
  })

  it('gives an unavailable Tool one primary route back to current supply', async () => {
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'unavailable',
      schemaVersion: 'registry-tools:v3',
      toolRef: TEST_OPERATION_REF,
      reason: 'temporarily_unavailable',
      navigation: [],
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    const router = renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    const action = await screen.findByRole('link', { name: 'Browse current Tools' })
    expect(action.getAttribute('href')).toBe('/market#tools')
    fireEvent.click(action)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/market')
      expect(router.state.location.search).toEqual({})
      expect(router.state.location.hash).toBe('tools')
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('turns a rejected detail read into the same actionable unavailable state', async () => {
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => {
      throw new Error('network unavailable')
    })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText('Tool unavailable')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Browse current Tools' })).toBeTruthy()
    expect(screen.queryByText('Loading Tool…')).toBeNull()
  })

  it('does not label a call-less routeable descriptor ready', async () => {
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: {
        ...detailFixture(),
        availability: { posture: 'routeable' },
        navigation: [],
      },
    }))
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(operationSearchPayload())))

    renderPanel({ openImmediately: true, readDetail })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    fireEvent.keyDown(await screen.findByRole('option', { name: /Weather forecast/ }), { key: 'Enter' })

    expect(await screen.findByText('Setup required')).toBeTruthy()
    expect(screen.queryByText('Ready now')).toBeNull()
    expect(screen.getByRole('link', { name: 'Find Tool alternatives' })).toBeTruthy()
  })

  it('pops one inspect layer per Escape before closing, then survives ⌘K flicker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(operationSearchPayload())),
    )
    let detailReads = 0
    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => {
      detailReads += 1
      return { kind: 'found', schemaVersion: 'registry-tools:v3' as const, tool: detailFixture() }
    })

    renderPanel({ readDetail })
    const trigger = screen.getByRole('button', { name: 'Find Tools' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'weather' } })
    await screen.findByRole('option', { name: /Weather forecast/ })

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/Open full Tool details/)).toBeTruthy()
    expect(detailReads).toBe(1)

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText(/Open full Tool details/)).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
    })

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy()
      expect((screen.getByRole('combobox', { name: 'Search Tools' }) as HTMLInputElement).value).toBe('')
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
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
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
      kind: 'no_candidates',
      items: [],
      count: 0,
      note: 'No operational Tools matched this search.',
    })))

    const readDetail = vi.fn(async (): Promise<PublicToolDetailRouteResult> => ({
      kind: 'found',
      schemaVersion: 'registry-tools:v3',
      tool: detailFixture(),
    }))
    renderPanel({ openImmediately: true, readDetail })
    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'teleport a sandwich' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(await screen.findByText(/No Tools matched/)).toBeTruthy()
    expect(readDetail).not.toHaveBeenCalled()
    const browse = screen.getByRole('link', { name: 'Browse current Tools' })
    expect(browse.getAttribute('href')).toBe('/market#tools')
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
    const input = await screen.findByRole('combobox', { name: 'Search Tools' })
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

/** Shared canonical-ref constant valid under the published Tool reference regex. */
const TEST_OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const SECOND_TEST_OPERATION_REF = `operation:v1:${'b'.repeat(64)}`
const RECENT_TEST_OPERATION_REF = `operation:v1:${'c'.repeat(64)}`

function operationSearchPayload(authentication?: unknown) {
  return {
    kind: 'ok',
    schemaVersion: 'registry-tools:v3',
    query: 'weather forecast',
    items: [
      {
        toolRef: TEST_OPERATION_REF,
        capabilityId: 'get.open-meteo.forecast',
        title: 'Weather forecast',
        description: 'Forecast by coordinates.',
        provider: { name: 'Open-Meteo', slug: 'open-meteo' },
        priceLabel: 'Price confirmed at inspection',
        healthStatus: 'operational',
        listingTier: 'reviewed',
        ...(authentication === undefined ? {} : { authentication }),
      },
    ],
    count: 1,
    pagination: { limit: 12, hasMore: false },
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
        toolRef: SECOND_TEST_OPERATION_REF,
        capabilityId: 'convert.currency.exchange-rate',
        title: 'Currency exchange rate',
        description: 'Current exchange rate for a currency pair.',
      },
    ],
    count: 2,
  }
}

/** Runtime-validated through the published detail contract — no casts. */
export function detailFixture(toolRef: string = TEST_OPERATION_REF): PublicToolDescriptor {
  const parsed = toolDetailOutputSchema.parse({
    kind: 'found',
    schemaVersion: 'registry-tools:v3',
    tool: {
      toolRef,
      toolId: 'op_test_a',
      callVia: '/api/v1/tools/call',
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
      listingTier: 'reviewed',
      availability: { posture: 'routeable' },
      navigation: [{
        relation: 'call',
        pathTemplate: '/api/v1/tools/call',
        method: 'POST',
        actionId: 'tool.call',
        authentication: 'required',
        surfaces: ['http', 'cli', 'mcp', 'chat'],
      }],
    },
  })
  if (parsed.kind !== 'found') throw new Error('fixture_parse_wrong_branch')
  return parsed.tool
}

function PanelHarness(props: {
  initialOpen: boolean
  readDetail?: (toolRef: string) => Promise<PublicToolDetailRouteResult>
}): ReactElement {
  const [open, setOpen] = useState(props.initialOpen)
  return (
    <CommandPanelProvider
      open={open}
      onOpenChange={setOpen}
      {...(props.readDetail === undefined ? {} : { readDetail: props.readDetail })}
    >
      <AeCommandPanel />
    </CommandPanelProvider>
  )
}

function renderPanel(options: {
  readDetail?: (toolRef: string) => Promise<PublicToolDetailRouteResult>
  openImmediately?: boolean
} = {}) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/for-agents' }),
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
      />
    </RouterContextProvider>,
  )

  return router
}
