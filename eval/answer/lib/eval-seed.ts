import type {
  KeylessExecutableSourcePort,
  OperationExecutableDescriptor,
  OperationExecuteDeps,
} from '../../../src/modules/capability-execution/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '../../../src/modules/capability-execution/operation-invoke-entry'
import {
  isPublicOperationRef,
  serializeOperationDescriptor,
  type PublicOperationDescriptor,
} from '../../../src/modules/capability-supply/public'
import {
  createPublicSourceTransport,
  setPublicSourceTransportForTests,
} from '../../../src/lib/server/convex-source'
import { streamAnswerTurn } from '../../../src/modules/answer-thread/server'
import type { AnswerRequestPreflightResult } from '@/modules/answer/public'

import { BROAD_ANSWER_EVAL_BUSINESS_FIXTURES } from './registry-seed'
import { buildDevSeedCatalogState } from '../../../src/modules/dev/public'
import { isRecord } from '../../../src/modules/common/is-record'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  searchPublicBusinessOfferingSupply,
} from '../../../src/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '../../../src/modules/registry/registry.functions'
import {
  type AnswerThreadTestStore,
} from '../../../tests/helpers/answer-thread-test-port'
import { createLocalE2eRegistrySourcePort } from '../../../tests/helpers/registry-local-e2e'
import {
  SEED_ONLY_CAPABILITY_OPERATION_REF,
  SEED_ONLY_CAPABILITY_OUTPUT,
  KEYED_EVAL_OPERATION_REF,
  type AnswerTurnEvalCase,
} from './cases'

/** Explicit seed-only/test-only transport; never a live provider dependency. */
const seedOnlyOperationExecuteDeps = (
  output: unknown = SEED_ONLY_CAPABILITY_OUTPUT,
): Pick<OperationExecuteDeps, 'isPublicTarget' | 'fetchImpl'> => ({
  isPublicTarget: async () => true,
  fetchImpl: async (resource) => {
    const url = resource instanceof URL
      ? resource
      : resource instanceof Request
        ? new URL(resource.url)
        : new URL(String(resource))
    if (
      url.origin !== 'https://api.coingecko.com'
      || url.pathname !== '/api/v3/simple/price'
      || url.searchParams.get('ids') !== 'bitcoin'
      || url.searchParams.get('vs_currencies') !== 'usd'
    ) {
      throw new Error('answer_eval_seed_only_query_mismatch')
    }
    return Response.json(output)
  },
})
export const EMPTY_KEYLESS_EXECUTABLE_SOURCE: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

const SEED_ONLY_EVAL_EXECUTABLE: OperationExecutableDescriptor = {
  operationRef: SEED_ONLY_CAPABILITY_OPERATION_REF,
  capabilityId: 'eval.seed-only-price',
  name: 'Seed-only price lookup',
  endpointUrl: 'https://api.coingecko.com/api/v3/simple/price',
  authority: { kind: 'keyless' },
  adapterId: 'http-json:v1',
  method: 'GET',
  price: {
    kind: 'fixed',
    amount: { currency: 'USD', units: '0', exponent: 2 },
  },
  effects: [],
  query: [
    { inputPointer: '/ids', parameter: 'ids' },
    { inputPointer: '/vs_currencies', parameter: 'vs_currencies' },
  ],
  requestTimeoutMs: 5_000,
  inputSchema: {
    type: 'object',
    properties: {
      ids: { type: 'string' },
      vs_currencies: { type: 'string' },
    },
    required: ['ids', 'vs_currencies'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    additionalProperties: true,
  },
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
}

const SEED_ONLY_EVAL_EXECUTABLE_SOURCE: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async (operationRef) =>
    operationRef === SEED_ONLY_CAPABILITY_OPERATION_REF ? SEED_ONLY_EVAL_EXECUTABLE : null,
  search: async () => [SEED_ONLY_CAPABILITY_OPERATION_REF],
}

