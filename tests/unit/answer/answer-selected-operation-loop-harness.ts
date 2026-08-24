import { afterEach, vi } from 'vitest'
import { z } from 'zod'

import type * as AnswerThreadTooling from '@/modules/answer-thread/tooling'
import { openRouterToolName } from '@/modules/answer/internal/action-to-tool-spec'
import {
  answerOperationCandidateFromPublicDescriptor,
  answerOperationCandidateSetDigest,
  type EffectiveAnswerAgentRoute,
} from '@/modules/answer/public'
import { jsonValueSchema } from '@/modules/capability-contract/public'
import {
  type KeylessExecutableSourcePort,
  type KeylessExecutableToolDescriptor,
  type OperationExecutableDescriptor,
} from '@/modules/capability-execution'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { isPublicOperationRef, type PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { isRecord } from '@/modules/common/is-record'

export type OpenRouterToolWithParameters = {
  function: {
    name: string
    parameters: {
      properties: Record<string, unknown>
      required?: readonly string[]
    }
  }
}

export const operationRoute = {
  lane: 'operation',
  continuation: 'new',
  allowedReadToolFamily: 'operation',
  exactOperationDetailRequired: true,
  effectAllowed: true,
} as const satisfies EffectiveAnswerAgentRoute

function hasOpenRouterToolParameters(
  tool: unknown,
): tool is OpenRouterToolWithParameters {
  if (!isRecord(tool) || !isRecord(tool.function)) {
    return false
  }
  const parameters = tool.function.parameters
  return isRecord(parameters)
    && isRecord(parameters.properties)
    && (
      parameters.required === undefined
      || (
        Array.isArray(parameters.required)
        && parameters.required.every((field) => typeof field === 'string')
      )
    )
}

export function requireOpenRouterToolWithParameters(
  tool: unknown,
): OpenRouterToolWithParameters {
  if (!hasOpenRouterToolParameters(tool)) {
    throw new Error('test_openrouter_tool_parameters_missing')
  }
  return tool
}
export function completedToolCallIds(
  request: { messages: readonly { role: string; tool_call_id?: string }[] },
): Set<string> {
  return new Set(
    request.messages.flatMap((message) =>
      message.role === 'tool' && typeof message.tool_call_id === 'string'
        ? [message.tool_call_id]
        : [],
    ),
  )
}

const hoistedMocks = vi.hoisted(() => ({
  runAnswerToolCall: vi.fn(),
  executeKeylessOperation: vi.fn(),
}))

export const answerToolMocks = {
  runAnswerToolCall: hoistedMocks.runAnswerToolCall,
}

export const executionMocks = {
  executeKeylessOperation: hoistedMocks.executeKeylessOperation,
}

vi.mock('@/modules/answer-thread/tooling', async (importOriginal) => {
  const actual = await importOriginal<typeof AnswerThreadTooling>()
  return {
    ...actual,
    runAnswerToolCall: hoistedMocks.runAnswerToolCall,
  }
})

vi.mock('@/modules/capability-execution/operation-execute.server', () => ({
  executeKeylessOperation: hoistedMocks.executeKeylessOperation,
}))

export const selectedDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: 'operation:v1:' + 'a'.repeat(64),
  capabilityId: 'test.live-value',
  name: 'Test live value',
  summary: 'Retrieve a live test value.',
  searchTerms: ['live value'],
  inputSchema: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  },
}
export const selectedPublicOperationRef = selectedDescriptor.operationRef
if (!isPublicOperationRef(selectedPublicOperationRef)) {
  throw new Error('test_selected_operation_ref_invalid')
}
export const selectedPublicOperation = {
  operationRef: selectedPublicOperationRef,
  operationId: 'operation:test.live-value',
  callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  paymentLane: 'brokered',
  contract: {
    capabilityId: selectedDescriptor.capabilityId,
    version: 1,
    inputJsonSchema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    outputJsonSchema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    customerAnnotations: [
      {
        annotationId: 'value',
        document: 'input',
        pointer: '/value',
        label: 'Requested value',
        role: 'request',
      },
    ],
  },
  business: {
    businessId: 'business:test',
    slug: 'test-provider',
    name: 'Test Provider',
  },
  offering: {
    offeringRef: 'offering:test.live-value',
    revision: 1,
    label: selectedDescriptor.name,
    summary: selectedDescriptor.summary,
  },
  summary: selectedDescriptor.summary,
  commercial: {
    price: {
      kind: 'fixed',
      amount: { currency: 'USD', units: '0', exponent: 2 },
    },
    materialTerms: [],
    relationship: { kind: 'none', summary: 'No published commercial relationship.' },
  },
  dataUse: [],
  effects: [],
  evidence: [],
  cancellation: { kind: 'unsupported' },
  recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
  authentication: { kind: 'keyless' },
  transport: { method: 'GET', requestTimeoutMs: 5_000 },
  provenance: { publisher: 'ae_curated_external', sourceKind: 'openapi_http' },
  availability: { posture: 'routeable' },
  navigation: [{
    relation: 'execute',
    method: 'POST',
    actionId: 'operation.execute',
    authentication: 'none',
    surfaces: ['chat'],
  }],
} satisfies PublicOperationDescriptor
export const alternatePublicOperationRefText = 'operation:v1:' + 'b'.repeat(64)
if (!isPublicOperationRef(alternatePublicOperationRefText)) {
  throw new Error('test_alternate_operation_ref_invalid')
}
export const alternatePublicOperation = {
  ...selectedPublicOperation,
  operationRef: alternatePublicOperationRefText,
  operationId: 'operation:test.alternate',
  contract: {
    ...selectedPublicOperation.contract,
    capabilityId: 'test.alternate',
  },
  business: {
    businessId: 'business:alternate',
    slug: 'alternate-provider',
    name: 'Alternate Provider',
  },
  offering: {
    offeringRef: 'offering:test.alternate',
    revision: 1,
    label: 'Alternate operation',
    summary: 'An irrelevant operation sharing one search term.',
  },
  summary: 'An irrelevant operation sharing one search term.',
} satisfies PublicOperationDescriptor


