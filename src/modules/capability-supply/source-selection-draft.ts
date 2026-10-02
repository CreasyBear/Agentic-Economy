import type { SupplyIntegrationDraftNormalization } from './integration-draft'

export type SupplySourceSelectionDraft = Readonly<{
  sourceKind: 'mcp' | 'agent_plugin'
  sourceDescriptorJson: string
  expectedSourceDigest: string
  sourceRevision: string
  sourceUrl: string
  remoteRef?: string
  environment: 'sandbox' | 'production'
}>

export type SupplySourceSelectionDraftNormalization =
  | Readonly<{ kind: 'valid'; draft: SupplySourceSelectionDraft }>
  | Extract<SupplyIntegrationDraftNormalization, { kind: 'refused' }>

export function normalizeSupplySourceSelectionDraft(_input: Readonly<{
  sourceDescriptorJson: string
  sourceUrl: string
}>): SupplySourceSelectionDraftNormalization {
  return { kind: 'refused', reason: 'draft_invalid' }
}
