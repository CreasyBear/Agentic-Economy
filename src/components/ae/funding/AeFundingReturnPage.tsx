import { useCallback, useEffect, useReducer } from 'react'
import { z } from 'zod'

import { AeFundingReturnState } from '@/components/ae/funding/AeFundingReturnState'
import type {
  FundingPageEvent,
  FundingReadResult,
  FundingReturnViewState,
  PublicFunding,
} from '@/modules/money/funding-return.view-model'

export type AeFundingReturnPageProps = Readonly<{
  fundingSessionId: string
}>

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

export function AeFundingReturnPage({ fundingSessionId }: AeFundingReturnPageProps) {
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
  if (!parsed.success) return { kind: 'unavailable' }
  const funding: PublicFunding = parsed.data.funding
  return { kind: 'found', funding }
}
