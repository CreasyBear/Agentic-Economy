// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { createElement, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AeFindMyBusiness } from '@/components/ae/claim/AeFindMyBusiness'
import type { FoundBusiness } from '@/components/ae/claim/AeFindMyBusiness'
import { emptyOwnerOfferingEditorValue, publishGateRefusal } from '@/components/ae/offerings/AeOwnerOfferings.exports'
import { claimFormSearchFor } from '@/components/ae/claim/AeFindMyBusiness.exports'

describe('offering requiredness is a publish gate, not a save gate', () => {
  it('lets a draft park with nothing filled in', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'draft' })).toBeUndefined()
  })

  it('lets paused and retired states save without the publish facts', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'paused' })).toBeUndefined()
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'retired' })).toBeUndefined()
  })

  it('names the first missing field when publishing', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'published' }))
      .toMatchObject({ field: 'name' })

    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'published', name: 'Burst pipe repair' }))
      .toMatchObject({ field: 'category' })

    expect(
      publishGateRefusal({
        ...emptyOwnerOfferingEditorValue,
        status: 'published',
        name: 'Burst pipe repair',
        category: 'Plumbing',
      }),
    ).toMatchObject({ field: 'summary' })
  })

  it('passes the gate once the customer-readable facts exist', () => {
    expect(
      publishGateRefusal({
        ...emptyOwnerOfferingEditorValue,
        status: 'published',
        name: 'Burst pipe repair',
        category: 'Plumbing',
        summary: 'Same day burst pipe repairs.',
      }),
    ).toBeUndefined()
  })

  it('treats whitespace as missing', () => {
    expect(publishGateRefusal({ ...emptyOwnerOfferingEditorValue, status: 'published', name: '   ' }))
      .toMatchObject({ field: 'name' })
  })
})

describe('find-my-business hands facts to the claim form', () => {
  it('carries every prefill field in the link search so nothing is retyped', () => {
    expect(
      claimFormSearchFor({
        slug: 'joondalup-emergency-plumbing',
        name: 'Joondalup Emergency Plumbing',
        category: 'Emergency plumbing',
        businessContext: { kind: 'local_human', suburb: 'Joondalup', stateTerritory: 'WA' },
      }),
    ).toEqual({
      businessContext: { kind: 'local_human', suburb: 'Joondalup', stateTerritory: 'WA' },
      businessName: 'Joondalup Emergency Plumbing',
      category: 'Emergency plumbing',
      requestedSlug: 'joondalup-emergency-plumbing',
    })
})
})

afterEach(() => {
  cleanup()
})

const foundBusiness: FoundBusiness = {
  slug: 'joondalup-emergency-plumbing',
  name: 'Joondalup Emergency Plumbing',
  category: 'Emergency plumbing',
  businessContext: { kind: 'local_human', suburb: 'Joondalup', stateTerritory: 'WA' },
}

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const claimRoute = createRoute({ getParentRoute: () => rootRoute, path: '/claim' })
  const claimFormRoute = createRoute({ getParentRoute: () => rootRoute, path: '/claim/form' })
  const routeTree = rootRoute.addChildren([claimRoute, claimFormRoute])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/claim'] }) })
  return render(createElement(RouterContextProvider, { router, children: ui }))
}

function claimFormUrl(link: HTMLElement): URL {
  const href = link.getAttribute('href')
  if (href === null) throw new Error('Expected claim form link to have an href.')
  return new URL(href, 'https://ae.example')
}

describe('find-my-business claim doors', () => {
  it.each([
    { label: 'without a source', source: undefined, expectedSource: null },
    { label: 'with the supply source', source: 'supply', expectedSource: 'supply' },
  ] as const)('keeps both claim doors $label', async ({ source, expectedSource }) => {
    renderWithRouter(createElement(AeFindMyBusiness, {
      search: vi.fn(async () => [foundBusiness]),
      onBuildFromWeb: vi.fn(),
      ...(source === undefined ? {} : { source }),
    }))

    expect(claimFormUrl(screen.getByRole('link', { name: 'My business is not listed. Start fresh.' })).searchParams.get('source'))
      .toBe(expectedSource)

    fireEvent.change(screen.getByLabelText('Your business name'), { target: { value: foundBusiness.name } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my business' }))
    const foundLink = await waitFor(() => screen.getByRole('link', { name: 'This is my business' }))
    const foundUrl = claimFormUrl(foundLink)

    expect(foundUrl.pathname).toBe('/claim/form')
    expect(foundUrl.searchParams.get('businessName')).toBe(foundBusiness.name)
    expect(foundUrl.searchParams.get('source')).toBe(expectedSource)
  })
  it('shows a lookup error and retries successfully with the same input', async () => {
    const search = vi.fn(async () => [] as readonly FoundBusiness[])
    search.mockRejectedValueOnce(new Error('lookup failed'))
    search.mockResolvedValueOnce([foundBusiness])

    renderWithRouter(createElement(AeFindMyBusiness, {
      search,
      onBuildFromWeb: vi.fn(),
    }))

    fireEvent.change(screen.getByLabelText('Your business name'), { target: { value: foundBusiness.name } })
    fireEvent.click(screen.getByRole('button', { name: 'Find my business' }))

    expect((await screen.findByRole('alert')).textContent).toBe('We couldn’t search right now. Try again.')
    expect(screen.getByDisplayValue(foundBusiness.name)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Find my business' })).toBeTruthy()
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenNthCalledWith(1, foundBusiness.name)

    fireEvent.click(screen.getByRole('button', { name: 'Find my business' }))

    expect(await screen.findByRole('link', { name: 'This is my business' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenNthCalledWith(2, foundBusiness.name)
  })

})
