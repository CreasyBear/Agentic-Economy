/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyAppearance,
  getThemeScript,
  parseStoredAppearance,
  resolveAppearance,
} from '@/lib/theme/theme-mode'
import '../../setup/jsdom-platform'

const THEME_STORAGE_KEY = 'ae-theme'

function resetDocumentTheme(): void {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.style.colorScheme = ''
}

beforeEach(() => {
  resetDocumentTheme()
  localStorage.clear()
})

afterEach(() => {
  resetDocumentTheme()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('parseStoredAppearance', () => {
  it('M1: returns exact preference for light, dark, and system', () => {
    expect(parseStoredAppearance('light')).toBe('light')
    expect(parseStoredAppearance('dark')).toBe('dark')
    expect(parseStoredAppearance('system')).toBe('system')
  })

  it('M2: defaults to system for null, empty, wrong case, and invalid values', () => {
    expect(parseStoredAppearance(null)).toBe('system')
    expect(parseStoredAppearance('')).toBe('system')
    expect(parseStoredAppearance('Dark')).toBe('system')
    expect(parseStoredAppearance('invalid')).toBe('system')
  })
})

describe('resolveAppearance', () => {
  it('M3: resolves light preference to light regardless of system preference', () => {
    expect(resolveAppearance('light', true)).toBe('light')
    expect(resolveAppearance('light', false)).toBe('light')
  })

  it('M4: resolves dark preference to dark regardless of system preference', () => {
    expect(resolveAppearance('dark', true)).toBe('dark')
    expect(resolveAppearance('dark', false)).toBe('dark')
  })

  it('M5: resolves system preference from prefers-dark flag', () => {
    expect(resolveAppearance('system', true)).toBe('dark')
    expect(resolveAppearance('system', false)).toBe('light')
  })
})

describe('applyAppearance', () => {
  it('M6: applies dark class, color scheme, and storage', () => {
    applyAppearance('dark')

    const root = document.documentElement
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)
    expect(root.style.colorScheme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('M7: applies light class, color scheme, and storage', () => {
    applyAppearance('light')

    const root = document.documentElement
    expect(root.classList.contains('light')).toBe(true)
    expect(root.classList.contains('dark')).toBe(false)
    expect(root.style.colorScheme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('M8: applies system preference using matchMedia dark mode', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    applyAppearance('system')

    const root = document.documentElement
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })

  it('M9: calling applyAppearance twice keeps a single dark class and valid storage', () => {
    applyAppearance('dark')
    applyAppearance('dark')

    const root = document.documentElement
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)
    expect([...root.classList].filter((name) => name === 'dark')).toHaveLength(1)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('M10: still applies classes when localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage quota exceeded')
    })

    applyAppearance('dark')

    const root = document.documentElement
    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('light')).toBe(false)
    expect(root.style.colorScheme).toBe('dark')
  })
})

describe('getThemeScript', () => {
  it('M11: returns inline script that reads storage and sets classList and colorScheme', () => {
    const script = getThemeScript(THEME_STORAGE_KEY, 'system')

    expect(script).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`)
    expect(script).toContain('classList.add')
    expect(script).toContain('colorScheme')
  })
})
