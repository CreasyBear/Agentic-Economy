'use client'

import { ScriptOnce, useRouter } from '@tanstack/react-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  applyAppearance,
  getThemeScript,
  parseStoredAppearance,
  resolveAppearance,
  THEME_STORAGE_KEY,
  type AppearancePreference,
  type ResolvedAppearance,
} from '@/lib/theme/theme-mode'

type ThemeProviderState = {
  preference: AppearancePreference
  resolved: ResolvedAppearance
  setPreference: (preference: AppearancePreference) => void
}

const ThemeContext = createContext<ThemeProviderState | undefined>(undefined)

function ThemeBootScript({
  storageKey,
  defaultTheme,
}: {
  storageKey: string
  defaultTheme: AppearancePreference
}) {
  const router = useRouter({ warn: false })
  if (!router) {
    return null
  }

  return <ScriptOnce>{getThemeScript(storageKey, defaultTheme)}</ScriptOnce>
}

function readPrefersDark(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = THEME_STORAGE_KEY,
}: {
  children: ReactNode
  defaultTheme?: AppearancePreference
  storageKey?: string
}) {
  const [preference, setPreferenceState] = useState<AppearancePreference>(defaultTheme)
  const [prefersDark, setPrefersDark] = useState(false)

  useEffect(() => {
    const stored = parseStoredAppearance(localStorage.getItem(storageKey))
    setPreferenceState(stored)
    setPrefersDark(readPrefersDark())
    applyAppearance(stored)
  }, [storageKey])

  useEffect(() => {
    if (preference !== 'system') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      setPrefersDark(media.matches)
      applyAppearance('system')
    }

    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: AppearancePreference) => {
    setPreferenceState(next)
    setPrefersDark(readPrefersDark())
    applyAppearance(next)
  }, [])

  const resolved = resolveAppearance(preference, prefersDark)

  const value = useMemo(
    (): ThemeProviderState => ({
      preference,
      resolved,
      setPreference,
    }),
    [preference, resolved, setPreference],
  )

  return (
    <ThemeContext.Provider value={value}>
      <ThemeBootScript storageKey={storageKey} defaultTheme={defaultTheme} />
      {children}
    </ThemeContext.Provider>
  )
}

export function useAppearance(): ThemeProviderState {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    return {
      preference: 'system',
      resolved: 'light',
      setPreference: () => {},
    }
  }
  return context
}
