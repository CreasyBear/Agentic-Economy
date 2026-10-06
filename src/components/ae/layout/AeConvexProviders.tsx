import { useAuth } from '@clerk/tanstack-react-start'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { AePageState } from '@/components/ae/layout/AePageState'
import { Button } from '@/components/arc/button/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { api } from '../../../../convex/_generated/api'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './RouteRecoveryComposition.css'

const CHAT_VISIBLE_STYLE = { display: 'contents' } as const
const CHAT_HIDDEN_STYLE = { display: 'none' } as const

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
  return (
    <ConvexProviderWithClerk client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}

export function ChatConfigurationUnavailable() {
  return (
    <AePageState
      title="Chat is unavailable"
      description="Chat is not configured. The Tool catalogue remains available."
      tone="warning"
      action={(
        <Link to="/market" className={`arc-market ${actionLinkClassName('primary', 'md')}`}>
          Browse Tools
        </Link>
      )}
    />
  )
}

export function ChatConvexProvider({ children }: { children: ReactNode }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
  if (!convexUrl) return <ChatConfigurationUnavailable />
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
  const mountedIdentity = useRef<string | null>(null)
  // Requires a verified Clerk token. Initialize that exact token before the
  // maintained Convex integration installs it for reactive reads, including
  // every refresh. While rotating authority, descendants cannot read the old
  // generation. Refusal remains retryable; obsolete completions grant nothing.
  const useInitializedAuth = useMemo(() => function useInitializedAuth() {
    const clerk = useAuth()
    const clerkGetToken = clerk.getToken
    const getToken = useCallback(async (options: Parameters<typeof clerkGetToken>[0]) => {
      const requestGeneration = ++generation.current
      setInitialization(previous => previous?.identity === identity && previous.ready ? previous : null)
      try {
        const token = await clerkGetToken(options)
        if (token === null) {
          if (requestGeneration === generation.current) setInitialization({ identity, attempt, ready: false })
          return null
        }
        const bootstrap = new ConvexHttpClient(convexUrl)
        bootstrap.setAuth(token)
        let timer: number | undefined
        const ready = await Promise.race([
          bootstrap.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}),
          new Promise<never>((_, reject) => {
            timer = window.setTimeout(() => reject(new Error('chat_authority_connection_timeout')), 8_000)
          }),
        ]).finally(() => window.clearTimeout(timer))
        if (requestGeneration !== generation.current) return null
        installedSession.current = ready ? { client: bootstrap, generation: requestGeneration } : null
        setInitialization({ identity, attempt, ready })
        return ready ? token : null
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        if (requestGeneration === generation.current) setInitialization(previous =>
          previous?.identity === identity && previous.ready ? previous : { identity, attempt, ready: false })
        return null
      }
    // The memo factory changes on identity and retry. The nested hook must
    // refresh its token callback with that factory, even though these values
    // are outside the nested hook's own render scope.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [clerkGetToken, convexUrl, identity, attempt])
    return {
      ...clerk,
      getToken,
      // Convex's Clerk adapter intentionally tracks sessionId, not getToken, to
      // decide when to install a new auth fetcher. An online epoch forces one
      // fresh token + authority check after an offline fetch returned null.
      sessionId: clerk.sessionId && attempt > 0 ? `${clerk.sessionId}:chat:${attempt}` : clerk.sessionId,
    }
  }, [convexUrl, identity, attempt])
  useEffect(() => {
    if (!auth.isLoaded || !auth.isSignedIn) return
    const reconnect = () => {
      if (mountedIdentity.current === identity) setAttempt((value) => value + 1)
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [auth.isLoaded, auth.isSignedIn, identity])
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
        (cause) => {
          captureClientExceptionOnClient(cause)
          // Transport loss cannot revoke the last verified identity; protected writes
          // still require current authority on the server after Convex reconnects.
        },
      )
    }, 20_000)
    return () => window.clearInterval(interval)
  }, [auth.isSignedIn, identity, attempt])
  const current = initialization?.identity === identity
    && (initialization.attempt === attempt || initialization.ready)
    ? initialization
    : null
  const showChat = auth.isLoaded && (!auth.isSignedIn || current?.ready === true)
  // A temporary Clerk/Convex handshake can clear the current identity. Keep the
  // same session mounted but hidden until it is verified again; a real identity
  // change replaces the keyed subtree, and an explicit refusal still removes it.
  const keepChatMounted = !showChat && current?.ready !== false && mountedIdentity.current !== null
  if (showChat) mountedIdentity.current = identity
  return (
    <ConvexProviderWithClerk client={client} useAuth={useInitializedAuth}>
      {(showChat || keepChatMounted) && (
        <div key={mountedIdentity.current} hidden={!showChat} style={showChat ? CHAT_VISIBLE_STYLE : CHAT_HIDDEN_STYLE}>
          {children}
        </div>
      )}
      {!showChat && (current === null ? (
        <AePageState title="Opening chat" description="Connecting to your account…" />
      ) : (
        <AePageState
          title="Couldn’t open chat"
          description="Your account connection could not be completed. Try again or browse Tools."
          tone="warning"
          action={(
            <div className="arc-market arc-recovery-action-row">
              <Button type="button" size="md" onClick={() => setAttempt((value) => value + 1)}>
                Try again
              </Button>
              <Link to="/market" className={actionLinkClassName('secondary', 'md')}>Browse Tools</Link>
            </div>
          )}
        />
      ))}
    </ConvexProviderWithClerk>
  )
}

export function requiresChatProviders(pathname: string): boolean {
  return pathname === '/t/new' || pathname.startsWith('/t/') || pathname.startsWith('/s/')
}
