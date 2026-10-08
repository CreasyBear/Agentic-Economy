import { useAuth } from '@clerk/tanstack-react-start'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { Link } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { WorkspacePresentationVisibility, useWorkspacePresentationVisible } from '@/lib/client/workspace-presentation'
import { AePageState } from '@/components/ae/layout/AePageState'
import { Button } from '@/components/arc/button/button'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { api } from '../../../../convex/_generated/api'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './RouteRecoveryComposition.css'

const CHAT_VISIBLE_STYLE = { display: 'contents' } as const
const CHAT_HIDDEN_STYLE = { display: 'none' } as const

type ChatAuthorityState = {
  showChat: boolean
  keepChatMounted: boolean
  mountedIdentity: string | null
  opening: boolean
  retry: () => void
}

const ChatAuthorityContext = createContext<ChatAuthorityState | null>(null)

/** One root client and maintained Clerk adapter across public, workspace and chat routes. */
export function AeConvexProvider({ children, chatRequired = false }: { children: ReactNode; chatRequired?: boolean }) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim()
  if (!convexUrl) return children
  return <ConfiguredConvexProvider convexUrl={convexUrl} chatRequired={chatRequired}>{children}</ConfiguredConvexProvider>
}

export function SignedInConvexProvider({ children }: { children: ReactNode }) {
  return <AeConvexProvider>{children}</AeConvexProvider>
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
  return <AeConvexProvider chatRequired><ChatAuthorityBoundary>{children}</ChatAuthorityBoundary></AeConvexProvider>
}

