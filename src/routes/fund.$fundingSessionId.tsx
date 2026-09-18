import { useCallback, useEffect, useReducer } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import {
  AeFundingReturnState,
  type FundingReturnViewState,
} from '@/components/ae/funding/AeFundingReturnState'
import { RouteError, RoutePending } from '@/components/ae/layout/AeRouteStates'

const publicFundingSchema = z.strictObject({
  success: z.literal(true),
  funding: z.strictObject({
    state: z.enum(['awaiting_payment', 'processing', 'ready', 'expired', 'failed']),
    agentName: z.string().min(1),
    creditAmount: z.strictObject({
      currency: z.literal('AUD'),
      units: z.string().regex(/^\d+$/u),
      exponent: z.literal(6),
    }),
  }),
})

type PublicFunding = z.infer<typeof publicFundingSchema>['funding']

type FundingReadResult =
  | Readonly<{ kind: 'found'; funding: PublicFunding }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'unavailable' }>

type FundingPageEvent =
  | Readonly<{ type: 'check_started' }>
  | Readonly<{ type: 'check_found'; funding: PublicFunding }>
  | Readonly<{ type: 'check_not_found' }>
  | Readonly<{ type: 'check_unavailable' }>

export const Route = createFileRoute('/fund/$fundingSessionId')({
  head: () => ({ meta: [
    { title: 'Funding status | Agentic Economy' },
    { name: 'robots', content: 'noindex, noarchive' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: FundingReturnPage,
})

function FundingReturnPage() {
  const { fundingSessionId } = Route.useParams()
  const [pageState, dispatch] = useReducer(fundingPageReducer, { kind: 'checking' })

  const checkFunding = useCallback(async (signal?: AbortSignal) => {
    dispatch({ type: 'check_started' })
    try {
      const result = await readPublicFunding(fundingSessionId, signal)
      if (signal?.aborted === true) return
      if (result.kind === 'found') dispatch({ type: 'check_found', funding: result.funding })
      else if (result.kind === 'not_found') dispatch({ type: 'check_not_found' })
      else dispatch({ type: 'check_unavailable' })
    } catch (cause) {
      void cause;
      if (signal?.aborted !== true) dispatch({ type: 'check_unavailable' })
    }
  }, [fundingSessionId])

  useEffect(() => {
    const controller = new AbortController()
    void checkFunding(controller.signal)
    return () => controller.abort()
  }, [checkFunding])

  return <AeFundingReturnState pageState={pageState} onCheck={checkFunding} />
}

function fundingPageReducer(state: FundingReturnViewState, event: FundingPageEvent): FundingReturnViewState {
  switch (event.type) {
    case 'check_started':
      return state.kind === 'found' ? { ...state, refresh: 'checking' } : { kind: 'checking' }
    case 'check_found':
      return { kind: 'found', funding: event.funding, refresh: 'idle' }
    case 'check_not_found':
      return { kind: 'not_found' }
    case 'check_unavailable':
      return state.kind === 'found' ? { ...state, refresh: 'failed' } : { kind: 'unavailable' }
    default: {
      const exhaustive: never = event
      return exhaustive
    }
  }
}

async function readPublicFunding(fundingSessionId: string, signal?: AbortSignal): Promise<FundingReadResult> {
  const response = await fetch(
    `/api/v1/account/funding-sessions/public/${encodeURIComponent(fundingSessionId)}`,
    { cache: 'no-store', ...(signal === undefined ? {} : { signal }) },
  )
  if (response.status === 404) return { kind: 'not_found' }
  if (!response.ok) return { kind: 'unavailable' }
  const parsed = publicFundingSchema.safeParse(await response.json())
  return parsed.success ? { kind: 'found', funding: parsed.data.funding } : { kind: 'unavailable' }
}
