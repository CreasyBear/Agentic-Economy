'use client'

import { useAuth } from '@clerk/tanstack-react-start'
import { useRouter } from '@tanstack/react-router'
import { WorkspacePresentationVisibility } from '@/lib/client/workspace-presentation'
import { rememberOperatorContext } from '@/lib/operator/operator-context-memory'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { identifyPostHogAccount, readPostHogAttribution, resetPostHogAccount } from '@/lib/observability/posthog-browser'
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

export function WorkspaceTransitionBoundary({ children, renderHeader }: { children: ReactNode; renderHeader?: (ready: boolean) => ReactNode }) {
  const auth = useAuth()
  const router = useRouter()
  const { isAuthenticated } = useConvexAuth()
  const distinctId = useQuery(api.journeyEvents.viewerDistinctId, isAuthenticated ? {} : 'skip')
  const wasSignedIn = useRef(false)
  const recordAttribution = useMutation(api.attribution.recordAttribution)
  useEffect(() => {
    if (!distinctId) return
    identifyPostHogAccount(distinctId)
    void readPostHogAttribution().then((touches) => touches && recordAttribution(touches)).catch(() => {})
  }, [distinctId, recordAttribution])
  useEffect(() => {
    if (auth.isSignedIn) wasSignedIn.current = true
    else if (auth.isSignedIn === false && wasSignedIn.current) { wasSignedIn.current = false; resetPostHogAccount() }
  }, [auth.isSignedIn])
  const identity = JSON.stringify([auth.userId ?? null, auth.sessionId ?? null, auth.orgId ?? null])
  const scope = auth.isLoaded ? JSON.stringify([identity, auth.orgRole ?? null]) : null
  const [context, setContext] = useState({ scope, identity, identityChanged: false, generation: 0, mountedGeneration: 0, userId: auth.userId ?? null })
  const [settledGeneration, setSettledGeneration] = useState(0)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // Render-phase reconciliation prevents even one frame of interactive old-Account content.
  // Initial Clerk hydration preserves the mounted anonymous chat draft.
  if (scope !== null && context.scope !== scope) {
    const identityChanged = context.identity !== identity
    setContext({ scope, identity, identityChanged, userId: auth.userId ?? null,
      generation: context.scope === null ? context.generation : context.generation + 1,
      mountedGeneration: context.userId === null || !identityChanged ? context.mountedGeneration : context.mountedGeneration + 1,
    })
  }
  const switching = (!auth.isLoaded && context.userId !== null) || context.generation !== settledGeneration

  useEffect(() => {
    if (!switching || scope !== context.scope) return
    let active = true
    setFailed(false)
    const settle = async () => {
      // Retire previous-scope observations and speculative reads before navigation.
      // Forgetting the remembered admission makes the reloaded beforeLoad ask the
      // server, which redirects an ended or replaced Clerk session to sign-in.
      rememberOperatorContext(undefined)
      router.clearCache()
      const path = router.state.location.pathname
      // Auth pages stay available when Clerk changes identity during sign-in.
      const authEntry = /^\/sign-(?:in|up)(?:\/|$)/u.test(path)
      const landing = auth.isSignedIn === false && !authEntry ? '/market' : context.identityChanged ? workspaceLanding(path) : undefined
      if (landing !== undefined) await router.navigate({ to: landing, replace: true })
      if (!active) return
      await router.invalidate({ sync: true })
      if (active) {
        // Navigation may have cached the departing active route. Evict it before
        // exposing this scope; invalidation alone keeps old loaderData renderable.
        router.clearCache()
        setSettledGeneration(context.generation)
      }
    }
    void settle().catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [attempt, auth.isSignedIn, context.generation, context.scope, context.identityChanged, router, scope, switching])

  return <>{renderHeader?.(!switching)}<div className="arc-market arc-workspace-transition" aria-busy={switching}>
    <div key={context.mountedGeneration} inert={switching} aria-hidden={switching || undefined} className={switching ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}><WorkspacePresentationVisibility value={!switching}>{children}</WorkspacePresentationVisibility></div>
    {switching ? <div data-slot="workspace-transition-scrim" data-testid="workspace-transition-scrim" className="arc-workspace-transition-scrim min-h-64" role="status" aria-live="polite">
      {failed ? <><p>We couldn’t load this Account. Your previous Account’s records are hidden.</p><Button onClick={() => setAttempt(value => value + 1)}>Retry Account load</Button></> : <><Spinner className="size-6 text-muted-foreground" /><p>Switching workspace…</p></>}
    </div> : null}
  </div></>
}
