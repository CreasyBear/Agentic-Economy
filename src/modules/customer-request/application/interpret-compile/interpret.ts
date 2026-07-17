import type {
  CompileCustomerRequestResult,
  CustomerReportedRouteExclusion,
} from '@/modules/customer-request/compiler'
import { projectNeedsAttention } from '@/modules/customer-request/customer-projection'
import type { CustomerRequestAmendment, CustomerRequestSemanticProposal } from '@/modules/customer-request/semantic-interpreter'

import type { CustomerRequestActionResult } from '../action-result'
import {
  compileCommit,
  compileProposal,
  durableSubmissionShellView,
  retryableCompileAdmissionFailure,
  type CompileCommitPorts,
} from './compile'
import { rebindStoredFacts, type StoredFactLike } from './facts'
import {
  createConfiguredRequestInterpreter,
  interpreterFailureCode,
  type InterpreterEnvironment,
} from './interpreter'
import type { CompileCommitInput, RequestGraph } from './types'

export type InterpretCompileCommitInput = Readonly<{
  commandKey: string
  commandDigest: string
  requestId: string
  expectedRevision: number
  expectedRouteGeneration: number
  principalId: string
  delegatedAgentId: string
  intent: string
  amendment?: CustomerRequestAmendment
  networkId: string
  priorFacts: readonly StoredFactLike[]
  routeExclusions?: readonly CustomerReportedRouteExclusion[]
  replaceCustomerRequestLiteral?: boolean
  durableShell?: boolean
  now: number
}>

export type InterpretCompileCommitPorts = CompileCommitPorts & Readonly<{
  replayCommittedCommand: (input: Readonly<{
    commandKey: string
    commandDigest: string
    requestId: string
    principalId: string
  }>) => Promise<CustomerRequestActionResult | undefined>
  loadRequestGraph: (networkId: string) => Promise<RequestGraph | Readonly<{ kind: 'unavailable' }>>
  logInterpretationFailure?: (code: string) => void
}>

export type ProposeThenCompileInterpreter = Readonly<{
  interpreterId: string
  propose: (input: Readonly<{
    customerJob: string
    amendment?: CustomerRequestAmendment
    capabilities: RequestGraph['descriptors']
  }>) => Promise<CustomerRequestSemanticProposal>
}>

export type ProposeThenCompileResult = Readonly<
  | {
      kind: 'compiled'
      compilationInput: CompileCommitInput
      preview: Extract<CompileCustomerRequestResult, { kind: 'compiled' }>
    }
  | { kind: 'refused'; reason: 'unsafe_interpretation' | 'capability_graph_invalid' }
  | { kind: 'propose_failed'; error: unknown }
>

/** Shared propose → compileProposal leaf used by interpretCompileCommit and route refresh. */
export async function proposeThenCompile(
  input: Readonly<{
    intent: string
    amendment?: CustomerRequestAmendment
    priorFacts: CompileCommitInput['priorFacts']
    graph: RequestGraph
    compileBase: Omit<
      CompileCommitInput,
      'proposal' | 'interpreterId' | 'graph' | 'intent' | 'priorFacts' | 'compiledResult'
    >
  }>,
  interpreter: ProposeThenCompileInterpreter,
): Promise<ProposeThenCompileResult> {
  let proposal: CustomerRequestSemanticProposal
  try {
    proposal = await interpreter.propose({
      customerJob: input.intent,
      ...(input.amendment === undefined ? {} : { amendment: input.amendment }),
      capabilities: input.graph.descriptors,
    })
  } catch (error) {
    return { kind: 'propose_failed', error }
  }
  const compilationInput: CompileCommitInput = {
    ...input.compileBase,
    intent: proposal.canonicalCustomerJob ?? input.intent,
    priorFacts: input.priorFacts,
    proposal,
    interpreterId: interpreter.interpreterId,
    graph: input.graph,
  }
  const preview = compileProposal(compilationInput)
  if (preview.kind === 'compiled') {
    return { kind: 'compiled', compilationInput, preview }
  }
  return { kind: 'refused', reason: preview.reason }
}

export async function interpretCompileCommit(
  input: InterpretCompileCommitInput,
  ports: InterpretCompileCommitPorts,
  interpreterEnv: InterpreterEnvironment,
): Promise<CustomerRequestActionResult> {
  const replay = await ports.replayCommittedCommand(input)
  if (replay !== undefined) return replay
  const interpreter = createConfiguredRequestInterpreter(interpreterEnv)
  if (interpreter === undefined) {
    return input.durableShell === true
      ? durableSubmissionShellView(input.requestId)
      : { kind: 'refused', reason: 'interpreter_unavailable' }
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const graph = await ports.loadRequestGraph(input.networkId)
    if (graph.kind !== 'available') {
      return input.durableShell === true
        ? durableSubmissionShellView(input.requestId)
        : { kind: 'refused', reason: 'capabilities_unavailable' }
    }
    const priorFacts = rebindStoredFacts(input.priorFacts, graph.models).filter((fact) => (
      input.replaceCustomerRequestLiteral !== true
      || fact.source.kind !== 'customer'
      || !fact.source.assertionRef.startsWith('assertion:customer-request-literal:')
    ))
    const step = await proposeThenCompile({
      intent: input.intent,
      ...(input.amendment === undefined ? {} : { amendment: input.amendment }),
      priorFacts,
      graph,
      compileBase: {
        commandKey: input.commandKey,
        commandDigest: input.commandDigest,
        requestId: input.requestId,
        expectedRevision: input.expectedRevision,
        expectedRouteGeneration: input.expectedRouteGeneration,
        principalId: input.principalId,
        delegatedAgentId: input.delegatedAgentId,
        networkId: input.networkId,
        now: input.now,
        ...(input.routeExclusions === undefined ? {} : { routeExclusions: input.routeExclusions }),
      },
    }, interpreter)
    if (step.kind === 'propose_failed') {
      ports.logInterpretationFailure?.(interpreterFailureCode(step.error))
      if (attempt === 0) continue
      return input.durableShell === true
        ? durableSubmissionShellView(input.requestId)
        : { kind: 'refused', reason: 'interpreter_unavailable' }
    }
    if (step.kind === 'compiled') {
      const committed = await compileCommit({
        ...step.compilationInput,
        compiledResult: step.preview,
      }, ports)
      if (attempt === 0 && retryableCompileAdmissionFailure(committed, input.expectedRevision)) continue
      return committed
    }
    if (step.reason === 'capability_graph_invalid') break
  }
  return projectNeedsAttention({
    requestRef: input.requestId, revision: input.expectedRevision,
    summary: 'The request could not be interpreted safely.',
  })
}
