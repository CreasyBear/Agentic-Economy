import { sameCapabilityContractRef } from '@/modules/capability-contract/public'
import type { CustomerRequestAmendment } from '@/modules/customer-request/semantic-interpreter'
import { stableUnique } from '@/modules/common/stable-unique'

import { createConfiguredRequestInterpreter, type InterpreterEnvironment } from './interpreter'
import { proposeThenCompile } from './interpret'
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
  const compiled = await proposeThenCompile({
    intent: customerJob,
    ...(input.amendment === undefined ? {} : { amendment: input.amendment }),
    priorFacts: [],
    graph,
    capabilities: await discoverAndFilterDescriptors(customerJob, graph, ports.discoverCapabilities),
    finalAttempt: true,
    compileBase: {
      commandKey: `preview:${network}`,
      commandDigest: `preview:${customerJob}`,
      requestId: `preview:${network}`,
      expectedRevision: 0,
      expectedRouteGeneration: 0,
      principalId: 'preview',
      delegatedAgentId: 'preview',
      networkId: network,
      now,
    },
  }, interpreter)
  if (compiled.kind === 'propose_failed') {
    return { kind: 'unavailable', reason: 'preview_unavailable', destination }
  }
  if (compiled.kind === 'refused') {
    return compiled.reason === 'unsafe_interpretation'
      ? { kind: 'needs_information', prompt: 'Tell us a little more about the outcome you want.', destination }
      : { kind: 'unavailable', reason: 'options_changed', destination }
  }

  const actions = compiled.preview.aggregate.plan.actions
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
    const offeringRefs = stableUnique([...routeOfferingRefs, ...matchingBindings.map((binding) => binding.offeringId)])
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

