import { useAuth } from '@clerk/tanstack-react-start'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { AePageState } from '@/components/ae/layout/AePageState'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { api } from '../../../../convex/_generated/api'

/**
 * Signed-in pages get a live Convex client without chat's identity gate: server-rendered content
 * shows at once and each `useQuery` site's own loading state covers the auth handshake. Anonymous
 * visitors on public pages open no websocket.
 */
export function SignedInConvexProvider({ children }: { children: ReactNode }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
  const [client] = useState(() => (convexUrl ? new ConvexReactClient(convexUrl) : null))
  if (client === null) return children
  // Keep this wrapper mounted while Clerk resolves auth; changing its depth remounts the shell and resets navigation state.
  return <ConvexProviderWithClerk client={client} useAuth={useAuth}>{children}</ConvexProviderWithClerk>
}

export function ChatConvexProvider({ children }: { children: ReactNode }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
  if (!convexUrl) {
    return (
      <AePageState
        title="Chat is unavailable"
        description="Chat is not configured. The Tool catalogue remains available."
        tone="warning"
        action={(
          <Link to="/market" className={cn(buttonVariants(), 'min-h-touch')}>
            Browse Tools
          </Link>
        )}
      />
    )
  }
  return <ConfiguredChatConvexProvider convexUrl={convexUrl}>{children}</ConfiguredChatConvexProvider>
}

function ConfiguredChatConvexProvider({ convexUrl, children }: { convexUrl: string; children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(convexUrl))
  const auth = useAuth()
  const identity = JSON.stringify([auth.userId, auth.sessionId, auth.orgId])
  const [attempt, setAttempt] = useState(0)
  const [initialization, setInitialization] = useState<{ identity: string; attempt: number; ready: boolean } | null>(null)
  const generation = useRef(0)
  const installedSession = useRef<{ client: ConvexHttpClient; generation: number } | null>(null)
  // Requires a verified Clerk token. Initialize that exact token before the
  // maintained Convex integration installs it for reactive reads, including
  // every refresh. While rotating authority, descendants cannot read the old
  // generation. Refusal remains retryable; obsolete completions grant nothing.
  const useInitializedAuth = useMemo(() => function useInitializedAuth() {
    const clerk = useAuth()
    const clerkGetToken = clerk.getToken
    const getToken = useCallback(async (options: Parameters<typeof clerkGetToken>[0]) => {
      const requestGeneration = ++generation.current
      setInitialization(null)
      try {
        const token = await clerkGetToken(options)
        if (token === null) {
          if (requestGeneration === generation.current) setInitialization({ identity, attempt, ready: false })
          return null
        }
        const bootstrap = new ConvexHttpClient(convexUrl)
        bootstrap.setAuth(token)
        const ready = await bootstrap.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {})
        if (requestGeneration !== generation.current) return null
        installedSession.current = ready ? { client: bootstrap, generation: requestGeneration } : null
        setInitialization({ identity, attempt, ready })
        return ready ? token : null
      } catch {
        if (requestGeneration === generation.current) setInitialization({ identity, attempt, ready: false })
        return null
      }
    }, [clerkGetToken, convexUrl, identity, attempt])
    return { ...clerk, getToken }
  }, [convexUrl, identity, attempt])
  useEffect(() => {
    if (!auth.isSignedIn) return
    // Convex does not always expose JWT exp in UserIdentity. Maintain its short
    // server-anchored window with the already-installed token; the backend
    // verifies that token again and refuses revoked authority. Successful
    // renewals leave the mounted composer and its draft intact.
    const interval = window.setInterval(() => {
      const session = installedSession.current
      if (session === null || session.generation !== generation.current) return
      void session.client.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}).then(
        (ready) => {
          if (!ready && session.generation === generation.current) setInitialization({ identity, attempt, ready: false })
        },
        () => {
          if (session.generation === generation.current) setInitialization({ identity, attempt, ready: false })
        },
      )
    }, 20_000)
    return () => window.clearInterval(interval)
  }, [auth.isSignedIn, identity, attempt])
  const current = initialization?.identity === identity && initialization.attempt === attempt
    ? initialization
    : null
  return (
    <ConvexProviderWithClerk client={client} useAuth={useInitializedAuth}>
      {auth.isLoaded && !auth.isSignedIn ? children : current?.ready ? children : current === null ? (
        <AePageState title="Opening chat" description="Connecting to your account…" />
      ) : (
        <AePageState
          title="Couldn’t open chat"
          description="Your account connection could not be completed. Try again."
          tone="warning"
          action={(
            <button type="button" className={buttonVariants()} onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </button>
          )}
        />
      )}
    </ConvexProviderWithClerk>
  )
}

export function requiresChatProviders(pathname: string): boolean {
  return pathname === '/t/new' || pathname.startsWith('/t/') || pathname.startsWith('/s/')
}
