import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const capabilityContractRefV2Value = v.object({
  capabilityId: v.string(), version: v.number(), contractDigest: v.string(),
})
const factSourceV2Value = v.union(
  v.object({ kind: v.literal('customer'), assertionRef: v.string() }),
  v.object({ kind: v.literal('agent_inference'), inferenceRef: v.string() }),
)
export const requestFactV2Value = v.object({
  contractRef: capabilityContractRefV2Value,
  selectionKey: v.string(), inputKey: v.string(), inputPointer: v.string(), schemaIdentity: v.string(),
  value: v.any(), source: factSourceV2Value, // runtime-validated JsonValue boundary
})
const missingTargetV2Value = v.object({
  contractRef: capabilityContractRefV2Value,
  selectionKey: v.string(), inputKey: v.string(), inputPointer: v.string(), schemaIdentity: v.string(),
})
const informationRequirementV2Value = v.union(
  v.object({
    kind: v.literal('contract_fact'), requirementKey: v.string(), customerLabel: v.string(),
    targets: v.array(missingTargetV2Value),
    impact: v.object({ affectedCandidates: v.array(v.string()), probesEnabled: v.array(v.string()) }),
    requirementDigest: v.string(),
  }),
  v.object({ kind: v.literal('intent_direction'), prompt: v.string(), requirementDigest: v.string() }),
)
const criterionV2Value = v.object({
  inputKey: v.string(), inputPointer: v.string(), label: v.string(),
  value: v.any(), // runtime-validated JsonValue boundary
  basis: v.union(v.literal('customer_provided'), v.literal('extracted_from_request')), criterionDigest: v.string(),
})
const disclosureV2Value = v.object({
  maximumRecipients: v.number(), purposes: v.array(v.string()),
  categories: v.array(v.object({
    inputKey: v.string(), label: v.string(),
    classification: v.union(v.literal('personal'), v.literal('sensitive'), v.literal('credential')),
  })),
})
export const requestEvaluationCandidateV2Value = v.object({
  candidateRef: v.string(), businessId: v.string(), offeringId: v.string(), bindingId: v.string(),
  contractRef: capabilityContractRefV2Value, selectionKey: v.string(), semanticDigest: v.string(),
  offeringRegistrationHash: v.string(), bindingRegistrationHash: v.string(),
  viability: v.union(
    v.object({ kind: v.literal('viable') }),
    v.object({ kind: v.literal('blocked_on_information'), inputs: v.array(v.object({
      ...missingTargetV2Value.fields, customerLabel: v.string(),
    })) }),
    v.object({ kind: v.literal('incompatible'), issueKeywords: v.array(v.string()) }),
  ),
})
const completionRequirementV2Value = v.object({
  actionId: v.string(), contractRef: capabilityContractRefV2Value,
  evidenceId: v.string(), outputPointer: v.string(), purpose: v.literal('completion'), schemaIdentity: v.string(),
})
const proposedActionV2Value = v.object({
  actionId: v.string(), contractRef: capabilityContractRefV2Value,
  selectionKey: v.string(), semanticDigest: v.string(), dependsOn: v.array(v.string()),
  inputs: v.array(requestFactV2Value),
})
export const customerRequestV2AggregateValue = v.object({
  aggregateVersion: v.literal(2),
  snapshot: v.object({
    requestId: v.string(), revision: v.number(), principalId: v.string(), delegatedAgentId: v.string(),
    intent: v.string(), networkId: v.string(), facts: v.array(requestFactV2Value),
    snapshotDigest: v.string(), recordedAt: v.number(),
  }),
  evaluation: v.object({
    requestId: v.string(), requestRevision: v.number(), registrySnapshotDigest: v.string(), factsDigest: v.string(),
    facts: v.array(requestFactV2Value), criteria: v.array(criterionV2Value),
    decisionPreference: v.optional(v.object({
      objective: v.literal('lowest_maximum_price'), basis: v.literal('extracted_from_request'), evidenceRef: v.string(),
    })),
    preparationDisclosure: v.optional(disclosureV2Value),
    candidates: v.array(requestEvaluationCandidateV2Value),
    completionRequirements: v.array(completionRequirementV2Value),
    nextRequirement: v.optional(informationRequirementV2Value),
    posture: v.union(v.literal('progress_available'), v.literal('needs_information'), v.literal('unsupported')),
    evaluationDigest: v.string(),
  }),
  plan: v.object({
    planRevisionId: v.string(), requestId: v.string(), requestRevision: v.number(), proposedByAgentId: v.string(),
    interpreterId: v.string(), proposalDigest: v.string(), registrySnapshotDigest: v.string(),
    actions: v.array(proposedActionV2Value), completionRequirements: v.array(completionRequirementV2Value),
    planDigest: v.string(), createdAt: v.number(),
  }),
  outcome: v.union(v.literal('plan_ready'), v.literal('needs_information'), v.literal('unsupported')),
  aggregateDigest: v.string(),
})

export const customerRequestV2Tables = {
  customerRequestV2Heads: defineTable({
    requestId: v.string(), principalId: v.string(), delegatedAgentId: v.string(), currentRevision: v.number(),
    currentAggregateDigest: v.string(), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_requestId', ['requestId']),

  customerRequestV2Revisions: defineTable({
    requestId: v.string(), requestRevision: v.number(), aggregate: customerRequestV2AggregateValue,
  }).index('by_requestId_and_requestRevision', ['requestId', 'requestRevision']),

  customerRequestV2Commands: defineTable({
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(), requestId: v.string(),
    expectedRevision: v.number(), resultingRevision: v.number(), aggregateDigest: v.string(), committedAt: v.number(),
  })
    .index('by_commandKey', ['commandKey'])
    .index('by_requestId_and_resultingRevision', ['requestId', 'resultingRevision']),
} as const
