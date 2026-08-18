import { afterEach, describe, expect, it, vi } from 'vitest'

import type * as PosthogServerModule from '@/lib/observability/posthog.server'
import {
  HarnessRunLoop,
  type HarnessRuntimeEvent,
} from '@/modules/harness/public'
import {
  runAnswerToolCall,
  toolCallRecordsToGateInput,
} from '@/modules/answer-thread/internal/tool-runner'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/tooling'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import { createLocalE2eRegistrySourcePort } from '../../helpers/registry-local-e2e'

const captureLegacyRegistryActionRequestMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/observability/posthog.server', async (importOriginal) => ({
  ...(await importOriginal<typeof PosthogServerModule>()),
  captureLegacyRegistryActionRequest: captureLegacyRegistryActionRequestMock,
}))

const TURN_ID = 'turn-1'
const BASE_SEQ = 0
const operationRef = `operation:v1:${'a'.repeat(64)}`
const operationDescriptor = {
  operationRef,
  operationId: 'test.current',
  callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  paymentLane: 'brokered' as const,
  contract: {
    capabilityId: 'test.current',
    version: 1,
    inputJsonSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    outputJsonSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
    customerAnnotations: [],
  },
  business: { businessId: 'business:test', slug: 'test', name: 'Test' },
  offering: { offeringRef: 'offering:test', revision: 1, label: 'Test', summary: 'Test operation' },
  summary: 'Return a current test value.',
  commercial: {
    price: { kind: 'on_request' },
    materialTerms: [],
    relationship: { kind: 'none', summary: 'No commercial relationship.' },
  },
  dataUse: [],
  effects: [],
  evidence: [],
  cancellation: { kind: 'unsupported' },
  recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
  authentication: { kind: 'keyless' },
  transport: { method: 'GET', requestTimeoutMs: 5_000 },
  provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
  availability: { posture: 'routeable', observedAt: 1_000, validUntil: 10_000 },
  navigation: [],
}
const operationDetailResult = {
  kind: 'found' as const,
  schemaVersion: 'registry-operations:v1' as const,
  operation: operationDescriptor,
}
const inspectPlanResult = {
  kind: 'ok' as const,
  schemaVersion: 'registry-operations:v1' as const,
  inspectPlanRef: 'inspect-plan:test',
  operationRefs: [operationRef],
  mappingRefs: [],
  summary: {
    maximumCost: { kind: 'requires_preparation' as const },
    dataUse: [],
    effects: [],
    expiry: 10_000,
  },
  navigation: [],
}

vi.mock('@/modules/capability-supply/operation-source', () => ({
  readCapabilityOperationSearch: vi.fn(),
  readCapabilityOperationDetail: vi.fn(async () => operationDetailResult),
  readCapabilityOperationCompare: vi.fn(),
  readCapabilityOperationInspectPlan: vi.fn(async () => inspectPlanResult),
  readCatalogOfferingOperationMap: vi.fn(async () => []),
}))

afterEach(() => {
  captureLegacyRegistryActionRequestMock.mockReset()
  delete process.env.OPENROUTER_API_KEY
})

