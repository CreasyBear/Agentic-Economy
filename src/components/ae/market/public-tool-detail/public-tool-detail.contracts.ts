import type { PublicToolDetailRouteResult } from '@/modules/market/tool-detail-route.functions'
import type { X402DirectoryResolutionReason } from '@/modules/market/x402-directory'
import { BRAND_NAME } from '@/content/brand-copy'
import type { ListingProjection } from '@/modules/registry/public'

import type { ToolPageSearch, ToolPageSearchChange } from './tool-page-search'

export type PublicToolDetailProps = Readonly<{ result: PublicToolDetailRouteResult | Readonly<{ kind: 'invalid_ref'; toolRef: string }>; baseUrl: string | undefined; search?: ToolPageSearch; onSearchChange?: ToolPageSearchChange }>

/** The provider's own USDC price, shown beside an A$ estimate so the estimate's basis stays visible. */
export function sourcePriceNote(listing: ListingProjection, shownPrice: string | undefined): string | undefined {
  const fact = listing.facts.price
  if (shownPrice?.startsWith('A$') !== true || fact.kind !== 'present' || fact.value.kind === 'quote_required' || fact.value.currency !== 'USDC') return undefined
  const amount = fact.value.kind === 'range' ? `${fact.value.minimum}–${fact.value.maximum}` : fact.value.amount
  return `Listed at ${amount} USDC per call. The A$ price is an estimate.`
}

/** "A$0.0015 per Call" becomes "A$0.0015"; "Quote required" and empty labels have no listed price. */
export function priceWithoutUnit(label: string | undefined): string | undefined {
  if (label === undefined) return undefined
  const price = label.replace(/ per Call$/u, '')
  return price === label || price.length === 0 ? undefined : price
}

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
    nextStep: 'Compare another tool, or come back after the provider updates the listing.',
    action: { label: 'Browse tools', to: '/market' },
  }
}

export const TOOL_UNAVAILABLE_COPY = {
  query_invalid: {
    title: 'This link is not valid',
    cause: 'The address may be cut short or out of date.',
    nextStep: '',
    action: { label: 'Browse tools', to: '/market' },
  },
  resource_filters_mismatch: {
    title: 'This link is not valid',
    cause: 'The address may be cut short or out of date.',
    nextStep: '',
    action: { label: 'Browse tools', to: '/market' },
  },
  resource_not_found: {
    title: 'This tool is no longer listed',
    cause: 'The provider removed it from the x402 directory.',
    nextStep: '',
    action: { label: 'Browse tools', to: '/market' },
  },
  source_unavailable: {
    title: 'Tool details are unavailable',
    cause: "The tool index or the provider's listing can't be checked right now.",
    nextStep: 'Try again.',
    action: { label: 'Check status', to: '/status' },
  },
  admission_unavailable: {
    title: 'Tool readiness is unavailable',
    cause: `${BRAND_NAME} can't check the provider's listing right now.`,
    nextStep: 'Try again.',
    action: { label: 'Check status', to: '/status' },
  },
  tool_unavailable: {
    title: 'This tool is no longer listed',
    cause: 'The provider removed it from the x402 directory.',
    nextStep: '',
    action: { label: 'Browse tools', to: '/market' },
  },
  bazaar_missing: notReady('The provider has not published enough for an agent to call this service.'),
  bazaar_discovery_invalid: notReady("The provider's listing cannot be read as a service an agent can call."),
  schema_missing: notReady('The provider has not published the input an agent would send.'),
  transport_unsupported: notReady('The connection the provider published is one an agent cannot use here.'),
  scheme_unsupported: notReady(`The payment method the provider published is one ${BRAND_NAME} can’t settle.`),
  chain_unsupported: notReady(`The payment network the provider published is one ${BRAND_NAME} can’t settle.`),
  asset_unsupported: notReady(`The asset the provider asks to be paid in is one ${BRAND_NAME} can’t settle.`),
  amount_invalid: notReady("The provider's price cannot be read."),
  payment_terms_invalid: notReady("The provider's payment terms cannot be read."),
  resource_invalid: notReady("The provider's service address cannot be read."),
  source_invalid: notReady("The provider's listing source cannot be read."),
} satisfies Record<X402DirectoryResolutionReason, ToolUnavailableCopy>

/** Cause and next step, without an empty part. */
export function unavailableDescription(copy: Pick<ToolUnavailableCopy, 'cause' | 'nextStep'>): string {
  return [copy.cause, copy.nextStep].filter(part => part.length > 0).join(' ')
}

export type ToolUnavailablePresentation = Readonly<{
  tone: 'neutral' | 'warning'
  title: string
  description: string
  action: ToolUnavailableCopy['action']
}>
