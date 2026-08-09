import { isSecureRequest, readCookie, serializeCookie } from '@/lib/http/cookies'
import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'
import { handleCustomerRequestFactsPost, type FactsResult } from '@/lib/server/customer-request-facts-api'
import { handleCustomerRequestGet, type InspectResult } from '@/lib/server/customer-request-inspect-api'
import { handleCustomerRequestMessagePost, type MessageResult } from '@/lib/server/customer-request-messages-api'
import type { ConfirmationResult } from '@/lib/server/customer-request-confirmation-api'
import { handleCustomerRequestPost, type SubmitResult } from '@/lib/server/customer-request-api'
import { callPublicSourceAction, sourceAction } from '@/lib/server/convex-source'
import {
  BROWSER_GUEST_LIFETIME_SECONDS,
  browserGuestPrincipalId,
  mintBrowserGuestAssertion,
  readBrowserGuestSigningKey,
  verifyBrowserGuestAssertion,
} from '@/lib/server/browser-guest-assertion'
import type { CustomerRequestProjection } from '@/modules/customer-request/customer-projection'
import type {
  CustomerRequestAgentResult,
  CustomerRequestEvidenceResult,
  CustomerRequestProblemResult,
  CustomerRequestProblemStatusChange,
} from '@/modules/customer-request/agent-contract'
import { createCustomerRequestServiceAssertion, toStableHashValue } from '@/modules/customer-request/service-auth-envelope'

const COOKIE_NAME = 'ae_request_session'
const SESSION_SCOPE = 'customer_requests:create'

type BrowserActionResult = SubmitResult | FactsResult | MessageResult | CustomerRequestProjection | InspectResult
  | ConfirmationResult | CustomerRequestAgentResult | CustomerRequestProblemResult
  | CustomerRequestProblemStatusChange | CustomerRequestEvidenceResult

export type BrowserApiOptions = Readonly<{
  env?: Record<string, string | undefined>
  now?: () => number
  randomUUID?: () => string
  callAction?: (name: string, args: Record<string, unknown>) => Promise<BrowserActionResult>
  tryAuthenticatedSubmit?: (request: Request) => Promise<Response>
  tryAuthenticatedMessage?: (request: Request, requestRef: string) => Promise<Response>
}>

type GuestSession = Readonly<{
  sessionId: string
  issuedAt: number
  token: string
}>

export async function handleBrowserCustomerRequestPost(
  request: Request,
  options: BrowserApiOptions = {},
): Promise<Response> {
  const existing = await readGuestSession(request, options)
  if (existing !== undefined) return handleGuestSubmit(request, existing, options)

  const authenticated = await (options.tryAuthenticatedSubmit ?? handleCustomerRequestPost)(request.clone())
  if (authenticated.status !== 401) return authenticated

  const session = await createGuestSession(options)
  if (session === undefined) return authenticated
  const response = await handleGuestSubmit(request, session, options)
  return response.ok ? withGuestCookie(response, session, request, options) : response
}

export async function handleBrowserCustomerRequestFactsPost(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  const session = await readGuestSession(request, options)
  if (session === undefined) return handleCustomerRequestFactsPost(request, requestRef)
  return handleCustomerRequestFactsPost(request, requestRef, {
    provideFacts: async (args) => await callAsGuest<FactsResult>(
      'customerRequestApplication:provideFacts', 'facts', args, session, options,
    ),
  })
}

export async function handleBrowserCustomerRequestMessagePost(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  const session = await readGuestSession(request, options)
  if (session === undefined) {
    return (options.tryAuthenticatedMessage ?? handleCustomerRequestMessagePost)(request, requestRef)
  }
  return handleCustomerRequestMessagePost(request, requestRef, {
    refine: async (args) => await callAsGuest<MessageResult>(
      'customerRequestApplication:refine', 'refine', args, session, options,
    ),
  })
}

export async function handleBrowserCustomerOptionsPost(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  const session = await readGuestSession(request, options)
  if (session === undefined) return handleCustomerOptionsPost(request, requestRef)
  return handleCustomerOptionsPost(request, requestRef, {
    compare: async (args) => await callAsGuest<CustomerRequestProjection>(
      'customerRequestApplication:compare', 'compare', args, session, options,
    ),
  })
}

