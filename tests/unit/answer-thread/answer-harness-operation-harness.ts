import { vi } from 'vitest'

import type { AnswerSnapshot } from '@/modules/answer/public'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/harness'

export const emptyKeylessSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

const hoistedOperationSourceMocks = vi.hoisted(() => ({
  readCapabilityOperationSearch: vi.fn(),
  readCapabilityOperationDetail: vi.fn(),
  readCapabilityOperationCompare: vi.fn(),
  readCapabilityOperationInspectPlan: vi.fn(),
  readCatalogOfferingOperationMap: vi.fn(async () => []),
}))

export const operationSourceMocks = {
  readCapabilityOperationSearch: hoistedOperationSourceMocks.readCapabilityOperationSearch,
  readCapabilityOperationDetail: hoistedOperationSourceMocks.readCapabilityOperationDetail,
  readCapabilityOperationCompare: hoistedOperationSourceMocks.readCapabilityOperationCompare,
  readCapabilityOperationInspectPlan: hoistedOperationSourceMocks.readCapabilityOperationInspectPlan,
  readCatalogOfferingOperationMap: hoistedOperationSourceMocks.readCatalogOfferingOperationMap,
}

vi.mock('@/modules/capability-supply/operation-source', () => hoistedOperationSourceMocks)

export function resetAnswerHarnessOperationAfterEach(resets: (() => void)[]): void {
  while (resets.length > 0) {
    resets.pop()?.()
  }
  operationSourceMocks.readCapabilityOperationSearch.mockReset()
  operationSourceMocks.readCapabilityOperationDetail.mockReset()
  operationSourceMocks.readCapabilityOperationCompare.mockReset()
  operationSourceMocks.readCapabilityOperationInspectPlan.mockReset()
  operationSourceMocks.readCatalogOfferingOperationMap.mockReset()
}

export function createClock(start = 1_000): {
  now: () => number
  tick: (durationMs: number) => void
} {
  let current = start
  return {
    now: () => current,
    tick: (durationMs: number) => {
      current += durationMs
    },
  }
}

export function answerSnapshot(): AnswerSnapshot {
  return {
    query: 'plumber Preston',
    oneLine: 'One listed business matches.',
    providers: [
      {
        citationIndex: 1,
        slug: 'preston-plumbing',
        name: 'Preston Plumbing',
        category: 'Plumber',
        suburb: 'Preston',
        stateTerritory: 'VIC',
        serviceArea: 'Preston',
        hoursLabel: 'Hours supplied',
        availabilityLabel: 'Published',
        trustLabel: 'Checked',
        responseTimeLabel: '',
        trustCue: 'Checked',
        nextStepLabel: 'Send inquiry',
        detailUrl: '/preston-plumbing',
        services: [],
      },
    ],
    summary: 'Preston Plumbing publishes service coverage.',
    nextStep: 'Open the provider page and send an inquiry when that option is published.',
    agentJsonUrl: '/api/businesses/search?q=plumber',
  }
}

export function toolCall(
  toolCallId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  status: AnswerToolCallRecord['status'],
  resultHash: string,
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId: 'turn-live',
    seq,
    toolId,
    inputJson: '{}',
    resultSummaryJson: '{"slugs":["preston-plumbing"],"count":1}',
    resultJson: '{"kind":"ok","items":[{"slug":"preston-plumbing"}]}',
    resultHash,
    status,
    createdAt: 1_000,
  }
}
