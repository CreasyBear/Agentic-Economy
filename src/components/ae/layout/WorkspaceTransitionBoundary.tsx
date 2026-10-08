'use client'

import { useAuth } from '@clerk/tanstack-react-start'
import { useRouter } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import './AppFrameComposition.css'

/** Cross-Account object URLs cannot identify work in the newly selected Account. */
function workspaceLanding(path: string): string | undefined {
  if (path.startsWith('/calls/') || path.startsWith('/plans/')) return '/activity'
  if (path.startsWith('/owner/operations/') || path.startsWith('/owner/supply/')) return '/owner/operations'
  if (path.startsWith('/agent-access/')) return '/agent-access'
  if (path.startsWith('/t/') && path !== '/t/new') return '/t/new'
  return undefined
}

export function WorkspaceTransitionBoundary({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const router = useRouter()
  const scope = auth.isLoaded ? JSON.stringify([auth.userId ?? null, auth.sessionId ?? null, auth.orgId ?? null]) : null
  const [context, setContext] = useState<{ scope: string | null; generation: number; mountedGeneration: number; userId: string | null }>({ scope, generation: 0, mountedGeneration: 0, userId: auth.userId ?? null })
  const [settledGeneration, setSettledGeneration] = useState(0)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Render-phase reconciliation prevents even one frame of interactive old-Account content.
  // Initial Clerk hydration preserves the mounted anonymous chat draft.
  if (scope !== null && context.scope !== scope) {
    setContext({ scope, userId: auth.userId ?? null,
      generation: context.scope === null ? context.generation : context.generation + 1,
      mountedGeneration: context.userId === null ? context.mountedGeneration : context.mountedGeneration + 1,
    })
  }
  const switching = (!auth.isLoaded && context.userId !== null) || context.generation !== settledGeneration

  useEffect(() => {
    if (!switching || scope !== context.scope) return
    let active = true
    setFailed(false)
    const settle = async () => {
      const landing = auth.isSignedIn === false ? '/market' : workspaceLanding(router.state.location.pathname)
      if (landing !== undefined) await router.navigate({ to: landing, replace: true })
      await router.invalidate({ sync: true })
      if (active) setSettledGeneration(context.generation)
    }
    void settle().catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [attempt, auth.isSignedIn, context.generation, context.scope, router, scope, switching])

  return <div className="arc-market arc-workspace-transition" aria-busy={switching}>
    <div key={context.mountedGeneration} inert={switching} aria-hidden={switching || undefined} className={switching ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>{children}</div>
    {switching ? <div data-slot="workspace-transition-scrim" data-testid="workspace-transition-scrim" className="arc-workspace-transition-scrim min-h-64" role="status" aria-live="polite">
      {failed ? <><p>We couldn’t load this Account. Your previous Account’s records are hidden.</p><Button onClick={() => setAttempt(value => value + 1)}>Retry Account load</Button></> : <><Spinner className="size-6 text-muted-foreground" /><p>Switching workspace…</p></>}
    </div> : null}
  </div>
}