export async function handleBrowserCustomerRequestGet(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  const session = await readGuestSession(request, options)
  if (session === undefined) return handleCustomerRequestGet(requestRef)
  return handleCustomerRequestGet(requestRef, {
    inspect: async (args) => await callAsGuest<InspectResult>(
      'customerRequestApplication:resume', 'resume', args, session, options,
    ),
  })
}

export async function callBrowserGuestAction<Result extends BrowserActionResult>(
  request: Request,
  name: string,
  operation: 'confirm' | 'run' | 'cancel' | 'report' | 'reply' | 'evidence',
  command: Record<string, unknown>,
  options: BrowserApiOptions = {},
): Promise<Result | undefined> {
  const session = await readGuestSession(request, options)
  return session === undefined ? undefined : await callAsGuest<Result>(name, operation, command, session, options)
}

export async function hasBrowserGuestSession(
  request: Request,
  options: BrowserApiOptions = {},
): Promise<boolean> {
  return await readGuestSession(request, options) !== undefined
}

async function handleGuestSubmit(request: Request, session: GuestSession, options: BrowserApiOptions): Promise<Response> {
  return handleCustomerRequestPost(request, {
    submit: async (args) => await callAsGuest<SubmitResult>('customerRequestApplication:submit', 'submit', {
      ...args,
      delegatedAgentId: browserGuestPrincipalId(session.sessionId),
    }, session, options),
  })
}

async function callAsGuest<Result extends BrowserActionResult>(
  name: string,
  operation: 'submit' | 'facts' | 'refine' | 'compare' | 'resume' | 'confirm' | 'run' | 'cancel' | 'report' | 'reply' | 'evidence',
  command: Record<string, unknown>,
  session: GuestSession,
  options: BrowserApiOptions,
): Promise<Result> {
  const key = readBrowserGuestSigningKey(browserGuestAssertionOptions(options))
  if (key === undefined) throw new Error('customer_request_browser_session_unavailable')
  const principalId = browserGuestPrincipalId(session.sessionId)
  const serviceAuth = await createCustomerRequestServiceAssertion({
    key,
    operation,
    command: toStableHashValue(command),
    principal: {
      principalId,
      ownerId: principalId,
      credentialId: `browser_session:${session.sessionId}`,
      scopes: [SESSION_SCOPE],
    },
    issuedAt: (options.now ?? Date.now)(),
  })
  const args = { ...command, serviceAuth }
  if (options.callAction !== undefined) return await options.callAction(name, args) as Result
  return await callPublicSourceAction(sourceAction<Record<string, unknown>, Result>(name), args)
}

async function createGuestSession(options: BrowserApiOptions): Promise<GuestSession | undefined> {
  const key = readBrowserGuestSigningKey(browserGuestAssertionOptions(options))
  if (key === undefined) return undefined
  const sessionId = options.randomUUID?.() ?? crypto.randomUUID()
  const issuedAt = (options.now ?? Date.now)()
  const token = await mintBrowserGuestAssertion(key, { sessionId, issuedAt })
  return { sessionId, issuedAt, token }
}

async function readGuestSession(request: Request, options: BrowserApiOptions): Promise<GuestSession | undefined> {
  const assertionOptions = browserGuestAssertionOptions(options)
  const key = readBrowserGuestSigningKey(assertionOptions)
  if (key === undefined) return undefined
  const token = readCookie(request.headers.get('cookie'), COOKIE_NAME)
  if (token === undefined) return undefined
  const verified = await verifyBrowserGuestAssertion(key, token, assertionOptions)
  if (verified === undefined) return undefined
  return { sessionId: verified.sessionId, issuedAt: verified.issuedAt, token }
}

function browserGuestAssertionOptions(options: BrowserApiOptions) {
  return {
    ...(options.env === undefined ? {} : { env: options.env }),
    ...(options.now === undefined ? {} : { now: options.now }),
  }
}

function withGuestCookie(response: Response, session: GuestSession, request: Request, options: BrowserApiOptions): Response {
  const headers = new Headers(response.headers)
  const nodeEnv = options.env?.NODE_ENV ?? process.env.NODE_ENV
  headers.append(
    'Set-Cookie',
    serializeCookie(COOKIE_NAME, session.token, {
      path: '/api/requests',
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: BROWSER_GUEST_LIFETIME_SECONDS,
      secure: isSecureRequest(request, nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
    }),
  )
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}