function ConfiguredConvexProvider({ convexUrl, chatRequired, children }: { convexUrl: string; chatRequired: boolean; children: ReactNode }) {
  const client = useMemo(() => new ConvexReactClient(convexUrl), [convexUrl])
  const pendingClose = useRef<{ client: ConvexReactClient; cancelled: boolean } | null>(null)
  useEffect(() => {
    if (pendingClose.current?.client === client) pendingClose.current.cancelled = true
    return () => {
      const disposal = { client, cancelled: false }
      pendingClose.current = disposal
      // StrictMode replays effects on the same client. Let its next setup cancel
      // disposal; a genuinely retired client still closes after child cleanups.
      queueMicrotask(() => {
        if (!disposal.cancelled) void client.close().catch(captureClientExceptionOnClient)
      })
    }
  }, [client])
  const auth = useAuth()
  const identity = JSON.stringify([auth.userId, auth.sessionId, auth.orgId])
  // A role change retires prior authority immediately while preserving the same
  // account's hidden draft until fresh materialization confirms it is usable.
  const authorityScope = JSON.stringify([identity, auth.orgRole])
  const [attempt, setAttempt] = useState(0)
  const [activation, setActivation] = useState({ chatRequired, epoch: 0 })
  // A return to chat requires fresh authority even if this identity was ready on
  // an earlier visit. Reconcile before descendants can render that old readiness.
  if (activation.chatRequired !== chatRequired) setActivation({ chatRequired, epoch: activation.epoch + 1 })
  const epoch = activation.epoch
  const [initialization, setInitialization] = useState<{ authorityScope: string; epoch: number; attempt: number; ready: boolean } | null>(null)
  const generation = useRef(0)
  const installedSession = useRef<{ client: ConvexHttpClient; generation: number } | null>(null)
  const committedIdentity = useRef<string | null>(null)
  // Requires a verified Clerk token. Initialize that exact token before the
  // maintained Convex integration installs it for reactive reads, including
  // every refresh. While rotating authority, descendants cannot read the old
  // generation. Refusal remains retryable; obsolete completions grant nothing.
  const useInitializedAuth = useMemo(() => function useInitializedAuth() {
    const clerk = useAuth()
    const clerkGetToken = clerk.getToken
    const getToken = useCallback(async (options: Parameters<typeof clerkGetToken>[0]) => {
      const requestGeneration = ++generation.current
      if (!chatRequired) return clerkGetToken(options)
      setInitialization(previous => previous?.authorityScope === authorityScope && previous.epoch === epoch && previous.ready ? previous : null)
      try {
        const token = await clerkGetToken(options)
        if (token === null) {
          if (requestGeneration === generation.current) setInitialization({ authorityScope, epoch, attempt, ready: false })
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
        setInitialization({ authorityScope, epoch, attempt, ready })
        return ready ? token : null
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        if (requestGeneration === generation.current) setInitialization(previous =>
          previous?.authorityScope === authorityScope && previous.epoch === epoch && previous.ready ? previous : { authorityScope, epoch, attempt, ready: false })
        return null
      }
    // The memo factory changes on authority scope and retry. The nested hook must
    // refresh its token callback with that factory, even though these values
    // are outside the nested hook's own render scope.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [clerkGetToken, convexUrl, authorityScope, epoch, chatRequired, attempt])
    return {
      ...clerk,
      getToken,
      // The installed Clerk adapter memoizes its fetcher by session/org/role;
      // changing this hook factory or getToken alone does not reinstall auth.
      // This adapter-only key adds route activation, user scope and retry epochs.
      // The actual Clerk session and exact fetched token remain unchanged.
      sessionId: clerk.sessionId ? `${clerk.sessionId}:ae:${identity}:${epoch}:${attempt}` : clerk.sessionId,
    }
  }, [convexUrl, identity, authorityScope, epoch, chatRequired, attempt])
  useEffect(() => {
    if (!chatRequired || !auth.isLoaded || !auth.isSignedIn) return
    const reconnect = () => {
      if (committedIdentity.current === identity) setAttempt((value) => value + 1)
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [chatRequired, auth.isLoaded, auth.isSignedIn, identity])
  useEffect(() => {
    if (!chatRequired || !auth.isSignedIn) return
    // Convex does not always expose JWT exp in UserIdentity. Maintain its short
    // server-anchored window with the already-installed token; the backend
    // verifies that token again and refuses revoked authority. Successful
    // renewals leave the mounted composer and its draft intact.
    const interval = window.setInterval(() => {
      const session = installedSession.current
      if (session === null || session.generation !== generation.current) return
      void session.client.mutation(api.interactiveAuthority.materializeCurrentInteractiveAuthority, {}).then(
        (ready) => {
          if (!ready && session.generation === generation.current) setInitialization({ authorityScope, epoch, attempt, ready: false })
        },
        (cause) => {
          captureClientExceptionOnClient(cause)
          // Transport loss cannot revoke the last verified identity; protected writes
          // still require current authority on the server after Convex reconnects.
        },
      )
    }, 20_000)
    return () => window.clearInterval(interval)
  }, [chatRequired, auth.isSignedIn, authorityScope, epoch, attempt])
  const current = initialization?.authorityScope === authorityScope && initialization.epoch === epoch
    && (initialization.attempt === attempt || initialization.ready)
    ? initialization
    : null
  const showChat = auth.isLoaded && (!auth.isSignedIn || current?.ready === true)
  // A temporary Clerk/Convex handshake can clear the current identity. Keep the
  // same session mounted but hidden until it is verified again; a real identity
  // change replaces the keyed subtree, and an explicit refusal still removes it.
  const keepChatMounted = !showChat && current?.ready !== false && committedIdentity.current !== null
  // Derive this render's key from its verified identity, but retain only the
  // identity of a committed subtree. A suspended render must not replace the
  // draft identity that a later hidden handshake will preserve.
  const mountedIdentity = showChat ? identity : committedIdentity.current
  useLayoutEffect(() => {
    if (showChat) committedIdentity.current = identity
  }, [showChat, identity])
  useEffect(() => () => {
    // An old HTTP completion or installed-token renewal cannot authorize a new
    // route mode, identity or client after its auth fetcher has been retired.
    generation.current += 1
    installedSession.current = null
  }, [client, authorityScope, epoch, attempt])
  return (
    <ConvexProviderWithClerk client={client} useAuth={useInitializedAuth}>
      <ChatAuthorityContext.Provider value={{ showChat, keepChatMounted, mountedIdentity, opening: current === null, retry: () => setAttempt(value => value + 1) }}>
        {children}
      </ChatAuthorityContext.Provider>
    </ConvexProviderWithClerk>
  )
}

/** Gate only the routed chat projection; the app shell keeps its own lifecycle. */
export function ChatAuthorityBoundary({ children, required = true }: { children: ReactNode; required?: boolean }) {
  const visible = useWorkspacePresentationVisible()
  const authority = useContext(ChatAuthorityContext)
  if (!required || authority === null) return children
  const { showChat, keepChatMounted, mountedIdentity, opening, retry } = authority
  return <>
    {(showChat || keepChatMounted) && (
      <div key={mountedIdentity} hidden={!showChat} style={showChat ? CHAT_VISIBLE_STYLE : CHAT_HIDDEN_STYLE}>
        <WorkspacePresentationVisibility value={visible && showChat}>{children}</WorkspacePresentationVisibility>
      </div>
    )}
    {!showChat && (opening ? (
      <AePageState title="Opening chat" description="Connecting to your account…" />
    ) : (
      <AePageState
        title="Couldn’t open chat"
        description="Your account connection could not be completed. Try again or browse Tools."
        tone="warning"
        action={(
          <div className="arc-market arc-recovery-action-row">
            <Button type="button" size="md" onClick={retry}>Try again</Button>
            <Link to="/market" className={actionLinkClassName('secondary', 'md')}>Browse Tools</Link>
          </div>
        )}
      />
    ))}
  </>
}

export function requiresChatProviders(pathname: string): boolean {
  return pathname === '/t/new' || pathname.startsWith('/t/') || pathname.startsWith('/s/')
}
