import { useRouterState } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

const routeProgressDelayMs = 150

export function RouteProgressBar() {
  const isLoading = useRouterState({ select: (state) => state.isLoading })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isLoading) {
      setVisible(false)
      return
    }

    const timeout = window.setTimeout(() => setVisible(true), routeProgressDelayMs)
    return () => window.clearTimeout(timeout)
  }, [isLoading])

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200 ease-out motion-reduce:transition-none ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div
        className={`h-full w-full origin-left bg-accent transition-transform duration-300 ease-out motion-reduce:transition-none ${visible ? 'scale-x-100' : 'scale-x-0'}`}
      />
    </div>
  )
}
