import type { PublicToolDetailRouteResult } from '@/modules/market/tool-detail-route.functions'
import type { X402DirectoryResolutionReason } from '@/modules/market/x402-directory'

export type PublicToolDetailProps = Readonly<{ result: PublicToolDetailRouteResult | Readonly<{ kind: 'invalid_ref'; toolRef: string }> }>

export type MarketBackButtonProps = Readonly<{
  label: string
  className: string
  variant?: 'ghost'
}>

export type ToolUnavailableProps = Readonly<{
  result: Exclude<PublicToolDetailProps['result'], { kind: 'found' }>
}>

export type ToolUnavailableCopy = Readonly<{
  title: string
  cause: string
  nextStep: string
  action: Readonly<{
    label: string
    to: '/market' | '/status'
  }>
}>

function notReady(cause: string): ToolUnavailableCopy {
  return {
    title: 'Not available to call here yet',
    cause,
    nextStep: 'Compare another service, or come back after the Provider updates the listing.',
    action: { label: 'Browse Market', to: '/market' },
  }
}

export const TOOL_UNAVAILABLE_COPY = {
  query_invalid: {
    title: 'This link is not valid',
    cause: 'This link is not valid.',
    nextStep: 'Browse Market.',
    action: { label: 'Browse Market', to: '/market' },
  },
  resource_filters_mismatch: {
    title: 'This link is not valid',
    cause: 'This link is not valid.',
    nextStep: 'Browse Market.',
    action: { label: 'Browse Market', to: '/market' },
  },
  resource_not_found: {
    title: 'This Tool is no longer listed',
    cause: 'This Tool is no longer listed.',
    nextStep: 'Browse Market.',
    action: { label: 'Browse Market', to: '/market' },
  },
  source_unavailable: {
    title: 'Tool details are unavailable',
    cause: "The Tool index or the Provider's listing cannot be checked right now.",
    nextStep: 'Try again.',
    action: { label: 'Check status', to: '/status' },
  },
  admission_unavailable: {
    title: 'Tool readiness is unavailable',
    cause: "Agentic Economy cannot check the Provider's listing right now.",
    nextStep: 'Try again.',
    action: { label: 'Check status', to: '/status' },
  },
  tool_unavailable: {
    title: 'This Tool is no longer listed',
    cause: 'This Tool is no longer listed.',
    nextStep: 'Browse Market.',
    action: { label: 'Browse Market', to: '/market' },
  },
  bazaar_missing: notReady('The Provider has not published enough for an agent to call this service.'),
  bazaar_discovery_invalid: notReady("The Provider's listing cannot be read as a service an agent can call."),
  schema_missing: notReady('The Provider has not published the input an agent would send.'),
  transport_unsupported: notReady('The connection the Provider published is one an agent cannot use here.'),
  scheme_unsupported: notReady('The payment method the Provider published is one Agentic Economy cannot settle.'),
  chain_unsupported: notReady('The payment network the Provider published is one Agentic Economy cannot settle.'),
  asset_unsupported: notReady('The asset the Provider asks to be paid in is one Agentic Economy cannot settle.'),
  amount_invalid: notReady("The Provider's price cannot be read."),
  payment_terms_invalid: notReady("The Provider's payment terms cannot be read."),
  resource_invalid: notReady("The Provider's service address cannot be read."),
  source_invalid: notReady("The Provider's listing source cannot be read."),
} satisfies Record<X402DirectoryResolutionReason, ToolUnavailableCopy>

export type ToolUnavailablePresentation = Readonly<{
  tone: 'neutral' | 'warning'
  title: string
  description: string
  action: ToolUnavailableCopy['action']
}>
