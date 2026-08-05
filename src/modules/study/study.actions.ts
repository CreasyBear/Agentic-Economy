import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import { registryServicesListAction } from '@/modules/registry/registry.actions'
import { scanStudyFromPublicServicesPage } from './internal/pipeline'
import { completeStudyThroughSource, inspectStudyThroughSource, startStudyThroughSource } from './study.functions'
import { studyCharterSchema } from './internal/contract'

const studyStartInputSchema = z.strictObject({
  studyId: z.string().min(1), projectId: z.string().min(1), treeId: z.string().min(1).optional(),
  studyNodeId: z.string().min(1), targetDecisionNodeId: z.string().min(1), studyBrief: z.string().min(1).max(1_000),
  criteriaFromCharter: z.array(z.string()).max(16), charter: studyCharterSchema, operationKey: z.string().min(1),
  correlationId: z.string().min(1), expectedGeneration: z.number().int().min(1), expectedRevision: z.number().int().min(1),
  proposalDigest: z.string().min(1), requestedAt: z.number().int().nonnegative().optional(),
})
const studyStartOutputSchema = z.strictObject({
  kind: z.enum(['accepted', 'replayed', 'refused', 'unknown']), studyId: z.string(), projectId: z.string(),
  studyNodeId: z.string(), targetDecisionNodeId: z.string(), generation: z.number().optional(), revision: z.number().optional(),
  refusalCode: z.string().optional(), workTree: z.unknown().optional(), study: z.unknown().optional(),
})
const studyInspectInputSchema = z.strictObject({ studyId: z.string().min(1), ownerSessionId: z.string().min(1).optional() })
const studyInspectOutputSchema = z.looseObject({ kind: z.enum(['accepted', 'not_found', 'unknown']) }).passthrough()
const studyCompleteInputSchema = z.strictObject({
  studyId: z.string().min(1), projectId: z.string().min(1), treeId: z.string().min(1).optional(), studyNodeId: z.string().min(1),
  targetDecisionNodeId: z.string().min(1), generation: z.number().int().min(1), treeRevision: z.number().int().min(1),
  expectedStudyRevision: z.number().int().min(1), operationKey: z.string().min(1), correlationId: z.string().min(1),
  charter: studyCharterSchema, requestedAt: z.number().int().nonnegative(),
})
const studyCompleteOutputSchema = z.looseObject({ kind: z.enum(['accepted', 'replayed', 'refused', 'unknown']) }).passthrough()

const startParameters: readonly ActionParameter[] = [
  { name: 'studyId', type: 'string', description: 'Stable Study identity for this WorkTree node.', required: true },
  { name: 'projectId', type: 'string', description: 'Owning WorkTree project identity.', required: true },
  { name: 'studyNodeId', type: 'string', description: 'WorkTree Study node to move into studying.', required: true },
  { name: 'targetDecisionNodeId', type: 'string', description: 'Existing decision node that may receive a proposal.', required: true },
  { name: 'studyBrief', type: 'string', description: 'Bounded Study brief.', required: true },
  { name: 'charter', type: 'object', description: 'Hard needs and weighted criteria.', required: true },
  { name: 'operationKey', type: 'string', description: 'Stable retry identity.', required: true },
  { name: 'correlationId', type: 'string', description: 'Attribution correlation identity.', required: true },
  { name: 'expectedGeneration', type: 'number', description: 'Exact WorkTree generation fence.', required: true },
  { name: 'expectedRevision', type: 'number', description: 'Exact WorkTree revision fence.', required: true },
  { name: 'proposalDigest', type: 'string', description: 'Canonical digest of the fenced Study verb.', required: true },
]

export const studyStartAction = defineAction({
  id: 'study.start', name: 'Start a WorkTree Study', summary: 'Move one exact Study node into studying and create its durable RFx journal.',
  boundaries: ['Requires an existing Study node and decision target in the same WorkTree.', 'Does not lock, contact, book, charge, or claim real availability.', 'Same-key retries replay; changed payloads and stale fences refuse.', 'Evidence remains explicitly labelled development/sandbox evidence.'],
  schema: studyStartInputSchema, outputSchema: studyStartOutputSchema, parameters: startParameters, readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'none', dataClasses: ['study_brief', 'criteria'], spendExposure: 'none', approval: 'approve_each' },
  surfaces: ['ui', 'http', 'agentJson'],
  invocationContract: { version: 'study.start:v1', consequenceClass: 'external_effect', materialInputPaths: ['studyId', 'projectId', 'studyNodeId', 'targetDecisionNodeId', 'studyBrief', 'charter', 'operationKey', 'expectedGeneration', 'expectedRevision', 'proposalDigest'], authorityRequirement: 'principal', retryClass: 'attributable_retry', expectedEvidence: ['Study readback with scan_started chronology'], safeContinuations: ['inspect Study journal and WorkTree revision'], invalidationConditions: ['WorkTree generation/revision changes', 'decision target changes', 'charter changes', 'principal changes'] },
  run: async ({ data, context }) => {
    const { treeId, requestedAt, ...rest } = data
    return startStudyThroughSource({
      ...rest,
      ...(treeId === undefined ? {} : { treeId }),
      ...(requestedAt === undefined ? {} : { requestedAt }),
      context,
    })
  },
})

