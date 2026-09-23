export type SourceAuthorityReviewSourceKind = 'openapi' | 'mcp' | 'agent_plugin' | 'x402'

export type SourceAuthorityReviewRequest = Readonly<{
  publicationRef: string
  expectedRevision: number
  expectedSourceDigest: string
  operationRef: string
  sourceKind: SourceAuthorityReviewSourceKind
  sourceUrl: string
}>


export type SourceAuthorityReviewPanelProps = Readonly<{
  review: SourceAuthorityReviewRequest
}>