const KEYED_EVAL_EXECUTABLE: OperationExecutableDescriptor = {
  operationRef: KEYED_EVAL_OPERATION_REF,
  capabilityId: 'test.keyed-bitcoin',
  name: 'Keyed bitcoin lookup',
  endpointUrl: 'https://api.example.test/keyed-bitcoin',
  authority: {
    kind: 'provider_connection',
    connectionRef: 'connection:keyed-bitcoin',
    providerRef: 'provider:keyed-bitcoin',
  },
  adapterId: 'http-json:v1',
  method: 'GET',
  price: {
    kind: 'fixed',
    amount: { currency: 'USD', units: '0', exponent: 2 },
  },
  effects: [],
  requestTimeoutMs: 5_000,
  inputSchema: {
    type: 'object',
    properties: { ids: { type: 'string' } },
    required: ['ids'],
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    additionalProperties: true,
  },
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
}

const KEYED_EVAL_EXECUTABLE_SOURCE: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async (operationRef) =>
    operationRef === KEYED_EVAL_OPERATION_REF ? KEYED_EVAL_EXECUTABLE : null,
  search: async () => [KEYED_EVAL_OPERATION_REF],
}

const unusedExecuteFetchImpl: OperationExecuteDeps['fetchImpl'] = async () => {
  throw new Error('answer_eval_execute_fetch_not_expected')
}

