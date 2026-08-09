import { useCallback, useRef } from 'react'

/**
 * Triggers the transitions.dev error-shake on a ref'd element (the bordered
 * wrapper that owns the visible edge). Replays the shake from a clean
 * baseline by removing the class, forcing a reflow, and re-adding it.
 */
export function useErrorShake<E extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<E | null>(null)

  const shake = useCallback(() => {
    const element = ref.current
    if (element === null) return
    element.classList.remove('is-shaking')
    void element.offsetWidth // force reflow so the animation restarts cleanly
    element.classList.add('is-shaking')
  }, [])

  return { ref, shake }
}