describe('runAnswerToolCall', () => {
  it('runs registry.search and records a complete tool-call with slugs and a stable hash', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const restoreRegistry = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query: 'parramatta' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      expect(result.record.toolId).toBe('registry.search')
      expect(result.record.turnId).toBe(TURN_ID)
      expect(result.record.seq).toBe(BASE_SEQ)
      expect(result.record.resultHash).toMatch(/^sha256:[0-9a-f]{64}$/)

      const summary = JSON.parse(result.record.resultSummaryJson)
      expect(summary.slugs).toContain('parramatta-emergency-plumbing')
      expect(summary.count).toBeGreaterThan(0)

      expect(result.providers.map((provider) => provider.slug)).toContain(
        'parramatta-emergency-plumbing',
      )
      expect(result.allowedSlugs.has('parramatta-emergency-plumbing')).toBe(true)
    } finally {
      restoreRegistry()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })
  it('captures only legacy registry reads on the Answer surface', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    delete process.env.OPENROUTER_API_KEY
    const restoreRegistry = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())

    try {
      const search = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query: 'parramatta' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })
      const detail = await runAnswerToolCall({
        toolId: 'registry.detail',
        input: { slug: 'parramatta-emergency-plumbing' },
        turnId: TURN_ID,
        seq: BASE_SEQ + 1,
      })
      const nonlegacy = await runAnswerToolCall({
        toolId: 'registry.operations.detail',
        input: { operationRef },
        turnId: TURN_ID,
        seq: BASE_SEQ + 2,
      })
      const unknown = await runAnswerToolCall({
        toolId: 'registry.nothing',
        input: {},
        turnId: TURN_ID,
        seq: BASE_SEQ + 3,
      })

      expect(search.record.status).toBe('complete')
      expect(detail.record.status).toBe('complete')
      expect(nonlegacy.record.status, nonlegacy.record.resultSummaryJson).toBe('complete')
      expect(unknown.record.status).toBe('refused')
      expect(captureLegacyRegistryActionRequestMock).toHaveBeenCalledTimes(3)
      expect(captureLegacyRegistryActionRequestMock).toHaveBeenNthCalledWith(
        1,
        'registry.search',
        'answer',
      )
      expect(captureLegacyRegistryActionRequestMock).toHaveBeenNthCalledWith(
        2,
        'registry.detail',
        'answer',
      )
      expect(captureLegacyRegistryActionRequestMock).toHaveBeenNthCalledWith(
        3,
        'registry.operations.detail',
        'answer',
      )
    } finally {
      restoreRegistry()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })

  it.each([
    {
      query: 'emergency plumbing Joondalup',
      expectedSlug: 'joondalup-rapid-plumbing',
    },
    {
      query: 'electrical repairs Fremantle',
      expectedSlug: 'fremantle-coastal-electrical',
    },
  ])('recalls $expectedSlug from the shared local-e2e source for a detailed trade query', async ({
    query,
    expectedSlug,
  }) => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const restoreRegistry = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      expect(result.providers.map((provider) => provider.slug)).toEqual([expectedSlug])
    } finally {
      restoreRegistry()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })

  it('returns no provider for a plumbing query naming an uncovered suburb', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const restoreRegistry = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query: 'plumber Kalamunda WA' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      expect(result.providers).toEqual([])
    } finally {
      restoreRegistry()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })

  it('keeps the registry literal: a misspelled suburb yields an empty complete result', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const restoreRegistry = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())

    try {
      const result = await runAnswerToolCall({
        toolId: 'registry.search',
        input: { query: 'paramata' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })

      expect(result.record.status).toBe('complete')
      const summary = JSON.parse(result.record.resultSummaryJson)
      expect(summary.slugs).toEqual([])
      expect(summary.count).toBe(0)
      expect(result.providers).toEqual([])
      expect(result.allowedSlugs.size).toBe(0)
    } finally {
      restoreRegistry()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })

  it('records an error when the input does not match the action schema', async () => {
    const result = await runAnswerToolCall({
      toolId: 'registry.search',
      input: {},
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })

    expect(result.record.status).toBe('error')
    const summary = JSON.parse(result.record.resultSummaryJson)
    expect(summary.errorCode).toBe('invalid_input')
    expect(result.providers).toEqual([])
  })

  it('refuses an unknown tool id without running anything', async () => {
    const result = await runAnswerToolCall({
      toolId: 'registry.nothing',
      input: {},
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })

    expect(result.record.status).toBe('refused')
    const summary = JSON.parse(result.record.resultSummaryJson)
    expect(summary.errorCode).toBe('tool_not_known')
  })

  it('refuses a write action such as inquiry.submit — it is not part of the answer read toolset', async () => {
    const result = await runAnswerToolCall({
      toolId: 'inquiry.submit',
      input: { body: 'help' },
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })

    expect(result.record.status).toBe('refused')
    const summary = JSON.parse(result.record.resultSummaryJson)
    // inquiry.submit is not a known answer tool id; the answer agent's toolset
    // is read-only by construction, so write actions never reach the runner.
    expect(summary.errorCode).toBe('tool_not_known')
  })

  it('runs registry.detail and records a found business, or an empty complete result for not_found', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const restoreRegistry = setPublicRegistrySourcePortForTests(createLocalE2eRegistrySourcePort())

    try {
      const found = await runAnswerToolCall({
        toolId: 'registry.detail',
        input: { slug: 'parramatta-emergency-plumbing' },
        turnId: TURN_ID,
        seq: BASE_SEQ,
      })
      expect(found.record.status).toBe('complete')
      const foundSummary = JSON.parse(found.record.resultSummaryJson)
      expect(foundSummary.slugs).toEqual(['parramatta-emergency-plumbing'])
      expect(foundSummary.count).toBe(1)

      const missing = await runAnswerToolCall({
        toolId: 'registry.detail',
        input: { slug: 'no-such-business' },
        turnId: TURN_ID,
        seq: BASE_SEQ + 1,
      })
      expect(missing.record.status).toBe('complete')
      const missingSummary = JSON.parse(missing.record.resultSummaryJson)
      expect(missingSummary.slugs).toEqual([])
      expect(missingSummary.count).toBe(0)
    } finally {
      restoreRegistry()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })
  it('runs registry.operations.detail and records a found operation without business providers', async () => {
    const result = await runAnswerToolCall({
      toolId: 'registry.operations.detail',
      input: { operationRef },
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })

    expect(result.record, result.record.resultSummaryJson).toMatchObject({
      status: 'complete',
      toolId: 'registry.operations.detail',
      turnId: TURN_ID,
      seq: BASE_SEQ,
    })
    expect(result.record.resultHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(result.providers).toEqual([])
    expect(result.allowedSlugs).toEqual(new Set())
    expect(JSON.parse(result.record.resultSummaryJson)).toEqual({ slugs: [], count: 1 })
    expect(result.resultJson).toBe(result.record.resultJson)
    expect(JSON.parse(result.record.resultJson)).toEqual(operationDetailResult)
  })

  it('runs registry.operations.inspectPlan and records an ok plan without business providers', async () => {
    const result = await runAnswerToolCall({
      toolId: 'registry.operations.inspectPlan',
      input: { operationRefs: [operationRef] },
      turnId: TURN_ID,
      seq: BASE_SEQ + 1,
    })

    expect(result.record).toMatchObject({
      status: 'complete',
      toolId: 'registry.operations.inspectPlan',
      turnId: TURN_ID,
      seq: BASE_SEQ + 1,
    })
    expect(result.record.resultHash).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(result.providers).toEqual([])
    expect(result.allowedSlugs).toEqual(new Set())
    expect(JSON.parse(result.record.resultSummaryJson)).toEqual({ slugs: [], count: 1 })
    expect(result.resultJson).toBe(result.record.resultJson)
    expect(JSON.parse(result.record.resultJson)).toEqual(inspectPlanResult)
  })

})

