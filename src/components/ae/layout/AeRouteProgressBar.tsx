import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

const routeProgressStartDelayMs = 75
const routeProgressCreepDelayMs = 200
const routeProgressFinishFadeMs = 200

type RouteProgressPhase = 'idle' | 'starting' | 'creeping' | 'finishing'

const progressScaleClassByPhase: Record<RouteProgressPhase, string> = {
  idle: 'scale-x-0',
  starting: 'scale-x-[0.3]',
  creeping: 'scale-x-[0.7]',
  finishing: 'scale-x-100',
}

export function RouteProgressBar() {
  const isLoading = useRouterState({ select: (state) => state.isLoading })
  const [phase, setPhase] = useState<RouteProgressPhase>('idle')
  const wasLoadingRef = useRef(false)

  useEffect(() => {
    if (isLoading) {
      wasLoadingRef.current = true
      setPhase('idle')

      const startTimeout = window.setTimeout(() => {
        setPhase('starting')
      }, routeProgressStartDelayMs)

      const creepTimeout = window.setTimeout(() => {
        setPhase('creeping')
      }, routeProgressCreepDelayMs)

      return () => {
        window.clearTimeout(startTimeout)
        window.clearTimeout(creepTimeout)
      }
    }

    if (!wasLoadingRef.current) {
      return
    }

    wasLoadingRef.current = false
    setPhase('finishing')

    const idleTimeout = window.setTimeout(() => {
      setPhase('idle')
    }, routeProgressFinishFadeMs)

    return () => {
      window.clearTimeout(idleTimeout)
    }
  }, [isLoading])

  const isVisible = phase !== 'idle'

  return (
    <div
      aria-hidden="true"
      data-progress-bar="true"
      data-phase={phase}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-30 h-0.5 overflow-hidden transition-opacity duration-200 ease-out motion-reduce:transition-none',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div
        className={cn(
          'h-full w-full origin-left bg-foreground transition-transform duration-300 ease-out motion-reduce:scale-x-100 motion-reduce:transform-none motion-reduce:transition-none',
          progressScaleClassByPhase[phase],
        )}
      />
    </div>
  )
}
