import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import {
  ANSWER_READ_TOOL_IDS,
  filterAnswerModelToolContracts,
} from '@/modules/answer-thread/tooling'
import { buildHarnessToolContracts } from '@/modules/harness/public'

describe('answer tool registry', () => {
  it('filters the complete ordered answer read toolset', () => {
    const contracts = buildHarnessToolContracts(listActions())
    const canonical = contracts.find((contract) => contract.id === ANSWER_READ_TOOL_IDS[0])
    expect(canonical).toBeDefined()
    const synthetic = { ...canonical!, id: 'unlisted.answer.read' }
    const answerContracts = filterAnswerModelToolContracts([...contracts, synthetic])

    expect(answerContracts.map((contract) => contract.id)).toEqual(
      ANSWER_READ_TOOL_IDS.filter((id) => id !== 'operation.execute'),
    )
    expect(answerContracts.every((contract) => contract.policy.tier === 'read')).toBe(true)
    expect(answerContracts.every((contract) => contract.exposure.answerModel)).toBe(true)
    expect(answerContracts.every((contract) => contract.schemas.providerViolations.length === 0)).toBe(true)
  })
})