describe('toolCallRecordsToGateInput', () => {
  it('maps each tool-call result summary into a batch of slug objects for the gate', () => {
    const records: AnswerToolCallRecord[] = [
      buildRecord('tc-1', 1, 'registry.search', {
        slugs: ['alpha-plumbing', 'beta-plumbing'],
        count: 2,
      }),
      buildRecord('tc-2', 2, 'registry.detail', {
        slugs: ['gamma-plumbing'],
        count: 1,
      }),
    ]

    const batches = toolCallRecordsToGateInput(records)
    expect(batches).toEqual([
      [{ slug: 'alpha-plumbing' }, { slug: 'beta-plumbing' }],
      [{ slug: 'gamma-plumbing' }],
    ])
  })

  it('tolerates a corrupted result summary by returning an empty batch', () => {
    const records: AnswerToolCallRecord[] = [
      buildRecord('tc-bad', 1, 'registry.search', { slugs: ['ok-plumbing'], count: 1 }),
      {
        ...buildRecord('tc-corrupt', 2, 'registry.search', { slugs: [], count: 0 }),
        resultSummaryJson: '{not valid json',
      },
    ]

    const batches = toolCallRecordsToGateInput(records)
    expect(batches[0]).toEqual([{ slug: 'ok-plumbing' }])
    expect(batches[1]).toEqual([])
  })
})

function buildRecord(
  toolCallId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  summary: { slugs: readonly string[]; count: number },
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId: TURN_ID,
    seq,
    toolId,
    inputJson: '{}',
    resultSummaryJson: JSON.stringify(summary),
    resultJson: JSON.stringify({ kind: 'ok', items: summary.slugs.map((slug) => ({ slug })) }),
    resultHash: canonicalDigest('test'),
    status: 'complete',
    createdAt: 1_000,
  }
}
