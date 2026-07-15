import {
  callBrowserGuestAction,
  hasBrowserGuestSession,
  type BrowserApiOptions,
} from '@/lib/server/customer-request-browser-api'
import { handleCustomerRequestConfirmationPost, type ConfirmationResult } from '@/lib/server/customer-request-confirmation-api'
import { handleCustomerRequestEvidenceGet, handleCustomerRequestProblemPost } from '@/lib/server/customer-request-recovery-api'
import { handleCustomerRequestCancelPost, handleCustomerRequestRunPost } from '@/lib/server/customer-request-route-action-api'
import type {
  CustomerRequestAgentResult,
  CustomerRequestEvidenceResult,
  CustomerRequestProblemResult,
} from '@/modules/customer-request/agent-contract'

export async function handleBrowserCustomerRequestConfirmationPost(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  if (!await hasBrowserGuestSession(request, options)) {
    return handleCustomerRequestConfirmationPost(request, requestRef)
  }
  return handleCustomerRequestConfirmationPost(request, requestRef, {
    confirm: async (args) => await callBrowserGuestAction<ConfirmationResult>(
      request, 'customerRequestApplication:confirmRoute', 'confirm', args, options,
    ) ?? await authenticatedOnly(),
  })
}

export async function handleBrowserCustomerRequestRunPost(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  if (!await hasBrowserGuestSession(request, options)) return handleCustomerRequestRunPost(request, requestRef)
  return handleCustomerRequestRunPost(request, requestRef, {
    run: async (args) => await callBrowserGuestAction<CustomerRequestAgentResult>(
      request, 'customerRequestApplication:runRoute', 'run', args, options,
    ) ?? await authenticatedOnly(),
  })
}

export async function handleBrowserCustomerRequestCancelPost(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  if (!await hasBrowserGuestSession(request, options)) return handleCustomerRequestCancelPost(request, requestRef)
  return handleCustomerRequestCancelPost(request, requestRef, {
    cancel: async (args) => await callBrowserGuestAction<CustomerRequestAgentResult>(
      request, 'customerRequestApplication:cancelRoute', 'cancel', args, options,
    ) ?? await authenticatedOnly(),
  })
}

export async function handleBrowserCustomerRequestProblemPost(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  if (!await hasBrowserGuestSession(request, options)) return handleCustomerRequestProblemPost(request, requestRef)
  return handleCustomerRequestProblemPost(request, requestRef, {
    report: async (args) => await callBrowserGuestAction<CustomerRequestProblemResult>(
      request, 'customerRequestApplication:reportRouteProblem', 'report', args, options,
    ) ?? await authenticatedOnly(),
  })
}

export async function handleBrowserCustomerRequestEvidenceGet(
  request: Request,
  requestRef: string,
  options: BrowserApiOptions = {},
): Promise<Response> {
  if (!await hasBrowserGuestSession(request, options)) return handleCustomerRequestEvidenceGet(request, requestRef)
  return handleCustomerRequestEvidenceGet(request, requestRef, {
    inspect: async (args) => await callBrowserGuestAction<CustomerRequestEvidenceResult>(
      request, 'customerRequestApplication:exportRouteEvidence', 'evidence', args, options,
    ) ?? await authenticatedOnly(),
  })
}

async function authenticatedOnly(): Promise<never> {
  throw new Error('customer_request_browser_guest_session_missing')
}