export const selectedCandidate = answerOperationCandidateFromPublicDescriptor(
  selectedPublicOperation,
  1,
  { includeInputSchema: true },
)
if (selectedCandidate === undefined) {
  throw new Error('test_selected_operation_candidate_invalid')
}
export const selectedCandidateSetDigest =
  answerOperationCandidateSetDigest([selectedCandidate])

export const selectedResolution = {
  kind: 'resolved' as const,
  descriptors: [selectedDescriptor],
  candidates: [selectedDescriptor],
  operationCandidates: [selectedCandidate],
  selected: selectedDescriptor,
  selectedCandidate,
  candidateSetDigest: selectedCandidateSetDigest,
}
export function resolutionForDescriptor(
  descriptor: KeylessExecutableToolDescriptor,
  relation: 'execute' | 'invoke' = 'execute',
) {
  if (!isPublicOperationRef(descriptor.operationRef)) {
    throw new Error('test_operation_ref_invalid')
  }
  const inputJsonSchema =
    z.record(z.string(), jsonValueSchema).parse(descriptor.inputSchema)
  const publicOperation: PublicOperationDescriptor = {
    ...selectedPublicOperation,
    operationRef: descriptor.operationRef,
    operationId: `operation:${descriptor.capabilityId}`,
    contract: {
      ...selectedPublicOperation.contract,
      capabilityId: descriptor.capabilityId,
      inputJsonSchema,
    },
    offering: {
      ...selectedPublicOperation.offering,
      label: descriptor.name,
      summary: descriptor.summary,
    },
    summary: descriptor.summary,
    navigation: [{
      relation,
      method: 'POST',
      actionId: `operation.${relation}`,
      authentication: relation === 'invoke' ? 'required' : 'none',
      surfaces: ['chat'],
    }],
  }
  const candidate = answerOperationCandidateFromPublicDescriptor(
    publicOperation,
    1,
    { includeInputSchema: true },
  )
  if (candidate === undefined) {
    throw new Error('test_operation_candidate_invalid')
  }
  return {
    kind: 'resolved' as const,
    descriptors: [descriptor],
    candidates: [descriptor],
    operationCandidates: [candidate],
    selected: descriptor,
    selectedCandidate: candidate,
    candidateSetDigest: answerOperationCandidateSetDigest([candidate]),
  }
}

