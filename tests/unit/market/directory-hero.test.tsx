/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DirectoryHero } from '@/components/ae/market/DirectoryHero'

afterEach(cleanup)

describe('compact Arc Market header', () => {
  it('orients the reader once and preserves the supplied catalogue controls', () => {
    render(<DirectoryHero><form aria-label="Search the Tool market"><label>Search Tools<input type="search" /></label><button type="submit">Search</button></form><a href="/t/new">Ask an Agent</a></DirectoryHero>)
    expect(screen.getAllByRole('heading')).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Tool market' })).toBeTruthy()
    expect(screen.getByText('Search for a service, compare Tools, or browse the Providers behind them.')).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: 'Search Tools' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ask an Agent' }).getAttribute('href')).toBe('/t/new')
  })

  it('uses an exact h2 when composed into a workspace page', () => {
    render(<DirectoryHero compact headingLevel={2} compactTitle="Tool market"><button type="button">Filters</button></DirectoryHero>)
    expect(screen.getByRole('heading', { level: 2, name: 'Tool market' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
  })

  it('renders without supply claims or invented starter Tools when optional discovery is absent', () => {
    render(<DirectoryHero>{null}</DirectoryHero>)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/popular|in the catalogue/i)).toBeNull()
  })
})
