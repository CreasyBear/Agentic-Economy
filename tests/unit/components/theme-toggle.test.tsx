/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeToggle } from '@/components/ae/layout/ThemeToggle'
import { ThemeProvider } from '@/components/ae/theme/ThemeProvider'
import '../../setup/jsdom-platform'

const THEME_STORAGE_KEY = 'ae-theme'

function resetDocumentTheme(): void {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.style.colorScheme = ''
}

function renderThemeToggle(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

function mockSystemPrefersDark(prefersDark: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: prefersDark && query.includes('prefers-color-scheme: dark'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  resetDocumentTheme()
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  resetDocumentTheme()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('ThemeToggle', () => {
  it('T1: renders trigger with an accessible appearance label', () => {
    renderThemeToggle()

    expect(screen.getByRole('button', { name: /appearance/i })).toBeInTheDocument()
  })

  it('T2: opens a menu with Light, Dark, and System options', async () => {
    renderThemeToggle()

    fireEvent.click(screen.getByRole('button', { name: /appearance/i }))

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
    expect(screen.getByRole('menuitem', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'System' })).toBeInTheDocument()
  })

  it('T3: selecting Dark updates storage and document class', async () => {
    renderThemeToggle()

    fireEvent.click(screen.getByRole('button', { name: /appearance/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Dark' }))

    await waitFor(() => {
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })

  it('T4: selecting Light updates storage and document class', async () => {
    document.documentElement.classList.add('dark')
    renderThemeToggle()

    fireEvent.click(screen.getByRole('button', { name: /appearance/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Light' }))

    await waitFor(() => {
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  it('T5: selecting System updates storage and resolves document class from media', async () => {
    mockSystemPrefersDark(true)
    renderThemeToggle()

    fireEvent.click(screen.getByRole('button', { name: /appearance/i }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'System' }))

    await waitFor(() => {
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })
})
