import { useEffect, useSyncExternalStore } from 'react'

/**
 * Scopes transitional legacy-surface tokens to `<body data-ae-surface>` instead
 * of a shell class, so remaps still reach overlays and toasts mounted at
 * `document.body`.
 *
 * Only `surface === 'register'` currently matches a dark token remap
 * (globals.css `@custom-variant dark`, tokens.css `.dark`-equivalent block).
 * Any other value (e.g. `'owner'`) just marks the body for future
 * surface-specific CSS — it renders the default light tokens.
 *
 * Restores the previous attribute value (or removes it) on unmount/change,
 * so nested or sequential mounts never clobber a sibling's scope.
 */
export function useAeSurfaceScope(surface: string | undefined | null): void {
  useEffect(() => {
    if (surface === undefined || surface === null || surface === '') {
      return
    }
    const { body } = document
    const previous = body.getAttribute('data-ae-surface')
    body.setAttribute('data-ae-surface', surface)
    return () => {
      if (previous === null) {
        body.removeAttribute('data-ae-surface')
      } else {
        body.setAttribute('data-ae-surface', previous)
      }
    }
  }, [surface])
}

function subscribeToBodySurface(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-ae-surface'] })
  return () => observer.disconnect()
}

/** True while `<body data-ae-surface="register">` (the dark-scoped surface) is set. Re-renders on change. */
export function useAeIsDarkSurface(): boolean {
  return useSyncExternalStore(
    subscribeToBodySurface,
    () => document.body.getAttribute('data-ae-surface') === 'register',
    () => false,
  )
}
