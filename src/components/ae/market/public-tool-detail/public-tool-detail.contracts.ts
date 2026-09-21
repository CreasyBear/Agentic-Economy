import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import type {
  ToolDetailPresentation,
  ToolDetailPresentationResult,
} from '@/modules/market/tool-detail-presentation'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
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

export type DirectoryEntrySummaryPageProps = Readonly<{
  entry: X402DirectoryEntry
  upstream: boolean
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
