import { createContext, useCallback, useContext, useLayoutEffect, useRef } from 'react'

/** Presentation only: a hidden page's portals follow its visibility without discarding owner drafts. */
export const WorkspacePresentationVisibility = createContext(true)

export function useWorkspacePresentationVisible(): boolean {
  return useContext(WorkspacePresentationVisibility)
}

/** Capture a UI delivery lifetime; accepted commands retain their own completion and recovery. */
export function useWorkspacePresentationLifetime(): () => () => boolean {
  const visible = useWorkspacePresentationVisible()
  const lifetime = useRef({ visible, mounted: false, generation: 0 })
  useLayoutEffect(() => {
    const current = lifetime.current
    current.visible = visible
    current.mounted = true
    current.generation += 1
    return () => {
      current.mounted = false
      current.generation += 1
    }
  }, [visible])
  return useCallback(() => {
    const generation = lifetime.current.generation
    return () => lifetime.current.mounted && lifetime.current.visible && lifetime.current.generation === generation
  }, [])
}
