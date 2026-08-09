import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext } from '@/lib/server/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { formatExactAmount } from '@/modules/money/public'
import {
  applyWorkTreeThroughSource,
  inspectWorkTreeThroughSource,
  type WorkTreeApplyResult,
  type WorkTreeInspectResult,
} from '@/modules/work-tree/work-tree.functions'
import {
  makeJournalEvent,
  runStudy,
  type StudyRunResult,
} from './internal/pipeline'
import {
  studyArtifactSchema,
  type StudyArtifact,
  type StudyCharter,
  type StudyRegistryService,
  type StudyWebClaim,
} from './internal/contract'
import type { StudyJournalEvent } from './internal/rfx-machine'

const createStudyMutation = sourceMutation<Record<string, unknown>, unknown>('studies:create')
const recordStudyResultMutation = sourceMutation<Record<string, unknown>, unknown>('studies:recordResult')
const readStudyQuery = sourceQuery<Record<string, unknown>, StudyReadbackResult>('studies:getById')

export type StudyReadback = Readonly<{
  study: Record<string, unknown>
  events: readonly Record<string, unknown>[]
  journal: readonly StudyJournalEvent[]
  truncated: boolean
  hasMoreEvents?: boolean
}>

export type StudyReadbackResult = StudyReadback | Readonly<{ kind: 'not_found' }>

type StudyWorkTreeResult = WorkTreeApplyResult | WorkTreeInspectResult

function workTreeRefusalCode(result: StudyWorkTreeResult): string | undefined {
  if (result.kind !== 'refused' && result.kind !== 'unknown') return undefined
  return 'reason' in result ? result.reason : result.code
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
  context?: unknown
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

export type StudyCompletionResult = Readonly<{
  kind: 'accepted' | 'replayed' | 'refused' | 'unknown'
  studyId: string
  projectId: string
  artifact?: StudyArtifact
  workTree?: StudyWorkTreeResult
  study?: unknown
  refusalCode?: string
  result?: StudyRunResult
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
  const sourceWrite = input.context === undefined
    ? undefined
    : await sourceWriteAdmissionFromContext({
        context: input.context,
        scope: 'study',
        operationKey: input.operationKey,
        correlationId: input.correlationId,
      })
  const created = await callSourceMutation(createStudyMutation, {
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
    ...(sourceWrite === undefined ? {} : { sourceWrite }),
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

export async function completeStudyThroughSource(input: Readonly<{
  studyId: string
  projectId: string
  studyNodeId: string
  targetDecisionNodeId: string
  generation: number
  treeRevision: number
  expectedStudyRevision: number
  operationKey: string
  correlationId: string
  charter: StudyCharter
  registryServices: readonly StudyRegistryService[]
  webClaims?: readonly StudyWebClaim[]
  requestedAt: number
  treeId?: string
  context?: unknown
}>): Promise<StudyCompletionResult> {
  const latest = await inspectWorkTreeThroughSource({ projectId: input.projectId })
  if (latest.kind === 'refused') {
    return {
      kind: latest.kind,
      studyId: input.studyId,
      projectId: input.projectId,
      workTree: latest,
      refusalCode: workTreeRefusalCode(latest) ?? 'work_tree_unavailable',
    }
  }
  const tree = latest.readback.tree
  if (tree.generation !== input.generation || tree.revision !== input.treeRevision) {
    return { kind: 'refused', studyId: input.studyId, projectId: input.projectId, workTree: latest, refusalCode: 'stale_fence' }
  }
  if (input.treeId !== undefined && input.treeId !== tree.treeId) {
    return { kind: 'refused', studyId: input.studyId, projectId: input.projectId, workTree: latest, refusalCode: 'tree_identity_mismatch' }
  }
  const decision = tree.nodes.find((node) => node.nodeId === input.targetDecisionNodeId)
  if (decision?.kind !== 'decision') {
    return { kind: 'refused', studyId: input.studyId, projectId: input.projectId, workTree: latest, refusalCode: 'decision_target_invalid' }
  }
  const result = runStudy({
    studyId: input.studyId,
    projectId: input.projectId,
    treeId: tree.treeId,
    nodeId: input.studyNodeId,
    charter: input.charter,
    registryServices: input.registryServices,
    ...(input.webClaims === undefined ? {} : { webClaims: input.webClaims }),
    requestedAt: input.requestedAt,
    revision: input.expectedStudyRevision + 1,
    generation: tree.generation,
    treeRevision: tree.revision,
  })
  if (result.kind !== 'completed') {
    return { kind: 'refused', studyId: input.studyId, projectId: input.projectId, result, refusalCode: result.code }
  }
  const sourceWrite = input.context === undefined
    ? undefined
    : await sourceWriteAdmissionFromContext({ context: input.context, scope: 'study', operationKey: input.operationKey, correlationId: input.correlationId })
  const recorded = await callSourceMutation(recordStudyResultMutation, {
    studyId: input.studyId,
    projectId: input.projectId,
    treeId: tree.treeId,
    nodeId: input.studyNodeId,
    generation: tree.generation,
    treeRevision: tree.revision,
    expectedRevision: input.expectedStudyRevision,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    artifactJson: JSON.stringify(result.artifact),
    journalEventsJson: JSON.stringify(result.events),
    at: input.requestedAt,
    ...(sourceWrite === undefined ? {} : { sourceWrite }),
  })
  const options = result.artifact.quotes.slice(0, 4).map((quote) => ({
    optionId: quote.providerSlug,
    label: quote.providerName,
    summary: `${quote.service}: ${quote.price.amount.currency} ${formatExactAmount(quote.price.amount) ?? '—'}`,
  }))
  const recommendation = result.artifact.recommendation?.alternativeId
  const unsignedVerb = {
    kind: 'propose_decision' as const,
    targetNodeId: input.targetDecisionNodeId,
    expectedGeneration: tree.generation,
    expectedRevision: tree.revision,
    options,
    ...(recommendation === undefined ? {} : { recommendation }),
  }
  const proposal = await applyWorkTreeThroughSource({
    projectId: input.projectId,
    operationKey: `${input.operationKey}:proposal`,
    correlationId: input.correlationId,
    verb: { ...unsignedVerb, proposalDigest: canonicalDigest(unsignedVerb) },
  })
  if (proposal.kind === 'refused' || proposal.kind === 'unknown') {
    return { kind: proposal.kind, studyId: input.studyId, projectId: input.projectId, artifact: result.artifact, study: recorded, result, workTree: proposal, refusalCode: workTreeRefusalCode(proposal) ?? 'proposal_refused' }
  }
  return { kind: proposal.kind, studyId: input.studyId, projectId: input.projectId, artifact: result.artifact, study: recorded, result, workTree: proposal }
}

