import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  isQuarantineWrite,
  QUARANTINE_FAMILY_ACTION_PREFIXES,
  quarantineWriteProblemInput,
} from '@/modules/product-frontier/quarantine-write-admission'
import { findAction, listActions } from '@/modules/actions'
import { actionToToolContract } from '@/modules/actions/tool-contract'
import { QUARANTINE_WRITES_FROZEN_CODE } from '@/modules/product-frontier/quarantine-write-admission'

const productFrontierManifest = JSON.parse(
  readFileSync(
    '.planning/evidence/product-frontier-baseline/product-frontier-manifest.json',
    'utf8',
  ),
) as { quarantineFamilies: readonly { actionIds: readonly string[] }[] }

describe('quarantine write admission', () => {
  it('treats quarantineFamilies mutating action ids as frozen writes', () => {
    const families = productFrontierManifest.quarantineFamilies
    if (!Array.isArray(families)) throw new Error('quarantine_families_missing')
    for (const family of families) {
      if (typeof family !== 'object' || family === null) continue
      const actionIds = Reflect.get(family, 'actionIds')
      if (!Array.isArray(actionIds)) continue
      for (const actionId of actionIds) {
        if (typeof actionId !== 'string') continue
        expect(QUARANTINE_FAMILY_ACTION_PREFIXES.some((prefix) => actionId.startsWith(prefix))).toBe(true)
        const action = findAction(actionId)
        expect(action, actionId).toBeDefined()
        if (action === undefined) continue
        expect(isQuarantineWrite(actionId, action.readOnly)).toBe(!action.readOnly)
      }
    }
    expect(isQuarantineWrite('operation.invoke', false)).toBe(false)
    expect(isQuarantineWrite('registry.operations.search', true)).toBe(false)
  })

  it('projects RFC 9457 problem input without HTTP 410', () => {
    const problem = quarantineWriteProblemInput('customerRequest.run')
    expect(problem.status).toBe(403)
    expect(problem.status).not.toBe(410)
    expect(problem.code).toBe('quarantine_writes_frozen')
    expect(problem.kind).toBe('FAILED_PRECONDITION')
    expect(problem.retryable).toBe(false)
    expect(listActions().some((action) => action.id === 'customerRequest.run')).toBe(true)
  })

  it('freezes Study write execution through the tool contract without HTTP 410', async () => {
    const start = findAction('study.start')
    const inspect = findAction('study.inspect')
    if (start === undefined || inspect === undefined) throw new Error('study_actions_missing')
    const frozen = actionToToolContract(start)
    await expect(frozen.execute({ input: {}, context: { request: new Request('https://ae.test') } }))
      .rejects.toThrow(QUARANTINE_WRITES_FROZEN_CODE)
    expect(inspect.readOnly).toBe(true)
    expect(isQuarantineWrite(inspect.id, inspect.readOnly)).toBe(false)
  })
})
