import { v, type Infer } from 'convex/values'

import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

const sourceKindValue = v.union(
  v.literal('openapi'),
  v.literal('mcp'),
  v.literal('agent_plugin'),
  v.literal('x402'),
)
const integrationDraftValue = v.object({
  sourceKind: sourceKindValue,
  sourceDescriptorJson: v.string(),
  sourceDigest: v.string(),
  sourceRevision: v.string(),
  candidateRef: v.string(),
  sourceSelectorJson: v.string(),
  connectionRef: v.optional(v.string()),
  validationInputJson: v.optional(v.string()),
  updatedAt: v.number(),
})

export const saveAgentSupplyIntegrationDraftArgs = v.object({
  businessId: v.id('businesses'),
  title: v.string(),
  description: v.string(),
  category: v.string(),
  sourceKind: sourceKindValue,
  sourceDescriptorJson: v.string(),
  sourceDigest: v.string(),
  sourceRevision: v.string(),
  candidateRef: v.string(),
  sourceSelectorJson: v.string(),
  connectionRef: v.optional(v.string()),
  validationInputJson: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  agentPrincipal: agentAccessPrincipalValue,
  ...sourceWriteArgs,
})
export const saveOwnerSupplyIntegrationDraftArgs = v.object({
  businessId: v.id('businesses'),
  title: v.string(),
  description: v.string(),
  category: v.string(),
  sourceKind: sourceKindValue,
  sourceDescriptorJson: v.string(),
  sourceDigest: v.string(),
  sourceRevision: v.string(),
  candidateRef: v.string(),
  sourceSelectorJson: v.string(),
  connectionRef: v.optional(v.string()),
  validationInputJson: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
})
export const saveSupplyIntegrationDraftResult = v.union(
  v.object({
    kind: v.union(v.literal('saved'), v.literal('replayed')),
    offeringRef: v.string(),
    accessPathRef: v.string(),
    candidateRef: v.string(),
    sourceDigest: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('draft_invalid'),
      v.literal('source_contains_credential'),
      v.literal('candidate_changed'),
      v.literal('operation_key_conflict'),
      v.literal('draft_unavailable'),
    ),
  }),
)
export const readOwnerSupplyIntegrationDraftResult = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({
    kind: v.literal('available'),
    offeringRef: v.string(),
    accessPathRef: v.string(),
    draft: integrationDraftValue,
  }),
)

export type SaveAgentSupplyIntegrationDraftArgs = Infer<typeof saveAgentSupplyIntegrationDraftArgs>
export type SaveOwnerSupplyIntegrationDraftArgs = Infer<typeof saveOwnerSupplyIntegrationDraftArgs>
export type SaveSupplyIntegrationDraftResult = Infer<typeof saveSupplyIntegrationDraftResult>