export async function seedOnlyPublicOperation(): Promise<PublicOperationDescriptor> {
  if (!isPublicOperationRef(SEED_ONLY_CAPABILITY_OPERATION_REF)) {
    throw new Error('answer_eval_seed_operation_ref_invalid')
  }
  const executable = await SEED_ONLY_EVAL_EXECUTABLE_SOURCE.read(
    SEED_ONLY_CAPABILITY_OPERATION_REF,
  )
  if (executable === null || executable.outputSchema === undefined) {
    throw new Error('answer_eval_seed_operation_missing')
  }
  const now = Date.now()
  return {
    operationRef: SEED_ONLY_CAPABILITY_OPERATION_REF,
    operationId: `capability:${executable.capabilityId}`,
    callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
    paymentLane: 'brokered',
    contract: {
      capabilityId: executable.capabilityId,
      version: 1,
      inputJsonSchema:
        executable.inputSchema as PublicOperationDescriptor['contract']['inputJsonSchema'],
      outputJsonSchema:
        executable.outputSchema as PublicOperationDescriptor['contract']['outputJsonSchema'],
      customerAnnotations: [
        {
          annotationId: 'ids',
          document: 'input',
          pointer: '/ids',
          label: 'Coin IDs',
          role: 'request',
        },
        {
          annotationId: 'vs_currencies',
          document: 'input',
          pointer: '/vs_currencies',
          label: 'Quote currencies',
          role: 'request',
        },
      ],
    },
    business: {
      businessId: 'business:answer-eval-seed',
      slug: 'answer-eval-seed',
      name: 'Answer eval seed',
    },
    offering: {
      offeringRef: 'offering:answer-eval-seed',
      revision: 1,
      label: executable.name,
      summary: 'Seed-only deterministic capability fixture.',
    },
    summary: 'Seed-only deterministic capability fixture.',
    commercial: {
      price: executable.price,
      materialTerms: [],
      relationship: {
        kind: 'none',
        summary: 'Seed-only test fixture; no commercial relationship.',
      },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: {
      idempotency: 'required',
      recovery: 'reconcile_required',
    },
    authentication: { kind: 'keyless' },
    transport: {
      method: executable.method,
      requestTimeoutMs: executable.requestTimeoutMs,
    },
    provenance: {
      publisher: executable.provenance.publisher as PublicOperationDescriptor['provenance']['publisher'],
      sourceKind: executable.provenance.sourceKind as PublicOperationDescriptor['provenance']['sourceKind'],
    },
    availability: {
      posture: 'routeable',
      observedAt: now,
      validUntil: now + 60_000,
    },
    navigation: [{
      relation: 'execute',
      method: 'POST',
      actionId: 'operation.execute',
      authentication: 'none',
      surfaces: ['answerThread'],
      precondition: 'free_keyless_read_only',
    }],
  }
}

export function keyedPublicOperation(): PublicOperationDescriptor {
  if (!isPublicOperationRef(KEYED_EVAL_OPERATION_REF)) {
    throw new Error('answer_eval_keyed_operation_ref_invalid')
  }
  const now = Date.now()
  return {
    operationRef: KEYED_EVAL_OPERATION_REF,
    operationId: 'capability:test.keyed-bitcoin',
    callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
    paymentLane: 'brokered',
    contract: {
      capabilityId: KEYED_EVAL_EXECUTABLE.capabilityId,
      version: 1,
      inputJsonSchema:
        KEYED_EVAL_EXECUTABLE.inputSchema as PublicOperationDescriptor['contract']['inputJsonSchema'],
      outputJsonSchema:
        KEYED_EVAL_EXECUTABLE.outputSchema as PublicOperationDescriptor['contract']['outputJsonSchema'],
      customerAnnotations: [
        {
          annotationId: 'ids',
          document: 'input',
          pointer: '/ids',
          label: 'Coin IDs',
          role: 'request',
        },
      ],
    },
    business: {
      businessId: 'business:answer-eval-keyed',
      slug: 'answer-eval-keyed',
      name: 'Answer eval keyed',
    },
    offering: {
      offeringRef: 'offering:answer-eval-keyed',
      revision: 1,
      label: KEYED_EVAL_EXECUTABLE.name,
      summary: 'Keyed listing used to prove anonymous execute is refused.',
    },
    summary: 'Keyed listing used to prove anonymous execute is refused.',
    commercial: {
      price: KEYED_EVAL_EXECUTABLE.price,
      materialTerms: [],
      relationship: {
        kind: 'none',
        summary: 'Eval fixture; invoke requires a scoped key.',
      },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: {
      idempotency: 'required',
      recovery: 'reconcile_required',
    },
    authentication: {
      kind: 'platform_credential',
      scheme: 'api_key',
      in: 'header',
      name: 'X-Api-Key',
    },
    transport: {
      method: KEYED_EVAL_EXECUTABLE.method,
      requestTimeoutMs: KEYED_EVAL_EXECUTABLE.requestTimeoutMs,
    },
    provenance: {
      publisher: KEYED_EVAL_EXECUTABLE.provenance.publisher as PublicOperationDescriptor['provenance']['publisher'],
      sourceKind: KEYED_EVAL_EXECUTABLE.provenance.sourceKind as PublicOperationDescriptor['provenance']['sourceKind'],
    },
    availability: {
      posture: 'routeable',
      observedAt: now,
      validUntil: now + 60_000,
    },
    navigation: [{
      relation: 'invoke',
      method: 'POST',
      actionId: 'operation.invoke',
      authentication: 'required',
      surfaces: ['mcp'],
    }],
  }
}

export function installSeedOnlyOperationSource(
  operation: PublicOperationDescriptor,
): () => void {
  const wireOperation = serializeOperationDescriptor(operation)
  return setPublicSourceTransportForTests(
    createPublicSourceTransport({
      env: { CONVEX_URL: 'https://answer-eval.test' },
      fetch: async (_input, init) => {
        const payload: unknown = JSON.parse(String(init?.body ?? '{}'))
        if (!isRecord(payload) || typeof payload.path !== 'string') {
          throw new Error('answer_eval_operation_source_request_invalid')
        }
        const args = Array.isArray(payload.args) && isRecord(payload.args[0])
          ? payload.args[0]
          : {}
        if (payload.path === 'capabilitySupplyOperations:search') {
          const query = typeof args.query === 'string' ? args.query : ''
          const matches =
            query.trim().length > 0 &&
            (!Array.isArray(args.operationRefs) ||
              args.operationRefs.includes(operation.operationRef))
          return Response.json({
            status: 'success',
            value: {
              kind: 'ok',
              schemaVersion: 'registry-operations:v1',
              query,
              items: matches ? [wireOperation] : [],
              matchedCount: matches ? 1 : 0,
              ranking: matches
                ? [{
                    operationRef: operation.operationRef,
                    rank: 1,
                    score: 1,
                  }]
                : [],
              pagination: {
                limit: typeof args.limit === 'number' ? args.limit : 20,
                hasMore: false,
              },
              navigation: [],
            },
          })
        }
        if (payload.path === 'capabilitySupplyOperations:compare') {
          return Response.json({
            status: 'success',
            value: {
              kind: 'ok',
              schemaVersion: 'registry-operations:v1',
              operations: [wireOperation, wireOperation],
              facts: [],
              navigation: [],
            },
          })
        }
        if (payload.path === 'capabilitySupplyOperations:detail') {
          const found = args.operationRef === operation.operationRef
          return Response.json({
            status: 'success',
            value: found
              ? {
                  kind: 'found',
                  schemaVersion: 'registry-operations:v1',
                  operation: wireOperation,
                }
              : {
                  kind: 'unavailable',
                  schemaVersion: 'registry-operations:v1',
                  reason: 'operation_not_found',
                  navigation: [],
                },
          })
        }
        throw new Error(`answer_eval_operation_source_unconfigured:${payload.path}`)
      },
    }),
  )
}

function allowEvalQuerySafety(
  route: 'business' | 'operation',
): (input: Readonly<{ query: string }>) => Promise<AnswerRequestPreflightResult> {
  return (input) => {
    const now = Date.now()
    return Promise.resolve({
      kind: 'allowed',
      interpretation: {
        route,
        requestedIntents: [{
          intentId: 'answer-eval-request',
          phrase: input.query,
          requestedResult: input.query,
        }],
        continuation: 'new',
        effectPolicy: 'run_when_ready',
      },
      modelRequest: {
        seq: 0,
        provider: 'openrouter',
        model: 'test-model',
        status: 'ok',
        startedAt: now,
        endedAt: now,
        durationMs: 0,
        responseId: 'chatcmpl-safety-allow',
        stopReason: 'stop',
        usage: {
          inputTokens: 40,
          outputTokens: 2,
          totalTokens: 42,
        },
        costUnavailableReason: 'price_table_missing',
      },
    })
  }
}

export function installEvalRegistrySeed(seed: AnswerTurnEvalCase['registrySeed']): () => void {
  if (seed !== 'broad') {
    return setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())
  }

  const state = buildDevSeedCatalogState(BROAD_ANSWER_EVAL_BUSINESS_FIXTURES).state
  return setPublicRegistrySourcePortForTests({
    list: (input) => Promise.resolve(listPublicBusinessOfferingSupply(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessOfferingSupply(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessOfferingSupplyBySlug(state, input)),
  })
}

export function usesSeedOnlyCapabilitySource(agent: AnswerTurnEvalCase['openRouterAgent']): boolean {
  return agent?.toolCalls.some((call) =>
    call.toolId === 'operation.execute'
    && call.input.operationRef === SEED_ONLY_CAPABILITY_OPERATION_REF
  ) === true
}

export function usesKeyedExecuteSource(agent: AnswerTurnEvalCase['openRouterAgent']): boolean {
  return agent?.toolCalls.some((call) =>
    call.toolId === 'operation.execute'
    && call.input.operationRef === KEYED_EVAL_OPERATION_REF
  ) === true
}

export function streamWithSeedOnlyKeylessSource(
  agent: AnswerTurnEvalCase['openRouterAgent'],
  store: AnswerThreadTestStore,
  publicOperation?: PublicOperationDescriptor,
  capabilityOutput?: unknown,
): typeof streamAnswerTurn {
  const capability = usesSeedOnlyCapabilitySource(agent)
  const keyed = usesKeyedExecuteSource(agent)
  const keylessExecutableSource: KeylessExecutableSourcePort =
    capability && publicOperation !== undefined
      ? {
          ...SEED_ONLY_EVAL_EXECUTABLE_SOURCE,
          readPublic: async (operationRef) =>
            operationRef === publicOperation.operationRef
              ? publicOperation
              : null,
        }
      : keyed
        ? KEYED_EVAL_EXECUTABLE_SOURCE
        : EMPTY_KEYLESS_EXECUTABLE_SOURCE
  return (streamInput, send) => streamAnswerTurn({
    ...streamInput,
    keylessExecutableSource,
    querySafetyClassifier: allowEvalQuerySafety(
      capability || keyed ? 'operation' : 'business',
    ),
    // The eval finalizer captures harness evidence without mutating the test
    // port's pending row; the consumed SSE terminal frame is authoritative.
    preloadedPriorTurns: [...store.turns.values()].map((turn) => ({
      ...turn,
      status: 'complete',
    })),
    operationExecuteDeps: capability
      ? seedOnlyOperationExecuteDeps(capabilityOutput)
      : {
          isPublicTarget: async () => true,
          fetchImpl: unusedExecuteFetchImpl,
        },
  }, send)
}
