export type AppearancePreference = 'light' | 'dark' | 'system'
export type ResolvedAppearance = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'ae-theme'
export const DEFAULT_APPEARANCE_PREFERENCE: AppearancePreference = 'light'

export function parseStoredAppearance(raw: string | null): AppearancePreference {
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw
  }
  return DEFAULT_APPEARANCE_PREFERENCE
}

export function resolveAppearance(
  preference: AppearancePreference,
  prefersDark: boolean,
): ResolvedAppearance {
  switch (preference) {
    case 'light':
      return 'light'
    case 'dark':
      return 'dark'
    case 'system':
      return prefersDark ? 'dark' : 'light'
    default: {
      const _exhaustive: never = preference
      return _exhaustive
    }
  }
}

export function applyAppearance(preference: AppearancePreference): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const prefersDark =
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  const resolved = resolveAppearance(preference, prefersDark)

  document.documentElement.classList.remove('light', 'dark')
  document.documentElement.classList.add(resolved)
  document.documentElement.style.colorScheme = resolved
  document.documentElement.dataset.appearancePreference = preference

  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch (cause) {
    void cause;
    // Storage access may be denied in private mode or sandboxed contexts.
  }
}

export function getThemeScript(
  storageKey = THEME_STORAGE_KEY,
  defaultTheme: AppearancePreference = DEFAULT_APPEARANCE_PREFERENCE,
): string {
  return `(function(){try{var t=localStorage.getItem("${storageKey}");if(t!=='light'&&t!=='dark'&&t!=='system')t='${defaultTheme}';var d=matchMedia('(prefers-color-scheme: dark)').matches;var r=t==='system'?(d?'dark':'light'):t;var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);e.style.colorScheme=r;e.dataset.appearancePreference=t;}catch(e){}})();`
}