export const selectedInvokeResolution =
  resolutionForDescriptor(selectedDescriptor, 'invoke')

export const selectedSource: KeylessExecutableSourcePort = {
  list: async () => [selectedDescriptor],
  read: async () => null,
  readPublic: async () => selectedPublicOperation,
  search: async () => [selectedDescriptor.operationRef],
}
export const stagedExecutable: OperationExecutableDescriptor = {
  operationRef: selectedDescriptor.operationRef,
  capabilityId: selectedDescriptor.capabilityId,
  name: selectedDescriptor.name,
  endpointUrl: 'https://api.example.test/live-value',
  authority: { kind: 'keyless' },
  adapterId: 'http-json:v1',
  price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
  effects: [],
  method: 'GET',
  query: [{ inputPointer: '/value', parameter: 'value' }],
  requestTimeoutMs: 5_000,
  inputSchema: selectedDescriptor.inputSchema,
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
}
export const stagedSource: KeylessExecutableSourcePort = {
  list: async () => [selectedDescriptor],
  read: vi.fn(async (operationRef) => (
    operationRef === selectedDescriptor.operationRef ? stagedExecutable : null
  )),
  readPublic: async (operationRef) => (
    operationRef === selectedDescriptor.operationRef ? selectedPublicOperation : null
  ),
  search: async () => [selectedDescriptor.operationRef],
}



export function selectedToolName(): string {
  return openRouterToolName('operation.execute')
}

export const OPERATION_LANE_TOOL_NAMES = [
  openRouterToolName('registry.operations.search'),
  openRouterToolName('registry.operations.detail'),
  openRouterToolName('registry.operations.compare'),
  openRouterToolName('registry.operations.inspectPlan'),
  openRouterToolName('operation.execute'),
] as const

export const READ_ONLY_OPERATION_LANE_TOOL_NAMES = OPERATION_LANE_TOOL_NAMES.filter(
  (name) => name !== openRouterToolName('operation.execute'),
)

export function selectedExecuteInput(input: Record<string, unknown>) {
  return { operationRef: selectedDescriptor.operationRef, input }
}

export const stagedCompareResult = {
  kind: 'unavailable' as const,
  schemaVersion: 'registry-operations:v1' as const,
  reason: 'operation_unavailable' as const,
  navigation: [],
}

export const stagedInspectPlanResult = {
  kind: 'unavailable' as const,
  schemaVersion: 'registry-operations:v1' as const,
  reason: 'operation_unavailable' as const,
  navigation: [],
}
export const stagedSearchResult = {
  kind: 'ok' as const,
  schemaVersion: 'registry-operations:v1' as const,
  query: 'current test live value',
  items: [selectedPublicOperation],
  matchedCount: 1,
  ranking: [{
    operationRef: selectedPublicOperation.operationRef,
    rank: 1,
    score: 1,
  }],
  pagination: { limit: 3, hasMore: false },
  navigation: [],
}
export const stagedAmbiguousSearchResult = {
  ...stagedSearchResult,
  items: [selectedPublicOperation, alternatePublicOperation],
  matchedCount: 2,
  ranking: [
    stagedSearchResult.ranking[0],
    {
      operationRef: alternatePublicOperation.operationRef,
      rank: 2,
      score: 0.5,
    },
  ],
}
export const stagedDetailResult = {
  kind: 'found' as const,
  schemaVersion: 'registry-operations:v1' as const,
  operation: selectedPublicOperation,
}



