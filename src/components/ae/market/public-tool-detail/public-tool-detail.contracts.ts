import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import type {
  ToolDetailPresentation,
  ToolDetailPresentationResult,
} from '@/modules/market/tool-detail-presentation'
import type {
  X402DirectoryEntry,
  X402DirectoryResolutionReason,
} from '@/modules/market/x402-directory'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'

export type PublicToolDetailProps = ToolDetailPresentation

export type MarketBackButtonProps = Readonly<{
  label: string
  className: string
  variant?: 'ghost'
}>

export type CurrentToolDetailProps = Readonly<{
  tool: PublicToolDescriptor
  evidence?: MarketListingEvidenceProjection
}>

export type ToolUnavailableProps = Readonly<{
  result: Exclude<ToolDetailPresentationResult, { kind: 'found' }>
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
  bazaar_missing: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing is missing required discovery details.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  bazaar_discovery_invalid: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing has invalid discovery details.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  schema_missing: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing does not include the required schema.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  transport_unsupported: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing uses an unsupported transport.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  scheme_unsupported: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing uses an unsupported payment scheme.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  chain_unsupported: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing uses an unsupported payment network.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  asset_unsupported: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing uses an unsupported payment asset.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  amount_invalid: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing has an invalid amount.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  payment_terms_invalid: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing has invalid payment terms.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  resource_invalid: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing has an invalid Tool address.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
  source_invalid: {
    title: 'This Tool is not ready for calls',
    cause: "This Tool cannot be called through Agentic Economy yet: the Provider's listing source is invalid.",
    nextStep: 'The Provider must update the listing.',
    action: { label: 'Browse Market', to: '/market' },
  },
} satisfies Record<X402DirectoryResolutionReason, ToolUnavailableCopy>

export type ToolUnavailablePresentation = Readonly<{
  tone: 'neutral' | 'warning'
  title: string
  description: string
  action: ToolUnavailableCopy['action']
}>

export type DirectoryEntrySummaryPageProps = Readonly<{
  entry: X402DirectoryEntry
  upstream: boolean
  readiness?: ToolUnavailablePresentation
}>

export type DirectoryEntryUnavailableProps = Readonly<{
  metadata: Exclude<X402DirectoryCatalogueResource, { kind: 'found' } | { kind: 'found_upstream' }>
}>

export type DirectoryToolCanonicalLoaderData = Readonly<{
  metadata: X402DirectoryCatalogueResource
  admission?: Promise<ToolDetailPresentation> | undefined
}>

export type AeDirectoryToolCanonicalPageProps = Readonly<{
  data: DirectoryToolCanonicalLoaderData
}>
