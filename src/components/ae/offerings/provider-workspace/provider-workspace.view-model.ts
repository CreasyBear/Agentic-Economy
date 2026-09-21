import type { ProviderWorkspacePayoutResult } from '@/components/ae/offerings/provider-workspace.functions'
import { getStatusPresentation } from '@/lib/ui/status-presentation'

import {
  PROVIDER_WORKSPACE_EARNINGS_COPY,
  type ProviderWorkspacePayoutConnectionPresentation,
  type ProviderWorkspacePayoutConnectionState,
} from './provider-workspace.contracts'

export function providerWorkspacePayoutConnection(input: Readonly<{
  result: ProviderWorkspacePayoutResult | undefined
  pending: boolean
}>): ProviderWorkspacePayoutConnectionPresentation {
  const state = payoutConnectionState(input)
  const status = getStatusPresentation(
    state === 'connected'
      ? 'available'
      : state === 'unavailable'
        ? 'unavailable'
        : 'billing_required_action',
  )

  return {
    state,
    label: status.label,
    sentence: state === 'connected'
      ? PROVIDER_WORKSPACE_EARNINGS_COPY.connectedSentence
      : state === 'unavailable'
        ? PROVIDER_WORKSPACE_EARNINGS_COPY.unavailableSentence
        : PROVIDER_WORKSPACE_EARNINGS_COPY.disconnectedSentence,
    tone: status.tone,
    ...(
      state === 'not_connected' || state === 'pending'
        ? { action: PROVIDER_WORKSPACE_EARNINGS_COPY.connectAction }
        : {}
    ),
  }
}

function payoutConnectionState(input: Readonly<{
  result: ProviderWorkspacePayoutResult | undefined
  pending: boolean
}>): ProviderWorkspacePayoutConnectionState {
  if (input.result === undefined) return input.pending ? 'pending' : 'unavailable'
  if (input.result.kind === 'not_applicable') return 'not_connected'
  if (input.result.kind !== 'available') return 'unavailable'
  if (input.result.value.readyAccounts > 0) return 'connected'
  return input.result.value.payoutAccounts > 0 ? 'pending' : 'not_connected'
}
