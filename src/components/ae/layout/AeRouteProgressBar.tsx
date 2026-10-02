import { useRouterState } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import './AppFrameComposition.css'

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
        'arc-market arc-route-progress',
        isVisible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <div
        className={cn(
          'arc-route-progress-fill',
          progressScaleClassByPhase[phase],
        )}
      />
    </div>
  )
}