export const studyInspectAction = defineAction({
  id: 'study.inspect', name: 'Inspect a WorkTree Study', summary: 'Read the bounded Study snapshot and replayable RFx chronology.',
  boundaries: ['Read-only; does not change Study or WorkTree.', 'Quotes and proposals are not provider fulfilment or a locked decision.'],
  schema: studyInspectInputSchema, outputSchema: studyInspectOutputSchema,
  parameters: [
    { name: 'studyId', type: 'string', description: 'Stable Study identity.', required: true },
    { name: 'ownerSessionId', type: 'string', description: 'Optional owner-session read fence.', required: false },
  ],
  readOnly: true, effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['study_journal'], spendExposure: 'none', approval: 'none' },
  surfaces: ['ui', 'http', 'agentJson', 'answerThread'],
  invocationContract: { version: 'study.inspect:v1', consequenceClass: 'read_only', materialInputPaths: ['studyId', 'ownerSessionId'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['Study snapshot and bounded RFx chronology'], safeContinuations: ['inspect linked WorkTree proposal receipt'], invalidationConditions: ['Study identity changes', 'principal changes'] },
  run: async ({ data }) => {
    const readback = await inspectStudyThroughSource({
      studyId: data.studyId,
      ...(data.ownerSessionId === undefined ? {} : { ownerSessionId: data.ownerSessionId }),
    })
    if ('kind' in readback && readback.kind === 'not_found') return readback
    return studyInspectOutputSchema.parse({ kind: 'accepted', ...readback })
  },
})

export const studyCompleteAction = defineAction({
  id: 'study.complete', name: 'Complete a WorkTree Study', summary: 'Score registered supply and submit only a fenced decision proposal to the WorkTree inbox.',
  boundaries: ['Uses registered public services; caller discovery is never promoted to a provider.', 'Expired, refused, unknown, or unlabelled mock quotes cannot be recommended.', 'Completion proposes only; it never auto-locks or creates decision authority.'],
  schema: studyCompleteInputSchema, outputSchema: studyCompleteOutputSchema, parameters: [
    { name: 'studyId', type: 'string', description: 'Stable Study identity.', required: true },
    { name: 'projectId', type: 'string', description: 'Owning WorkTree project identity.', required: true },
    { name: 'studyNodeId', type: 'string', description: 'Study node whose result is recorded.', required: true },
    { name: 'targetDecisionNodeId', type: 'string', description: 'Existing decision node receiving the proposal.', required: true },
    { name: 'generation', type: 'number', description: 'Exact WorkTree generation fence.', required: true },
    { name: 'treeRevision', type: 'number', description: 'Exact WorkTree revision fence.', required: true },
    { name: 'expectedStudyRevision', type: 'number', description: 'Exact Study revision fence.', required: true },
    { name: 'charter', type: 'object', description: 'Hard needs and weighted criteria.', required: true },
    { name: 'operationKey', type: 'string', description: 'Stable completion retry identity.', required: true },
    { name: 'correlationId', type: 'string', description: 'Attribution correlation identity.', required: true },
  ],
  readOnly: false, effect: { class: 'external_state_change', reversible: true, recipientKind: 'none', dataClasses: ['study_result', 'decision_proposal'], spendExposure: 'none', approval: 'approve_each' },
  surfaces: ['ui', 'http', 'agentJson'],
  invocationContract: { version: 'study.complete:v1', consequenceClass: 'external_effect', materialInputPaths: ['studyId', 'projectId', 'studyNodeId', 'targetDecisionNodeId', 'generation', 'treeRevision', 'expectedStudyRevision', 'charter', 'operationKey'], authorityRequirement: 'principal', retryClass: 'attributable_retry', expectedEvidence: ['scoring chronology and proposal receipt'], safeContinuations: ['inspect inbox; lock only through WorkTree decide'], invalidationConditions: ['WorkTree fence changes', 'Study revision changes', 'quote expiry', 'charter changes', 'principal changes'] },
  run: async ({ data, context }) => {
    const page = await registryServicesListAction.run({ data: { limit: 32 }, context })
    const { treeId, ...rest } = data
    const scan = scanStudyFromPublicServicesPage(page)
    return completeStudyThroughSource({
      ...rest,
      ...(treeId === undefined ? {} : { treeId }),
      registryServices: scan.providers,
      context,
    })
  },
})
