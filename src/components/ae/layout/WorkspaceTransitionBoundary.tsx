'use client'

import { useAuth } from '@clerk/tanstack-react-start'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Spinner } from '@/components/ui/spinner'

function isDeepTenantRoute(pathname: string): boolean {
  return pathname.split('/').filter(Boolean).length > 2
}

export function WorkspaceTransitionBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const orgId = auth.orgId
  const isLoaded = auth.isLoaded
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [isTransitioning, setIsTransitioning] = useState(false)
  const previousOrgIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const normalizedOrgId = orgId ?? null

    if (previousOrgIdRef.current === undefined) {
      previousOrgIdRef.current = normalizedOrgId
      return
    }

    if (previousOrgIdRef.current === normalizedOrgId) {
      return
    }

    previousOrgIdRef.current = normalizedOrgId
    setIsTransitioning(true)

    if (isDeepTenantRoute(pathname)) {
      navigate({ to: '/owner/operations' })
    }
  }, [navigate, orgId, pathname])

  useEffect(() => {
    if (!isTransitioning || !isLoaded) {
      return
    }

    const settleTimer = window.setTimeout(() => {
      setIsTransitioning(false)
    }, 32)

    return () => {
      window.clearTimeout(settleTimer)
    }
  }, [isLoaded, isTransitioning, orgId])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {children}
      {isTransitioning ? (
        <div
          data-slot="workspace-transition-scrim"
          data-testid="workspace-transition-scrim"
          className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <Spinner className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Switching workspace…</p>
        </div>
      ) : null}
    </div>
  )
}
