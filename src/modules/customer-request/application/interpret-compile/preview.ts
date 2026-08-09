import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import type { CustomerRequestAmendment } from '@/modules/customer-request/semantic-interpreter'
import { uniq } from 'es-toolkit/array'

import { createConfiguredRequestInterpreter, type InterpreterEnvironment } from './interpreter'
import { proposeThenCompile, type ProposeThenCompileResult } from './interpret'
import {
  discoverAndFilterDescriptors,
  type DiscoverCapabilities,
} from './discover'
import type { RequestGraph, RequestGraphUnavailable } from './types'

const MAX_PREVIEW_STEPS = 32
const MAX_PREVIEW_OPTIONS = 64
const PREVIEW_VALIDITY_MS = 5 * 60 * 1000

export type PreviewCustomerRequestInput = Readonly<{
  customerJob: string
  network: string
  amendment?: CustomerRequestAmendment
  now?: number
}>

export type PreviewCustomerRequestStep = Readonly<{
  step: number
  title: string
  purpose: string
  dependsOn: readonly number[]
  offeringRefs: readonly string[]
}>

export type PreviewCustomerRequest = Readonly<{
  kind: 'preview'
  destination: Readonly<{ label: string; request: string }>
  steps: readonly PreviewCustomerRequestStep[]
  expiresAt: number
  authority: 'inspect_only'
}>

export type PreviewCustomerRequestResult = Readonly<
  | PreviewCustomerRequest
  | Readonly<{
      kind: 'needs_information'
      prompt: string
      destination: Readonly<{ label: string; request: string }>
    }>
  | Readonly<{
      kind: 'unavailable'
      reason: 'no_current_supply' | 'preview_unavailable' | 'options_changed' | 'rate_limited'
      destination: Readonly<{ label: string; request: string }>
    }>
>

export type PreviewCustomerRequestPorts = Readonly<{
  loadRequestGraph: (network: string) => Promise<RequestGraph | RequestGraphUnavailable>
  /** Inject a deterministic discovery read (defaults to the registry operation search). */
  discoverCapabilities?: DiscoverCapabilities
}>

export async function previewCustomerRequest(
  input: PreviewCustomerRequestInput,
  ports: PreviewCustomerRequestPorts,
  interpreterEnvironment: InterpreterEnvironment = { maximumDescriptorBytes: 512_000 },
): Promise<PreviewCustomerRequestResult> {
  const customerJob = input.customerJob.trim().slice(0, 200)
  const network = input.network.trim().slice(0, 120)
  const destination = { label: customerJob, request: customerJob }
  if (customerJob.length === 0 || network.length === 0) {
    return { kind: 'needs_information', prompt: 'Tell us what outcome you want and where.', destination }
  }
  const now = input.now ?? Date.now()
  let graph: RequestGraph | RequestGraphUnavailable
  try {
    graph = await ports.loadRequestGraph(network)
  } catch {
    return { kind: 'unavailable', reason: 'preview_unavailable', destination }
  }
  if (graph.kind !== 'available') {
    return graph.reason === 'no_routeable_supply'
      ? { kind: 'unavailable', reason: 'no_current_supply', destination }
      : { kind: 'unavailable', reason: 'preview_unavailable', destination }
  }

  const interpreter = createConfiguredRequestInterpreter(interpreterEnvironment)
  const capabilities = await discoverAndFilterDescriptors(customerJob, graph, ports.discoverCapabilities)
  const compileBase = {
    commandKey: `preview:${network}`,
    commandDigest: `preview:${customerJob}`,
    requestId: `preview:${network}`,
    expectedRevision: 0,
    expectedRouteGeneration: 0,
    principalId: 'preview',
    delegatedAgentId: 'preview',
    networkId: network,
    now,
  }
  // Bounded attempt ladder mirroring interpretCompileCommit: a transient provider/transport error on
  // the non-final call is rethrown (finalAttempt: false) and retried once; only the exhausted
  // attempt degrades to the deterministic recovery pool (finalAttempt: true). A preview must survive
  // a single OpenRouter blip the same way a submitted request does.
  const proposalConfig = {
    intent: customerJob,
    ...(input.amendment === undefined ? {} : { amendment: input.amendment }),
    priorFacts: [],
    graph,
    capabilities,
    compileBase,
  } as const
  let compiled: ProposeThenCompileResult = await proposeThenCompile({
    ...proposalConfig,
    finalAttempt: false,
  }, interpreter)
  if (compiled.kind === 'propose_failed') {
    compiled = await proposeThenCompile({
      ...proposalConfig,
      finalAttempt: true,
    }, interpreter)
  }
  if (compiled.kind === 'propose_failed') {
    return { kind: 'unavailable', reason: 'preview_unavailable', destination }
  }
  if (compiled.kind === 'refused') {
    return compiled.reason === 'unsafe_interpretation'
      ? { kind: 'needs_information', prompt: 'Tell us a little more about the outcome you want.', destination }
      : { kind: 'unavailable', reason: 'options_changed', destination }
  }

  const actions = compiled.preview.aggregate.plan.actions
  // stopWhen pattern: a compiled request whose outcome is a typed needs_information (e.g. the
  // interpreter surfaced an intent-direction ask) is a bounded question, not an empty plan. It
  // must reach the customer as a real ask instead of collapsing to an opaque preview_unavailable.
  if (actions.length === 0 && compiled.preview.aggregate.outcome === 'needs_information') {
    const requirement = compiled.preview.aggregate.evaluation.nextRequirement
    const prompt = requirement !== undefined && requirement.kind === 'intent_direction' ? requirement.prompt : undefined
    return {
      kind: 'needs_information',
      prompt: prompt && prompt.length > 0 ? prompt : 'What exactly would you like us to find or produce?',
      destination,
    }
  }
  if (actions.length === 0 || actions.length > MAX_PREVIEW_STEPS) {
    return { kind: 'unavailable', reason: 'preview_unavailable', destination }
  }
  const actionNumbers = new Map(actions.map((action, index) => [action.actionId, index + 1]))
  const route = compiled.preview.routeGeneration?.routes[0]
  const routeByAction = new Map(route?.steps.map((step) => [step.actionId, step]) ?? [])
  const steps = actions.map((action, index): PreviewCustomerRequestStep => {
    const descriptor = graph.descriptors.find((item) => item.selectionKey === action.selectionKey)
    const routeStep = routeByAction.get(action.actionId)
    const matchingBindings = graph.bindings.filter((binding) => sameCapabilityContractRef(binding.contractRef, action.contractRef))
    const routeOfferingRefs = routeStep === undefined ? [] : [routeStep.offeringId]
    const offeringRefs = uniq([...routeOfferingRefs, ...matchingBindings.map((binding) => binding.offeringId)])
      .slice(0, MAX_PREVIEW_OPTIONS)
    return {
      step: index + 1,
      title: descriptor?.name ?? `Step ${index + 1}`,
      purpose: descriptor?.description ?? 'Review this part of the request.',
      dependsOn: action.dependsOn.flatMap((dependency) => {
        const number = actionNumbers.get(dependency)
        return number === undefined ? [] : [number]
      }),
      offeringRefs,
    }
  })
  const expiresAt = route?.expiresAt ?? now + PREVIEW_VALIDITY_MS
  return {
    kind: 'preview',
    destination,
    steps,
    expiresAt,
    authority: 'inspect_only',
  }
}

