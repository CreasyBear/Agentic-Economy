import { brandNonEmpty } from '@/modules/common/ids'
import { pointerSyntaxIsCanonical } from '@/modules/capability-contract/public'

import type { FlowRef, PlanJson, ToolRef } from './contracts'

type PlanSuggestionGraphNode = Readonly<{
  publicationRef: string
  admittedToolRef?: string
  routability: Readonly<{ eligible: boolean }>
}>
type PlanSuggestionGraphEdge = Readonly<{
  kind: 'published_by' | 'bound_to' | 'schema_compatible'
  from: string
  to: string
  inputMappings?: readonly Readonly<{ inputKey: string; outputPointer: string }>[]
}>
export type PlanSuggestionGraph =
  | Readonly<{ kind: 'available'; nodes: readonly PlanSuggestionGraphNode[]; edges: readonly PlanSuggestionGraphEdge[] }>
  | Readonly<{ kind: 'unavailable'; reason: 'query_invalid' | 'graph_limit_exceeded' | 'graph_integrity_failure' }>

type PlanSuggestionEvidence = Readonly<{
  kind: 'schema_compatible'
  sourcePublicationRef: string
  destinationPublicationRef: string
  inputMappings: readonly Readonly<{ inputKey: string; outputPointer: string }>[]
  validation: 'untyped_ref'
}>

export type PlanSuggestion = Readonly<{
  plan: PlanJson
  evidence: PlanSuggestionEvidence
}>

export type PlanSuggestionResult =
  | Readonly<{ kind: 'suggested'; suggestions: readonly PlanSuggestion[] }>
  | Readonly<{ kind: 'refused'; code: 'no_compatible_edges' | 'tool_not_admitted' }>
  | Extract<PlanSuggestionGraph, { kind: 'unavailable' }>

const toolRefPattern = /^operation:v1:[0-9a-f]{64}$/u

function admittedToolRef(node: PlanSuggestionGraphNode): ToolRef | undefined {
  if (!node.routability.eligible || node.admittedToolRef === undefined || !toolRefPattern.test(node.admittedToolRef)) {
    return undefined
  }
  return brandNonEmpty(node.admittedToolRef, 'ToolRef')
}

export function suggestPlans(graph: PlanSuggestionGraph): PlanSuggestionResult {
  if (graph.kind === 'unavailable') return graph

  const nodesByPublication = new Map(graph.nodes.map((node) => [node.publicationRef, node]))
  const compatibleEdges = graph.edges.filter((edge) => edge.kind === 'schema_compatible')
  if (compatibleEdges.length === 0) return { kind: 'refused', code: 'no_compatible_edges' }

  const suggestions: PlanSuggestion[] = []
  let edgeWithoutAdmittedTools = false
  for (const edge of compatibleEdges) {
    const source = nodesByPublication.get(edge.from)
    const destination = nodesByPublication.get(edge.to)
    if (source === undefined || destination === undefined) continue

    const sourceToolRef = admittedToolRef(source)
    const destinationToolRef = admittedToolRef(destination)
    if (sourceToolRef === undefined || destinationToolRef === undefined) {
      edgeWithoutAdmittedTools = true
      continue
    }

    const inputMappings = (edge.inputMappings ?? []).filter(({ inputKey, outputPointer }) => (
      inputKey.length > 0 && outputPointer.startsWith('/') && pointerSyntaxIsCanonical(outputPointer)
    ))
    if (inputMappings.length === 0) continue

    const sourceId = brandNonEmpty('source', 'PlanNodeId')
    const destinationId = brandNonEmpty('destination', 'PlanNodeId')
    const destinationInput = Object.fromEntries(inputMappings.map(({ inputKey, outputPointer }) => (
      [inputKey, brandNonEmpty(`flow://${sourceId}/output#${outputPointer}`, 'FlowRef')]
    )))

    suggestions.push({
      plan: {
        nodes: [
          { id: sourceId, toolRef: sourceToolRef, input: {}, dependsOn: [] },
          { id: destinationId, toolRef: destinationToolRef, input: destinationInput, dependsOn: [sourceId] },
        ],
      },
      evidence: {
        kind: 'schema_compatible',
        sourcePublicationRef: source.publicationRef,
        destinationPublicationRef: destination.publicationRef,
        inputMappings,
        validation: 'untyped_ref',
      },
    })
  }

  if (suggestions.length === 0) {
    return { kind: 'refused', code: edgeWithoutAdmittedTools ? 'tool_not_admitted' : 'no_compatible_edges' }
  }
  return { kind: 'suggested', suggestions }
}
