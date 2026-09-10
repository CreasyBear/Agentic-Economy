import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'

import {
  normalizeSupplySourceDescriptor,
  type SupplyIntegrationDraftNormalization,
} from './integration-draft'

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

export function normalizeSupplySourceSelectionDraft(input: Readonly<{
  sourceDescriptorJson: string
  sourceUrl: string
}>): SupplySourceSelectionDraftNormalization {
  let rawSource: unknown
  try {
    rawSource = JSON.parse(input.sourceDescriptorJson)
  } catch {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  const source = normalizeSupplySourceDescriptor(rawSource)
  if (source === undefined || (source.kind !== 'mcp' && source.kind !== 'agent_plugin')) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if ((source.kind === 'agent_plugin' || source.registryName !== undefined) && source.remoteRef === undefined) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  const normalizedJson = stableStringify(source as StableHashValue)
  if (normalizedJson !== input.sourceDescriptorJson) {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  let sourceUrl: string
  try {
    const parsed = new URL(input.sourceUrl)
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== ''
      || parsed.hash !== '' || parsed.search !== '') {
      return { kind: 'refused', reason: 'draft_invalid' }
    }
    sourceUrl = parsed.href
  } catch {
    return { kind: 'refused', reason: 'draft_invalid' }
  }
  if (source.kind === 'mcp' && source.serverUrl !== undefined && source.serverUrl !== sourceUrl) {
    return { kind: 'refused', reason: 'candidate_changed' }
  }
  const expectedSourceDigest = canonicalDigest({
    format: 'supply-source-selection:v1',
    source: source as StableHashValue,
    sourceUrl,
  })
  return {
    kind: 'valid',
    draft: {
      sourceKind: source.kind,
      sourceDescriptorJson: normalizedJson,
      expectedSourceDigest,
      sourceRevision: `source-selection:${expectedSourceDigest}`,
      sourceUrl,
      ...(source.remoteRef === undefined ? {} : { remoteRef: source.remoteRef }),
      environment: source.environment,
    },
  }
}