export const cryptoDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: 'operation:v1:' + 'b'.repeat(64),
  capabilityId: 'coingecko.simple-price',
  name: 'CoinGecko simple price',
  summary: 'Fetch current cryptocurrency prices in requested currencies.',
  searchTerms: ['ethereum price', 'bitcoin price', 'crypto price', 'cryptocurrency'],
  inputExamples: [
    {
      label: 'ethereum price in USD',
      input: { ids: 'ethereum', vs_currencies: 'usd' },
    },
    {
      label: 'bitcoin price in USD',
      input: { ids: 'bitcoin', vs_currencies: 'usd' },
    },
  ],
  inputSchema: {
    type: 'object',
    properties: {
      ids: { type: 'string' },
      vs_currencies: { type: 'string' },
      include_24h_change: { type: 'boolean' },
    },
    required: ['ids', 'vs_currencies'],
    additionalProperties: false,
  },
}

export const cryptoResolution = resolutionForDescriptor(cryptoDescriptor)

export const cryptoSource: KeylessExecutableSourcePort = {
  list: async () => [cryptoDescriptor],
  read: async () => null,
  search: async () => [cryptoDescriptor.operationRef],
}

export function cryptoToolName(): string {
  return openRouterToolName('operation.execute')
}

export function cryptoExecuteInput(input: Record<string, unknown>) {
  return { operationRef: cryptoDescriptor.operationRef, input }
}
export const catDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: 'operation:v1:' + 'c'.repeat(64),
  capabilityId: 'mockster.cat-images',
  name: 'Random cat images',
  summary: 'Return a bounded set of random cat images.',
  searchTerms: ['random cat images', 'cat pictures', 'cats'],
  inputExamples: [
    {
      label: 'ten random cat images',
      input: { count: 10 },
    },
  ],
  inputSchema: {
    type: 'object',
    properties: {
      count: { type: 'integer', minimum: 1, maximum: 10 },
    },
    additionalProperties: false,
  },
}

export const catResolution = resolutionForDescriptor(catDescriptor)

export const catSource: KeylessExecutableSourcePort = {
  list: async () => [catDescriptor],
  read: async () => null,
  search: async () => [catDescriptor.operationRef],
}

export function catToolName(): string {
  return openRouterToolName('operation.execute')
}

export function catExecuteInput(input: Record<string, unknown>) {
  return { operationRef: catDescriptor.operationRef, input }
}

export const wikipediaDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: 'operation:v1:' + 'd'.repeat(64),
  capabilityId: 'wikipedia-rest.page-summary',
  name: 'Wikipedia page summary',
  summary: 'Return a plain-text summary for a Wikipedia page.',
  searchTerms: ['wikipedia', 'page summary', 'article summary', 'encyclopedia'],
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      redirect: { type: 'boolean' },
    },
    required: ['title'],
    additionalProperties: false,
  },
}

export const wikipediaResolution = resolutionForDescriptor(wikipediaDescriptor)

export const wikipediaSource: KeylessExecutableSourcePort = {
  list: async () => [wikipediaDescriptor],
  read: async () => null,
  search: async () => [wikipediaDescriptor.operationRef],
}

export function wikipediaToolName(): string {
  return openRouterToolName('operation.execute')
}

export function wikipediaExecuteInput(input: Record<string, unknown>) {
  return { operationRef: wikipediaDescriptor.operationRef, input }
}



afterEach(() => {
  executionMocks.executeKeylessOperation.mockReset()
  answerToolMocks.runAnswerToolCall.mockReset()
  delete process.env.OPENROUTER_API_KEY
  delete process.env.AE_OPENROUTER_API_BASE_URL
})
