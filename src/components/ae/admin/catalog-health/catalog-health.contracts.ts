import type { AdminShellReadback } from '@/modules/security/public'

export type SourceAuthorityReviewSourceKind = 'openapi' | 'mcp' | 'agent_plugin' | 'x402'

export type SourceAuthorityReviewRequest = Readonly<{
  publicationRef: string
  expectedRevision: number
  expectedSourceDigest: string
  operationRef: string
  sourceKind: SourceAuthorityReviewSourceKind
  sourceUrl: string
}>

export type CatalogHealthSearch = Readonly<{
  publicationRef?: string
  expectedRevision?: number
  expectedSourceDigest?: string
  operationRef?: string
  sourceKind?: SourceAuthorityReviewSourceKind
  sourceUrl?: string
}>

export type AeAdminCatalogHealthPageProps = Readonly<{
  readback: AdminShellReadback
  review?: SourceAuthorityReviewRequest
}>

export type SourceAuthorityReviewPanelProps = Readonly<{
  review: SourceAuthorityReviewRequest
}>

export function sourceAuthorityReviewFromSearch(
  search: CatalogHealthSearch,
): SourceAuthorityReviewRequest | undefined {
  if (
    search.publicationRef === undefined
    || search.expectedRevision === undefined
    || search.expectedSourceDigest === undefined
    || search.operationRef === undefined
    || search.sourceKind === undefined
    || search.sourceUrl === undefined
  ) {
    return undefined
  }
  return {
    publicationRef: search.publicationRef,
    expectedRevision: search.expectedRevision,
    expectedSourceDigest: search.expectedSourceDigest,
    operationRef: search.operationRef,
    sourceKind: search.sourceKind,
    sourceUrl: search.sourceUrl,
  }
}
