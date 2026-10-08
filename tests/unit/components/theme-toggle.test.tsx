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
  delete root.dataset.appearancePreference
}

function renderThemeToggle(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

function openAppearanceMenu(): void {
  const trigger = screen.getByRole('button', { name: /appearance/i })
  fireEvent.click(trigger)
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
  it('keeps appearance usable when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage blocked') })
    renderThemeToggle()
    openAppearanceMenu()
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('T1: renders trigger with an accessible appearance label', () => {
    renderThemeToggle()

    expect(screen.getByRole('button', { name: /appearance/i })).toBeInTheDocument()
  })

  it('T2: opens a menu with Light, Dark, and System options', async () => {
    renderThemeToggle()

    openAppearanceMenu()

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })
    expect(screen.getByRole('menuitemradio', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toBeInTheDocument()
  })

  it('T3: selecting Dark updates storage and document class', async () => {
    renderThemeToggle()

    openAppearanceMenu()
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    await waitFor(() => {
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })

  it('T4: selecting Light updates storage and document class', async () => {
    document.documentElement.classList.add('dark')
    renderThemeToggle()

    openAppearanceMenu()
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Light' }))

    await waitFor(() => {
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  it('T5: selecting System updates storage and resolves document class from media', async () => {
    mockSystemPrefersDark(true)
    renderThemeToggle()

    openAppearanceMenu()
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'System' }))

    await waitFor(() => {
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })

  it('T6: trigger is a native menu button with the current appearance label', () => {
    renderThemeToggle()

    const trigger = screen.getByRole('button', { name: 'Appearance: Light' })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).toHaveAttribute('type', 'button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('T8: keyboard opens the appearance choices and Escape returns focus', async () => {
    renderThemeToggle()

    const trigger = screen.getByRole('button', { name: 'Appearance: Light' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    const darkItem = screen.getByRole('menuitemradio', { name: 'Dark' })
    expect(darkItem).toHaveAttribute('aria-checked', 'false')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('T7: radio menu items expose aria-checked on the active preference', async () => {
    renderThemeToggle()

    openAppearanceMenu()

    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    const radioItems = screen.getAllByRole('menuitemradio')
    expect(radioItems).toHaveLength(3)

    const checked = radioItems.filter(
      (item) => item.getAttribute('aria-checked') === 'true',
    )
    expect(checked).toHaveLength(1)
    expect(checked[0]).toHaveAccessibleName('Light')
  })
})
