import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  applyWorkTreeThroughSource,
  type WorkTreeApplyResult,
} from '@/modules/work-tree/work-tree.functions'
import { studyArtifactSchema, type StudyCharter } from './internal/contract'
import { studyJournalEventSchema, type StudyJournalEvent } from './internal/rfx-machine'
import { sourceWriteRequestFromAdmission } from '@/modules/security/source-write-admission'

const createStudyMutation = sourceMutation<Record<string, unknown>, unknown>('studies:create')
const readStudyQuery = sourceQuery<Record<string, unknown>, StudyReadbackResult>('studies:getById')

export type StudyReadback = Readonly<{
  study: Record<string, unknown>
  events: readonly Record<string, unknown>[]
  journal: readonly StudyJournalEvent[]
  truncated: boolean
  hasMoreEvents?: boolean
}>

export type StudyReadbackResult = StudyReadback | Readonly<{ kind: 'not_found' }>

function workTreeRefusalCode(result: WorkTreeApplyResult): string | undefined {
  if (result.kind !== 'refused' && result.kind !== 'unknown') return undefined
  return result.reason
}

function makeJournalEvent(input: Omit<StudyJournalEvent, 'digest'>): StudyJournalEvent {
  return studyJournalEventSchema.parse({ ...input, digest: canonicalDigest(input) })
}


export type StudyStartInput = Readonly<{
  studyId: string
  projectId: string
  treeId?: string
  studyNodeId: string
  targetDecisionNodeId: string
  studyBrief: string
  criteriaFromCharter: readonly string[]
  charter: StudyCharter
  operationKey: string
  correlationId: string
  expectedGeneration: number
  expectedRevision: number
  proposalDigest: string
  requestedAt?: number
  context: unknown
}>

export type StudyStartResult = Readonly<{
  kind: 'accepted' | 'replayed' | 'refused' | 'unknown'
  studyId: string
  projectId: string
  studyNodeId: string
  targetDecisionNodeId: string
  generation?: number
  revision?: number
  refusalCode?: string
  workTree?: WorkTreeApplyResult
  study?: unknown
}>


export async function inspectStudyThroughSource(input: Readonly<{
  studyId: string
  ownerSessionId?: string
}>): Promise<StudyReadbackResult> {
  return callSourceQuery(readStudyQuery, input)
}

export async function startStudyThroughSource(input: StudyStartInput): Promise<StudyStartResult> {
  if (input.targetDecisionNodeId.length === 0) {
    return { kind: 'refused', studyId: input.studyId, projectId: input.projectId, studyNodeId: input.studyNodeId, targetDecisionNodeId: input.targetDecisionNodeId, refusalCode: 'decision_target_required' }
  }
  const workTree = await applyWorkTreeThroughSource({
    projectId: input.projectId,
    operationKey: `${input.operationKey}:worktree-study`,
    correlationId: input.correlationId,
    verb: {
      kind: 'study',
      targetNodeId: input.studyNodeId,
      expectedGeneration: input.expectedGeneration,
      expectedRevision: input.expectedRevision,
      proposalDigest: input.proposalDigest,
      studyBrief: input.studyBrief,
      criteriaFromCharter: [...input.criteriaFromCharter],
    },
  })
  if (workTree.kind === 'refused' || workTree.kind === 'unknown') {
    return {
      kind: workTree.kind,
      studyId: input.studyId,
      projectId: input.projectId,
      studyNodeId: input.studyNodeId,
      targetDecisionNodeId: input.targetDecisionNodeId,
      refusalCode: workTreeRefusalCode(workTree) ?? 'work_tree_unavailable',
      workTree,
    }
  }
  const tree = workTree.receipt.tree
  if (input.treeId !== undefined && input.treeId !== tree.treeId) {
    return { kind: 'refused', studyId: input.studyId, projectId: input.projectId, studyNodeId: input.studyNodeId, targetDecisionNodeId: input.targetDecisionNodeId, refusalCode: 'tree_identity_mismatch', workTree }
  }
  const decision = tree.nodes.find((node) => node.nodeId === input.targetDecisionNodeId)
  if (decision?.kind !== 'decision') {
    return { kind: 'refused', studyId: input.studyId, projectId: input.projectId, studyNodeId: input.studyNodeId, targetDecisionNodeId: input.targetDecisionNodeId, refusalCode: 'decision_target_invalid', workTree }
  }
  const requestedAt = input.requestedAt ?? Date.now()
  const generation = tree.generation
  const revision = 1
  const treeRevision = tree.revision
  const treeId = tree.treeId
  const artifact = studyArtifactSchema.parse({
    format: 'ae.study:v1',
    studyId: input.studyId,
    projectId: input.projectId,
    treeId,
    nodeId: input.studyNodeId,
    status: 'scanning',
    learnings: [],
    citations: [],
    followUpQuestions: [],
    qualityScore: 0,
    observedAt: requestedAt,
    expiresAt: requestedAt,
    revision,
    evidenceClass: 'published_price',
    quotes: [],
    topsis: null,
    excludedQuotes: [],
    rfxState: 'tender',
  })
  const journalEvent = makeJournalEvent({
    type: 'scan_started',
    operationKey: `${input.studyId}:scan_started`,
    projectId: input.projectId,
    treeId,
    nodeId: input.studyNodeId,
    generation,
    revision,
    ...(treeRevision === undefined ? {} : { treeRevision }),
    timestamp: requestedAt,
    evidenceClass: 'published_price',
  })
  const command = {
    studyId: input.studyId,
    projectId: input.projectId,
    treeId,
    nodeId: input.studyNodeId,
    generation,
    ...(treeRevision === undefined ? {} : { treeRevision }),
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    artifactJson: JSON.stringify(artifact),
    journalEventJson: JSON.stringify(journalEvent),
    createdAt: requestedAt,
    updatedAt: requestedAt,
  }
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context: input.context,
    command,
    scope: 'study',
    operationKey: input.operationKey,
    correlationId: input.correlationId,
  })
  const created = await callSourceMutation(createStudyMutation, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  })
  return {
    kind: workTree.kind,
    studyId: input.studyId,
    projectId: input.projectId,
    studyNodeId: input.studyNodeId,
    targetDecisionNodeId: input.targetDecisionNodeId,
    generation,
    revision,
    workTree,
    study: created,
  }
}

