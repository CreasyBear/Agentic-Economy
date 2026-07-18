import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { CustomerRequestV2PreparationEgressActionPorts } from './ports'
import type {
  ReconcileEgressArgs,
  ReconcileEgressResult,
  ResumeEgressArgs,
  ResumeEgressResult,
  ResumeRequestEgressArgs,
  ResumeRequestEgressResult,
  RunEgressArgs,
  RunEgressResult,
  TerminalEgressState,
} from './types'

export async function runEgress(
  args: RunEgressArgs,
  ports: CustomerRequestV2PreparationEgressActionPorts,
): Promise<RunEgressResult> {
  const allocation = await ports.allocateEgress(args)
  if (allocation.kind === 'conflict') return { kind: 'conflict' }
  if (allocation.kind === 'needs_attention' || allocation.operationRefs === undefined) {
    return { kind: 'needs_attention' }
  }
  return await processOperations(ports, allocation.operationRefs, args.principalId)
}

export async function resumeEgress(
  args: ResumeEgressArgs,
  ports: CustomerRequestV2PreparationEgressActionPorts,
): Promise<ResumeEgressResult> {
  const status = await ports.queryStatus(args)
  return await processOperations(
    ports,
    status.states.map(({ operationRef }) => operationRef),
    args.principalId,
  )
}

export async function resumeRequestEgress(
  args: ResumeRequestEgressArgs,
  ports: CustomerRequestV2PreparationEgressActionPorts,
): Promise<ResumeRequestEgressResult> {
  const unresolved = await ports.queryUnresolvedForRequest(args)
  const processed = await processOperations(
    ports,
    unresolved.map(({ operationRef }) => operationRef),
    args.principalId,
  )
  if (processed.kind !== 'completed') return { kind: 'needs_attention', operations: [...unresolved] }
  const revisions = new Map(
    unresolved.map(({ operationRef, requestRevision }) => [operationRef, requestRevision]),
  )
  return {
    kind: 'completed',
    states: processed.states.map((state) => ({
      ...state,
      requestRevision: revisions.get(state.operationRef) ?? 0,
    })),
  }
}

export async function reconcileEgress(
  args: ReconcileEgressArgs,
  ports: CustomerRequestV2PreparationEgressActionPorts,
): Promise<ReconcileEgressResult> {
  const state = await reconcileOperation(ports, args.operationRef, args.principalId)
  return state === undefined ? { kind: 'unavailable' } : { kind: 'reconciled', state }
}

async function processOperations(
  ports: CustomerRequestV2PreparationEgressActionPorts,
  operationRefs: readonly string[],
  principalId: string,
): Promise<
  | {
    kind: 'completed'
    states: Array<{
      operationRef: string
      state: TerminalEgressState | 'in_flight'
    }>
  }
  | { kind: 'needs_attention' }
> {
  const states: Array<{
    operationRef: string
    state: TerminalEgressState | 'in_flight'
  }> = []
  for (const operationRef of operationRefs) {
    const begun = await ports.beginDispatch({
      operationRef,
      principalId,
      now: ports.now(),
    })
    if (begun.kind === 'needs_attention') return { kind: 'needs_attention' }
    if (begun.kind === 'in_flight') {
      states.push({ operationRef, state: 'in_flight' })
      continue
    }
    let state = begun.state
    if (begun.kind === 'dispatch') {
      if (begun.endpointUrl === undefined || begun.credentialRef === undefined
        || begun.adapterId === undefined || begun.configJson === undefined
        || begun.bodyText === undefined || begun.dispatchAttemptRef === undefined) {
        return { kind: 'needs_attention' }
      }
      const result = await ports.dispatchRegisteredAdapter({
        endpointUrl: begun.endpointUrl,
        credentialRef: begun.credentialRef,
        adapterId: begun.adapterId,
        configJson: begun.configJson,
        bodyText: begun.bodyText,
      }, operationRef)
      state = await ports.resolveDispatch({
        operationRef,
        dispatchAttemptRef: begun.dispatchAttemptRef,
        ...result,
        now: ports.now(),
      })
    }
    if (state === undefined) return { kind: 'needs_attention' }
    if (state === 'uncertain') {
      state = await reconcileOperation(ports, operationRef, principalId) ?? 'uncertain'
    }
    states.push({ operationRef, state })
  }
  return { kind: 'completed', states }
}

async function reconcileOperation(
  ports: CustomerRequestV2PreparationEgressActionPorts,
  operationRef: string,
  principalId: string,
): Promise<TerminalEgressState | undefined> {
  const opened = await ports.openReconciliation({ operationRef, principalId })
  if (opened.kind !== 'available' || opened.endpointUrl === undefined
    || opened.credentialRef === undefined || opened.adapterId === undefined
    || opened.configJson === undefined) {
    return undefined
  }
  const evidence = await ports.reconcileRegisteredAdapter({
    endpointUrl: opened.endpointUrl,
    credentialRef: opened.credentialRef,
    adapterId: opened.adapterId,
    configJson: opened.configJson,
    bodyText: '',
  }, operationRef)
  if (evidence === undefined) return undefined
  const evidenceMaterial = {
    operationRef,
    disposition: evidence.disposition,
    providerEvidenceRef: evidence.providerEvidenceRef,
    responseDigest: evidence.responseDigest,
  }
  return await ports.reconcileUncertain({
    ...evidenceMaterial,
    evidenceDigest: canonicalDigest(evidenceMaterial),
    observedAt: ports.now(),
  })
}
